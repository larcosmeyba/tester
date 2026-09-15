/** Pure auth-screen helpers with no React Native dependencies (unit-testable). */

export function maskEmailAddress(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return email;
  }
  return `${email[0]}***@${email.slice(at + 1)}`;
}
