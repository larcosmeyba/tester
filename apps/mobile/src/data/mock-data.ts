import { HiveColors } from '@/constants/theme';

export type StorageLocation = 'Pantry' | 'Refrigerator' | 'Freezer';
export type ItemStatus = 'active' | 'used' | 'expired';

export type PantryItem = {
  id: string;
  name: string;
  quantity: string;
  location: StorageLocation;
  expirationDate: string;
  category: string;
  status: ItemStatus;
  dateAdded: string;
  dateUsed?: string;
};

export type WasteStats = {
  totalAdded: number;
  totalUsed: number;
  totalExpired: number;
  estimatedWasteValue: number;
  mostWastedCategories: string[];
};

export type Deal = {
  id: string;
  title: string;
  store: string;
  price: string;
  originalPrice: string;
  tag: string;
  color: string;
};

export type GroceryItem = {
  id: string;
  name: string;
  quantity: string;
  aisle: string;
  checked?: boolean;
};

export type MealRecipe = {
  id: string;
  name: string;
  time: string;
  servings: string;
  cost: string;
  tag: string;
  ingredients: string[];
  steps: string[];
};

export type DayMeal = {
  mealType: string;
  icon: string;
  color: string;
  recipe: MealRecipe;
};

export type VideoCategory = 'finance' | 'food' | 'resources';

export type VideoItem = {
  id: string;
  title: string;
  duration: string;
  category: VideoCategory;
  description: string;
  tags: string[];
};

export type ResourceItem = {
  id: string;
  tag: string;
  name: string;
  distance: string;
  hours: string;
  description: string;
  address: string;
  phone: string;
  website: string;
};

export type BenefitProgram = {
  id: string;
  name: string;
  agency: string;
  description: string;
  estimate: string;
  requirements: string[];
};

export type Transaction = {
  id: string;
  store: string;
  category: string;
  type: 'EBT' | 'Card';
  amount: string;
  section: string;
};

export const storageLocations: StorageLocation[] = ['Pantry', 'Refrigerator', 'Freezer'];

export const sampleDeals: Deal[] = [
  {
    id: 'deal-eggs',
    title: 'Large Eggs',
    store: 'Kroger',
    price: '$2.99',
    originalPrice: '$4.49',
    tag: 'Save $1.50',
    color: HiveColors.yellow,
  },
  {
    id: 'deal-rice',
    title: 'Long Grain Rice',
    store: 'Walmart',
    price: '$3.48',
    originalPrice: '$4.28',
    tag: 'Pantry staple',
    color: HiveColors.blue,
  },
  {
    id: 'deal-chicken',
    title: 'Chicken Thighs',
    store: 'Food 4 Less',
    price: '$6.21',
    originalPrice: '$8.80',
    tag: 'Family pack',
    color: HiveColors.greenMid,
  },
  {
    id: 'deal-beans',
    title: 'Black Beans',
    store: 'Target',
    price: '$0.89',
    originalPrice: '$1.19',
    tag: 'EBT eligible',
    color: HiveColors.orange,
  },
];

export const weeklyGroceryItems: GroceryItem[] = [
  { id: 'g1', name: 'Eggs', quantity: '1 dozen', aisle: 'Dairy' },
  { id: 'g2', name: 'Brown rice', quantity: '2 lb bag', aisle: 'Pantry' },
  { id: 'g3', name: 'Chicken thighs', quantity: '2 packs', aisle: 'Meat' },
  { id: 'g4', name: 'Frozen vegetables', quantity: '3 bags', aisle: 'Frozen' },
  { id: 'g5', name: 'Black beans', quantity: '4 cans', aisle: 'Canned goods' },
  { id: 'g6', name: 'Tortillas', quantity: '1 pack', aisle: 'Bakery' },
];

