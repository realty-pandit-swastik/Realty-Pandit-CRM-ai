import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import InventoryDetail from '../../../app/inventory/[id]';
import { ApiClient } from '../../api/client';
import { useApi, useSession } from '../auth/SessionProvider';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'synthetic-property' }) }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg' }] })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///cache/document.pdf', mimeType: 'application/pdf' }] })) }));
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: class extends Blob {
    uri: string; exists = true;
    constructor(uri: string) { super([new Uint8Array(64)]); this.uri = uri; }
    delete() { mockDelete(); }
  },
  Directory: class { exists = false; },
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let cache: QueryClient;
afterEach(() => { cache?.clear(); jest.restoreAllMocks(); });

async function setup(outcome: 'timeout' | '5xx' | 'unreadable success' | '4xx' | 'success', document = true) {
  let posts = 0, failRefresh = false, offline = false;
  const property = { id: 'synthetic-property', title: 'Synthetic property', can_edit: true, can_access_documents: true, actions: { edit: true },
    media_urls: Array.from({ length: 8 }, (_, index) => `/uploads/properties/synthetic-property/${index}.jpg`),
    documents: [] as { id: string; title: string; mime_type: string }[] };
  const fetcher = jest.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      posts++;
      if (outcome === '4xx' && posts === 1) return json({ error: 'Upload rejected.' }, 400);
      if (document) property.documents.push({ id: `synthetic-document-${posts}`, title: 'Property document', mime_type: 'application/pdf' });
      else property.media_urls.push('/uploads/properties/synthetic-property/selected.jpg');
      if (posts === 1) {
        if (outcome === '5xx') return json({ error: 'Synthetic failure after commit.' }, 503);
        if (outcome === 'unreadable success') return new Response('unreadable JSON', { status: 201 });
        if (outcome === 'timeout') return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('Synthetic timeout.'))));
        if (outcome === 'success') failRefresh = true;
      }
      return json({ id: `synthetic-document-${posts}` }, 201);
    }
    if (failRefresh) return json({ error: 'Synthetic refresh failure.' }, 503);
    return json(property);
  });
  const api = new ApiClient('https://example.invalid', fetcher, 10);
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockImplementation(() => ({ session: null, controller: null, configurationError: null, offline, scope: 'synthetic' }));
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const tree = () => <QueryClientProvider client={cache}><InventoryDetail /></QueryClientProvider>;
  const view = await render(tree());
  await screen.findByText('Synthetic property');
  await fireEvent.press(screen.getByRole('button', { name: document ? 'Attach document' : 'Choose property photo' }));
  await waitFor(() => expect(posts).toBe(1));
  return { posts: () => posts, fetcher, failRefresh: (value: boolean) => { failRefresh = value; },
    offline: async (value: boolean) => { offline = value; await view.rerender(tree()); } };
}

it.each(['timeout', '5xx', 'unreadable success'] as const)('blocks another document POST after %s until successful check, review and explicit retry', async outcome => {
  const test = await setup(outcome);
  const alert = jest.spyOn(Alert, 'alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled());
  expect(mockDelete).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry selected attachment' }));
  expect(test.posts()).toBe(1);
  const originalError = outcome === '5xx' ? 'The server could not finish this request. Try again shortly.' : outcome === 'timeout' ?
    'Save outcome unknown. Refresh the record before trying again.' : 'Connection interrupted. Check the current record before trying again.';
  expect(screen.getByText(originalError)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Refresh property' }));
  await screen.findByText('Property document');
  expect(screen.queryByRole('button', { name: 'Enable retry after review' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled();

  test.failRefresh(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Check current attachments' }));
  await screen.findByText('Current attachments could not be checked. The server could not finish this request. Try again shortly.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check current attachments' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Enable retry after review' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled();
  expect(screen.getByText(originalError)).toBeTruthy();
  expect(mockDelete).not.toHaveBeenCalled();

  await test.offline(true);
  const reads = test.fetcher.mock.calls.length;
  await fireEvent.press(screen.getByRole('button', { name: 'Check current attachments' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Retry selected attachment' }));
  expect(test.fetcher).toHaveBeenCalledTimes(reads);
  expect(test.posts()).toBe(1);
  await test.offline(false);
  test.failRefresh(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Check current attachments' }));
  await screen.findByText('Property document');
  expect(screen.getByText(originalError)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Enable retry after review' }));
  expect(test.posts()).toBe(1);
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled();
  await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === 'Allow retry')?.onPress?.(); });
  expect(test.posts()).toBe(1);
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry selected attachment' }));
  await waitFor(() => expect(test.posts()).toBe(2));
  await screen.findByText('Document uploaded.');
});

it('keeps an ambiguous photo selected and exposes an appended ninth photo for review without uploading again', async () => {
  const test = await setup('5xx', false);
  await screen.findByRole('button', { name: 'Check current attachments' });
  await fireEvent.press(screen.getByRole('button', { name: 'Check current attachments' }));
  await screen.findByText('1 of 9 · Photo');
  for (let index = 0; index < 8; index++) await fireEvent.press(screen.getByRole('button', { name: 'Next media' }));
  expect(screen.getByLabelText('Property photo 9').props.source.uri).toMatch(/selected\.jpg$/);
  expect(screen.getByRole('button', { name: 'Retry selected attachment' })).toBeDisabled();
  expect(test.posts()).toBe(1);
  expect(mockDelete).not.toHaveBeenCalled();
});

it('permits ordinary manual retry after a definite rejection', async () => {
  const test = await setup('4xx');
  await screen.findByText('Upload rejected.');
  expect(screen.queryByRole('button', { name: 'Check current attachments' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry selected attachment' }));
  await screen.findByText('Document uploaded.');
  expect(test.posts()).toBe(2);
});

it('does not retain a retryable selection when a confirmed upload is followed by a failed refresh', async () => {
  const test = await setup('success');
  await screen.findByText('Document uploaded.');
  await screen.findByText('Property refresh failed. The server could not finish this request. Try again shortly.');
  expect(screen.queryByRole('button', { name: 'Retry selected attachment' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Choose property photo' })).toBeEnabled();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(test.posts()).toBe(1);
  expect(test.fetcher.mock.calls.length).toBeGreaterThan(3);
});
