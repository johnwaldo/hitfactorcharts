# Changelog

All notable user-facing changes are documented here. Update this file before publishing a release so GitHub release notes call out features clearly instead of relying only on commit messages.

## Unreleased

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
