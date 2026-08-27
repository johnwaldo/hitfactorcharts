# Changelog

All notable user-facing changes are documented here. Update this file before publishing a release so GitHub release notes call out features clearly instead of relying only on commit messages.

## Unreleased

## v1.6.7 — 2026-08-27

### Added

- Percentage charts now include neutral reference guides at useful benchmarks without applying USPSA classification bands to non-classifier results.

### Fixed

- Broader fetch timelines now reuse complete cached matches while fetching missing history, reducing unnecessary PractiScore requests.
- Expanded fetches now traverse paginated Match History without collapsing same-date matches, repair legacy or partial stage caches, search paginated result tables, and preserve prior history and stages when extraction remains incomplete.
- Analytics range controls now disable periods outside the fetched coverage instead of implying that unavailable history has been loaded.
- Charts now render at the correct high-DPI canvas size and remain sharp after resizing.

### Changed

- Hit Zone Breakdown now preserves reported B, separate M/NS, and combined M+NS source data, leaves unavailable legacy fields blank, and uses a disclosed nonlinear visual scale to make smaller outcomes readable without changing raw percentages or exports.

## v1.6.6 — 2026-08-27

### Added

- A persisted **Last 8** switch focuses charts, summaries, classifier analysis, and CSV exports on the eight most recent qualifying matches without trimming Match History or cached data.
- A separate **Fetch timeline** control limits new PractiScore requests to one month, three months, six months, one year, three years, or all time while preserving older cached history.
- **Adjusted % Only** mode plots cached field-strength-adjusted results without falling back to raw match percentages.
- Unconfirmed Match History rows can now be classified manually as USPSA, IDPA, IPSC, Steel Challenge, 3-Gun, PCSL, or ICORE. Non-USPSA choices prevent unnecessary requests on later full fetches.

### Changed

- Trend summaries now use documented percentage-point thresholds with an explicit **Stable** state, and dense charts space date labels by rendered width while retaining every point and tooltip.
- Regular match and non-classifier charts now use clear linear 0–100% match-performance scales. USPSA class bands and class metadata remain exclusive to official classifier percentages.
- Adjusted % summaries identify dominant GM or Master field context only when the underlying stage evidence supports it, with neutral wording for mixed or unavailable references.

## v1.6.5 — 2026-08-26

### Added

- Six immediately visible graph range presets now cover the last month, three months, six months, one year, three years, and all time. Analytics default to six months while older cached matches remain available.
- A responsive Master Calendar now shows the current month and previous five months, with accessible entries that jump directly to the corresponding Match History row.

### Changed

- The dashboard now uses the full browser width, redraws charts to their rendered container size, and keeps compact gutters across desktop and narrow layouts.
- Match History actions now wrap and remain visible on narrow screens without causing horizontal page overflow.

## v1.6.4 — 2026-08-26

### Added

- A persistent division selector before the USPSA member-number field now filters charts, statistics, classifier analysis, Match History, status counts, and CSV exports without re-fetching scores.

### Documentation

- README now explains how the saved division filter applies across the dashboard without deleting cached scores from other divisions.

## v1.6.3 — 2026-08-24

### Fixed

- Adjusted % now uses the strongest division-normalized stage result instead of allowing a weak GM or Master stage median to inflate scores above 100%.

### Added

- CSV exports now include each stage's adjusted percentage and selected benchmark details for auditing.

## v1.6.2 — 2026-05-26

### Added

- Stage-level filtering in match history. Expand a match, uncheck **Factor** for an anomalous stage, add an optional note, and apply the filter while keeping the stage visible for future reference.
- Filtered stage state is saved locally and reflected across performance cards, adjusted %, classifier/non-classifier trends, accuracy, hit-zone breakdowns, CSV export metadata, and match image cards.

### Changed

- Adjusted % now excludes classifier stages. Official classifier percentages are already normalized against USPSA national division data, so they are shown as-is instead of being field-strength adjusted again.

### Documentation

- README now explains stage filtering and clarifies that adjusted % applies only to non-classifier stages.
