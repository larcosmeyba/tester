package tools

import (
	"context"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// Retrieval over Help The Hive's reviewed guidance.
//
// This tool is the reason Penny can be asked about SNAP at all. A model's
// training data has an income limit in it from whenever it was trained, stated
// with the same confidence as everything else it says, and no way for a reader
// to tell the difference. This returns text somebody wrote, reviewed, dated and
// attributed, and it returns nothing when it has nothing — which is the answer
// that keeps Penny honest.

type knowledgePassage struct {
	Content  string          `json:"content"`
	Citation domain.Citation `json:"citation"`
}

type knowledgeResult struct {
	Passages []knowledgePassage `json:"passages"`
	// Said in words rather than left for the model to infer from an empty
	// list, because "I found nothing" and "I found nothing relevant" lead to
	// very different sentences.
	Guidance string `json:"guidance"`
}

const (
	noResultsGuidance = "No reviewed Help The Hive guidance matched. Say that you do not know, and point the user " +
		"to the agency that runs the program. Do not answer from your own knowledge."
	resultsGuidance = "Answer using only these passages. Every figure, limit or rule you state must appear in one of " +
		"them, and you must cite the passage you used. If they do not cover the question, say so."
	staleGuidance = " One or more passages are past their review date: say when the guidance was last reviewed " +
		"and suggest confirming with the agency."
)

func searchKnowledge(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	query, err := args.String("query")
	if err != nil {
		return nil, err
	}

	// The jurisdiction comes from the user's saved profile, never from an
	// argument. A model that could pass a state could be talked into passing
	// the wrong one, and the wrong state's benefits rules are the single most
	// harmful thing this corpus could return.
	viewer, err := g.services.Users.Viewer(ctx, identity)
	if err != nil {
		return nil, err
	}

	results, err := g.services.Store.SearchKnowledge(ctx, db.KnowledgeQuery{
		Search:       query,
		Program:      strings.ToUpper(args.OptionalString("program", "")),
		Jurisdiction: domain.Jurisdiction(viewer.Profile.Zip),
		Limit:        args.OptionalInt("limit", 4),
	}, g.now())
	if err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return knowledgeResult{Passages: []knowledgePassage{}, Guidance: noResultsGuidance}, nil
	}

	out := knowledgeResult{Passages: make([]knowledgePassage, 0, len(results)), Guidance: resultsGuidance}
	stale := false
	for _, result := range results {
		out.Passages = append(out.Passages, knowledgePassage{
			Content:  result.Chunk.Content,
			Citation: result.Citation,
		})
		stale = stale || result.Citation.Stale
	}
	if stale {
		out.Guidance += staleGuidance
	}
	return out, nil
}
