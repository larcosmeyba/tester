package penny

import "time"

// Role is who said something. Tool traffic is not a role: it is recorded
// separately, so a transcript stays a record of what the two of them said.
type Role string

const (
	RoleUser  Role = "user"
	RolePenny Role = "penny"
)

// Outcome is how a turn ended. Kept as a field rather than inferred from the
// text so that a refusal can be counted, retried and evaluated without anyone
// parsing prose to find out what happened.
type Outcome string

const (
	OutcomeOK          Outcome = "ok"
	OutcomeRefused     Outcome = "refused"
	OutcomeFailed      Outcome = "failed"
	OutcomeRateLimited Outcome = "rate_limited"
)

type Conversation struct {
	ID     string
	UserID string
	Title  string
	// Rolling summary of the turns that have aged out of the live window.
	Summary string
	// How many messages the summary covers.
	SummarizedThrough int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// Citation is a claim's provenance. Anything Penny says about a benefits
// program carries one, and the app renders it, because "SNAP allows X" without
// a source is indistinguishable from a model's guess.
type Citation struct {
	DocumentID   string `json:"document_id"`
	ChunkID      string `json:"chunk_id"`
	Title        string `json:"title"`
	Heading      string `json:"heading,omitempty"`
	Program      string `json:"program"`
	Jurisdiction string `json:"jurisdiction"`
	SourceURL    string `json:"source_url,omitempty"`
	// When the content was last reviewed. Shown when it is past its review
	// date, because stale benefits guidance served silently is worse than
	// stale benefits guidance served with a date on it.
	ReviewedThrough *time.Time `json:"reviewed_through,omitempty"`
	Stale           bool       `json:"stale"`
}

// ProposedAction is a write Penny wanted to make and did not. The app renders
// it as a confirmation card; the backend executes it when — and only when — the
// user taps it.
//
// The arguments are held server-side against the turn rather than round-tripped
// through the client, so what gets executed on confirmation is what Penny
// proposed and not what a modified client sent back.
type ProposedAction struct {
	ID   string `json:"id"`
	Tool string `json:"tool"`
	// One sentence, in Penny's voice, describing what will happen. Written by
	// the agent and validated before it is shown.
	Summary   string         `json:"summary"`
	Arguments map[string]any `json:"arguments"`
}

type Message struct {
	ID             string
	ConversationID string
	UserID         string
	Role           Role
	Content        string
	Position       int
	Outcome        Outcome
	Citations      []Citation
	ProposedAction *ProposedAction
	CreatedAt      time.Time
}

// MemoryKind is what sort of thing Penny learned.
type MemoryKind string

const (
	// MemoryPreference: how they like things. "Cooks for four on weeknights."
	MemoryPreference MemoryKind = "preference"
	// MemoryConstraint: something they cannot or will not do. Advisory to Penny
	// only — the meal engine owns allergens, and a constraint here never
	// substitutes for that.
	MemoryConstraint MemoryKind = "constraint"
	// MemorySituation: where they are in something. "Applying for LIHEAP in
	// Ohio."
	MemorySituation MemoryKind = "situation"
	// MemoryGoal: what they are trying to achieve. "Groceries under $120."
	MemoryGoal MemoryKind = "goal"
)

// ValidMemoryKind reports whether a kind is one of the four. A model that
// invents a fifth is refused rather than accommodated, because the kinds are
// what make the store reviewable.
func ValidMemoryKind(kind string) bool {
	switch MemoryKind(kind) {
	case MemoryPreference, MemoryConstraint, MemorySituation, MemoryGoal:
		return true
	default:
		return false
	}
}

type Memory struct {
	ID     string
	UserID string
	Kind   MemoryKind
	// The claim, in one sentence, as Penny would say it back.
	Content string
	// Why it was saved.
	Context         string
	SourceMessageID *string
	// Set when a later memory corrected this one. Superseded memories are kept
	// so a correction is auditable, and are never recalled.
	SupersededBy *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Live reports whether a memory is still current.
func (m Memory) Live() bool { return m.SupersededBy == nil }
