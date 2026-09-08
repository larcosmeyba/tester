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
  /** An arbitrary JSON object. Used only for the cost tier mix. */
  Map: { input: any; output: any; }
};

export type AddPantryItemInput = {
  category: Scalars['String']['input'];
  expirationDate: Scalars['String']['input'];
  location: StorageLocation;
  name: Scalars['String']['input'];
  quantity: Scalars['String']['input'];
};

export type Allergen =
  | 'egg'
  | 'fish'
  | 'milk'
  | 'peanut'
  | 'sesame'
  | 'shellfish'
  | 'soy'
  | 'tree_nut'
  | 'wheat';

/** Allergies are always required; the server rejects any other strength. */
export type AllergyRequirement = {
  __typename?: 'AllergyRequirement';
  allergen: Allergen;
  strength: Strength;
};

/** Allergies are always required; the server rejects any other strength. */
export type AllergyRequirementInput = {
  allergen: Allergen;
  strength: Strength;
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

export type BalancedMealBaseline = {
  __typename?: 'BalancedMealBaseline';
  applied: Scalars['Boolean']['output'];
  avgScore?: Maybe<Scalars['Float']['output']>;
};

export type BudgetInput = {
  amount: Scalars['Float']['input'];
  currency: Scalars['String']['input'];
  mode: BudgetMode;
};

export type BudgetMode =
  | 'balanced'
  | 'lowest'
  | 'variety';

export type CompleteOnboardingInput = {
  preferences?: InputMaybe<UpdatePreferencesInput>;
  profile?: InputMaybe<UpdateProfileInput>;
};

export type CookingStyle =
  | 'family_friendly'
  | 'few_ingredients'
  | 'freezer_friendly'
  | 'kid_friendly'
  | 'lowest_cost'
  | 'meal_prep'
  | 'one_pot'
  | 'quick_easy'
  | 'use_what_i_have'
  | 'variety';

export type CookingTimeInput = {
  maxMinutes?: InputMaybe<Scalars['Int']['input']>;
  strength: Strength;
};

/** A required limit excludes a recipe; a preferred one only ranks it. */
export type CookingTimeLimit = {
  __typename?: 'CookingTimeLimit';
  maxMinutes?: Maybe<Scalars['Int']['output']>;
  strength: Strength;
};

/**
 * An estimated cost is always a range with a confidence, never fake precision.
 * Budget compliance is checked against `high`.
 */
export type CostRange = {
  __typename?: 'CostRange';
  basis?: Maybe<Scalars['String']['output']>;
  confidence: DataConfidence;
  high: Scalars['Float']['output'];
  low: Scalars['Float']['output'];
  point: Scalars['Float']['output'];
  /** Share of the basket priced at each tier, e.g. {"1": 0.4, "3": 0.6}. */
  tierMix?: Maybe<Scalars['Map']['output']>;
};

export type DataConfidence =
  | 'high'
  | 'low'
  | 'medium';

export type Diet =
  | 'dairy_free'
  | 'egg_free'
  | 'gluten_free'
  | 'nut_free'
  | 'pescatarian'
  | 'vegan'
  | 'vegetarian';

export type DietRequirement = {
  __typename?: 'DietRequirement';
  diet: Diet;
  strength: Strength;
};

export type DietRequirementInput = {
  diet: Diet;
  strength: Strength;
};

export type Equipment =
  | 'air_fryer'
  | 'blender'
  | 'grill'
  | 'instant_pot'
  | 'microwave'
  | 'oven'
  | 'slow_cooker'
  | 'stovetop';

export type FoodPreferences = {
  __typename?: 'FoodPreferences';
  cuisines: Array<Scalars['String']['output']>;
  freeText?: Maybe<Scalars['String']['output']>;
  ingredients: Array<Scalars['String']['output']>;
};

export type FoodPreferencesInput = {
  cuisines: Array<Scalars['String']['input']>;
  freeText?: InputMaybe<Scalars['String']['input']>;
  ingredients: Array<Scalars['String']['input']>;
};

export type GroceryBudget = {
  __typename?: 'GroceryBudget';
  /** 0 means no budget was set. It is never a claim that a household has nothing. */
  amount: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  mode: BudgetMode;
};

/**
 * A consolidated grocery line. Items already in the pantry are kept with
 * `inPantry: true` and zero cost rather than hidden, so nothing goes missing.
 */
export type GroceryItem = {
  __typename?: 'GroceryItem';
  displayName: Scalars['String']['output'];
  estimatedPrice: Scalars['Float']['output'];
  inPantry: Scalars['Boolean']['output'];
  ingredientId: Scalars['ID']['output'];
  isChecked: Scalars['Boolean']['output'];
  neededQty: Scalars['Float']['output'];
  packageLabel?: Maybe<Scalars['String']['output']>;
  /** null for loose items sold by weight. */
  packages?: Maybe<Scalars['Int']['output']>;
  priceTier?: Maybe<Scalars['Int']['output']>;
  unit: Scalars['String']['output'];
  /** Titles of the recipes this line is for. */
  usedBy: Array<Scalars['String']['output']>;
};

export type GroceryListFromRecipesInput = {
  householdSize: Scalars['Int']['input'];
  pantryItems: Array<Scalars['ID']['input']>;
  recipeIds: Array<Scalars['ID']['input']>;
};

export type GroceryListPayload = {
  __typename?: 'GroceryListPayload';
  cost: CostRange;
  planId?: Maybe<Scalars['ID']['output']>;
  sections: Array<GrocerySection>;
};

export type GrocerySection = {
  __typename?: 'GrocerySection';
  aisle: Scalars['String']['output'];
  items: Array<GroceryItem>;
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

export type Household = {
  __typename?: 'Household';
  adults?: Maybe<Scalars['Int']['output']>;
  children?: Maybe<Scalars['Int']['output']>;
  size: Scalars['Int']['output'];
  /** True when the user picked 8+; size is stored as 8. */
  sizeIsPlus: Scalars['Boolean']['output'];
};

export type HouseholdInput = {
  adults?: InputMaybe<Scalars['Int']['input']>;
  children?: InputMaybe<Scalars['Int']['input']>;
  size: Scalars['Int']['input'];
  /** True when the user picked 8+; size is stored as 8. */
  sizeIsPlus: Scalars['Boolean']['input'];
};

export type Ingredient = {
  __typename?: 'Ingredient';
  aisle: Scalars['String']['output'];
  allergens: Array<Allergen>;
  /** salt, pepper and water only: never added to a grocery list. */
  assumedOnHand: Scalars['Boolean']['output'];
  displayName: Scalars['String']['output'];
  foodGroup: Scalars['String']['output'];
  ingredientId: Scalars['ID']['output'];
  isPantryStaple: Scalars['Boolean']['output'];
  priceReferenceUnit: Scalars['String']['output'];
};

/**
 * One ingredient line of a recipe. `quantity` is null when the source never
 * stated one — it is never invented, and `missingInformation` says so instead.
 */
export type IngredientLine = {
  __typename?: 'IngredientLine';
  displayName?: Maybe<Scalars['String']['output']>;
  grams?: Maybe<Scalars['Float']['output']>;
  ingredientId?: Maybe<Scalars['ID']['output']>;
  isOptional: Scalars['Boolean']['output'];
  isToTaste: Scalars['Boolean']['output'];
  missingInformation?: Maybe<Scalars['String']['output']>;
  position: Scalars['Int']['output'];
  preparation?: Maybe<Scalars['String']['output']>;
  quantity?: Maybe<Scalars['Float']['output']>;
  rawText: Scalars['String']['output'];
  unit?: Maybe<Scalars['String']['output']>;
};

export type InstructionStep = {
  __typename?: 'InstructionStep';
  minutes?: Maybe<Scalars['Int']['output']>;
  step: Scalars['Int']['output'];
  text: Scalars['String']['output'];
};

export type ItemStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'USED';

export type LeftoversPreference =
  | 'no'
  | 'sometimes'
  | 'yes';

/** How many of each category to plan across the whole week, not per day. */
export type MealCounts = {
  __typename?: 'MealCounts';
  breakfast: Scalars['Int']['output'];
  dinner: Scalars['Int']['output'];
  lunch: Scalars['Int']['output'];
  snack: Scalars['Int']['output'];
};

export type MealCountsInput = {
  breakfast: Scalars['Int']['input'];
  dinner: Scalars['Int']['input'];
  lunch: Scalars['Int']['input'];
  snack: Scalars['Int']['input'];
};

export type MealPlan = {
  __typename?: 'MealPlan';
  assumptions: Array<Scalars['String']['output']>;
  groceryList: Array<GrocerySection>;
  meals: Array<PlannedMeal>;
  /** AI-written text. Never a source of numbers. */
  pennyMessage: Scalars['String']['output'];
  planId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  summary: PlanSummary;
  swapOptions: Array<SwapAction>;
};

export type MealPreferences = {
  __typename?: 'MealPreferences';
  allergies: Array<AllergyRequirement>;
  /** Other allergies, as canonical ingredient ids. */
  allergyIngredientIds: Array<Scalars['ID']['output']>;
  budget: GroceryBudget;
  cookingStyle: Array<CookingStyle>;
  cookingTime: CookingTimeLimit;
  days: Scalars['Int']['output'];
  dietaryOtherText?: Maybe<Scalars['String']['output']>;
  dietaryRequirements: Array<DietRequirement>;
  dislikes: FoodPreferences;
  equipment: Array<Equipment>;
  /** Recipes the viewer has rejected, so a regeneration does not bring them back. */
  excludeRecipeIds: Array<Scalars['ID']['output']>;
  household: Household;
  leftovers: LeftoversPreference;
  likes: FoodPreferences;
  meals: MealCounts;
  nutritionPreferences: Array<NutritionPreference>;
  planScope: Scalars['String']['output'];
  questionnaireVersion: Scalars['String']['output'];
};

export type MealSlot = {
  __typename?: 'MealSlot';
  day: Scalars['Int']['output'];
  mealType: MealType;
};

export type MealSlotInput = {
  day: Scalars['Int']['input'];
  mealType: MealType;
};

export type MealType =
  | 'breakfast'
  | 'dessert'
  | 'dinner'
  | 'lunch'
  | 'side'
  | 'snack';

export type MoveMealInput = {
  from: MealSlotInput;
  to: MealSlotInput;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Turns the plan into a saved, consolidated, pantry-aware grocery list. */
  acceptMealPlan: GroceryListPayload;
  addPantryItem: PantryItem;
  completeOnboarding: Viewer;
  deleteMealPlan: Scalars['Boolean']['output'];
  /** Forgets the saved questionnaire. Plans already generated are unaffected. */
  deleteMealPreferences: Scalars['Boolean']['output'];
  deletePantryItem: Scalars['Boolean']['output'];
  deletePushToken: Scalars['Boolean']['output'];
  deleteViewerData: Scalars['Boolean']['output'];
  /**
   * Generates and saves a week.
   *
   * `input` is the questionnaire. Omit it to plan from the preferences the viewer
   * saved last time; supply it to plan from a fresh answer set, which is also
   * saved. Either way the viewer's pantry is read on the server and credited
   * before anything reaches the grocery list — it is never sent by the client.
   */
  generateMealPlan: MealPlan;
  /** Choose My Recipes: selected recipes to a consolidated list, nothing saved. */
  groceryListFromRecipes: GroceryListPayload;
  /**
   * Links a pantry item to the ingredient catalogue, so the meal generator can
   * credit it. Pass a null ingredientId to unlink.
   */
  linkPantryItemIngredient: Scalars['Boolean']['output'];
  markPantryItemUsed: PantryItem;
  /** Moves a meal between slots. Never regenerates the week and never re-prices. */
  movePlannedMeal: MealPlan;
  registerPushToken: PushToken;
  /** Saves the questionnaire without generating a plan. */
  saveMealPreferences: MealPreferences;
  saveRecipe: Scalars['Boolean']['output'];
  setGroceryItemChecked: Scalars['Boolean']['output'];
  /** Replaces one slot's recipe. keepBasket avoids re-pricing the whole week. */
  swapPlannedMeal: MealPlan;
  unsaveRecipe: Scalars['Boolean']['output'];
  updateHandle: Profile;
  updatePantryItem: PantryItem;
  updatePreferences: AppPreferences;
  updateProfile: Profile;
};


export type MutationAcceptMealPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type MutationAddPantryItemArgs = {
  input: AddPantryItemInput;
};


export type MutationCompleteOnboardingArgs = {
  input: CompleteOnboardingInput;
};


export type MutationDeleteMealPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type MutationDeletePantryItemArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeletePushTokenArgs = {
  token: Scalars['String']['input'];
};


export type MutationGenerateMealPlanArgs = {
  input?: InputMaybe<PlanRequestInput>;
};


export type MutationGroceryListFromRecipesArgs = {
  input: GroceryListFromRecipesInput;
};


export type MutationLinkPantryItemIngredientArgs = {
  id: Scalars['ID']['input'];
  ingredientId?: InputMaybe<Scalars['ID']['input']>;
};


export type MutationMarkPantryItemUsedArgs = {
  id: Scalars['ID']['input'];
};


export type MutationMovePlannedMealArgs = {
  input: MoveMealInput;
  planId: Scalars['ID']['input'];
};


export type MutationRegisterPushTokenArgs = {
  input: RegisterPushTokenInput;
};


export type MutationSaveMealPreferencesArgs = {
  input: PlanRequestInput;
};


export type MutationSaveRecipeArgs = {
  recipeId: Scalars['ID']['input'];
};


export type MutationSetGroceryItemCheckedArgs = {
  checked: Scalars['Boolean']['input'];
  ingredientId: Scalars['ID']['input'];
  planId: Scalars['ID']['input'];
};


export type MutationSwapPlannedMealArgs = {
  input: SwapMealInput;
  planId: Scalars['ID']['input'];
};


export type MutationUnsaveRecipeArgs = {
  recipeId: Scalars['ID']['input'];
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

export type NutritionGoal =
  | 'balanced'
  | 'high_fiber'
  | 'high_protein'
  | 'lower_calorie'
  | 'lower_sodium'
  | 'more_produce';

export type NutritionGoalSummary = {
  __typename?: 'NutritionGoalSummary';
  avgProteinG?: Maybe<Scalars['Float']['output']>;
  goal: Scalars['String']['output'];
  metBy: Scalars['Int']['output'];
  of: Scalars['Int']['output'];
};

/** Per-serving nutrition. Null where the source never stated it. */
export type NutritionInfo = {
  __typename?: 'NutritionInfo';
  basis: Scalars['String']['output'];
  caloriesKcal?: Maybe<Scalars['Float']['output']>;
  carbsG?: Maybe<Scalars['Float']['output']>;
  confidence?: Maybe<DataConfidence>;
  coveragePct?: Maybe<Scalars['Float']['output']>;
  fatG?: Maybe<Scalars['Float']['output']>;
  fiberG?: Maybe<Scalars['Float']['output']>;
  perServing: Scalars['Boolean']['output'];
  proteinG?: Maybe<Scalars['Float']['output']>;
  sodiumMg?: Maybe<Scalars['Float']['output']>;
};

export type NutritionPreference = {
  __typename?: 'NutritionPreference';
  goal: NutritionGoal;
  strength: Strength;
};

export type NutritionPreferenceInput = {
  goal: NutritionGoal;
  strength: Strength;
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
  /**
   * The canonical catalogue row this item was matched to, or null when the
   * catalogue could not resolve it. Only a resolved item is credited against a
   * meal plan; an unresolved one stays in the pantry as text and is still bought,
   * because a wrong match drops something from a grocery list and the user finds
   * out at the shop.
   */
  ingredientId?: Maybe<Scalars['ID']['output']>;
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

export type PlanRequestInput = {
  allergies: Array<AllergyRequirementInput>;
  /** Other allergies, resolved to ingredient ids before submit. */
  allergyIngredients: Array<Scalars['ID']['input']>;
  budget: BudgetInput;
  cookingStyle: Array<CookingStyle>;
  cookingTime: CookingTimeInput;
  days: Scalars['Int']['input'];
  dietaryOtherText?: InputMaybe<Scalars['String']['input']>;
  dietaryRequirements: Array<DietRequirementInput>;
  dislikes: FoodPreferencesInput;
  equipment: Array<Equipment>;
  excludeRecipeIds: Array<Scalars['ID']['input']>;
  household: HouseholdInput;
  leftovers: LeftoversPreference;
  likes: FoodPreferencesInput;
  meals: MealCountsInput;
  nutritionPreferences: Array<NutritionPreferenceInput>;
  /** Canonical ingredient ids, not free text. */
  pantryItems: Array<Scalars['ID']['input']>;
  planScope?: InputMaybe<Scalars['String']['input']>;
  questionnaireVersion: Scalars['String']['input'];
  seed?: InputMaybe<Scalars['Int']['input']>;
};

export type PlanSummary = {
  __typename?: 'PlanSummary';
  balancedMealBaseline?: Maybe<BalancedMealBaseline>;
  budget?: Maybe<Scalars['Float']['output']>;
  consumedCostTotal?: Maybe<Scalars['Float']['output']>;
  estimatedCost: CostRange;
  /** budget minus estimatedCost.high; null when no budget was set. */
  headroom?: Maybe<Scalars['Float']['output']>;
  householdSize: Scalars['Int']['output'];
  mealsPlanned: Scalars['Int']['output'];
  nutritionGoal?: Maybe<NutritionGoalSummary>;
  pantryItemsUsed: Array<Scalars['ID']['output']>;
  pantryValueUsed?: Maybe<Scalars['Float']['output']>;
};

export type PlannedMeal = {
  __typename?: 'PlannedMeal';
  consumedCost?: Maybe<Scalars['Float']['output']>;
  goalIndicator?: Maybe<Scalars['String']['output']>;
  incrementalCheckoutCost?: Maybe<Scalars['Float']['output']>;
  pantryIngredientsUsed: Array<Scalars['ID']['output']>;
  proteinGPerServing?: Maybe<Scalars['Float']['output']>;
  recipeId: Scalars['ID']['output'];
  scaleFactor: Scalars['Float']['output'];
  servingsPlanned: Scalars['Float']['output'];
  slot: MealSlot;
  title: Scalars['String']['output'];
  totalTimeMinutes?: Maybe<Scalars['Int']['output']>;
  /** Penny's one-line explanation, written by the server from computed facts. */
  why?: Maybe<Scalars['String']['output']>;
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
  /** The plan the viewer is currently on, or null when they have none yet. */
  currentMealPlan?: Maybe<MealPlan>;
  /** The saved grocery list for a plan, or null before the plan is accepted. */
  groceryList?: Maybe<GroceryListPayload>;
  handleAvailability: HandleAvailability;
  /** Canonical ingredient catalogue, used by the pantry and allergy pickers. */
  ingredients: Array<Ingredient>;
  mealPlan?: Maybe<MealPlan>;
  /**
   * The viewer's saved questionnaire, or null when they have never answered it.
   * Never answering it is a normal state, not an error.
   */
  mealPreferences?: Maybe<MealPreferences>;
  pantryItems: Array<PantryItem>;
  pantryWasteStats: WasteStats;
  recipe?: Maybe<Recipe>;
  /** The public recipe library plus the viewer's own recipes. */
  recipes: Array<Recipe>;
  savedRecipes: Array<Recipe>;
  viewer: Viewer;
};


export type QueryGroceryListArgs = {
  planId: Scalars['ID']['input'];
};


export type QueryHandleAvailabilityArgs = {
  handle: Scalars['String']['input'];
};


export type QueryIngredientsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMealPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type QueryPantryItemsArgs = {
  filter?: InputMaybe<PantryItemFilterInput>;
};


export type QueryRecipeArgs = {
  recipeId: Scalars['ID']['input'];
};


export type QueryRecipesArgs = {
  query?: InputMaybe<RecipeQueryInput>;
};

/**
 * The Standard HTH Recipe Object. One format for library, AI-generated, imported
 * and hand-entered recipes; `sourceType` is a field, not a second type.
 */
export type Recipe = {
  __typename?: 'Recipe';
  attributionText?: Maybe<Scalars['String']['output']>;
  /** Computed server-side. Incomplete recipes stay viewable but are never planned. */
  baseMealPlanEligible: Scalars['Boolean']['output'];
  cookTimeMinutes?: Maybe<Scalars['Int']['output']>;
  cuisine?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  difficulty?: Maybe<Scalars['Int']['output']>;
  equipmentRequired: Array<Equipment>;
  ingredients: Array<IngredientLine>;
  instructions: Array<InstructionStep>;
  isComponent: Scalars['Boolean']['output'];
  licenseId?: Maybe<Scalars['String']['output']>;
  mealTypes: Array<MealType>;
  missingInformation: Array<Scalars['String']['output']>;
  nutrition?: Maybe<NutritionInfo>;
  /** null for a public library recipe. */
  ownerUserId?: Maybe<Scalars['ID']['output']>;
  prepTimeMinutes?: Maybe<Scalars['Int']['output']>;
  recipeId: Scalars['ID']['output'];
  reviewStatus: Scalars['String']['output'];
  scalable: Scalars['Boolean']['output'];
  servingSizeText?: Maybe<Scalars['String']['output']>;
  servings?: Maybe<Scalars['Float']['output']>;
  servingsConfidence: ValueConfidence;
  sourceName?: Maybe<Scalars['String']['output']>;
  sourceType: Scalars['String']['output'];
  sourceUrl?: Maybe<Scalars['String']['output']>;
  tags: Array<Scalars['String']['output']>;
  timeConfidence: ValueConfidence;
  title: Scalars['String']['output'];
  totalTimeMinutes?: Maybe<Scalars['Int']['output']>;
  visibility: Scalars['String']['output'];
};

export type RecipeQueryInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  mealType?: InputMaybe<MealType>;
  search?: InputMaybe<Scalars['String']['input']>;
  /** Taxonomy ids: OR within a family, AND across families. */
  tagIds?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type Strength =
  | 'preferred'
  | 'required';

export type SwapAction =
  | 'cheaper'
  | 'dislike'
  | 'faster'
  | 'higher_protein'
  | 'regenerate_week'
  | 'swap_slot';

export type SwapMealInput = {
  action: SwapAction;
  keepBasket?: InputMaybe<Scalars['Boolean']['input']>;
  slot: MealSlotInput;
};

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

/** How a single recipe value was established. `missing` is never guessed away. */
export type ValueConfidence =
  | 'human'
  | 'inferred'
  | 'missing'
  | 'source';

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

export type CostRangeFieldsFragment = { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null };

export type GrocerySectionFieldsFragment = { __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> };

export type MealPlanFieldsFragment = { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> };

export type RecipeFieldsFragment = { __typename?: 'Recipe', recipeId: string, ownerUserId?: string | null, title: string, description?: string | null, sourceType: string, sourceUrl?: string | null, sourceName?: string | null, licenseId?: string | null, attributionText?: string | null, visibility: string, reviewStatus: string, servings?: number | null, servingsConfidence: ValueConfidence, servingSizeText?: string | null, scalable: boolean, prepTimeMinutes?: number | null, cookTimeMinutes?: number | null, totalTimeMinutes?: number | null, timeConfidence: ValueConfidence, mealTypes: Array<MealType>, cuisine?: string | null, difficulty?: number | null, equipmentRequired: Array<Equipment>, isComponent: boolean, tags: Array<string>, baseMealPlanEligible: boolean, missingInformation: Array<string>, ingredients: Array<{ __typename?: 'IngredientLine', position: number, rawText: string, ingredientId?: string | null, displayName?: string | null, quantity?: number | null, unit?: string | null, preparation?: string | null, grams?: number | null, isOptional: boolean, isToTaste: boolean, missingInformation?: string | null }>, instructions: Array<{ __typename?: 'InstructionStep', step: number, text: string, minutes?: number | null }>, nutrition?: { __typename?: 'NutritionInfo', basis: string, perServing: boolean, caloriesKcal?: number | null, proteinG?: number | null, carbsG?: number | null, fatG?: number | null, fiberG?: number | null, sodiumMg?: number | null, coveragePct?: number | null, confidence?: DataConfidence | null } | null };

export type GroceryListPayloadFieldsFragment = { __typename?: 'GroceryListPayload', planId?: string | null, sections: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }>, cost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null } };

export type CurrentMealPlanQueryVariables = Exact<{ [key: string]: never; }>;


export type CurrentMealPlanQuery = { __typename?: 'Query', currentMealPlan?: { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> } | null };

export type MealPlanQueryVariables = Exact<{
  planId: Scalars['ID']['input'];
}>;


export type MealPlanQuery = { __typename?: 'Query', mealPlan?: { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> } | null };

export type RecipesQueryVariables = Exact<{
  query?: InputMaybe<RecipeQueryInput>;
}>;


export type RecipesQuery = { __typename?: 'Query', recipes: Array<{ __typename?: 'Recipe', recipeId: string, ownerUserId?: string | null, title: string, description?: string | null, sourceType: string, sourceUrl?: string | null, sourceName?: string | null, licenseId?: string | null, attributionText?: string | null, visibility: string, reviewStatus: string, servings?: number | null, servingsConfidence: ValueConfidence, servingSizeText?: string | null, scalable: boolean, prepTimeMinutes?: number | null, cookTimeMinutes?: number | null, totalTimeMinutes?: number | null, timeConfidence: ValueConfidence, mealTypes: Array<MealType>, cuisine?: string | null, difficulty?: number | null, equipmentRequired: Array<Equipment>, isComponent: boolean, tags: Array<string>, baseMealPlanEligible: boolean, missingInformation: Array<string>, ingredients: Array<{ __typename?: 'IngredientLine', position: number, rawText: string, ingredientId?: string | null, displayName?: string | null, quantity?: number | null, unit?: string | null, preparation?: string | null, grams?: number | null, isOptional: boolean, isToTaste: boolean, missingInformation?: string | null }>, instructions: Array<{ __typename?: 'InstructionStep', step: number, text: string, minutes?: number | null }>, nutrition?: { __typename?: 'NutritionInfo', basis: string, perServing: boolean, caloriesKcal?: number | null, proteinG?: number | null, carbsG?: number | null, fatG?: number | null, fiberG?: number | null, sodiumMg?: number | null, coveragePct?: number | null, confidence?: DataConfidence | null } | null }> };

export type RecipeQueryVariables = Exact<{
  recipeId: Scalars['ID']['input'];
}>;


export type RecipeQuery = { __typename?: 'Query', recipe?: { __typename?: 'Recipe', recipeId: string, ownerUserId?: string | null, title: string, description?: string | null, sourceType: string, sourceUrl?: string | null, sourceName?: string | null, licenseId?: string | null, attributionText?: string | null, visibility: string, reviewStatus: string, servings?: number | null, servingsConfidence: ValueConfidence, servingSizeText?: string | null, scalable: boolean, prepTimeMinutes?: number | null, cookTimeMinutes?: number | null, totalTimeMinutes?: number | null, timeConfidence: ValueConfidence, mealTypes: Array<MealType>, cuisine?: string | null, difficulty?: number | null, equipmentRequired: Array<Equipment>, isComponent: boolean, tags: Array<string>, baseMealPlanEligible: boolean, missingInformation: Array<string>, ingredients: Array<{ __typename?: 'IngredientLine', position: number, rawText: string, ingredientId?: string | null, displayName?: string | null, quantity?: number | null, unit?: string | null, preparation?: string | null, grams?: number | null, isOptional: boolean, isToTaste: boolean, missingInformation?: string | null }>, instructions: Array<{ __typename?: 'InstructionStep', step: number, text: string, minutes?: number | null }>, nutrition?: { __typename?: 'NutritionInfo', basis: string, perServing: boolean, caloriesKcal?: number | null, proteinG?: number | null, carbsG?: number | null, fatG?: number | null, fiberG?: number | null, sodiumMg?: number | null, coveragePct?: number | null, confidence?: DataConfidence | null } | null } | null };

export type SavedRecipesQueryVariables = Exact<{ [key: string]: never; }>;


export type SavedRecipesQuery = { __typename?: 'Query', savedRecipes: Array<{ __typename?: 'Recipe', recipeId: string, ownerUserId?: string | null, title: string, description?: string | null, sourceType: string, sourceUrl?: string | null, sourceName?: string | null, licenseId?: string | null, attributionText?: string | null, visibility: string, reviewStatus: string, servings?: number | null, servingsConfidence: ValueConfidence, servingSizeText?: string | null, scalable: boolean, prepTimeMinutes?: number | null, cookTimeMinutes?: number | null, totalTimeMinutes?: number | null, timeConfidence: ValueConfidence, mealTypes: Array<MealType>, cuisine?: string | null, difficulty?: number | null, equipmentRequired: Array<Equipment>, isComponent: boolean, tags: Array<string>, baseMealPlanEligible: boolean, missingInformation: Array<string>, ingredients: Array<{ __typename?: 'IngredientLine', position: number, rawText: string, ingredientId?: string | null, displayName?: string | null, quantity?: number | null, unit?: string | null, preparation?: string | null, grams?: number | null, isOptional: boolean, isToTaste: boolean, missingInformation?: string | null }>, instructions: Array<{ __typename?: 'InstructionStep', step: number, text: string, minutes?: number | null }>, nutrition?: { __typename?: 'NutritionInfo', basis: string, perServing: boolean, caloriesKcal?: number | null, proteinG?: number | null, carbsG?: number | null, fatG?: number | null, fiberG?: number | null, sodiumMg?: number | null, coveragePct?: number | null, confidence?: DataConfidence | null } | null }> };

export type IngredientsQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type IngredientsQuery = { __typename?: 'Query', ingredients: Array<{ __typename?: 'Ingredient', ingredientId: string, displayName: string, aisle: string, foodGroup: string, priceReferenceUnit: string, isPantryStaple: boolean, assumedOnHand: boolean, allergens: Array<Allergen> }> };

export type GroceryListQueryVariables = Exact<{
  planId: Scalars['ID']['input'];
}>;


export type GroceryListQuery = { __typename?: 'Query', groceryList?: { __typename?: 'GroceryListPayload', planId?: string | null, sections: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }>, cost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null } } | null };

