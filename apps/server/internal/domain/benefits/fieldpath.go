package benefits

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// VocabularyVersion is the version of the field-path language below. A mapping
// file declares the version it was written against, so a form authored last
// year cannot be silently reinterpreted by a renamed path.
const VocabularyVersion = 1

// FieldPath names one answer in the Help The Hive benefits profile. Mapping
// files address these, never database columns, so the storage schema can change
// without invalidating a single form mapping.
//
// A path in the vocabulary uses an empty subscript for a repeating group —
// "household.members[].last_name". A path resolved against a real profile
// carries the index — "household.members[2].last_name".
type FieldPath string

var (
	templatePathPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*(\[\])?(\.[a-z][a-z0-9_]*(\[\])?)*$`)
	subscriptPattern    = regexp.MustCompile(`\[(\d*)\]`)
)

func (p FieldPath) String() string { return string(p) }

// Template strips any indices, turning a resolved path back into the vocabulary
// path it belongs to.
func (p FieldPath) Template() FieldPath {
	return FieldPath(subscriptPattern.ReplaceAllString(string(p), "[]"))
}

// Indexed substitutes n into the path's single empty subscript.
func (p FieldPath) Indexed(n int) (FieldPath, error) {
	if n < 0 {
		return "", fmt.Errorf("field path %q: negative index %d", p, n)
	}
	if !strings.Contains(string(p), "[]") {
		return "", fmt.Errorf("field path %q is not a repeating path", p)
	}
	return FieldPath(strings.Replace(string(p), "[]", "["+strconv.Itoa(n)+"]", 1)), nil
}

// Repeating reports whether the path addresses a member of a repeating group.
func (p FieldPath) Repeating() bool { return strings.Contains(string(p), "[]") }

// GroupPath returns the repeating group a path belongs to —
// "household.members[].last_name" -> "household.members" — and false for a
// scalar path.
func (p FieldPath) GroupPath() (FieldPath, bool) {
	i := strings.Index(string(p), "[]")
	if i < 0 {
		return "", false
	}
	return FieldPath(p[:i]), true
}

// FieldSpec describes one path: how it is typed, how the app should ask for it,
// and whether it is sensitive enough that its value must never be logged or
// returned in full.
type FieldSpec struct {
	Path FieldPath
	Kind ValueKind
	// Group is the questionnaire section, used to batch what the app asks.
	Group string
	// Label is the short name shown on the review screen.
	Label string
	// Question is the wording the app puts to the user when the value is missing.
	Question string
	// Choices constrains a KindChoice or KindList answer.
	Choices []string
	// Sensitive values are returned masked, never logged, and never sent to an
	// AI provider under any circumstance.
	Sensitive bool
	// Derived values are computed from other answers and cannot be set directly.
	Derived bool
	// NeverAsk marks a path the app must never prompt for, no matter what a
	// form mapping demands. Collection policy, not form policy: the official
	// form still needs the value (Social Security numbers), so autofill
	// leaves the box blank and the filing kit prints a hand-write line
	// instead. Nothing about the path is removed — mappings, transforms,
	// and the masked-value machinery keep working for any legacy data.
	NeverAsk bool
}

// Group names, used by the app to batch questions into screens.
const (
	GroupApplicant  = "applicant"
	GroupContact    = "contact"
	GroupAddress    = "address"
	GroupHousehold  = "household"
	GroupEmployment = "employment"
	GroupIncome     = "income"
	GroupHousing    = "housing"
	GroupUtilities  = "utilities"
	GroupExpenses   = "expenses"
	GroupResources  = "resources"
	GroupBenefits   = "benefits"
	GroupProgram    = "program"
)

var (
	relationshipChoices = []string{
		"self", "spouse", "domestic_partner", "child", "stepchild", "foster_child",
		"parent", "stepparent", "grandparent", "grandchild", "sibling",
		"other_relative", "unrelated",
	}
	frequencyChoices = []string{
		"hourly", "daily", "weekly", "biweekly", "semimonthly", "monthly",
		"quarterly", "annually", "one_time",
	}
	incomeKindChoices = []string{
		"wages", "self_employment", "unemployment", "social_security", "ssi", "ssdi",
		"pension", "veterans", "child_support_received", "alimony_received",
		"workers_compensation", "rental", "cash_assistance", "student_aid",
		"contributions", "other",
	}
	housingStatusChoices  = []string{"rent", "own", "shared", "shelter", "homeless", "no_cost"}
	employmentChoices     = []string{"employed_full_time", "employed_part_time", "self_employed", "unemployed", "retired", "student", "unable_to_work", "seasonal"}
	maritalChoices        = []string{"single", "married", "domestic_partnership", "separated", "divorced", "widowed"}
	sexChoices            = []string{"female", "male", "other", "decline_to_state"}
	phoneTypeChoices      = []string{"mobile", "home", "work", "message"}
	contactMethodChoices  = []string{"phone", "text", "email", "mail"}
	programBenefitChoices = []string{"snap", "medicaid", "tanf", "wic", "ssi", "ssdi", "liheap", "section8", "unemployment", "school_meals", "head_start"}
	expenseMedicalKinds   = []string{"premium", "prescription", "doctor", "dental", "vision", "transportation", "medical_equipment", "other"}
	accountKindChoices    = []string{"checking", "savings", "prepaid", "cash", "investment", "other"}
)

var vocabulary = buildVocabulary()

// Vocabulary is the full field-path language, keyed by template path.
func Vocabulary() map[FieldPath]FieldSpec {
	out := make(map[FieldPath]FieldSpec, len(vocabulary))
	for k, v := range vocabulary {
		out[k] = v
	}
	return out
}

// Lookup finds the spec for a path, indexed or not.
func Lookup(p FieldPath) (FieldSpec, bool) {
	spec, ok := vocabulary[p.Template()]
	return spec, ok
}

// ValidatePath reports whether a path is well-formed and in the vocabulary.
func ValidatePath(p FieldPath) error {
	if !templatePathPattern.MatchString(string(p.Template())) {
		return fmt.Errorf("field path %q is not well formed", p)
	}
	if _, ok := vocabulary[p.Template()]; !ok {
		return fmt.Errorf("field path %q is not in vocabulary v%d", p, VocabularyVersion)
	}
	return nil
}

// RepeatingGroups are the paths a mapping may repeat over.
func RepeatingGroups() []FieldPath {
	return []FieldPath{
		"household.members",
		"employment.jobs",
		"income.sources",
		"expenses.childcare",
		"expenses.medical",
		"resources.accounts",
		"resources.vehicles",
	}
}

func spec(path FieldPath, kind ValueKind, group, label, question string, opts ...func(*FieldSpec)) FieldSpec {
	s := FieldSpec{Path: path, Kind: kind, Group: group, Label: label, Question: question}
	for _, opt := range opts {
		opt(&s)
	}
	return s
}

func choices(c []string) func(*FieldSpec) {
	return func(s *FieldSpec) { s.Choices = c }
}

func sensitive() func(*FieldSpec) {
	return func(s *FieldSpec) { s.Sensitive = true }
}

func derived() func(*FieldSpec) {
	return func(s *FieldSpec) { s.Derived = true }
}

func neverAsk() func(*FieldSpec) {
	return func(s *FieldSpec) { s.NeverAsk = true }
}

func buildVocabulary() map[FieldPath]FieldSpec {
	specs := []FieldSpec{
		// --- Applicant -----------------------------------------------------
		spec("applicant.first_name", KindText, GroupApplicant, "First name", "What is your first name?"),
		spec("applicant.middle_name", KindText, GroupApplicant, "Middle name", "What is your middle name, if you have one?"),
		spec("applicant.last_name", KindText, GroupApplicant, "Last name", "What is your last name?"),
		spec("applicant.suffix", KindText, GroupApplicant, "Suffix", "Do you use a suffix such as Jr. or III?"),
		spec("applicant.date_of_birth", KindDate, GroupApplicant, "Date of birth", "What is your date of birth?"),
		spec("applicant.ssn", KindText, GroupApplicant, "Social Security number", "What is your Social Security number?", sensitive(), neverAsk()),
		spec("applicant.sex", KindChoice, GroupApplicant, "Sex", "What sex is recorded on your official documents?", choices(sexChoices)),
		spec("applicant.marital_status", KindChoice, GroupApplicant, "Marital status", "What is your marital status?", choices(maritalChoices)),
		spec("applicant.is_us_citizen", KindBoolean, GroupApplicant, "US citizen", "Are you a United States citizen?"),
		spec("applicant.immigration_status", KindText, GroupApplicant, "Immigration status", "What is your immigration status?", sensitive()),
		spec("applicant.is_veteran", KindBoolean, GroupApplicant, "Veteran", "Have you served in the United States armed forces?"),
		spec("applicant.preferred_language", KindText, GroupApplicant, "Preferred language", "Which language would you prefer to be contacted in?"),
		spec("applicant.is_pregnant", KindBoolean, GroupApplicant, "Pregnant", "Are you pregnant?", sensitive()),
		spec("applicant.has_disability", KindBoolean, GroupApplicant, "Disability", "Do you have a disability?", sensitive()),
		spec("applicant.is_student", KindBoolean, GroupApplicant, "Student", "Are you enrolled as a student?"),

		// --- Contact -------------------------------------------------------
		spec("contact.email", KindText, GroupContact, "Email", "What email address should we use?"),
		spec("contact.phone_primary", KindText, GroupContact, "Phone", "What is the best phone number to reach you?"),
		spec("contact.phone_primary_type", KindChoice, GroupContact, "Phone type", "Is that a mobile, home, work or message number?", choices(phoneTypeChoices)),
		spec("contact.phone_secondary", KindText, GroupContact, "Second phone", "Is there another number we can use?"),
		spec("contact.preferred_contact_method", KindChoice, GroupContact, "Preferred contact", "How would you prefer to be contacted?", choices(contactMethodChoices)),
		spec("contact.ok_to_text", KindBoolean, GroupContact, "Texting allowed", "Is it alright for the agency to text you?"),
		spec("contact.needs_interpreter", KindBoolean, GroupContact, "Interpreter needed", "Do you need an interpreter?"),
		spec("contact.interpreter_language", KindText, GroupContact, "Interpreter language", "Which language do you need an interpreter for?"),

		// --- Address -------------------------------------------------------
		spec("address.residential.street1", KindText, GroupAddress, "Street address", "What is your street address?"),
		spec("address.residential.street2", KindText, GroupAddress, "Apartment or unit", "Is there an apartment or unit number?"),
		spec("address.residential.city", KindText, GroupAddress, "City", "Which city do you live in?"),
		spec("address.residential.state", KindChoice, GroupAddress, "State", "Which state do you live in?", choices(USStates())),
		spec("address.residential.postal_code", KindText, GroupAddress, "ZIP code", "What is your ZIP code?"),
		spec("address.residential.county", KindText, GroupAddress, "County", "Which county do you live in?"),
		spec("address.residential.is_homeless", KindBoolean, GroupAddress, "Homeless", "Are you currently without a permanent address?"),
		spec("address.mailing.same_as_residential", KindBoolean, GroupAddress, "Mail to home", "Should mail go to the address you just gave?"),
		spec("address.mailing.street1", KindText, GroupAddress, "Mailing street", "What is your mailing street address?"),
		spec("address.mailing.street2", KindText, GroupAddress, "Mailing unit", "Is there a mailing apartment or unit number?"),
		spec("address.mailing.city", KindText, GroupAddress, "Mailing city", "What is the mailing city?"),
		spec("address.mailing.state", KindChoice, GroupAddress, "Mailing state", "What is the mailing state?", choices(USStates())),
		spec("address.mailing.postal_code", KindText, GroupAddress, "Mailing ZIP", "What is the mailing ZIP code?"),

		// --- Household -----------------------------------------------------
		// Asked directly rather than counted from the roster. Counting would turn
		// "we have not collected the roster yet" into "this person lives alone",
		// which is exactly the kind of invented answer this package forbids. The
		// roster is cross-checked against it and any disagreement is reported.
		spec("household.size", KindNumber, GroupHousehold, "Household size", "How many people live in your household, including you?"),
		spec("household.has_members_outside_home", KindBoolean, GroupHousehold, "Members elsewhere", "Is anyone in your household temporarily living somewhere else?"),
		spec("household.members", KindList, GroupHousehold, "Other household members", "Who else lives in your household?"),
		spec("household.members[].first_name", KindText, GroupHousehold, "First name", "What is this household member's first name?"),
		spec("household.members[].last_name", KindText, GroupHousehold, "Last name", "What is this household member's last name?"),
		spec("household.members[].date_of_birth", KindDate, GroupHousehold, "Date of birth", "What is this household member's date of birth?"),
		spec("household.members[].relationship", KindChoice, GroupHousehold, "Relationship", "How is this person related to you?", choices(relationshipChoices)),
		spec("household.members[].ssn", KindText, GroupHousehold, "Social Security number", "What is this household member's Social Security number?", sensitive(), neverAsk()),
		spec("household.members[].sex", KindChoice, GroupHousehold, "Sex", "What sex is recorded for this household member?", choices(sexChoices)),
		spec("household.members[].is_us_citizen", KindBoolean, GroupHousehold, "US citizen", "Is this household member a United States citizen?"),
		spec("household.members[].immigration_status", KindText, GroupHousehold, "Immigration status", "What is this household member's immigration status?", sensitive()),
		spec("household.members[].is_applying", KindBoolean, GroupHousehold, "Applying", "Is this household member applying for benefits too?"),
		spec("household.members[].buys_and_prepares_food_together", KindBoolean, GroupHousehold, "Shares food", "Does this person buy and prepare food with you?"),
		spec("household.members[].is_student", KindBoolean, GroupHousehold, "Student", "Is this household member a student?"),
		spec("household.members[].has_disability", KindBoolean, GroupHousehold, "Disability", "Does this household member have a disability?", sensitive()),
		spec("household.members[].is_pregnant", KindBoolean, GroupHousehold, "Pregnant", "Is this household member pregnant?", sensitive()),

		// --- Employment ----------------------------------------------------
		spec("employment.status", KindChoice, GroupEmployment, "Employment status", "What best describes your employment right now?", choices(employmentChoices)),
		spec("employment.is_self_employed", KindBoolean, GroupEmployment, "Self-employed", "Are you self-employed?"),
		spec("employment.self_employment_monthly_net", KindMoney, GroupEmployment, "Self-employment income", "About how much do you take home from self-employment each month, after expenses?"),
		spec("employment.jobs", KindList, GroupEmployment, "Jobs", "Does anyone in your household have a job right now?"),
		spec("employment.jobs[].member_ref", KindText, GroupEmployment, "Who works here", "Which household member holds this job?"),
		spec("employment.jobs[].employer_name", KindText, GroupEmployment, "Employer", "What is the employer's name?"),
		spec("employment.jobs[].employer_phone", KindText, GroupEmployment, "Employer phone", "What is the employer's phone number?"),
		spec("employment.jobs[].job_title", KindText, GroupEmployment, "Job title", "What is the job title?"),
		spec("employment.jobs[].start_date", KindDate, GroupEmployment, "Start date", "When did this job start?"),
		spec("employment.jobs[].end_date", KindDate, GroupEmployment, "End date", "When did this job end?"),
		spec("employment.jobs[].hours_per_week", KindNumber, GroupEmployment, "Hours per week", "How many hours a week is this job?"),
		spec("employment.jobs[].pay_rate", KindMoney, GroupEmployment, "Pay rate", "What is the pay rate for this job?"),
		spec("employment.jobs[].pay_frequency", KindChoice, GroupEmployment, "Pay frequency", "How often is this job paid?", choices(frequencyChoices)),

		// --- Income --------------------------------------------------------
		spec("income.has_no_income", KindBoolean, GroupIncome, "No income", "Does your household have no income at all right now?"),
		spec("income.monthly_gross_total", KindMoney, GroupIncome, "Monthly gross income", "What is your household's total monthly income before deductions?", derived()),
		spec("income.sources", KindList, GroupIncome, "Income sources", "What money comes into your household?"),
		spec("income.sources[].member_ref", KindText, GroupIncome, "Who receives it", "Which household member receives this income?"),
		spec("income.sources[].kind", KindChoice, GroupIncome, "Income type", "What kind of income is this?", choices(incomeKindChoices)),
		spec("income.sources[].payer", KindText, GroupIncome, "Paid by", "Who pays this income?"),
		spec("income.sources[].gross_amount", KindMoney, GroupIncome, "Amount", "How much is this income before deductions?"),
		spec("income.sources[].frequency", KindChoice, GroupIncome, "How often", "How often is this income received?", choices(frequencyChoices)),
		spec("income.sources[].start_date", KindDate, GroupIncome, "Started", "When did this income start?"),
		spec("income.sources[].is_ongoing", KindBoolean, GroupIncome, "Ongoing", "Is this income expected to continue?"),

		// --- Housing -------------------------------------------------------
		spec("housing.status", KindChoice, GroupHousing, "Housing", "Do you rent, own, or something else?", choices(housingStatusChoices)),
		spec("housing.rent_monthly", KindMoney, GroupHousing, "Monthly rent", "How much is your rent each month?"),
		spec("housing.mortgage_monthly", KindMoney, GroupHousing, "Monthly mortgage", "How much is your mortgage each month?"),
		spec("housing.property_tax_monthly", KindMoney, GroupHousing, "Property tax", "How much do you pay in property tax each month?"),
		spec("housing.home_insurance_monthly", KindMoney, GroupHousing, "Home insurance", "How much is your home insurance each month?"),
		spec("housing.is_subsidized", KindBoolean, GroupHousing, "Subsidized housing", "Do you receive help paying for housing?"),
		spec("housing.landlord_name", KindText, GroupHousing, "Landlord", "What is your landlord's name?"),
		spec("housing.landlord_phone", KindText, GroupHousing, "Landlord phone", "What is your landlord's phone number?"),
		spec("housing.total_shelter_monthly", KindMoney, GroupHousing, "Total shelter cost", "What do you pay for shelter each month in total?", derived()),

		// --- Utilities -----------------------------------------------------
		spec("utilities.pays_heating_cooling", KindBoolean, GroupUtilities, "Heating or cooling", "Do you pay separately for heating or cooling?"),
		spec("utilities.pays_electricity", KindBoolean, GroupUtilities, "Electricity", "Do you pay for electricity?"),
		spec("utilities.pays_gas", KindBoolean, GroupUtilities, "Gas", "Do you pay for gas?"),
		spec("utilities.pays_water_sewer", KindBoolean, GroupUtilities, "Water and sewer", "Do you pay for water or sewer?"),
		spec("utilities.pays_trash", KindBoolean, GroupUtilities, "Trash", "Do you pay for trash collection?"),
		spec("utilities.pays_phone", KindBoolean, GroupUtilities, "Phone", "Do you pay for a phone?"),
		spec("utilities.monthly_total", KindMoney, GroupUtilities, "Monthly utilities", "About how much are your utilities each month in total?"),
		spec("utilities.received_liheap_last_12mo", KindBoolean, GroupUtilities, "LIHEAP received", "Have you received energy assistance in the last 12 months?"),

		// --- Expenses ------------------------------------------------------
		spec("expenses.child_support_paid_monthly", KindMoney, GroupExpenses, "Child support paid", "How much child support do you pay each month?"),
		spec("expenses.childcare_monthly_total", KindMoney, GroupExpenses, "Childcare total", "What do you pay for childcare each month in total?", derived()),
		spec("expenses.medical_monthly_total", KindMoney, GroupExpenses, "Medical total", "What do you pay in medical costs each month in total?", derived()),
		spec("expenses.childcare", KindList, GroupExpenses, "Childcare costs", "Does your household pay for childcare?"),
		spec("expenses.medical", KindList, GroupExpenses, "Medical costs", "Does your household pay for medical costs?"),
		spec("expenses.childcare[].member_ref", KindText, GroupExpenses, "Care for", "Which household member is this childcare for?"),
		spec("expenses.childcare[].provider_name", KindText, GroupExpenses, "Provider", "Who provides this childcare?"),
		spec("expenses.childcare[].monthly_amount", KindMoney, GroupExpenses, "Monthly cost", "How much is this childcare each month?"),
		spec("expenses.childcare[].reason", KindText, GroupExpenses, "Reason", "Why is this childcare needed?"),
		spec("expenses.medical[].member_ref", KindText, GroupExpenses, "For whom", "Which household member is this medical cost for?"),
		spec("expenses.medical[].kind", KindChoice, GroupExpenses, "Type", "What kind of medical cost is this?", choices(expenseMedicalKinds)),
		spec("expenses.medical[].monthly_amount", KindMoney, GroupExpenses, "Monthly cost", "How much is this medical cost each month?"),

		// --- Resources -----------------------------------------------------
		spec("resources.has_bank_accounts", KindBoolean, GroupResources, "Bank accounts", "Does anyone in your household have a bank account?"),
		spec("resources.accounts", KindList, GroupResources, "Accounts", "Which accounts does your household hold?"),
		spec("resources.vehicles", KindList, GroupResources, "Vehicles", "Does your household own a vehicle?"),
		spec("resources.accounts[].institution", KindText, GroupResources, "Bank", "Which bank or institution holds this account?"),
		spec("resources.accounts[].kind", KindChoice, GroupResources, "Account type", "What kind of account is this?", choices(accountKindChoices)),
		spec("resources.accounts[].balance", KindMoney, GroupResources, "Balance", "What is the current balance?"),
		spec("resources.vehicles[].year", KindNumber, GroupResources, "Year", "What year is this vehicle?"),
		spec("resources.vehicles[].make", KindText, GroupResources, "Make", "What make is this vehicle?"),
		spec("resources.vehicles[].model", KindText, GroupResources, "Model", "What model is this vehicle?"),
		spec("resources.vehicles[].estimated_value", KindMoney, GroupResources, "Value", "About what is this vehicle worth?"),
		spec("resources.vehicles[].is_primary", KindBoolean, GroupResources, "Primary vehicle", "Is this your main vehicle?"),

		// --- Other benefits ------------------------------------------------
		spec("benefits.currently_receiving", KindList, GroupBenefits, "Current benefits", "Which benefits does your household already receive?", choices(programBenefitChoices)),
		spec("benefits.snap_case_number", KindText, GroupBenefits, "SNAP case number", "What is your SNAP case number, if you have one?", sensitive()),
		spec("benefits.medicaid_case_number", KindText, GroupBenefits, "Medicaid case number", "What is your Medicaid case number, if you have one?", sensitive()),
		spec("benefits.has_applied_before", KindBoolean, GroupBenefits, "Applied before", "Have you applied for this benefit before?"),

		// --- Program-specific ----------------------------------------------
		spec("program.expedited_service_requested", KindBoolean, GroupProgram, "Expedited service", "Do you need your application handled urgently?"),
		spec("program.authorized_representative.name", KindText, GroupProgram, "Representative", "Is someone helping you apply on your behalf? What is their name?"),
		spec("program.authorized_representative.phone", KindText, GroupProgram, "Representative phone", "What is their phone number?"),
		spec("program.authorized_representative.relationship", KindText, GroupProgram, "Relationship", "How are they related to you?"),
	}

	out := make(map[FieldPath]FieldSpec, len(specs))
	for _, s := range specs {
		out[s.Path] = s
	}
	return out
}

// USStates is the choice set for every state field, so a mapping and the app
// agree on spelling.
func USStates() []string {
	return []string{
		"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
		"ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
		"MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
		"OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
		"WA", "WV", "WI", "WY",
	}
}
