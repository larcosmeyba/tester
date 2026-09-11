/**
 * The app's view of the government benefits system.
 *
 * Everything here is a thin call to the server. The rules — what a form needs,
 * what is still missing, what may be written where — live on the backend, and
 * this file deliberately reimplements none of them. In particular the app never
 * decides that an answer is good enough: it shows what the server reports as
 * missing and sends back what the user typed.
 *
 * Benefits answers are the most sensitive data in the product, so unlike the
 * rest of the app none of it is cached to AsyncStorage. It is fetched when a
 * screen needs it and held in memory only.
 */
import type { SaveBenefitsGroupInput } from "@helpthehive/api-contract";

import type { BenefitsAnswer } from "@/features/benefits/benefits-answers";
import { joinDocumentUrl } from "@/features/benefits/benefits-answers";

import { graphqlClient } from "@/graphql/client";
import {
  ApproveBenefitsApplicationDocument,
  BenefitsApplicationDocument,
  BenefitsApplicationsDocument,
  BenefitsChecklistDocument,
  BenefitsFieldVocabularyDocument,
  BenefitsFormsDocument,
  BenefitsPortalDocument,
  BenefitsProfileDocument,
  BenefitsProgramRulesDocument,
  BenefitsRenewalsDocument,
  BenefitsStateFromZipDocument,
  ConfirmBenefitsRenewalDeadlineDocument,
  DeleteBenefitsApplicationDocument,
  DismissBenefitsRenewalDocument,
  RecordBenefitsConfirmationDocument,
  RefillBenefitsApplicationDocument,
  SaveBenefitsAnswersDocument,
  SaveBenefitsGroupDocument,
  StartBenefitsApplicationDocument,
  StartBenefitsRenewalApplicationDocument,
  UpdateBenefitsRenewalPreferencesDocument,
} from "@/graphql/benefits-operations";

export type {
  BenefitsApplication,
  BenefitsChecklistItem,
  BenefitsChecklistSection,
  BenefitsFieldSpec,
  BenefitsFilledField,
  BenefitsForm,
  BenefitsMissingField,
  BenefitsPortal,
  BenefitsProfileData,
  BenefitsProgramRule,
  BenefitsRenewal,
  BenefitsRenewalSource,
  BenefitsRenewalStatus,
  BenefitsStateLookup,
} from "@/features/benefits/benefits-types";
export type { BenefitsAnswer } from "@/features/benefits/benefits-answers";

export async function fetchBenefitsProfile() {
  const result = await graphqlClient.request(BenefitsProfileDocument);
  return result.benefitsProfile;
}

export async function fetchBenefitsForms(state?: string, program?: string) {
  const result = await graphqlClient.request(BenefitsFormsDocument, { state, program });
  return result.benefitsForms;
}

export async function fetchBenefitsApplications() {
  const result = await graphqlClient.request(BenefitsApplicationsDocument);
  return result.benefitsApplications;
}

export async function fetchBenefitsApplication(applicationId: string) {
  const result = await graphqlClient.request(BenefitsApplicationDocument, { applicationId });
  return result.benefitsApplication;
}

/**
 * The question set the app renders. It comes from the server so a new question
 * is a server change rather than an app release.
 */
export async function fetchBenefitsVocabulary() {
  const result = await graphqlClient.request(BenefitsFieldVocabularyDocument);
  return result.benefitsFieldVocabulary;
}

export async function saveBenefitsAnswers(input: BenefitsAnswer[]) {
  const result = await graphqlClient.request(SaveBenefitsAnswersDocument, { input });
  return result.saveBenefitsAnswers;
}

export async function saveBenefitsGroup(input: SaveBenefitsGroupInput) {
  const result = await graphqlClient.request(SaveBenefitsGroupDocument, { input });
  return result.saveBenefitsGroup;
}

export async function startBenefitsApplication(formId: string) {
  const result = await graphqlClient.request(StartBenefitsApplicationDocument, { formId });
  return result.startBenefitsApplication;
}

export async function refillBenefitsApplication(applicationId: string) {
  const result = await graphqlClient.request(RefillBenefitsApplicationDocument, { applicationId });
  return result.refillBenefitsApplication;
}

/**
 * Approving records the applicant's typed signature and attestation, then
 * flattens the document. The signature is never pre-filled: the name must be
 * typed by the applicant on the review screen, and the server refuses a blank
 * name or a missing attestation. The server also refuses while anything
 * required is still missing, so this can fail and the screen must show why
 * rather than pretending it worked.
 */
export async function approveBenefitsApplication(
  applicationId: string,
  signedName: string,
  attestationAccepted: boolean,
) {
  const result = await graphqlClient.request(ApproveBenefitsApplicationDocument, {
    applicationId,
    signedName,
    attestationAccepted,
  });
  return result.approveBenefitsApplication;
}

