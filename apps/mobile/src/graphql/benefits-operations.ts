/**
 * Government benefits GraphQL documents.
 *
 * They live beside `operations.ts` rather than inside it so the benefits
 * contract can grow without turning one file into the whole API surface. The
 * document text mirrors `packages/api-contract/operations/benefits.graphql`,
 * and the types come from the generated contract, so a schema change breaks the
 * build here.
 *
 * No operation sends a user id. Ownership is decided by the server from the
 * bearer token the client attaches, never by anything the app passes in.
 *
 * Nothing sensitive comes back through these: a Social Security number on a
 * profile is returned as a hint such as "*** 6789", never as the value.
 */
import type {
  ApproveBenefitsApplicationMutation,
  ApproveBenefitsApplicationMutationVariables,
  BenefitsApplicationQuery,
  BenefitsApplicationQueryVariables,
  BenefitsApplicationsQuery,
  BenefitsApplicationsQueryVariables,
  BenefitsChecklistQuery,
  BenefitsChecklistQueryVariables,
  BenefitsFieldVocabularyQuery,
  BenefitsFieldVocabularyQueryVariables,
  BenefitsFormsQuery,
  BenefitsFormsQueryVariables,
  BenefitsPortalQuery,
  BenefitsPortalQueryVariables,
  BenefitsProfileQuery,
  BenefitsProfileQueryVariables,
  BenefitsStateFromZipQuery,
  BenefitsStateFromZipQueryVariables,
  DeleteBenefitsApplicationMutation,
  DeleteBenefitsApplicationMutationVariables,
  RecordBenefitsConfirmationMutation,
  RecordBenefitsConfirmationMutationVariables,
  RefillBenefitsApplicationMutation,
  RefillBenefitsApplicationMutationVariables,
  SaveBenefitsAnswersMutation,
  SaveBenefitsAnswersMutationVariables,
  SaveBenefitsGroupMutation,
  SaveBenefitsGroupMutationVariables,
  StartBenefitsApplicationMutation,
  StartBenefitsApplicationMutationVariables,
} from "@helpthehive/api-contract";

import type { GraphQLDocument } from "./operations";

/**
 * Renewal tracking types (local, mirroring the server contract).
 *
 * The generated `@helpthehive/api-contract` types do not include the renewal
 * operations yet — the server side is landing in parallel — so these shapes are
 * declared here by hand to match the agreed contract exactly:
 *
 *   type BenefitsRenewal { id: ID!, program: String!, state: String!,
 *     formId: String!, certificationEndsAt: Time, renewalDueAt: Time!,
 *     source: String!, status: String!, reminderStage: Int!, daysRemaining: Int! }
 *
 * `Time` values arrive as ISO-8601 strings. When the generated contract grows
 * these operations, the hand-declared types below should be replaced with the
 * generated ones so a schema change breaks the build here.
 */
export type BenefitsRenewalSource = "rule-derived" | "user-confirmed";
export type BenefitsRenewalStatus =
  | "scheduled"
  | "reminded"
  | "started"
  | "done"
  | "dismissed";

export type BenefitsRenewal = {
  id: string;
  program: string;
  state: string;
  formId: string;
  certificationEndsAt: string | null;
  renewalDueAt: string;
  source: BenefitsRenewalSource | string;
  status: BenefitsRenewalStatus | string;
  reminderStage: number;
  daysRemaining: number;
};

/**
 * Per-program/state reference data used as smart defaults for certification
 * periods (e.g. SNAP commonly certifies for 12 months). Reference data, not PII.
 *
 * Mirrors the server schema exactly: `state` is "*" for the national default,
 * and `certPeriodMonths` is null when the program has no fixed period.
 */
export type BenefitsProgramRule = {
  program: string;
  state: string;
  certPeriodMonths: number | null;
  sourceCitation: string;
  notes: string | null;
};

export type BenefitsRenewalsQuery = { benefitsRenewals: BenefitsRenewal[] };
export type BenefitsRenewalsQueryVariables = Record<string, never>;

export type BenefitsProgramRulesQuery = {
  benefitsProgramRules: BenefitsProgramRule[];
};
export type BenefitsProgramRulesQueryVariables = {
  program?: string | null;
};

export type ConfirmBenefitsRenewalDeadlineMutation = {
  confirmBenefitsRenewalDeadline: BenefitsRenewal;
};
export type ConfirmBenefitsRenewalDeadlineMutationVariables = {
  renewalId: string;
  renewalDueAt: string;
  certificationEndsAt?: string | null;
};

export type StartBenefitsRenewalApplicationMutation = {
  startBenefitsRenewalApplication: StartBenefitsApplicationMutation["startBenefitsApplication"];
};
export type StartBenefitsRenewalApplicationMutationVariables = {
  renewalId: string;
};

export type DismissBenefitsRenewalMutation = {
  dismissBenefitsRenewal: boolean;
};
export type DismissBenefitsRenewalMutationVariables = {
  renewalId: string;
};

export type UpdateBenefitsRenewalPreferencesMutation = {
  updateBenefitsRenewalPreferences: boolean;
};
export type UpdateBenefitsRenewalPreferencesMutationVariables = {
  renewalAlertsEnabled: boolean;
  discreetLockScreen: boolean;
};

