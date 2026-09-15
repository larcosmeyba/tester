/**
 * The program picker catalog (audit Section 3, Page 2).
 *
 * Built on the existing `benefitPrograms` config from `@/data/mock-data` —
 * those four entries are reused verbatim, not redefined. The four programs
 * the picker screenshots show that the shared config does not have yet
 * (TANF, VA Disability, VA Pension, VA Health Care) are added here with the
 * approved screenshot copy, so there is still exactly one list.
 *
 * Category pills and picker blurbs use Marcos's approved screenshot wording.
 * Icons are existing HiveIcon names only — nothing invented.
 */
import { benefitPrograms, type BenefitProgram } from '@/data/mock-data';
import type { HiveIconName } from '@/components/hive-ui';

export type CatalogProgram = BenefitProgram & {
  /** Category pill shown beside the program name, e.g. "Food Assistance". */
  categoryPill: string;
  /** One-line picker description from the approved screenshots. */
  pickerBlurb: string;
  /** Existing HiveIcon name for the program tile. */
  icon: HiveIconName;
  /** Soft tile background tint. */
  tileColor: string;
};

const SNAPSHOT_COPY: Record<string, Pick<CatalogProgram, 'categoryPill' | 'pickerBlurb' | 'icon' | 'tileColor'>> = {
  snap: {
    categoryPill: 'Food Assistance',
    pickerBlurb: 'Helps eligible households pay for groceries.',
    icon: 'cart',
    tileColor: '#E4F2E4',
  },
  wic: {
    categoryPill: 'Women, Infants & Children',
    pickerBlurb: 'Provides food and nutrition support for pregnant women, infants, and young children.',
    icon: 'child',
    tileColor: '#FBEEDF',
  },
  medicaid: {
    categoryPill: 'Health Coverage',
    pickerBlurb: 'Provides health coverage for eligible low-income individuals and families.',
    icon: 'heart',
    tileColor: '#E3ECFB',
  },
  liheap: {
    categoryPill: 'Utility Assistance',
    pickerBlurb: 'Helps eligible households pay home energy costs.',
    icon: 'bolt',
    tileColor: '#FBF3DF',
  },
};

const ADDITIONAL_PROGRAMS: CatalogProgram[] = [
  {
    id: 'tanf',
    name: 'TANF',
    agency: 'State human services agency',
    description: 'Temporary cash assistance for eligible families.',
    estimate: 'Monthly cash help for families with children',
    requirements: ['Proof of identity', 'Income information', 'Household composition'],
    categoryPill: 'Cash Assistance',
    pickerBlurb: 'Provides temporary cash assistance for eligible families.',
    icon: 'card',
    tileColor: '#EFE7FA',
  },
  {
    id: 'va_disability',
    name: 'VA Disability',
    agency: 'U.S. Department of Veterans Affairs',
    description: 'Monthly tax-free payments for veterans with service-connected disabilities.',
    estimate: 'Tax-free monthly payments for service-connected conditions',
    requirements: ['DD-214', 'Medical documentation', 'Service records'],
    categoryPill: 'Veterans Affairs',
    pickerBlurb: 'Monthly tax-free payments for veterans with service-connected disabilities or conditions.',
    icon: 'shield',
    tileColor: '#E7EAFB',
  },
  {
    id: 'va_pension',
    name: 'VA Pension',
    agency: 'U.S. Department of Veterans Affairs',
    description: 'Financial support for low-income wartime veterans and surviving spouses.',
    estimate: 'Supplemental income for wartime veterans',
    requirements: ['DD-214', 'Proof of income', 'Medical records if claiming disability'],
    categoryPill: 'Veterans Affairs',
    pickerBlurb: 'Provides financial support to low-income wartime veterans and surviving spouses.',
    icon: 'bank',
    tileColor: '#E7EAFB',
  },
  {
    id: 'va_healthcare',
    name: 'VA Health Care',
    agency: 'U.S. Department of Veterans Affairs',
    description: 'Comprehensive medical care through VA facilities.',
    estimate: 'Medical, mental health, and prescriptions through VA',
    requirements: ['DD-214', 'Income information'],
    categoryPill: 'Veterans Affairs',
    pickerBlurb: 'Provides comprehensive medical care, mental health services, and prescriptions through VA facilities.',
    icon: 'heart',
    tileColor: '#E7EAFB',
  },
];

/**
 * Every program the picker can show, in screenshot order. The first four come
 * from the shared config; the rest are the screenshot additions above.
 */
export const programCatalog: CatalogProgram[] = [
  ...benefitPrograms.map((program) => ({
    ...program,
    ...SNAPSHOT_COPY[program.id],
  })),
  ...ADDITIONAL_PROGRAMS,
];