/**
 * Records the confirmation number the applicant received after applying on
 * the official portal. Feeds the renewal schedule: the renewal for this
 * application becomes user-confirmed.
 */
export async function recordBenefitsConfirmation(applicationId: string, confirmationNumber: string) {
  const result = await graphqlClient.request(RecordBenefitsConfirmationDocument, {
    applicationId,
    confirmationNumber,
  });
  return result.recordBenefitsConfirmation;
}

/**
 * Submission Phase 1: state detection, portal routing, guided checklist.
 *
 * Detecting the state from a ZIP is what routes the applicant to the right
 * official portal. An unknown ZIP returns state: null — never a guess — and
 * the screen must say so rather than routing somewhere plausible.
 */
export async function fetchStateFromZip(zip: string) {
  const result = await graphqlClient.request(BenefitsStateFromZipDocument, { zip });
  return result.benefitsStateFromZip;
}

/**
 * The official application portal for a program in a state. The URL is null
 * when no verified URL is on file: the app shows fallback guidance instead of
 * inventing one.
 */
export async function fetchBenefitsPortal(program: string, state: string) {
  const result = await graphqlClient.request(BenefitsPortalDocument, { program, state });
  return result.benefitsPortal;
}

/**
 * The guided checklist for applying: what to have ready before, during, and
 * after the application. Reference content from the server, not rules the app
 * invents.
 */
export async function fetchBenefitsChecklist(program: string, state: string) {
  const result = await graphqlClient.request(BenefitsChecklistDocument, { program, state });
  return result.benefitsChecklist;
}

export async function deleteBenefitsApplication(applicationId: string) {
  const result = await graphqlClient.request(DeleteBenefitsApplicationDocument, { applicationId });
  return result.deleteBenefitsApplication;
}

/**
 * Renewal tracking. The server owns deadlines, reminder stages, and the
 * renewal schedule; the app only reads them, confirms them, starts a renewal
 * application from them, or dismisses them.
 */

export async function fetchBenefitsRenewals() {
  const result = await graphqlClient.request(BenefitsRenewalsDocument);
  return result.benefitsRenewals;
}

export async function fetchBenefitsProgramRules(program?: string) {
  const result = await graphqlClient.request(BenefitsProgramRulesDocument, { program });
  return result.benefitsProgramRules;
}

/**
 * Stores the user-confirmed certification end. Both timestamps are the date
 * the user picked: certificationEndsAt is when their certification ends, and
 * renewalDueAt is when action is needed (the server may nudge earlier based on
 * reminder offsets).
 */
export async function confirmBenefitsRenewalDeadline(
  renewalId: string,
  renewalDueAt: string,
  certificationEndsAt?: string | null,
) {
  const result = await graphqlClient.request(ConfirmBenefitsRenewalDeadlineDocument, {
    renewalId,
    renewalDueAt,
    certificationEndsAt,
  });
  return result.confirmBenefitsRenewalDeadline;
}

/**
 * Starts a renewal application from a renewal record. Like the first-time
 * flow, the new application is pre-filled from the existing profile answers —
 * one tap turns a reminder into a renewal draft.
 */
export async function startBenefitsRenewalApplication(renewalId: string) {
  const result = await graphqlClient.request(StartBenefitsRenewalApplicationDocument, { renewalId });
  return result.startBenefitsRenewalApplication;
}

export async function dismissBenefitsRenewal(renewalId: string) {
  const result = await graphqlClient.request(DismissBenefitsRenewalDocument, { renewalId });
  return result.dismissBenefitsRenewal;
}

export async function updateBenefitsRenewalPreferences(
  renewalAlertsEnabled: boolean,
  discreetLockScreen: boolean,
) {
  const result = await graphqlClient.request(UpdateBenefitsRenewalPreferencesDocument, {
    renewalAlertsEnabled,
    discreetLockScreen,
  });
  return result.updateBenefitsRenewalPreferences;
}

export {
  answerFrom,
  centsToMoney,
  groupQuestions,
  moneyToCents,
  noneAnswer,
  prefillAnswersFromProfile,
  questionsToAsk,
  requiredQuestionsToAsk,
} from "@/features/benefits/benefits-answers";
export type { LocalProfilePrefill } from "@/features/benefits/benefits-answers";

/**
 * The full URL of a generated PDF. It reads the API base, which is why it lives
 * here beside the other calls rather than with the pure answer logic.
 */
export function benefitsDocumentUrl(path: string): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/graphql";
  return joinDocumentUrl(base, path);
}

/**
 * The filing kit for an application: the printable answer sheet for forms
 * Help The Hive cannot auto-fill, plus where to send it. Same authed pattern
 * as the PDFs — the viewer's own Bearer <redacted>, scoped to the viewer by the
 * server, never a public link.
 */
export function benefitsFilingKitUrl(applicationId: string): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/graphql";
  return joinDocumentUrl(base, `/benefits/applications/${applicationId}/filing-kit`);
}
