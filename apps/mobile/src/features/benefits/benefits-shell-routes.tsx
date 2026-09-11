/**
 * The app-state shell's view of the benefits flow.
 *
 * Each export is a thin wrapper: it puts the backend-connected benefits
 * screen inside the shell bridge so the screen's expo-style navigation and
 * params read from the shell's nav and route params instead. The screens
 * themselves are written once and also work under expo-router (the
 * src/app/resources re-exports), where no bridge is present and the hooks
 * fall back to the real router.
 *
 * There is one benefits flow: programs → questionnaire → review + signature
 * → ZIP → portal handoff → confirmation → renewals. The old mock screens
 * (GovernmentScreen, BenefitsQuestionnaireScreen, ProgramApplicationScreen
 * from resources-screens.tsx) are retired; these wrappers are what the
 * shell's route table renders.
 *
 * BENEFITS_SHELL_SCREENS is the source of truth the wrappers are built
 * from, so tests can assert each shell route renders the backend-connected
 * screen without needing a renderer.
 */
import type { ComponentType } from 'react';

import type { Navigation, ScreenName } from '@/features/app/navigation-types';
import { BenefitsShellBridge } from '@/features/benefits/benefits-shell-bridge';
import BenefitsProgramsScreen from '@/features/benefits/benefits-programs-screen';
import BenefitsQuestionnaireScreen from '@/features/benefits/benefits-questionnaire-screen';
import BenefitsReviewScreen from '@/features/benefits/benefits-review-screen';
import BenefitsRenewalsScreen from '@/features/benefits/benefits-renewals-screen';
import BenefitsZipScreen from '@/features/benefits/benefits-zip-screen';
import BenefitsPortalScreen from '@/features/benefits/benefits-portal-screen';
import BenefitsConfirmationScreen from '@/features/benefits/benefits-confirmation-screen';
import BenefitsChecklistScreen from '@/features/benefits/benefits-checklist-screen';

export type BenefitsShellRouteName = Extract<
  ScreenName,
  | 'government'
  | 'benefitsQuestionnaire'
  | 'benefitsReview'
  | 'benefitsRenewals'
  | 'benefitsZip'
  | 'benefitsPortal'
  | 'benefitsConfirmation'
  | 'benefitsChecklist'
>;

export const BENEFITS_SHELL_SCREENS: Record<BenefitsShellRouteName, ComponentType> = {
  government: BenefitsProgramsScreen,
  benefitsQuestionnaire: BenefitsQuestionnaireScreen,
  benefitsReview: BenefitsReviewScreen,
  benefitsRenewals: BenefitsRenewalsScreen,
  benefitsZip: BenefitsZipScreen,
  benefitsPortal: BenefitsPortalScreen,
  benefitsConfirmation: BenefitsConfirmationScreen,
  benefitsChecklist: BenefitsChecklistScreen,
};

type ShellRouteProps = {
  nav: Navigation;
  params?: Record<string, unknown>;
};

function makeShellRoute(name: BenefitsShellRouteName) {
  const Screen = BENEFITS_SHELL_SCREENS[name];
  function BenefitsShellRoute({ nav, params }: ShellRouteProps) {
    return (
      <BenefitsShellBridge nav={nav} params={params}>
        <Screen />
      </BenefitsShellBridge>
    );
  }
  BenefitsShellRoute.displayName = `${name}ShellRoute`;
  return BenefitsShellRoute;
}

export const GovernmentShellRoute = makeShellRoute('government');
export const BenefitsQuestionnaireShellRoute = makeShellRoute('benefitsQuestionnaire');
export const BenefitsReviewShellRoute = makeShellRoute('benefitsReview');
export const BenefitsRenewalsShellRoute = makeShellRoute('benefitsRenewals');
export const BenefitsZipShellRoute = makeShellRoute('benefitsZip');
export const BenefitsPortalShellRoute = makeShellRoute('benefitsPortal');
export const BenefitsConfirmationShellRoute = makeShellRoute('benefitsConfirmation');
export const BenefitsChecklistShellRoute = makeShellRoute('benefitsChecklist');
