# Hit Factor Charts Design

## Product UI

Hit Factor Charts is a data-dense browser dashboard. Preserve the existing Inter typography, blue accent, light/dark themes, compact controls, and chart-first hierarchy unless a feature explicitly changes them.

- The dashboard header displays the installed extension version from the runtime manifest so it remains accurate offline. GitHub Releases is the source of truth for publication dates; do not duplicate or maintain release dates in the extension or README.

## Responsive layout

- The dashboard is fluid and uses 100% of the browser width. Do not restore a fixed page-level maximum width.
- Sections provide their own horizontal gutters: 24–28px on desktop and 16px at widths up to 640px.
- Analytical canvases share a 380px displayed height, fill their section width, and redraw from their rendered dimensions after a browser resize.
- Canvas backing stores scale to the current device pixel ratio while layout, drawing, and pointer hit testing remain in CSS-pixel coordinates. Hidden canvases retain their last valid backing size until visible measurement is possible.
- Summary cards and controls wrap rather than forcing page-level horizontal scrolling.
- Chart insight summaries use compact, repeated tiles beneath the related chart
  or explanatory note. Score and classifier grids use four columns on wide
  screens, placement and non-classifier grids use two, outcome grids auto-fit
  their available metrics, and all grids stack before their content becomes
  cramped.
- At narrow widths, Match History rows wrap metadata and keep refresh, export, and delete actions visibly keyboard-accessible.
- Wide layouts should use the available charting space; constrain individual text or control elements only when readability requires it.
- Stage tables may scroll within their existing panel on narrow screens, but the page itself must not acquire unintended horizontal overflow.

## Interaction and accessibility

- Preserve visible keyboard focus and keyboard access for every control.
- Do not rely on hover for required actions or information.
- Before a first fetch, the USPSA division control must show visible required text,
  a theme-safe border/weight treatment, and native required state. Clear that
  treatment when a valid saved or newly selected division is active; never use
  colour or an icon as the only required-state cue.
- Keep motion restrained in this analytical interface; resizing and filtering should feel immediate rather than animated.
- Place the PractiScore human-verification notice directly after onboarding
  step 3 and before optional USPSA.org guidance. Keep it visually distinct but
  subordinate to the numbered steps, readable in both themes, and full-width
  on narrow screens. It must tell users to keep the PractiScore tab open and
  complete any repeated CAPTCHA or Cloudflare checks without adding a modal,
  animation, or new application state.
- Insight status icons reinforce visible text and are decorative to assistive
  technology. Never communicate Improving, Stable, Needs attention,
  unavailable data, or metric basis through colour or an icon alone.
- Verify layout changes in both themes at approximately 375px, 1920px, and
  2560px viewport widths.
- Theme settings separate brightness from accent. Brightness offers System,
  Light, and Dark; System follows the operating-system preference. Accent
  presets are Blue (compatibility default), Dark green, Bright green, and
  Purple. Persist both compact preferences in sync storage with a local backup.
- Use shared CSS custom properties for accent, stronger accent, focus ring, and
  accent surface. Selected settings require text and native radio state, never
  color alone. Every preset must preserve contrast for text, controls, badges,
  charts, and focus rings in either brightness mode.

## Chart language and axes

- Trend summaries must state their comparison and use percentage-point units.
  When labelled **Stable**, show the metric-specific threshold in visible
  supporting text.
- Every insight tile identifies its metric, primary value, comparison basis,
  and sample size. Directional tiles use **Improving**, **Stable**, or
  **Needs attention**; non-directional values use explicit labels such as
  **Field context**, **Overall view**, or **Association only** instead of
  implying progress.
- Overall percentage trends report the least-squares predicted first-to-last
  change for the filtered view. Score, placement, non-classifier, accuracy,
  hit-zone, and classifier insights use the same final dataset and
  stage-inclusion rules as their charts.
- Classifier correlation is Pearson `r` across per-match classifier averages
  paired with that match score, requires at least three varying pairs,
  displays `n`, and is described only as an association. Prefer official
  `clf_pct`; label any match-relative fallback and never infer a class from it.
- Accuracy share tiles compare the last three matches with the prior baseline.
  Higher A is positive; lower B/C/D/M/NS is positive. Hit-zone tiles pair
  average shares with least-squares percentage-point trends using the same
  semantic directions.
- Accuracy Trend classifies every finite nonzero least-squares predicted change
  directionally: higher A and lower B/C/D/M/NS/M+NS are **Improving**; their
  inverse is **Needs attention**. Only an exact-zero change is **Stable**;
  missing or insufficient data remains unavailable. Raw percentage values and
  visible status text remain alongside tone and icon.
- Accuracy Trend uses a disclosed piecewise-linear geometry only: raw 0%, 5%,
  10%, 20%, 40%, 50%, and 100% map to 0%, 30%, 45%, 62%, 84%, 90%, and 100%
  of visual height. Its raw ticks are 0%, 1%, 2%, 5%, 10%, 20%, 40%, 50%, and
  100%; tooltips, summaries, exports, trend inputs, denominators, and stored
  records remain raw percentages. No other chart receives this warp.
