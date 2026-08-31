# Account-erasure legacy media outbox

Deleting an Auth user cascades to `public.user_profiles`. Before ownership is
cleared, the profile trigger copies every owned legacy `public-media` or
`private-evidence` asset without a staging upload job into a private deletion
outbox. Each row contains an immutable media UUID, bucket, relative object path
and expected owner UUID, so cleanup remains discoverable after profile deletion.

`cleanup-legacy-media` is service-authenticated only. It claims due outbox rows
through service-only RPCs and accepts only `public-media` or `private-evidence`
with a bounded, traversal-free path whose first segment exactly matches the
immutable expected owner UUID. Filename segments may contain spaces or Unicode.
A Storage 404 is an idempotent success; transient errors are retried with a
durable terminal failure after the bounded retry limit. Legacy metadata that
does not meet this owner-boundary check is retained as an explicit
`unsafe_legacy_storage_target` terminal/manual-review row: profile deletion
succeeds and the scheduler never sends that key to Storage. This is deliberately
separate from `cleanup-media-staging`, whose `jobs/<uuid>.jpg` invariant cannot
safely cover legacy buckets.

The outbox and Edge unit tests cover the database contract and scheduler
decision logic. A real Supabase Storage integration run remains required before
release.
