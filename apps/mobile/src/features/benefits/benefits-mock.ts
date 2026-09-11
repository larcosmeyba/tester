/**
 * Preview-only in-memory benefits service.
 *
 * Every function here mirrors one export of `./benefits-repository`, but keeps
 * all state in module memory instead of calling the GraphQL server. The
 * repository delegates to this module only when `useMockServices` is true,
 * which is itself only ever true outside production builds, so this data can
 * never reach a production build.
 *
 * Purpose: let the whole benefits flow — programs, questionnaire, review,
 * signature, portal handoff, confirmation, checklist, renewals — run end to
 * end in the emulator with no backend deployed.
 *
 * The question sets, portal links, checklists, ZIP ranges, and program rules
 * below are ported from the server's Missouri SNAP implementation and its
 * reference tables, in reduced form. They are preview fixtures, not legal or
 * eligibility guidance.
 */

import type {
  BenefitsAnswerInput,
  BenefitsAnswerStatus,
  BenefitsApplicationStatus,
  BenefitsFieldStrength,
  BenefitsValueKind,
  SaveBenefitsGroupInput,
} from "@helpthehive/api-contract";
import type {
  BenefitsProgramRule,
  BenefitsRenewal,
} from "@/graphql/benefits-operations";
import type {
  BenefitsApplication,
  BenefitsChecklistSection,
  BenefitsFieldSpec,
  BenefitsFilledField,
  BenefitsForm,
  BenefitsMissingField,
  BenefitsPortal,
  BenefitsProfileData,
  BenefitsStateLookup,
} from "@/features/benefits/benefits-types";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const GROUP_APPLICANT = "applicant";
const GROUP_CONTACT = "contact";
const GROUP_ADDRESS = "address";
const GROUP_HOUSEHOLD = "household";
const GROUP_EMPLOYMENT = "employment";
const GROUP_INCOME = "income";
const GROUP_HOUSING = "housing";
const GROUP_UTILITIES = "utilities";
const GROUP_EXPENSES = "expenses";
const GROUP_RESOURCES = "resources";
const GROUP_BENEFITS = "benefits";
const GROUP_PROGRAM = "program";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
  "WA", "WV", "WI", "WY",
];

type SpecOptions = {
  choices?: string[];
  sensitive?: boolean;
  derived?: boolean;
  repeating?: boolean;
};

function spec(
  path: string,
  kind: BenefitsValueKind,
  group: string,
  label: string,
  question: string,
  opts: SpecOptions = {},
): BenefitsFieldSpec {
  return {
    fieldPath: path,
    kind,
    group,
    label,
    question,
    choices: opts.choices ?? [],
    isSensitive: opts.sensitive ?? false,
    isDerived: opts.derived ?? false,
    isRepeating: opts.repeating ?? false,
  };
}

const SEX_CHOICES = ["Female", "Male"];
const MARITAL_CHOICES = ["Single", "Married", "Divorced", "Separated", "Widowed"];
const PHONE_TYPE_CHOICES = ["Mobile", "Home", "Work", "Message"];
const CONTACT_METHOD_CHOICES = ["Phone", "Text", "Email", "Mail"];
const RELATIONSHIP_CHOICES = [
  "Spouse", "Child", "Stepchild", "Parent", "Sibling", "Grandparent",
  "Grandchild", "Partner", "Roommate", "Other",
];
const EMPLOYMENT_CHOICES = [
  "Employed", "Self-employed", "Unemployed", "Retired", "Student", "Unable to work",
];
const FREQUENCY_CHOICES = ["Weekly", "Every 2 weeks", "Twice a month", "Monthly", "Yearly"];
const INCOME_KIND_CHOICES = [
  "Wages", "Self-employment", "Social Security", "SSI", "Unemployment",
  "Child support", "Pension", "Veterans benefits", "Other",
];
const HOUSING_STATUS_CHOICES = ["Rent", "Own", "Staying with others", "Homeless", "Other"];
const MEDICAL_KIND_CHOICES = [
  "Doctor visits", "Prescriptions", "Dental", "Vision",
  "Health insurance premiums", "Other",
];
const ACCOUNT_KIND_CHOICES = ["Checking", "Savings", "Cash", "Other"];
const PROGRAM_BENEFIT_CHOICES = [
  "SNAP", "WIC", "Medicaid", "TANF", "SSI", "LIHEAP",
  "Housing assistance", "Childcare assistance",
];

