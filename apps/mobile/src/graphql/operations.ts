import type {
  AddPantryItemMutation,
  AddPantryItemMutationVariables,
  CompleteOnboardingMutation,
  CompleteOnboardingMutationVariables,
  DeleteViewerDataMutation,
  DeleteViewerDataMutationVariables,
  RecordConsentMutation,
  RecordConsentMutationVariables,
  RequestVerificationCodeMutation,
  RequestVerificationCodeMutationVariables,
  RequestVerificationLinkMutation,
  RequestVerificationLinkMutationVariables,
  SaveLocationFallbackMutation,
  SaveLocationFallbackMutationVariables,
  SaveOnboardingStepMutation,
  SaveOnboardingStepMutationVariables,
  SaveQuestionnaireMutation,
  SaveQuestionnaireMutationVariables,
  UpdateCommunicationConsentsMutation,
  UpdateCommunicationConsentsMutationVariables,
  VerifyCodeMutation,
  VerifyCodeMutationVariables,
  HandleAvailabilityQuery,
  HandleAvailabilityQueryVariables,
  DeletePantryItemMutation,
  DeletePantryItemMutationVariables,
  DeletePushTokenMutation,
  DeletePushTokenMutationVariables,
  MarkPantryItemUsedMutation,
  MarkPantryItemUsedMutationVariables,
  PantryItemsQuery,
  PantryItemsQueryVariables,
  PantryWasteStatsQuery,
  PantryWasteStatsQueryVariables,
  RegisterPushTokenMutation,
  RegisterPushTokenMutationVariables,
  UpdatePantryItemMutation,
  UpdatePantryItemMutationVariables,
  UpdatePreferencesMutation,
  UpdatePreferencesMutationVariables,
  UpdateProfileMutation,
  UpdateProfileMutationVariables,
  UpdateHandleMutation,
  UpdateHandleMutationVariables,
  ViewerQuery,
  ViewerQueryVariables,
} from '@helpthehive/api-contract';

export type GraphQLDocument<TData, TVariables> = string & {
  readonly __data?: TData;
  readonly __variables?: TVariables;
};

export type ResultOf<TDocument> = TDocument extends GraphQLDocument<infer TData, unknown> ? TData : never;
export type VariablesOf<TDocument> = TDocument extends GraphQLDocument<unknown, infer TVariables> ? TVariables : never;

export const DeleteViewerDataDocument = `
  mutation DeleteViewerData {
    deleteViewerData
  }
` as GraphQLDocument<DeleteViewerDataMutation, DeleteViewerDataMutationVariables>;

export const ViewerDocument = `
  query Viewer {
    viewer {
      user {
        id
        authSubject
        email
        createdAt
        updatedAt
        accountVerifiedAt
        verificationMethod
      }
      profile {
        handle
        firstName
        lastName
        phone
        zip
        householdSize
        profileImageUri
        createdAt
        updatedAt
      }
      preferences {
        weeklyBudget
        preferredFinanceTopics
        preferredResources
        wantsGovAssistance
        selectedBenefitPrograms
        locationPermissionStatus
        lastMealPlanDate
        notificationsEnabled
        expiringPantryNotificationsEnabled
        weeklyMealPlanNotificationsEnabled
        resourceReminderNotificationsEnabled
        createdAt
        updatedAt
      }
      onboardingState {
        hasCompletedOnboarding
        completedAt
        currentStep
        createdAt
        updatedAt
      }
      questionnaireAnswers {
        weeklyBudget
        financeTopics
        resources
        primaryGoal
        householdSize
        incomeBracket
        updatedAt
      }
      verification {
        verified
        verifiedAt
        method
      }
      consent {
        emailMarketingOptIn
      }
    }
  }
` as GraphQLDocument<ViewerQuery, ViewerQueryVariables>;

