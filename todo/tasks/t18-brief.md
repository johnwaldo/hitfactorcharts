<!-- aidevops:brief-schema=v2 -->

# t18: Replace Classifier correlation with a match-finish trend

## Pre-flight

- [x] Memory recall: `hitfactorcharts issue worker-ready auto-dispatch` → 0 hits — no relevant lessons
- [x] Discovery pass: 12 relevant commits / 8 merged PRs / 0 open PRs in the last 48 hours; PR #129 introduced the current classifier tile set.
- [x] File refs verified: 3 refs checked at `8e23219`.
- [x] Tier: `tier:standard` — the replacement metric and semantic boundary are specified, with a focused existing VM test harness.
- [x] Seeded draft PR decision recorded: skipped — a current brief is sufficient for dispatch.

## Origin

- **Created:** 2026-09-11
- **Session:** OpenCode interactive session
- **Created by:** AI interactive
- **Parent task:** None; source issue GH#143
- **Blocked by:** None
- **Conversation context:** Users find the Pearson correlation (`r 0.03`) opaque. The final Classifier vs Match Performance tile should instead communicate a percentage trend with clear positive/negative direction.

## What

Replace the fourth `Classifier correlation` tile with `Match finish trend`: the least-squares predicted first-to-last percentage change across the existing classifier-view match finishes. It must use the standard directional tile presentation (Improving, Stable, or Needs attention), retain the sample size, and never display Pearson `r` or an association claim.

## Why

GH#143 asks for a statistic users can act on. The third tile already provides average match finish; the replacement adds its direction over the current filtered classifier dataset without inventing a classifier class or altering source data.

## Tier

**Selected tier:** `tier:standard`

**Tier rationale:** The chosen output is an existing helper pattern (`_overallTrendTile`) over the already-collected `data.matchScores`, but visible copy, empty-state behavior, tests, and design documentation must remain coherent.

## PR Conventions

This is a leaf task. The implementation PR must use `Resolves #143`.

## How (Approach)

### Files to Modify

- `EDIT: extension/dashboard-summaries.js:359-416` — remove the correlation-only final tile and render a Match finish trend from `data.matchScores` using `_overallTrendTile`.
- `EDIT: tests/dashboard-summaries.test.js:96-118` — assert the final classifier tile reports a percentage trend/status and does not expose `r` or correlation wording.
- `EDIT: DESIGN.md:54-75` — replace the correlation-specific contract with the new match-finish trend contract while retaining official/fallback classifier rules.

### Complete Write Surface

- **Callers/readers:** `extension/dashboard.js:1769-1813` supplies the Classifier vs Match chart; `_classifierData` in `extension/dashboard-summaries.js:325-356` already collects `matchScores`; `generateSummaries` calls `_classifierTiles` at `:474`.
- **Writers/mutation paths:** `_renderSummary` writes the summary HTML only. The chart, filters, stored records, network calls, and score calculation remain unchanged.
- **Existing verification/tests:** `tests/dashboard-summaries.test.js` exposes `_classifierTiles` through its VM harness and has official/fallback classifier fixtures.
- **Schemas/config:** No record shape, generated artifact, migration, or deployment mirror changes.
- **Cleanup/rollback paths:** Revert the scoped helper, test, and DESIGN.md updates together; no user data requires cleanup.

### Implementation Steps

1. Remove the visible correlation tile and its unavailable state. Remove `_pearsonCorrelation` and `_correlationDescription` only if no remaining source call site uses them.
2. Render `_overallTrendTile('Match finish trend', data.matchScores)` as the fourth tile so it uses the existing least-squares percentage change, sample size, and directional status. Its unavailable state must clearly say that at least three comparable match finishes are required.
3. Keep the other three classifier tiles and all classifier official/fallback badge behavior unchanged. Update tests and DESIGN.md for the new user-facing metric.

### Hazards and Compatibility

- **Concurrency/atomicity:** All values derive from the same final filtered data snapshot as the chart.
- **Migration/rollback:** No data change; a revert restores the correlation tile.
- **Mixed-version/backward compatibility:** Sparse classifier data must render an unavailable trend rather than a fabricated zero or correlation fallback.
- **Idempotency/retry:** Summary rendering replaces the container HTML on each filter operation.
- **Partial failure/recovery:** The absence of three match finishes affects only the final tile, not the existing classifier tiles or chart.

### Verification Before Dispatch

```bash
node --check extension/dashboard-summaries.js
node --test tests/dashboard-summaries.test.js
node --test tests/*.test.js
git diff --check
```

- **Surface mapping:** Focused fixtures prove the replacement copy/data semantics; the suite protects shared summary behavior; manual dashboard inspection confirms readability in the chart context.
- **UI verification:** In both themes at approximately 375px and 1920px, inspect Classifier vs Match Performance with sufficient and insufficient match data. Confirm the final tile has percentage trend text and status, no `r`/correlation wording, no overflow, and no color-only meaning.
- **Broad verification trigger:** The shared summary module is used across dashboard charts, so run the existing repository test suite after the focused test passes.

### Files Scope

- `extension/dashboard-summaries.js`
- `tests/dashboard-summaries.test.js`
- `DESIGN.md`

## Acceptance Criteria

- [ ] The final Classifier vs Match Performance tile is Match finish trend, showing a least-squares predicted percentage change and directional status from current filtered match finishes.
- [ ] Neither visible classifier summaries nor DESIGN.md retain Pearson `r`, correlation, or association-only messaging.
- [ ] Fewer than three comparable match finishes produce a clear unavailable state; other classifier summaries and official/fallback semantics remain intact.
- [ ] Focused and repository tests pass; manual light/dark responsive inspection confirms readable status text without color alone.

## Context & Decisions

- `data.matchScores` already records `effectiveOverallPct(record)` for each classifier-view record, so no source-data redesign is needed.
- Use the established `_overallTrendTile` rather than inventing a new comparison scale.
- Do not infer a class from match-relative fallback data or alter the chart's two series.