const VOCABULARY: BenefitsFieldSpec[] = [
  // --- Applicant ---
  spec("applicant.first_name", "TEXT", GROUP_APPLICANT, "First name", "What is your first name?"),
  spec("applicant.middle_name", "TEXT", GROUP_APPLICANT, "Middle name", "What is your middle name, if you have one?"),
  spec("applicant.last_name", "TEXT", GROUP_APPLICANT, "Last name", "What is your last name?"),
  spec("applicant.suffix", "TEXT", GROUP_APPLICANT, "Suffix", "Do you use a suffix such as Jr. or III?"),
  spec("applicant.date_of_birth", "DATE", GROUP_APPLICANT, "Date of birth", "What is your date of birth?"),
  spec("applicant.ssn", "TEXT", GROUP_APPLICANT, "Social Security number", "What is your Social Security number?", { sensitive: true }),
  spec("applicant.sex", "CHOICE", GROUP_APPLICANT, "Sex", "What sex is recorded on your official documents?", { choices: SEX_CHOICES }),
  spec("applicant.marital_status", "CHOICE", GROUP_APPLICANT, "Marital status", "What is your marital status?", { choices: MARITAL_CHOICES }),
  spec("applicant.is_us_citizen", "BOOLEAN", GROUP_APPLICANT, "US citizen", "Are you a United States citizen?"),
  spec("applicant.immigration_status", "TEXT", GROUP_APPLICANT, "Immigration status", "What is your immigration status?", { sensitive: true }),
  spec("applicant.is_veteran", "BOOLEAN", GROUP_APPLICANT, "Veteran", "Have you served in the United States armed forces?"),
  spec("applicant.preferred_language", "TEXT", GROUP_APPLICANT, "Preferred language", "Which language would you prefer to be contacted in?"),
  spec("applicant.is_pregnant", "BOOLEAN", GROUP_APPLICANT, "Pregnant", "Are you pregnant?", { sensitive: true }),
  spec("applicant.has_disability", "BOOLEAN", GROUP_APPLICANT, "Disability", "Do you have a disability?", { sensitive: true }),
  spec("applicant.is_student", "BOOLEAN", GROUP_APPLICANT, "Student", "Are you enrolled as a student?"),

  // --- Contact ---
  spec("contact.email", "TEXT", GROUP_CONTACT, "Email", "What email address should we use?"),
  spec("contact.phone_primary", "TEXT", GROUP_CONTACT, "Phone", "What is the best phone number to reach you?"),
  spec("contact.phone_primary_type", "CHOICE", GROUP_CONTACT, "Phone type", "Is that a mobile, home, work or message number?", { choices: PHONE_TYPE_CHOICES }),
  spec("contact.phone_secondary", "TEXT", GROUP_CONTACT, "Second phone", "Is there another number we can use?"),
  spec("contact.preferred_contact_method", "CHOICE", GROUP_CONTACT, "Preferred contact", "How would you prefer to be contacted?", { choices: CONTACT_METHOD_CHOICES }),
  spec("contact.ok_to_text", "BOOLEAN", GROUP_CONTACT, "Texting allowed", "Is it alright for the agency to text you?"),
  spec("contact.needs_interpreter", "BOOLEAN", GROUP_CONTACT, "Interpreter needed", "Do you need an interpreter?"),
  spec("contact.interpreter_language", "TEXT", GROUP_CONTACT, "Interpreter language", "Which language do you need an interpreter for?"),

  // --- Address ---
  spec("address.residential.street1", "TEXT", GROUP_ADDRESS, "Street address", "What is your street address?"),
  spec("address.residential.street2", "TEXT", GROUP_ADDRESS, "Apartment or unit", "Is there an apartment or unit number?"),
  spec("address.residential.city", "TEXT", GROUP_ADDRESS, "City", "Which city do you live in?"),
  spec("address.residential.state", "CHOICE", GROUP_ADDRESS, "State", "Which state do you live in?", { choices: US_STATES }),
  spec("address.residential.postal_code", "TEXT", GROUP_ADDRESS, "ZIP code", "What is your ZIP code?"),
  spec("address.residential.county", "TEXT", GROUP_ADDRESS, "County", "Which county do you live in?"),
  spec("address.residential.is_homeless", "BOOLEAN", GROUP_ADDRESS, "Homeless", "Are you currently without a permanent address?"),
  spec("address.mailing.same_as_residential", "BOOLEAN", GROUP_ADDRESS, "Mail to home", "Should mail go to the address you just gave?"),
  spec("address.mailing.street1", "TEXT", GROUP_ADDRESS, "Mailing street", "What is your mailing street address?"),
  spec("address.mailing.street2", "TEXT", GROUP_ADDRESS, "Mailing unit", "Is there a mailing apartment or unit number?"),
  spec("address.mailing.city", "TEXT", GROUP_ADDRESS, "Mailing city", "What is the mailing city?"),
  spec("address.mailing.state", "CHOICE", GROUP_ADDRESS, "Mailing state", "What is the mailing state?", { choices: US_STATES }),
  spec("address.mailing.postal_code", "TEXT", GROUP_ADDRESS, "Mailing ZIP", "What is the mailing ZIP code?"),

  // --- Household ---
  spec("household.size", "NUMBER", GROUP_HOUSEHOLD, "Household size", "How many people live in your household, including you?"),
  spec("household.has_members_outside_home", "BOOLEAN", GROUP_HOUSEHOLD, "Members elsewhere", "Is anyone in your household temporarily living somewhere else?"),
  spec("household.members", "LIST", GROUP_HOUSEHOLD, "Other household members", "Who else lives in your household?", { repeating: true }),
  spec("household.members[].first_name", "TEXT", GROUP_HOUSEHOLD, "First name", "What is this household member's first name?"),
  spec("household.members[].last_name", "TEXT", GROUP_HOUSEHOLD, "Last name", "What is this household member's last name?"),
  spec("household.members[].date_of_birth", "DATE", GROUP_HOUSEHOLD, "Date of birth", "What is this household member's date of birth?"),
  spec("household.members[].relationship", "CHOICE", GROUP_HOUSEHOLD, "Relationship", "How is this person related to you?", { choices: RELATIONSHIP_CHOICES }),
  spec("household.members[].ssn", "TEXT", GROUP_HOUSEHOLD, "Social Security number", "What is this household member's Social Security number?", { sensitive: true }),
  spec("household.members[].sex", "CHOICE", GROUP_HOUSEHOLD, "Sex", "What sex is recorded for this household member?", { choices: SEX_CHOICES }),
  spec("household.members[].is_us_citizen", "BOOLEAN", GROUP_HOUSEHOLD, "US citizen", "Is this household member a United States citizen?"),
  spec("household.members[].immigration_status", "TEXT", GROUP_HOUSEHOLD, "Immigration status", "What is this household member's immigration status?", { sensitive: true }),
  spec("household.members[].is_applying", "BOOLEAN", GROUP_HOUSEHOLD, "Applying", "Is this household member applying for benefits too?"),
  spec("household.members[].buys_and_prepares_food_together", "BOOLEAN", GROUP_HOUSEHOLD, "Shares food", "Does this person buy and prepare food with you?"),
  spec("household.members[].is_student", "BOOLEAN", GROUP_HOUSEHOLD, "Student", "Is this household member a student?"),
  spec("household.members[].has_disability", "BOOLEAN", GROUP_HOUSEHOLD, "Disability", "Does this household member have a disability?", { sensitive: true }),
  spec("household.members[].is_pregnant", "BOOLEAN", GROUP_HOUSEHOLD, "Pregnant", "Is this household member pregnant?", { sensitive: true }),

  // --- Employment ---
  spec("employment.status", "CHOICE", GROUP_EMPLOYMENT, "Employment status", "What best describes your employment right now?", { choices: EMPLOYMENT_CHOICES }),
  spec("employment.is_self_employed", "BOOLEAN", GROUP_EMPLOYMENT, "Self-employed", "Are you self-employed?"),
  spec("employment.self_employment_monthly_net", "MONEY", GROUP_EMPLOYMENT, "Self-employment income", "About how much do you take home from self-employment each month, after expenses?"),
  spec("employment.jobs", "LIST", GROUP_EMPLOYMENT, "Jobs", "Does anyone in your household have a job right now?", { repeating: true }),
  spec("employment.jobs[].member_ref", "TEXT", GROUP_EMPLOYMENT, "Who works here", "Which household member holds this job?"),
  spec("employment.jobs[].employer_name", "TEXT", GROUP_EMPLOYMENT, "Employer", "What is the employer's name?"),
  spec("employment.jobs[].employer_phone", "TEXT", GROUP_EMPLOYMENT, "Employer phone", "What is the employer's phone number?"),
  spec("employment.jobs[].job_title", "TEXT", GROUP_EMPLOYMENT, "Job title", "What is the job title?"),
  spec("employment.jobs[].start_date", "DATE", GROUP_EMPLOYMENT, "Start date", "When did this job start?"),
  spec("employment.jobs[].end_date", "DATE", GROUP_EMPLOYMENT, "End date", "When did this job end?"),
  spec("employment.jobs[].hours_per_week", "NUMBER", GROUP_EMPLOYMENT, "Hours per week", "How many hours a week is this job?"),
  spec("employment.jobs[].pay_rate", "MONEY", GROUP_EMPLOYMENT, "Pay rate", "What is the pay rate for this job?"),
  spec("employment.jobs[].pay_frequency", "CHOICE", GROUP_EMPLOYMENT, "Pay frequency", "How often is this job paid?", { choices: FREQUENCY_CHOICES }),

  // --- Income ---
  spec("income.has_no_income", "BOOLEAN", GROUP_INCOME, "No income", "Does your household have no income at all right now?"),
  spec("income.monthly_gross_total", "MONEY", GROUP_INCOME, "Monthly gross income", "What is your household's total monthly income before deductions?", { derived: true }),
  spec("income.sources", "LIST", GROUP_INCOME, "Income sources", "What money comes into your household?", { repeating: true }),
  spec("income.sources[].member_ref", "TEXT", GROUP_INCOME, "Who receives it", "Which household member receives this income?"),
  spec("income.sources[].kind", "CHOICE", GROUP_INCOME, "Income type", "What kind of income is this?", { choices: INCOME_KIND_CHOICES }),
  spec("income.sources[].payer", "TEXT", GROUP_INCOME, "Paid by", "Who pays this income?"),
  spec("income.sources[].gross_amount", "MONEY", GROUP_INCOME, "Amount", "How much is this income before deductions?"),
  spec("income.sources[].frequency", "CHOICE", GROUP_INCOME, "How often", "How often is this income received?", { choices: FREQUENCY_CHOICES }),
  spec("income.sources[].start_date", "DATE", GROUP_INCOME, "Started", "When did this income start?"),
  spec("income.sources[].is_ongoing", "BOOLEAN", GROUP_INCOME, "Ongoing", "Is this income expected to continue?"),

  // --- Housing ---
  spec("housing.status", "CHOICE", GROUP_HOUSING, "Housing", "Do you rent, own, or something else?", { choices: HOUSING_STATUS_CHOICES }),
  spec("housing.rent_monthly", "MONEY", GROUP_HOUSING, "Monthly rent", "How much is your rent each month?"),
  spec("housing.mortgage_monthly", "MONEY", GROUP_HOUSING, "Monthly mortgage", "How much is your mortgage each month?"),
  spec("housing.property_tax_monthly", "MONEY", GROUP_HOUSING, "Property tax", "How much do you pay in property tax each month?"),
  spec("housing.home_insurance_monthly", "MONEY", GROUP_HOUSING, "Home insurance", "How much is your home insurance each month?"),
  spec("housing.is_subsidized", "BOOLEAN", GROUP_HOUSING, "Subsidized housing", "Do you receive help paying for housing?"),
  spec("housing.landlord_name", "TEXT", GROUP_HOUSING, "Landlord", "What is your landlord's name?"),
  spec("housing.landlord_phone", "TEXT", GROUP_HOUSING, "Landlord phone", "What is your landlord's phone number?"),
  spec("housing.total_shelter_monthly", "MONEY", GROUP_HOUSING, "Total shelter cost", "What do you pay for shelter each month in total?", { derived: true }),

  // --- Utilities ---
  spec("utilities.pays_heating_cooling", "BOOLEAN", GROUP_UTILITIES, "Heating or cooling", "Do you pay separately for heating or cooling?"),
  spec("utilities.pays_electricity", "BOOLEAN", GROUP_UTILITIES, "Electricity", "Do you pay for electricity?"),
  spec("utilities.pays_gas", "BOOLEAN", GROUP_UTILITIES, "Gas", "Do you pay for gas?"),
  spec("utilities.pays_water_sewer", "BOOLEAN", GROUP_UTILITIES, "Water and sewer", "Do you pay for water or sewer?"),
  spec("utilities.pays_trash", "BOOLEAN", GROUP_UTILITIES, "Trash", "Do you pay for trash collection?"),
  spec("utilities.pays_phone", "BOOLEAN", GROUP_UTILITIES, "Phone", "Do you pay for a phone?"),
  spec("utilities.monthly_total", "MONEY", GROUP_UTILITIES, "Monthly utilities", "About how much are your utilities each month in total?"),
  spec("utilities.received_liheap_last_12mo", "BOOLEAN", GROUP_UTILITIES, "LIHEAP received", "Have you received energy assistance in the last 12 months?"),

  // --- Expenses ---
  spec("expenses.child_support_paid_monthly", "MONEY", GROUP_EXPENSES, "Child support paid", "How much child support do you pay each month?"),
  spec("expenses.childcare_monthly_total", "MONEY", GROUP_EXPENSES, "Childcare total", "What do you pay for childcare each month in total?", { derived: true }),
  spec("expenses.medical_monthly_total", "MONEY", GROUP_EXPENSES, "Medical total", "What do you pay in medical costs each month in total?", { derived: true }),
  spec("expenses.childcare", "LIST", GROUP_EXPENSES, "Childcare costs", "Does your household pay for childcare?", { repeating: true }),
  spec("expenses.medical", "LIST", GROUP_EXPENSES, "Medical costs", "Does your household pay for medical costs?", { repeating: true }),
  spec("expenses.childcare[].member_ref", "TEXT", GROUP_EXPENSES, "Care for", "Which household member is this childcare for?"),
  spec("expenses.childcare[].provider_name", "TEXT", GROUP_EXPENSES, "Provider", "Who provides this childcare?"),
  spec("expenses.childcare[].monthly_amount", "MONEY", GROUP_EXPENSES, "Monthly cost", "How much is this childcare each month?"),
  spec("expenses.childcare[].reason", "TEXT", GROUP_EXPENSES, "Reason", "Why is this childcare needed?"),
  spec("expenses.medical[].member_ref", "TEXT", GROUP_EXPENSES, "For whom", "Which household member is this medical cost for?"),
  spec("expenses.medical[].kind", "CHOICE", GROUP_EXPENSES, "Type", "What kind of medical cost is this?", { choices: MEDICAL_KIND_CHOICES }),
  spec("expenses.medical[].monthly_amount", "MONEY", GROUP_EXPENSES, "Monthly cost", "How much is this medical cost each month?"),

  // --- Resources ---
  spec("resources.has_bank_accounts", "BOOLEAN", GROUP_RESOURCES, "Bank accounts", "Does anyone in your household have a bank account?"),
  spec("resources.accounts", "LIST", GROUP_RESOURCES, "Accounts", "Which accounts does your household hold?", { repeating: true }),
  spec("resources.vehicles", "LIST", GROUP_RESOURCES, "Vehicles", "Does your household own a vehicle?", { repeating: true }),
  spec("resources.accounts[].institution", "TEXT", GROUP_RESOURCES, "Bank", "Which bank or institution holds this account?"),
  spec("resources.accounts[].kind", "CHOICE", GROUP_RESOURCES, "Account type", "What kind of account is this?", { choices: ACCOUNT_KIND_CHOICES }),
  spec("resources.accounts[].balance", "MONEY", GROUP_RESOURCES, "Balance", "What is the current balance?"),
  spec("resources.vehicles[].year", "NUMBER", GROUP_RESOURCES, "Year", "What year is this vehicle?"),
  spec("resources.vehicles[].make", "TEXT", GROUP_RESOURCES, "Make", "What make is this vehicle?"),
  spec("resources.vehicles[].model", "TEXT", GROUP_RESOURCES, "Model", "What model is this vehicle?"),
  spec("resources.vehicles[].estimated_value", "MONEY", GROUP_RESOURCES, "Value", "About what is this vehicle worth?"),
  spec("resources.vehicles[].is_primary", "BOOLEAN", GROUP_RESOURCES, "Primary vehicle", "Is this your main vehicle?"),

  // --- Other benefits ---
  spec("benefits.currently_receiving", "LIST", GROUP_BENEFITS, "Current benefits", "Which benefits does your household already receive?", { choices: PROGRAM_BENEFIT_CHOICES }),
  spec("benefits.snap_case_number", "TEXT", GROUP_BENEFITS, "SNAP case number", "What is your SNAP case number, if you have one?", { sensitive: true }),
  spec("benefits.medicaid_case_number", "TEXT", GROUP_BENEFITS, "Medicaid case number", "What is your Medicaid case number, if you have one?", { sensitive: true }),
  spec("benefits.has_applied_before", "BOOLEAN", GROUP_BENEFITS, "Applied before", "Have you applied for this benefit before?"),

  // --- Program-specific ---
  spec("program.expedited_service_requested", "BOOLEAN", GROUP_PROGRAM, "Expedited service", "Do you need your application handled urgently?"),
  spec("program.authorized_representative.name", "TEXT", GROUP_PROGRAM, "Representative", "Is someone helping you apply on your behalf? What is their name?"),
  spec("program.authorized_representative.phone", "TEXT", GROUP_PROGRAM, "Representative phone", "What is their phone number?"),
  spec("program.authorized_representative.relationship", "TEXT", GROUP_PROGRAM, "Relationship", "How are they related to you?"),
];

