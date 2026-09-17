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

// LinkSender delivers a magic verification link to an email address.
type LinkSender interface {
	SendVerificationLink(ctx context.Context, destination, linkURL string) error
}

// DefaultEmailFrom is used for verification emails unless EMAIL_FROM is set.
// It uses the auth subdomain, which is the domain verified in Resend.
const DefaultEmailFrom = "Help The Hive <noreply@auth.helpthehive.com>"

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

// SendVerificationLink emails a magic verification link via Resend. The
// Verify button opens GET /auth/verify?token=... on the API, which consumes
// the link and marks the account verified.
func (s *ResendEmailSender) SendVerificationLink(ctx context.Context, destination, linkURL string) error {
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
		Subject: "Verify your Help The Hive account",
		HTML: fmt.Sprintf(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#20242A;">
  <h1 style="font-size:22px;margin:0 0 12px;">Welcome to Help The Hive</h1>
  <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">Tap the button below to verify your email and finish setting up your account.</p>
  <a href="%s" style="display:inline-block;background:#1B5E20;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 40px;border-radius:999px;">Verify</a>
  <p style="font-size:13px;line-height:1.5;color:#555A64;margin:24px 0 0;">This link expires in 24 hours and can only be used once. If you didn&apos;t create a Help The Hive account, you can ignore this email.</p>
</div>`, linkURL),
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
