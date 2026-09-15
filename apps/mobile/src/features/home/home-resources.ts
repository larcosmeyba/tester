// Resources Near You — allow-list enforcement (Marcos, Section 2 audit).
//
// Rules enforced here, at the data layer:
// - Only government agencies, established nonprofits, and verified community
//   organizations.
// - Only support-relevant categories: food, housing, health, family, benefits,
//   financial assistance (and adjacent: SNAP/WIC, utility, legal aid, veterans,
//   childcare).
// - NEVER random nearby businesses.
// - Every entry must carry reliable contact/location info (address, phone, or
//   website); entries that cannot be verified are dropped, not shipped.
// - Closest relevant first.
//
// TODO (Section 2 audit): replace the mock `nearbyResources` feed with the
// verified backend resource feed (location-based, same rules applied
// server-side). This filter stays as a client-side guard.

import { nearbyResources, type ResourceItem } from '@/data/mock-data';

/** Keyword allow-list matched against the resource tag (lowercased). */
const ALLOW_LISTED_TAG_KEYWORDS = [
  'food', 'pantry', 'snap', 'calfresh', 'wic',
  'housing', 'rent', 'shelter',
  'health', 'clinic', 'medicaid',
  'benefit', 'dpss', 'social service',
  'family', 'child', 'financial', 'utility', 'legal', 'veteran',
] as const;

function distanceInMiles(resource: ResourceItem): number {
  const match = /([\d.]+)\s*mi/.exec(resource.distance ?? '');
  return match ? Number.parseFloat(match[1]) : Number.POSITIVE_INFINITY;
}

export function isAllowListedResource(resource: ResourceItem): boolean {
  const hasContact = Boolean(resource.address || resource.phone || resource.website);
  if (!hasContact) {
    return false;
  }
  const tag = resource.tag.toLowerCase();
  return ALLOW_LISTED_TAG_KEYWORDS.some((keyword) => tag.includes(keyword));
}

/** Allow-listed resources, closest first. */
export function getHomeResources(): ResourceItem[] {
  return [...nearbyResources]
    .filter(isAllowListedResource)
    .sort((a, b) => distanceInMiles(a) - distanceInMiles(b));
}

export type LocationPermissionStatus = 'unset' | 'granted' | 'denied';

export type ResourceDataSource =
  | { kind: 'current-location'; title: string; subtitle: string }
  | { kind: 'manual-area'; zip: string; title: string; subtitle: string }
  | { kind: 'demo'; title: string; subtitle: string };

/**
 * Honest source labeling for the resource lists (Marcos, 2026-09-15).
 *
 * The feed is still demo data until the verified backend resource feed
 * exists — so the subtitle always says so. The title only claims "Near You"
 * when there is a genuine user-derived location (granted foreground
 * permission or a manually entered ZIP); otherwise it falls back to the
 * neutral "Community Resources".
 */
export function getResourceDataSource(
  locationPermissionStatus: LocationPermissionStatus,
  zip: string,
): ResourceDataSource {
  const trimmedZip = zip.trim();
  if (locationPermissionStatus === 'granted') {
    return {
      kind: 'current-location',
      title: 'Resources Near You',
      subtitle: 'Location enabled · Showing demo resource data',
    };
  }
  if (trimmedZip.length > 0) {
    return {
      kind: 'manual-area',
      zip: trimmedZip,
      title: 'Resources Near You',
      subtitle: `Area ${trimmedZip} · Showing demo resource data`,
    };
  }
  return {
    kind: 'demo',
    title: 'Community Resources',
    subtitle: 'Demo resource data · Enable location or add a ZIP to personalize',
  };
}