const RENEWAL_FIELDS = `
  fragment BenefitsRenewalFields on BenefitsRenewal {
    id
    program
    state
    formId
    certificationEndsAt
    renewalDueAt
    source
    status
    reminderStage
    daysRemaining
  }
`;

export const BenefitsRenewalsDocument = `
  ${RENEWAL_FIELDS}
  query BenefitsRenewals {
    benefitsRenewals { ...BenefitsRenewalFields }
  }
` as GraphQLDocument<BenefitsRenewalsQuery, BenefitsRenewalsQueryVariables>;

export const BenefitsProgramRulesDocument = `
  query BenefitsProgramRules($program: String) {
    benefitsProgramRules(program: $program) {
      program
      state
      certPeriodMonths
      sourceCitation
      notes
    }
  }
` as GraphQLDocument<BenefitsProgramRulesQuery, BenefitsProgramRulesQueryVariables>;

export const ConfirmBenefitsRenewalDeadlineDocument = `
  ${RENEWAL_FIELDS}
  mutation ConfirmBenefitsRenewalDeadline($renewalId: ID!, $renewalDueAt: Time!, $certificationEndsAt: Time) {
    confirmBenefitsRenewalDeadline(renewalId: $renewalId, renewalDueAt: $renewalDueAt, certificationEndsAt: $certificationEndsAt) {
      ...BenefitsRenewalFields
    }
  }
` as GraphQLDocument<
  ConfirmBenefitsRenewalDeadlineMutation,
  ConfirmBenefitsRenewalDeadlineMutationVariables
>;


export const DismissBenefitsRenewalDocument = `
  mutation DismissBenefitsRenewal($renewalId: ID!) {
    dismissBenefitsRenewal(renewalId: $renewalId)
  }
` as GraphQLDocument<DismissBenefitsRenewalMutation, DismissBenefitsRenewalMutationVariables>;

export const UpdateBenefitsRenewalPreferencesDocument = `
  mutation UpdateBenefitsRenewalPreferences($renewalAlertsEnabled: Boolean!, $discreetLockScreen: Boolean!) {
    updateBenefitsRenewalPreferences(renewalAlertsEnabled: $renewalAlertsEnabled, discreetLockScreen: $discreetLockScreen)
  }
` as GraphQLDocument<
  UpdateBenefitsRenewalPreferencesMutation,
  UpdateBenefitsRenewalPreferencesMutationVariables
>;

const FORM_FIELDS = `
  fragment BenefitsFormFields on BenefitsForm {
    id
    key
    status
    program
    country
    state
    formCode
    formTitle
    formVersion
    revision
    pageCount
    templateKind
    agencyUrl
    mappedFieldCount
    fillableFieldCount
    effectiveDate
    sourceUrl
    retrievedAt
  }
`;

const ANSWER_FIELDS = `
  fragment BenefitsAnswerFields on BenefitsAnswer {
    fieldPath
    rowId
    status
    kind
    source
    isSensitive
    text
    number
    moneyCents
    date
    bool
    list
    hint
  }
`;

const PROFILE_FIELDS = `
  ${ANSWER_FIELDS}
  fragment BenefitsProfileFields on BenefitsProfile {
    vocabularyVersion
    answers { ...BenefitsAnswerFields }
    groups {
      groupPath
      collected
      rows {
        rowId
        answers { ...BenefitsAnswerFields }
      }
    }
  }
`;

const APPLICATION_FIELDS = `
  ${FORM_FIELDS}
  fragment BenefitsApplicationFields on BenefitsApplication {
    id
    status
    form { ...BenefitsFormFields }
    filledFields {
      fieldId
      label
      fieldPath
      page
      source
      text
      checked
      isCheckbox
      isSensitive
    }
    missingFields {
      fieldPath
      label
      question
      group
      answerKind
      choices
      strength
      isSensitive
      isDerived
      formFieldIds
    }
    problems { fieldId fieldPath reason }
    skippedFields { fieldId reason note }
    failureReason
    draftDocumentPath
    finalDocumentPath
    createdAt
    updatedAt
    approvedAt
    signedName
    signedAt
    confirmationNumber
    confirmationRecordedAt
  }
`;

export const BenefitsProfileDocument = `
  ${PROFILE_FIELDS}
  query BenefitsProfile {
    benefitsProfile { ...BenefitsProfileFields }
  }
` as GraphQLDocument<BenefitsProfileQuery, BenefitsProfileQueryVariables>;

export const BenefitsFormsDocument = `
  ${FORM_FIELDS}
  query BenefitsForms($state: String, $program: String) {
    benefitsForms(state: $state, program: $program) { ...BenefitsFormFields }
  }
` as GraphQLDocument<BenefitsFormsQuery, BenefitsFormsQueryVariables>;