export const mealRecipes: MealRecipe[] = [
  {
    id: 'avocado-toast',
    name: 'Avocado Toast & Eggs',
    time: '10 min',
    servings: '2 servings',
    cost: 'Est. $2.50',
    tag: '$3 MEAL',
    ingredients: ['2 eggs', '2 slices wheat toast', '1 avocado', 'Salt and pepper'],
    steps: ['Toast bread.', 'Cook eggs to preference.', 'Mash avocado and assemble.'],
  },
  {
    id: 'rice-bowl',
    name: 'Veggie Rice Bowl',
    time: '20 min',
    servings: '4 servings',
    cost: 'Est. $3.75',
    tag: '$4 MEAL',
    ingredients: ['Rice', 'Frozen vegetables', 'Black beans', 'Salsa'],
    steps: ['Cook rice.', 'Warm vegetables and beans.', 'Top with salsa.'],
  },
  {
    id: 'stir-fry',
    name: 'Beef Stir Fry',
    time: '25 min',
    servings: '4 servings',
    cost: 'Est. $6.50',
    tag: '$7 MEAL',
    ingredients: ['Beef strips', 'Rice', 'Mixed vegetables', 'Soy sauce'],
    steps: ['Brown beef.', 'Add vegetables.', 'Serve over rice.'],
  },
  {
    id: 'egg-breakfast',
    name: '5 Egg Breakfast',
    time: '15 min',
    servings: '4 servings',
    cost: 'Est. $3.85',
    tag: '$5 MEAL',
    ingredients: ['5 eggs', 'Potatoes', 'Onion', 'Toast'],
    steps: ['Cook potatoes.', 'Scramble eggs.', 'Serve with toast.'],
  },
  {
    id: 'taco-bowls',
    name: 'Turkey Taco Bowls',
    time: '20 min',
    servings: '4 servings',
    cost: 'Est. $4.21',
    tag: '$5 MEAL',
    ingredients: ['Ground turkey', 'Rice', 'Beans', 'Taco seasoning'],
    steps: ['Brown turkey.', 'Cook rice.', 'Layer with beans and toppings.'],
  },
  {
    id: 'chicken-rice',
    name: 'Garlic Chicken & Rice',
    time: '30 min',
    servings: '9 servings',
    cost: 'Est. $5.21',
    tag: '$5 MEAL',
    ingredients: ['Chicken thighs', 'Rice', 'Garlic', 'Frozen vegetables'],
    steps: ['Season chicken.', 'Bake or saute.', 'Serve with rice and vegetables.'],
  },
  {
    id: 'lentil-soup',
    name: 'Lentil Soup',
    time: '30 min',
    servings: '6 servings',
    cost: 'Est. $2.80',
    tag: '$3 MEAL',
    ingredients: ['Lentils', 'Carrots', 'Onion', 'Broth'],
    steps: ['Saute vegetables.', 'Simmer lentils.', 'Season and serve.'],
  },
  {
    id: 'sheet-pan',
    name: 'Sheet Pan Chicken & Veg',
    time: '45 min',
    servings: '5 servings',
    cost: 'Est. $8.00',
    tag: '$8 MEAL',
    ingredients: ['Chicken', 'Potatoes', 'Carrots', 'Oil and spices'],
    steps: ['Chop vegetables.', 'Bake everything on one pan.', 'Portion leftovers.'],
  },
];

export const mealsByDow: DayMeal[][] = [
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[0] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[1] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[2] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[3] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[4] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[5] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[0] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[4] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[6] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[3] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[6] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[2] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[0] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[1] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[7] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[3] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[1] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[4] },
  ],
  [
    { mealType: 'Breakfast', icon: 'sunrise', color: HiveColors.orange, recipe: mealRecipes[0] },
    { mealType: 'Lunch', icon: 'sun', color: HiveColors.yellow, recipe: mealRecipes[6] },
    { mealType: 'Dinner', icon: 'moon', color: HiveColors.purple, recipe: mealRecipes[7] },
  ],
];

export const allVideos: VideoItem[] = [
  {
    id: 'snap',
    title: 'How to Apply for SNAP',
    duration: '3:45',
    category: 'resources',
    tags: ['Step-by-step', 'Beginner friendly'],
    description: 'A guided walkthrough of the SNAP application process and interview prep.',
  },
  {
    id: 'medicaid',
    title: 'How to Apply for Medicaid',
    duration: '5:30',
    category: 'resources',
    tags: ['Healthcare'],
    description: 'Learn what documents to gather and where to start a Medicaid application.',
  },
  {
    id: 'utility',
    title: 'How to Lower Utility Bills',
    duration: '2:58',
    category: 'resources',
    tags: ['Tips'],
    description: 'Practical ways to reduce monthly electricity, gas, water, and phone costs.',
  },
  {
    id: 'roth',
    title: 'How to Open a Roth IRA',
    duration: '4:44',
    category: 'finance',
    tags: ['Retirement'],
    description: 'A simple explanation of Roth IRA basics for long-term savings.',
  },
  {
    id: 'college',
    title: 'Saving for Kids College',
    duration: '6:08',
    category: 'finance',
    tags: ['529 plans'],
    description: 'Compare common education savings options and how to start small.',
  },
  {
    id: 'budget',
    title: 'Budgeting With EBT and Cash',
    duration: '3:21',
    category: 'finance',
    tags: ['Budgeting'],
    description: 'A weekly budget routine that works around benefits, bills, and groceries.',
  },
  {
    id: 'beans',
    title: 'Three Meals From Beans and Rice',
    duration: '7:12',
    category: 'food',
    tags: ['Meal prep'],
    description: 'Turn pantry staples into breakfast, lunch, and dinner options.',
  },
  {
    id: 'leftovers',
    title: 'Using Leftovers Safely',
    duration: '3:55',
    category: 'food',
    tags: ['Food waste'],
    description: 'Storage and reheating tips to stretch meals without wasting food.',
  },
];

