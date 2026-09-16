import {
  DELETE_ACCOUNT_ALERT_MESSAGE,
  DELETE_ACCOUNT_ALERT_TITLE,
  formatAppVersion,
  formatMemberSince,
  isValidHomeZip,
  normalizeHomeZip,
} from '@/features/profile/account-helpers';

describe('normalizeHomeZip', () => {
  it('strips non-digits', () => {
    expect(normalizeHomeZip('91502-1234')).toBe('915021234');
    expect(normalizeHomeZip(' 91 502 ')).toBe('91502');
    expect(normalizeHomeZip('abc')).toBe('');
    expect(normalizeHomeZip('')).toBe('');
  });
});

describe('isValidHomeZip', () => {
  it('accepts exactly 5 digits after normalization', () => {
    expect(isValidHomeZip('91502')).toBe(true);
    // Pasted ZIP+4 still yields the 5-digit code the resources lookup needs.
    expect(isValidHomeZip('91502-1234')).toBe(false);
    expect(isValidHomeZip('9150')).toBe(false);
    expect(isValidHomeZip('9150a')).toBe(false);
    expect(isValidHomeZip('')).toBe(false);
    expect(isValidHomeZip('     ')).toBe(false);
  });
});

describe('formatAppVersion', () => {
  it('formats Version X (Build Y)', () => {
    expect(formatAppVersion({ version: '1.0.0', build: '1' })).toBe('Version 1.0.0 (Build 1)');
    expect(formatAppVersion({ version: '2.3.1', build: 42 })).toBe('Version 2.3.1 (Build 42)');
  });

  it('falls back instead of showing a dash or blank', () => {
    expect(formatAppVersion({})).toBe('Version 1.0.0 (Build 1)');
    expect(formatAppVersion({ version: '', build: '' })).toBe('Version 1.0.0 (Build 1)');
    expect(formatAppVersion({ version: null, build: null })).toBe('Version 1.0.0 (Build 1)');
  });
});

describe('formatMemberSince', () => {
  it('formats a real account date as MMM YYYY, uppercased', () => {
    expect(formatMemberSince('2026-09-01T12:00:00Z')).toBe('SEP 2026');
    expect(formatMemberSince('2024-01-15T00:00:00Z')).toBe('JAN 2024');
  });

  it('returns null — never a dash — when there is no real date', () => {
    expect(formatMemberSince(undefined)).toBeNull();
    expect(formatMemberSince(null)).toBeNull();
    expect(formatMemberSince('')).toBeNull();
    expect(formatMemberSince('not-a-date')).toBeNull();
  });
});

describe('delete account copy', () => {
  it('uses the approved destructive confirm copy', () => {
    expect(DELETE_ACCOUNT_ALERT_TITLE).toBe('Delete your account?');
    expect(DELETE_ACCOUNT_ALERT_MESSAGE).toBe(
      "This permanently deletes your profile, meal plans, and applications. This can't be undone."
    );
    // Never leaks the support or personal address into the confirm.
    expect(DELETE_ACCOUNT_ALERT_MESSAGE).not.toContain('@');
  });
});
