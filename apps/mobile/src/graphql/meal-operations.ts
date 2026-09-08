/**
 * Meal GraphQL documents.
 *
 * They live beside `operations.ts` rather than inside it so the meal contract
 * can grow without turning one file into the whole API surface. The document
 * text mirrors `packages/api-contract/operations/meals.graphql`, and the types
 * come from the generated contract, so a schema change breaks the build here.
 *
 * No operation sends a user id. Ownership is decided by the server from the
 * bearer token the client attaches, never by anything the app passes in.
 */
import type {
  AcceptMealPlanMutation,
  AcceptMealPlanMutationVariables,
  CurrentMealPlanQuery,
  CurrentMealPlanQueryVariables,
  DeleteMealPlanMutation,
  DeleteMealPlanMutationVariables,
  GenerateMealPlanMutation,
  GenerateMealPlanMutationVariables,
  GroceryListFromRecipesMutation,
  GroceryListFromRecipesMutationVariables,
  GroceryListQuery,
  GroceryListQueryVariables,
  IngredientsQuery,
  IngredientsQueryVariables,
  MealPlanQuery,
  MealPlanQueryVariables,
  MovePlannedMealMutation,
  MovePlannedMealMutationVariables,
  RecipeQuery,
  RecipeQueryVariables,
  RecipesQuery,
  RecipesQueryVariables,
  SaveRecipeMutation,
  SaveRecipeMutationVariables,
  SavedRecipesQuery,
  SavedRecipesQueryVariables,
  SetGroceryItemCheckedMutation,
  SetGroceryItemCheckedMutationVariables,
  SwapPlannedMealMutation,
  SwapPlannedMealMutationVariables,
  UnsaveRecipeMutation,
  UnsaveRecipeMutationVariables,
} from '@helpthehive/api-contract';

import type { GraphQLDocument } from '@/graphql/operations';

const COST_RANGE_FIELDS = `
  fragment CostRangeFields on CostRange {
    point
    low
    high
    confidence
    tierMix
    basis
  }
`;

const GROCERY_SECTION_FIELDS = `
  fragment GrocerySectionFields on GrocerySection {
    aisle
    items {
      ingredientId
      displayName
      neededQty
      unit
      packages
      packageLabel
      estimatedPrice
      priceTier
      inPantry
      isChecked
      usedBy
    }
  }
`;

const MEAL_PLAN_FIELDS = `
  fragment MealPlanFields on MealPlan {
    planId
    status
    pennyMessage
    swapOptions
    assumptions
    summary {
      householdSize
      mealsPlanned
      budget
      headroom
      consumedCostTotal
      pantryValueUsed
      pantryItemsUsed
      estimatedCost { ...CostRangeFields }
      nutritionGoal { goal metBy of avgProteinG }
      balancedMealBaseline { applied avgScore }
    }
    meals {
      slot { day mealType }
      recipeId
      title
      totalTimeMinutes
      scaleFactor
      servingsPlanned
      proteinGPerServing
      goalIndicator
      pantryIngredientsUsed
      incrementalCheckoutCost
      consumedCost
      why
    }
    groceryList { ...GrocerySectionFields }
  }
`;

const RECIPE_FIELDS = `
  fragment RecipeFields on Recipe {
    recipeId
    ownerUserId
    title
    description
    sourceType
    sourceUrl
    sourceName
    licenseId
    attributionText
    visibility
    reviewStatus
    servings
    servingsConfidence
    servingSizeText
    scalable
    prepTimeMinutes
    cookTimeMinutes
    totalTimeMinutes
    timeConfidence
    mealTypes
    cuisine
    difficulty
    equipmentRequired
    isComponent
    tags
    baseMealPlanEligible
    missingInformation
    ingredients {
      position
      rawText
      ingredientId
      displayName
      quantity
      unit
      preparation
      grams
      isOptional
      isToTaste
      missingInformation
    }
    instructions { step text minutes }
    nutrition {
      basis
      perServing
      caloriesKcal
      proteinG
      carbsG
      fatG
      fiberG
      sodiumMg
      coveragePct
      confidence
    }
  }
`;

const GROCERY_LIST_PAYLOAD_FIELDS = `
  fragment GroceryListPayloadFields on GroceryListPayload {
    planId
    sections { ...GrocerySectionFields }
    cost { ...CostRangeFields }
  }
`;

const PLAN_FRAGMENTS = COST_RANGE_FIELDS + GROCERY_SECTION_FIELDS + MEAL_PLAN_FIELDS;
const LIST_FRAGMENTS = COST_RANGE_FIELDS + GROCERY_SECTION_FIELDS + GROCERY_LIST_PAYLOAD_FIELDS;

export const CurrentMealPlanDocument = `
  query CurrentMealPlan {
    currentMealPlan { ...MealPlanFields }
  }
  ${PLAN_FRAGMENTS}
` as GraphQLDocument<CurrentMealPlanQuery, CurrentMealPlanQueryVariables>;

