# iOS social v5 design record

2026-09-10. Implementation reference for 0.3.0 (6), following the user's iPhone feedback on 0.2.1 (5).

- `app-icon.png` / mobile `assets/app-icon-v2.png`: original imagegen artwork, orange-and-ivory anime cat on cobalt. No third-party logo or copied character.
- `design-board.png`: original imagegen concept board. People, posts and numbers are fictional design examples, never production seed activity.
- `screens/`: six actual 402 × 874 web viewport captures of this implementation. This browser has no configured backend/native media storage, so error/signed-out/fallback states are shown honestly. These are layout references, not proof of iPhone permissions, MapKit search or Liquid Glass.

Feed/composer separation and post/reply hierarchy reference [Bluesky (MIT)](https://github.com/bluesky-social/social-app) and [Mastodon iOS](https://github.com/mastodon/mastodon-ios). No source or brand artwork copied. Existing Expo vector icons and native SF Symbols remain the icon toolkit; human presets use system-rendered emoji. Glass stays on native navigation and controls; content uses ordinary legible surfaces.

See [implementation plan](../../plans/2026-09-09-device-feedback-social-v5.md) and [device acceptance](../../ios-next-device-test.md). Prior v2/v3/v4 archives are retained.
