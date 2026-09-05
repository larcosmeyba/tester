export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type AddPantryItemInput = {
  category: Scalars['String']['input'];
  expirationDate: Scalars['String']['input'];
  location: StorageLocation;
  name: Scalars['String']['input'];
  quantity: Scalars['String']['input'];
};

export type AppPreferences = {
  __typename?: 'AppPreferences';
  createdAt: Scalars['String']['output'];
  expiringPantryNotificationsEnabled: Scalars['Boolean']['output'];
  lastMealPlanDate?: Maybe<Scalars['String']['output']>;
  notificationsEnabled: Scalars['Boolean']['output'];
  preferredFinanceTopics: Array<Scalars['String']['output']>;
  preferredResources: Array<Scalars['String']['output']>;
  resourceReminderNotificationsEnabled: Scalars['Boolean']['output'];
  updatedAt: Scalars['String']['output'];
  wantsGovAssistance: Scalars['Boolean']['output'];
  weeklyBudget: Scalars['String']['output'];
  weeklyMealPlanNotificationsEnabled: Scalars['Boolean']['output'];
};

export type CompleteOnboardingInput = {
  preferences?: InputMaybe<UpdatePreferencesInput>;
  profile?: InputMaybe<UpdateProfileInput>;
};

export type HandleAvailability = {
  __typename?: 'HandleAvailability';
  available: Scalars['Boolean']['output'];
  handle: Scalars['String']['output'];
  reason: HandleAvailabilityReason;
  retryAfter?: Maybe<Scalars['String']['output']>;
};

export type HandleAvailabilityReason =
  | 'AVAILABLE'
  | 'COOLDOWN'
  | 'CURRENT'
  | 'INVALID_FORMAT'
  | 'RESERVED'
  | 'UNAVAILABLE';

export type ItemStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'USED';

export type Mutation = {
  __typename?: 'Mutation';
  addPantryItem: PantryItem;
  completeOnboarding: Viewer;
  deletePantryItem: Scalars['Boolean']['output'];
  deletePushToken: Scalars['Boolean']['output'];
  deleteViewerData: Scalars['Boolean']['output'];
  markPantryItemUsed: PantryItem;
  registerPushToken: PushToken;
  updateHandle: Profile;
  updatePantryItem: PantryItem;
  updatePreferences: AppPreferences;
  updateProfile: Profile;
};


export type MutationAddPantryItemArgs = {
  input: AddPantryItemInput;
};


export type MutationCompleteOnboardingArgs = {
  input: CompleteOnboardingInput;
};


export type MutationDeletePantryItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePushTokenArgs = {
  token: Scalars['String']['input'];
};


export type MutationMarkPantryItemUsedArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRegisterPushTokenArgs = {
  input: RegisterPushTokenInput;
};


export type MutationUpdateHandleArgs = {
  handle: Scalars['String']['input'];
};


export type MutationUpdatePantryItemArgs = {
  id: Scalars['ID']['input'];
  input: UpdatePantryItemInput;
};


export type MutationUpdatePreferencesArgs = {
  input: UpdatePreferencesInput;
};


export type MutationUpdateProfileArgs = {
  input: UpdateProfileInput;
};

export type OnboardingState = {
  __typename?: 'OnboardingState';
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  hasCompletedOnboarding: Scalars['Boolean']['output'];
  updatedAt: Scalars['String']['output'];
};

export type PantryItem = {
  __typename?: 'PantryItem';
  category: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  dateAdded: Scalars['String']['output'];
  dateUsed?: Maybe<Scalars['String']['output']>;
  expirationDate: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  location: StorageLocation;
  name: Scalars['String']['output'];
  quantity: Scalars['String']['output'];
  status: ItemStatus;
  updatedAt: Scalars['String']['output'];
};

export type PantryItemFilterInput = {
  location?: InputMaybe<StorageLocation>;
  status?: InputMaybe<ItemStatus>;
};

export type Profile = {
  __typename?: 'Profile';
  createdAt: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  handle?: Maybe<Scalars['String']['output']>;
  householdSize: Scalars['Int']['output'];
  lastName: Scalars['String']['output'];
  phone: Scalars['String']['output'];
  profileImageUri?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  zip: Scalars['String']['output'];
};

export type PushPlatform =
  | 'ANDROID'
  | 'IOS'
  | 'WEB';

export type PushToken = {
  __typename?: 'PushToken';
  createdAt: Scalars['String']['output'];
  deviceId?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastSeenAt: Scalars['String']['output'];
  platform: PushPlatform;
  token: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  handleAvailability: HandleAvailability;
  pantryItems: Array<PantryItem>;
  pantryWasteStats: WasteStats;
  viewer: Viewer;
};


export type QueryHandleAvailabilityArgs = {
  handle: Scalars['String']['input'];
};


export type QueryPantryItemsArgs = {
  filter?: InputMaybe<PantryItemFilterInput>;
};

export type RegisterPushTokenInput = {
  deviceId?: InputMaybe<Scalars['String']['input']>;
  platform: PushPlatform;
  token: Scalars['String']['input'];
};

export type StorageLocation =
  | 'FREEZER'
  | 'PANTRY'
  | 'REFRIGERATOR';

export type UpdatePantryItemInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  expirationDate?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<StorageLocation>;
  name?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ItemStatus>;
};