export const UpdateProfileDocument = `
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      handle
      firstName
      lastName
      phone
      zip
      householdSize
      profileImageUri
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<UpdateProfileMutation, UpdateProfileMutationVariables>;

export const UpdatePreferencesDocument = `
  mutation UpdatePreferences($input: UpdatePreferencesInput!) {
    updatePreferences(input: $input) {
      weeklyBudget
      preferredFinanceTopics
      preferredResources
      wantsGovAssistance
      selectedBenefitPrograms
      locationPermissionStatus
      lastMealPlanDate
      notificationsEnabled
      expiringPantryNotificationsEnabled
      weeklyMealPlanNotificationsEnabled
      resourceReminderNotificationsEnabled
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<UpdatePreferencesMutation, UpdatePreferencesMutationVariables>;

export const CompleteOnboardingDocument = `
  mutation CompleteOnboarding($input: CompleteOnboardingInput!) {
    completeOnboarding(input: $input) {
      user {
        id
        authSubject
        email
        createdAt
        updatedAt
        accountVerifiedAt
        verificationMethod
      }
      profile {
        handle
        firstName
        lastName
        phone
        zip
        householdSize
        profileImageUri
        createdAt
        updatedAt
      }
      preferences {
        weeklyBudget
        preferredFinanceTopics
        preferredResources
        wantsGovAssistance
        selectedBenefitPrograms
        locationPermissionStatus
        lastMealPlanDate
        notificationsEnabled
        expiringPantryNotificationsEnabled
        weeklyMealPlanNotificationsEnabled
        resourceReminderNotificationsEnabled
        createdAt
        updatedAt
      }
      onboardingState {
        hasCompletedOnboarding
        completedAt
        createdAt
        updatedAt
      }
    }
  }
` as GraphQLDocument<CompleteOnboardingMutation, CompleteOnboardingMutationVariables>;

export const RecordConsentDocument = `
  mutation RecordConsent($input: RecordConsentInput!) {
    recordConsent(input: $input)
  }
` as GraphQLDocument<RecordConsentMutation, RecordConsentMutationVariables>;

export const RequestVerificationCodeDocument = `
  mutation RequestVerificationCode($input: RequestVerificationCodeInput!) {
    requestVerificationCode(input: $input)
  }
` as GraphQLDocument<RequestVerificationCodeMutation, RequestVerificationCodeMutationVariables>;

export const RequestVerificationLinkDocument = `
  mutation RequestVerificationLink($purpose: VerificationPurpose!) {
    requestVerificationLink(purpose: $purpose)
  }
` as GraphQLDocument<RequestVerificationLinkMutation, RequestVerificationLinkMutationVariables>;

export const VerifyCodeDocument = `
  mutation VerifyCode($code: String!) {
    verifyCode(code: $code)
  }
` as GraphQLDocument<VerifyCodeMutation, VerifyCodeMutationVariables>;

export const SaveQuestionnaireDocument = `
  mutation SaveQuestionnaire($input: SaveQuestionnaireInput!) {
    saveQuestionnaire(input: $input) {
      weeklyBudget
      financeTopics
      resources
      primaryGoal
      householdSize
      incomeBracket
      updatedAt
    }
  }
` as GraphQLDocument<SaveQuestionnaireMutation, SaveQuestionnaireMutationVariables>;

export const SaveOnboardingStepDocument = `
  mutation SaveOnboardingStep($step: String!) {
    saveOnboardingStep(step: $step)
  }
` as GraphQLDocument<SaveOnboardingStepMutation, SaveOnboardingStepMutationVariables>;

export const UpdateCommunicationConsentsDocument = `
  mutation UpdateCommunicationConsents($input: UpdateCommunicationConsentsInput!) {
    updateCommunicationConsents(input: $input)
  }
` as GraphQLDocument<UpdateCommunicationConsentsMutation, UpdateCommunicationConsentsMutationVariables>;

export const SaveLocationFallbackDocument = `
  mutation SaveLocationFallback($zip: String!) {
    saveLocationFallback(zip: $zip)
  }
` as GraphQLDocument<SaveLocationFallbackMutation, SaveLocationFallbackMutationVariables>;

export const HandleAvailabilityDocument = `
  query HandleAvailability($handle: String!) {
    handleAvailability(handle: $handle) {
      handle
      available
      reason
      retryAfter
    }
  }
` as GraphQLDocument<HandleAvailabilityQuery, HandleAvailabilityQueryVariables>;

export const UpdateHandleDocument = `
  mutation UpdateHandle($handle: String!) {
    updateHandle(handle: $handle) {
      handle
      firstName
      lastName
      phone
      zip
      householdSize
      profileImageUri
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<UpdateHandleMutation, UpdateHandleMutationVariables>;

export const PantryItemsDocument = `
  query PantryItems($filter: PantryItemFilterInput) {
    pantryItems(filter: $filter) {
      id
      name
      quantity
      location
      expirationDate
      category
      status
      dateAdded
      dateUsed
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<PantryItemsQuery, PantryItemsQueryVariables>;

export const PantryWasteStatsDocument = `
  query PantryWasteStats {
    pantryWasteStats {
      totalAdded
      totalUsed
      totalExpired
      estimatedWasteValue
      mostWastedCategories
    }
  }
` as GraphQLDocument<PantryWasteStatsQuery, PantryWasteStatsQueryVariables>;

export const AddPantryItemDocument = `
  mutation AddPantryItem($input: AddPantryItemInput!) {
    addPantryItem(input: $input) {
      id
      name
      quantity
      location
      expirationDate
      category
      status
      dateAdded
      dateUsed
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<AddPantryItemMutation, AddPantryItemMutationVariables>;

export const UpdatePantryItemDocument = `
  mutation UpdatePantryItem($id: ID!, $input: UpdatePantryItemInput!) {
    updatePantryItem(id: $id, input: $input) {
      id
      name
      quantity
      location
      expirationDate
      category
      status
      dateAdded
      dateUsed
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<UpdatePantryItemMutation, UpdatePantryItemMutationVariables>;

export const MarkPantryItemUsedDocument = `
  mutation MarkPantryItemUsed($id: ID!) {
    markPantryItemUsed(id: $id) {
      id
      name
      quantity
      location
      expirationDate
      category
      status
      dateAdded
      dateUsed
      createdAt
      updatedAt
    }
  }
` as GraphQLDocument<MarkPantryItemUsedMutation, MarkPantryItemUsedMutationVariables>;

export const DeletePantryItemDocument = `
  mutation DeletePantryItem($id: ID!) {
    deletePantryItem(id: $id)
  }
` as GraphQLDocument<DeletePantryItemMutation, DeletePantryItemMutationVariables>;

export const RegisterPushTokenDocument = `
  mutation RegisterPushToken($input: RegisterPushTokenInput!) {
    registerPushToken(input: $input) {
      id
      token
      platform
      deviceId
      createdAt
      updatedAt
      lastSeenAt
    }
  }
` as GraphQLDocument<RegisterPushTokenMutation, RegisterPushTokenMutationVariables>;

export const DeletePushTokenDocument = `
  mutation DeletePushToken($token: String!) {
    deletePushToken(token: $token)
  }
` as GraphQLDocument<DeletePushTokenMutation, DeletePushTokenMutationVariables>;
