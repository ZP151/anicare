import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { StoredDraft } from '../offline/draft-policy';
import { sanitizeDraftForStorage as mockSanitizeDraft } from '../offline/draft-policy';
import type { ReportWizardDependencies } from './ReportWizard';

const mockAnimal = '00000000-0000-4000-8000-000000000801';
const mockSighting = '00000000-0000-4000-8000-000000000802';
const mockOwner = '00000000-0000-4000-8000-000000000803';
const mockDraftId = '00000000-0000-4000-8000-000000000804';
const mockRequest = '00000000-0000-4000-8000-000000000805';
let mockParams: Record<string, string> = {};
let mockDraft: StoredDraft | null = null;
let mockWizard: ReportWizardDependencies;
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRpc = jest.fn();
const mockCreateSighting = jest.fn();
const mockIds = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => mockParams, useFocusEffect: () => {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockIds() }));
jest.mock('../api/supabase', () => ({ getSupabaseClient: () => ({ rpc: mockRpc, auth: { getSession: async () => ({ data: { session: { user: { id: mockOwner }, access_token: 'test-token' } } }) } }) }));
jest.mock('../auth/session-subject', () => ({ readSessionSubjectStrict: async () => mockOwner, subscribeSessionSubject: () => () => {} }));
jest.mock('../api/cat-presentation', () => ({getCatPresentations: async () => new Map()}));
jest.mock('../api/cats', () => ({ getPublicCatSummary: async () => ({ animalId: mockAnimal, primaryAlias: 'Pepper', verification: 'reported', timeBucket: 'today' }) }));
jest.mock('../api/feed', () => ({ listPublicSightings: async () => ({ items: [{ animalId: mockAnimal, sightingId: mockSighting, primaryAlias: 'Pepper', verification: 'reported', timeBucket: 'today', publicCellId: '89652636d87ffff', coverMediaId: null, cursor: mockSighting }], nextCursor: null }) }));
jest.mock('../api/sightings', () => ({ recoverSightingSubmission: async () => ({ kind: 'not_found' }), submitSighting: (...args: unknown[]) => mockCreateSighting(...args) }));
jest.mock('../media/media-upload-runtime', () => ({ uploadDraftMediaNow: jest.fn() }));
jest.mock('../offline/draft-store', () => ({
  saveOfflineDraft: async (input: Record<string, unknown>) => { mockDraft = mockSanitizeDraft({ ...mockDraft, ...input }); return mockDraft; },
  getOfflineDraft: async () => mockDraft,
  listOfflineDrafts: async () => mockDraft ? [mockDraft] : [],
  claimOfflineDraftOwner: async () => true,
  attachSightingToDraft: async (_id: string, sightingId: string, ownerSubject: string) => {
    mockDraft = { ...mockDraft!, sightingId, ownerSubject, report: undefined }; return true;
  },
  deleteOfflineDraft: jest.fn(), removeReviewedMediaFromDraft: jest.fn(),
}));
jest.mock('../i18n/LocaleContext', () => ({ useLocale: () => ({ locale: 'en' }) }));
jest.mock('../components/CatDetailScreen', () => {
  const React = require('react'); const { Pressable, Text } = require('react-native');
  return { CatDetailScreen: ({ cat, onReportSighting }: { cat: { animalId: string }; onReportSighting: (id: string) => void }) => React.createElement(Pressable, { accessibilityRole: 'button', onPress: () => onReportSighting(cat.animalId) }, React.createElement(Text, null, 'Report this cat')) };
});
jest.mock('./ReportWizard', () => ({ ReportWizard: ({ dependencies }: { dependencies: ReportWizardDependencies }) => { mockWizard = dependencies; return null; } }));

import CatRoute from '../../app/cat/[id]';
import NewReportRoute from '../../app/report/new';
import ReceiptRoute from '../../app/report/receipt';

