package transcriber

import (
	"errors"
	"fmt"
)

// The named ways an import fails. Each one needs different words in front of a
// user, so they stay distinguishable all the way up: collapsing them into one
// error is what makes an app say "something went wrong".
var (
	ErrUnsupportedSource = errors.New("unsupported video source")
	ErrVideoUnavailable  = errors.New("video unavailable")
	ErrVideoTooLong      = errors.New("video too long")
	ErrNoTranscript      = errors.New("no transcript available")
	ErrNoRecipeFound     = errors.New("no recipe found in video")
	ErrProviderFailure   = errors.New("extraction provider failed")

	// Faults of the integration rather than the video.
	ErrUnauthorized = errors.New("transcriber rejected our credentials")
	ErrUnavailable  = errors.New("transcriber unavailable")
	ErrJobNotFound  = errors.New("transcriber has no such job")
)

// ServiceError is a named failure reported by the extraction service.
//
// Message is written to be safe to show a user and never echoes transcript or
// video content. Detail is for logs only — it can carry a provider's own text.
type ServiceError struct {
	Code    string
	Message string
	Detail  string
}

func (e *ServiceError) Error() string {
	if e.Message == "" {
		return e.Code
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap maps the wire code onto a sentinel so callers can use errors.Is
// without ever comparing strings themselves.
func (e *ServiceError) Unwrap() error {
	switch e.Code {
	case "UNSUPPORTED_SOURCE":
		return ErrUnsupportedSource
	case "VIDEO_UNAVAILABLE":
		return ErrVideoUnavailable
	case "VIDEO_TOO_LONG":
		return ErrVideoTooLong
	case "NO_TRANSCRIPT":
		return ErrNoTranscript
	case "NO_RECIPE_FOUND":
		return ErrNoRecipeFound
	case "PROVIDER_ERROR":
		return ErrProviderFailure
	default:
		return nil
	}
}

// Retryable reports whether trying the same request again could succeed.
//
// A video that is private stays private, and a video that is too long stays
// too long: retrying those spends money to fail again. Only a provider fault
// is worth another attempt.
func (e *ServiceError) Retryable() bool {
	return e.Code == "PROVIDER_ERROR"
}
