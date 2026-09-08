// Package penny is the assistant's domain: what a conversation is, what Penny
// is allowed to remember, which tools exist and what each one is permitted to
// do. It is pure — no database, no HTTP, no model, no prompt.
//
// One rule shapes every type here: the model proposes and the backend disposes.
// A Tool in this package is a description of a capability, not a capability. It
// says who may call it, what it costs a user if it is wrong, and whether a
// human must agree first. Nothing in this package can execute anything, which
// is why the list of what Penny may do can be read, reviewed and tested without
// reading a line of the agent that calls it.
//
// The second rule is that a model's output is never itself an authorization. A
// tool call arrives naming a tool and carrying arguments; both are checked
// against the registry here before any service is reached, and the user the
// call runs as comes from a verified token rather than from anything the model
// said.
package penny
