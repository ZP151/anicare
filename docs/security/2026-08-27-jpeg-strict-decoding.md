# Strict baseline JPEG entropy validation

Date: 2026-08-27

## Finding

`inspectJpeg` validated JPEG markers, DQT/DHT definitions, baseline SOF/SOS headers, restart-marker order, and an exact EOI boundary, but it did not decode the entropy stream. Replacing the canonical fixture's entire scan with one `0x00` byte therefore passed policy even though a decoder could not consume the SOF-declared image workload.

## Resolution

The policy now consumes every baseline MCU and block declared by the SOF sampling factors and dimensions. It decodes the selected canonical Huffman tables, DC categories, AC run/size symbols and coefficient payload bits without allocating pixels. It also enforces:

- the baseline limit of at most 10 data units per MCU;
- no oversubscribed or Kraft-saturated/all-ones Huffman code space;
- exact restart cadence with alternating `RST0` through `RST7` markers;
- legal `0xff 0x00` entropy byte stuffing;
- all-ones byte-alignment padding;
- an immediate terminal EOI and no trailing bytes.

Any entropy-consumption failure is caught and exposed only as `invalid_jpeg`. Existing metadata rejection remains unchanged. The decoded workload is calculated from the parsed SOF, so an altered dimension that requires additional MCUs is rejected unless the entropy stream contains exactly that complete workload; accepted dimensions returned by the policy are the same bounded SOF dimensions used for decoding.

## Resource bounds

The existing 2048-by-2048 SOF cap remains in `jpeg-policy.ts`. Finalization already rejects media larger than 20 MiB before calling `inspectJpeg`. The new validator allocates only four small Huffman-table maps plus scalar reader state; it does not allocate a coefficient or pixel image buffer. CPU work is bounded by the declared MCU/block workload and the already-bounded input bitstream.

## Dependency and licence decision

No decoder dependency was added, and `package.json`, `pnpm-lock.yaml`, and `deno.json` remain unchanged. This avoids relying on a decoder with tolerant truncation behavior, adding an unmaintained package, or expanding the Edge/Deno supply chain. The coefficient-only implementation is original project code under the repository's Apache-2.0 licence; no third-party decoder source was copied.

The implementation uses only ES2022/TypeScript language and `Uint8Array` APIs, with no Node-specific API or import. The local verification host did not have a Deno executable, so no standalone `deno check` result is claimed; compatibility is covered by the unchanged Supabase import map and the Edge TypeScript build.

## Regression and verification evidence

- RED: the focused Vitest run reported the premature one-byte entropy fixture and the SOF/scan workload mismatch as failures because `inspectJpeg` did not throw.
- RED: a semantic scan using Kraft-saturated two-symbol tables was accepted until the reserved all-ones-code check was added.
- GREEN: the focused policy suite passes canonical 1x1 and 17x9 JFIF fixtures plus premature entropy, dimension workload mismatch, DQT/DHT/Kraft, metadata, restart, EOI, and trailing-byte cases.
- Supplemental encoder corpus: exact dimensions were returned for 1x1, 17x9, 32x32, 2048x1, and 1x2048 JPEGs produced by the Windows JPEG encoder; 2049x1 was rejected.
- Final frozen-install, Edge suite/typecheck/build, repository verification, and diff-check results are recorded in the implementing commit handoff.
