# Government form mappings

One directory per state, program and form revision. Each holds the blank
official PDF and the mapping that fills it:

```
forms/<country>/<state>/<program>/<form-code>/<version>/
  template.pdf     the blank official form, exactly as the agency publishes it
  mapping.json     which Help The Hive field goes in which box
```

Mappings are **append-only**. When an agency revises a form, add a new version
directory — never edit one in place. An application records the exact
`(id, formVersion, revision)` it was filled from, so a completed PDF stays
explainable against the mapping that produced it rather than whichever one is
current.

## Adding a form

1. **Download the blank official PDF** from the agency and put it in a new
   version directory as `template.pdf`. Do not open and re-save it: the mapping
   is pinned to its SHA-256, and a re-save changes every byte.

2. **See what is actually in it.**

   ```bash
   go run ./cmd/benefits-inspect forms/us/ca/snap/cf285/2026.01/template.pdf
   ```

   This prints every field with its type, page, rectangle and the exact values a
   dropdown or radio group will accept. Rectangles are in points with the page's
   **bottom-left** corner as the origin — assuming a top-left origin is the most
   common way a coordinate mapping goes wrong.

3. **Draft the mapping.** With an AI provider configured, this proposes a field
   path for each form field; without one it writes an empty skeleton and lists
   every field for you to map by hand.

   ```bash
   go run ./cmd/benefits-draft-mapping \
     -program SNAP -state CA -code "CF 285" -version 2026.01 \
     -title "Application for CalFresh Benefits" \
     -out forms/us/ca/snap/cf285/2026.01/mapping.json \
     forms/us/ca/snap/cf285/2026.01/template.pdf
   ```

   The draft is a starting point, nothing more. The model is shown the blank
   form's structure and the field vocabulary and nothing else, and its output
   has no effect until you have reviewed it and committed it.

4. **Finish it by hand.** Check every line against the printed form, then:
   - add `transforms` so each value matches what the box expects (`date`,
     `money`, `phone`, `ssn`, `truncate`, …)
   - add `requirements`, with `unless` for anything conditional ("a street
     address is required unless the applicant has no permanent address")
   - mark signature fields and the dates beside them `"fillPolicy": "never"` —
     Help The Hive does not sign or date an application on anyone's behalf
   - set `"status": "active"`

5. **Let the server check it.** `LoadRegistry` runs at start-up and in
   `registry_test.go`, and refuses a mapping that does not match its PDF: a
   wrong hash, a field the form does not have, a type that does not match, a
   value a dropdown will not accept, or a flat rectangle off the edge of the
   page. A mapping is not correct because it parses; it is correct because it
   was checked against the real document.

   ```bash
   go test ./internal/modules/benefits/
   ```

6. **Look at the output.** Render a completed form from a test profile and read
   it. A form can pass every check and still put a value in the wrong box, and
   the only way to find that is to look.

## The sample form

`us/xx/snap/hth-sample-1/` is **not a government form.** It is a synthetic
two-page application carrying one of every supported field type, used to test
the engine end to end. It is what the checked-in tests fill.

Real forms should be added beside it. Government PDFs are produced by tooling no
fixture can imitate, and a mapping is only proven against the form it will
actually be submitted on.
