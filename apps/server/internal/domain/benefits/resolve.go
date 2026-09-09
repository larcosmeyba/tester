package benefits

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Resolve turns a profile and a form mapping into the exact set of values that
// will be written onto the PDF, the questions still outstanding, and anything
// that does not fit.
//
// This function is the whole safety story of the feature. It is pure: no
// database, no PDF, no network, and — importantly — no AI. Nothing here can
// invent an answer, because the only way a value reaches Filled is by having
// been answered in the profile or written as a constant in a reviewed mapping
// file.
func Resolve(profile *Profile, mapping *FormMapping) Resolution {
	flat := profile.Flatten()
	lookup := func(path FieldPath) Value {
		if v, ok := flat[path]; ok {
			return v
		}
		return Unknown()
	}

	resolution := Resolution{}
	missing := newMissingSet()

	for _, field := range mapping.Fields {
		if field.policy() == FillNever {
			resolution.Skipped = append(resolution.Skipped, SkippedField{
				FieldID: field.ID, Reason: SkipPolicy, Note: field.Note,
			})
			continue
		}

		if field.Source.Constant != nil {
			filled, err := renderTarget(field, *field.Source.Constant, "", SourceMappingConstant, false)
			if err != nil {
				resolution.Problems = append(resolution.Problems, FieldProblem{
					FieldID: field.ID, Reason: err.Error(),
				})
				continue
			}
			resolution.Filled = append(resolution.Filled, filled)
			continue
		}

		path, err := field.ResolvedPath()
		if err != nil {
			resolution.Problems = append(resolution.Problems, FieldProblem{FieldID: field.ID, Reason: err.Error()})
			continue
		}

		// A slot for a row the household does not have is blank on purpose. A
		// slot for a group nobody has been asked about is a question.
		if field.Repeat != nil {
			count, collected := profile.GroupCount(field.Repeat.Over)
			if !collected {
				missing.add(field.Repeat.Over, field.strength(), field.ID)
				continue
			}
			if field.Repeat.Index >= count {
				resolution.Skipped = append(resolution.Skipped, SkippedField{
					FieldID: field.ID,
					Reason:  SkipNotApplicable,
					Note:    fmt.Sprintf("%s has %d rows", field.Repeat.Over, count),
				})
				continue
			}
		}

		value := lookup(path)
		if !value.Answerable() {
			missing.add(path, field.strength(), field.ID)
			continue
		}

		text, err := renderValue(value)
		if err != nil {
			resolution.Problems = append(resolution.Problems, FieldProblem{
				FieldID: field.ID, FieldPath: path, Reason: err.Error(),
			})
			continue
		}
		// A transform that reads another path — joining a first name onto a
		// last name — has to read the same row of a repeating group as the
		// field it is transforming, so the field's repeat index is substituted
		// into the transform's path too.
		fieldLookup := lookupForField(field, lookup)
		for _, transform := range field.Transforms {
			text, err = transform.Apply(text, fieldLookup)
			if err != nil {
				break
			}
		}
		if err != nil {
			resolution.Problems = append(resolution.Problems, FieldProblem{
				FieldID: field.ID, FieldPath: path, Reason: err.Error(),
			})
			continue
		}

		if len(field.ValueMap) > 0 {
			mapped, ok := field.ValueMap[text]
			if !ok {
				// Never guess past a gap in the map. A wrong box ticked on a
				// benefits form is a false statement.
				resolution.Problems = append(resolution.Problems, FieldProblem{
					FieldID:   field.ID,
					FieldPath: path,
					Reason:    "the answer is not covered by this field's value map",
				})
				continue
			}
			text = mapped
		}

		spec, _ := Lookup(path)
		filled, err := renderTarget(field, text, path, valueSource(value), spec.Sensitive)
		if err != nil {
			resolution.Problems = append(resolution.Problems, FieldProblem{
				FieldID: field.ID, FieldPath: path, Reason: err.Error(),
			})
			continue
		}
		resolution.Filled = append(resolution.Filled, filled)
	}

	// Requirements can demand an answer no field maps directly — a form that
	// needs the income roster collected before it can be trusted, even though
	// each row has its own boxes.
	for _, requirement := range mapping.Requirements {
		if requirementWaived(requirement, lookup) {
			continue
		}
		if lookup(requirement.FieldPath).Answerable() {
			continue
		}
		missing.add(requirement.FieldPath, requirement.Strength, "")
	}

	// A field's own strength cannot demote what a requirement demanded, and a
	// waived requirement cannot rescue a field that says it is required. Both
	// are folded together by missingSet, which keeps the strongest.
	for _, requirement := range mapping.Requirements {
		if requirement.Strength != Required || !requirementWaived(requirement, lookup) {
			continue
		}
		missing.waive(requirement.FieldPath, lookup)
	}

	resolution.Missing = missing.list()
	sortResolution(&resolution)
	return resolution
}

// lookupForField resolves paths on behalf of one mapping field, indexing
// repeating paths to the row that field is filling.
func lookupForField(field FieldMapping, lookup PathLookup) PathLookup {
	if field.Repeat == nil {
		return lookup
	}
	return func(path FieldPath) Value {
		if !path.Repeating() {
			return lookup(path)
		}
		indexed, err := path.Indexed(field.Repeat.Index)
		if err != nil {
			return Unknown()
		}
		return lookup(indexed)
	}
}