export type GenerateMealPlanMutationVariables = Exact<{
  input: PlanRequestInput;
}>;


export type GenerateMealPlanMutation = { __typename?: 'Mutation', generateMealPlan: { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> } };

export type SwapPlannedMealMutationVariables = Exact<{
  planId: Scalars['ID']['input'];
  input: SwapMealInput;
}>;


export type SwapPlannedMealMutation = { __typename?: 'Mutation', swapPlannedMeal: { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> } };

export type MovePlannedMealMutationVariables = Exact<{
  planId: Scalars['ID']['input'];
  input: MoveMealInput;
}>;


export type MovePlannedMealMutation = { __typename?: 'Mutation', movePlannedMeal: { __typename?: 'MealPlan', planId: string, status: string, pennyMessage: string, swapOptions: Array<SwapAction>, assumptions: Array<string>, summary: { __typename?: 'PlanSummary', householdSize: number, mealsPlanned: number, budget?: number | null, headroom?: number | null, consumedCostTotal?: number | null, pantryValueUsed?: number | null, pantryItemsUsed: Array<string>, estimatedCost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null }, nutritionGoal?: { __typename?: 'NutritionGoalSummary', goal: string, metBy: number, of: number, avgProteinG?: number | null } | null, balancedMealBaseline?: { __typename?: 'BalancedMealBaseline', applied: boolean, avgScore?: number | null } | null }, meals: Array<{ __typename?: 'PlannedMeal', recipeId: string, title: string, totalTimeMinutes?: number | null, scaleFactor: number, servingsPlanned: number, proteinGPerServing?: number | null, goalIndicator?: string | null, pantryIngredientsUsed: Array<string>, incrementalCheckoutCost?: number | null, consumedCost?: number | null, why?: string | null, slot: { __typename?: 'MealSlot', day: number, mealType: MealType } }>, groceryList: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }> } };

