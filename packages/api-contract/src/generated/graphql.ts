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
  /** An RFC 3339 timestamp. */
  Time: { input: any; output: any; }
};

/**
 * What the reviewer fills in before accepting a draft.
 *
 * It is a patch, not a recipe: only the values a video commonly fails to state,
 * supplied by the person who chose the video. Everything else comes from the
 * draft, and the server re-resolves the result against the ingredient catalogue
 * rather than trusting anything here.
 *
 * A value supplied this way is recorded with `human` confidence — it was stated
 * by a person, not by the source and not inferred.
 */
export type AcceptRecipeImportInput = {
  /** Corrections to individual ingredient lines, addressed by position. */
  ingredients?: InputMaybe<Array<ImportIngredientPatchInput>>;
  /** A serving count the video never gave. */
  servings?: InputMaybe<Scalars['Float']['input']>;
};

export type AddPantryItemInput = {
  category: Scalars['String']['input'];
  expirationDate: Scalars['String']['input'];
  ingredientId?: InputMaybe<Scalars['ID']['input']>;
  location: StorageLocation;
  name: Scalars['String']['input'];
  quantity: Scalars['String']['input'];
  quantityAmount?: InputMaybe<Scalars['Float']['input']>;
  quantityUnit?: InputMaybe<Scalars['String']['input']>;
  useFirst?: InputMaybe<Scalars['Boolean']['input']>;
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
  benefitsRenewalDiscreetLockScreen: Scalars['Boolean']['output'];
  benefitsRenewalNotificationsEnabled: Scalars['Boolean']['output'];
  createdAt: Scalars['String']['output'];
  expiringPantryNotificationsEnabled: Scalars['Boolean']['output'];
  lastMealPlanDate?: Maybe<Scalars['String']['output']>;
  locationPermissionStatus: Scalars['String']['output'];
  notificationsEnabled: Scalars['Boolean']['output'];
  preferredFinanceTopics: Array<Scalars['String']['output']>;
  preferredResources: Array<Scalars['String']['output']>;
  resourceReminderNotificationsEnabled: Scalars['Boolean']['output'];
  selectedBenefitPrograms: Array<Scalars['String']['output']>;
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

/**
 * One stored answer.
 *
 * `status` is the load-bearing field. `PROVIDED` and `NONE` are answers and can
 * appear on a form; `UNKNOWN` means nobody has asked and `REFUSED` means they
 * declined, and neither is ever written onto an application.
 */
export type BenefitsAnswer = {
  __typename?: 'BenefitsAnswer';
  bool?: Maybe<Scalars['Boolean']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  fieldPath: Scalars['String']['output'];
  /** For a sensitive answer this is all that ever comes back — never the value. */
  hint?: Maybe<Scalars['String']['output']>;
  isSensitive: Scalars['Boolean']['output'];
  kind: BenefitsValueKind;
  list?: Maybe<Array<Scalars['String']['output']>>;
  moneyCents?: Maybe<Scalars['Int']['output']>;
  number?: Maybe<Scalars['Float']['output']>;
  rowId?: Maybe<Scalars['String']['output']>;
  source: BenefitsValueSource;
  status: BenefitsAnswerStatus;
  text?: Maybe<Scalars['String']['output']>;
};

/**
 * One answer from the app.
 *
 * It carries no kind: the server's vocabulary decides what shape each question
 * takes, so an answer in the wrong field is rejected rather than stored.
 */
export type BenefitsAnswerInput = {
  bool?: InputMaybe<Scalars['Boolean']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  fieldPath: Scalars['String']['input'];
  list?: InputMaybe<Array<Scalars['String']['input']>>;
  moneyCents?: InputMaybe<Scalars['Int']['input']>;
  number?: InputMaybe<Scalars['Float']['input']>;
  status: BenefitsAnswerStatus;
  text?: InputMaybe<Scalars['String']['input']>;
};

export type BenefitsAnswerStatus =
  /** The applicant said they have none of these. A real answer. */
  | 'NONE'
  | 'PROVIDED'
  /** Asked, declined to say. Never written onto a form, and not re-asked. */
  | 'REFUSED'
  /** Never asked, or skipped. Never written onto a form. */
  | 'UNKNOWN';

export type BenefitsApplication = {
  __typename?: 'BenefitsApplication';
  approvedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  /**
   * Path to the draft PDF on this API, or null until one has been rendered.
   * It requires the same bearer token as this query; there is no public link to a
   * document that carries a household's application.
   */
  draftDocumentPath?: Maybe<Scalars['String']['output']>;
  /** Why the run failed, when the status is FAILED. Never echoes an answer. */
  failureReason?: Maybe<Scalars['String']['output']>;
  /** What will appear on the PDF, in page order. Sensitive values are masked. */
  filledFields: Array<BenefitsFilledField>;
  /** Path to the approved, flattened PDF. Null until the applicant approves. */
  finalDocumentPath?: Maybe<Scalars['String']['output']>;
  form: BenefitsForm;
  id: Scalars['ID']['output'];
  /** What the app must ask for. Non-empty exactly when the status is NEEDS_INPUT. */
  missingFields: Array<BenefitsMissingField>;
  /** Answers that exist but cannot be written, for a person to look at. */
  problems: Array<BenefitsFieldProblem>;
  /** Boxes deliberately left blank — signatures, and rows the household does not have. */
  skippedFields: Array<BenefitsSkippedField>;
  status: BenefitsApplicationStatus;
  updatedAt: Scalars['String']['output'];
};

/**
 * Where a run has got to. A run is durable: it survives the app closing and is
 * resumed rather than restarted.
 */
export type BenefitsApplicationStatus =
  /** The applicant approved it and the PDF is flattened. */
  | 'COMPLETED'
  /** Created, not yet filled. */
  | 'DRAFT'
  /** A fill or render failed. `failureReason` says why; refilling clears it. */
  | 'FAILED'
  /** Filled as far as the profile allows. `missingFields` says what to ask for. */
  | 'NEEDS_INFORMATION'
  /** Nothing required is outstanding; awaiting the applicant's read-through. */
  | 'READY_FOR_REVIEW'
  /** Replaced by a newer run against the same form. */
  | 'SUPERSEDED';

export type BenefitsFieldProblem = {
  __typename?: 'BenefitsFieldProblem';
  fieldId: Scalars['String']['output'];
  fieldPath?: Maybe<Scalars['String']['output']>;
  /** Why the value could not be written. Never echoes the value itself. */
  reason: Scalars['String']['output'];
};

/** One question the profile can hold, with the wording the app should use. */
export type BenefitsFieldSpec = {
  __typename?: 'BenefitsFieldSpec';
  choices: Array<Scalars['String']['output']>;
  fieldPath: Scalars['String']['output'];
  group: Scalars['String']['output'];
  isDerived: Scalars['Boolean']['output'];
  isRepeating: Scalars['Boolean']['output'];
  isSensitive: Scalars['Boolean']['output'];
  kind: BenefitsValueKind;
  label: Scalars['String']['output'];
  question: Scalars['String']['output'];
};

export type BenefitsFieldStrength =
  | 'PREFERRED'
  | 'REQUIRED';

export type BenefitsFilledField = {
  __typename?: 'BenefitsFilledField';
  checked?: Maybe<Scalars['Boolean']['output']>;
  fieldId: Scalars['String']['output'];
  fieldPath?: Maybe<Scalars['String']['output']>;
  isCheckbox: Scalars['Boolean']['output'];
  isSensitive: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  page: Scalars['Int']['output'];
  source: BenefitsValueSource;
  /** What will be written. Masked when the answer is sensitive. */
  text?: Maybe<Scalars['String']['output']>;
};

export type BenefitsForm = {
  __typename?: 'BenefitsForm';
  agencyUrl?: Maybe<Scalars['String']['output']>;
  country: Scalars['String']['output'];
  /** The agency's own effective date for this version of the form, if it states one. */
  effectiveDate?: Maybe<Scalars['String']['output']>;
  fillableFieldCount: Scalars['Int']['output'];
  formCode: Scalars['String']['output'];
  formTitle: Scalars['String']['output'];
  formVersion: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Identifies the exact revision: id@version#revision. */
  key: Scalars['String']['output'];
  /**
   * How many of the form's boxes this mapping fills, out of how many could hold a
   * value. Partial coverage is the normal state of a real government form — most
   * have sections no profile holds — and the applicant is told rather than left to
   * discover it. Signature fields are in neither count.
   */
  mappedFieldCount: Scalars['Int']['output'];
  pageCount: Scalars['Int']['output'];
  program: Scalars['String']['output'];
  /** The day the PDF was downloaded, so 'is this still current?' is answerable. */
  retrievedAt?: Maybe<Scalars['String']['output']>;
  revision: Scalars['Int']['output'];
  /** Where this exact PDF was downloaded from. */
  sourceUrl?: Maybe<Scalars['String']['output']>;
  state?: Maybe<Scalars['String']['output']>;
  /**
   * Whether this form is offered to applicants. A form whose provenance has not
   * been confirmed against the agency loads and can be tested, but is never
   * offered: DRAFT and DEPRECATED forms do not appear in `benefitsForms`.
   */
  status: BenefitsFormStatus;
  templateKind: BenefitsTemplateKind;
};

export type BenefitsFormStatus =
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'DRAFT';

export type BenefitsGroup = {
  __typename?: 'BenefitsGroup';
  /**
   * Whether this group has been collected at all. False means the household has
   * not been asked, which is not the same as having none — an uncollected group
   * still produces a question.
   */
  collected: Scalars['Boolean']['output'];
  groupPath: Scalars['String']['output'];
  rows: Array<BenefitsGroupRow>;
};

export type BenefitsGroupRow = {
  __typename?: 'BenefitsGroupRow';
  answers: Array<BenefitsAnswer>;
  rowId: Scalars['ID']['output'];
};

export type BenefitsGroupRowInput = {
  answers: Array<BenefitsAnswerInput>;
  /** Omit to add a new row; pass an existing id to keep that row's identity. */
  rowId?: InputMaybe<Scalars['ID']['input']>;
};

export type BenefitsMissingField = {
  __typename?: 'BenefitsMissingField';
  answerKind: BenefitsValueKind;
  choices: Array<Scalars['String']['output']>;
  fieldPath: Scalars['String']['output'];
  /** Which boxes on the form are waiting on this one answer. */
  formFieldIds: Array<Scalars['String']['output']>;
  group: Scalars['String']['output'];
  /**
   * True for a value the profile computes rather than collects — a household's
   * monthly income total, say. The app must not put it to the user as a question:
   * there is no answer they could give, and answering its inputs is what fills it.
   */
  isDerived: Scalars['Boolean']['output'];
  isSensitive: Scalars['Boolean']['output'];
  label: Scalars['String']['output'];
  /** The wording the app should put to the user. */
  question: Scalars['String']['output'];
  strength: BenefitsFieldStrength;
};

export type BenefitsProfile = {
  __typename?: 'BenefitsProfile';
  answers: Array<BenefitsAnswer>;
  groups: Array<BenefitsGroup>;
  /** The field-path vocabulary these answers were recorded against. */
  vocabularyVersion: Scalars['Int']['output'];
};

/** Reference data: a typical certification period for a program, optionally per state. */
export type BenefitsProgramRule = {
  __typename?: 'BenefitsProgramRule';
  /** Typical certification period in months. Null when the program has no fixed period (VA one-time claims, SSI redeterminations). */
  certPeriodMonths?: Maybe<Scalars['Int']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  program: Scalars['String']['output'];
  sourceCitation: Scalars['String']['output'];
  /** A state code, or '*' for the national default. */
  state: Scalars['String']['output'];
};

/**
 * One scheduled renewal reminder. It keys off the final application and stores
 * only program, state, form id and dates — no answers, no PII beyond the viewer
 * it belongs to. Every date here is presented as "typical — confirm yours"
 * until the user confirms it.
 */
export type BenefitsRenewal = {
  __typename?: 'BenefitsRenewal';
  certificationEndsAt?: Maybe<Scalars['Time']['output']>;
  /** Whole days until the renewal is due, computed server-side. Negative when overdue. */
  daysRemaining: Scalars['Int']['output'];
  formId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  program: Scalars['String']['output'];
  /** Which reminder offset has already been sent: 0, 1, 2 or 3. */
  reminderStage: Scalars['Int']['output'];
  renewalDueAt: Scalars['Time']['output'];
  /** Where the deadline came from: 'rule-derived' or 'user-confirmed'. */
  source: Scalars['String']['output'];
  state: Scalars['String']['output'];
  /** One of: scheduled, reminded, started, done, dismissed. */
  status: Scalars['String']['output'];
};

export type BenefitsSkipReason =
  /** A slot for a row the household does not have. */
  | 'NOT_APPLICABLE'
  /** Help The Hive must not fill this — a signature, or the date beside one. */
  | 'POLICY';

export type BenefitsSkippedField = {
  __typename?: 'BenefitsSkippedField';
  fieldId: Scalars['String']['output'];
  note?: Maybe<Scalars['String']['output']>;
  reason: BenefitsSkipReason;
};

export type BenefitsTemplateKind =
  | 'ACROFORM'
  | 'FLAT';

export type BenefitsValueKind =
  | 'BOOLEAN'
  | 'CHOICE'
  | 'DATE'
  | 'LIST'
  | 'MONEY'
  | 'NUMBER'
  | 'TEXT';

export type BenefitsValueSource =
  /** Computed from provided answers only. */
  | 'DERIVED'
  /** Written by a reviewed mapping file, not by the applicant. */
  | 'MAPPING_CONSTANT'
  | 'PROFILE'
  | 'USER';

export type Budget = {
  __typename?: 'Budget';
  amount: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  mode: BudgetMode;
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

export type Consent = {
  __typename?: 'Consent';
  emailMarketingOptIn: Scalars['Boolean']['output'];
  emailMarketingUpdatedAt: Scalars['String']['output'];
  privacyAcceptedAt: Scalars['String']['output'];
  privacyVersion: Scalars['String']['output'];
  termsAcceptedAt: Scalars['String']['output'];
  termsVersion: Scalars['String']['output'];
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

export type CookingTime = {
  __typename?: 'CookingTime';
  maxMinutes?: Maybe<Scalars['Int']['output']>;
  strength: Strength;
};

export type CookingTimeInput = {
  maxMinutes?: InputMaybe<Scalars['Int']['input']>;
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
  /** What the items still to buy add up to. */
  purchaseCost: Scalars['Float']['output'];
  /**
   * The list with everything the viewer already owns removed: only what has to be
   * bought.
   *
   * It sits alongside `sections`, which keeps pantry items visible at a zero
   * estimate. Both are computed from the same basket, so they can never disagree;
   * which one a screen shows is a presentation decision. A shopper who cannot see
   * that the rice is already at home has no way to tell whether it was considered
   * or forgotten, which is why the full list is still the default.
   */
  purchaseSections: Array<GrocerySection>;
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

export type ImportIngredientPatchInput = {
  /** Resolve a line the catalogue could not match, by choosing an ingredient. */
  ingredientId?: InputMaybe<Scalars['ID']['input']>;
  /** The line's position in the draft, as returned by `recipeImport`. */
  position: Scalars['Int']['input'];
  /** An amount the video never stated. Null leaves the line as it is. */
  quantity?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<Scalars['String']['input']>;
};

export type ImportRecipeFromVideoInput = {
  /** Language for the extracted text. Defaults to english. */
  language?: InputMaybe<Scalars['String']['input']>;
  /** A cooking video link. Supported hosts are decided server-side. */
  url: Scalars['String']['input'];
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

export type MealPrepPlan = {
  __typename?: 'MealPrepPlan';
  planId: Scalars['ID']['output'];
  prepPlanId: Scalars['ID']['output'];
  tasks: Array<MealPrepTask>;
  /** Hands-on time, not elapsed time. */
  totalActiveMinutes: Scalars['Int']['output'];
};

export type MealPrepStorage =
  | 'freeze'
  | 'pantry'
  | 'refrigerate';

export type MealPrepTask = {
  __typename?: 'MealPrepTask';
  activeMinutes: Scalars['Int']['output'];
  ingredientIds: Array<Scalars['ID']['output']>;
  instruction: Scalars['String']['output'];
  isDone: Scalars['Boolean']['output'];
  keepsDays?: Maybe<Scalars['Int']['output']>;
  kind: MealPrepTaskKind;
  /**
   * How much to prepare, in the ingredient's own reference unit. Null when the
   * recipes never stated a quantity — it is not invented, and the instruction
   * says so instead.
   */
  portionAmount?: Maybe<Scalars['Float']['output']>;
  portionUnit?: Maybe<Scalars['String']['output']>;
  position: Scalars['Int']['output'];
  /** Which recipes this is for. */
  recipeIds: Array<Scalars['ID']['output']>;
  /** Which slots this feeds, as "day:mealType". */
  servesSlots: Array<Scalars['String']['output']>;
  /** Where to keep it. Guidance from the catalogue's food group, not a safety claim. */
  storage: MealPrepStorage;
  taskId: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type MealPrepTaskKind =
  /** A whole recipe cooked once for several servings. */
  | 'batch_cook'
  /** One ingredient prepared once for several meals. */
  | 'batch_ingredient';

export type MealProfile = {
  __typename?: 'MealProfile';
  /** Always required. The server rejects any other strength rather than downgrading it. */
  allergies: Array<AllergyRequirement>;
  /** Other allergies the user named, as canonical ingredient ids. */
  allergyIngredients: Array<Scalars['ID']['output']>;
  /** Null when the user has not set a grocery budget. */
  budget?: Maybe<Budget>;
  cookingStyle: Array<CookingStyle>;
  cookingTime: CookingTime;
  /** Days a generated plan should cover. */
  days: Scalars['Int']['output'];
  dietaryOtherText?: Maybe<Scalars['String']['output']>;
  dietaryRequirements: Array<DietRequirement>;
  dislikes: FoodPreferences;
  equipment: Array<Equipment>;
  household: Household;
  leftovers: LeftoversPreference;
  likes: FoodPreferences;
  /** Meals needed per week, per category. */
  meals: MealCounts;
  nutritionGoals: Array<NutritionPreference>;
  updatedAt: Scalars['String']['output'];
};

export type MealProfileInput = {
  allergies: Array<AllergyRequirementInput>;
  allergyIngredients: Array<Scalars['ID']['input']>;
  budget?: InputMaybe<BudgetInput>;
  cookingStyle: Array<CookingStyle>;
  cookingTime: CookingTimeInput;
  days: Scalars['Int']['input'];
  dietaryOtherText?: InputMaybe<Scalars['String']['input']>;
  dietaryRequirements: Array<DietRequirementInput>;
  dislikes: FoodPreferencesInput;
  equipment: Array<Equipment>;
  household: HouseholdInput;
  leftovers: LeftoversPreference;
  likes: FoodPreferencesInput;
  meals: MealCountsInput;
  nutritionPreferences: Array<NutritionPreferenceInput>;
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
  /**
   * Accepts a finished import's draft and saves it as one of the viewer's
   * recipes. Idempotent: accepting twice updates the same recipe rather than
   * creating a second one.
   */
  acceptRecipeImport: Recipe;
  addPantryItem: PantryItem;
  /** Flattens the reviewed document. Refused while anything required is missing. */
  approveBenefitsApplication: BenefitsApplication;
  /** Stops an import that has not finished. Already-finished imports are unchanged. */
  cancelRecipeImport: RecipeImport;
  completeOnboarding: Viewer;
  /** Records the user's own renewal deadline. The stored deadline is explicit user data, not a guess. */
  confirmBenefitsRenewalDeadline: BenefitsRenewal;
  deleteBenefitsApplication: Scalars['Boolean']['output'];
  deleteMealPlan: Scalars['Boolean']['output'];
  deletePantryItem: Scalars['Boolean']['output'];
  deletePushToken: Scalars['Boolean']['output'];
  deleteViewerData: Scalars['Boolean']['output'];
  /** Drops a renewal reminder. */
  dismissBenefitsRenewal: Scalars['Boolean']['output'];
  generateMealPlan: MealPlan;
  /** Choose My Recipes: selected recipes to a consolidated list, nothing saved. */
  groceryListFromRecipes: GroceryListPayload;
  /**
   * Starts extracting a recipe from a cooking video. Returns immediately: the
   * import runs in the background and is polled with `recipeImport`.
   */
  importRecipeFromVideo: RecipeImport;
  markPantryItemUsed: PantryItem;
  /** Moves a meal between slots. Never regenerates the week and never re-prices. */
  movePlannedMeal: MealPlan;
  recordConsent: Scalars['Boolean']['output'];
  /** Re-runs the fill after the app has collected more answers. */
  refillBenefitsApplication: BenefitsApplication;
  /** Rebuilds one day from the stored questionnaire, leaving the rest of the week alone. */
  regenerateDay: MealPlan;
  /** Rebuilds prep work from the plan as it stands now. */
  regenerateMealPrepPlan: MealPrepPlan;
  registerPushToken: PushToken;
  /** Puts a specific recipe in a slot. The recipe is still checked against the viewer's filters. */
  replaceMeal: MealPlan;
  requestVerificationCode: Scalars['Boolean']['output'];
  requestVerificationLink: Scalars['Boolean']['output'];
  /** Records scalar answers. Repeating groups go through saveBenefitsGroup. */
  saveBenefitsAnswers: BenefitsProfile;
  /** Replaces a repeating group. An empty rows list is how a household says it has none of these. */
  saveBenefitsGroup: BenefitsProfile;
  saveLocationFallback: Scalars['Boolean']['output'];
  /** Makes a plan the viewer's active one, archiving whichever plan held that place. */
  saveMealPlan: MealPlan;
  /**
   * Replaces the viewer's answers. A questionnaire is a current answer, not an
   * accumulation: saving without a dislike removes it.
   */
  saveMealProfile: MealProfile;
  saveOnboardingStep: Scalars['Boolean']['output'];
  saveQuestionnaire: QuestionnaireAnswers;
  saveRecipe: Scalars['Boolean']['output'];
  setGroceryItemChecked: Scalars['Boolean']['output'];
  /** Ticks one task off. False when there was nothing to tick. */
  setMealPrepTaskDone: Scalars['Boolean']['output'];
  /** Starts a run against the current revision of a form and fills what it can. */
  startBenefitsApplication: BenefitsApplication;
  /** Starts a fresh application on the renewal's form, pre-filled from the user's profile — the one-tap renewal. */
  startBenefitsRenewalApplication: BenefitsApplication;
  /** Replaces one slot's recipe. keepBasket avoids re-pricing the whole week. */
  swapPlannedMeal: MealPlan;
  unsaveRecipe: Scalars['Boolean']['output'];
  /** Sets the two renewal notification flags. */
  updateBenefitsRenewalPreferences: Scalars['Boolean']['output'];
  updateCommunicationConsents: Scalars['Boolean']['output'];
  updateHandle: Profile;
  updatePantryItem: PantryItem;
  updatePreferences: AppPreferences;
  updateProfile: Profile;
  /** Changes how much food one slot is cooked for. The week is re-priced. */
  updateServings: MealPlan;
  verifyCode: Scalars['Boolean']['output'];
};


export type MutationAcceptMealPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type MutationAcceptRecipeImportArgs = {
  importId: Scalars['ID']['input'];
  input?: InputMaybe<AcceptRecipeImportInput>;
};


export type MutationAddPantryItemArgs = {
  input: AddPantryItemInput;
};


export type MutationApproveBenefitsApplicationArgs = {
  applicationId: Scalars['ID']['input'];
};


export type MutationCancelRecipeImportArgs = {
  importId: Scalars['ID']['input'];
};


export type MutationCompleteOnboardingArgs = {
  input: CompleteOnboardingInput;
};


export type MutationConfirmBenefitsRenewalDeadlineArgs = {
  certificationEndsAt?: InputMaybe<Scalars['Time']['input']>;
  renewalDueAt: Scalars['Time']['input'];
  renewalId: Scalars['ID']['input'];
};


export type MutationDeleteBenefitsApplicationArgs = {
  applicationId: Scalars['ID']['input'];
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


export type MutationDismissBenefitsRenewalArgs = {
  renewalId: Scalars['ID']['input'];
};


export type MutationGenerateMealPlanArgs = {
  input: PlanRequestInput;
};


export type MutationGroceryListFromRecipesArgs = {
  input: GroceryListFromRecipesInput;
};


export type MutationImportRecipeFromVideoArgs = {
  input: ImportRecipeFromVideoInput;
};


export type MutationMarkPantryItemUsedArgs = {
  id: Scalars['ID']['input'];
};


export type MutationMovePlannedMealArgs = {
  input: MoveMealInput;
  planId: Scalars['ID']['input'];
};


export type MutationRecordConsentArgs = {
  input: RecordConsentInput;
};


export type MutationRefillBenefitsApplicationArgs = {
  applicationId: Scalars['ID']['input'];
};


export type MutationRegenerateDayArgs = {
  day: Scalars['Int']['input'];
  planId: Scalars['ID']['input'];
};


export type MutationRegenerateMealPrepPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type MutationRegisterPushTokenArgs = {
  input: RegisterPushTokenInput;
};


export type MutationReplaceMealArgs = {
  input: ReplaceMealInput;
  planId: Scalars['ID']['input'];
};


export type MutationRequestVerificationCodeArgs = {
  input: RequestVerificationCodeInput;
};


export type MutationRequestVerificationLinkArgs = {
  purpose: VerificationPurpose;
};


export type MutationSaveBenefitsAnswersArgs = {
  input: Array<BenefitsAnswerInput>;
};


export type MutationSaveBenefitsGroupArgs = {
  input: SaveBenefitsGroupInput;
};


export type MutationSaveLocationFallbackArgs = {
  zip: Scalars['String']['input'];
};


export type MutationSaveMealPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type MutationSaveMealProfileArgs = {
  input: MealProfileInput;
};


export type MutationSaveOnboardingStepArgs = {
  step: Scalars['String']['input'];
};


export type MutationSaveQuestionnaireArgs = {
  input: SaveQuestionnaireInput;
};


export type MutationSaveRecipeArgs = {
  recipeId: Scalars['ID']['input'];
};


export type MutationSetGroceryItemCheckedArgs = {
  checked: Scalars['Boolean']['input'];
  ingredientId: Scalars['ID']['input'];
  planId: Scalars['ID']['input'];
};


export type MutationSetMealPrepTaskDoneArgs = {
  done: Scalars['Boolean']['input'];
  taskId: Scalars['ID']['input'];
};


export type MutationStartBenefitsApplicationArgs = {
  formId: Scalars['ID']['input'];
};


export type MutationStartBenefitsRenewalApplicationArgs = {
  renewalId: Scalars['ID']['input'];
};


export type MutationSwapPlannedMealArgs = {
  input: SwapMealInput;
  planId: Scalars['ID']['input'];
};


export type MutationUnsaveRecipeArgs = {
  recipeId: Scalars['ID']['input'];
};


export type MutationUpdateBenefitsRenewalPreferencesArgs = {
  discreetLockScreen: Scalars['Boolean']['input'];
  renewalAlertsEnabled: Scalars['Boolean']['input'];
};


export type MutationUpdateCommunicationConsentsArgs = {
  input: UpdateCommunicationConsentsInput;
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


export type MutationUpdateServingsArgs = {
  input: UpdateServingsInput;
  planId: Scalars['ID']['input'];
};


export type MutationVerifyCodeArgs = {
  code: Scalars['String']['input'];
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
  currentStep?: Maybe<Scalars['String']['output']>;
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
   * Canonical catalogue id. Null when the item's name could not be resolved —
   * the item is still in the pantry, it simply does not take part in planning.
   */
  ingredientId?: Maybe<Scalars['ID']['output']>;
  location: StorageLocation;
  name: Scalars['String']['output'];
  quantity: Scalars['String']['output'];
  quantityAmount?: Maybe<Scalars['Float']['output']>;
  quantityUnit?: Maybe<Scalars['String']['output']>;
  status: ItemStatus;
  updatedAt: Scalars['String']['output'];
  /** Ranked above other pantry items when a plan is generated. */
  useFirst: Scalars['Boolean']['output'];
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
  /** User's ZIP code. When present and Kroger is configured, the plan is priced with live quotes from the nearest Kroger-family store. */
  postalCode?: InputMaybe<Scalars['String']['input']>;
  questionnaireVersion: Scalars['String']['input'];
  seed?: InputMaybe<Scalars['Int']['input']>;
};

export type PlanSummary = {
  __typename?: 'PlanSummary';
  balancedMealBaseline?: Maybe<BalancedMealBaseline>;
  budget?: Maybe<Scalars['Float']['output']>;
  consumedCostTotal?: Maybe<Scalars['Float']['output']>;
  estimatedCost: CostRange;
  /** budget minus estimatedCost.high; null when no budget was set. Negative when the plan costs more than the budget. */
  headroom?: Maybe<Scalars['Float']['output']>;
  householdSize: Scalars['Int']['output'];
  mealsPlanned: Scalars['Int']['output'];
  nutritionGoal?: Maybe<NutritionGoalSummary>;
  /**
   * True when even the cheapest safe plan costs more than the budget.
   *
   * The plan is still returned. Allergy and diet rules are never relaxed to reach
   * a number, so the honest outcome is a safe plan that is marked as too
   * expensive rather than a cheaper one somebody cannot eat.
   */
  overBudget: Scalars['Boolean']['output'];
  /** How much over, when overBudget. Null otherwise. */
  overage?: Maybe<Scalars['Float']['output']>;
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
  benefitsApplication?: Maybe<BenefitsApplication>;
  benefitsApplications: Array<BenefitsApplication>;
  /** Every question the profile can hold, so the app renders questions rather than hardcoding them. */
  benefitsFieldVocabulary: Array<BenefitsFieldSpec>;
  benefitsForm?: Maybe<BenefitsForm>;
  /** The government forms this server can fill. Holds no user data. */
  benefitsForms: Array<BenefitsForm>;
  /** The viewer's reusable benefits profile. */
  benefitsProfile: BenefitsProfile;
  /** Reference certification-period rules per program, optionally filtered by program. Reference data — the same rows for every user. */
  benefitsProgramRules: Array<BenefitsProgramRule>;
  /** The viewer's benefits renewal reminders, soonest first. */
  benefitsRenewals: Array<BenefitsRenewal>;
  /** The plan the viewer is currently on, or null when they have none yet. */
  currentMealPlan?: Maybe<MealPlan>;
  /** The saved grocery list for a plan, or null before the plan is accepted. */
  groceryList?: Maybe<GroceryListPayload>;
  handleAvailability: HandleAvailability;
  /** Canonical ingredient catalogue, used by the pantry and allergy pickers. */
  ingredients: Array<Ingredient>;
  mealPlan?: Maybe<MealPlan>;
  /** Prep work for a plan. Derived on first read; null when the plan is not the viewer's. */
  mealPrepPlan?: Maybe<MealPrepPlan>;
  /** The viewer's saved answers, or null when they have not answered yet. */
  mealProfile?: Maybe<MealProfile>;
  /**
   * Canonical ingredient ids for everything the viewer currently has on hand.
   *
   * This is what the meal generator matches against. Pantry items whose name has
   * not been resolved to the catalogue are absent — they are never guessed at —
   * so this can be shorter than the pantry itself.
   */
  pantryIngredientIds: Array<Scalars['ID']['output']>;
  pantryItems: Array<PantryItem>;
  pantryWasteStats: WasteStats;
  recipe?: Maybe<Recipe>;
  /** One of the viewer's video imports. null when it is not theirs. */
  recipeImport?: Maybe<RecipeImport>;
  /** The viewer's imports, newest first. */
  recipeImports: Array<RecipeImport>;
  /** The public recipe library plus the viewer's own recipes. */
  recipes: Array<Recipe>;
  savedRecipes: Array<Recipe>;
  viewer: Viewer;
};


export type QueryBenefitsApplicationArgs = {
  applicationId: Scalars['ID']['input'];
};


export type QueryBenefitsFormArgs = {
  formId: Scalars['ID']['input'];
};


export type QueryBenefitsFormsArgs = {
  program?: InputMaybe<Scalars['String']['input']>;
  state?: InputMaybe<Scalars['String']['input']>;
};


export type QueryBenefitsProgramRulesArgs = {
  program?: InputMaybe<Scalars['String']['input']>;
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


export type QueryMealPrepPlanArgs = {
  planId: Scalars['ID']['input'];
};


export type QueryPantryItemsArgs = {
  filter?: InputMaybe<PantryItemFilterInput>;
};


export type QueryRecipeArgs = {
  recipeId: Scalars['ID']['input'];
};


export type QueryRecipeImportArgs = {
  importId: Scalars['ID']['input'];
};


export type QueryRecipeImportsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryRecipesArgs = {
  query?: InputMaybe<RecipeQueryInput>;
};

export type QuestionnaireAnswers = {
  __typename?: 'QuestionnaireAnswers';
  financeTopics: Array<Scalars['String']['output']>;
  householdSize?: Maybe<Scalars['String']['output']>;
  incomeBracket?: Maybe<Scalars['String']['output']>;
  primaryGoal?: Maybe<Scalars['String']['output']>;
  resources: Array<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  weeklyBudget?: Maybe<Scalars['String']['output']>;
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

export type RecipeImport = {
  __typename?: 'RecipeImport';
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  /**
   * The extracted recipe, once status is `succeeded`. It is a normal Recipe —
   * there is no second recipe shape for imports — and it carries the same
   * `missingInformation` and `baseMealPlanEligible` as any other.
   *
   * Its `recipeId` is the id the recipe will have once accepted, so the draft
   * can be referred to before it is saved.
   */
  draft?: Maybe<Recipe>;
  /**
   * A named failure, once status is `failed`: UNSUPPORTED_SOURCE,
   * VIDEO_UNAVAILABLE, VIDEO_TOO_LONG, NO_TRANSCRIPT, NO_RECIPE_FOUND,
   * PROVIDER_ERROR. The app turns these into sentences; they are not display text.
   */
  errorCode?: Maybe<Scalars['String']['output']>;
  /** Safe to show. Never echoes transcript or video content. */
  errorMessage?: Maybe<Scalars['String']['output']>;
  importId: Scalars['ID']['output'];
  /** Set once the draft has been accepted. Null before that. */
  recipeId?: Maybe<Scalars['ID']['output']>;
  /** youtube, instagram, tiktok — as resolved from the URL. */
  sourcePlatform: Scalars['String']['output'];
  sourceUrl: Scalars['String']['output'];
  status: RecipeImportStatus;
};

export type RecipeImportStatus =
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export type RecipeQueryInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  mealType?: InputMaybe<MealType>;
  search?: InputMaybe<Scalars['String']['input']>;
  /** Taxonomy ids: OR within a family, AND across families. */
  tagIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type RecordConsentInput = {
  emailMarketingOptIn: Scalars['Boolean']['input'];
  privacyVersion: Scalars['String']['input'];
  termsVersion: Scalars['String']['input'];
};

export type RegisterPushTokenInput = {
  deviceId?: InputMaybe<Scalars['String']['input']>;
  platform: PushPlatform;
  token: Scalars['String']['input'];
};

export type ReplaceMealInput = {
  recipeId: Scalars['ID']['input'];
  slot: MealSlotInput;
};

export type RequestVerificationCodeInput = {
  method: VerificationMethod;
  newEmail?: InputMaybe<Scalars['String']['input']>;
  newPhone?: InputMaybe<Scalars['String']['input']>;
  purpose?: InputMaybe<VerificationPurpose>;
};

export type SaveBenefitsGroupInput = {
  groupPath: Scalars['String']['input'];
  rows: Array<BenefitsGroupRowInput>;
};

export type SaveQuestionnaireInput = {
  financeTopics?: InputMaybe<Array<Scalars['String']['input']>>;
  householdSize?: InputMaybe<Scalars['String']['input']>;
  incomeBracket?: InputMaybe<Scalars['String']['input']>;
  primaryGoal?: InputMaybe<Scalars['String']['input']>;
  resources?: InputMaybe<Array<Scalars['String']['input']>>;
  weeklyBudget?: InputMaybe<Scalars['String']['input']>;
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

export type UpdateCommunicationConsentsInput = {
  emailConsent?: InputMaybe<Scalars['Boolean']['input']>;
  phoneCallConsent?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdatePantryItemInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  expirationDate?: InputMaybe<Scalars['String']['input']>;
  ingredientId?: InputMaybe<Scalars['ID']['input']>;
  location?: InputMaybe<StorageLocation>;
  name?: InputMaybe<Scalars['String']['input']>;
  quantity?: InputMaybe<Scalars['String']['input']>;
  quantityAmount?: InputMaybe<Scalars['Float']['input']>;
  quantityUnit?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<ItemStatus>;
  useFirst?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdatePreferencesInput = {
  emailMarketingOptIn?: InputMaybe<Scalars['Boolean']['input']>;
  expiringPantryNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  lastMealPlanDate?: InputMaybe<Scalars['String']['input']>;
  locationPermissionStatus?: InputMaybe<Scalars['String']['input']>;
  notificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  preferredFinanceTopics?: InputMaybe<Array<Scalars['String']['input']>>;
  preferredResources?: InputMaybe<Array<Scalars['String']['input']>>;
  resourceReminderNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  selectedBenefitPrograms?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type UpdateServingsInput = {
  servings: Scalars['Float']['input'];
  slot: MealSlotInput;
};

export type User = {
  __typename?: 'User';
  accountVerifiedAt?: Maybe<Scalars['String']['output']>;
  authSubject: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  updatedAt: Scalars['String']['output'];
  verificationMethod?: Maybe<Scalars['String']['output']>;
};

/** How a single recipe value was established. `missing` is never guessed away. */
export type ValueConfidence =
  | 'human'
  | 'inferred'
  | 'missing'
  | 'source';

export type VerificationMethod =
  | 'EMAIL';

export type VerificationPurpose =
  | 'EMAIL_CHANGE'
  | 'PHONE_CHANGE'
  | 'RECOVERY'
  | 'SIGNUP';

export type VerificationStatus = {
  __typename?: 'VerificationStatus';
  method?: Maybe<VerificationMethod>;
  verified: Scalars['Boolean']['output'];
  verifiedAt?: Maybe<Scalars['String']['output']>;
};

export type Viewer = {
  __typename?: 'Viewer';
  consent?: Maybe<Consent>;
  onboardingState: OnboardingState;
  preferences: AppPreferences;
  profile: Profile;
  questionnaireAnswers: QuestionnaireAnswers;
  user: User;
  verification: VerificationStatus;
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

export type RecordConsentMutationVariables = Exact<{
  input: RecordConsentInput;
}>;


export type RecordConsentMutation = { __typename?: 'Mutation', recordConsent: boolean };

export type RequestVerificationCodeMutationVariables = Exact<{
  input: RequestVerificationCodeInput;
}>;


export type RequestVerificationCodeMutation = { __typename?: 'Mutation', requestVerificationCode: boolean };

export type RequestVerificationLinkMutationVariables = Exact<{
  purpose: VerificationPurpose;
}>;


export type RequestVerificationLinkMutation = { __typename?: 'Mutation', requestVerificationLink: boolean };

export type VerifyCodeMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;


export type VerifyCodeMutation = { __typename?: 'Mutation', verifyCode: boolean };

export type SaveQuestionnaireMutationVariables = Exact<{
  input: SaveQuestionnaireInput;
}>;


export type SaveQuestionnaireMutation = { __typename?: 'Mutation', saveQuestionnaire: { __typename?: 'QuestionnaireAnswers', weeklyBudget?: string | null, financeTopics: Array<string>, resources: Array<string>, primaryGoal?: string | null, householdSize?: string | null, incomeBracket?: string | null, updatedAt: string } };

export type SaveOnboardingStepMutationVariables = Exact<{
  step: Scalars['String']['input'];
}>;


export type SaveOnboardingStepMutation = { __typename?: 'Mutation', saveOnboardingStep: boolean };

export type UpdateCommunicationConsentsMutationVariables = Exact<{
  input: UpdateCommunicationConsentsInput;
}>;


export type UpdateCommunicationConsentsMutation = { __typename?: 'Mutation', updateCommunicationConsents: boolean };

export type SaveLocationFallbackMutationVariables = Exact<{
  zip: Scalars['String']['input'];
}>;


export type SaveLocationFallbackMutation = { __typename?: 'Mutation', saveLocationFallback: boolean };

export type BenefitsFormFieldsFragment = { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null };

export type BenefitsApplicationFieldsFragment = { __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> };

export type BenefitsProfileFieldsFragment = { __typename?: 'BenefitsProfile', vocabularyVersion: number, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }>, groups: Array<{ __typename?: 'BenefitsGroup', groupPath: string, collected: boolean, rows: Array<{ __typename?: 'BenefitsGroupRow', rowId: string, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }> }> }> };

export type BenefitsProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type BenefitsProfileQuery = { __typename?: 'Query', benefitsProfile: { __typename?: 'BenefitsProfile', vocabularyVersion: number, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }>, groups: Array<{ __typename?: 'BenefitsGroup', groupPath: string, collected: boolean, rows: Array<{ __typename?: 'BenefitsGroupRow', rowId: string, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }> }> }> } };

export type BenefitsFormsQueryVariables = Exact<{
  state?: InputMaybe<Scalars['String']['input']>;
  program?: InputMaybe<Scalars['String']['input']>;
}>;


export type BenefitsFormsQuery = { __typename?: 'Query', benefitsForms: Array<{ __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }> };

export type BenefitsApplicationsQueryVariables = Exact<{ [key: string]: never; }>;


export type BenefitsApplicationsQuery = { __typename?: 'Query', benefitsApplications: Array<{ __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> }> };

export type BenefitsApplicationQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;


export type BenefitsApplicationQuery = { __typename?: 'Query', benefitsApplication?: { __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> } | null };

export type BenefitsFieldVocabularyQueryVariables = Exact<{ [key: string]: never; }>;


export type BenefitsFieldVocabularyQuery = { __typename?: 'Query', benefitsFieldVocabulary: Array<{ __typename?: 'BenefitsFieldSpec', fieldPath: string, kind: BenefitsValueKind, group: string, label: string, question: string, choices: Array<string>, isSensitive: boolean, isDerived: boolean, isRepeating: boolean }> };

export type SaveBenefitsAnswersMutationVariables = Exact<{
  input: Array<BenefitsAnswerInput> | BenefitsAnswerInput;
}>;


export type SaveBenefitsAnswersMutation = { __typename?: 'Mutation', saveBenefitsAnswers: { __typename?: 'BenefitsProfile', vocabularyVersion: number, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }>, groups: Array<{ __typename?: 'BenefitsGroup', groupPath: string, collected: boolean, rows: Array<{ __typename?: 'BenefitsGroupRow', rowId: string, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }> }> }> } };

export type SaveBenefitsGroupMutationVariables = Exact<{
  input: SaveBenefitsGroupInput;
}>;


export type SaveBenefitsGroupMutation = { __typename?: 'Mutation', saveBenefitsGroup: { __typename?: 'BenefitsProfile', vocabularyVersion: number, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }>, groups: Array<{ __typename?: 'BenefitsGroup', groupPath: string, collected: boolean, rows: Array<{ __typename?: 'BenefitsGroupRow', rowId: string, answers: Array<{ __typename?: 'BenefitsAnswer', fieldPath: string, rowId?: string | null, status: BenefitsAnswerStatus, kind: BenefitsValueKind, source: BenefitsValueSource, isSensitive: boolean, text?: string | null, number?: number | null, moneyCents?: number | null, date?: string | null, bool?: boolean | null, list?: Array<string> | null, hint?: string | null }> }> }> } };

export type StartBenefitsApplicationMutationVariables = Exact<{
  formId: Scalars['ID']['input'];
}>;


export type StartBenefitsApplicationMutation = { __typename?: 'Mutation', startBenefitsApplication: { __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> } };

export type RefillBenefitsApplicationMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;


export type RefillBenefitsApplicationMutation = { __typename?: 'Mutation', refillBenefitsApplication: { __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> } };

export type ApproveBenefitsApplicationMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;


export type ApproveBenefitsApplicationMutation = { __typename?: 'Mutation', approveBenefitsApplication: { __typename?: 'BenefitsApplication', id: string, status: BenefitsApplicationStatus, failureReason?: string | null, draftDocumentPath?: string | null, finalDocumentPath?: string | null, createdAt: string, updatedAt: string, approvedAt?: string | null, form: { __typename?: 'BenefitsForm', id: string, key: string, status: BenefitsFormStatus, program: string, country: string, state?: string | null, formCode: string, formTitle: string, formVersion: string, revision: number, pageCount: number, templateKind: BenefitsTemplateKind, agencyUrl?: string | null, mappedFieldCount: number, fillableFieldCount: number, effectiveDate?: string | null, sourceUrl?: string | null, retrievedAt?: string | null }, filledFields: Array<{ __typename?: 'BenefitsFilledField', fieldId: string, label: string, fieldPath?: string | null, page: number, source: BenefitsValueSource, text?: string | null, checked?: boolean | null, isCheckbox: boolean, isSensitive: boolean }>, missingFields: Array<{ __typename?: 'BenefitsMissingField', fieldPath: string, label: string, question: string, group: string, answerKind: BenefitsValueKind, choices: Array<string>, strength: BenefitsFieldStrength, isSensitive: boolean, isDerived: boolean, formFieldIds: Array<string> }>, problems: Array<{ __typename?: 'BenefitsFieldProblem', fieldId: string, fieldPath?: string | null, reason: string }>, skippedFields: Array<{ __typename?: 'BenefitsSkippedField', fieldId: string, reason: BenefitsSkipReason, note?: string | null }> } };

export type DeleteBenefitsApplicationMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;


export type DeleteBenefitsApplicationMutation = { __typename?: 'Mutation', deleteBenefitsApplication: boolean };

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


export type ViewerQuery = { __typename?: 'Query', viewer: { __typename?: 'Viewer', user: { __typename?: 'User', id: string, authSubject: string, email?: string | null, createdAt: string, updatedAt: string, accountVerifiedAt?: string | null, verificationMethod?: string | null }, profile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string }, preferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, selectedBenefitPrograms: Array<string>, locationPermissionStatus: string, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string }, onboardingState: { __typename?: 'OnboardingState', hasCompletedOnboarding: boolean, completedAt?: string | null, currentStep?: string | null, createdAt: string, updatedAt: string }, questionnaireAnswers: { __typename?: 'QuestionnaireAnswers', weeklyBudget?: string | null, financeTopics: Array<string>, resources: Array<string>, primaryGoal?: string | null, householdSize?: string | null, incomeBracket?: string | null, updatedAt: string }, verification: { __typename?: 'VerificationStatus', verified: boolean, verifiedAt?: string | null, method?: VerificationMethod | null }, consent?: { __typename?: 'Consent', emailMarketingOptIn: boolean } | null } };

export type UpdateProfileMutationVariables = Exact<{
  input: UpdateProfileInput;
}>;


export type UpdateProfileMutation = { __typename?: 'Mutation', updateProfile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string } };

export type UpdatePreferencesMutationVariables = Exact<{
  input: UpdatePreferencesInput;
}>;


export type UpdatePreferencesMutation = { __typename?: 'Mutation', updatePreferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, selectedBenefitPrograms: Array<string>, locationPermissionStatus: string, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string } };

export type CompleteOnboardingMutationVariables = Exact<{
  input: CompleteOnboardingInput;
}>;


export type CompleteOnboardingMutation = { __typename?: 'Mutation', completeOnboarding: { __typename?: 'Viewer', user: { __typename?: 'User', id: string, authSubject: string, email?: string | null, createdAt: string, updatedAt: string, accountVerifiedAt?: string | null, verificationMethod?: string | null }, profile: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string }, preferences: { __typename?: 'AppPreferences', weeklyBudget: string, preferredFinanceTopics: Array<string>, preferredResources: Array<string>, wantsGovAssistance: boolean, selectedBenefitPrograms: Array<string>, locationPermissionStatus: string, lastMealPlanDate?: string | null, notificationsEnabled: boolean, expiringPantryNotificationsEnabled: boolean, weeklyMealPlanNotificationsEnabled: boolean, resourceReminderNotificationsEnabled: boolean, createdAt: string, updatedAt: string }, onboardingState: { __typename?: 'OnboardingState', hasCompletedOnboarding: boolean, completedAt?: string | null, createdAt: string, updatedAt: string } } };

export type HandleAvailabilityQueryVariables = Exact<{
  handle: Scalars['String']['input'];
}>;


export type HandleAvailabilityQuery = { __typename?: 'Query', handleAvailability: { __typename?: 'HandleAvailability', handle: string, available: boolean, reason: HandleAvailabilityReason, retryAfter?: string | null } };

export type UpdateHandleMutationVariables = Exact<{
  handle: Scalars['String']['input'];
}>;


export type UpdateHandleMutation = { __typename?: 'Mutation', updateHandle: { __typename?: 'Profile', handle?: string | null, firstName: string, lastName: string, phone: string, zip: string, householdSize: number, profileImageUri?: string | null, createdAt: string, updatedAt: string } };
