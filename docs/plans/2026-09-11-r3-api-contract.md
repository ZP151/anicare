# R3 API contract

All RPCs below use the shown `p_snake_case` PostgreSQL argument names and return
one JSON row per result-table row (the Supabase client therefore receives an
array, including for a single-result RPC), except the scalar UUID RPCs named
below. They return only opaque content and
conversation identifiers plus public display projections; no RPC returns an
Auth or profile UUID. Public community read projections allow anonymous callers;
direct-message operations and comment creation require authentication.

## Direct messages

`get_community_author(p_content_type text, p_content_id uuid)` resolves an author
only from a currently visible `community_post` or `community_reply`. It returns
one row with `author jsonb` (`name`, `avatarKey`), `canMessage boolean`, and
`conversationId uuid|null`.
It returns the visible author projection for the caller and synthetic authors,
with `canMessage=false`; it returns no row only for unavailable content. A live,
non-self, unblocked profile with no pair conversation produces `canMessage=true`
for an authenticated caller. `conversationId` is a current caller-visible pair
conversation when one exists (pending, accepted, or rejected), otherwise null;
the UI opens it before offering a first-contact request. `canMessage=false` for
an existing conversation, anonymous caller, caller, synthetic author, blocked,
or erased account.

`create_direct_message_request(p_content_type text, p_content_id uuid, p_body text,
p_request_id uuid)` uses that visible-content anchor to resolve the recipient. It
returns `conversationId uuid`, `messageId uuid`, `status text` (`pending`), and
`createdAt timestamptz`. A pair has one conversation and an unaccepted request
allows one opening message. Replaying `requestId` with identical input returns
the same values; changed input raises `idempotency_conflict`.

`respond_direct_message_request(p_conversation_id uuid, p_accept boolean,
p_request_id uuid)` can only be called by the requested recipient. It returns
`conversationId`, `status` (`accepted` or `rejected`), and `updatedAt`.

`list_my_direct_conversations(p_cursor uuid default null, p_limit integer default
20)` returns descending rows: `conversationId`, `status`, `isIncoming`,
`otherMember` (a `name`/`avatarKey` JSON projection), `lastMessagePreview`,
`lastMessageAt`, `unreadCount`, `createdAt`, and `cursor`. `lastMessagePreview`
and `lastMessageAt` are nullable only when the conversation has no retained
message. `get_direct_conversation(p_conversation_id uuid)` returns this same row
for a direct route, or no row when inaccessible. `list_direct_messages(p_conversation_id
uuid, p_cursor uuid default null, p_limit integer default 50)` returns the latest
50 messages in ascending order when `p_cursor` is null. With a cursor it returns
the preceding page in ascending order; callers pass the oldest returned `cursor`
to load earlier messages. Each row contains `messageId`, `body`, `sentAt`,
`isMine`, `requestId`, and `cursor`.
`requestId` is the caller's own sent request UUID rendered as text and is null
for the other member's messages.

`send_direct_message(p_conversation_id uuid, p_body text, p_request_id uuid)` returns
`conversationId`, `messageId`, and `sentAt`; its trimmed body must contain 1–2,000
characters. Only accepted, unblocked members can send.
`mark_direct_conversation_read(p_conversation_id uuid, p_message_id uuid)`
returns `conversationId`, `readAt`, and `messageId`; it accepts only a visible
message in that conversation and advances only the caller's monotonic read
cursor. `block_direct_conversation(p_conversation_id uuid, p_request_id uuid)`
resolves the other member server-side through `user_blocks`, returns the
scalar request UUID, and makes the conversation inaccessible.

Blocking, account-erasure pending status, membership loss, and unavailable
profiles deny reads, sends, and request responses. Deleting a profile purges
all conversations and messages involving it, rather than retaining unreadable
orphaned content. Every nullable value is described above; `author`,
`otherMember`, identifiers, status, booleans, counts, and timestamps that are
not called nullable are non-null. `status` is `pending`, `accepted`, or
`rejected`; `isIncoming` is true exactly when the other member created the
conversation.

## Comment continuations

The existing `create_community_reply(p_post_id, p_body, p_request_id)` remains the
top-level comment API and its six-field list shape remains unchanged.
`create_community_comment_reply(p_parent_reply_id uuid, p_body text, p_request_id uuid)`
creates a child reply and returns a scalar UUID. `list_community_comment_replies`
accepts `(p_parent_reply_id uuid, p_cursor uuid default null, p_limit integer default
30)` and returns the established reply fields: `replyId`, `body`, `createdAt`,
`author`, `canDelete`, `cursor`. Child replies become inaccessible if their
parent or post is deleted, hidden, or blocked.

`get_community_comment_context(p_reply_id uuid)` returns `replyId`, `postId`, and
`parentReplyId` (nullable for a top-level comment) only when that reply is
currently visible. It lets an activity deep link choose the child-comment
route without altering the existing activity row contract.

Notifications record a child-reply event for the direct parent author and a
post-comment event for the post author, except when either target is the actor
or both targets are the same person. Existing activity rows remain safe
projections and only expose events whose post, parent, child, and actor are
currently visible to the recipient.
