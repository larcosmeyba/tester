/**
 * The shapes the benefits screens work with, taken from the generated contract
 * so a schema change breaks the build here rather than at runtime.
 */
import type {
  BenefitsApplicationQuery,
  BenefitsFieldVocabularyQuery,
  BenefitsFormsQuery,
  BenefitsProfileQuery,
} from "@helpthehive/api-contract";

export type BenefitsProfileData = BenefitsProfileQuery["benefitsProfile"];
export type BenefitsForm = BenefitsFormsQuery["benefitsForms"][number];
export type BenefitsApplication = NonNullable<BenefitsApplicationQuery["benefitsApplication"]>;
export type BenefitsMissingField = BenefitsApplication["missingFields"][number];
export type BenefitsFilledField = BenefitsApplication["filledFields"][number];
export type BenefitsFieldSpec = BenefitsFieldVocabularyQuery["benefitsFieldVocabulary"][number];
