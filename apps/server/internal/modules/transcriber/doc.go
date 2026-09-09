// Package transcriber is the only part of the server that knows a separate
// recipe-extraction service exists.
//
// Everything specific to that service — its URL, its shared secret, its JSON,
// its error codes, its retry rules — stops here. The rest of the server asks
// for an import and receives domain types, and would not need changing if the
// extraction moved in-process or to a different vendor tomorrow.
//
// Two boundaries are deliberate:
//
// The extraction service's job store is in memory and may lose jobs. It is
// therefore not the source of truth for anything: `recipe_imports` in Postgres
// is. This package reports what the service currently says, and the caller
// records it.
//
// A draft that arrives here is untrusted input, not a recipe. ToRecipe forces
// the values a caller is never allowed to choose — private, draft,
// video_import — and leaves ingredient identity and gram weights nil, because
// resolving those needs the ingredient catalogue, which is the server's.
package transcriber
