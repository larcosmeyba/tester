/**
 * The typed-signature gate for approving a benefits application.
 *
 * Approving records the applicant's typed signature and attestation on the
 * server. The name must be typed by the applicant — never pre-filled — and
 * the attestation must be checked. Pure so the gating rule is testable
 * without rendering the review screen.
 */
export function isSignatureComplete(signedName: string, attestationAccepted: boolean): boolean {
  return signedName.trim() !== '' && attestationAccepted;
}
