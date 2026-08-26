import {
  blockUser,
  buildModerationReportRpcArgs,
  reportContent,
  unblockUser,
} from './safety';

const contentId = '00000000-0000-4000-8000-000000000201';
const blockedId = '00000000-0000-4000-8000-000000000202';
const requestId = '00000000-0000-4000-8000-000000000203';
const reportId = '00000000-0000-4000-8000-000000000204';
const unblockRequestId = '00000000-0000-4000-8000-000000000205';

describe('community safety API payloads', () => {
  it('serializes only caller-selectable report fields', () => {
    expect(buildModerationReportRpcArgs({
      contentType: 'sighting',
      contentId,
      reasonCode: 'unsafe_location',
      detail: 'The description appears to identify a private doorway.',
      requestId,
    })).toEqual({
      p_content_type: 'sighting',
      p_content_id: contentId,
      p_reason_code: 'unsafe_location',
      p_detail: 'The description appears to identify a private doorway.',
      p_request_id: requestId,
    });
  });

  it.each([
    'reporterId',
    'contentAuthorId',
    'targetUserId',
    'risk',
    'status',
    'dueAt',
    'reviewerId',
  ])('rejects forged operational report field %s', (field) => {
    expect(() => buildModerationReportRpcArgs({
      contentType: 'sighting',
      contentId,
      reasonCode: 'spam',
      detail: null,
      requestId,
      [field]: blockedId,
    } as never)).toThrow('invalid_moderation_report_request');
  });

  it('rejects unsupported content, reason, detail, and request identifiers', () => {
    const valid = { contentType: 'user', contentId, reasonCode: 'harassment', detail: null, requestId } as const;
    expect(() => buildModerationReportRpcArgs({ ...valid, contentType: 'animal' } as never))
      .toThrow('invalid_moderation_report_request');
    expect(() => buildModerationReportRpcArgs({ ...valid, reasonCode: 'make_admin' } as never))
      .toThrow('invalid_moderation_report_request');
    expect(() => buildModerationReportRpcArgs({ ...valid, detail: 'x'.repeat(1001) }))
      .toThrow('invalid_moderation_report_request');
    expect(() => buildModerationReportRpcArgs({ ...valid, requestId: 'retry-1' }))
      .toThrow('invalid_moderation_report_request');
  });

  it('uses only the narrow report RPC and accepts only a UUID result', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: reportId, error: null });
    const input = { contentType: 'sighting', contentId, reasonCode: 'spam', detail: null, requestId } as const;

    await expect(reportContent(input, { rpc })).resolves.toBe(reportId);
    expect(rpc).toHaveBeenCalledWith('create_moderation_report', buildModerationReportRpcArgs(input));
  });

  it('derives block actors server-side and sends only target plus stable request ID', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });

    await expect(blockUser(blockedId, requestId, { rpc })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenNthCalledWith(1, 'block_user', {
      p_blocked_id: blockedId,
      p_request_id: requestId,
    });

    await expect(unblockUser(blockedId, unblockRequestId, { rpc })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenNthCalledWith(2, 'unblock_user', {
      p_blocked_id: blockedId,
      p_request_id: unblockRequestId,
    });
  });

  it('rejects malformed block identifiers and unexpected RPC response shapes', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { blockerId: contentId }, error: null });

    await expect(blockUser('not-a-uuid', requestId, { rpc })).rejects.toThrow('invalid_block_request');
    await expect(blockUser(blockedId, 'not-a-uuid', { rpc })).rejects.toThrow('invalid_block_request');
    await expect(blockUser(blockedId, requestId, { rpc })).rejects.toThrow('invalid_block_response');
  });
});
