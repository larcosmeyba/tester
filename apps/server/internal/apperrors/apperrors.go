// Package apperrors defines errors that are safe to expose to API clients.
//
// Resolvers and services return plain errors; the GraphQL error presenter in
// internal/http sanitizes everything that is not explicitly marked safe.
// Wrap user-facing validation errors with Public so their messages reach the
// client unchanged. Anything else is logged server-side and replaced with a
// generic message, so internal details (DB connection strings, constraint
// internals) never leak to clients.
package apperrors

// PublicError is an error whose message is safe to return to API clients.
type PublicError struct {
	msg  string
	code string
}

func (e *PublicError) Error() string { return e.msg }

// Code returns the machine-readable error code, or "" when none was set.
func (e *PublicError) Code() string { return e.code }

// Public wraps a user-facing message so it survives error sanitization.
func Public(msg string) *PublicError { return &PublicError{msg: msg} }

// PublicCode wraps a user-facing message with a machine-readable code.
func PublicCode(code, msg string) *PublicError { return &PublicError{msg: msg, code: code} }
