import {
  categoryParamFor,
  chooseResourceLookupKind,
  fetchByZip,
  fetchNearby,
  ResourceServiceError,
  search,
} from '@/features/resources/resource-service';

// Mock the seams the service reads: the token and the base URL. The service
// under test never touches the real auth client or env module this way.
jest.mock('@/auth/auth-client', () => ({
  getGraphQLAuthToken: jest.fn(async () => 'test-token'),
}));
jest.mock('@/constants/env', () => ({
  apiBaseUrl: 'https://api.test',
}));

const { getGraphQLAuthToken } = jest.requireMock('@/auth/auth-client') as {
  getGraphQLAuthToken: jest.Mock;
};

const samplePayload = [
  {
    id: 'res-1',
    name: 'Burbank Temporary Aid Center',
    tag: 'Food Pantry',
    address: '2717 N. Naomi Street, Burbank, CA 91504',
    phone: '(818) 848-2392',
    website: 'https://www.burtac.org',
    hours: 'Mon–Fri · 9:00 AM – 5:00 PM',
    description: 'Provides food, clothing, and emergency assistance to families in need.',
    distanceMi: 0.8,
    latitude: 34.18,
    longitude: -118.31,
  },
];

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const json = response.json ?? (async () => samplePayload);
  globalThis.fetch = jest.fn(async () =>
    ({
      ok: true,
      status: 200,
      json,
      ...response,
    }) as Response,
  ) as jest.Mock;
  return globalThis.fetch as jest.Mock;
}

function lastFetchUrl(): string {
  const mock = globalThis.fetch as jest.Mock;
  return String(mock.mock.calls[mock.mock.calls.length - 1][0]);
}

function lastFetchHeaders(): Record<string, string> {
  const mock = globalThis.fetch as jest.Mock;
  return mock.mock.calls[mock.mock.calls.length - 1][1].headers as Record<string, string>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('categoryParamFor', () => {
  it.each([
    ['All', undefined],
    ['Food', 'food'],
    ['Housing', 'housing'],
    ['Healthcare', 'healthcare'],
    ['Utility', 'utility'],
    ['Job', 'job'],
  ])('maps chip %s to %s', (chip, expected) => {
    expect(categoryParamFor(chip)).toBe(expected);
  });

  it('omits the param for unrecognized chips', () => {
    expect(categoryParamFor('Something Else')).toBeUndefined();
  });
});

describe('chooseResourceLookupKind', () => {
  it('prefers device coordinates when permission is granted', () => {
    expect(chooseResourceLookupKind('granted', '')).toBe('coords');
    expect(chooseResourceLookupKind('granted', '91504')).toBe('coords');
  });

  it('falls back to the profile ZIP when permission is denied or unset', () => {
    expect(chooseResourceLookupKind('denied', '91504')).toBe('zip');
    expect(chooseResourceLookupKind('unset', '91504')).toBe('zip');
  });

  it('returns null when there is no location and no ZIP', () => {
    expect(chooseResourceLookupKind('denied', '')).toBeNull();
    expect(chooseResourceLookupKind('denied', null)).toBeNull();
    expect(chooseResourceLookupKind('unset', undefined)).toBeNull();
  });
});

describe('fetchNearby', () => {
  it('calls the nearby endpoint with lat/lng/radius and the bearer token', async () => {
    mockFetchOnce({});
    const resources = await fetchNearby(34.18, -118.31, 25, 'food');
    const url = lastFetchUrl();
    expect(url).toContain('/resources/nearby');
    expect(url).toContain('lat=34.18');
    expect(url).toContain('lng=-118.31');
    expect(url).toContain('radiusMi=25');
    expect(url).toContain('category=food');
    expect(lastFetchHeaders().Authorization).toBe('Bearer test-token');
    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('Burbank Temporary Aid Center');
    expect(resources[0].distanceMi).toBe(0.8);
  });

  it('omits the category param when no chip is selected', async () => {
    mockFetchOnce({});
    await fetchNearby(34.18, -118.31, 25);
    expect(lastFetchUrl()).not.toContain('category=');
  });

  it('surfaces a 503 as notConfigured so the UI can be honest about it', async () => {
    mockFetchOnce({ ok: false, status: 503 });
    const error = await fetchNearby(34.18, -118.31, 25).catch((cause) => cause);
    expect(error).toBeInstanceOf(ResourceServiceError);
    expect((error as ResourceServiceError).notConfigured).toBe(true);
    expect((error as ResourceServiceError).status).toBe(503);
  });

  it('maps other HTTP failures to typed errors', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const error = await fetchNearby(34.18, -118.31, 25).catch((cause) => cause);
    expect(error).toBeInstanceOf(ResourceServiceError);
    expect((error as ResourceServiceError).notConfigured).toBe(false);
  });

  it('throws on a malformed payload instead of rendering it', async () => {
    mockFetchOnce({ json: async () => ({ unexpected: true }) });
    await expect(fetchNearby(34.18, -118.31, 25)).rejects.toBeInstanceOf(ResourceServiceError);
  });

  it('drops malformed records but keeps the valid ones', async () => {
    mockFetchOnce({ json: async () => [{ nope: true }, ...samplePayload] });
    const resources = await fetchNearby(34.18, -118.31, 25);
    expect(resources).toHaveLength(1);
  });

  it('never invents fields the API did not return', async () => {
    mockFetchOnce({
      json: async () => [
        {
          id: 'res-2',
          name: 'Minimal Pantry',
          tag: 'Food Pantry',
          address: 'Somewhere, CA',
        },
      ],
    });
    const [resource] = await fetchNearby(34.18, -118.31, 25);
    expect(resource.description).toBeUndefined();
    expect(resource.rating).toBeUndefined();
    expect(resource.services).toBeUndefined();
    expect(resource.distanceMi).toBeNull();
    expect(resource.latitude).toBeNull();
    expect(resource.longitude).toBeNull();
  });

  it('turns a missing token into an unauthorized error', async () => {
    getGraphQLAuthToken.mockRejectedValueOnce(new Error('no session'));
    const error = await fetchNearby(34.18, -118.31, 25).catch((cause) => cause);
    expect(error).toBeInstanceOf(ResourceServiceError);
    expect((error as ResourceServiceError).kind).toBe('unauthorized');
  });
});

describe('fetchByZip', () => {
  it('calls the nearby endpoint with the ZIP variant', async () => {
    mockFetchOnce({});
    await fetchByZip('91504', 'housing');
    const url = lastFetchUrl();
    expect(url).toContain('/resources/nearby');
    expect(url).toContain('zip=91504');
    expect(url).toContain('category=housing');
    expect(url).not.toContain('lat=');
  });
});

describe('search', () => {
  it('calls the nearby endpoint with the query variant', async () => {
    mockFetchOnce({});
    await search('food pantry', 'food');
    const url = lastFetchUrl();
    expect(url).toContain('/resources/nearby');
    expect(url).toContain('q=food+pantry');
    expect(url).toContain('category=food');
  });
});
