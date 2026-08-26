# PScharts TODO

- [x] t001 Show installed version number on the dashboard page (e.g. in footer or header) so users can confirm what version they're running without opening chrome://extensions
- [ ] t002 Chrome Web Store submission — publish extension for true auto-update and zero-friction install (requires $5 developer account, packaging, and review submission)
- [x] t003 build.sh: version tag passed as argument creates a misnamed ZIP (pscharts-v1.0-patch.zip instead of pscharts-v1.0.1.zip) — fix to derive patch version from manifest or accept full semver as argument
- [ ] t004 Unknown match type detection — consider prompting user to manually classify unconfirmed-type matches rather than silently showing them as "unconfirmed type"
- [x] t005 Image export — per-match and per-stage PNG export via Canvas (match card + stage card); upstream v1.0–v1.1 feature; floppy-disk button on each match row with dropdown for full match or individual stages pr:#12
- [x] t006 CSV export — flat per-stage CSV of all chart-visible match data including USPSA %, HF, hit counts, CM info; respects active division and date-range presets; "⤓ CSV" button in chart section header pr:#12
- [x] t007 Custom date range filter — shipped in v1.0 via pr:#12; superseded by the six immediately visible analytics presets in #31
- [x] t008 Class-band Y-axis warp — buildWarpMap()/warpPct() for weighted Y-axis on score-over-time chart so each class band gets proportional visual height rather than linear % scale; upstream v0.8-beta feature pr:#12
- [x] t009 clf_pct in stage table — when a stage is a known classifier and clf_pct is available, show official USPSA % as primary with match % as small secondary; one-line template change in renderMatchList(); upstream v0.9 feature pr:#12
- [x] t010 normalizeStgName() + background.js regex fix — strip "Stage N:" prefix from cached stage names; tighten stage regex separator from required to optional (/[:\-–]?\s*/i); upstream v1.0/v1.1 fix pr:#12
- [x] t011 Score Over Time chart height 220→380 — upstream v1.0 made the main chart taller for better readability pr:#12
- [ ] t012 Adjusted % summary wording — current text "Your division's field strength closely mirrors the overall match field" is technically correct but doesn't explain why. When the gap is near zero because the shooter is competing against elite division competition (e.g. a top-5 national GM), the summary should surface that context rather than implying the fields are average. Consider surfacing the refClass/refDiv data to say something like "You're being measured against [GM/M] class competition in your division — your division % is a reliable indicator."
