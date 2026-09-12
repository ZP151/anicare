import { getCommunityCommentContext, getCommunityPost, type CommunityPost, type CommunityReply } from './community';
import { getCommunityReply } from './community-reply-detail';
export type CommunityThreadContext = Readonly<{ post: CommunityPost; parent: CommunityReply; target: CommunityReply | null; targetUnavailable: boolean }>;
export async function getCommunityThreadContext(parentId: string, targetId?: string): Promise<CommunityThreadContext> {
  const context = await getCommunityCommentContext(parentId);
  if (context.parentReplyId !== null) throw new Error('community_reply_hidden');
  const [parent, post] = await Promise.all([getCommunityReply(parentId), getCommunityPost(context.postId)]);
  let target: CommunityReply | null = null, targetUnavailable = false;
  if (targetId && targetId !== parentId) {
    try {
      const selected = await getCommunityCommentContext(targetId);
      if (selected.parentReplyId !== parentId || selected.postId !== post.postId) throw new Error('community_reply_hidden');
      target = await getCommunityReply(targetId);
    } catch { targetUnavailable = true; }
  }
  return { parent, post, target, targetUnavailable };
}
