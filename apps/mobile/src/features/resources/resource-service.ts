/**
 * ResourceService — the seam between the Resources tab and the backend.
 *
 * Mirrors the Xcode `ResourceServiceProtocol` (Services/backend_protocols.swift):
 * fetchNearby / fetchByZip / search. The server owns the resource database and
 * computes distances, so the client never invents a distance, rating, or
 * listing — anything the API does not return is simply not rendered.
 *
 * Auth follows the same pattern as `graphql/client.ts`: the request carries
 * the viewer's bearer token from `getGraphQLAuthToken`, and the server
 * resolves the viewer from it.
 *
 * Endpoint (built in parallel by the backend): GET
 *   {API_BASE}/resources/nearby?lat=&lng=&radiusMi=&category=
 *   {API_BASE}/resources/nearby?zip=&category=
 *   {API_BASE}/resources/nearby?q=&category=
 * Response: [{ id, name, tag, address, phone?, website?, hours?,
 *              description?, services?, rating?, distanceMi,
 *              latitude, longitude }]
 *
 * A 503 means the endpoint is not configured yet (no Places API key on the
 * server). Screens render that as an honest "not available right now" state —
 * never as placeholder listings.
 */
import { getGraphQLAuthToken } from '@/auth/auth-client';
import { apiBaseUrl } from '@/constants/env';
import { ApiError, type ApiErrorKind } from '@/services/api-error';

/** Backend category values. "All" omits the param. */
export type ResourceCategory = 'food' | 'housing' | 'healthcare' | 'utility' | 'job';

export type NearbyResource = {
  id: string;
  name: string;
  tag: string;
  address: string;
  phone?: string;
  website?: string;
  hours?: string;
  /** Only present when the backend supplies copy — never invented client-side. */
  description?: string;
  /** Only present when the backend supplies the list — never invented client-side. */
  services?: string[];
  /** Only present when the backend supplies a rating — never invented client-side. */
  rating?: number;
  /** Miles from the lookup point. Null when the backend did not compute one. */
  distanceMi: number | null;
  /**
   * Null when the backend did not return coordinates — directions then fall
   * back to an address query instead of a lat,lng pin.
   */
  latitude: number | null;
  longitude: number | null;
};

export class ResourceServiceError extends ApiError {
  constructor(kind: ApiErrorKind, message: string, options: { status?: number | null; cause?: unknown } = {}) {
    super(kind, message, options);
    this.name = 'ResourceServiceError';
  }

  /** True when the endpoint itself is not configured yet (HTTP 503). */
  get notConfigured() {
    return this.kind === 'not_implemented' && this.status === 503;
  }
}

/**
 * Maps the Resources category chips ("All", "Food", …) to the backend
 * `category` param. "All" (and anything unrecognized) omits the param.
 */
export function categoryParamFor(chipLabel: string): ResourceCategory | undefined {
  switch (chipLabel.trim().toLowerCase()) {
    case 'food':
      return 'food';
    case 'housing':
      return 'housing';
    case 'healthcare':
      return 'healthcare';
    case 'utility':
      return 'utility';
    case 'job':
      return 'job';
    default:
      return undefined;
  }
}

/**
 * Which data source to use for a resource lookup: device coordinates when
 * location permission is granted, otherwise the profile ZIP as a fallback.
 *
 * Returns null when neither is available — the caller renders an honest
 * "we can't look up resources" state rather than guessing.
 */
export type ResourceLookupKind = 'coords' | 'zip';

export function chooseResourceLookupKind(
  locationPermissionStatus: 'unset' | 'granted' | 'denied',
  profileZip: string | null | undefined,
): ResourceLookupKind | null {
  if (locationPermissionStatus === 'granted') return 'coords';
  const zip = (profileZip ?? '').trim();
  return zip ? 'zip' : null;
}

function buildUrl(params: Record<string, string | undefined>): URL {
  const url = new URL(`${apiBaseUrl}/resources/nearby`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function parseResource(raw: unknown): NearbyResource | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { id, name, tag, address } = record;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof tag !== 'string' ||
    typeof address !== 'string'
  ) {
    return null;
  }
  const finiteNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const optional = (key: string): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  };
  const services = Array.isArray(record.services)
    ? (record.services as unknown[]).filter((service): service is string => typeof service === 'string' && service.trim().length > 0)
    : undefined;
  const rating = typeof record.rating === 'number' && Number.isFinite(record.rating) ? record.rating : undefined;
  return {
    id,
    name,
    tag,
    address,
    phone: optional('phone'),
    website: optional('website'),
    hours: optional('hours'),
    description: optional('description'),
    services: services && services.length > 0 ? services : undefined,
    rating,
    distanceMi: finiteNumber(record.distanceMi),
    latitude: finiteNumber(record.latitude),
    longitude: finiteNumber(record.longitude),
  };
}

async function getResources(url: URL): Promise<NearbyResource[]> {
  let token: string;
  try {
    token = await getGraphQLAuthToken();
  } catch (cause) {
    throw new ResourceServiceError('unauthorized', 'Please sign in to look up resources.', { cause });
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    throw new ResourceServiceError('network', "We couldn't reach Help The Hive.", { cause });
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new ResourceServiceError(
        'not_implemented',
        'Resource lookup is not configured on the server yet.',
        { status: 503 },
      );
    }
    const kind: ApiErrorKind =
      response.status === 401
        ? 'unauthorized'
        : response.status === 404
          ? 'not_found'
          : response.status === 429
            ? 'rate_limited'
            : 'server';
    throw new ResourceServiceError(kind, `Resource lookup failed (HTTP ${response.status}).`, {
      status: response.status,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ResourceServiceError('parse', 'Resource lookup returned an unreadable response.', { cause });
  }

  const list = Array.isArray(payload)
    ? payload
    : payload != null && typeof payload === 'object' && Array.isArray((payload as { resources?: unknown }).resources)
      ? (payload as { resources: unknown[] }).resources
      : null;
  if (list == null) {
    throw new ResourceServiceError('parse', 'Resource lookup returned an unreadable response.');
  }
  // Drop malformed records rather than crashing on one bad entry; the honest
  // states elsewhere cover a fully empty result set.
  return list.map(parseResource).filter((resource): resource is NearbyResource => resource != null);
}

/** Search resources by precise coordinates (mirrors the protocol's fetchNearby). */
export async function fetchNearby(
  latitude: number,
  longitude: number,
  radiusMiles: number,
  category?: ResourceCategory,
): Promise<NearbyResource[]> {
  return getResources(
    buildUrl({
      lat: String(latitude),
      lng: String(longitude),
      radiusMi: String(radiusMiles),
      category,
    }),
  );
}

/** Search resources by ZIP code fallback (mirrors the protocol's fetchByZip). */
export async function fetchByZip(zip: string, category?: ResourceCategory): Promise<NearbyResource[]> {
  return getResources(buildUrl({ zip: zip.trim(), category }));
}

/** Full-text search across the resource database (mirrors the protocol's search). */
export async function search(query: string, category?: ResourceCategory): Promise<NearbyResource[]> {
  return getResources(buildUrl({ q: query.trim(), category }));
}