export const MealPlanDocument = `
  query MealPlan($planId: ID!) {
    mealPlan(planId: $planId) { ...MealPlanFields }
  }
  ${PLAN_FRAGMENTS}
` as GraphQLDocument<MealPlanQuery, MealPlanQueryVariables>;

export const GenerateMealPlanDocument = `
  mutation GenerateMealPlan($input: PlanRequestInput!) {
    generateMealPlan(input: $input) { ...MealPlanFields }
  }
  ${PLAN_FRAGMENTS}
` as GraphQLDocument<GenerateMealPlanMutation, GenerateMealPlanMutationVariables>;

export const SwapPlannedMealDocument = `
  mutation SwapPlannedMeal($planId: ID!, $input: SwapMealInput!) {
    swapPlannedMeal(planId: $planId, input: $input) { ...MealPlanFields }
  }
  ${PLAN_FRAGMENTS}
` as GraphQLDocument<SwapPlannedMealMutation, SwapPlannedMealMutationVariables>;

export const MovePlannedMealDocument = `
  mutation MovePlannedMeal($planId: ID!, $input: MoveMealInput!) {
    movePlannedMeal(planId: $planId, input: $input) { ...MealPlanFields }
  }
  ${PLAN_FRAGMENTS}
` as GraphQLDocument<MovePlannedMealMutation, MovePlannedMealMutationVariables>;

export const DeleteMealPlanDocument = `
  mutation DeleteMealPlan($planId: ID!) {
    deleteMealPlan(planId: $planId)
  }
` as GraphQLDocument<DeleteMealPlanMutation, DeleteMealPlanMutationVariables>;

export const AcceptMealPlanDocument = `
  mutation AcceptMealPlan($planId: ID!) {
    acceptMealPlan(planId: $planId) { ...GroceryListPayloadFields }
  }
  ${LIST_FRAGMENTS}
` as GraphQLDocument<AcceptMealPlanMutation, AcceptMealPlanMutationVariables>;

export const GroceryListDocument = `
  query GroceryList($planId: ID!) {
    groceryList(planId: $planId) { ...GroceryListPayloadFields }
  }
  ${LIST_FRAGMENTS}
` as GraphQLDocument<GroceryListQuery, GroceryListQueryVariables>;

export const GroceryListFromRecipesDocument = `
  mutation GroceryListFromRecipes($input: GroceryListFromRecipesInput!) {
    groceryListFromRecipes(input: $input) { ...GroceryListPayloadFields }
  }
  ${LIST_FRAGMENTS}
` as GraphQLDocument<GroceryListFromRecipesMutation, GroceryListFromRecipesMutationVariables>;

export const SetGroceryItemCheckedDocument = `
  mutation SetGroceryItemChecked($planId: ID!, $ingredientId: ID!, $checked: Boolean!) {
    setGroceryItemChecked(planId: $planId, ingredientId: $ingredientId, checked: $checked)
  }
` as GraphQLDocument<SetGroceryItemCheckedMutation, SetGroceryItemCheckedMutationVariables>;

export const RecipesDocument = `
  query Recipes($query: RecipeQueryInput) {
    recipes(query: $query) { ...RecipeFields }
  }
  ${RECIPE_FIELDS}
` as GraphQLDocument<RecipesQuery, RecipesQueryVariables>;

export const RecipeDocument = `
  query Recipe($recipeId: ID!) {
    recipe(recipeId: $recipeId) { ...RecipeFields }
  }
  ${RECIPE_FIELDS}
` as GraphQLDocument<RecipeQuery, RecipeQueryVariables>;

export const SavedRecipesDocument = `
  query SavedRecipes {
    savedRecipes { ...RecipeFields }
  }
  ${RECIPE_FIELDS}
` as GraphQLDocument<SavedRecipesQuery, SavedRecipesQueryVariables>;

export const SaveRecipeDocument = `
  mutation SaveRecipe($recipeId: ID!) {
    saveRecipe(recipeId: $recipeId)
  }
` as GraphQLDocument<SaveRecipeMutation, SaveRecipeMutationVariables>;

export const UnsaveRecipeDocument = `
  mutation UnsaveRecipe($recipeId: ID!) {
    unsaveRecipe(recipeId: $recipeId)
  }
` as GraphQLDocument<UnsaveRecipeMutation, UnsaveRecipeMutationVariables>;

export const IngredientsDocument = `
  query Ingredients($search: String, $limit: Int) {
    ingredients(search: $search, limit: $limit) {
      ingredientId
      displayName
      aisle
      foodGroup
      priceReferenceUnit
      isPantryStaple
      assumedOnHand
      allergens
    }
  }
` as GraphQLDocument<IngredientsQuery, IngredientsQueryVariables>;
