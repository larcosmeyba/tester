// Package spoonacular adapts the Spoonacular food API for the Help The Hive
// recipe database.
//
// Two things here are deliberate and need to stay that way.
//
// First, the API key lives on the server. SPOONACULAR_API_KEY is read from the
// server environment only — never expose it via an EXPO_PUBLIC_* variable,
// which would put it in the mobile bundle that anyone who installs the app
// can read.
//
// Second, everything downstream of this package speaks Recipe, the mapped
// type in types.go. The Spoonacular wire JSON never leaves this package: if
// their shape changes, the change is confined to the wire structs and the
// mapping function, and the mobile client's types keep working.
//
// A deployment with no key configured is a normal state, not a fault. New
// returns ErrNotConfigured and the Unconfigured type answers every method
// with it, the same way Penny answers with no agent. Mock exists so the
// mobile UI can be built and screenshotted against real-shaped data before
// any key is provisioned.
package spoonacular
