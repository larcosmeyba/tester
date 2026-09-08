package meals

import "errors"

// ErrNotFound is returned for anything the caller may not see. It deliberately
// does not distinguish "no such plan" from "somebody else's plan": a user must
// not be able to learn that another user's plan exists.
//
// It lives in the domain because every meal module reports the same thing for
// the same reason, and the GraphQL layer maps it to NOT_FOUND once.
var ErrNotFound = errors.New("not found")
