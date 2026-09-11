package benefits

import "errors"

var (
	// ErrUnknownFieldPath: the path is not in the vocabulary at this version.
	ErrUnknownFieldPath = errors.New("unknown field path")
	// ErrDerivedFieldPath: the path is computed and cannot be written directly.
	ErrDerivedFieldPath = errors.New("field path is derived")
	// ErrInvalidValue: the value does not fit the field's kind or choice set.
	ErrInvalidValue = errors.New("invalid value")
	// ErrInvalidMapping: a mapping file is not usable as written.
	ErrInvalidMapping = errors.New("invalid mapping")
	// ErrNotFound is returned for anything the viewer may not see. It does not
	// distinguish "no such application" from "somebody else's application":
	// telling a user that another user's application exists is a disclosure.
	ErrNotFound = errors.New("not found")
	// ErrNotReady: an application still has required answers missing.
	ErrNotReady = errors.New("application is not ready")
	// ErrAlreadyApproved: an approved application is final and is not refilled.
	ErrAlreadyApproved = errors.New("application is already approved")
	// ErrSignatureRequired: approval needs the applicant's typed name. The
	// signature is never pre-filled, so a blank name is a refusal, not a
	// default.
	ErrSignatureRequired = errors.New("a typed signature is required to approve")
	// ErrAttestationRequired: the applicant must accept the attestation to
	// approve. Silence is not consent.
	ErrAttestationRequired = errors.New("the attestation must be accepted to approve")
)
