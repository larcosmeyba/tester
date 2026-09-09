package graphql

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/benefits"
	"github.com/helpthehive/server/internal/graphql/model"
	"github.com/helpthehive/server/internal/modules/benefits"
	"github.com/helpthehive/server/internal/modules/benefits/secrets"
)

// Translation between the benefits domain and the GraphQL models.
//
// One rule runs through this file: a sensitive answer never leaves the server.
// Wherever a value would be returned, a sensitive one is replaced by a hint —
// "*** 6789" — so an applicant can recognise which number is on file without
// this API ever handing it back.

func benefitsProfileModel(profile *domain.Profile) *model.BenefitsProfile {
	out := &model.BenefitsProfile{
		VocabularyVersion: domain.VocabularyVersion,
		Answers:           []*model.BenefitsAnswer{},
		Groups:            []*model.BenefitsGroup{},
	}

	scalarPaths := make([]domain.FieldPath, 0)
	for path := range domain.Vocabulary() {
		if path.Repeating() {
			continue
		}
		scalarPaths = append(scalarPaths, path)
	}
	sort.Slice(scalarPaths, func(i, j int) bool { return scalarPaths[i] < scalarPaths[j] })

	flat := profile.Flatten()
	for _, path := range scalarPaths {
		value, ok := flat[path]
		if !ok || value.Status() == domain.StatusUnknown {
			// An unanswered question is an absence, not an answer with an empty
			// value. The app learns what is still outstanding from an
			// application's missingFields, not from a wall of blanks here.
			continue
		}
		out.Answers = append(out.Answers, benefitsAnswerModel(path, "", value))
	}

	for _, group := range domain.RepeatingGroups() {
		rows, collected := profile.Rows(group)
		entry := &model.BenefitsGroup{
			GroupPath: string(group),
			Collected: collected,
			Rows:      []*model.BenefitsGroupRow{},
		}
		for _, row := range rows {
			modelRow := &model.BenefitsGroupRow{RowID: row.ID, Answers: []*model.BenefitsAnswer{}}
			paths := make([]domain.FieldPath, 0, len(row.Values))
			for path := range row.Values {
				paths = append(paths, path)
			}
			sort.Slice(paths, func(i, j int) bool { return paths[i] < paths[j] })
			for _, path := range paths {
				value := row.Values[path]
				if value.Status() == domain.StatusUnknown {
					continue
				}
				modelRow.Answers = append(modelRow.Answers, benefitsAnswerModel(path, row.ID, value))
			}
			entry.Rows = append(entry.Rows, modelRow)
		}
		out.Groups = append(out.Groups, entry)
	}

	return out
}

func benefitsAnswerModel(path domain.FieldPath, rowID string, value domain.Value) *model.BenefitsAnswer {
	spec, _ := domain.Lookup(path)
	answer := &model.BenefitsAnswer{
		FieldPath:   string(path),
		Status:      answerStatusModel(value.Status()),
		Kind:        valueKindModel(spec.Kind),
		Source:      valueSourceModel(value.Source()),
		IsSensitive: spec.Sensitive,
	}
	if rowID != "" {
		answer.RowID = &rowID
	}
	if !value.Provided() {
		return answer
	}

	switch spec.Kind {
	case domain.KindText, domain.KindChoice:
		text, _ := value.TextValue()
		if spec.Sensitive {
			// The value stays on the server. Only enough to recognise it comes back.
			hint := secrets.Hint(text)
			answer.Hint = &hint
			break
		}
		answer.Text = &text
	case domain.KindNumber:
		number, _ := value.NumberValue()
		answer.Number = &number
	case domain.KindMoney:
		cents, _ := value.MoneyValue()
		asInt := int(cents)
		answer.MoneyCents = &asInt
	case domain.KindDate:
		date, _ := value.DateValue()
		formatted := date.Format(time.DateOnly)
		answer.Date = &formatted
	case domain.KindBoolean:
		truth, _ := value.BoolValue()
		answer.Bool = &truth
	case domain.KindList:
		items, _ := value.ListValue()
		answer.List = items
	}
	return answer
}