const VOCAB_BY_PATH = new Map(VOCABULARY.map((s) => [s.fieldPath, s]));

const MOCK_VOCAB_VERSION = 1;

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const FORM_MO_SNAP = "mock-form-mo-snap";
const FORM_MO_WIC = "mock-form-mo-wic";
const FORM_MO_MEDICAID = "mock-form-mo-medicaid";
const FORM_MO_LIHEAP = "mock-form-mo-liheap";

function mockForm(
  id: string,
  key: string,
  program: string,
  state: string,
  formCode: string,
  formTitle: string,
): BenefitsForm {
  return {
    id,
    key,
    status: "ACTIVE",
    program,
    country: "US",
    state,
    formCode,
    formTitle,
    formVersion: "2024",
    revision: 1,
    pageCount: 8,
    templateKind: "ACROFORM",
    agencyUrl: null,
    mappedFieldCount: 30,
    fillableFieldCount: 96,
    effectiveDate: "2024-01-01",
    sourceUrl: null,
    retrievedAt: null,
  };
}

const MOCK_FORMS: BenefitsForm[] = [
  mockForm(FORM_MO_SNAP, "mo-snap@2024#1", "SNAP", "MO", "IM-1", "Missouri SNAP Application (IM-1)"),
  mockForm(FORM_MO_WIC, "mo-wic@2024#1", "WIC", "MO", "WIC-APP", "Missouri WIC Application"),
  mockForm(
    FORM_MO_MEDICAID,
    "mo-medicaid@2024#1",
    "Medicaid",
    "MO",
    "IM-1",
    "Missouri MO HealthNet Application (IM-1)",
  ),
  mockForm(
    FORM_MO_LIHEAP,
    "mo-liheap@2024#1",
    "LIHEAP",
    "MO",
    "LIHEAP-APP",
    "Missouri LIHEAP Energy Assistance Application",
  ),
];

