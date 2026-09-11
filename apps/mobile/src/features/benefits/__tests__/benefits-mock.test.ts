/**
 * The preview-only in-memory benefits service, exercised directly.
 *
 * The lifecycle under test: start → answer → missing fields shrink → refill →
 * ready-for-review → approve (signature) → confirmation records → renewal is
 * scheduled. Nothing here touches the network; the mock never leaves the
 * emulator build.
 */
import type { BenefitsAnswerInput } from "@helpthehive/api-contract";

import {
  __resetBenefitsMock,
  approveBenefitsApplication,
  confirmBenefitsRenewalDeadline,
  deleteBenefitsApplication,
  dismissBenefitsRenewal,
  fetchBenefitsApplication,
  fetchBenefitsApplications,
  fetchBenefitsChecklist,
  fetchBenefitsForms,
  fetchBenefitsPortal,
  fetchBenefitsProgramRules,
  fetchBenefitsRenewals,
  fetchBenefitsVocabulary,
  fetchStateFromZip,
  recordBenefitsConfirmation,
  refillBenefitsApplication,
  saveBenefitsAnswers,
  startBenefitsApplication,
  startBenefitsRenewalApplication,
  updateBenefitsRenewalPreferences,
} from "@/features/benefits/benefits-mock";

beforeEach(() => {
  __resetBenefitsMock();
});

const REQUIRED_ANSWERS: BenefitsAnswerInput[] = [
  { fieldPath: "applicant.first_name", status: "PROVIDED", text: "Jane" },
  { fieldPath: "applicant.last_name", status: "PROVIDED", text: "Doe" },
  { fieldPath: "applicant.date_of_birth", status: "PROVIDED", date: "1990-04-12" },
  { fieldPath: "applicant.ssn", status: "PROVIDED", text: "000-00-0000" },
  { fieldPath: "applicant.is_us_citizen", status: "PROVIDED", bool: true },
  { fieldPath: "contact.phone_primary", status: "PROVIDED", text: "555-0100" },
  { fieldPath: "address.residential.street1", status: "PROVIDED", text: "123 Main St" },
  { fieldPath: "address.residential.city", status: "PROVIDED", text: "St. Louis" },
  { fieldPath: "address.residential.state", status: "PROVIDED", text: "MO" },
  { fieldPath: "address.residential.postal_code", status: "PROVIDED", text: "63101" },
  { fieldPath: "household.size", status: "PROVIDED", number: 2 },
  { fieldPath: "employment.status", status: "PROVIDED", text: "Employed" },
  { fieldPath: "income.has_no_income", status: "PROVIDED", bool: false },
  { fieldPath: "housing.status", status: "PROVIDED", text: "Rent" },
];

async function answerEverythingRequired() {
  await saveBenefitsAnswers(REQUIRED_ANSWERS.map((a) => ({ ...a })));
}

describe("forms", () => {
  it("lists Missouri SNAP, WIC, Medicaid, and LIHEAP forms", async () => {
    const forms = await fetchBenefitsForms();
    expect(forms).toHaveLength(4);
    const snap = forms.find((f) => f.program === "SNAP");
    expect(snap?.state).toBe("MO");
    expect(snap?.formCode).toBe("IM-1");
    expect(forms.map((f) => f.program).sort()).toEqual(
      ["LIHEAP", "Medicaid", "SNAP", "WIC"].sort(),
    );
  });

  it("filters by program and state", async () => {
    expect((await fetchBenefitsForms(undefined, "SNAP"))).toHaveLength(1);
    expect((await fetchBenefitsForms("MO"))).toHaveLength(4);
    expect((await fetchBenefitsForms("KS"))).toHaveLength(0);
  });
});

describe("vocabulary", () => {
  it("covers the questionnaire groupings", async () => {
    const vocab = await fetchBenefitsVocabulary();
    const groups = new Set(vocab.map((s) => s.group));
    for (const group of [
      "applicant", "contact", "address", "household", "employment", "income",
      "housing", "utilities", "expenses", "resources", "benefits", "program",
    ]) {
      expect(groups).toContain(group);
    }
  });
});

