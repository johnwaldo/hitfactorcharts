<!-- aidevops:brief-schema=v2 -->

# t19: Add field-relative rank context to Placement Over Time summaries

## Pre-flight

- [x] Memory recall: `hitfactorcharts issue worker-ready auto-dispatch` → 0 hits — no relevant lessons
- [x] Discovery pass: 12 relevant commits / 8 merged PRs / 0 open PRs in the last 48 hours; PR #129 established the current four placement tiles.
- [x] File refs verified: 3 refs checked at `8e23219`.
- [x] Tier: `tier:standard` — the requested placement context is bounded, but the worker must retain record metadata while preserving shared tile semantics.
- [x] Seeded draft PR decision recorded: skipped — a current brief is sufficient for dispatch.

## Origin

- **Created:** 2026-09-11
- **Session:** OpenCode interactive session
- **Created by:** AI interactive
- **Parent task:** None; source issue GH#142, consolidating the overlapping request from GH#135.
- **Blocked by:** None
- **Conversation context:** The consolidated request asks for a rank equivalent beside placement percentages. It is resolved as explicit field-relative placement context (for example, `3rd of 28`), never an inferred USPSA class or national ranking.

## What

Keep each Placement Over Time tile's primary field-beaten percentage and add readable, field-relative rank context drawn from `div_place` and `div_total`: average rank/field size for Overall and Recent, and the actual matching rank/field size for Best and Worst. Best placement must use the positive tile tone and Worst placement the negative tile tone, with visible text that communicates the context in addition to color.

## Why

GH#142 asks users to see the rank counterpart of a field-beaten percentage. GH#135 duplicates that request but incorrectly suggests USPSA-style class equivalence. Field placement is meaningful only in its match field, so ordinal `place of total` is the accurate, non-misleading counterpart.

## Tier

**Selected tier:** `tier:standard`

**Tier rationale:** Placement records already have the required data, but the current helper flattens them to percentages. The worker must preserve the record association and adapt shared extreme/comparison helpers without adding a class-equivalence claim.

## PR Conventions

This is a leaf task. The implementation PR must use `Resolves #142`.

## How (Approach)

### Files to Modify

- `EDIT: extension/dashboard-summaries.js:140-182,273-293` — retain `{ fieldBeaten, place, total }` data for placement tiles, render explicit ordinal/field context, and support positive Best and negative Worst tones without class badges.
- `EDIT: tests/dashboard-summaries.test.js:68-81` — assert all four tiles expose field-relative rank context, Best/Worst tones, and the negative no-performance-badge guarantee.
- `EDIT: DESIGN.md:89-103` — document field-relative ordinal placement context while preserving the ban on placement class badges.

### Complete Write Surface

- **Callers/readers:** `extension/dashboard.js:1725-1727` renders Field beaten % from filtered records; `_placementTiles` consumes the same sorted records and `generateSummaries` writes it to `chartPlaceSummary` at `extension/dashboard-summaries.js:472`.
- **Writers/mutation paths:** `_renderSummary` writes tile HTML only. `div_place` and `div_total` are read-only cached values; no storage or fetch code changes.
- **Existing verification/tests:** `tests/dashboard-summaries.test.js:68-81` already exercises placement tiles and explicitly prohibits `performance-badge` markup.
- **Schemas/config:** The task uses existing `div_place` and `div_total`; no schema, config, generated output, or migration changes.
- **Cleanup/rollback paths:** Revert the scoped summary, test, and design changes together; cached match records require no repair.

### Implementation Steps

1. Replace the percentage-only placement array with finite record-derived values that retain ordinal place and field total. Continue to exclude records without a valid placement/total and never convert missing data to zero.
2. Keep field-beaten percentage primary. Add nearby text such as `Average placement: 6th of 24 in the relevant field` for Overall/Recent and the selected result's actual `Nth of total` for Best/Worst. Use an accessible ordinal implementation and avoid abbreviated, color-only rank labels.
3. Make Best placement use the positive tile tone and visible `Best result` context; make Worst placement use negative tone and visible `Lowest result` context. Do not use `_classBadge`, `≈`, class colors, or language that implies a normalized USPSA classification.
4. Update the existing focused tests and DESIGN.md. Preserve tile count, responsive grid behavior, field-beaten calculations, and unavailable behavior.

### Hazards and Compatibility

- **Concurrency/atomicity:** Derive rank context from the same filtered/sorted record snapshot as the placement chart.
- **Migration/rollback:** No persistence or migration. A revert restores percentage-only tile context.
- **Mixed-version/backward compatibility:** Legacy records lacking valid placement metadata remain unavailable and do not crash or fabricate rank context.
- **Idempotency/retry:** Repeated filters replace summary HTML through `_renderSummary`.
- **Partial failure/recovery:** A missing rank field affects only the relevant unavailable tile; other valid tile values still render.

### Verification Before Dispatch

```bash
node --check extension/dashboard-summaries.js
node --test tests/dashboard-summaries.test.js
node --test tests/*.test.js
git diff --check
```

- **Surface mapping:** The focused test proves ordinal context, status tones, and the no-class-badge boundary; the suite protects shared analytics behavior; manual inspection proves visual hierarchy and responsive layout.
- **UI verification:** Load Placement Over Time in both themes at approximately 375px and 1920px with varied field sizes. Confirm all four tiles show readable field-relative context, Best/Worst do not look like normalized classes, and status meaning remains visible without color alone.
- **Broad verification trigger:** Placement helpers are part of the shared summary module, so run the existing suite after focused tests pass.

### Files Scope

- `extension/dashboard-summaries.js`
- `tests/dashboard-summaries.test.js`
- `DESIGN.md`

## Acceptance Criteria

- [ ] Overall, Recent, Best, and Worst placement tiles retain their field-beaten percentage and show explicit, field-relative ordinal context based on valid `div_place`/`div_total` data.
- [ ] Best placement is positively toned and Worst placement negatively toned, with visible textual status in both cases.
- [ ] Placement summaries never render a performance/class badge, approximation mark, or a claim of USPSA/national rank; missing placement data is not treated as zero.
- [ ] Focused and repository tests pass; manual light/dark responsive inspection confirms readable context without horizontal overflow.

## Context & Decisions

- GH#135 is superseded by this issue because it requests the same surface. Its suggestion of a class-equivalent rank is explicitly rejected.
- `DESIGN.md:89-103` already prohibits placement class badges; this task preserves that protection while adding ordinal context.
- Do not change the chart axis, field-beaten formula, record schema, or classifier/non-classifier badge rules.