function getFormOrThrow(formId: string): BenefitsForm {
  const form = MOCK_FORMS.find((f) => f.id === formId);
  if (!form) throw new Error(`Form ${formId} was not found.`);
  return form;
}

// ---------------------------------------------------------------------------
// Question sets (which vocabulary fields each form asks, and how strongly)
// ---------------------------------------------------------------------------

type QuestionRequirement = {
  fieldPath: string;
  strength: BenefitsFieldStrength;
};

/** Core identity/contact/address/household/employment/income/housing questions. */
const CORE_REQUIRED_PATHS = [
  "applicant.first_name",
  "applicant.last_name",
  "applicant.date_of_birth",
  "applicant.ssn",
  "applicant.is_us_citizen",
  "contact.phone_primary",
  "address.residential.street1",
  "address.residential.city",
  "address.residential.state",
  "address.residential.postal_code",
  "household.size",
  "employment.status",
  "income.has_no_income",
  "housing.status",
];

/** Extra SNAP context the Missouri form asks about (preferred, not blocking). */
const SNAP_PREFERRED_PATHS = [
  "applicant.marital_status",
  "contact.preferred_contact_method",
  "address.residential.county",
  "employment.is_self_employed",
  "income.sources",
  "housing.rent_monthly",
  "utilities.pays_heating_cooling",
  "utilities.pays_electricity",
  "utilities.monthly_total",
  "expenses.child_support_paid_monthly",
  "resources.has_bank_accounts",
  "benefits.currently_receiving",
  "benefits.has_applied_before",
  "program.expedited_service_requested",
];