func benefitsFieldVocabularyModel() []*model.BenefitsFieldSpec {
	vocabulary := domain.Vocabulary()
	paths := make([]domain.FieldPath, 0, len(vocabulary))
	for path := range vocabulary {
		paths = append(paths, path)
	}
	sort.Slice(paths, func(i, j int) bool { return paths[i] < paths[j] })

	out := make([]*model.BenefitsFieldSpec, 0, len(paths))
	for _, path := range paths {
		spec := vocabulary[path]
		choices := spec.Choices
		if choices == nil {
			choices = []string{}
		}
		out = append(out, &model.BenefitsFieldSpec{
			FieldPath:   string(spec.Path),
			Kind:        valueKindModel(spec.Kind),
			Group:       spec.Group,
			Label:       spec.Label,
			Question:    spec.Question,
			Choices:     choices,
			IsSensitive: spec.Sensitive,
			IsDerived:   spec.Derived,
			IsRepeating: spec.Path.Repeating(),
		})
	}
	return out
}

func benefitsFormModel(form *benefits.Form) *model.BenefitsForm {
	if form == nil {
		return nil
	}
	mapping := form.Mapping
	mapped, fillable := form.Coverage()
	out := &model.BenefitsForm{
		ID:           mapping.ID,
		Key:          form.Key(),
		Program:      mapping.Program,
		Country:      mapping.Jurisdiction.Country,
		FormCode:     mapping.FormCode,
		FormTitle:    mapping.FormTitle,
		FormVersion:  mapping.FormVersion,
		Revision:     mapping.Revision,
		PageCount:    form.Inventory.PageCount,
		TemplateKind: templateKindModel(mapping.Template.Kind),
		Status:       formStatusModel(mapping.Status),

		MappedFieldCount:   mapped,
		FillableFieldCount: fillable,
	}
	if mapping.EffectiveDate != "" {
		date := mapping.EffectiveDate
		out.EffectiveDate = &date
	}
	if mapping.Template.SourceURL != "" {
		url := mapping.Template.SourceURL
		out.SourceURL = &url
	}
	if mapping.Template.RetrievedAt != "" {
		date := mapping.Template.RetrievedAt
		out.RetrievedAt = &date
	}
	if mapping.Jurisdiction.State != "" {
		state := mapping.Jurisdiction.State
		out.State = &state
	}
	if mapping.AgencyURL != "" {
		url := mapping.AgencyURL
		out.AgencyURL = &url
	}
	return out
}

func benefitsApplicationModel(application benefits.Application) *model.BenefitsApplication {
	record := application.Record
	out := &model.BenefitsApplication{
		ID:            record.ID,
		Form:          benefitsFormModel(application.Form),
		Status:        applicationStatusModel(record.Status),
		FilledFields:  []*model.BenefitsFilledField{},
		MissingFields: []*model.BenefitsMissingField{},
		Problems:      []*model.BenefitsFieldProblem{},
		SkippedFields: []*model.BenefitsSkippedField{},
		CreatedAt:     db.FormatTime(record.CreatedAt),
		UpdatedAt:     db.FormatTime(record.UpdatedAt),
	}
	if record.FailureReason != "" {
		reason := record.FailureReason
		out.FailureReason = &reason
	}
	if record.ApprovedAt != nil {
		approved := db.FormatTime(*record.ApprovedAt)
		out.ApprovedAt = &approved
	}
	if application.HasDraft {
		path := benefitsDocumentPath(record.ID, "draft")
		out.DraftDocumentPath = &path
	}
	if application.HasFinal {
		path := benefitsDocumentPath(record.ID, "final")
		out.FinalDocumentPath = &path
	}

	resolution := application.Resolution
	for _, filled := range resolution.Filled {
		out.FilledFields = append(out.FilledFields, benefitsFilledFieldModel(filled))
	}
	for _, missing := range resolution.Missing {
		out.MissingFields = append(out.MissingFields, benefitsMissingFieldModel(missing))
	}
	for _, problem := range resolution.Problems {
		entry := &model.BenefitsFieldProblem{FieldID: problem.FieldID, Reason: problem.Reason}
		if problem.FieldPath != "" {
			path := string(problem.FieldPath)
			entry.FieldPath = &path
		}
		out.Problems = append(out.Problems, entry)
	}
	for _, skipped := range resolution.Skipped {
		entry := &model.BenefitsSkippedField{FieldID: skipped.FieldID, Reason: skipReasonModel(skipped.Reason)}
		if skipped.Note != "" {
			note := skipped.Note
			entry.Note = &note
		}
		out.SkippedFields = append(out.SkippedFields, entry)
	}
	return out
}

