import type {
  AddPantryItemMutation,
  AddPantryItemMutationVariables,
  CompleteOnboardingMutation,
  CompleteOnboardingMutationVariables,
  DeleteViewerDataMutation,
  DeleteViewerDataMutationVariables,
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
