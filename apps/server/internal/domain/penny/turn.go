package penny

import (
	"strconv"
	"strings"
)

// A turn is one exchange: the user says something, Penny answers, and any
// number of tool calls happen in between.
//
// The types here are the contract between the Go backend and the agent
// service. They are deliberately narrow. The agent is told what it needs to
// answer this message and nothing else — not the user's id, not their email,
// not their full history — because the agent is the process that talks to a
// third-party model, and everything it holds is something that could end up in
// a prompt.

// TurnUser is what the agent is told about who it is talking to.
//
// A first name and a jurisdiction, because Penny should greet someone by name
// and must not quote Ohio's rules to a Texan. Not an id, not an email, not a
// household roster. Widening this struct is a privacy decision, not a
// convenience one.
type TurnUser struct {
	FirstName string `json:"first_name,omitempty"`
	// "US-OH" style, derived from the user's ZIP. Empty when unknown, which
	// means retrieval falls back to federal guidance only.
	Jurisdiction string `json:"jurisdiction,omitempty"`
}

// TurnMessage is one line of the prepared conversation window.
type TurnMessage struct {
	Role    Role   `json:"role"`
	Content string `json:"content"`
}

// TurnRequest is everything the agent gets. It carries a tool token rather than
// the user's own credentials: the token names this turn, expires in seconds,
// and grants only the scopes below.
type TurnRequest struct {
	TurnID         string   `json:"turn_id"`
	ConversationID string   `json:"conversation_id"`
	ToolToken      string   `json:"tool_token"`
	User           TurnUser `json:"user"`
	// The message being answered.
	Input string `json:"input"`
	// The recent thread, oldest first, excluding the input above.
	History []TurnMessage `json:"history"`
	// Everything older than the window, in a paragraph.
	Summary string `json:"summary,omitempty"`
	// What this turn may do. The agent is shown only the tools these allow.
	Scopes []Scope `json:"scopes"`
	Tools  []Tool  `json:"tools"`
}

// TurnResult is what comes back. The agent has no authority to record any of
// it: the backend validates and persists.
type TurnResult struct {
	Text           string          `json:"text"`
	Outcome        Outcome         `json:"outcome"`
	Citations      []Citation      `json:"citations,omitempty"`
	ProposedAction *ProposedAction `json:"proposed_action,omitempty"`
	// For logs and support. Never a key.
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
}

// ToolRequest is one tool call, arriving from the agent at the gateway.
type ToolRequest struct {
	TurnID    string         `json:"turn_id"`
	Tool      string         `json:"tool"`
	Arguments map[string]any `json:"arguments"`
}

// ToolResponse is one tool call's outcome.
//
// A failure is reported as a result rather than an HTTP error, because the
// agent should be able to tell the user "I could not find that plan" instead of
// falling over. The distinction that matters is Denied: a denied call is not a
// problem the model should work around, and the agent is told so.
type ToolResponse struct {
	Tool   string `json:"tool"`
	Result any    `json:"result,omitempty"`
	// Set when the call did not run. Safe to show the model.
	Error string `json:"error,omitempty"`
	// True when the tool was refused by policy rather than failing. The agent
	// must not retry a denied call under a different name.
	Denied bool `json:"denied,omitempty"`
	// Set when the tool needed confirmation. Nothing was written.
	Proposed *ProposedAction `json:"proposed,omitempty"`
}

// Jurisdiction turns a ZIP code into the jurisdiction retrieval filters on.
//
// Resolved from the numeric ZIP ranges the Postal Service allocates per state.
// It is coarse by design: a handful of ZIPs near a state line belong to the
// neighbour, and this table will place them in the wrong state.
//
// That is tolerable because of what the answer is used for. It scopes which
// guidance is retrieved, so a wrong guess means Penny offers federal rules
// instead of a state guide, or a neighbouring state's. It never decides
// anything about a person, and Penny never states a jurisdiction as fact — she
// cites the document she found, which names its own.
func Jurisdiction(zip string) string {
	zip = strings.TrimSpace(zip)
	if len(zip) < 5 {
		return ""
	}
	numeric := zip[:5]
	for _, r := range numeric {
		if r < '0' || r > '9' {
			return ""
		}
	}
	code, err := strconv.Atoi(numeric)
	if err != nil {
		return ""
	}
	for _, band := range zipBands {
		if code >= band.low && code <= band.high {
			return "US-" + band.state
		}
	}
	return ""
}

type zipBand struct {
	low   int
	high  int
	state string
}

// The allocation is contiguous per state with a few states holding more than
// one band, which is why this is a list rather than a map.
var zipBands = []zipBand{
	{99500, 99999, "AK"}, {35000, 36999, "AL"}, {71600, 72999, "AR"},
	{75502, 75505, "AR"}, {85000, 86599, "AZ"}, {90000, 96199, "CA"},
	{80000, 81699, "CO"}, {6000, 6389, "CT"}, {6391, 6999, "CT"},
	{20000, 20099, "DC"}, {20200, 20599, "DC"}, {56900, 56999, "DC"},
	{19700, 19999, "DE"}, {32000, 34999, "FL"}, {30000, 31999, "GA"},
	{39800, 39999, "GA"}, {96700, 96899, "HI"}, {50000, 52899, "IA"},
	{83200, 83899, "ID"}, {60000, 62999, "IL"}, {46000, 47999, "IN"},
	{66000, 67999, "KS"}, {40000, 42799, "KY"}, {45275, 45275, "KY"},
	{70000, 71599, "LA"}, {1000, 2799, "MA"}, {5501, 5544, "MA"},
	{20600, 21999, "MD"}, {3900, 4999, "ME"}, {48000, 49999, "MI"},
	{55000, 56799, "MN"}, {63000, 65899, "MO"}, {38600, 39799, "MS"},
	{59000, 59999, "MT"}, {27000, 28999, "NC"}, {58000, 58899, "ND"},
	{68000, 69399, "NE"}, {3000, 3899, "NH"}, {7000, 8999, "NJ"},
	{87000, 88499, "NM"}, {88900, 89899, "NV"}, {6390, 6390, "NY"},
	{10000, 14999, "NY"}, {43000, 45999, "OH"}, {73000, 73199, "OK"},
	{73400, 74999, "OK"}, {97000, 97999, "OR"}, {15000, 19699, "PA"},
	{600, 799, "PR"}, {900, 999, "PR"}, {2800, 2999, "RI"},
	{29000, 29999, "SC"}, {57000, 57799, "SD"}, {37000, 38599, "TN"},
	{73301, 73301, "TX"}, {75000, 79999, "TX"}, {88500, 88599, "TX"},
	{84000, 84799, "UT"}, {20100, 20199, "VA"}, {22000, 24699, "VA"},
	{801, 851, "VI"}, {5000, 5499, "VT"}, {5601, 5907, "VT"},
	{98000, 99499, "WA"}, {53000, 54999, "WI"}, {24700, 26899, "WV"},
	{82000, 83199, "WY"},
}
