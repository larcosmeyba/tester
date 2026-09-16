import { programDisplayName, submittedDateLabel } from '@/features/resources/resources-application-names';

// The program catalog chain pulls in the theme, which imports global.css —
// unparseable under jest. The display-name lookup never reads a color, so a
// shallow theme stub is enough here.
// jest.mock calls are hoisted above the imports by babel-plugin-jest-hoist,
// so they stay effective while satisfying import/first.
jest.mock('@/constants/theme', () => ({
  HiveColors: {
    yellow: '#FBBC05',
    blue: '#1A73E8',
    greenMid: '#2E8B3A',
    orange: '#FBBC05',
    purple: '#7B1FA2',
    green: '#1B5E20',
  },
}));

describe('programDisplayName', () => {
  it('resolves a catalog program to its display name', () => {
    expect(programDisplayName('SNAP')).toBe('SNAP');
  });

  it('falls back to the raw program id for unknown programs', () => {
    expect(programDisplayName('MYSTERY_PROGRAM')).toBe('MYSTERY_PROGRAM');
  });

  it('matches case-insensitively', () => {
    expect(programDisplayName('snap')).toBe(programDisplayName('SNAP'));
  });
});

describe('submittedDateLabel', () => {
  it('formats as a short human date', () => {
    const label = submittedDateLabel(new Date(2026, 8, 14));
    expect(label).toContain('2026');
    expect(label).toContain('14');
  });
});