export const nearbyResources: ResourceItem[] = [
  {
    id: 'burbank-food',
    tag: 'Food Pantry',
    name: 'Burbank Temporary Aid Center',
    distance: '0.8 mi',
    hours: 'Mon-Fri 9:00 AM - 5:00 PM',
    description: 'Provides food, clothing, and emergency assistance to families in need.',
    address: '2717 N. Naomi Street, Burbank, CA 91504',
    phone: '(818) 848-2392',
    website: 'www.burtac.org',
  },
  {
    id: 'rental-help',
    tag: 'Housing Support',
    name: 'Rental Housing Assistance Program',
    distance: '1.2 mi',
    hours: 'Mon-Fri 8:00 AM - 4:30 PM',
    description: 'Helps low-income families with rent assistance and housing stability.',
    address: '141 N. Glenoaks Blvd, Burbank, CA 91502',
    phone: '(818) 238-5340',
    website: 'www.burbankca.gov',
  },
  {
    id: 'utility-help',
    tag: 'Utility Assistance',
    name: 'Community Energy Relief Desk',
    distance: '2.6 mi',
    hours: 'Tue-Thu 10:00 AM - 3:00 PM',
    description: 'Screens households for utility bill assistance and payment plans.',
    address: '1212 Olive Avenue, Burbank, CA 91506',
    phone: '(818) 555-0147',
    website: 'www.energyrelief.example',
  },
];

export const benefitPrograms: BenefitProgram[] = [
  {
    id: 'snap',
    name: 'SNAP',
    agency: 'Food and Nutrition Service',
    estimate: 'Food benefits for monthly groceries',
    description: 'Monthly food assistance for eligible households.',
    requirements: ['Proof of identity', 'Income information', 'Household size', 'Housing costs'],
  },
  {
    id: 'wic',
    name: 'WIC',
    agency: 'State health departments',
    estimate: 'Nutrition support for parents and young children',
    description: 'Nutrition benefits and support for pregnant people, infants, and children.',
    requirements: ['Proof of residency', 'Income information', 'Child age or pregnancy status'],
  },
  {
    id: 'medicaid',
    name: 'Medicaid',
    agency: 'State Medicaid office',
    estimate: 'Low-cost or no-cost health coverage',
    description: 'Health coverage for eligible adults, children, pregnant people, and families.',
    requirements: ['Identity', 'Income information', 'Citizenship or eligible immigration status'],
  },
  {
    id: 'liheap',
    name: 'LIHEAP',
    agency: 'Energy assistance office',
    estimate: 'Help with heating and cooling bills',
    description: 'Utility bill support for eligible households.',
    requirements: ['Utility bill', 'Income information', 'Proof of address'],
  },
];

export const transactions: Transaction[] = [
  { id: 't1', store: 'Kroger', category: 'Groceries', type: 'EBT', amount: '-$42.18', section: 'TODAY' },
  { id: 't2', store: 'Instacart', category: 'Groceries', type: 'EBT', amount: '-$56.30', section: 'TODAY' },
  { id: 't3', store: 'Walmart', category: 'Groceries', type: 'EBT', amount: '-$28.55', section: 'YESTERDAY' },
  { id: 't4', store: 'Target', category: 'Household', type: 'Card', amount: '-$15.00', section: 'YESTERDAY' },
  { id: 't5', store: "Trader Joe's", category: 'Groceries', type: 'EBT', amount: '-$34.20', section: 'EARLIER THIS WEEK' },
  { id: 't6', store: 'CVS Pharmacy', category: 'Health', type: 'Card', amount: '-$18.40', section: 'EARLIER THIS WEEK' },
];

export const prescriptions = [
  { id: 'rx1', name: 'Generic Lipitor (Atorvastatin)', price: '$3.60/month', retail: 'Retail: $45', savings: 'Save 92%' },
  { id: 'rx2', name: 'Metformin', price: '$3.90/month', retail: 'Retail: $30', savings: 'Save 87%' },
];

export const spendingCategories = [
  { name: 'Housing', amount: '$842.89 (32%)', color: HiveColors.greenDark },
  { name: 'Groceries', amount: '$642.46 (25%)', color: HiveColors.green },
  { name: 'Transportation', amount: '$362.43 (15%)', color: '#6FBF75' },
  { name: 'Utilities', amount: '$244.18 (10%)', color: '#9CD39D' },
  { name: 'Other', amount: '$196.12 (8%)', color: '#C8E6C9' },
  { name: 'Entertainment', amount: '$154.82 (6%)', color: HiveColors.border },
];

export function makePantryItem(partial: Pick<PantryItem, 'name' | 'quantity' | 'location' | 'expirationDate'> & Partial<PantryItem>): PantryItem {
  return {
    id: partial.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: partial.name,
    quantity: partial.quantity,
    location: partial.location,
    expirationDate: partial.expirationDate,
    category: partial.category ?? 'Other',
    status: partial.status ?? 'active',
    dateAdded: partial.dateAdded ?? new Date().toISOString(),
    dateUsed: partial.dateUsed,
  };
}

export const initialPantryItems: PantryItem[] = [
  makePantryItem({
    id: 'p1',
    name: 'Milk',
    quantity: '1 gallon',
    location: 'Refrigerator',
    category: 'Dairy',
    expirationDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
  }),
  makePantryItem({
    id: 'p2',
    name: 'Black beans',
    quantity: '3 cans',
    location: 'Pantry',
    category: 'Canned goods',
    expirationDate: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
  }),
  makePantryItem({
    id: 'p3',
    name: 'Frozen vegetables',
    quantity: '2 bags',
    location: 'Freezer',
    category: 'Frozen',
    expirationDate: new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString(),
  }),
];
