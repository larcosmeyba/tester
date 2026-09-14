// Remote calls for the Sign Up / Login / Onboarding v2 flow: one-time
// email verification, per-step questionnaire saves, onboarding step markers,
// and communication consents. The GraphQL contract lives in
// packages/api-contract (backend-owned); this file only wraps it.

import type {
  SaveQuestionnaireMutationVariables,
  UpdateCommunicationConsentsMutationVariables,
  VerificationMethod,
  VerificationPurpose,
} from '@helpthehive/api-contract';

import { GraphQLRequestError, graphqlClient } from '@/graphql/client';
import {
  RequestVerificationCodeDocument,
  SaveLocationFallbackDocument,
  SaveOnboardingStepDocument,
  SaveQuestionnaireDocument,
  UpdateCommunicationConsentsDocument,
  VerifyCodeDocument,
} from '@/graphql/operations';

// Verification runs on the user's own session: signup establishes the
// session first (better-auth no longer gates sign-in on its own email
// verification — the API codes are the single verification of record), and
// the one-time code is the credential for the verifyCode step itself. All
// calls below use the authenticated GraphQL client.
const verificationClient = graphqlClient;

/** Thrown when the submitted code is wrong or expired. */
export class InvalidVerificationCodeError extends Error {
  constructor() {
    super('That code is incorrect or has expired. Please try again.');
    this.name = 'InvalidVerificationCodeError';
  }
}

function combinedErrorMessage(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  if (error instanceof GraphQLRequestError) {
    for (const detail of error.graphQLErrors) {
      if (detail.message) {
        parts.push(detail.message);
      }
    }
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Requests the one-time verification code. Verification is email-only
 * (Marcos removed SMS/text verification): the code always goes to the
 * signup email address. The optional purpose/newEmail/newPhone support the
 * re-verification cases (account recovery, email change, phone change).
 */
export async function requestVerificationCode(
  purpose: VerificationPurpose = 'SIGNUP',
  newEmail?: string,
  newPhone?: string,
): Promise<void> {
  await verificationClient.request(RequestVerificationCodeDocument, {
    input: { method: 'EMAIL' as VerificationMethod, purpose, newEmail, newPhone },
  });
}

export async function verifyCode(code: string): Promise<void> {
  try {
    const result = await verificationClient.request(VerifyCodeDocument, { code });
    if (!result.verifyCode) {
      throw new InvalidVerificationCodeError();
    }
  } catch (error) {
    if (error instanceof InvalidVerificationCodeError) {
      throw error;
    }
    if (combinedErrorMessage(error).includes('invalid') || combinedErrorMessage(error).includes('expired')) {
      throw new InvalidVerificationCodeError();
    }
    throw error;
  }
}

export type QuestionnaireUpdate = SaveQuestionnaireMutationVariables['input'];

export async function saveQuestionnaire(input: QuestionnaireUpdate) {
  const result = await graphqlClient.request(SaveQuestionnaireDocument, { input });
  return result.saveQuestionnaire;
}

export async function saveOnboardingStep(step: string): Promise<void> {
  await graphqlClient.request(SaveOnboardingStepDocument, { step });
}

export type CommunicationConsentsUpdate = UpdateCommunicationConsentsMutationVariables['input'];

export async function updateCommunicationConsents(input: CommunicationConsentsUpdate): Promise<void> {
  await graphqlClient.request(UpdateCommunicationConsentsDocument, { input });
}

export async function saveLocationFallback(zip: string): Promise<void> {
  await graphqlClient.request(SaveLocationFallbackDocument, { zip });
}
