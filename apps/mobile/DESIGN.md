# Native account and navigation design

User direction confirmed 2026-09-08: refined iOS conventions, SF Symbols,
grouped settings and restrained native Liquid Glass. Scope of this first
revision: Profile, iOS primary navigation and shared screen spacing.

Profile uses a 34pt system title, account summary, then inset grouped lists.
Settings rows use 17pt labels, 22pt symbols, a 56pt minimum height and an inset
hairline separator. Groups have 16pt corners; sections have 24pt spacing.
Names remain actual user data; no invented activity totals or profile photos.

Light appearance uses #F2F2F7 background and white groups; dark appearance uses
black background and #1C1C1E groups. Text and interaction colors adapt using
native-colors.ts. This scoped palette does not claim all legacy pages already
support dark appearance.

iOS NativeTabs owns the platform material, sizing and SF Symbols. Do not put
opaque custom backgrounds over the system glass. Other platforms retain the
existing vector navigation. Reduced transparency follows native behavior.

Login is requested from the account summary, never permanently shown under an
authenticated profile. Record links, preferences/privacy and account actions
remain distinct groups. User name editing exposes only the existing public
name capability. Async account changes clear private local UI state.

Visual verification of 0.1.1 is pending actual native capture/device feedback.
The installed 0.1.0 interface was explicitly rejected; it is not a visual
reference or an approved baseline for future surfaces.

## 2026-09-10 · Social v5

Current implementation reference: [v5 archive](../../docs/design/ios26-social-v5/index.html). Use warm neutral surfaces, cobalt actions, native glass controls, human avatars and the original orange-and-ivory anime cat icon. Feed browsing and composition are separate; draft details live in a collection. Preserve prior reference archives. Device feedback, not concept imagery, establishes final visual acceptance.
