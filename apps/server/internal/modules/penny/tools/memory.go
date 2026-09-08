package tools

import (
	"context"
	"fmt"
	"strings"

	"github.com/helpthehive/server/internal/auth"
	"github.com/helpthehive/server/internal/db"
	domain "github.com/helpthehive/server/internal/domain/penny"
)

// What Penny remembers, and how she is allowed to add to it.
//
// The recall side is unremarkable. The write side is where the care goes:
// memory is the one place a conversation leaves a mark that outlives it, so a
// model deciding to store something is a model deciding what Penny believes
// about a person next month. Three rules follow.
//
// A memory must be one of four kinds. A model that invents a fifth is refused,
// because the kinds are what make the store reviewable by a person.
//
// A memory must be short. A long one is a transcript, and storing transcripts
// under the name "memory" is how a store nobody audits comes to hold everything
// somebody ever said.
//
// A memory must not be what the profile already holds. Household size lives in
// one place and is read from there; a remembered copy is a copy that goes
// stale silently.

type memoryView struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Content string `json:"content"`
	Context string `json:"context,omitempty"`
	Since   string `json:"since"`
}

func recallMemory(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	query := db.PennyMemoryQuery{
		UserID: identity.Subject,
		Search: args.OptionalString("query", ""),
		Limit:  args.OptionalInt("limit", 8),
	}
	if args.Has("kind") {
		kind, err := memoryKind(args)
		if err != nil {
			return nil, err
		}
		query.Kind = &kind
	}

	memories, err := g.services.Store.RecallPennyMemories(ctx, query)
	if err != nil {
		return nil, err
	}

	out := make([]memoryView, 0, len(memories))
	for _, memory := range memories {
		out = append(out, memoryView{
			ID:      memory.ID,
			Kind:    string(memory.Kind),
			Content: memory.Content,
			Context: memory.Context,
			Since:   memory.CreatedAt.Format("2006-01-02"),
		})
	}
	return map[string]any{"memories": out}, nil
}

// maxMemoryLength is a sentence or two. Anything longer is not a claim.
const maxMemoryLength = 280

func upsertMemory(ctx context.Context, g *Gateway, identity auth.Identity, args Args) (any, error) {
	kind, err := memoryKind(args)
	if err != nil {
		return nil, err
	}
	content, err := args.String("content")
	if err != nil {
		return nil, err
	}
	if len(content) > maxMemoryLength {
		return nil, fmt.Errorf("content must be at most %d characters: store the claim, not the conversation", maxMemoryLength)
	}

	var supersedes *string
	if args.Has("supersedes") {
		id, err := args.String("supersedes")
		if err != nil {
			return nil, err
		}
		// Scoped to this user in the store, so naming somebody else's memory
		// id supersedes nothing.
		supersedes = &id
	}

	memory, err := g.services.Store.UpsertPennyMemory(ctx, db.CreatePennyMemoryParams{
		UserID:     identity.Subject,
		Kind:       kind,
		Content:    content,
		Context:    args.OptionalString("context", ""),
		Supersedes: supersedes,
	})
	if err != nil {
		return nil, err
	}
	return memoryView{
		ID:      memory.ID,
		Kind:    string(memory.Kind),
		Content: memory.Content,
		Context: memory.Context,
		Since:   memory.CreatedAt.Format("2006-01-02"),
	}, nil
}

func memoryKind(args Args) (domain.MemoryKind, error) {
	raw, err := args.String("kind")
	if err != nil {
		return "", err
	}
	lowered := strings.ToLower(raw)
	if !domain.ValidMemoryKind(lowered) {
		return "", fmt.Errorf("kind must be one of preference, constraint, situation, goal")
	}
	return domain.MemoryKind(lowered), nil
}
