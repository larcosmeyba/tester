package filingkit

import (
	"fmt"
	"strconv"
	"strings"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// displayValue renders an answerable value as the text printed beside its
// question on the sheet. This is presentation formatting for a human reader —
// it is separate from the form-fill transforms in internal/domain/benefits,
// which shape values for a particular form's boxes.
//
// The value is already known answerable here; StatusNone renders as an
// explicit "none" because it is a real answer ("I have none of this"), not a
// gap.
func displayValue(spec domain.FieldSpec, v domain.Value) string {
	if v.Status() == domain.StatusNone {
		if spec.Kind == domain.KindBoolean {
			return "No"
		}
		return "None"
	}
	if !v.Provided() {
		return ""
	}

	switch spec.Kind {
	case domain.KindText:
		text, _ := v.TextValue()
		return text
	case domain.KindChoice:
		text, _ := v.TextValue()
		// Canonical option values are snake_case ("employed_full_time");
		// spaces keep them readable. Case is preserved on purpose: state
		// codes like "MO" must not become "Mo".
		return strings.ReplaceAll(text, "_", " ")
	case domain.KindNumber:
		number, _ := v.NumberValue()
		return strconv.FormatFloat(number, 'f', -1, 64)
	case domain.KindMoney:
		cents, _ := v.MoneyValue()
		return formatMoney(cents)
	case domain.KindDate:
		date, _ := v.DateValue()
		return date.Format("Jan 2, 2006")
	case domain.KindBoolean:
		truth, _ := v.BoolValue()
		if truth {
			return "Yes"
		}
		return "No"
	case domain.KindList:
		items, _ := v.ListValue()
		if len(items) == 0 {
			return "None"
		}
		human := make([]string, len(items))
		for i, item := range items {
			human[i] = strings.ReplaceAll(item, "_", " ")
		}
		return strings.Join(human, ", ")
	}
	return ""
}

// formatMoney renders minor units as a US dollar amount: $1,234.56.
// Benefits arithmetic stays in cents; only the display is decimal.
func formatMoney(cents int64) string {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	return fmt.Sprintf("%s$%s.%02d", sign, groupThousands(cents/100), cents%100)
}

func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	lead := len(s) % 3
	if lead > 0 {
		b.WriteString(s[:lead])
	}
	for i := lead; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}