describe("application lifecycle", () => {
  it("start → answer → missing shrinks → refill → review → sign → confirm", async () => {
    const forms = await fetchBenefitsForms(undefined, "SNAP");
    const started = await startBenefitsApplication(forms[0].id);
    expect(started.status).toBe("NEEDS_INFORMATION");
    const initialMissing = started.missingFields.filter((m) => m.strength === "REQUIRED");
    expect(initialMissing.length).toBeGreaterThan(0);

    // Saving one answer removes exactly that missing field.
    await saveBenefitsAnswers([
      { fieldPath: "applicant.first_name", status: "PROVIDED", text: "Jane" },
    ]);
    const afterOne = await fetchBenefitsApplication(started.id);
    expect(
      afterOne?.missingFields.some((m) => m.fieldPath === "applicant.first_name"),
    ).toBe(false);
    expect(afterOne?.missingFields).toHaveLength(started.missingFields.length - 1);

    // Approval is refused while required answers are missing.
    await expect(approveBenefitsApplication(started.id, "Jane Doe")).rejects.toThrow(
      /required answer/,
    );
    // And a blank signature is refused too.
    await answerEverythingRequired();
    const refilled = await refillBenefitsApplication(started.id);
    expect(refilled.status).toBe("READY_FOR_REVIEW");
    expect(
      refilled.missingFields.filter((m) => m.strength === "REQUIRED"),
    ).toHaveLength(0);
    await expect(approveBenefitsApplication(started.id, "   ")).rejects.toThrow(/full name/);

    // Signing completes the application and schedules a renewal.
    const approved = await approveBenefitsApplication(started.id, "Jane Doe");
    expect(approved.status).toBe("COMPLETED");
    expect(approved.signedName).toBe("Jane Doe");
    expect(approved.signedAt).not.toBeNull();
    const renewals = await fetchBenefitsRenewals();
    expect(renewals).toHaveLength(1);
    expect(renewals[0].program).toBe("SNAP");
    expect(renewals[0].source).toBe("rule-derived");
    expect(renewals[0].daysRemaining).toBeGreaterThan(300);

    // Recording the confirmation number sticks, and marks the renewal confirmed.
    const confirmed = await recordBenefitsConfirmation(started.id, "MO-123456");
    expect(confirmed.confirmationNumber).toBe("MO-123456");
    expect(confirmed.confirmationRecordedAt).not.toBeNull();
    const [renewal] = await fetchBenefitsRenewals();
    expect(renewal.source).toBe("user-confirmed");

    // Sensitive answers are masked on the filled fields.
    const ssnField = confirmed.filledFields.find(
      (f) => f.fieldPath === "applicant.ssn",
    );
    expect(ssnField?.text).toBe("•••");
  });

  it("returns null for an unknown application and deletes cleanly", async () => {
    expect(await fetchBenefitsApplication("mock-app-999")).toBeNull();
    const forms = await fetchBenefitsForms(undefined, "WIC");
    const app = await startBenefitsApplication(forms[0].id);
    expect(await deleteBenefitsApplication(app.id)).toBe(true);
    expect(await fetchBenefitsApplication(app.id)).toBeNull();
    await expect(deleteBenefitsApplication(app.id)).rejects.toThrow(/could not be found/);
  });

  it("lists applications newest first", async () => {
    const forms = await fetchBenefitsForms();
    const first = await startBenefitsApplication(forms[0].id);
    const second = await startBenefitsApplication(forms[1].id);
    const apps = await fetchBenefitsApplications();
    expect(apps.map((a) => a.id)).toEqual([second.id, first.id]);
  });
});

