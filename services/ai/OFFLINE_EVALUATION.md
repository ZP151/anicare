# A0 offline visual baseline

This evaluator is a local, deterministic RGB color/layout baseline. It is not
a learned cat-identity model, does not contact a network service, and does not
enable any product AI feature.

Install the optional evaluator dependency in an isolated Python environment:

```powershell
python -m pip install -e '.[eval]'
```

The normal development extra includes Pillow too, so the evaluator tests work
with `python -m pip install -e '.[dev]'`.

Copy `offline-eval-manifest.template.json` beside a directory of licensed local
images. The empty template is runnable and deliberately produces an
`incomplete` report with null metrics.

Each `gallery`, `holdoutKnown`, `holdoutUnknown`, `train`, and `development`
entry must include the following fields:

```json
{
  "sampleId": "licensed-gallery-001",
  "catId": "cat-001",
  "captureSession": "session-2026-01-01-a",
  "sourceGroup": "owner-batch-a",
  "relativePath": "images/licensed-gallery-001.jpg",
  "sha256": "lowercase-sha256-of-the-local-file",
  "evaluationPermission": "granted",
  "license": "the applicable license or agreement identifier",
  "source": "the licensed data source",
  "withdrawal": "active"
}
```

`relativePath` is relative to the manifest. URLs, absolute paths, backslashes,
and traversal are rejected. Files are hash-checked before reading and are
bounded to 25 MiB and 16,777,216 pixels.

The evaluator rejects a holdout query that shares an image hash,
`captureSession`, or `sourceGroup` with a gallery reference. A known holdout
cat must occur in the gallery; an unknown holdout cat must not. Neither known
nor unknown holdout identities may occur in `train` or `development`.

Run it locally:

```powershell
python -m animalhelper_ai.offline_eval `
  --manifest path/to/manifest.json `
  --threshold 0.80 `
  --output path/to/report.json
```

For each query the report ranks at most three cats, using the maximum descriptor
score across that cat's gallery samples. Unknown queries are rejected only when
their top score is below `threshold`. The report includes numerator,
denominator, and value for recall@3, unknown rejection, and unknown likely
match only when both known and unknown holdout samples plus a gallery are
present. Otherwise every metric is null and the report is `incomplete`.

The `0.80` command value above is an arbitrary runnable example, not a chosen
operating threshold. Choose and freeze any real threshold using only the
`development` split before inspecting holdout outcomes. Recall@3 remains a raw
ranking metric; every known and unknown query also records its threshold
`rejected` decision and `predictedCatId` for false-reject inspection. The report
stores the SHA-256 of the exact manifest bytes for local reproducibility.

`passesBetaGate` is always false. The report declaration records that no
identity-recognition effect is measured until real licensed, permitted data is
supplied; it is never permission to enable AI.