function questionSetForForm(formId: string): QuestionRequirement[] {
  const core: QuestionRequirement[] = CORE_REQUIRED_PATHS.map((fieldPath) => ({
    fieldPath,
    strength: "REQUIRED",
  }));
  if (formId === FORM_MO_SNAP) {
    return core.concat(
      SNAP_PREFERRED_PATHS.map((fieldPath) => ({ fieldPath, strength: "PREFERRED" as const })),
    );
  }
  return core;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

type StoredProfileAnswer = {
  fieldPath: string;
  rowId: string | null;
  status: BenefitsAnswerStatus;
  kind: BenefitsValueKind;
  source: "USER";
  isSensitive: boolean;
  text: string | null;
  number: number | null;
  moneyCents: number | null;
  date: string | null;
  bool: boolean | null;
  list: string[] | null;
  hint: string | null;
};

type MockApplicationRecord = {
  id: string;
  formId: string;
  status: BenefitsApplicationStatus;
  createdAt: string;
  updatedAt: string;
  signedName: string | null;
  signedAt: string | null;
  approvedAt: string | null;
  confirmationNumber: string | null;
  confirmationRecordedAt: string | null;
  failureReason: string | null;
};

type MockRenewalRecord = {
  id: string;
  applicationId: string;
  program: string;
  state: string;
  formId: string;
  renewalDueAt: string;
  certificationEndsAt: string | null;
  status: string;
  reminderStage: number;
  source: string;
};

type MockStore = {
  profileAnswers: Map<string, StoredProfileAnswer>;
  profileGroups: Map<string, Array<{ rowId: string; answers: BenefitsAnswerInput[] }>>;
  applications: Map<string, MockApplicationRecord>;
  renewals: Map<string, MockRenewalRecord>;
  renewalAlertsEnabled: boolean;
  discreetLockScreen: boolean;
  seq: number;
};

function freshStore(): MockStore {
  return {
    profileAnswers: new Map(),
    profileGroups: new Map(),
    applications: new Map(),
    renewals: new Map(),
    renewalAlertsEnabled: true,
    discreetLockScreen: false,
    seq: 0,
  };
}

let store: MockStore = freshStore();

/** Test-only hook: clears every mock record. Never called from the app. */
export function __resetBenefitsMock(): void {
  store = freshStore();
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

const nowIso = () => new Date().toISOString();

function getApplicationOrThrow(applicationId: string): MockApplicationRecord {
  const record = store.applications.get(applicationId);
  if (!record) throw new Error("That application could not be found.");
  return record;
}

function getRenewalOrThrow(renewalId: string): MockRenewalRecord {
  const renewal = store.renewals.get(renewalId);
  if (!renewal) throw new Error("That renewal could not be found.");
  return renewal;
}

// ---------------------------------------------------------------------------
// View builders
// ---------------------------------------------------------------------------

function storeAnswer(input: BenefitsAnswerInput): StoredProfileAnswer {
  const vocab = VOCAB_BY_PATH.get(input.fieldPath);
  return {
    fieldPath: input.fieldPath,
    rowId: null,
    status: input.status,
    kind: vocab?.kind ?? "TEXT",
    source: "USER",
    isSensitive: vocab?.isSensitive ?? false,
    text: input.text ?? null,
    number: input.number ?? null,
    moneyCents: input.moneyCents ?? null,
    date: input.date ?? null,
    bool: input.bool ?? null,
    list: input.list ?? null,
    hint: null,
  };
}

/** PROVIDED/NONE/REFUSED answers satisfy a question; UNKNOWN does not. */
function isAnswered(fieldPath: string): boolean {
  const stored = store.profileAnswers.get(fieldPath);
  return (
    stored != null &&
    (stored.status === "PROVIDED" || stored.status === "NONE" || stored.status === "REFUSED")
  );
}

function toMissingField(requirement: QuestionRequirement): BenefitsMissingField {
  const vocab = VOCAB_BY_PATH.get(requirement.fieldPath);
  return {
    fieldPath: requirement.fieldPath,
    label: vocab?.label ?? requirement.fieldPath,
    question: vocab?.question ?? `What is ${requirement.fieldPath}?`,
    group: vocab?.group ?? "applicant",
    answerKind: vocab?.kind ?? "TEXT",
    choices: vocab?.choices ?? [],
    strength: requirement.strength,
    isSensitive: vocab?.isSensitive ?? false,
    isDerived: vocab?.isDerived ?? false,
    formFieldIds: [`mock:${requirement.fieldPath}`],
  };
}

function missingFieldsFor(record: MockApplicationRecord): BenefitsMissingField[] {
  return questionSetForForm(record.formId)
    .filter((q) => !isAnswered(q.fieldPath))
    .map(toMissingField);
}

function answerDisplayText(answer: StoredProfileAnswer): string | null {
  if (answer.isSensitive) return "•••";
  if (answer.text != null && answer.text !== "") return answer.text;
  if (answer.number != null) return String(answer.number);
  if (answer.moneyCents != null) return `$${(answer.moneyCents / 100).toFixed(2)}`;
  if (answer.date != null) return answer.date;
  if (answer.bool != null) return answer.bool ? "Yes" : "No";
  if (answer.list != null && answer.list.length > 0) return answer.list.join(", ");
  return null;
}

function filledFieldsFor(): BenefitsFilledField[] {
  const out: BenefitsFilledField[] = [];
  for (const answer of store.profileAnswers.values()) {
    if (answer.status !== "PROVIDED") continue;
    const vocab = VOCAB_BY_PATH.get(answer.fieldPath);
    out.push({
      fieldId: `mock:${answer.fieldPath}`,
      label: vocab?.label ?? answer.fieldPath,
      fieldPath: answer.fieldPath,
      page: 1,
      source: "USER",
      text: answerDisplayText(answer),
      checked: null,
      isCheckbox: false,
      isSensitive: answer.isSensitive,
    });
  }
  return out;
}

function toApplicationView(record: MockApplicationRecord): BenefitsApplication {
  return {
    id: record.id,
    status: record.status,
    failureReason: record.failureReason,
    draftDocumentPath: null,
    finalDocumentPath: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    approvedAt: record.approvedAt,
    signedName: record.signedName,
    signedAt: record.signedAt,
    confirmationNumber: record.confirmationNumber,
    confirmationRecordedAt: record.confirmationRecordedAt,
    form: getFormOrThrow(record.formId),
    filledFields: filledFieldsFor(),
    missingFields: missingFieldsFor(record),
    problems: [],
    skippedFields: [],
  };
}

function toProfileView(): BenefitsProfileData {
  return {
    vocabularyVersion: MOCK_VOCAB_VERSION,
    answers: [...store.profileAnswers.values()].map((a) => ({ ...a })),
    groups: [...store.profileGroups.entries()].map(([groupPath, rows]) => ({
      groupPath,
      collected: true,
      rows: rows.map((r) => ({
        rowId: r.rowId,
        answers: r.answers.map((a) => ({ ...storeAnswer(a), rowId: r.rowId })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Profile + vocabulary
// ---------------------------------------------------------------------------

export async function fetchBenefitsProfile(): Promise<BenefitsProfileData> {
  return toProfileView();
}

export async function fetchBenefitsVocabulary(): Promise<BenefitsFieldSpec[]> {
  return [...VOCABULARY];
}

export async function saveBenefitsAnswers(
  answers: BenefitsAnswerInput[],
): Promise<BenefitsProfileData> {
  for (const input of answers) {
    store.profileAnswers.set(input.fieldPath, storeAnswer(input));
  }
  return toProfileView();
}

export async function saveBenefitsGroup(
  input: SaveBenefitsGroupInput,
): Promise<BenefitsProfileData> {
  const rows = input.rows.map((row) => ({
    rowId: row.rowId ?? nextId("mock-row"),
    answers: row.answers,
  }));
  store.profileGroups.set(input.groupPath, rows);
  // Flatten the row answers into the profile so missing-field computation
  // stays single-sourced.
  for (const row of rows) {
    for (const answer of row.answers) {
      store.profileAnswers.set(answer.fieldPath, storeAnswer(answer));
    }
  }
  return toProfileView();
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function fetchBenefitsForms(
  state?: string,
  program?: string,
): Promise<BenefitsForm[]> {
  return MOCK_FORMS.filter((form) => {
    if (state && form.state?.toUpperCase() !== state.toUpperCase()) return false;
    if (program && form.program.toUpperCase() !== program.toUpperCase()) return false;
    return true;
  });
}

export async function fetchBenefitsApplications(): Promise<BenefitsApplication[]> {
  return [...store.applications.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toApplicationView);
}

export async function fetchBenefitsApplication(
  applicationId: string,
): Promise<BenefitsApplication | null> {
  const record = store.applications.get(applicationId);
  return record ? toApplicationView(record) : null;
}

function statusForMissing(missing: BenefitsMissingField[]): BenefitsApplicationStatus {
  return missing.some((m) => m.strength === "REQUIRED") ? "NEEDS_INFORMATION" : "READY_FOR_REVIEW";
}

export async function startBenefitsApplication(formId: string): Promise<BenefitsApplication> {
  const form = getFormOrThrow(formId);
  const now = nowIso();
  const record: MockApplicationRecord = {
    id: nextId("mock-app"),
    formId: form.id,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    signedName: null,
    signedAt: null,
    approvedAt: null,
    confirmationNumber: null,
    confirmationRecordedAt: null,
    failureReason: null,
  };
  record.status = statusForMissing(missingFieldsFor(record));
  store.applications.set(record.id, record);
  return toApplicationView(record);
}

export async function refillBenefitsApplication(
  applicationId: string,
): Promise<BenefitsApplication> {
  const record = getApplicationOrThrow(applicationId);
  if (record.status !== "COMPLETED") {
    record.status = statusForMissing(missingFieldsFor(record));
  }
  record.updatedAt = nowIso();
  return toApplicationView(record);
}

export async function approveBenefitsApplication(
  applicationId: string,
  signedName: string,
): Promise<BenefitsApplication> {
  const record = getApplicationOrThrow(applicationId);
  if (record.status === "COMPLETED") {
    throw new Error("This application has already been signed.");
  }
  const name = signedName.trim();
  if (name === "") {
    throw new Error("Please type your full name to sign.");
  }
  const requiredMissing = missingFieldsFor(record).filter((m) => m.strength === "REQUIRED");
  if (requiredMissing.length > 0) {
    throw new Error(
      `This application still needs ${requiredMissing.length} required answer${requiredMissing.length === 1 ? "" : "s"} before it can be signed.`,
    );
  }
  const now = nowIso();
  record.status = "COMPLETED";
  record.signedName = name;
  record.signedAt = now;
  record.approvedAt = now;
  record.updatedAt = now;
  scheduleMockRenewal(record, now);
  return toApplicationView(record);
}

export async function recordBenefitsConfirmation(
  applicationId: string,
  confirmationNumber: string,
): Promise<BenefitsApplication> {
  const record = getApplicationOrThrow(applicationId);
  const number = confirmationNumber.trim();
  if (number === "") {
    throw new Error("A confirmation number is required.");
  }
  record.confirmationNumber = number;
  record.confirmationRecordedAt = nowIso();
  record.updatedAt = record.confirmationRecordedAt;
  // Like the server: only a completed application feeds the renewal schedule.
  if (record.status === "COMPLETED") {
    const renewal = [...store.renewals.values()].find((r) => r.applicationId === record.id);
    if (renewal) {
      renewal.source = "user-confirmed";
    }
  }
  return toApplicationView(record);
}

export async function deleteBenefitsApplication(applicationId: string): Promise<boolean> {
  getApplicationOrThrow(applicationId);
  store.applications.delete(applicationId);
  return true;
}

// ---------------------------------------------------------------------------
// ZIP → state (FinCEN first-three-digit table, ported from the server)
// ---------------------------------------------------------------------------

type ZipRange = { lo: number; hi: number; code: string; isState: boolean };

const ZIP_RANGES: ZipRange[] = [
  { lo: 350, hi: 369, code: "AL", isState: true },
  { lo: 995, hi: 999, code: "AK", isState: true },
  { lo: 850, hi: 865, code: "AZ", isState: true },
  { lo: 716, hi: 729, code: "AR", isState: true }, { lo: 755, hi: 755, code: "AR", isState: true },
  { lo: 900, hi: 966, code: "CA", isState: true },
  { lo: 800, hi: 816, code: "CO", isState: true },
  { lo: 60, hi: 69, code: "CT", isState: true },
  { lo: 197, hi: 199, code: "DE", isState: true },
  { lo: 200, hi: 205, code: "DC", isState: true },
  { lo: 320, hi: 349, code: "FL", isState: true },
  { lo: 300, hi: 319, code: "GA", isState: true }, { lo: 398, hi: 399, code: "GA", isState: true },
  { lo: 967, hi: 968, code: "HI", isState: true },
  { lo: 832, hi: 838, code: "ID", isState: true },
  { lo: 600, hi: 629, code: "IL", isState: true },
  { lo: 460, hi: 479, code: "IN", isState: true },
  { lo: 500, hi: 528, code: "IA", isState: true },
  { lo: 660, hi: 679, code: "KS", isState: true },
  { lo: 400, hi: 427, code: "KY", isState: true },
  { lo: 700, hi: 714, code: "LA", isState: true },
  { lo: 39, hi: 49, code: "ME", isState: true },
  { lo: 206, hi: 219, code: "MD", isState: true },
  { lo: 10, hi: 27, code: "MA", isState: true },
  { lo: 480, hi: 499, code: "MI", isState: true },
  { lo: 550, hi: 567, code: "MN", isState: true },
  { lo: 386, hi: 397, code: "MS", isState: true },
  { lo: 630, hi: 658, code: "MO", isState: true },
  { lo: 590, hi: 599, code: "MT", isState: true },
  { lo: 680, hi: 693, code: "NE", isState: true },
  { lo: 889, hi: 898, code: "NV", isState: true },
  { lo: 30, hi: 39, code: "NH", isState: true },
  { lo: 70, hi: 89, code: "NJ", isState: true },
  { lo: 870, hi: 884, code: "NM", isState: true },
  { lo: 5, hi: 5, code: "NY", isState: true }, { lo: 63, hi: 63, code: "NY", isState: true }, { lo: 90, hi: 149, code: "NY", isState: true },
  { lo: 269, hi: 289, code: "NC", isState: true },
  { lo: 580, hi: 588, code: "ND", isState: true },
  { lo: 430, hi: 459, code: "OH", isState: true },
  { lo: 730, hi: 749, code: "OK", isState: true },
  { lo: 970, hi: 979, code: "OR", isState: true },
  { lo: 150, hi: 196, code: "PA", isState: true },
  { lo: 28, hi: 29, code: "RI", isState: true },
  { lo: 290, hi: 299, code: "SC", isState: true },
  { lo: 570, hi: 577, code: "SD", isState: true },
  { lo: 370, hi: 385, code: "TN", isState: true },
  { lo: 750, hi: 799, code: "TX", isState: true }, { lo: 885, hi: 885, code: "TX", isState: true },
  { lo: 840, hi: 847, code: "UT", isState: true },
  { lo: 50, hi: 59, code: "VT", isState: true },
  { lo: 201, hi: 201, code: "VA", isState: true }, { lo: 220, hi: 246, code: "VA", isState: true },
  { lo: 980, hi: 994, code: "WA", isState: true },
  { lo: 530, hi: 549, code: "WI", isState: true },
  { lo: 247, hi: 268, code: "WV", isState: true },
  { lo: 820, hi: 831, code: "WY", isState: true },
  // Territories and military post offices: not states, so they resolve to
  // null with an explanation rather than a code the portal registry cannot
  // route.
  { lo: 6, hi: 9, code: "PR", isState: false },
  { lo: 8, hi: 8, code: "VI", isState: false },
  { lo: 967, hi: 967, code: "AS", isState: false },
  { lo: 969, hi: 969, code: "GU", isState: false }, { lo: 969, hi: 969, code: "MH", isState: false },
  { lo: 969, hi: 969, code: "MP", isState: false }, { lo: 969, hi: 969, code: "PW", isState: false },
  { lo: 340, hi: 340, code: "AA", isState: false },
  { lo: 90, hi: 98, code: "AE", isState: false },
  { lo: 962, hi: 966, code: "AP", isState: false },
];

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};

function territoryName(code: string): string {
  switch (code) {
    case "PR": return "Puerto Rico";
    case "VI": return "the U.S. Virgin Islands";
    case "AS": return "American Samoa";
    case "GU": return "Guam";
    case "MH": return "the Marshall Islands";
    case "MP": return "the Northern Mariana Islands";
    case "PW": return "Palau";
    case "AA": return "a military post office (Armed Forces Americas)";
    case "AE": return "a military post office (Armed Forces Europe)";
    case "AP": return "a military post office (Armed Forces Pacific)";
    default: return code;
  }
}

export async function fetchStateFromZip(zip: string): Promise<BenefitsStateLookup> {
  const trimmed = zip.trim();
  if (trimmed.length !== 5 || !/^\d{5}$/.test(trimmed)) {
    return { zip: trimmed, state: null, detail: "A ZIP code must be exactly 5 digits." };
  }
  const prefix = Math.floor(parseInt(trimmed, 10) / 100);
  const matches = ZIP_RANGES.filter((r) => prefix >= r.lo && prefix <= r.hi);
  if (matches.length === 0) {
    return {
      zip: trimmed,
      state: null,
      detail: `ZIP ${trimmed} is not in the state lookup table, so no state was assumed. Enter your state manually.`,
    };
  }
  if (matches.length === 1) {
    const m = matches[0];
    if (!m.isState) {
      return {
        zip: trimmed,
        state: null,
        detail: `ZIP ${trimmed} belongs to ${territoryName(m.code)}, which is not a U.S. state, so no state was returned.`,
      };
    }
    return {
      zip: trimmed,
      state: m.code,
      detail: `ZIP ${trimmed} is in ${STATE_NAMES[m.code]}'s range.`,
    };
  }
  const codes = matches.map((m) => m.code).join(", ");
  return {
    zip: trimmed,
    state: null,
    detail: `ZIP ${trimmed}'s prefix is claimed by more than one entry (${codes}), so no state was assumed. Enter your state manually.`,
  };
}

// ---------------------------------------------------------------------------
// Portal handoff (official links only; nothing submitted by the app)
// ---------------------------------------------------------------------------

const SNAP_DIRECTORY_URL = "https://www.fns.usda.gov/snap/apply";
const BENEFIT_FINDER_URL = "https://www.usa.gov/benefit-finder";

/** Verified official application portals, ported from the server registry. */
const VERIFIED_PORTALS: Record<string, string> = {
  "SNAP|MO": "https://mydss.mo.gov/apply",
  "MEDICAID|MO": "https://mydss.mo.gov/apply",
};

const PROGRAM_DISPLAY: Record<string, string> = {
  SNAP: "SNAP",
  WIC: "WIC",
  MEDICAID: "Medicaid",
  LIHEAP: "LIHEAP",
};

function normalizeProgram(program: string): string {
  return program.trim().toUpperCase();
}

export async function fetchBenefitsPortal(
  program: string,
  state: string,
): Promise<BenefitsPortal> {
  const normalizedProgram = normalizeProgram(program);
  const normalizedState = state.trim().toUpperCase();
  const stateName = STATE_NAMES[normalizedState] ?? "your state";
  const programDisplay = PROGRAM_DISPLAY[normalizedProgram] ?? program;
  const url = VERIFIED_PORTALS[`${normalizedProgram}|${normalizedState}`] ?? null;
  if (url) {
    return {
      program: normalizedProgram,
      state: normalizedState,
      url,
      verified: true,
      fallbackGuidance: "",
    };
  }
  const fallbackGuidance =
    normalizedProgram === "SNAP"
      ? `No verified application link is on file for SNAP in ${stateName} yet. Apply on the state's official site — find it through the USDA's SNAP state directory at ${SNAP_DIRECTORY_URL} — or start at ${BENEFIT_FINDER_URL}. Only ever apply on a .gov site.`
      : `No verified application link is on file for ${programDisplay} in ${stateName} yet. Find the state's official application through ${BENEFIT_FINDER_URL}, and only ever apply on a .gov site.`;
  return {
    program: normalizedProgram,
    state: normalizedState,
    url: null,
    verified: false,
    fallbackGuidance,
  };
}

// ---------------------------------------------------------------------------
// Checklists (reference guidance, ported from the server)
// ---------------------------------------------------------------------------

type ChecklistItemInput = { label: string; detail: string; confirmOnPortal: boolean };
type ChecklistSectionInput = { phase: string; title: string; items: ChecklistItemInput[] };

function item(label: string, detail: string, confirmOnPortal: boolean): ChecklistItemInput {
  return { label, detail, confirmOnPortal };
}

function snapChecklist(stateName: string, portalCopy: string): ChecklistSectionInput[] {
  return [
    {
      phase: "before",
      title: "What to gather before you apply",
      items: [
        item(
          "Proof of identity",
          `A driver's license, state ID, or another photo ID for the person applying. Confirm exactly what ${stateName} accepts on ${portalCopy}.`,
          true,
        ),
        item(
          "Proof of where you live",
          `A lease, mortgage statement, utility bill, or mail showing your current address. Confirm what counts on ${portalCopy}.`,
          true,
        ),
        item(
          "Proof of income",
          "Recent pay stubs or other proof of income for household members who work, plus letters for any other income such as Social Security or child support.",
          false,
        ),
        item(
          "Proof of expenses",
          "Rent or mortgage, utility bills, child care costs, and out-of-pocket medical costs. The application may ask about these.",
          false,
        ),
        item(
          "Social Security numbers",
          "For the household members who are applying, if they have one. The portal explains what to do when someone doesn't have one.",
          false,
        ),
      ],
    },
    {
      phase: "during",
      title: "Filling out the application",
      items: [
        item(
          "Answer every required question",
          "An incomplete application can slow down a decision. Required fields are marked on the official form.",
          false,
        ),
        item(
          "The interview",
          `${stateName} may schedule a phone interview after you apply. Confirm how interviews work on ${portalCopy}, and keep your documents nearby for the call.`,
          true,
        ),
        item(
          "Sign and submit on the official portal",
          "Help The Hive prepares the paperwork; the application itself is submitted by you, on the state's official site, in your own session.",
          false,
        ),
      ],
    },
    {
      phase: "after",
      title: "After you apply",
      items: [
        item(
          "Watch for the decision notice",
          "The agency sends its decision in writing. If you move, update your address with the agency right away so the notice reaches you.",
          false,
        ),
        item(
          "Report changes",
          `Tell the agency about changes in income, household members, or address when your state requires it — check the reporting rules on ${portalCopy}.`,
          true,
        ),
        item(
          "Note your renewal date",
          "The approval notice shows how long the certification lasts. Help The Hive can remind you before it ends; the date on your notice is the one that counts.",
          false,
        ),
      ],
    },
  ];
}

function wicChecklist(stateName: string, portalCopy: string): ChecklistSectionInput[] {
  return [
    {
      phase: "before",
      title: "What to gather before you apply",
      items: [
        item(
          "Proof of identity",
          `A driver's license, state ID, or another photo ID. Confirm exactly what ${stateName} accepts on ${portalCopy}.`,
          true,
        ),
        item(
          "Proof of income",
          `The portal lists what counts as proof of income — confirm what ${stateName} accepts on ${portalCopy}.`,
          true,
        ),
        item(
          "Proof of where you live",
          `A lease, utility bill, or mail showing your current address. Confirm what counts on ${portalCopy}.`,
          true,
        ),
        item(
          "Children's records, if you have them",
          `Immunization records for the children being enrolled. The portal says exactly what to bring — confirm on ${portalCopy}.`,
          true,
        ),
      ],
    },
    {
      phase: "during",
      title: "Applying",
      items: [
        item(
          "Book the appointment",
          `Enrollment usually involves an appointment at a local clinic. Check ${portalCopy} for how appointments are scheduled in ${stateName}.`,
          true,
        ),
        item(
          "Bring everyone who is enrolling",
          `The appointment may need to include the children or infants being enrolled — confirm on ${portalCopy}.`,
          true,
        ),
        item(
          "Sign and submit on the official portal",
          "Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.",
          false,
        ),
      ],
    },
    {
      phase: "after",
      title: "After you apply",
      items: [
        item(
          "Ask how benefits are issued",
          `Your state will explain how benefits reach you — confirm the details on ${portalCopy}.`,
          true,
        ),
        item(
          "Keep your clinic appointments",
          "Stay in touch with the clinic about follow-up visits. Dates and requirements come from the clinic, not from this checklist.",
          false,
        ),
      ],
    },
  ];
}

function medicaidChecklist(stateName: string, portalCopy: string): ChecklistSectionInput[] {
  return [
    {
      phase: "before",
      title: "What to gather before you apply",
      items: [
        item(
          "Proof of identity and status",
          `A photo ID and the documents your state asks for about citizenship or immigration status — confirm the list on ${portalCopy}.`,
          true,
        ),
        item(
          "Proof of income",
          "Recent pay stubs, tax returns, or letters for other income such as Social Security or unemployment.",
          false,
        ),
        item(
          "Current health coverage",
          "Information about any insurance you have now, including an employer plan or Medicare.",
          false,
        ),
        item(
          "Social Security numbers",
          "For the household members who are applying, if they have one.",
          false,
        ),
      ],
    },
    {
      phase: "during",
      title: "Filling out the application",
      items: [
        item(
          "Find where to apply",
          `Some states use their own portal and some use the federal marketplace — ${portalCopy} says which one ${stateName} uses.`,
          true,
        ),
        item(
          "Have information for the whole household",
          "Have information ready for everyone in the household, even people who aren't applying.",
          false,
        ),
        item(
          "Answer every required question",
          "An incomplete application can slow down a decision. Required fields are marked on the official form.",
          false,
        ),
      ],
    },
    {
      phase: "after",
      title: "After you apply",
      items: [
        item(
          "Choose a health plan if asked",
          "Some states ask you to pick a managed care plan after approval — the notice explains how.",
          false,
        ),
        item(
          "Report changes",
          `Tell the agency about changes in income, household, or address when your state requires it — check the reporting rules on ${portalCopy}.`,
          true,
        ),
        item(
          "Note your renewal date",
          "Coverage is renewed periodically. The date on your notice is the one that counts; Help The Hive can remind you before it ends.",
          false,
        ),
      ],
    },
  ];
}

function liheapChecklist(stateName: string, portalCopy: string): ChecklistSectionInput[] {
  return [
    {
      phase: "before",
      title: "What to gather before you apply",
      items: [
        item(
          "Recent utility bills",
          "The bill for the heating or cooling you need help with, showing the account holder and the amount due.",
          false,
        ),
        item("Proof of income", "Recent pay stubs or other proof of household income.", false),
        item(
          "Proof of identity and address",
          `A photo ID and something showing your current address — confirm exactly what ${stateName} accepts on ${portalCopy}.`,
          true,
        ),
      ],
    },
    {
      phase: "during",
      title: "Applying",
      items: [
        item(
          "Check the application window",
          `LIHEAP often opens for limited seasons. Confirm the dates for ${stateName} on ${portalCopy} before you start.`,
          true,
        ),
        item(
          "Apply for the right kind of help",
          `Heating, cooling, and crisis help can be separate. Confirm what ${stateName} offers on ${portalCopy}.`,
          true,
        ),
        item(
          "Sign and submit on the official portal",
          "Help The Hive prepares the paperwork; the application itself is submitted by you, on the official site, in your own session.",
          false,
        ),
      ],
    },
    {
      phase: "after",
      title: "After you apply",
      items: [
        item(
          "Ask how the benefit is delivered",
          `In many states the payment goes straight to the utility company. Confirm how it works in ${stateName} on ${portalCopy}.`,
          true,
        ),
        item(
          "If you're facing a shutoff, say so",
          `Ask about crisis assistance if your heat is shut off or you're nearly out of fuel — confirm availability on ${portalCopy}.`,
          true,
        ),
      ],
    },
  ];
}

function genericChecklist(programDisplay: string): ChecklistSectionInput[] {
  return [
    {
      phase: "before",
      title: "What to gather before you apply",
      items: [
        item(
          "Proof of identity",
          "A driver's license, state ID, or another photo ID for the person applying.",
          false,
        ),
        item(
          "Proof of where you live",
          "A lease, mortgage statement, utility bill, or mail showing your current address.",
          false,
        ),
        item(
          "Proof of income",
          "Recent pay stubs or letters for other income such as Social Security or child support.",
          false,
        ),
      ],
    },
    {
      phase: "during",
      title: "Applying",
      items: [
        item(
          "Apply on the official portal",
          `Help The Hive prepares the paperwork; the ${programDisplay} application itself is submitted by you, on the official site, in your own session.`,
          false,
        ),
      ],
    },
    {
      phase: "after",
      title: "After you apply",
      items: [
        item(
          "Watch for notices",
          "The agency sends its decision in writing. Respond by the date on any notice you receive.",
          false,
        ),
        item(
          "Keep copies",
          "Keep a copy of everything you submit and every notice you receive.",
          false,
        ),
      ],
    },
  ];
}

export async function fetchBenefitsChecklist(
  program: string,
  state: string,
): Promise<BenefitsChecklistSection[]> {
  const normalizedProgram = normalizeProgram(program);
  const normalizedState = state.trim().toUpperCase();
  const stateName = STATE_NAMES[normalizedState] ?? "your state";
  const portalCopy = "your state's official portal";
  let sections: ChecklistSectionInput[];
  switch (normalizedProgram) {
    case "SNAP":
      sections = snapChecklist(stateName, portalCopy);
      break;
    case "WIC":
      sections = wicChecklist(stateName, portalCopy);
      break;
    case "MEDICAID":
      sections = medicaidChecklist(stateName, portalCopy);
      break;
    case "LIHEAP":
      sections = liheapChecklist(stateName, portalCopy);
      break;
    default:
      sections = genericChecklist(PROGRAM_DISPLAY[normalizedProgram] ?? program);
      break;
  }
  return sections.map((s) => ({
    phase: s.phase,
    title: s.title,
    items: s.items.map((i) => ({
      label: i.label,
      detail: i.detail,
      confirmOnPortal: i.confirmOnPortal,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Program rules + renewals
// ---------------------------------------------------------------------------

const MOCK_PROGRAM_RULES: BenefitsProgramRule[] = [
  {
    program: "SNAP",
    state: "*",
    certPeriodMonths: 12,
    sourceCitation: "7 CFR 273.10(f)",
    notes:
      "Typical 12-month certification period. Households with all elderly or disabled members may be certified for 24-36 months; some states certify certain households for 6 months. Presented to users as \"typical — confirm yours\".",
  },
  {
    program: "Medicaid",
    state: "*",
    certPeriodMonths: 12,
    sourceCitation: "42 CFR 435.916",
    notes: "Annual renewal of eligibility is required. Presented to users as \"typical — confirm yours\".",
  },
  {
    program: "WIC",
    state: "*",
    certPeriodMonths: 12,
    sourceCitation: "7 CFR 246.7(g)",
    notes:
      "Certification periods depend on participant category, up to 12 months (children up to one year; infants about every six months). 12 months is the typical maximum. Presented to users as \"typical — confirm yours\".",
  },
];

export async function fetchBenefitsProgramRules(
  program?: string,
): Promise<BenefitsProgramRule[]> {
  if (!program) return [...MOCK_PROGRAM_RULES];
  return MOCK_PROGRAM_RULES.filter((r) => r.program.toUpperCase() === program.toUpperCase());
}

function certMonthsForProgram(program: string): number {
  const rule = MOCK_PROGRAM_RULES.find((r) => r.program.toUpperCase() === program.toUpperCase());
  return rule?.certPeriodMonths ?? 12;
}

function scheduleMockRenewal(record: MockApplicationRecord, approvedAtIso: string): void {
  const form = getFormOrThrow(record.formId);
  const months = certMonthsForProgram(form.program);
  const approvedAt = new Date(approvedAtIso);
  const due = new Date(approvedAt);
  due.setMonth(due.getMonth() + months);
  const dueIso = due.toISOString();
  store.renewals.set(nextId("mock-renewal"), {
    id: `mock-renewal-${store.seq}`,
    applicationId: record.id,
    program: form.program,
    state: form.state ?? "",
    formId: form.id,
    renewalDueAt: dueIso,
    certificationEndsAt: dueIso,
    status: "scheduled",
    reminderStage: 0,
    source: "rule-derived",
  });
}

function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso) - Date.now()) / 86400000);
}

function toRenewalView(record: MockRenewalRecord): BenefitsRenewal {
  return {
    id: record.id,
    program: record.program,
    state: record.state,
    formId: record.formId,
    renewalDueAt: record.renewalDueAt,
    certificationEndsAt: record.certificationEndsAt,
    status: record.status,
    reminderStage: record.reminderStage,
    source: record.source,
    daysRemaining: daysUntil(record.renewalDueAt),
  };
}

export async function fetchBenefitsRenewals(): Promise<BenefitsRenewal[]> {
  return [...store.renewals.values()]
    .sort((a, b) => (a.renewalDueAt < b.renewalDueAt ? -1 : 1))
    .map(toRenewalView);
}

export async function confirmBenefitsRenewalDeadline(
  renewalId: string,
  renewalDueAt: string,
): Promise<BenefitsRenewal> {
  const renewal = getRenewalOrThrow(renewalId);
  const due = new Date(renewalDueAt);
  if (Number.isNaN(due.getTime())) {
    throw new Error("That renewal date is not valid.");
  }
  renewal.renewalDueAt = due.toISOString();
  renewal.certificationEndsAt = due.toISOString();
  renewal.source = "user-confirmed";
  if (renewal.status === "dismissed") renewal.status = "scheduled";
  return toRenewalView(renewal);
}

export async function startBenefitsRenewalApplication(
  renewalId: string,
): Promise<BenefitsApplication> {
  const renewal = getRenewalOrThrow(renewalId);
  const form = getFormOrThrow(renewal.formId);
  const now = nowIso();
  const record: MockApplicationRecord = {
    id: nextId("mock-app"),
    formId: form.id,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    signedName: null,
    signedAt: null,
    approvedAt: null,
    confirmationNumber: null,
    confirmationRecordedAt: null,
    failureReason: null,
  };
  record.status = statusForMissing(missingFieldsFor(record));
  store.applications.set(record.id, record);
  renewal.status = "started";
  return toApplicationView(record);
}

export async function dismissBenefitsRenewal(renewalId: string): Promise<boolean> {
  const renewal = getRenewalOrThrow(renewalId);
  renewal.status = "dismissed";
  return true;
}

export async function updateBenefitsRenewalPreferences(
  renewalAlertsEnabled: boolean,
  discreetLockScreen: boolean,
): Promise<boolean> {
  store.renewalAlertsEnabled = renewalAlertsEnabled;
  store.discreetLockScreen = discreetLockScreen;
  return true;
}