export type AcceptMealPlanMutationVariables = Exact<{
  planId: Scalars['ID']['input'];
}>;


export type AcceptMealPlanMutation = { __typename?: 'Mutation', acceptMealPlan: { __typename?: 'GroceryListPayload', planId?: string | null, sections: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }>, cost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null } } };

export type DeleteMealPlanMutationVariables = Exact<{
  planId: Scalars['ID']['input'];
}>;


export type DeleteMealPlanMutation = { __typename?: 'Mutation', deleteMealPlan: boolean };

export type SetGroceryItemCheckedMutationVariables = Exact<{
  planId: Scalars['ID']['input'];
  ingredientId: Scalars['ID']['input'];
  checked: Scalars['Boolean']['input'];
}>;


export type SetGroceryItemCheckedMutation = { __typename?: 'Mutation', setGroceryItemChecked: boolean };

export type GroceryListFromRecipesMutationVariables = Exact<{
  input: GroceryListFromRecipesInput;
}>;


export type GroceryListFromRecipesMutation = { __typename?: 'Mutation', groceryListFromRecipes: { __typename?: 'GroceryListPayload', planId?: string | null, sections: Array<{ __typename?: 'GrocerySection', aisle: string, items: Array<{ __typename?: 'GroceryItem', ingredientId: string, displayName: string, neededQty: number, unit: string, packages?: number | null, packageLabel?: string | null, estimatedPrice: number, priceTier?: number | null, inPantry: boolean, isChecked: boolean, usedBy: Array<string> }> }>, cost: { __typename?: 'CostRange', point: number, low: number, high: number, confidence: DataConfidence, tierMix?: any | null, basis?: string | null } } };

export type SaveRecipeMutationVariables = Exact<{
  recipeId: Scalars['ID']['input'];
}>;


export type SaveRecipeMutation = { __typename?: 'Mutation', saveRecipe: boolean };

export type UnsaveRecipeMutationVariables = Exact<{
  recipeId: Scalars['ID']['input'];
}>;


export type UnsaveRecipeMutation = { __typename?: 'Mutation', unsaveRecipe: boolean };

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
