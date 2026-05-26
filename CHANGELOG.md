# Changelog

All notable user-facing changes are documented here. Update this file before publishing a release so GitHub release notes call out features clearly instead of relying only on commit messages.

## v1.6.2 — 2026-05-26

### Added

- Stage-level filtering in match history. Expand a match, uncheck **Factor** for an anomalous stage, add an optional note, and apply the filter while keeping the stage visible for future reference.
- Filtered stage state is saved locally and reflected across performance cards, adjusted %, classifier/non-classifier trends, accuracy, hit-zone breakdowns, CSV export metadata, and match image cards.

### Changed

- Adjusted % now excludes classifier stages. Official classifier percentages are already normalized against USPSA national division data, so they are shown as-is instead of being field-strength adjusted again.

### Documentation

- README now explains stage filtering and clarifies that adjusted % applies only to non-classifier stages.