export const BenefitsApplicationsDocument = `
  ${APPLICATION_FIELDS}
  query BenefitsApplications {
    benefitsApplications { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<BenefitsApplicationsQuery, BenefitsApplicationsQueryVariables>;

export const BenefitsApplicationDocument = `
  ${APPLICATION_FIELDS}
  query BenefitsApplication($applicationId: ID!) {
    benefitsApplication(applicationId: $applicationId) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<BenefitsApplicationQuery, BenefitsApplicationQueryVariables>;

export const BenefitsFieldVocabularyDocument = `
  query BenefitsFieldVocabulary {
    benefitsFieldVocabulary {
      fieldPath
      kind
      group
      label
      question
      choices
      isSensitive
      isDerived
      isRepeating
    }
  }
` as GraphQLDocument<BenefitsFieldVocabularyQuery, BenefitsFieldVocabularyQueryVariables>;

export const SaveBenefitsAnswersDocument = `
  ${PROFILE_FIELDS}
  mutation SaveBenefitsAnswers($input: [BenefitsAnswerInput!]!) {
    saveBenefitsAnswers(input: $input) { ...BenefitsProfileFields }
  }
` as GraphQLDocument<SaveBenefitsAnswersMutation, SaveBenefitsAnswersMutationVariables>;

export const SaveBenefitsGroupDocument = `
  ${PROFILE_FIELDS}
  mutation SaveBenefitsGroup($input: SaveBenefitsGroupInput!) {
    saveBenefitsGroup(input: $input) { ...BenefitsProfileFields }
  }
` as GraphQLDocument<SaveBenefitsGroupMutation, SaveBenefitsGroupMutationVariables>;

export const StartBenefitsApplicationDocument = `
  ${APPLICATION_FIELDS}
  mutation StartBenefitsApplication($formId: ID!) {
    startBenefitsApplication(formId: $formId) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<StartBenefitsApplicationMutation, StartBenefitsApplicationMutationVariables>;

export const RefillBenefitsApplicationDocument = `
  ${APPLICATION_FIELDS}
  mutation RefillBenefitsApplication($applicationId: ID!) {
    refillBenefitsApplication(applicationId: $applicationId) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<RefillBenefitsApplicationMutation, RefillBenefitsApplicationMutationVariables>;

export const ApproveBenefitsApplicationDocument = `
  ${APPLICATION_FIELDS}
  mutation ApproveBenefitsApplication($applicationId: ID!, $signedName: String!, $attestationAccepted: Boolean!) {
    approveBenefitsApplication(applicationId: $applicationId, signedName: $signedName, attestationAccepted: $attestationAccepted) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<ApproveBenefitsApplicationMutation, ApproveBenefitsApplicationMutationVariables>;

export const RecordBenefitsConfirmationDocument = `
  ${APPLICATION_FIELDS}
  mutation RecordBenefitsConfirmation($applicationId: ID!, $confirmationNumber: String!) {
    recordBenefitsConfirmation(applicationId: $applicationId, confirmationNumber: $confirmationNumber) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<RecordBenefitsConfirmationMutation, RecordBenefitsConfirmationMutationVariables>;

export const DeleteBenefitsApplicationDocument = `
  mutation DeleteBenefitsApplication($applicationId: ID!) {
    deleteBenefitsApplication(applicationId: $applicationId)
  }
` as GraphQLDocument<DeleteBenefitsApplicationMutation, DeleteBenefitsApplicationMutationVariables>;

/**
 * Starts a renewal application from a tracked renewal. Declared at the end of
 * the file because it needs the application fragments defined above; the
 * renewal documents that only need the renewal fragment live near the top.
 */
export const StartBenefitsRenewalApplicationDocument = `
  ${APPLICATION_FIELDS}
  mutation StartBenefitsRenewalApplication($renewalId: ID!) {
    startBenefitsRenewalApplication(renewalId: $renewalId) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<
  StartBenefitsRenewalApplicationMutation,
  StartBenefitsRenewalApplicationMutationVariables
>;

/**
 * Submission Phase 1 documents: state detection from ZIP, the official
 * portal for a program in a state, and the guided before/during/after
 * checklist. Types come from the generated contract; the document text
 * mirrors `packages/api-contract/operations/benefits.graphql`.
 *
 * The portal URL is never invented: it arrives verified against an official
 * .gov source, or it is null and the app shows fallback guidance instead.
 */
export const BenefitsStateFromZipDocument = `
  query BenefitsStateFromZip($zip: String!) {
    benefitsStateFromZip(zip: $zip) {
      zip
      state
      detail
    }
  }
` as GraphQLDocument<BenefitsStateFromZipQuery, BenefitsStateFromZipQueryVariables>;

export const BenefitsPortalDocument = `
  query BenefitsPortal($program: String!, $state: String!) {
    benefitsPortal(program: $program, state: $state) {
      program
      state
      url
      verified
      fallbackGuidance
    }
  }
` as GraphQLDocument<BenefitsPortalQuery, BenefitsPortalQueryVariables>;

export const BenefitsChecklistDocument = `
  query BenefitsChecklist($program: String!, $state: String!) {
    benefitsChecklist(program: $program, state: $state) {
      phase
      title
      items {
        label
        detail
        confirmOnPortal
      }
    }
  }
` as GraphQLDocument<BenefitsChecklistQuery, BenefitsChecklistQueryVariables>;
