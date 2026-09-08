package pdf

import (
	"bytes"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// The fixture is a synthetic two-page government-style form carrying one of
// every field type this engine supports, plus a second page so multi-page
// handling is exercised rather than assumed. It is generated rather than
// checked in as bytes so a pdfcpu upgrade that changes how forms are written
// shows up here as a failing test instead of a stale binary blob.
//
// A real official PDF should be added beside it as soon as one is available:
// government forms are produced by tooling this fixture cannot imitate, and a
// mapping is only proven against the form it will actually be submitted on.
const fixtureJSON = `{
  "paper": "LetterP",
  "origin": "LowerLeft",
  "fonts": {
    "input": { "name": "Helvetica", "size": 10 },
    "label": { "name": "Helvetica", "size": 10 }
  },
  "pages": {
    "1": {
      "content": {
        "text": [
          { "value": "HELP THE HIVE TEST BENEFITS APPLICATION", "pos": [40, 720], "font": { "name": "Helvetica-Bold", "size": 14 } }
        ],
        "textfield": [
          { "id": "applicantLastName", "value": "", "pos": [160, 660], "width": 200, "align": "left",
            "label": { "value": "Last name:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "applicantFirstName", "value": "", "pos": [160, 630], "width": 200, "align": "left",
            "label": { "value": "First name:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "dateOfBirth", "value": "", "pos": [160, 600], "width": 120, "align": "left",
            "label": { "value": "Date of birth:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "monthlyIncome", "value": "", "pos": [160, 570], "width": 120, "align": "right",
            "label": { "value": "Monthly income:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } }
        ],
        "checkbox": [
          { "id": "paysHeating", "value": false, "pos": [160, 520], "width": 12,
            "label": { "value": "Pays for heating:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "paysElectricity", "value": false, "pos": [160, 495], "width": 12,
            "label": { "value": "Pays electricity:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } }
        ],
        "radiobuttongroup": [
          { "id": "isCitizen", "buttons": { "values": ["Yes", "No"], "hor": true, "gap": 40,
              "label": { "value": "US citizen:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
            "pos": [160, 450], "width": 160 }
        ],
        "combobox": [
          { "id": "residenceState", "options": ["AL", "CA", "NY", "TX"], "value": "", "pos": [160, 400], "width": 90, "editable": false,
            "label": { "value": "State:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } }
        ],
        "listbox": [
          { "id": "housingStatus", "options": ["rent", "own", "shelter"], "multi": false, "pos": [160, 330], "width": 120, "height": 50,
            "label": { "value": "Housing:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } }
        ]
      }
    },
    "2": {
      "content": {
        "text": [
          { "value": "PAGE 2 - HOUSEHOLD AND SIGNATURE", "pos": [40, 720], "font": { "name": "Helvetica-Bold", "size": 12 } }
        ],
        "textfield": [
          { "id": "member1Name", "value": "", "pos": [160, 660], "width": 220, "align": "left",
            "label": { "value": "Member 1:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "member2Name", "value": "", "pos": [160, 630], "width": 220, "align": "left",
            "label": { "value": "Member 2:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } },
          { "id": "signatureDate", "value": "", "pos": [160, 560], "width": 120, "align": "left",
            "label": { "value": "Date signed:", "width": 110, "gap": 8, "align": "left", "pos": "left", "font": { "name": "$label" } } }
        ]
      }
    }
  }
}`

// buildFixture renders the synthetic form. Any failure here is a problem with
// the fixture, not with the code under test, so it fails the test immediately.
func buildFixture(t *testing.T) []byte {
	t.Helper()
	var out bytes.Buffer
	if err := api.Create(nil, strings.NewReader(fixtureJSON), &out, configuration()); err != nil {
		t.Fatalf("build fixture form: %v", err)
	}
	return out.Bytes()
}
