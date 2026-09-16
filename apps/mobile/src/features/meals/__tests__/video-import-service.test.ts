/**
 * Video import service: failure-code copy and link validation.
 * (Network behavior stays behind the service boundary; these are pure.
 * The GraphQL client is mocked because importing the real one pulls in
 * Expo's ESM environment module, which the node test environment can't run.)
 */
import {
  looksLikeVideoLink,
  videoImportFailureMessage,
} from '@/features/meals/video-import-service';

// jest.mock calls are hoisted above the imports by babel-plugin-jest-hoist.
jest.mock('@/graphql/client', () => ({
  graphqlRequest: jest.fn(),
}));
jest.mock('@/constants/env', () => ({
  useMockServices: false,
}));

describe('videoImportFailureMessage', () => {
  const cases: [string, string][] = [
    ['UNSUPPORTED_SOURCE', 'tiktok'],
    ['VIDEO_UNAVAILABLE', 'private'],
    ['VIDEO_TOO_LONG', 'too long'],
    ['NO_TRANSCRIPT', 'transcript'],
    ['NO_RECIPE_FOUND', 'recipe'],
    ['PROVIDER_ERROR', 'hiccup'],
  ];

  test.each(cases)('%s maps to a human sentence', (code, snippet) => {
    const message = videoImportFailureMessage(code, null);
    expect(message.length).toBeGreaterThan(20);
    expect(message.toLowerCase()).toContain(snippet);
  });

  test('falls back to the safe server message when provided', () => {
    expect(videoImportFailureMessage('SOMETHING_NEW', 'A safe server sentence.')).toBe(
      'A safe server sentence.'
    );
  });

  test('falls back to a generic message with nothing to go on', () => {
    expect(videoImportFailureMessage(null, null)).toContain('try again');
  });
});

describe('looksLikeVideoLink', () => {
  test.each([
    'https://www.tiktok.com/@cook/video/123',
    'https://youtube.com/shorts/abc',
    'https://www.instagram.com/reel/xyz/',
    'http://example.com/video',
    'www.tiktok.com/@cook/video/123',
  ])('accepts %s', (url) => {
    expect(looksLikeVideoLink(url)).toBe(true);
  });

  test.each(['', '   ', 'not a link', 'htp:/broken', 'a'.repeat(4)])('rejects %s', (url) => {
    expect(looksLikeVideoLink(url)).toBe(false);
  });
});