it('carries a real cat route selection through restored draft and NewReport submission without duplicating text', async () => {
  mockParams = { id: mockAnimal }; mockDraft = null;
  mockIds.mockReturnValueOnce(mockDraftId).mockReturnValueOnce(mockRequest);
  mockCreateSighting.mockResolvedValue({ sightingId: mockSighting, visibility: 'hidden', visibleAt: null, requestId: mockRequest });
  mockRpc.mockRejectedValueOnce(new Error('response lost')).mockResolvedValue({ data: [{ proposalId: mockRequest, source: 'manual_search', status: 'tentative' }], error: null });
  const cat = await render(<CatRoute />);
  await fireEvent.press(await cat.findByRole('button', { name: 'Report this cat' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/report/new', params: { draftId: mockDraftId } }));
  mockDraft = JSON.parse(JSON.stringify(mockDraft)); // simulated process restore of the sanitized storage boundary
  expect(mockDraft?.report).toMatchObject({ identityIntent: { kind: 'existing', animalId: mockAnimal }, identityRequestId: mockRequest });
  await cat.unmount();
  mockParams = { draftId: mockDraftId };
  const report = await render(<NewReportRoute />);
  const input = { draftId: mockDraftId, notes: '', risk: 'normal' as const, traits: {}, location: { kind: 'manual_area' as const, publicCellId: '89652636d87ffff' }, occurredAt: new Date() };
  await act(async () => {
    expect(await mockWizard.submit(input)).toMatchObject({ sightingId: mockSighting, state: 'submitted_text_only' });
    expect(await mockWizard.submit(input)).toMatchObject({ sightingId: mockSighting, state: 'submitted_text_only' });
  });
  expect(mockCreateSighting).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledTimes(2);
  for (const args of mockRpc.mock.calls) expect(args).toEqual(['submit_identity_proposal', {
    p_sighting_id: mockSighting, p_proposed_animal_id: mockAnimal, p_source: 'manual_search', p_request_id: mockRequest,
  }]);
  await report.unmount();
});

it('resumes a remote-only owner receipt after response loss using its newly persisted anchor', async () => {
  jest.clearAllMocks(); mockDraft = null; mockParams = { sightingId: mockSighting };
  mockIds.mockReset().mockReturnValueOnce(mockDraftId).mockReturnValueOnce(mockRequest);
  let proposals = 0;
  mockRpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'get_my_sighting_summary') return { data: [{ sightingId: mockSighting,
      occurredAt: '2026-09-08T00:00:00Z', createdAt: '2026-09-08T00:00:00Z', reportState: 'delayed', mediaState: 'none', identityState: 'not_requested' }], error: null };
    if (name === 'get_my_identity_result') return { data: [], error: null };
    if (++proposals === 1) throw new Error('response lost');
    return { data: [{ proposalId: mockRequest, source: 'new_animal', status: 'tentative' }], error: null };
  });
  const first = await render(<ReceiptRoute />);
  await fireEvent.press(await first.findByRole('button', { name: 'Submit as a new cat' }));
  await waitFor(() => expect(proposals).toBe(1));
  expect(mockDraft).toMatchObject({ ownerSubject: mockOwner, sightingId: mockSighting, identityContinuation: { intent: { kind: 'new' }, requestId: mockRequest } });
  await first.unmount();
  const reopened = await render(<ReceiptRoute />);
  await fireEvent.press(await reopened.findByRole('button', { name: 'Retry identity proposal' }));
  await waitFor(() => expect(proposals).toBe(2));
  const calls = mockRpc.mock.calls.filter(([name]) => name === 'submit_identity_proposal');
  expect(calls[0]).toEqual(calls[1]);
  expect(mockIds).toHaveBeenCalledTimes(2);
  await reopened.unmount();
});


it('replaces the editor on receipt navigation, but keeps photo review returnable', async () => {
  jest.clearAllMocks(); mockParams={draftId:mockDraftId};
  const view=await render(<NewReportRoute/>);
  mockWizard.navigate(`/report/redaction-review?draftId=${mockDraftId}`);
  expect(mockPush).toHaveBeenCalledWith(`/report/redaction-review?draftId=${mockDraftId}`);
  mockWizard.navigate(`/report/receipt?sightingId=${mockSighting}`);
  expect(mockReplace).toHaveBeenCalledWith(`/report/receipt?sightingId=${mockSighting}`);
  expect(mockPush).toHaveBeenCalledTimes(1);
  await view.unmount();
});