func benefitsFilledFieldModel(filled domain.FilledField) *model.BenefitsFilledField {
	isCheckbox := filled.Target.Type == domain.TargetCheckbox || filled.Target.Type == domain.TargetCheckmark
	out := &model.BenefitsFilledField{
		FieldID:     filled.FieldID,
		Label:       filled.Label,
		Page:        filled.Page,
		Source:      valueSourceModel(filled.Source),
		IsCheckbox:  isCheckbox,
		IsSensitive: filled.Sensitive,
	}
	if filled.FieldPath != "" {
		path := string(filled.FieldPath)
		out.FieldPath = &path
	}
	if isCheckbox {
		checked := filled.Checked
		out.Checked = &checked
		return out
	}
	text := filled.Text
	if filled.Sensitive {
		// The review screen shows that the number is on the form, not what it is.
		text = secrets.Hint(text)
	}
	out.Text = &text
	return out
}

func benefitsMissingFieldModel(missing domain.MissingField) *model.BenefitsMissingField {
	choices := missing.Choices
	if choices == nil {
		choices = []string{}
	}
	ids := missing.FormFieldIDs
	if ids == nil {
		ids = []string{}
	}
	return &model.BenefitsMissingField{
		FieldPath:    string(missing.FieldPath),
		Label:        missing.Label,
		Question:     missing.Question,
		Group:        missing.Group,
		AnswerKind:   valueKindModel(missing.AnswerKind),
		Choices:      choices,
		Strength:     strengthModel(missing.Strength),
		IsSensitive:  missing.Sensitive,
		IsDerived:    missing.Derived,
		FormFieldIds: ids,
	}
}

// benefitsDocumentPath is the authenticated path the app fetches a PDF from. It
// is a path rather than a URL on purpose: there is no shareable link to a
// document carrying somebody's benefits application, and this one needs the
// same bearer token as the query that produced it.
func benefitsDocumentPath(applicationID, kind string) string {
	return fmt.Sprintf("/benefits/applications/%s/pdf?kind=%s", applicationID, kind)
}

func benefitsAnswerInputs(inputs []*model.BenefitsAnswerInput) []benefits.AnswerInput {
	out := make([]benefits.AnswerInput, 0, len(inputs))
	for _, input := range inputs {
		if input == nil {
			continue
		}
		answer := benefits.AnswerInput{
			FieldPath: strings.TrimSpace(input.FieldPath),
			Status:    strings.ToLower(string(input.Status)),
			Text:      input.Text,
			Number:    input.Number,
			Date:      input.Date,
			Bool:      input.Bool,
			List:      input.List,
		}
		if input.MoneyCents != nil {
			cents := int64(*input.MoneyCents)
			answer.MoneyCents = &cents
		}
		out = append(out, answer)
	}
	return out
}

func benefitsGroupRowInputs(rows []*model.BenefitsGroupRowInput) []benefits.GroupRowInput {
	out := make([]benefits.GroupRowInput, 0, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		entry := benefits.GroupRowInput{Answers: benefitsAnswerInputs(row.Answers)}
		if row.RowID != nil {
			entry.RowID = strings.TrimSpace(*row.RowID)
		}
		out = append(out, entry)
	}
	return out
}

