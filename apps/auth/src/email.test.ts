import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchAuthEmail,
  emailChangeVerificationEmail,
  type EmailDispatcher,
  MemoryEmailDispatcher,
  passwordResetEmail,
  verificationEmail,
} from "./email.js";

test("memory dispatcher captures verification email", async () => {
  const dispatcher = new MemoryEmailDispatcher();
  const url = "http://localhost:3000/api/auth/verify-email?token=secret";
  const message = verificationEmail("sam@example.com", url);

  await dispatcher.send(message);

  assert.equal(dispatcher.messages.length, 1);
  assert.equal(dispatcher.messages[0]?.kind, "verification");
  assert.match(dispatcher.messages[0]?.text ?? "", /expires in one hour/);
  assert.match(dispatcher.messages[0]?.html ?? "", /Verify email/);
  assert.match(dispatcher.messages[0]?.html ?? "", /token=secret/);
});

test("password reset template contains the actionable callback", () => {
  const url = "helpthehive://auth/reset-password?token=secret";
  const message = passwordResetEmail("sam@example.com", url);

  assert.equal(message.kind, "password-reset");
  assert.match(message.text, /token=secret/);
  assert.match(message.html, /Reset password/);
});

test("email change verification goes to the new address", () => {
  const message = emailChangeVerificationEmail("new@example.com", "helpthehive://auth/verified");

  assert.equal(message.kind, "email-change-verification");
  assert.equal(message.to, "new@example.com");
  assert.match(message.text, /new Help The Hive login email/);
  assert.match(message.html, /Verify new email/);
});

test("auth email dispatch starts delivery without awaiting it", async () => {
  let resolveDelivery: ((value: { id: string }) => void) | undefined;
  const dispatcher: EmailDispatcher = {
    send: () =>
      new Promise((resolve) => {
        resolveDelivery = resolve;
      }),
  };

  dispatchAuthEmail(dispatcher, verificationEmail("sam@example.com", "https://example.com/verify"));

  assert.ok(resolveDelivery, "delivery should start synchronously");
  resolveDelivery({ id: "sent" });
  await Promise.resolve();
});

test("auth email dispatch safely reports asynchronous delivery failures", async () => {
  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  const dispatcher: EmailDispatcher = {
    send: async () => {
      throw new Error("provider unavailable");
    },
  };

  try {
    dispatchAuthEmail(dispatcher, passwordResetEmail("sam@example.com", "https://example.com/reset?token=secret"));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(logged, [
    ["auth_email_dispatch_failed", { kind: "password-reset", errorType: "Error" }],
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /sam@example\.com|token=secret/);
});
