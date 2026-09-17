package benefits

import (
	"fmt"
	"sort"
	"time"
)

// GroupRow is one entry of a repeating group — a household member, a job, an
// income source. Values are keyed by the template path
// ("household.members[].last_name"), not the indexed one, so a row can be
// reordered without rewriting it.
type GroupRow struct {
	ID     string
	Values map[FieldPath]Value
}

func NewGroupRow(id string) GroupRow {
	return GroupRow{ID: id, Values: map[FieldPath]Value{}}
}

func (r GroupRow) Get(path FieldPath) Value {
	if r.Values == nil {
		return Unknown()
	}
	v, ok := r.Values[path.Template()]
	if !ok {
		return Unknown()
	}
	return v
}

// Profile is one user's reusable benefits profile: every answer they have given
// Help The Hive, whatever form asked for it first.
//
// It is deliberately map-shaped rather than a struct of typed fields. The field
// vocabulary is this domain's type system — Set checks every write against it —
// and keeping the aggregate keyed by FieldPath means a new question is a
// vocabulary entry plus a column, not a change to every layer in between.
type Profile struct {
	UserID    string
	UpdatedAt time.Time

	scalars map[FieldPath]Value
	// groups holds both the rows and, through scalars, the declaration of
	// whether the group was collected at all. An empty group with no
	// declaration means "not asked", never "none".
	groups map[FieldPath][]GroupRow
}

func NewProfile(userID string) *Profile {
	return &Profile{
		UserID:  userID,
		scalars: map[FieldPath]Value{},
		groups:  map[FieldPath][]GroupRow{},
	}
}

// Set records a scalar answer, refusing anything the vocabulary does not
// recognise or that carries the wrong kind. A derived path cannot be set: it is
// computed from other answers, and letting a caller write one would let a
// stale total outlive the answers it came from.
func (p *Profile) Set(path FieldPath, v Value) error {
	spec, ok := Lookup(path)
	if !ok {
		return fmt.Errorf("set %q: %w", path, ErrUnknownFieldPath)
	}
	if spec.NeverAsk {
		// Collection policy: this value (Social Security numbers) is never
		// collected or stored, no matter which caller asks. The questionnaire
		// never prompts for it; the API must not accept it either.
		return fmt.Errorf("set %q: %w", path, ErrNeverAskFieldPath)
	}
	if spec.Derived {
		return fmt.Errorf("set %q: %w", path, ErrDerivedFieldPath)
	}
	if !v.Status().Valid() {
		return fmt.Errorf("set %q: invalid answer status %q", path, v.Status())
	}
	if v.Provided() && v.Kind() != spec.Kind {
		return fmt.Errorf("set %q: expected %s, got %s", path, spec.Kind, v.Kind())
	}
	if err := checkChoice(spec, v); err != nil {
		return fmt.Errorf("set %q: %w", path, err)
	}
	if p.scalars == nil {
		p.scalars = map[FieldPath]Value{}
	}
	p.scalars[path.Template()] = v
	return nil
}

// SetGroup replaces a repeating group's rows and marks it as collected. Passing
// no rows is how a user says "none of these" — it is a real answer, and it is
// recorded as StatusNone on the group path rather than as an absence.
func (p *Profile) SetGroup(group FieldPath, rows []GroupRow) error {
	spec, ok := Lookup(group)
	if !ok || spec.Kind != KindList {
		return fmt.Errorf("set group %q: %w", group, ErrUnknownFieldPath)
	}
	if !isRepeatingGroup(group) {
		return fmt.Errorf("set group %q: not a repeating group", group)
	}
	for i, row := range rows {
		for path, v := range row.Values {
			memberSpec, ok := Lookup(path)
			if !ok {
				return fmt.Errorf("group %q row %d: %w: %s", group, i, ErrUnknownFieldPath, path)
			}
			if memberSpec.NeverAsk {
				return fmt.Errorf("group %q row %d: %q: %w", group, i, path, ErrNeverAskFieldPath)
			}
			owner, isMember := path.GroupPath()
			if !isMember || owner != group {
				return fmt.Errorf("group %q row %d: %q belongs to a different group", group, i, path)
			}
			if v.Provided() && v.Kind() != memberSpec.Kind {
				return fmt.Errorf("group %q row %d: %q expected %s, got %s", group, i, path, memberSpec.Kind, v.Kind())
			}
			if err := checkChoice(memberSpec, v); err != nil {
				return fmt.Errorf("group %q row %d: %q: %w", group, i, path, err)
			}
		}
	}
	if p.groups == nil {
		p.groups = map[FieldPath][]GroupRow{}
	}
	if p.scalars == nil {
		p.scalars = map[FieldPath]Value{}
	}
	p.groups[group] = rows

	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.ID)
	}
	if len(rows) == 0 {
		p.scalars[group] = None(KindList, SourceUser)
	} else {
		p.scalars[group] = List(names, SourceUser)
	}
	return nil
}

