/**
 * Social media import link queue: platform detection, add/remove/dedup, and
 * continue gating. All pure — the backend transcribes the recipes; nothing
 * here invents one.
 */
import {
  addSocialLink,
  canAddSocialLink,
  canContinueToGrocery,
  detectSocialPlatform,
  estimatedRecipeMinutes,
  normalizeSocialLinkUrl,
  removeSocialLink,
  truncateDisplayUrl,
  SOCIAL_PLATFORM_ACCENT,
  SOCIAL_PLATFORM_LABEL,
  type SocialImportLink,
} from '@/features/meals/social-import-model';

let nextId = 0;
const makeId = () => `link-${++nextId}`;

describe('detectSocialPlatform', () => {
  test.each([
    ['https://www.tiktok.com/@cook/video/123', 'tiktok'],
    ['https://vm.tiktok.com/abc/', 'tiktok'],
    ['https://www.instagram.com/reel/xyz/', 'instagram'],
    ['https://instagr.am/p/abc/', 'instagram'],
    ['https://www.youtube.com/shorts/abc', 'youtube'],
    ['https://youtu.be/abc123', 'youtube'],
    ['https://vimeo.com/12345', 'other'],
    ['http://example.com/video.mp4', 'other'],
  ] as const)('%s -> %s', (url, expected) => {
    expect(detectSocialPlatform(url)).toBe(expected);
  });

  test.each(['', '   ', 'not a link', 'htp:/broken', 'just some text'])(
    'returns null for %s',
    (value) => {
      expect(detectSocialPlatform(value)).toBeNull();
    }
  );

  test('is case-insensitive', () => {
    expect(detectSocialPlatform('https://www.TikTok.com/@x/video/1')).toBe('tiktok');
    expect(detectSocialPlatform('HTTPS://YOUTUBE.COM/watch?v=1')).toBe('youtube');
  });

  test('tiktok wins over a generic http prefix', () => {
    expect(detectSocialPlatform('https://tiktok.com')).toBe('tiktok');
  });
});

describe('normalizeSocialLinkUrl', () => {
  test('trims whitespace and keeps the platform', () => {
    expect(normalizeSocialLinkUrl('  https://youtu.be/abc  ')).toEqual({
      url: 'https://youtu.be/abc',
      platform: 'youtube',
    });
  });

  test('returns null for junk', () => {
    expect(normalizeSocialLinkUrl('   ')).toBeNull();
    expect(normalizeSocialLinkUrl('hello world')).toBeNull();
  });
});

describe('canAddSocialLink', () => {
  const queued: SocialImportLink[] = [{ id: 'a', url: 'https://tiktok.com/v/1', platform: 'tiktok' }];

  test('accepts a new valid URL', () => {
    expect(canAddSocialLink([], 'https://www.instagram.com/reel/xyz/')).toBe(true);
    expect(canAddSocialLink(queued, 'https://youtu.be/abc')).toBe(true);
  });

  test('rejects duplicates (trimmed)', () => {
    expect(canAddSocialLink(queued, '  https://tiktok.com/v/1  ')).toBe(false);
  });

  test('rejects invalid URLs', () => {
    expect(canAddSocialLink([], 'not a link')).toBe(false);
    expect(canAddSocialLink([], '')).toBe(false);
  });
});

describe('addSocialLink / removeSocialLink', () => {
  test('appends with an id, url, and platform', () => {
    const next = addSocialLink([], 'https://vm.tiktok.com/abc/', makeId);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ url: 'https://vm.tiktok.com/abc/', platform: 'tiktok' });
    expect(typeof next[0]!.id).toBe('string');
  });

  test('trims the URL before storing', () => {
    const next = addSocialLink([], '  https://youtu.be/abc  ', makeId);
    expect(next[0]!.url).toBe('https://youtu.be/abc');
  });

  test('is a no-op for duplicates and junk (same array identity)', () => {
    const start: SocialImportLink[] = [{ id: 'a', url: 'https://tiktok.com/v/1', platform: 'tiktok' }];
    expect(addSocialLink(start, 'https://tiktok.com/v/1', makeId)).toBe(start);
    expect(addSocialLink(start, 'junk', makeId)).toBe(start);
    expect(addSocialLink(start, '', makeId)).toBe(start);
  });

  test('removeSocialLink drops by id', () => {
    const links: SocialImportLink[] = [
      { id: 'a', url: 'https://tiktok.com/v/1', platform: 'tiktok' },
      { id: 'b', url: 'https://youtu.be/2', platform: 'youtube' },
    ];
    expect(removeSocialLink(links, 'a').map((l) => l.id)).toEqual(['b']);
    expect(removeSocialLink(links, 'missing')).toHaveLength(2);
  });
});

describe('truncateDisplayUrl', () => {
  test('keeps short URLs whole', () => {
    expect(truncateDisplayUrl('https://tiktok.com/v/1')).toBe('https://tiktok.com/v/1');
  });

  test('truncates long URLs at 41 chars + … (Swift parity)', () => {
    const long = 'https://www.tiktok.com/@someverylongusername/video/1234567890abcdef';
    const truncated = truncateDisplayUrl(long);
    expect(truncated).toBe(`${long.slice(0, 41)}…`);
    expect(truncated).not.toBe(long);
  });
});

describe('estimatedRecipeMinutes', () => {
  test('prefers the backend total time', () => {
    expect(estimatedRecipeMinutes({ totalTimeMinutes: 30, steps: [{ minutes: 10 }] })).toBe(30);
  });

  test('sums step minutes when no total is given', () => {
    expect(estimatedRecipeMinutes({ steps: [{ minutes: 10 }, { minutes: 20 }, {}] })).toBe(30);
  });

  test('returns null rather than inventing a time', () => {
    expect(estimatedRecipeMinutes({})).toBeNull();
    expect(estimatedRecipeMinutes({ totalTimeMinutes: 0, steps: [{ minutes: null }] })).toBeNull();
  });
});

describe('canContinueToGrocery', () => {
  test('gates the continue button on at least one accepted recipe', () => {
    expect(canContinueToGrocery([])).toBe(false);
    expect(canContinueToGrocery(['r1'])).toBe(true);
    expect(canContinueToGrocery(['r1', 'r2'])).toBe(true);
  });
});

describe('platform labels and accents', () => {
  test('every badge platform has a label and an accent', () => {
    for (const platform of ['tiktok', 'instagram', 'youtube', 'other'] as const) {
      expect(SOCIAL_PLATFORM_LABEL[platform].length).toBeGreaterThan(0);
      expect(SOCIAL_PLATFORM_ACCENT[platform]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
