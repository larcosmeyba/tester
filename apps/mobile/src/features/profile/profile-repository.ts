import type {
  CompleteOnboardingMutationVariables,
  HandleAvailabilityQuery,
  PushPlatform,
  UpdatePreferencesMutationVariables,
  UpdateProfileMutationVariables,
  ViewerQuery,
} from '@helpthehive/api-contract';

import { GraphQLRequestError, graphqlClient } from '@/graphql/client';
import {
  CompleteOnboardingDocument,
  DeleteViewerDataDocument,
  DeletePushTokenDocument,
  HandleAvailabilityDocument,
  UpdateHandleDocument,
  UpdatePreferencesDocument,
  UpdateProfileDocument,
  RegisterPushTokenDocument,
  ViewerDocument,
} from '@/graphql/operations';

export type ViewerData = ViewerQuery['viewer'];
export type ProfileUpdate = UpdateProfileMutationVariables['input'];
export type PreferencesUpdate = UpdatePreferencesMutationVariables['input'];
export type CompleteOnboardingUpdate = CompleteOnboardingMutationVariables['input'];
export type HandleAvailability = HandleAvailabilityQuery['handleAvailability'];
export type HandleErrorCode = 'INVALID_FORMAT' | 'RESERVED' | 'UNAVAILABLE' | 'COOLDOWN';

export class HandleUpdateError extends Error {
  constructor(readonly code: HandleErrorCode, message: string, readonly retryAfter?: string) {
    super(message);
    this.name = 'HandleUpdateError';
  }
}

export async function fetchViewer() {
  const result = await graphqlClient.request(ViewerDocument);
  return result.viewer;
}

export async function deleteViewerData() {
  const result = await graphqlClient.request(DeleteViewerDataDocument);
  return result.deleteViewerData;
}

export async function updateProfile(input: ProfileUpdate) {
  const result = await graphqlClient.request(UpdateProfileDocument, { input });
  return result.updateProfile;
}

export async function updatePreferences(input: PreferencesUpdate) {
  const result = await graphqlClient.request(UpdatePreferencesDocument, { input });
  return result.updatePreferences;
}

export async function registerPushToken(token: string, platform: PushPlatform) {
  const result = await graphqlClient.request(RegisterPushTokenDocument, {
    input: { token, platform },
  });
  return result.registerPushToken;
}

export async function deletePushToken(token: string) {
  const result = await graphqlClient.request(DeletePushTokenDocument, { token });
  return result.deletePushToken;
}

export async function completeOnboarding(input: CompleteOnboardingUpdate) {
  const result = await graphqlClient.request(CompleteOnboardingDocument, { input });
  return result.completeOnboarding;
}

export async function checkHandleAvailability(handle: string) {
  const result = await graphqlClient.request(HandleAvailabilityDocument, { handle });
  return result.handleAvailability;
}

export async function updateHandle(handle: string) {
  try {
    const result = await graphqlClient.request(UpdateHandleDocument, { handle });
    return result.updateHandle;
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      const extensions = error.graphQLErrors[0]?.extensions;
      const code = extensions?.code;
      if (code === 'INVALID_FORMAT' || code === 'RESERVED' || code === 'UNAVAILABLE' || code === 'COOLDOWN') {
        throw new HandleUpdateError(code, error.message, typeof extensions?.retryAfter === 'string' ? extensions.retryAfter : undefined);
      }
    }
    throw error;
  }
}
