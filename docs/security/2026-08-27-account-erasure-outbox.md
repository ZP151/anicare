# Account-erasure legacy media outbox

Deleting an Auth user cascades to `public.user_profiles`. Before ownership is
cleared, the profile trigger copies every owned legacy `public-media` or
`private-evidence` asset without a staging upload job into a private deletion
outbox. Each row contains an immutable media UUID, bucket and relative object
path, so cleanup remains discoverable after profile deletion.

`cleanup-legacy-media` is service-authenticated only. It claims due outbox rows
through service-only RPCs and accepts only `public-media` or `private-evidence`
with a bounded, relative, traversal-free path. A Storage 404 is an idempotent
success; transient errors are retried with a durable terminal failure after the
bounded retry limit. This is deliberately separate from `cleanup-media-staging`,
whose `jobs/<uuid>.jpg` invariant cannot safely cover legacy buckets.

The outbox and Edge unit tests cover the database contract and scheduler
decision logic. A real Supabase Storage integration run remains required before
release.
