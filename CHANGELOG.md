# Changelog

All notable user-facing changes are documented here. Update this file before publishing a release so GitHub release notes call out features clearly instead of relying only on commit messages.

## Unreleased

## v1.8.3 — 2026-09-11

### Changed

- Placement Over Time summaries now pair field-beaten percentages with explicit,
  field-relative placement context without implying a USPSA classification.
- Classifier vs Match Performance now shows a readable match-finish trend instead
  of a Pearson-correlation value.

### Fixed

- Accuracy Trend summaries now label every nonzero predicted change as improving
  or needing attention according to the metric's direction.

## v1.8.2 — 2026-09-09

### Added

- Score Over Time now displays Division performance, Adjusted %, and experimental
  Time % together when data is available. Each series can be shown alone or in
  combination; Classifiers Only remains a distinct alternate view.

### Changed

- Accuracy Trend summaries now spell out percentage-point changes instead of
  using the `pp` abbreviation, while preserving existing trend calculations and
  directions.

### Fixed

- Aligned the required division selector with the first-screen controls across
  responsive layouts while retaining its accessible required-state treatment.
- Preserved the Vivaldi toolbar action while its asynchronous click handling
  opens or focuses the dashboard.

## v1.8.1 — 2026-09-09

### Added

- Added familiar D, C, B, A, M, and GM equivalent badges to match finish and
  Adjusted % summaries while keeping them explicitly separate from official
  USPSA classifier classifications.
- Added best and worst context to Placement Over Time and Non-Classifier Stage
  Trend summaries.

### Changed

- Time % is now the default, high-contrast Score Over Time view and remains an
  exclusive chart mode.
- Accuracy Trend now uses a disclosed nonlinear scale that expands small C, D,
  M, and NS percentages without changing raw labels, summaries, or exports.
- The required USPSA division selection now includes accessible helper text and
  synchronized theme-safe state before scores are fetched.

### Fixed

- The toolbar action now recovers when a dashboard tab closes during activation
  and avoids creating duplicate dashboards when window focus fails.

## v1.8.0 — 2026-09-09

### Added

- Added persistent light/dark brightness and blue, dark green, bright green, or
  purple accent controls that synchronize through Chrome storage.
- Added the installed extension version to the dashboard header so the active
  build can be confirmed without opening Chrome's extension settings.

### Changed

- Accuracy insights now report A, C, D, miss, no-shoot, and procedural outcomes
  as percentages with explicit denominators, while retaining raw counts where
  useful for context.
- PractiScore onboarding now explains CAPTCHA and Cloudflare verification after
  sign-in, including accessible recovery guidance when a fetch is interrupted.

### Fixed

- Dashboard size safeguards now account for the expanded theme and analytics
  controls without weakening the existing bundle guard.

## v1.7.1 — 2026-09-08

### Added

- Added versioned local-data backup and validated restore controls for recovery
  when an unpacked extension is loaded from a different folder or receives a
  new identity.
- Added explicit and periodic full history reconciliation for discovering older
  delayed or backfilled PractiScore matches.

### Changed

- Routine PractiScore refreshes now scan newest history pages first and stop
  after a conservative two-page overlap with trusted same-member sync metadata.
- Compatible complete cache records now migrate non-destructively to the current
  schema instead of being blanket-refetched.

### Fixed

- Upgrade guidance now preserves the loaded unpacked folder and uses Chrome's
  Reload action, preventing accidental storage-namespace changes during normal
  updates.
- Incomplete pagination and corrupt sync metadata preserve existing history and
  coverage while diagnostics explain the fallback and stop reason.

## v1.7.0 — 2026-09-07

### Highlights

- Every analytics chart now includes responsive insight tiles for its primary
  values, recent comparisons, overall trends, and sample sizes.
- Classifier insights now include best performance, same-match context, and
  Pearson correlation when at least three varying paired matches are available.

### Analytics semantics

- Directional metrics now use explicit **Improving**, **Stable**, and
  **Needs attention** labels, while non-directional metrics use neutral context
  labels instead of implying progress.
- Accuracy and hit-zone summaries preserve separate M/NS and combined M+NS
  source data, exclude procedurals from hit-zone denominators, and leave missing
  values unavailable instead of treating them as zero.
- Insight grids now adapt from wide desktop columns to a single-column mobile
  layout in both light and dark themes without horizontal page overflow.

### Release documentation

- Added the chart-summary metric, threshold, accessibility, and responsive
  layout contracts to the README and design guide.

## v1.6.9 — 2026-09-01

### Added

- Hit Zone bars now show legible A-hit percentages and a dotted raw-A% progression line.
- Time-ordered charts now show dotted per-series least-squares progression lines when enough data is available.
- Accuracy Trend now distinguishes reported C, D, M, and NS counts without splitting combined M+NS source data.

### Fixed

- The action icon now remains recognizable against light and dark themed browser toolbars.

## v1.6.8 — 2026-08-27

### Fixed

- Match, non-classifier stage, and Adjusted % displays and PNG cards now remain neutral instead of inferring USPSA classes. Captured GM hit factors appear separately as an explicit benchmark comparison.
- Chart CSV export now shares the final chart dataset and explains empty filtered results instead of downloading a header-only file.

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