describe("ZIP to state", () => {
  it("detects Missouri and other states from the reference table", async () => {
    expect((await fetchStateFromZip("63101")).state).toBe("MO");
    expect((await fetchStateFromZip("90210")).state).toBe("CA");
  });

  it("never guesses: rejects bad input, territories, and unknown prefixes", async () => {
    const bad = await fetchStateFromZip("ABCDE");
    expect(bad.state).toBeNull();
    expect(bad.detail).toMatch(/exactly 5 digits/);
    const territory = await fetchStateFromZip("00901");
    expect(territory.state).toBeNull();
    expect(territory.detail).toMatch(/not a U.S. state/);
    const unknown = await fetchStateFromZip("00000");
    expect(unknown.state).toBeNull();
    expect(unknown.detail).toMatch(/no state was assumed/);
  });
});

describe("portal handoff", () => {
  it("returns the verified Missouri portals", async () => {
    const snap = await fetchBenefitsPortal("SNAP", "MO");
    expect(snap.verified).toBe(true);
    expect(snap.url).toBe("https://mydss.mo.gov/apply");
    const medicaid = await fetchBenefitsPortal("Medicaid", "MO");
    expect(medicaid.verified).toBe(true);
    expect(medicaid.url).toBe("https://mydss.mo.gov/apply");
  });

  it("returns null URL plus official-directory guidance when unverified", async () => {
    const portal = await fetchBenefitsPortal("SNAP", "KS");
    expect(portal.verified).toBe(false);
    expect(portal.url).toBeNull();
    expect(portal.fallbackGuidance).toMatch(/usa\.gov\/benefit-finder/);
    expect(portal.fallbackGuidance).toMatch(/\.gov/);
  });
});

describe("checklists", () => {
  it("returns the SNAP before/during/after checklist", async () => {
    const sections = await fetchBenefitsChecklist("SNAP", "MO");
    expect(sections.map((s) => s.phase)).toEqual(["before", "during", "after"]);
    expect(sections[0].items.length).toBeGreaterThan(0);
    expect(sections[0].items[0].detail).toMatch(/Missouri/);
  });
});

describe("program rules and renewals", () => {
  it("exposes the certification-period rules with citations", async () => {
    const rules = await fetchBenefitsProgramRules("SNAP");
    expect(rules).toHaveLength(1);
    expect(rules[0].certPeriodMonths).toBe(12);
    expect(rules[0].sourceCitation).toBe("7 CFR 273.10(f)");
  });

  it("confirms, starts renewal applications from, and dismisses renewals", async () => {
    const forms = await fetchBenefitsForms(undefined, "SNAP");
    const app = await startBenefitsApplication(forms[0].id);
    await answerEverythingRequired();
    await approveBenefitsApplication(app.id, "Jane Doe");
    const [renewal] = await fetchBenefitsRenewals();

    const confirmed = await confirmBenefitsRenewalDeadline(renewal.id, "2027-09-11T00:00:00Z");
    expect(confirmed.source).toBe("user-confirmed");
    expect(confirmed.renewalDueAt).toBe("2027-09-11T00:00:00.000Z");

    const renewalApp = await startBenefitsRenewalApplication(renewal.id);
    expect(renewalApp.id).not.toBe(app.id);
    // The profile is already fully answered, so the pre-filled renewal draft
    // is ready for review.
    expect(renewalApp.status).toBe("READY_FOR_REVIEW");
    // Profile answers carry over, so the renewal draft is pre-filled.
    expect(renewalApp.filledFields.length).toBeGreaterThan(0);
    const [updated] = await fetchBenefitsRenewals();
    expect(updated.status).toBe("started");

    expect(await dismissBenefitsRenewal(renewal.id)).toBe(true);
    const [dismissed] = await fetchBenefitsRenewals();
    expect(dismissed.status).toBe("dismissed");
  });

  it("stores renewal preferences", async () => {
    await expect(updateBenefitsRenewalPreferences(false, true)).resolves.toBe(true);
  });
});
