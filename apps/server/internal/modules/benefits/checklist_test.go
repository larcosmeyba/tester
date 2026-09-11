package benefits

import (
	"strings"
	"testing"
)

// The checklist is preparation guidance, not program rules. These tests pin
// the shape (before/during/after for every program) and spot-check that no
// eligibility claims, benefit amounts or invented rules have crept into the
// copy.

var checklistTestPrograms = []string{"SNAP", "WIC", "MEDICAID", "LIHEAP", "TANF", "VA", "SSI"}

func TestChecklistShape(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	for _, program := range checklistTestPrograms {
		sections, err := service.Checklist(program, "MO")
		if err != nil {
			t.Fatalf("Checklist(%q) error = %v", program, err)
		}
		if len(sections) != 3 {
			t.Fatalf("Checklist(%q): %d sections, want 3 (before/during/after)", program, len(sections))
		}
		for i, want := range []string{"before", "during", "after"} {
			if sections[i].Phase != want {
				t.Fatalf("Checklist(%q): section %d phase = %q, want %q", program, i, sections[i].Phase, want)
			}
			if sections[i].Title == "" {
				t.Fatalf("Checklist(%q): section %q has no title", program, want)
			}
			if len(sections[i].Items) == 0 {
				t.Fatalf("Checklist(%q): section %q has no items", program, want)
			}
			for _, item := range sections[i].Items {
				if item.Label == "" {
					t.Fatalf("Checklist(%q): section %q has an unlabeled item", program, want)
				}
				if item.Detail == nil || *item.Detail == "" {
					t.Fatalf("Checklist(%q): item %q has no detail", program, item.Label)
				}
				if item.ConfirmOnPortal && !strings.Contains(*item.Detail, "official portal") {
					t.Fatalf("Checklist(%q): item %q is confirm-on-portal but its detail does not say so", program, item.Label)
				}
			}
		}
	}
}

func TestChecklistNormalizesProgram(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	if _, err := service.Checklist("  snap ", "mo"); err != nil {
		t.Fatalf("Checklist() error = %v", err)
	}
}

// No eligibility claims: the checklist must never tell an applicant they
// qualify, are eligible, are guaranteed anything, or will be approved. It also
// states no dollar amounts and no agency deadlines — deadlines come from the
// applicant's own notices.
func TestChecklistMakesNoEligibilityClaims(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	forbidden := []string{
		"you qualify", "you are eligible", "you're eligible",
		"guaranteed", "will be approved", "you will get $",
		"you are entitled",
	}
	for _, program := range checklistTestPrograms {
		sections, err := service.Checklist(program, "MO")
		if err != nil {
			t.Fatalf("Checklist(%q) error = %v", program, err)
		}
		for _, section := range sections {
			for _, item := range section.Items {
				text := strings.ToLower(item.Label + "\n" + *item.Detail)
				for _, phrase := range forbidden {
					if strings.Contains(text, phrase) {
						t.Fatalf("Checklist(%q): item %q contains forbidden phrase %q", program, item.Label, phrase)
					}
				}
				if strings.Contains(text, "$") {
					t.Fatalf("Checklist(%q): item %q states a dollar amount", program, item.Label)
				}
			}
		}
	}
}

func TestChecklistUnknownProgram(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	if _, err := service.Checklist("NOPE", "MO"); err == nil {
		t.Fatal("Checklist(unknown program) should fail, not invent a checklist")
	}
}

func TestChecklistToleratesBadState(t *testing.T) {
	service := NewService(nil, nil, nil, nil, nil, nil)
	sections, err := service.Checklist("SNAP", "XX")
	if err != nil {
		t.Fatalf("Checklist() with a bad state should still return the program checklist: %v", err)
	}
	if len(sections) != 3 {
		t.Fatalf("Checklist(SNAP, bad state): %d sections, want 3", len(sections))
	}
	// With a real state the copy names it.
	named, err := service.Checklist("SNAP", "MO")
	if err != nil {
		t.Fatalf("Checklist() error = %v", err)
	}
	found := false
	for _, section := range named {
		for _, item := range section.Items {
			if strings.Contains(*item.Detail, "Missouri") {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("Checklist(SNAP, MO): no item names Missouri")
	}
}
