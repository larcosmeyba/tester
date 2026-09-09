package benefits

// Derived totals. Every one of them follows the same rule: a total is computed
// only when every input it needs has been answered. A partial sum presented as
// a household's income is an invented answer wearing a plausible number, and it
// is the kind of mistake that costs somebody their benefits.

// monthlyFactor converts an amount at some frequency into a monthly amount,
// expressed as a rational so cents arithmetic stays exact. The second result is
// false for frequencies that cannot be converted without information the
// profile does not hold — an hourly rate needs hours, a one-off payment is not
// a monthly figure at all.
func monthlyFactor(frequency string) (numerator, denominator int64, ok bool) {
	switch frequency {
	case "weekly":
		return 52, 12, true
	case "biweekly":
		return 26, 12, true
	case "semimonthly":
		return 2, 1, true
	case "monthly":
		return 1, 1, true
	case "quarterly":
		return 1, 3, true
	case "annually":
		return 1, 12, true
	default:
		// hourly, daily, one_time: not convertible from an amount alone.
		return 0, 0, false
	}
}

func toMonthlyCents(cents, numerator, denominator int64) int64 {
	product := cents * numerator
	if product >= 0 {
		return (product + denominator/2) / denominator
	}
	return -((-product + denominator/2) / denominator)
}

func (p *Profile) derive() map[FieldPath]Value {
	out := map[FieldPath]Value{}
	if v, ok := p.deriveMonthlyIncome(); ok {
		out["income.monthly_gross_total"] = v
	}
	if v, ok := p.deriveShelterTotal(); ok {
		out["housing.total_shelter_monthly"] = v
	}
	if v, ok := p.deriveGroupMonthlyTotal("expenses.childcare", "expenses.childcare[].monthly_amount"); ok {
		out["expenses.childcare_monthly_total"] = v
	}
	if v, ok := p.deriveGroupMonthlyTotal("expenses.medical", "expenses.medical[].monthly_amount"); ok {
		out["expenses.medical_monthly_total"] = v
	}
	return out
}

// deriveMonthlyIncome sums every income source, normalised to a month. It
// yields a value only when the household has declared its income sources and
// each one carries both an amount and a convertible frequency.
func (p *Profile) deriveMonthlyIncome() (Value, bool) {
	if noIncome, ok := p.Get("income.has_no_income").BoolValue(); ok && noIncome {
		return Money(0, SourceDerived), true
	}

	rows, collected := p.Rows("income.sources")
	if !collected {
		return Unknown(), false
	}
	if len(rows) == 0 {
		// The user said there are no sources. That is an answer, and it means
		// zero — but only because they said so, not because the list is empty.
		return Money(0, SourceDerived), true
	}

	var total int64
	for _, row := range rows {
		amount, hasAmount := row.Get("income.sources[].gross_amount").MoneyValue()
		frequency, hasFrequency := row.Get("income.sources[].frequency").TextValue()
		if !hasAmount || !hasFrequency {
			return Unknown(), false
		}
		numerator, denominator, convertible := monthlyFactor(frequency)
		if !convertible {
			return Unknown(), false
		}
		total += toMonthlyCents(amount, numerator, denominator)
	}
	return Money(total, SourceDerived), true
}

// deriveShelterTotal adds up only the shelter costs that the household's
// housing status makes relevant. A renter is not asked to account for property
// tax, so an unanswered property tax does not block a renter's total.
func (p *Profile) deriveShelterTotal() (Value, bool) {
	status, ok := p.Get("housing.status").TextValue()
	if !ok {
		return Unknown(), false
	}

	var components []FieldPath
	switch status {
	case "rent":
		components = []FieldPath{"housing.rent_monthly"}
	case "own":
		components = []FieldPath{"housing.mortgage_monthly", "housing.property_tax_monthly", "housing.home_insurance_monthly"}
	case "shared":
		components = []FieldPath{"housing.rent_monthly"}
	case "shelter", "homeless", "no_cost":
		return Money(0, SourceDerived), true
	default:
		return Unknown(), false
	}

	var total int64
	for _, path := range components {
		value := p.Get(path)
		switch {
		case value.Status() == StatusNone:
			// Explicitly none: contributes zero.
		case value.Provided():
			cents, ok := value.MoneyValue()
			if !ok {
				return Unknown(), false
			}
			total += cents
		default:
			return Unknown(), false
		}
	}
	return Money(total, SourceDerived), true
}

func (p *Profile) deriveGroupMonthlyTotal(group, amountPath FieldPath) (Value, bool) {
	rows, collected := p.Rows(group)
	if !collected {
		return Unknown(), false
	}
	var total int64
	for _, row := range rows {
		cents, ok := row.Get(amountPath).MoneyValue()
		if !ok {
			return Unknown(), false
		}
		total += cents
	}
	return Money(total, SourceDerived), true
}
