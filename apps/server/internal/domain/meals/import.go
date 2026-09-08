package meals

import (
	"errors"
	"net/url"
	"strings"
	"time"
)

// A recipe import: one attempt to turn a cooking video into a recipe.
//
// The row in `recipe_imports` is the source of truth for an import's state,
// not the extraction service — that service holds its jobs in memory and is
// free to lose them. What is stored here survives a restart there.

// Import statuses. `cancelled` is the user's doing; `failed` is the video's or
// the extractor's, and always carries a code.
const (
	ImportStatusQueued    = "queued"
	ImportStatusRunning   = "running"
	ImportStatusSucceeded = "succeeded"
	ImportStatusFailed    = "failed"
	ImportStatusCancelled = "cancelled"
)

// MaxImportAttempts bounds retries. Starting an extraction is not idempotent —
// it spends a transcription — so a retry is a deliberate act, and a bounded one.
const MaxImportAttempts = 3

// RecipeImport is one user's attempt at one video.
type RecipeImport struct {
	ID             string
	UserID         string
	SourceURL      string
	SourcePlatform string
	Status         string
	// The extraction service's own job id. Nil until it has accepted the job.
	ProviderJobID *string
	// Set only once the user accepts the draft and it becomes a real recipe.
	RecipeID *string
	// The normalized draft, held between extraction and acceptance so an
	// unreviewed recipe never has to exist in `recipes` to be looked at.
	Draft        *Recipe
	AttemptCount int
	ErrorCode    *string
	ErrorMessage *string
	CreatedAt    time.Time
	StartedAt    *time.Time
	CompletedAt  *time.Time
	UpdatedAt    time.Time
}

// Settled reports whether an import will not change again.
func (i RecipeImport) Settled() bool {
	switch i.Status {
	case ImportStatusSucceeded, ImportStatusFailed, ImportStatusCancelled:
		return true
	}
	return false
}

// Live reports whether an import is still in flight, and so whether it should
// be polled and whether it blocks a second import of the same video.
func (i RecipeImport) Live() bool {
	return i.Status == ImportStatusQueued || i.Status == ImportStatusRunning
}

// Supported video platforms. The schema says supported hosts are decided
// server-side, and this is where. An unrecognised host is rejected before a
// transcription is spent on it.
const (
	PlatformYouTube   = "youtube"
	PlatformInstagram = "instagram"
	PlatformTikTok    = "tiktok"
)

var videoHosts = map[string]string{
	"youtube.com":       PlatformYouTube,
	"www.youtube.com":   PlatformYouTube,
	"m.youtube.com":     PlatformYouTube,
	"youtu.be":          PlatformYouTube,
	"instagram.com":     PlatformInstagram,
	"www.instagram.com": PlatformInstagram,
	"tiktok.com":        PlatformTikTok,
	"www.tiktok.com":    PlatformTikTok,
	"vm.tiktok.com":     PlatformTikTok,
}

// ErrUnsupportedVideoSource is returned for a link this system cannot import.
var ErrUnsupportedVideoSource = errors.New("that video link is not supported")

// ParseVideoURL validates a submitted link and reports which platform it is.
//
// It returns the URL normalized to scheme and host plus path — query strings
// and fragments are dropped, because they carry tracking parameters that would
// otherwise make the same video look like two different ones and defeat the
// one-live-import-per-video rule. YouTube's `v` parameter is the exception and
// is kept.
func ParseVideoURL(raw string) (normalized string, platform string, err error) {
	parsed, parseErr := url.Parse(strings.TrimSpace(raw))
	if parseErr != nil || parsed.Host == "" {
		return "", "", ErrUnsupportedVideoSource
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", "", ErrUnsupportedVideoSource
	}
	platform, ok := videoHosts[strings.ToLower(parsed.Host)]
	if !ok {
		return "", "", ErrUnsupportedVideoSource
	}

	clean := url.URL{Scheme: "https", Host: strings.ToLower(parsed.Host), Path: parsed.Path}
	if platform == PlatformYouTube {
		if id := parsed.Query().Get("v"); id != "" {
			clean.RawQuery = url.Values{"v": {id}}.Encode()
		}
	}
	return clean.String(), platform, nil
}