- Date ticks use measured text width and a minimum 10px gap. Keep the final date only when it does not collide with the preceding retained label.
- Suppress labels for duplicate source dates while preserving distinct same-day data points and tooltips. If different years share the same month and day, include the year so useful dates remain distinguishable.
- Axis labels must remain inside the canvas and readable in both themes at narrow, desktop, and wide widths.
- Repeated Classifiers Only toggles, filter changes, theme changes, and resizes must restore analytical canvases with unchanged geometry, sharp rendering, and aligned tooltips.
- Non-classifier stage percentages are match-relative comparisons with each stage's top shooter. Present them on a linear 0–100% scale without USPSA classification bands, labels, colours, or warped geometry.
- Keep same-day non-classifier matches as separate chart points and tooltips while rendering their shared date label only once.
- Regular Score Over Time uses a linear percentage scale without classification bands, inferred class labels, class colours, or warped geometry. Division %, Adjusted %, and Time % are match-performance signals, not official classifications.
- Score Over Time, Non-Classifier Stage Trend, and Classifier vs Match Score use neutral numeric reference guides at 40%, 60%, 75%, 85%, and 95%. Keep these guides linear, theme-aware, and unlabeled beyond their numeric axis ticks; never present them as classes or class-coloured regions.
- Use one shared performance-band mapping: D below 40%, C 40–59.999%, B
  60–74.999%, A 75–84.999%, M 85–94.999%, and GM 95%+. Finite normalized
  higher-is-better match finish, Adjusted %, and non-classifier stage values may
  show a compact `≈ A Class`-style badge with a prominent code and secondary
  `Class`; the approximation mark and accessible label keep it visibly
  unofficial. Official `clf_pct` uses the same hierarchy without `≈` and
  identifies itself as official to assistive technology. Never badge counts,
  placement/field-beaten, variance, correlation, or hit-zone shares. Badges
  include readable text as well as a theme-safe color, wrap without overflow,
  and remain compact from 375px through wide layouts.
- Placement Over Time and Non-Classifier Stage Trend each use four insight tiles
  on wide screens and stack at 640px or below. Both include recent and overall
  context plus best and worst finite values from the filtered view. Placement
  best/worst values remain unbadged field-beaten percentages; non-classifier
  best/worst values may use the explicitly unofficial performance shorthand.
- A captured GM hit-factor comparison is a separate, neutrally styled performance metric. Label it as an actual GM benchmark and never use it to classify the reporting shooter or replace Adjusted %.
- Place **Division performance**, **Adjusted %**, and **Time % (experimental)** beside **Classifiers Only** as matching native-checkbox switches. All controls expose visible keyboard focus, wrap together at narrow widths, and never create page-level overflow.
- Division performance, Adjusted %, and Time % are independently selectable and shown together by default when each has at least two valid points. Omit an unavailable selected metric with a clear explanation; never substitute or fabricate points.
- **Time % (experimental)** is a high-contrast cyan dashed series on the same linear 0–100 scale. It uses only fastest valid combined-field raw stage time divided by shooter raw time, excludes classifiers, overrides, invalid or incomplete times, and unavailable benchmarks. **Classifiers Only** is the sole exclusive alternate mode and restores the selected normal series when switched off.
- Hit Zone Breakdown stores and exports raw reported counts only. Source-column availability is part of each refreshed stage record; legacy records without it are unknown, and combined M+NS data must never be split into invented M and NS values.
- The hit-zone denominator is the reported A/B/C/D/M/NS or combined M+NS total. Procedural penalties remain outside it and are disclosed in chart help and tooltips.
- Accuracy Trend uses that same valid reported hit-zone total as each match's percentage denominator; missing or zero-denominator matches are unavailable, never zero accuracy.
- Apply all chart filters before sorting Hit Zone Breakdown records and retaining the six most recent eligible matches in chronological display order.
- Hit-zone geometry transforms cumulative boundaries, never individual stored values: raw 0–75% maps linearly to 0–45% visual height, and raw 75–100% maps linearly to 45–100%. Raw ticks render at transformed positions, ordering is stable, and the cumulative endpoint remains 100%. Keep this as a stacked bar chart: pie charts, 3D transforms, perspective, and area-based encodings would distort comparison.
- Use distinct theme-safe colours and stable order for A, conditional positive B, C, D, separate M, separate NS, and combined M+NS. Tooltips and exports retain exact raw counts and percentages.

## Analytics date range

- Keep four presets immediately visible above the charts in this order: **Last 1 month**, **3 mo**, **6 mo**, and **1 yr**.
- Activate **6 mo** on every dashboard load. Exactly one preset must expose a visible active state and `aria-pressed="true"`.
- Use compact native buttons with a clear keyboard focus ring. The group wraps at narrow widths rather than becoming a dropdown or creating horizontal page overflow.
- Date-range changes update the existing cached analytics immediately. They do not hide or delete older Match History records.
- After a complete paginated match-list extraction, persist validated cumulative fetch intervals. A later narrower fetch must not erase broader or legacy all-time coverage; incomplete extraction and malformed or missing metadata preserve previous history and coverage until a complete fetch establishes new coverage.
- Only presets fully contained by verified coverage are selectable. Unavailable presets remain focusable with `aria-disabled="true"`, a greyed state, and the hover/focus explanation: “Fetch a longer timeline to use this range.” Do not use native `disabled`, which would hide that help from keyboard users.
- If a bounded fetch makes the active preset unavailable, select the broadest verified available preset. Last 8, division, match selection, cache contents, and single-match refresh never affect coverage.

