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
  BenefitsFieldVocabularyQuery,
  BenefitsFieldVocabularyQueryVariables,
  BenefitsFormsQuery,
  BenefitsFormsQueryVariables,
  BenefitsProfileQuery,
  BenefitsProfileQueryVariables,
  DeleteBenefitsApplicationMutation,
  DeleteBenefitsApplicationMutationVariables,
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

const FORM_FIELDS = `
  fragment BenefitsFormFields on BenefitsForm {
    id
    key
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
    draftDocumentPath
    finalDocumentPath
    createdAt
    updatedAt
    approvedAt
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
  mutation ApproveBenefitsApplication($applicationId: ID!) {
    approveBenefitsApplication(applicationId: $applicationId) { ...BenefitsApplicationFields }
  }
` as GraphQLDocument<ApproveBenefitsApplicationMutation, ApproveBenefitsApplicationMutationVariables>;

export const DeleteBenefitsApplicationDocument = `
  mutation DeleteBenefitsApplication($applicationId: ID!) {
    deleteBenefitsApplication(applicationId: $applicationId)
  }
` as GraphQLDocument<DeleteBenefitsApplicationMutation, DeleteBenefitsApplicationMutationVariables>;
