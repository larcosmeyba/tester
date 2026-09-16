import { maskEmailAddress } from '../auth-utils';

describe('maskEmailAddress', () => {
  it('masks the local part, keeping the first character and domain', () => {
    expect(maskEmailAddress('marcos@example.com')).toBe('m***@example.com');
  });

  it('handles short local parts', () => {
    expect(maskEmailAddress('a@example.com')).toBe('a***@example.com');
  });

  it('returns the input unchanged when there is no @', () => {
    expect(maskEmailAddress('not-an-email')).toBe('not-an-email');
  });

  it('returns the input unchanged for an empty string', () => {
    expect(maskEmailAddress('')).toBe('');
  });
});
