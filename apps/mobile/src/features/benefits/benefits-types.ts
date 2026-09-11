/**
 * The shapes the benefits screens work with, taken from the generated contract
 * so a schema change breaks the build here rather than at runtime.
 */
import type {
  BenefitsApplicationQuery,
  BenefitsChecklistQuery,
  BenefitsFieldVocabularyQuery,
  BenefitsFormsQuery,
  BenefitsPortalQuery,
  BenefitsProfileQuery,
  BenefitsStateFromZipQuery,
} from "@helpthehive/api-contract";

import type {
  BenefitsProgramRule,
  BenefitsRenewal,
  BenefitsRenewalSource,
  BenefitsRenewalStatus,
} from "@/graphql/benefits-operations";

export type BenefitsProfileData = BenefitsProfileQuery["benefitsProfile"];
export type BenefitsForm = BenefitsFormsQuery["benefitsForms"][number];
export type BenefitsApplication = NonNullable<BenefitsApplicationQuery["benefitsApplication"]>;
export type BenefitsMissingField = BenefitsApplication["missingFields"][number];
export type BenefitsFilledField = BenefitsApplication["filledFields"][number];
export type BenefitsFieldSpec = BenefitsFieldVocabularyQuery["benefitsFieldVocabulary"][number];

/**
 * Submission Phase 1 shapes, taken from the generated contract so a schema
 * change breaks the build here rather than at runtime.
 */
export type BenefitsStateLookup = BenefitsStateFromZipQuery["benefitsStateFromZip"];
export type BenefitsPortal = BenefitsPortalQuery["benefitsPortal"];
export type BenefitsChecklistSection = BenefitsChecklistQuery["benefitsChecklist"][number];
export type BenefitsChecklistItem = BenefitsChecklistSection["items"][number];

/**
 * Renewal shapes are declared by hand in the GraphQL layer until the generated
 * contract grows the renewal operations; they are re-exported here so screens
 * keep importing types from one place.
 */
export type {
  BenefitsProgramRule,
  BenefitsRenewal,
  BenefitsRenewalSource,
  BenefitsRenewalStatus,
};