func valueSource(v Value) Source {
	if v.Source() == "" {
		return SourceProfile
	}
	return v.Source()
}

func requirementWaived(requirement Requirement, lookup PathLookup) bool {
	if requirement.Unless == nil {
		return false
	}
	return conditionHolds(*requirement.Unless, lookup)
}

func conditionHolds(condition Condition, lookup PathLookup) bool {
	value := lookup(condition.FieldPath)
	if condition.IsAnswered != nil {
		return value.Answerable() == *condition.IsAnswered
	}
	if condition.Equals == nil {
		return value.Answerable()
	}
	if !value.Answerable() {
		return false
	}
	rendered, err := renderValue(value)
	if err != nil {
		return false
	}
	return rendered == canonicalConditionValue(condition.Equals)
}

// canonicalConditionValue renders a JSON literal from a mapping file the same
// way renderValue renders an answer, so the two can be compared as strings
// without either side having to know the other's Go type.
func canonicalConditionValue(raw any) string {
	switch typed := raw.(type) {
	case string:
		return typed
	case bool:
		return strconv.FormatBool(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return fmt.Sprint(raw)
	}
}

func renderTarget(field FieldMapping, text string, path FieldPath, source Source, sensitive bool) (FilledField, error) {
	filled := FilledField{
		FieldID:   field.ID,
		Target:    field.Target,
		Page:      field.Target.Page,
		Label:     labelFor(path, field),
		FieldPath: path,
		Source:    source,
		Sensitive: sensitive,
	}

	switch field.Target.Type {
	case TargetCheckbox, TargetCheckmark:
		checked, err := parseCheckState(text)
		if err != nil {
			return FilledField{}, err
		}
		filled.Checked = checked
	default:
		filled.Text = text
	}
	return filled, nil
}

func parseCheckState(text string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "true", "yes", "on", "x", "1":
		return true, nil
	case "false", "no", "off", "0", "":
		return false, nil
	}
	// Described rather than quoted: this reason is stored on the application
	// and written to a log, and the value it came from may be sensitive.
	return false, fmt.Errorf("the answer is not a yes-or-no value, so this box cannot be ticked either way")
}

func labelFor(path FieldPath, field FieldMapping) string {
	if spec, ok := Lookup(path); ok {
		return spec.Label
	}
	if field.Note != "" {
		return field.Note
	}
	return field.ID
}

// missingSet aggregates by field path so the app asks each question once, and
// keeps the strongest strength any field or requirement gave it.
type missingSet struct {
	order   []FieldPath
	entries map[FieldPath]*MissingField
}

func newMissingSet() *missingSet {
	return &missingSet{entries: map[FieldPath]*MissingField{}}
}

func (m *missingSet) add(path FieldPath, strength Strength, formFieldID string) {
	entry, ok := m.entries[path]
	if !ok {
		spec, _ := Lookup(path)
		entry = &MissingField{
			FieldPath:  path,
			Label:      spec.Label,
			Question:   spec.Question,
			Group:      spec.Group,
			AnswerKind: spec.Kind,
			Choices:    spec.Choices,
			Sensitive:  spec.Sensitive,
			Strength:   Preferred,
			Derived:    spec.Derived,
		}
		m.entries[path] = entry
		m.order = append(m.order, path)
	}
	if strength == Required {
		entry.Strength = Required
	}
	if formFieldID != "" {
		entry.FormFieldIDs = append(entry.FormFieldIDs, formFieldID)
	}
}

// waive demotes a required question whose condition says it does not apply. It
// stays on the list as preferred rather than disappearing, so the review screen
// can still show that the form has a box nobody filled.
func (m *missingSet) waive(path FieldPath, lookup PathLookup) {
	if entry, ok := m.entries[path]; ok && !lookup(path).Answerable() {
		entry.Strength = Preferred
	}
}

func (m *missingSet) list() []MissingField {
	out := make([]MissingField, 0, len(m.order))
	for _, path := range m.order {
		out = append(out, *m.entries[path])
	}
	return out
}

func sortResolution(r *Resolution) {
	sort.SliceStable(r.Filled, func(i, j int) bool {
		if r.Filled[i].Page != r.Filled[j].Page {
			return r.Filled[i].Page < r.Filled[j].Page
		}
		return r.Filled[i].FieldID < r.Filled[j].FieldID
	})
	sort.SliceStable(r.Missing, func(i, j int) bool {
		if (r.Missing[i].Strength == Required) != (r.Missing[j].Strength == Required) {
			return r.Missing[i].Strength == Required
		}
		if r.Missing[i].Group != r.Missing[j].Group {
			return r.Missing[i].Group < r.Missing[j].Group
		}
		return r.Missing[i].FieldPath < r.Missing[j].FieldPath
	})
	sort.SliceStable(r.Problems, func(i, j int) bool { return r.Problems[i].FieldID < r.Problems[j].FieldID })
	sort.SliceStable(r.Skipped, func(i, j int) bool { return r.Skipped[i].FieldID < r.Skipped[j].FieldID })
}
