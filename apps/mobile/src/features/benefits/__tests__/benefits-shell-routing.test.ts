/**
 * The reconciliation, pinned down: one benefits flow, not two.
 *
 * This environment has no renderer (jest runs in node and react-native is
 * not importable), so the routing reconciliation is asserted two ways:
 *
 * 1. The pure href → shell-route mapping (benefits-route-mapping.ts), which
 *    is the logic the shell bridge runs, is tested directly: every step of
 *    the flow lands on the right shell route key with the right params, and
 *    paths outside the flow map to null.
 * 2. Source-level guards assert the shell's route table renders the new
 *    backend-connected wrappers — never the retired mock screens — and that
 *    the mocks are gone from resources-screens.tsx.
 */
import {
  EXPO_PATH_TO_SHELL,
  benefitsHrefToShellRoute,
} from '@/features/benefits/benefits-route-mapping';

// This tsconfig only includes the "jest" and "react" types and @types/node
// is not installed for the app package, so the node builtins this
// source-level guard needs come through a hand-declared require.
declare const __dirname: string;
declare function require(id: string): any;

const { readFileSync }: { readFileSync: (path: string, encoding: 'utf8') => string } =
  require('fs');
const { join }: { join: (...parts: string[]) => string } = require('path');

const APP_ROOT = readFileSync(join(__dirname, '../../app/app-root.tsx'), 'utf8');
const RESOURCES_SCREENS = readFileSync(
  join(__dirname, '../../resources/resources-screens.tsx'),
  'utf8',
);

const RETIRED_MOCKS = ['GovernmentScreen', 'BenefitsQuestionnaireScreen', 'ProgramApplicationScreen'];

describe('retired mock screens', () => {
  it.each(RETIRED_MOCKS)('resources-screens.tsx no longer defines %s', (name) => {
    expect(RESOURCES_SCREENS).not.toMatch(new RegExp(`export function ${name}\\b`));
  });

  it.each(RETIRED_MOCKS)('the shell route table no longer references %s', (name) => {
    // Import lines and comments aside, the switch must not render a mock.
    const code = APP_ROOT.split('\n')
      .filter((line: string) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain(name);
  });
});

describe('shell route table', () => {
  const SHELL_WRAPPERS = [
    'GovernmentShellRoute',
    'BenefitsQuestionnaireShellRoute',
    'BenefitsReviewShellRoute',
    'BenefitsRenewalsShellRoute',
    'BenefitsZipShellRoute',
    'BenefitsPortalShellRoute',
    'BenefitsConfirmationShellRoute',
    'BenefitsChecklistShellRoute',
  ];

  it.each(SHELL_WRAPPERS)('renders the backend-connected %s', (wrapper) => {
    expect(APP_ROOT).toContain(`<${wrapper} nav={nav} params={route.params} />`);
  });

  it('has a case for every benefits route key', () => {
    for (const key of [
      'government',
      'benefitsQuestionnaire',
      'benefitsReview',
      'benefitsRenewals',
      'benefitsZip',
      'benefitsPortal',
      'benefitsConfirmation',
      'benefitsChecklist',
    ]) {
      expect(APP_ROOT).toContain(`case '${key}':`);
    }
  });
});

describe('expo href to shell route', () => {
  it('maps the whole submission flow to shell routes', () => {
    expect(benefitsHrefToShellRoute('/resources/government')).toEqual({
      name: 'government',
      params: {},
    });
    expect(
      benefitsHrefToShellRoute('/resources/benefits-questionnaire?applicationId=app-1'),
    ).toEqual({ name: 'benefitsQuestionnaire', params: { applicationId: 'app-1' } });
    expect(benefitsHrefToShellRoute('/resources/applications/app-1')).toEqual({
      name: 'benefitsReview',
      params: { applicationId: 'app-1' },
    });
    expect(benefitsHrefToShellRoute('/resources/benefits-zip?applicationId=app-1')).toEqual({
      name: 'benefitsZip',
      params: { applicationId: 'app-1' },
    });
    expect(
      benefitsHrefToShellRoute('/resources/benefits-portal?applicationId=app-1&state=CA'),
    ).toEqual({
      name: 'benefitsPortal',
      params: { applicationId: 'app-1', state: 'CA' },
    });
    expect(
      benefitsHrefToShellRoute('/resources/benefits-confirmation?applicationId=app-1'),
    ).toEqual({ name: 'benefitsConfirmation', params: { applicationId: 'app-1' } });
    expect(
      benefitsHrefToShellRoute('/resources/benefits-checklist?program=SNAP&state=CA'),
    ).toEqual({
      name: 'benefitsChecklist',
      params: { program: 'SNAP', state: 'CA' },
    });
    expect(benefitsHrefToShellRoute('/resources/benefits-renewals')).toEqual({
      name: 'benefitsRenewals',
      params: {},
    });
  });

  it('covers exactly the eight benefits route keys', () => {
    const names = new Set<string>([
      ...Object.values(EXPO_PATH_TO_SHELL),
      benefitsHrefToShellRoute('/resources/applications/x')!.name,
    ]);
    expect([...names].sort()).toEqual(
      [
        'benefitsChecklist',
        'benefitsConfirmation',
        'benefitsPortal',
        'benefitsQuestionnaire',
        'benefitsRenewals',
        'benefitsReview',
        'benefitsZip',
        'government',
      ].sort(),
    );
  });

  it('returns null for paths outside the benefits flow', () => {
    expect(benefitsHrefToShellRoute('/pantry')).toBeNull();
    expect(benefitsHrefToShellRoute('https://example.com/evil')).toBeNull();
  });

  it('decodes encoded params', () => {
    expect(
      benefitsHrefToShellRoute('/resources/benefits-checklist?program=VA%20Health%20Care&state=CA'),
    ).toEqual({
      name: 'benefitsChecklist',
      params: { program: 'VA Health Care', state: 'CA' },
    });
  });
});