// Rows returns a group's rows. The second result reports whether the group has
// been collected at all, which is what separates "no jobs" from "we have not
// asked about jobs".
func (p *Profile) Rows(group FieldPath) ([]GroupRow, bool) {
	declaration, ok := p.scalars[group]
	if !ok || !declaration.Answerable() {
		return nil, false
	}
	return p.groups[group], true
}

// Get resolves one path, indexed or not, against the profile. It returns
// Unknown for anything unanswered — never a zero value standing in for an
// answer.
func (p *Profile) Get(path FieldPath) Value {
	if group, ok := path.GroupPath(); ok {
		index, err := subscriptIndex(path)
		if err != nil {
			return Unknown()
		}
		rows, collected := p.Rows(group)
		if !collected || index >= len(rows) {
			return Unknown()
		}
		return rows[index].Get(path)
	}
	if v, ok := p.scalars[path]; ok {
		return v
	}
	return Unknown()
}

// Flatten projects the whole profile into resolved paths, group rows expanded
// to concrete indices and derived totals computed. This is the map a form
// mapping is resolved against; nothing below this line knows about SQL.
func (p *Profile) Flatten() map[FieldPath]Value {
	out := make(map[FieldPath]Value, len(p.scalars)*2)
	for path, v := range p.scalars {
		out[path] = v
	}
	for group, rows := range p.groups {
		if _, collected := p.Rows(group); !collected {
			continue
		}
		for i, row := range rows {
			for path, v := range row.Values {
				indexed, err := path.Indexed(i)
				if err != nil {
					continue
				}
				out[indexed] = v
			}
		}
	}
	for path, v := range p.derive() {
		out[path] = v
	}
	return out
}

// GroupCount reports how many rows a collected group has, and false when it has
// not been collected.
func (p *Profile) GroupCount(group FieldPath) (int, bool) {
	rows, collected := p.Rows(group)
	if !collected {
		return 0, false
	}
	return len(rows), true
}

// AnsweredPaths lists every path the user has actually answered, sorted. Used
// by the review screen and by tests; never for logging values.
func (p *Profile) AnsweredPaths() []FieldPath {
	paths := make([]FieldPath, 0, len(p.scalars))
	for path, v := range p.Flatten() {
		if v.Answerable() {
			paths = append(paths, path)
		}
	}
	sort.Slice(paths, func(i, j int) bool { return paths[i] < paths[j] })
	return paths
}

func checkChoice(spec FieldSpec, v Value) error {
	if len(spec.Choices) == 0 || !v.Provided() {
		return nil
	}
	switch spec.Kind {
	case KindChoice:
		got, _ := v.TextValue()
		if !containsString(spec.Choices, got) {
			return fmt.Errorf("%w: not one of the allowed choices", ErrInvalidValue)
		}
	case KindList:
		items, _ := v.ListValue()
		for _, item := range items {
			if !containsString(spec.Choices, item) {
				return fmt.Errorf("%w: not one of the allowed choices", ErrInvalidValue)
			}
		}
	}
	return nil
}

func containsString(haystack []string, needle string) bool {
	for _, candidate := range haystack {
		if candidate == needle {
			return true
		}
	}
	return false
}

func isRepeatingGroup(group FieldPath) bool {
	for _, candidate := range RepeatingGroups() {
		if candidate == group {
			return true
		}
	}
	return false
}

func subscriptIndex(path FieldPath) (int, error) {
	match := subscriptPattern.FindStringSubmatch(string(path))
	if match == nil || match[1] == "" {
		return 0, fmt.Errorf("path %q carries no index", path)
	}
	var n int
	if _, err := fmt.Sscanf(match[1], "%d", &n); err != nil {
		return 0, err
	}
	return n, nil
}
