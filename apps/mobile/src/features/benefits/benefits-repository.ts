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
  BenefitsFieldVocabularyDocument,
  BenefitsFormsDocument,
  BenefitsProfileDocument,
  DeleteBenefitsApplicationDocument,
  RefillBenefitsApplicationDocument,
  SaveBenefitsAnswersDocument,
  SaveBenefitsGroupDocument,
  StartBenefitsApplicationDocument,
} from "@/graphql/benefits-operations";

export type {
  BenefitsApplication,
  BenefitsFieldSpec,
  BenefitsFilledField,
  BenefitsForm,
  BenefitsMissingField,
  BenefitsProfileData,
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
 * Approving flattens the document. The server refuses while anything required
 * is still missing, so this can fail and the screen must show why rather than
 * pretending it worked.
 */
export async function approveBenefitsApplication(applicationId: string) {
  const result = await graphqlClient.request(ApproveBenefitsApplicationDocument, { applicationId });
  return result.approveBenefitsApplication;
}

export async function deleteBenefitsApplication(applicationId: string) {
  const result = await graphqlClient.request(DeleteBenefitsApplicationDocument, { applicationId });
  return result.deleteBenefitsApplication;
}

export {
  answerFrom,
  centsToMoney,
  groupQuestions,
  moneyToCents,
  noneAnswer,
  questionsToAsk,
  requiredQuestionsToAsk,
} from "@/features/benefits/benefits-answers";

/**
 * The full URL of a generated PDF. It reads the API base, which is why it lives
 * here beside the other calls rather than with the pure answer logic.
 */
export function benefitsDocumentUrl(path: string): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/graphql";
  return joinDocumentUrl(base, path);
}
