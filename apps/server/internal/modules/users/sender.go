// CodeSender delivers one-time verification codes. Verification is
// email-only: the sender talks to Resend's HTTP API (SMS was removed as a
// channel in September 2026, so there is no text sender).
package users

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/helpthehive/server/internal/apperrors"
)

// CodeSender delivers a verification code to a destination address.
type CodeSender interface {
	SendCode(ctx context.Context, destination, code string) error
}

// DefaultEmailFrom is used for verification emails unless EMAIL_FROM is set.
const DefaultEmailFrom = "Help The Hive <support@helpthehive.com>"

// ResendEmailSender delivers verification codes through the Resend HTTP API.
// It reads RESEND_API_KEY (and the optional EMAIL_FROM override) at send
// time so deploys can pick up rotated keys without a restart.
type ResendEmailSender struct {
	client *http.Client
}

// NewResendEmailSender builds an email sender backed by Resend.
func NewResendEmailSender() *ResendEmailSender {
	return &ResendEmailSender{client: &http.Client{Timeout: 15 * time.Second}}
}

type resendEmailRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// SendCode emails the verification code via Resend.
func (s *ResendEmailSender) SendCode(ctx context.Context, destination, code string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return apperrors.Public("email verification is not configured yet — please try again later")
	}
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = DefaultEmailFrom
	}

	body, err := json.Marshal(resendEmailRequest{
		From:    from,
		To:      []string{destination},
		Subject: "Your Help The Hive verification code",
		HTML: fmt.Sprintf(
			`<p>Your Help The Hive verification code is <strong>%s</strong>.</p>`+
				`<p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
			code,
		),
	})
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := s.client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return fmt.Errorf("resend send failed: status %d: %s", response.StatusCode, string(detail))
	}
	return nil
}

// DefaultCodeSenders returns the senders wired into the service: Resend
// for email, the only verification channel.
func DefaultCodeSenders() map[string]CodeSender {
	return map[string]CodeSender{
		"email": NewResendEmailSender(),
	}
}
