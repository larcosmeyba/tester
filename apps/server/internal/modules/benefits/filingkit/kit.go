package filingkit

import (
	"fmt"
	"sort"
	"time"

	domain "github.com/helpthehive/server/internal/domain/benefits"
)

// FormInfo identifies the flat form a kit helps transcribe onto. It carries
// no mapping: a flat form has no boxes to map to, which is the point of the
// kit. The agency fields are what the sheet prints so the applicant always
// knows where the official form comes from and where it goes back to.
type FormInfo struct {
	Title      string // official form title, e.g. "Application for SNAP Benefits"
	FormCode   string // e.g. "LDSS-2921"
	Version    string // form revision, e.g. "Rev. 07/23"
	State      string // "NY"
	Program    string // "SNAP"
	AgencyName string // "NYC Human Resources Administration"
	AgencyURL  string // where to get the official form and where to file it
	// Expected lists the vocabulary template paths this form likely needs.
	// Answered paths outside it are still shown (they may help); unanswered
	// paths outside it are not printed as blank lines. Source it from the
	// form's mapping requirements when a mapping exists, otherwise from a
	// program-level default. Empty means every sectioned path is expected —
	// the national skeleton, which is what nearly every verified form
	// consumes.
	Expected []domain.FieldPath
}

func (f FormInfo) expectedSet() map[domain.FieldPath]bool {
	paths := f.Expected
	if len(paths) == 0 {
		paths = allSectionPaths()
	}
	out := make(map[domain.FieldPath]bool, len(paths))
	for _, p := range paths {
		out[p.Template()] = true
	}
	return out
}

// RowState says what a kit row carries.
type RowState int

const (
	// RowAnswered is a question the applicant answered: label + value.
	RowAnswered RowState = iota
	// RowBlank is a ruled line for handwriting: the form likely needs this
	// question and there is no answer yet.
	RowBlank
	// RowDeclined is a question the applicant was asked and declined: shown
	// so nobody re-asks it, never transcribed.
	RowDeclined
	// RowInfo is a generated instruction row, not an answer at all — the
	// certification lines in section J.
	RowInfo
	// RowSubhead is a block heading inside a section ("Household member 1
	// of 2"). It carries no answer and is never counted.
	RowSubhead
)

// Row is one line of the answer sheet: a question and what goes beside it.
type Row struct {
	// Path is the resolved field path (indexed inside a repeating group);
	// empty for generated rows such as the certification lines.
	Path      domain.FieldPath
	Label     string
	Display   string
	State     RowState
	Note      string
	Subhead   string
	Sensitive bool
}

// KitSection is one A–J section of the sheet.
type KitSection struct {
	Code  string
	Title string
	Rows  []Row
}

// Kit is a generated filing kit: the header plus the answer sheet.
type Kit struct {
	Form        FormInfo
	GeneratedAt time.Time
	Sections    []KitSection

	Answered int
	Blank    int
	Declined int
}

