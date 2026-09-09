package benefits

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/secrets"
)

// Translation between stored rows and the domain profile.
//
// The rule this code exists to keep: a row that is not there means the question
// was not asked. Nothing in here invents a zero, an empty string or a false to
// stand in for a missing row.

// loadProfile reads a user's whole benefits profile, decrypting the sensitive
// answers on the way.
func (s *Service) loadProfile(ctx context.Context, userID string) (*domain.Profile, error) {
	answers, err := s.store.BenefitsAnswers(ctx, userID)
	if err != nil {
		return nil, err
	}
	groupRows, err := s.store.BenefitsGroupRows(ctx, userID)
	if err != nil {
		return nil, err
	}

	profile := domain.NewProfile(userID)

	// Group rows first, so the answers below have somewhere to land.
	rowsByGroup := map[domain.FieldPath][]db.BenefitsGroupRow{}
	for _, row := range groupRows {
		group := domain.FieldPath(row.GroupPath)
		rowsByGroup[group] = append(rowsByGroup[group], row)
	}
	for group := range rowsByGroup {
		sort.SliceStable(rowsByGroup[group], func(i, j int) bool {
			return rowsByGroup[group][i].Position < rowsByGroup[group][j].Position
		})
	}

	indexByRowID := map[string]int{}
	built := map[domain.FieldPath][]domain.GroupRow{}
	for group, rows := range rowsByGroup {
		for i, row := range rows {
			indexByRowID[row.RowID] = i
			built[group] = append(built[group], domain.NewGroupRow(row.RowID))
		}
	}

	var scalars []db.BenefitsAnswer
	for _, answer := range answers {
		if answer.RowID == "" {
			scalars = append(scalars, answer)
			continue
		}
		group := domain.FieldPath(answer.GroupPath)
		index, ok := indexByRowID[answer.RowID]
		if !ok || index >= len(built[group]) {
			// An answer whose row is gone is not an answer. Skipping it is the
			// only safe reading; guessing a row for it would be inventing one.
			s.logger.Warn("benefits answer without a group row", "user_id", userID, "field_path", answer.FieldPath)
			continue
		}
		value, err := s.valueFromRow(userID, answer)
		if err != nil {
			return nil, err
		}
		built[group][index].Values[domain.FieldPath(answer.FieldPath)] = value
	}

	for group, rows := range built {
		if err := profile.SetGroup(group, rows); err != nil {
			return nil, fmt.Errorf("load group %s: %w", group, err)
		}
	}

	for _, answer := range scalars {
		path := domain.FieldPath(answer.FieldPath)
		spec, ok := domain.Lookup(path)
		if !ok {
			// A path retired from the vocabulary. Reading it back would let a
			// stale question reappear on a form.
			s.logger.Warn("benefits answer outside the vocabulary", "user_id", userID, "field_path", answer.FieldPath)
			continue
		}
		if spec.Kind == domain.KindList && isRepeatingGroupPath(path) {
			// The group declaration was already applied by SetGroup above.
			// Re-applying it here would overwrite the row list.
			if _, collected := profile.Rows(path); collected {
				continue
			}
		}
		value, err := s.valueFromRow(userID, answer)
		if err != nil {
			return nil, err
		}
		if err := profile.Set(path, value); err != nil {
			s.logger.Warn("benefits answer rejected on load", "user_id", userID, "field_path", answer.FieldPath, "error", err)
		}
	}

	return profile, nil
}

func isRepeatingGroupPath(path domain.FieldPath) bool {
	for _, group := range domain.RepeatingGroups() {
		if group == path {
			return true
		}
	}
	return false
}