func answerStatusModel(status domain.AnswerStatus) model.BenefitsAnswerStatus {
	switch status {
	case domain.StatusProvided:
		return model.BenefitsAnswerStatusProvided
	case domain.StatusNone:
		return model.BenefitsAnswerStatusNone
	case domain.StatusRefused:
		return model.BenefitsAnswerStatusRefused
	}
	return model.BenefitsAnswerStatusUnknown
}

func valueKindModel(kind domain.ValueKind) model.BenefitsValueKind {
	switch kind {
	case domain.KindNumber:
		return model.BenefitsValueKindNumber
	case domain.KindMoney:
		return model.BenefitsValueKindMoney
	case domain.KindDate:
		return model.BenefitsValueKindDate
	case domain.KindBoolean:
		return model.BenefitsValueKindBoolean
	case domain.KindChoice:
		return model.BenefitsValueKindChoice
	case domain.KindList:
		return model.BenefitsValueKindList
	}
	return model.BenefitsValueKindText
}

func valueSourceModel(source domain.Source) model.BenefitsValueSource {
	switch source {
	case domain.SourceDerived:
		return model.BenefitsValueSourceDerived
	case domain.SourceMappingConstant:
		return model.BenefitsValueSourceMappingConstant
	case domain.SourceUser:
		return model.BenefitsValueSourceUser
	}
	return model.BenefitsValueSourceProfile
}

func strengthModel(strength domain.Strength) model.BenefitsFieldStrength {
	if strength == domain.Required {
		return model.BenefitsFieldStrengthRequired
	}
	return model.BenefitsFieldStrengthPreferred
}

func templateKindModel(kind domain.TemplateKind) model.BenefitsTemplateKind {
	if kind == domain.TemplateFlat {
		return model.BenefitsTemplateKindFlat
	}
	return model.BenefitsTemplateKindAcroform
}

func skipReasonModel(reason domain.SkipReason) model.BenefitsSkipReason {
	if reason == domain.SkipNotApplicable {
		return model.BenefitsSkipReasonNotApplicable
	}
	return model.BenefitsSkipReasonPolicy
}

func formStatusModel(status string) model.BenefitsFormStatus {
	switch status {
	case "deprecated":
		return model.BenefitsFormStatusDeprecated
	case "draft":
		return model.BenefitsFormStatusDraft
	}
	return model.BenefitsFormStatusActive
}

func applicationStatusModel(status string) model.BenefitsApplicationStatus {
	switch status {
	case benefits.StatusNeedsInformation:
		return model.BenefitsApplicationStatusNeedsInformation
	case benefits.StatusReadyForReview:
		return model.BenefitsApplicationStatusReadyForReview
	case benefits.StatusCompleted:
		return model.BenefitsApplicationStatusCompleted
	case benefits.StatusFailed:
		return model.BenefitsApplicationStatusFailed
	case benefits.StatusSuperseded:
		return model.BenefitsApplicationStatusSuperseded
	}
	return model.BenefitsApplicationStatusDraft
}

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------

// benefitsRenewalModel converts a renewal row. daysRemaining is computed
// server-side from the due date against now, so the client never does date
// arithmetic on a deadline that matters.
func benefitsRenewalModel(renewal db.BenefitsRenewal, now time.Time) *model.BenefitsRenewal {
	return &model.BenefitsRenewal{
		ID:                  renewal.ID,
		Program:             renewal.Program,
		State:               renewal.State,
		FormID:              renewal.FormID,
		CertificationEndsAt: renewal.CertificationEndsAt,
		RenewalDueAt:        renewal.RenewalDueAt,
		Source:              renewal.Source,
		Status:              renewal.Status,
		ReminderStage:       renewal.ReminderStage,
		DaysRemaining:       benefits.DaysUntilRenewal(renewal.RenewalDueAt, now),
	}
}

func benefitsProgramRuleModel(rule db.BenefitsProgramRule) *model.BenefitsProgramRule {
	return &model.BenefitsProgramRule{
		Program:          rule.Program,
		State:            rule.State,
		CertPeriodMonths: rule.CertPeriodMonths,
		SourceCitation:   rule.SourceCitation,
		Notes:            rule.Notes,
	}
}