// Generate builds a filing kit from the applicant's stored profile.
//
// It reads answers only — nothing is resolved against a mapping, because the
// target form has none to resolve against. Unanswered questions become blank
// ruled lines only when the form likely needs them (FormInfo.Expected);
// anything else unanswered is left off the sheet entirely.
//
// It never logs. There is no logger parameter on purpose: values must not
// reach a log line, and the audit record below is the only trail.
func Generate(profile *domain.Profile, form FormInfo, now time.Time) (Kit, error) {
	if profile == nil {
		return Kit{}, fmt.Errorf("filingkit: a profile is required")
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	g := &generator{
		profile:  profile,
		flat:     profile.Flatten(),
		expected: form.expectedSet(),
	}
	kit := Kit{Form: form, GeneratedAt: now.UTC()}

	for _, sec := range Sections {
		ks := KitSection{Code: sec.Code, Title: sec.Title}
		// A repeating group can span sections: the roster's citizenship
		// answers live in D while its names live in C. expanded tracks which
		// groups already emitted a block in this section.
		expanded := map[domain.FieldPath]bool{}
		for _, p := range sec.Paths {
			if isGroupDeclaration(p) {
				if !expanded[p] {
					g.emitGroupBlock(&ks, &kit, p, memberPaths(sec, p))
					expanded[p] = true
				}
				continue
			}
			if owner, isMember := p.GroupPath(); isMember {
				if !expanded[owner] {
					g.emitGroupBlock(&ks, &kit, owner, memberPaths(sec, owner))
					expanded[owner] = true
				}
				continue
			}
			row, include := g.scalarRow(p, g.flat[p])
			if include {
				ks.Rows = append(ks.Rows, row)
				kit.count(row)
			}
		}
		if sec.Code == "J" {
			for _, row := range certificationRows() {
				ks.Rows = append(ks.Rows, row)
				kit.count(row)
			}
		}
		if len(ks.Rows) > 0 {
			kit.Sections = append(kit.Sections, ks)
		}
	}
	return kit, nil
}

// memberPaths returns the section's member paths for one repeating group, in
// order.
func memberPaths(sec Section, group domain.FieldPath) []domain.FieldPath {
	var out []domain.FieldPath
	for _, p := range sec.Paths {
		owner, isMember := p.GroupPath()
		if isMember && owner == group {
			out = append(out, p)
		}
	}
	return out
}

type generator struct {
	profile  *domain.Profile
	flat     map[domain.FieldPath]domain.Value
	expected map[domain.FieldPath]bool
}

// scalarRow turns one vocabulary path and its value into a kit row. The second
// result is false when the row belongs nowhere on the sheet: an unanswered
// question the form does not likely need.
func (g *generator) scalarRow(path domain.FieldPath, v domain.Value) (Row, bool) {
	spec, ok := domain.Lookup(path)
	if !ok {
		return Row{}, false
	}
	row := Row{Path: path, Label: spec.Label, Sensitive: spec.Sensitive}

	switch {
	case v.Answerable():
		row.State = RowAnswered
		row.Display = displayValue(spec, v)
		if spec.Derived {
			row.Note = "calculated from your answers"
		}
		return row, true
	case v.Status() == domain.StatusRefused:
		row.State = RowDeclined
		row.Note = "declined to answer — not transcribed"
		return row, true
	default:
		// Unknown: never asked or skipped. A blank line only when the form
		// likely needs it; otherwise the sheet stays quiet about it.
		if !g.expected[path.Template()] {
			return Row{}, false
		}
		row.State = RowBlank
		row.Note = "fill in by hand"
		return row, true
	}
}

// groupBlock renders one repeating group: a summary row, then one subheaded
// block per collected row. An uncollected group gets a single blank block only
// when an actual answer says the form likely needs one — a blank job grid for
// an unemployed applicant is clutter, not help.
func (g *generator) groupBlock(group domain.FieldPath, memberPaths []domain.FieldPath) []Row {
	spec, ok := domain.Lookup(group)
	if !ok {
		return nil
	}
	singular := groupSingular[group]
	if singular == "" {
		singular = spec.Label
	}

	rows, collected := g.profile.Rows(group)
	if collected {
		out := []Row{{
			Label:   spec.Label,
			Display: groupSummary(len(rows)),
			State:   RowAnswered,
		}}
		for i, r := range rows {
			var memberRows []Row
			for _, mp := range memberPaths {
				indexed, err := mp.Indexed(i)
				if err != nil {
					continue
				}
				row, include := g.scalarRow(indexed, r.Get(mp))
				if include {
					memberRows = append(memberRows, row)
				}
			}
			// A subhead with nothing under it is clutter: skip it.
			if len(memberRows) == 0 {
				continue
			}
			out = append(out, Row{
				Subhead: fmt.Sprintf("%s %d of %d", singular, i+1, len(rows)),
				State:   RowSubhead,
			})
			out = append(out, memberRows...)
		}
		return out
	}

	if !g.blankGroupWanted(group) {
		return nil
	}
	out := []Row{{
		Subhead: singular,
		State:   RowSubhead,
		Note:    "fill in by hand — add a block for each additional person, job, or account",
	}}
	for _, mp := range memberPaths {
		if !g.expected[mp.Template()] {
			continue
		}
		mspec, ok := domain.Lookup(mp)
		if !ok {
			continue
		}
		out = append(out, Row{
			Path:      mp,
			Label:     mspec.Label,
			State:     RowBlank,
			Note:      "fill in by hand",
			Sensitive: mspec.Sensitive,
		})
	}
	return out
}

// emitGroupBlock appends one repeating group's block for a section and
// counts its rows.
func (g *generator) emitGroupBlock(ks *KitSection, kit *Kit, group domain.FieldPath, memberPaths []domain.FieldPath) {
	for _, row := range g.groupBlock(group, memberPaths) {
		ks.Rows = append(ks.Rows, row)
		kit.count(row)
	}
}

func groupSummary(n int) string {
	if n == 0 {
		return "None"
	}
	if n == 1 {
		return "1 listed"
	}
	return fmt.Sprintf("%d listed", n)
}

// blankGroupWanted decides whether an uncollected repeating group earns a
// blank block on the sheet. The answer must come from something the applicant
// actually said — never from a guess about what the form wants.
func (g *generator) blankGroupWanted(group domain.FieldPath) bool {
	switch string(group) {
	case "household.members":
		// The roster is on every form. An answered household size above one
		// means members exist; an unanswered size means we simply do not know.
		if n, ok := g.flat["household.size"].NumberValue(); ok {
			return n > 1
		}
		return true
	case "employment.jobs":
		status, ok := g.flat["employment.status"].TextValue()
		if !ok {
			return false
		}
		switch status {
		case "employed_full_time", "employed_part_time", "self_employed", "seasonal":
			return true
		}
		return false
	case "income.sources":
		// has_no_income answered false (BoolValue maps StatusNone to false
		// too) means money comes from somewhere.
		if b, ok := g.flat["income.has_no_income"].BoolValue(); ok {
			return !b
		}
		return false
	case "resources.accounts":
		if b, ok := g.flat["resources.has_bank_accounts"].BoolValue(); ok {
			return b
		}
		return false
	default:
		// expenses.childcare, expenses.medical, resources.vehicles: their
		// gates are the group declarations themselves, so an uncollected
		// group means "not asked", never "yes, blank block please".
		return false
	}
}

// certificationRows are the generated lines closing section J. Signatures are
// never pre-filled — the registry refuses attestation targets for the same
// reason — so these are instructions, not answers.
func certificationRows() []Row {
	return []Row{
		{Subhead: "Certification & signature", State: RowSubhead},
		{
			Label: "Signature",
			State: RowInfo,
			Note:  "Sign on the official form — the app never signs for you",
		},
		{
			Label: "Date signed",
			State: RowInfo,
			Note:  "Fill in by hand on the official form",
		},
	}
}

func (k *Kit) count(row Row) {
	switch row.State {
	case RowAnswered:
		k.Answered++
	case RowBlank:
		k.Blank++
	case RowDeclined:
		k.Declined++
	}
}

// KitAudit is the trail a kit generation leaves: which form, which sections,
// which field paths were emitted, and counts. It carries no values — the same
// no-values contract as benefits_application_fields, which records which
// answer fed which box without storing the answer.
type KitAudit struct {
	FormCode    string
	FormVersion string
	State       string
	Program     string
	GeneratedAt time.Time
	Sections    []string
	// Paths are template paths emitted on the sheet, answered or blank.
	Paths                     []string
	Answered, Blank, Declined int
}

// Audit reduces the kit to its no-values trail.
func (k Kit) Audit() KitAudit {
	audit := KitAudit{
		FormCode:    k.Form.FormCode,
		FormVersion: k.Form.Version,
		State:       k.Form.State,
		Program:     k.Form.Program,
		GeneratedAt: k.GeneratedAt,
		Answered:    k.Answered,
		Blank:       k.Blank,
		Declined:    k.Declined,
	}
	seen := map[string]bool{}
	for _, sec := range k.Sections {
		audit.Sections = append(audit.Sections, sec.Code)
		for _, row := range sec.Rows {
			if row.Path == "" {
				continue
			}
			tpl := string(row.Path.Template())
			if !seen[tpl] {
				seen[tpl] = true
				audit.Paths = append(audit.Paths, tpl)
			}
		}
	}
	sort.Strings(audit.Paths)
	return audit
}
