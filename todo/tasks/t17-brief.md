<!-- aidevops:brief-schema=v2 -->

# t17: Classify every nonzero Accuracy Trend change directionally

## Pre-flight

- [x] Memory recall: `hitfactorcharts issue worker-ready auto-dispatch` → 0 hits — no relevant lessons
- [x] Discovery pass: 12 relevant commits / 8 merged PRs / 0 open PRs in the last 48 hours; PR #137 last changed Accuracy Trend wording.
- [x] File refs verified: 3 refs checked at `8e23219`.
- [x] Tier: `tier:standard` — derived presentation behavior is decided, but the shared status helper has callers with different threshold semantics.
- [x] Seeded draft PR decision recorded: skipped — a current brief is sufficient for dispatch.

## Origin

- **Created:** 2026-09-11
- **Session:** OpenCode interactive session
- **Created by:** AI interactive
- **Parent task:** None; source issue GH#144
- **Blocked by:** None
- **Conversation context:** Accuracy Trend tiles showing a nonzero predicted change as gray Stable are misleading. For accuracy only, every nonzero predicted change must visibly convey its beneficial or harmful direction.

## What

Make Accuracy Trend summary tiles classify every nonzero least-squares predicted change as directional. A decrease in B/C/D/M/NS or combined M+NS is Improving; an increase is Needs attention. The inverse applies to A hits. Only an exactly zero predicted change may be Stable.

## Why

GH#144 reports examples such as a -0.4% predicted change in No-shoots rendering as Stable. That hides a useful improvement and breaks the dashboard rule that tile status text, not color alone, communicates the trend.

## Tier

**Selected tier:** `tier:standard`

**Tier rationale:** The output contract is clear, but `_trendStatus` is shared by score, placement, hit-zone, and accuracy summaries. Change only the Accuracy Trend caller unless source evidence shows an intentionally shared zero-threshold rule.

## PR Conventions

This is a leaf task. The implementation PR must use `Resolves #144`.

## How (Approach)

### Files to Modify

- `EDIT: extension/dashboard-summaries.js:88-93,419-456` — apply a zero tolerance only when generating Accuracy Trend (`mode === 'percentage'`) status, preserving metric direction and raw percentage values.
- `EDIT: tests/dashboard-summaries.test.js:129-145` — cover nonzero low-is-better and high-is-better changes that previously fell into Stable, plus the exact-zero regression case.
- `EDIT: DESIGN.md:54-80` — state that Accuracy Trend nonzero predicted changes are directional while preserving the existing raw-percentage and accessibility rules.

### Complete Write Surface

- **Callers/readers:** `extension/dashboard.js:1815-1865` builds raw `accuracyPoints`; `generateSummaries` passes them to `_outcomeTiles(..., 'percentage')` at `extension/dashboard-summaries.js:475`.
- **Writers/mutation paths:** `_renderSummary` replaces only dashboard tile HTML. No storage, fetch, schema, or data mutation path changes.
- **Tests/fixtures:** `tests/dashboard-summaries.test.js` loads the summary module in a VM and already asserts accuracy direction/color semantics.
- **Schemas/config:** Existing `accuracyPoints` fields remain unchanged; no configuration surface changes.
- **Generated/deployed mirrors:** `extension/dashboard-summaries.js` and `DESIGN.md` are direct source files; repository inspection found no generated mirror.
- **Migrations/backfills:** N/A because `extension/dashboard-summaries.js` only changes derived tile status at render time and persists no data.
- **Cleanup/rollback paths:** Revert `extension/dashboard-summaries.js`, `tests/dashboard-summaries.test.js`, and `DESIGN.md` together; cached match data is not altered.

### Implementation Steps

1. Keep `_overallTrend` and displayed `% predicted change` calculations unchanged. At the Accuracy Trend call site, use a zero threshold for status classification so any finite nonzero delta is directional; do not alter score, placement, classifier, or Hit Zone tolerances.
2. Preserve the existing `lowerIsBetter` map: A hits are higher-is-better; B/C/D/M/NS/M+NS are lower-is-better. Keep visible status text alongside tone/icon.
3. Update the focused VM tests for a -0.4 No-shoot change (Improving/positive), a nonzero adverse change (Needs attention/negative), and an exact-zero Stable result. Update DESIGN.md to match the implemented behavior.

### Hazards and Compatibility

- **Concurrency/atomicity:** Rendering is synchronous from the filtered snapshot; derive status from the same trend delta already displayed.
- **Migration/rollback:** No persisted data changes. Reverting restores the former tolerance behavior.
- **Mixed-version/backward compatibility:** Missing or non-finite values remain unavailable, never zero.
- **Idempotency/retry:** Repeated filtering rerenders summaries through `_renderSummary`; do not append markup outside it.
- **Partial failure/recovery:** A tile without enough data remains contextual/unavailable and must not become directional.

### Verification Before Dispatch

```bash
node --check extension/dashboard-summaries.js
node --test tests/dashboard-summaries.test.js
node --test tests/*.test.js
git diff --check
```

- **Surface mapping:** The focused test proves direction semantics; the repository suite protects other summary consumers; manual dashboard inspection proves rendered labels and tones.
- **UI verification:** Load the extension in both themes at approximately 375px and 1920px. Confirm a nonzero No-shoot trend is labeled Improving or Needs attention, not Stable, and that status remains understandable without color.
- **Broad verification trigger:** The shared helper is used by multiple chart summaries, so run the existing test suite after focused tests pass.

### Files Scope

- `extension/dashboard-summaries.js`
- `tests/dashboard-summaries.test.js`
- `DESIGN.md`

## Acceptance Criteria

- [ ] A nonzero Accuracy Trend predicted change always renders Improving or Needs attention according to its metric's beneficial direction.
- [ ] An exact-zero Accuracy Trend change remains Stable; missing/insufficient data remains unavailable rather than zero or directional.
- [ ] Score, placement, classifier, and Hit Zone summary tolerances are unchanged.
- [ ] Focused and repository tests pass; manual light/dark responsive inspection confirms status text is visible without relying on color.

## Context & Decisions

- `extension/dashboard-summaries.js:88-93` defines the shared direction mapping; `:431-447` is the Accuracy Trend branch.
- The issue applies to Accuracy Trend only, not every summary using `_trendStatus`.
- Do not change raw trend data, chart geometry, axes, or stored match records.