func (s *Service) valueFromRow(userID string, answer db.BenefitsAnswer) (domain.Value, error) {
	kind := domain.ValueKind(answer.Kind)
	source := domain.Source(answer.Source)

	switch domain.AnswerStatus(answer.Status) {
	case domain.StatusNone:
		return domain.None(kind, source), nil
	case domain.StatusRefused:
		return domain.Refused(kind), nil
	case domain.StatusUnknown:
		return domain.Unknown(), nil
	}

	if len(answer.Encrypted) > 0 {
		plaintext, err := s.cipher.Open(userID, answer.FieldPath, answer.RowID, answer.Encrypted)
		if err != nil {
			return domain.Unknown(), fmt.Errorf("field %s: %w", answer.FieldPath, err)
		}
		if kind == domain.KindChoice {
			return domain.Choice(plaintext, source), nil
		}
		return domain.Text(plaintext, source), nil
	}

	switch kind {
	case domain.KindText:
		if answer.Text == nil {
			return domain.Unknown(), nil
		}
		return domain.Text(*answer.Text, source), nil
	case domain.KindChoice:
		if answer.Text == nil {
			return domain.Unknown(), nil
		}
		return domain.Choice(*answer.Text, source), nil
	case domain.KindNumber:
		if answer.Number == nil {
			return domain.Unknown(), nil
		}
		return domain.Number(*answer.Number, source), nil
	case domain.KindMoney:
		if answer.Cents == nil {
			return domain.Unknown(), nil
		}
		return domain.Money(*answer.Cents, source), nil
	case domain.KindDate:
		if answer.Date == nil {
			return domain.Unknown(), nil
		}
		return domain.Date(*answer.Date, source), nil
	case domain.KindBoolean:
		if answer.Bool == nil {
			return domain.Unknown(), nil
		}
		return domain.Bool(*answer.Bool, source), nil
	case domain.KindList:
		if answer.List == nil {
			return domain.Unknown(), nil
		}
		return domain.List(answer.List, source), nil
	}
	return domain.Unknown(), fmt.Errorf("field %s: unknown value kind %q", answer.FieldPath, answer.Kind)
}

// rowFromValue prepares one answer for storage, sealing it first when the
// vocabulary marks the field sensitive.
func (s *Service) rowFromValue(userID string, path domain.FieldPath, rowID string, value domain.Value) (db.BenefitsAnswer, error) {
	spec, ok := domain.Lookup(path)
	if !ok {
		return db.BenefitsAnswer{}, fmt.Errorf("%w: %s", domain.ErrUnknownFieldPath, path)
	}

	groupPath := ""
	if rowID != "" {
		group, isMember := path.GroupPath()
		if !isMember {
			return db.BenefitsAnswer{}, fmt.Errorf("field %s is not part of a repeating group", path)
		}
		groupPath = string(group)
	}

	answer := db.BenefitsAnswer{
		FieldPath: string(path.Template()),
		RowID:     rowID,
		GroupPath: groupPath,
		Status:    string(value.Status()),
		Kind:      string(spec.Kind),
		Source:    string(domain.SourceUser),
		UpdatedAt: time.Now().UTC(),
	}
	if value.Source() != "" {
		answer.Source = string(value.Source())
	}
	if !value.Provided() {
		return answer, nil
	}

	switch spec.Kind {
	case domain.KindText, domain.KindChoice:
		text, _ := value.TextValue()
		if spec.Sensitive {
			if !s.cipher.Available() {
				return db.BenefitsAnswer{}, fmt.Errorf("%s cannot be stored because no encryption key is configured on this server", spec.Label)
			}
			sealed, err := s.cipher.Seal(userID, answer.FieldPath, rowID, text)
			if err != nil {
				return db.BenefitsAnswer{}, err
			}
			hint := secrets.Hint(text)
			answer.Encrypted = sealed
			answer.Hint = &hint
			break
		}
		answer.Text = &text
	case domain.KindNumber:
		number, _ := value.NumberValue()
		answer.Number = &number
	case domain.KindMoney:
		cents, _ := value.MoneyValue()
		answer.Cents = &cents
	case domain.KindDate:
		date, _ := value.DateValue()
		answer.Date = &date
	case domain.KindBoolean:
		truth, _ := value.BoolValue()
		answer.Bool = &truth
	case domain.KindList:
		items, _ := value.ListValue()
		answer.List = items
	}
	return answer, nil
}
