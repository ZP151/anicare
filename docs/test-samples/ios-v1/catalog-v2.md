# Synthetic catalogue V2

Created 2026-09-13 with `image_gen`. All scenes, cats and depicted surroundings are fictional test illustrations; no actual sighting, resident or training consent is implied. Every generated original is retained outside the repository; `asset-provenance.json` records its filename/hash and the derived JPEG hashes.

| Cat | Fixture | Posts | Independent authors | Source photos |
|---|---|---|---|---|
| Honey 蜜糖 | S33 | C57, C58 | Demo Mei, Demo Kai | v2-honey-1 through 7 |
| Pebble 卵石 | S34 | C59, C60 | Demo Lin, Demo Mei | v2-pebble-1 through 3 |
| Patch 拼拼 | S35 | C61, C62 | Demo Noor, Demo Kai | v2-patch-1 through 3 |
| Orbit 星环 | S36 | C63, C64 | Demo Mei, Demo Lin | v2-orbit-1 through 3 |

Each later photo was generated with its first image as a reference, preserving the coat, face, paws and tail. Scene instructions varied viewpoint, light, surroundings and behaviour: seated portrait; walking away; sleeping on tiles; wet fern-lined path; curled on a bench; front portrait; dusk walk; rainy tiles; loaf under bench; foliage at dawn; bench calico; grass partly hidden by leaves; looking back at a curb; tuxedo stretch; night motion blur; loaf on a wall. Prompts excluded people, text, collages, identifiable addresses and real sighting claims.

Delivery variants use only proportional resizing (display max2048, thumb max480) and JPEG encoding in sRGB with metadata stripped. No cropping or retouching was applied during encoding. There are16 distinct source images and32 delivery files; only identity thumbnails intentionally reuse the corresponding cat's first photo.

V1 files and ledger IDs are retained as historical provenance. The hosted retirement receipt, not deletion of this folder, determines which old fixtures remain public because of real references.

Before upload, the fixture provisioner adds the minimal 18-byte JFIF APP0 header when the source encoder omitted it. Compressed image pixels stay unchanged. Both variants must then pass the unmodified production JPEG decoder before any database/storage mutation. Repository provenance hashes identify the approved source files; media-ledger and public-read hashes identify these final delivery bytes. Cat portraits retain their original approved JPEG bytes.
