/**
 * The submission Phase 1 repository helpers, with the GraphQL client mocked.
 *
 * What matters here is the contract with the server: the right document,
 * the right variables — especially the new signature args on approval and
 * the confirmation number capture. Nothing here may invent a portal URL or
 * claim a submission.
 */
import { graphqlClient } from '@/graphql/client';
import {
  ApproveBenefitsApplicationDocument,
  BenefitsChecklistDocument,
  BenefitsPortalDocument,
  BenefitsStateFromZipDocument,
  RecordBenefitsConfirmationDocument,
} from '@/graphql/benefits-operations';
import {
  approveBenefitsApplication,
  benefitsFilingKitUrl,
  fetchBenefitsChecklist,
  fetchBenefitsPortal,
  fetchStateFromZip,
  recordBenefitsConfirmation,
} from '@/features/benefits/benefits-repository';

jest.mock('@/graphql/client', () => ({
  graphqlClient: { request: jest.fn() },
}));

// The repository now gates on useMockServices from @/constants/env, whose
// chain (dev-preview) reads the __DEV__ global that jest does not define.
// Pin the flag false here: this suite tests the production GraphQL contract.
jest.mock('@/constants/env', () => ({
  useMockServices: false,
}));

// babel-preset-expo rewrites process.env.EXPO_PUBLIC_* to read from the
// virtual env module, which is ESM and cannot load under jest's CJS runtime.
// Mocking it also pins the API base the URL helpers build from.
jest.mock('expo/virtual/env', () => ({
  env: { EXPO_PUBLIC_API_URL: 'https://api.example.com/graphql' },
}));

const request = graphqlClient.request as jest.Mock;

beforeEach(() => {
  request.mockReset();
});

describe('approveBenefitsApplication', () => {
  it('sends the typed signature and attestation with the approval', async () => {
    const approved = { id: 'app-1', status: 'COMPLETED', signedName: 'Jane Doe' };
    request.mockResolvedValue({ approveBenefitsApplication: approved });

    const result = await approveBenefitsApplication('app-1', 'Jane Doe', true);

    expect(request).toHaveBeenCalledWith(ApproveBenefitsApplicationDocument, {
      applicationId: 'app-1',
      signedName: 'Jane Doe',
      attestationAccepted: true,
    });
    expect(result).toBe(approved);
  });
});

describe('recordBenefitsConfirmation', () => {
  it('records the confirmation number against the application', async () => {
    const updated = { id: 'app-1', confirmationNumber: 'CA-2026-048213' };
    request.mockResolvedValue({ recordBenefitsConfirmation: updated });

    const result = await recordBenefitsConfirmation('app-1', 'CA-2026-048213');

    expect(request).toHaveBeenCalledWith(RecordBenefitsConfirmationDocument, {
      applicationId: 'app-1',
      confirmationNumber: 'CA-2026-048213',
    });
    expect(result).toBe(updated);
  });
});

describe('submission Phase 1 lookups', () => {
  it('detects the state from a ZIP code', async () => {
    const lookup = { zip: '90210', state: 'CA', detail: 'Matched' };
    request.mockResolvedValue({ benefitsStateFromZip: lookup });

    const result = await fetchStateFromZip('90210');

    expect(request).toHaveBeenCalledWith(BenefitsStateFromZipDocument, { zip: '90210' });
    expect(result).toBe(lookup);
  });

  it('fetches the official portal for a program and state', async () => {
    const portal = { program: 'SNAP', state: 'CA', url: null, verified: false, fallbackGuidance: 'g' };
    request.mockResolvedValue({ benefitsPortal: portal });

    const result = await fetchBenefitsPortal('SNAP', 'CA');

    expect(request).toHaveBeenCalledWith(BenefitsPortalDocument, {
      program: 'SNAP',
      state: 'CA',
    });
    expect(result).toBe(portal);
  });

  it('fetches the guided checklist for a program and state', async () => {
    const checklist = [{ phase: 'before', title: 'Before', items: [] }];
    request.mockResolvedValue({ benefitsChecklist: checklist });

    const result = await fetchBenefitsChecklist('SNAP', 'CA');

    expect(request).toHaveBeenCalledWith(BenefitsChecklistDocument, {
      program: 'SNAP',
      state: 'CA',
    });
    expect(result).toBe(checklist);
  });
});

describe('benefitsFilingKitUrl', () => {
  it('builds the filing-kit URL from the API base', () => {
    expect(benefitsFilingKitUrl('app-1')).toBe(
      'https://api.example.com/benefits/applications/app-1/filing-kit',
    );
  });
});
