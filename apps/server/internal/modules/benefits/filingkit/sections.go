package filingkit

import (
	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// Section is one of the A–J sections of the National Autofill Question Set
// (v1.0): the order real state combined applications ask their questions,
// validated against the verified official forms. The kit mirrors it so the
// applicant can walk the paper form top to bottom with the sheet beside it.
//
// Paths are vocabulary template paths in questionnaire order. A path naming a
// repeating group (household.members) expands to one block per collected row;
// the group's member paths render inside each block. A few paths sit in a
// different section than their vocabulary group — citizenship and SSN live in
// D, circumstance flags (veteran, disability, student, pregnancy) in I —
// because that is where the paper forms put them.
type Section struct {
	Code  string
	Title string
	Paths []domain.FieldPath
}

// Sections is the whole A–J order. It is a var, not a const, because it holds
// a slice; treat it as read-only.
var Sections = []Section{
	{Code: "A", Title: "Applicant identity & contact", Paths: []domain.FieldPath{
		"applicant.first_name", "applicant.middle_name", "applicant.last_name",
		"applicant.suffix", "applicant.date_of_birth", "applicant.sex",
		"applicant.marital_status", "applicant.preferred_language",
		"contact.email", "contact.phone_primary", "contact.phone_primary_type",
		"contact.phone_secondary", "contact.preferred_contact_method",
		"contact.ok_to_text", "contact.needs_interpreter",
		"contact.interpreter_language",
	}},
	{Code: "B", Title: "Residential & mailing address", Paths: []domain.FieldPath{
		"address.residential.street1", "address.residential.street2",
		"address.residential.city", "address.residential.state",
		"address.residential.postal_code", "address.residential.county",
		"address.residential.is_homeless",
		"address.mailing.same_as_residential", "address.mailing.street1",
		"address.mailing.street2", "address.mailing.city",
		"address.mailing.state", "address.mailing.postal_code",
	}},
	{Code: "C", Title: "Household roster", Paths: []domain.FieldPath{
		"household.size", "household.has_members_outside_home",
		"household.members",
		"household.members[].first_name", "household.members[].last_name",
		"household.members[].date_of_birth", "household.members[].relationship",
		"household.members[].sex", "household.members[].is_applying",
		"household.members[].buys_and_prepares_food_together",
	}},
	{Code: "D", Title: "Citizenship / immigration", Paths: []domain.FieldPath{
		"applicant.is_us_citizen", "applicant.immigration_status",
		"applicant.ssn",
		"household.members[].is_us_citizen",
		"household.members[].immigration_status",
		"household.members[].ssn",
	}},
	{Code: "E", Title: "Earned income (jobs)", Paths: []domain.FieldPath{
		"employment.status", "employment.is_self_employed",
		"employment.self_employment_monthly_net",
		"employment.jobs",
		"employment.jobs[].member_ref", "employment.jobs[].employer_name",
		"employment.jobs[].employer_phone", "employment.jobs[].job_title",
		"employment.jobs[].start_date", "employment.jobs[].end_date",
		"employment.jobs[].hours_per_week", "employment.jobs[].pay_rate",
		"employment.jobs[].pay_frequency",
	}},
	{Code: "F", Title: "Other income & changes", Paths: []domain.FieldPath{
		"income.has_no_income", "income.monthly_gross_total",
		"income.sources",
		"income.sources[].member_ref", "income.sources[].kind",
		"income.sources[].payer", "income.sources[].gross_amount",
		"income.sources[].frequency", "income.sources[].start_date",
		"income.sources[].is_ongoing",
	}},
	{Code: "G", Title: "Expenses: shelter, utilities, dependent care, medical", Paths: []domain.FieldPath{
		"housing.status", "housing.rent_monthly", "housing.mortgage_monthly",
		"housing.property_tax_monthly", "housing.home_insurance_monthly",
		"housing.is_subsidized", "housing.landlord_name",
		"housing.landlord_phone", "housing.total_shelter_monthly",
		"utilities.pays_heating_cooling", "utilities.pays_electricity",
		"utilities.pays_gas", "utilities.pays_water_sewer",
		"utilities.pays_trash", "utilities.pays_phone",
		"utilities.monthly_total", "utilities.received_liheap_last_12mo",
		"expenses.child_support_paid_monthly",
		"expenses.childcare_monthly_total", "expenses.medical_monthly_total",
		"expenses.childcare",
		"expenses.childcare[].member_ref", "expenses.childcare[].provider_name",
		"expenses.childcare[].monthly_amount", "expenses.childcare[].reason",
		"expenses.medical",
		"expenses.medical[].member_ref", "expenses.medical[].kind",
		"expenses.medical[].monthly_amount",
	}},
	{Code: "H", Title: "Assets / resources", Paths: []domain.FieldPath{
		"resources.has_bank_accounts",
		"resources.accounts",
		"resources.accounts[].institution", "resources.accounts[].kind",
		"resources.accounts[].balance",
		"resources.vehicles",
		"resources.vehicles[].year", "resources.vehicles[].make",
		"resources.vehicles[].model", "resources.vehicles[].estimated_value",
		"resources.vehicles[].is_primary",
	}},
	{Code: "I", Title: "Program-specific circumstances", Paths: []domain.FieldPath{
		"applicant.is_veteran", "applicant.is_pregnant",
		"applicant.has_disability", "applicant.is_student",
		"household.members[].is_student", "household.members[].has_disability",
		"household.members[].is_pregnant",
		"benefits.currently_receiving", "benefits.snap_case_number",
		"benefits.medicaid_case_number", "benefits.has_applied_before",
		"program.expedited_service_requested",
	}},
	{Code: "J", Title: "Authorized rep, certification & signature", Paths: []domain.FieldPath{
		"program.authorized_representative.name",
		"program.authorized_representative.phone",
		"program.authorized_representative.relationship",
	}},
}

// groupSingular names one blank or filled block of a repeating group on the
// sheet, e.g. "Household member 1 of 2".
var groupSingular = map[domain.FieldPath]string{
	"household.members":  "Household member",
	"employment.jobs":    "Job",
	"income.sources":     "Income source",
	"expenses.childcare": "Childcare cost",
	"expenses.medical":   "Medical cost",
	"resources.accounts": "Account",
	"resources.vehicles": "Vehicle",
}

// allSectionPaths lists every template path across the A–J sections, in
// order. It is the default "expected" set: the national skeleton every
// verified form consumes.
func allSectionPaths() []domain.FieldPath {
	var out []domain.FieldPath
	for _, sec := range Sections {
		out = append(out, sec.Paths...)
	}
	return out
}

// isGroupDeclaration reports whether a template path names a repeating group
// itself rather than a field inside one of its rows.
func isGroupDeclaration(p domain.FieldPath) bool {
	for _, group := range domain.RepeatingGroups() {
		if group == p {
			return true
		}
	}
	return false
}
