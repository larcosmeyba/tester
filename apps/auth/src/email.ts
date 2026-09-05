import { randomUUID } from "node:crypto";

import { Resend } from "resend";

export type AuthEmailKind = "verification" | "password-reset" | "email-change-verification";

export type AuthEmail = {
  kind: AuthEmailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailDispatcher {
  send(message: AuthEmail): Promise<{ id: string }>;
}

/**
 * Starts transactional email delivery without extending the auth request.
 * Better Auth recommends not awaiting verification and reset delivery because
 * response timing can otherwise disclose whether an account exists.
 */
export function dispatchAuthEmail(dispatcher: EmailDispatcher, message: AuthEmail): void {
  void dispatcher.send(message).catch((error: unknown) => {
    console.error("auth_email_dispatch_failed", {
      kind: message.kind,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  });
}

export class ResendEmailDispatcher implements EmailDispatcher {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly from: string) {
    this.client = new Resend(apiKey);
  }

  async send(message: AuthEmail) {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error || !data?.id) {
      throw new Error("Transactional email delivery failed");
    }
    console.info("auth_email_dispatched", { kind: message.kind, messageId: data.id });
    return { id: data.id };
  }
}

export class DevelopmentEmailDispatcher implements EmailDispatcher {
  async send(message: AuthEmail) {
    const id = `dev-${randomUUID()}`;
    console.info("auth_email_captured", { kind: message.kind, messageId: id });
    return { id };
  }
}

export class MemoryEmailDispatcher implements EmailDispatcher {
  readonly messages: AuthEmail[] = [];

  async send(message: AuthEmail) {
    this.messages.push(message);
    return { id: `memory-${this.messages.length}` };
  }
}

function escapeHTML(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function emailShell(title: string, body: string, action: string, url: string) {
  const safeURL = escapeHTML(url);
  return `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;color:#17212b;line-height:1.5">
<main style="max-width:560px;margin:32px auto;padding:24px">
<h1 style="color:#208aef">${escapeHTML(title)}</h1>
<p>${escapeHTML(body)}</p>
<p><a href="${safeURL}" style="display:inline-block;background:#208aef;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">${escapeHTML(action)}</a></p>
<p style="color:#5f6872;font-size:13px">This link expires in one hour. If you did not request this, you can ignore this email.</p>
</main></body></html>`;
}

export function verificationEmail(to: string, url: string): AuthEmail {
  const subject = "Verify your Help The Hive email";
  return {
    kind: "verification",
    to,
    subject,
    text: `Verify your Help The Hive email by opening this link: ${url}\n\nThis link expires in one hour.`,
    html: emailShell(subject, "Confirm your email address to finish creating your account.", "Verify email", url),
  };
}

export function passwordResetEmail(to: string, url: string): AuthEmail {
  const subject = "Reset your Help The Hive password";
  return {
    kind: "password-reset",
    to,
    subject,
    text: `Reset your Help The Hive password by opening this link: ${url}\n\nThis link expires in one hour.`,
    html: emailShell(subject, "Choose a new password for your account.", "Reset password", url),
  };
}

export function emailChangeVerificationEmail(to: string, url: string): AuthEmail {
  const subject = "Verify your new Help The Hive email";
  return {
    kind: "email-change-verification",
    to,
    subject,
    text: `Verify this as your new Help The Hive login email by opening this link: ${url}\n\nThis link expires in one hour.`,
    html: emailShell(subject, "Confirm this address as your new login email.", "Verify new email", url),
  };
}