## Fetch timeline

- Require a named USPSA division before **Fetch Scores** can start. Use a non-selectable **Select division — required** placeholder instead of an aggregate view, and preserve the selected division locally.
- Place the labelled native Fetch timeline select immediately before **Fetch Scores**. Use the same four labels as the analytics presets, default to **6 mo**, and persist the latest selection locally. Normalize legacy unsupported timeline values to **6 mo**.
- Fetch timeline controls pre-fetch request scope; analytics presets independently filter cached data. Keep that distinction explicit in status and documentation.
- The current visible select value is the next fetch scope. Changing it alone makes no request.
- Preserve older cache and Match History entries when a narrower timeline is fetched. Explicit single-match refresh remains unrestricted.
- With valid same-owner sync metadata, scan Match History newest-first and stop
  only after two consecutive settled pages contain no unknown IDs and every
  valid date is at or before the stored high-water date. Any unknown ID resets
  the overlap count, including a same-day addition. Missing/corrupt metadata,
  malformed page dates, ten incremental runs, or fourteen days since the last
  full scan require full pagination. Deduplicate by match ID, never by date, so
  same-day matches remain distinct. An unsettled or incomplete extraction is
  non-destructive and cannot advance sync metadata or erase coverage.
- Store cache completeness with parser schema version, `complete|partial|unknown` state, expected and fetched stage counts, and failed stage identities. Legacy records are `unknown` and receive one lazy repair; only explicitly complete same-member records bypass score and stage requests.
- Stage repair is sequential and bounded. Verify each selected stage, traverse result-table pages, retry failures, merge successful partial data by stable stage identity, and replace stages only after a complete authoritative fetch. Preserve stage overrides by stage number when names change.
- Report extracted and in-range matches, complete cache reuse, partial and unknown repairs, new matches, expected and fetched stages, and failed stages as separate diagnostics.
- Keep **Full history reconciliation**, **Back up data**, and **Restore backup**
  as compact secondary controls below the primary fetch row. They wrap at narrow
  widths, retain visible focus, and explain that backups are required before
  changing an unpacked extension folder.
- Use the dashboard-supplied inclusive date bounds as the authoritative fetch window so frontend and background scope cannot diverge across midnight.
- Keep the label and select together as controls wrap at narrow widths, with visible focus and no page-level horizontal overflow.

## Upgrade persistence and recovery

- Preserve the manifest identity: do not add or change a fixed public key without
  a separately verified one-time migration. In-place file replacement plus
  Chrome's **Reload** is the supported unpacked-upgrade path.
- Keep full history in `chrome.storage.local`; sync storage is reserved for compact credentials and theme preferences.
- Backups are versioned JSON and include history, score cache, coverage,
  selections, filters, and overrides. Validate format, size, field types, and
  `cached_for` ownership before any restore write; require explicit confirmation
  before replacing another member's local history.
- Storage migrations are versioned and idempotent. Promote compatible complete
  cache records to the current parser schema without refetching, preserve unknown
  records for lazy repair, and never blanket-delete data during an upgrade.

## Last 8 analytics

- Place a labelled native-checkbox switch beside the analytics date presets. Default it off, persist only a valid boolean, and expose visible keyboard focus and active styling in both themes.
- Apply Last 8 after the active date range, division, Scored/All view, and manual match selection. Use one shared final-eight dataset for summaries, charts, classifier analysis, and chart CSV export.
- Treat Last 8 as a post-fetch view preference. Toggling it makes no request and never mutates fetched results, Match History, `matchCache`, or `lastMatchList`.
- When fewer than eight matches qualify, use all available matches. State the visible and qualifying counts near the switch.
- Keep the controls wrapping at narrow widths without page-level overflow.
- Chart CSV uses the same final analytics selection as rendering. When no data rows qualify, create no download and announce a concise status explanation for the current division/date, Scored/All view, unchecked-match, or Classifiers Only exclusion.

## Manual match type

- Show a compact labelled native select only on Match History rows that remain unconfirmed after automatic detection. Offer **Keep unconfirmed**, USPSA, IDPA, IPSC, Steel Challenge, 3-Gun, PCSL, and ICORE.
- Keep the effective-type badge and include checkbox synchronized with the saved choice. Confirmed page or detected types take precedence over stale overrides.
- Persist overrides separately by match ID. Changing or resetting a type rerenders cached data locally without deleting history, scores, stages, or cache entries.
- A saved non-USPSA choice suppresses later full-fetch score and stage requests for that match; explicit single-match refresh remains unrestricted.
- Keep the selector keyboard-accessible and visible in both themes. Match History actions and controls wrap without page-level overflow at narrow widths.
