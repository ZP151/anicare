import type { CommunityReply, CommunityRpcClient } from './community';
import {
  createCommunityCommentReply as create,
  getCommunityCommentContext as context,
  listCommunityCommentReplies as list,
} from './community';

/** The one-level continuation contract is kept separate from post comments. */
export const createCommunityCommentReply = create;
export const listCommunityCommentReplies: (parentReplyId: string, cursor?: string | null, client?: CommunityRpcClient) => Promise<Readonly<{ items: readonly CommunityReply[]; nextCursor: string | null }>> = list;
export const getCommunityCommentContext = context;