export type UpdatePreferencesInput = {
  expiringPantryNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  lastMealPlanDate?: InputMaybe<Scalars['String']['input']>;
  notificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  preferredFinanceTopics?: InputMaybe<Array<Scalars['String']['input']>>;
  preferredResources?: InputMaybe<Array<Scalars['String']['input']>>;
  resourceReminderNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  wantsGovAssistance?: InputMaybe<Scalars['Boolean']['input']>;
  weeklyBudget?: InputMaybe<Scalars['String']['input']>;
  weeklyMealPlanNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateProfileInput = {
  firstName?: InputMaybe<Scalars['String']['input']>;
  householdSize?: InputMaybe<Scalars['Int']['input']>;
  lastName?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  profileImageUri?: InputMaybe<Scalars['String']['input']>;
  zip?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  authSubject: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  updatedAt: Scalars['String']['output'];
};

export type Viewer = {
  __typename?: 'Viewer';
  onboardingState: OnboardingState;
  preferences: AppPreferences;
  profile: Profile;
  user: User;
};

export type WasteStats = {
  __typename?: 'WasteStats';
  estimatedWasteValue: Scalars['Float']['output'];
  mostWastedCategories: Array<Scalars['String']['output']>;
  totalAdded: Scalars['Int']['output'];
  totalExpired: Scalars['Int']['output'];
  totalUsed: Scalars['Int']['output'];
};

export type DeleteViewerDataMutationVariables = Exact<{ [key: string]: never; }>;


export type DeleteViewerDataMutation = { __typename?: 'Mutation', deleteViewerData: boolean };

export type PantryItemsQueryVariables = Exact<{
  filter?: InputMaybe<PantryItemFilterInput>;
}>;


export type PantryItemsQuery = { __typename?: 'Query', pantryItems: Array<{ __typename?: 'PantryItem', id: string, name: string, quantity: string, location: StorageLocation, expirationDate: string, category: string, status: ItemStatus, dateAdded: string, dateUsed?: string | null, createdAt: string, updatedAt: string }> };

export type PantryWasteStatsQueryVariables = Exact<{ [key: string]: never; }>;


export type PantryWasteStatsQuery = { __typename?: 'Query', pantryWasteStats: { __typename?: 'WasteStats', totalAdded: number, totalUsed: number, totalExpired: number, estimatedWasteValue: number, mostWastedCategories: Array<string> } };

export type AddPantryItemMutationVariables = Exact<{
  input: AddPantryItemInput;
}>;


export type AddPantryItemMutation = { __typename?: 'Mutation', addPantryItem: { __typename?: 'PantryItem', id: string, name: string, quantity: string, location: StorageLocation, expirationDate: string, category: string, status: ItemStatus, dateAdded: string, dateUsed?: string | null, createdAt: string, updatedAt: string } };

export type UpdatePantryItemMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdatePantryItemInput;
}>;


export type UpdatePantryItemMutation = { __typename?: 'Mutation', updatePantryItem: { __typename?: 'PantryItem', id: string, name: string, quantity: string, location: StorageLocation, expirationDate: string, category: string, status: ItemStatus, dateAdded: string, dateUsed?: string | null, createdAt: string, updatedAt: string } };

export type MarkPantryItemUsedMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type MarkPantryItemUsedMutation = { __typename?: 'Mutation', markPantryItemUsed: { __typename?: 'PantryItem', id: string, name: string, quantity: string, location: StorageLocation, expirationDate: string, category: string, status: ItemStatus, dateAdded: string, dateUsed?: string | null, createdAt: string, updatedAt: string } };

export type DeletePantryItemMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeletePantryItemMutation = { __typename?: 'Mutation', deletePantryItem: boolean };

export type RegisterPushTokenMutationVariables = Exact<{
  input: RegisterPushTokenInput;
}>;


export type RegisterPushTokenMutation = { __typename?: 'Mutation', registerPushToken: { __typename?: 'PushToken', id: string, token: string, platform: PushPlatform, deviceId?: string | null, createdAt: string, updatedAt: string, lastSeenAt: string } };

export type DeletePushTokenMutationVariables = Exact<{
  token: Scalars['String']['input'];
}>;


export type DeletePushTokenMutation = { __typename?: 'Mutation', deletePushToken: boolean };

export type ViewerQueryVariables = Exact<{ [key: string]: never; }>;


export type ViewerQuery = { __typename?: 'Query', viewer: { __typename?: 'Viewer', user: { __typename?: 'User', id: string, authSubject: string, email?: string | null, createdAt: string, updatedAt: string }, profile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string }, preferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string }, onboardingState: { __typename?: 'OnboardingState', hasCompletedOnboarding: boolean, completedAt?: string | null, createdAt: string, updatedAt: string } } };

export type UpdateProfileMutationVariables = Exact<{
  input: UpdateProfileInput;
}>;


export type UpdateProfileMutation = { __typename?: 'Mutation', updateProfile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string } };

export type UpdatePreferencesMutationVariables = Exact<{
  input: UpdatePreferencesInput;
}>;


export type UpdatePreferencesMutation = { __typename?: 'Mutation', updatePreferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string } };

export type CompleteOnboardingMutationVariables = Exact<{
  input: CompleteOnboardingInput;
}>;


export type CompleteOnboardingMutation = { __typename?: 'Mutation', completeOnboarding: { __typename?: 'Viewer', user: { __typename?: 'User', id: string, authSubject: string, email?: string | null, createdAt: string, updatedAt: string }, profile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string }, preferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string }, onboardingState: { __typename?: 'OnboardingState', hasCompletedOnboarding: boolean, completedAt?: string | null, createdAt: string, updatedAt: string } } };

export type HandleAvailabilityQueryVariables = Exact<{
  handle: Scalars['String']['input'];
}>;


export type HandleAvailabilityQuery = { __typename?: 'Query', handleAvailability: { __typename?: 'HandleAvailability', handle: string, available: boolean, reason: HandleAvailabilityReason, retryAfter?: string | null } };

export type UpdateHandleMutationVariables = Exact<{
  handle: Scalars['String']['input'];
}>;


export type UpdateHandleMutation = { __typename?: 'Mutation', updateHandle: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string } };
