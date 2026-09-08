package pdf

import (
	"sort"
	"strings"
)

// Finding the printed label that belongs to a box.
//
// A form field's name is often useless — California's SNAP application calls
// 1,444 of them "Text1 PG 1" and the like — so the only thing that says what a
// box is for is the text printed next to it. This works out which text that is.
//
// The rule follows how forms are laid out rather than anything clever: a label
// sits immediately to the left of its box on the same line, or directly above
// it. Anything further away than a couple of lines is not a label, and saying
// nothing is better than confidently attaching the wrong one — a mis-labelled
// field is how a reviewer ends up approving somebody's income in the box for
// their rent.

const (
	// How far left of a box its label may start, in points.
	labelMaxLeftGap = 230
	// How far above a box its label may sit.
	labelMaxAboveGap = 26
	// How far a run's baseline may differ from the box's midline and still
	// count as being on the same line.
	labelSameLineTolerance = 7
)

// LabelFor returns the printed text most likely to name a box, and how it was
// found. An empty label means nothing close enough was printed, which is a
// real answer and better than a guess.
func LabelFor(runs []TextRun, rect Rect) (label string, placement string) {
	midline := rect.Y + rect.H/2

	var left, above []TextRun
	for _, run := range runs {
		text := strings.TrimSpace(run.Text)
		if text == "" || isRule(text) {
			continue
		}
		switch {
		case abs(run.Y-midline) <= labelSameLineTolerance && run.X < rect.X && rect.X-run.X <= labelMaxLeftGap:
			left = append(left, run)
		case run.Y > rect.Y+rect.H-2 && run.Y-(rect.Y+rect.H) <= labelMaxAboveGap &&
			run.X < rect.X+rect.W && run.X+approxWidth(run.Text, run.Size) > rect.X-4:
			above = append(above, run)
		}
	}

	// Nearest wins: the label is the text closest to the box, not the first
	// thing on the line.
	if len(left) > 0 {
		sort.Slice(left, func(i, j int) bool { return left[i].X > left[j].X })
		return clean(joinNear(left, rect.X)), "left"
	}
	if len(above) > 0 {
		sort.Slice(above, func(i, j int) bool {
			if above[i].Y != above[j].Y {
				return above[i].Y < above[j].Y
			}
			return above[i].X < above[j].X
		})
		lowest := above[0].Y
		var line []TextRun
		for _, run := range above {
			if abs(run.Y-lowest) <= labelSameLineTolerance {
				line = append(line, run)
			}
		}
		sort.Slice(line, func(i, j int) bool { return line[i].X < line[j].X })
		parts := make([]string, 0, len(line))
		for _, run := range line {
			parts = append(parts, strings.TrimSpace(run.Text))
		}
		return clean(strings.Join(parts, " ")), "above"
	}
	return "", ""
}

// joinNear stitches together the runs immediately left of a box. Forms often
// emit a label in several pieces, and "Monthly" alone is not a label where
// "Monthly rent" is.
//
// The nearest run is always taken — how far a form sets its label from its box
// is a layout choice, and labelMaxLeftGap already bounds it. The gap test only
// decides whether to keep reaching further left, so that a label is not glued
// to the unrelated text at the start of the line.
func joinNear(sorted []TextRun, _ float64) string {
	if len(sorted) == 0 {
		return ""
	}
	parts := []string{strings.TrimSpace(sorted[0].Text)}
	previousX := sorted[0].X

	for _, run := range sorted[1:] {
		gap := previousX - (run.X + approxWidth(run.Text, run.Size))
		// Scaled to the type size: a wide gap at 6pt is a different thing from
		// a wide gap at 14pt.
		if gap > maxJoinGap(run.Size) {
			break
		}
		parts = append([]string{strings.TrimSpace(run.Text)}, parts...)
		previousX = run.X
		if len(parts) >= 6 {
			break
		}
	}
	return strings.Join(parts, " ")
}

func maxJoinGap(size float64) float64 {
	gap := size * 2.5
	if gap < 14 {
		return 14
	}
	return gap
}

// isRule discards the leader dots and underscores forms use to draw a writing
// line. They sit exactly where a label would and mean nothing.
func isRule(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return true
	}
	for _, r := range trimmed {
		switch r {
		case '_', '.', '-', '·', '—', '–', ' ':
		default:
			return false
		}
	}
	return true
}

func clean(text string) string {
	text = strings.Join(strings.Fields(text), " ")
	text = strings.TrimRight(text, " :._-")
	if len(text) > 90 {
		text = text[:90]
	}
	return strings.TrimSpace(text)
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
