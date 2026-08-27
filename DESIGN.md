# Hit Factor Charts Design

## Product UI

Hit Factor Charts is a data-dense browser dashboard. Preserve the existing Inter typography, blue accent, light/dark themes, compact controls, and chart-first hierarchy unless a feature explicitly changes them.

## Responsive layout

- The dashboard is fluid and uses 100% of the browser width. Do not restore a fixed page-level maximum width.
- Sections provide their own horizontal gutters: 24–28px on desktop and 16px at widths up to 640px.
- Analytical canvases share a 380px displayed height, fill their section width, and redraw from their rendered dimensions after a browser resize.
- Canvas backing stores scale to the current device pixel ratio while layout, drawing, and pointer hit testing remain in CSS-pixel coordinates. Hidden canvases retain their last valid backing size until visible measurement is possible.
- Summary cards and controls wrap rather than forcing page-level horizontal scrolling.
- At narrow widths, Match History rows wrap metadata and keep refresh, export, and delete actions visibly keyboard-accessible.
- Wide layouts should use the available charting space; constrain individual text or control elements only when readability requires it.
- Stage tables may scroll within their existing panel on narrow screens, but the page itself must not acquire unintended horizontal overflow.

## Interaction and accessibility

- Preserve visible keyboard focus and keyboard access for every control.
- Do not rely on hover for required actions or information.
- Keep motion restrained in this analytical interface; resizing and filtering should feel immediate rather than animated.
- Verify layout changes in both themes at approximately 375px, 1920px, and 2560px viewport widths.

## Chart language and axes

- Trend summaries must state their comparison and use percentage-point units. When labelled **Stable**, show the metric-specific threshold in visible supporting text.
- Date ticks use measured text width and a minimum 10px gap. Keep the final date only when it does not collide with the preceding retained label.
- Suppress labels for duplicate source dates while preserving distinct same-day data points and tooltips. If different years share the same month and day, include the year so useful dates remain distinguishable.
- Axis labels must remain inside the canvas and readable in both themes at narrow, desktop, and wide widths.
- Repeated Classifiers Only toggles, filter changes, theme changes, and resizes must restore analytical canvases with unchanged geometry, sharp rendering, and aligned tooltips.
- Non-classifier stage percentages are match-relative comparisons with each stage's top shooter. Present them on a linear 0–100% scale without USPSA classification bands, labels, colours, or warped geometry.
- Keep same-day non-classifier matches as separate chart points and tooltips while rendering their shared date label only once.
- Regular Score Over Time uses a linear percentage scale without classification bands, inferred class labels, class colours, or warped geometry. Division % and Adjusted % are match-performance signals, not official classifications.
- Score Over Time, Adjusted % Only, Non-Classifier Stage Trend, and Classifier vs Match Score use neutral numeric reference guides at 40%, 60%, 75%, 85%, and 95%. Keep these guides linear, theme-aware, and unlabeled beyond their numeric axis ticks; never present them as classes or class-coloured regions.
- Show GM/M/A/B/C/D context only for nationally normalized `clf_pct` values. Match-relative classifier fallbacks must be identified as such and must not receive inferred class labels.
- Place **Adjusted % Only** beside **Classifiers Only** as matching native-checkbox switches. Both controls expose visible keyboard focus, wrap together at narrow widths, and never create page-level overflow.
- Adjusted-only and classifiers-only modes are mutually exclusive. Adjusted-only displays cached adjusted points without raw fallback and uses a clear multi-line empty state when fewer than two usable points exist.

## Analytics date range

- Keep all six presets immediately visible above the charts in this order: **Last 1 month**, **3 mo**, **6 mo**, **1 yr**, **3 yr**, and **all time**.
- Activate **6 mo** on every dashboard load. Exactly one preset must expose a visible active state and `aria-pressed="true"`.
- Use compact native buttons with a clear keyboard focus ring. The group wraps at narrow widths rather than becoming a dropdown or creating horizontal page overflow.
- Date-range changes update the existing cached analytics immediately. They do not hide or delete older Match History records.

## Fetch timeline

- Place the labelled native Fetch timeline select immediately before **Fetch Scores**. Use the same six labels as the analytics presets, default to **6 mo**, and persist the latest selection locally.
- Fetch timeline controls pre-fetch request scope; analytics presets independently filter cached data. Keep that distinction explicit in status and documentation.
- The current visible select value is the next fetch scope. Changing it alone makes no request.
- Preserve older cache and Match History entries when a narrower timeline is fetched. Explicit single-match refresh remains unrestricted.
- On a broader later fetch, reuse valid per-match cache entries for the same member before the score/stage loop and request only missing matches. Report reused and requested counts in the progress log.
- Keep the label and select together as controls wrap at narrow widths, with visible focus and no page-level horizontal overflow.

## Last 8 analytics

- Place a labelled native-checkbox switch beside the analytics date presets. Default it off, persist only a valid boolean, and expose visible keyboard focus and active styling in both themes.
- Apply Last 8 after the active date range, division, Scored/All view, and manual match selection. Use one shared final-eight dataset for summaries, charts, classifier analysis, and chart CSV export.
- Treat Last 8 as a post-fetch view preference. Toggling it makes no request and never mutates fetched results, Match History, `matchCache`, or `lastMatchList`.
- When fewer than eight matches qualify, use all available matches. State the visible and qualifying counts near the switch.
- Keep the controls wrapping at narrow widths without page-level overflow.

## Manual match type

- Show a compact labelled native select only on Match History rows that remain unconfirmed after automatic detection. Offer **Keep unconfirmed**, USPSA, IDPA, IPSC, Steel Challenge, 3-Gun, PCSL, and ICORE.
- Keep the effective-type badge and include checkbox synchronized with the saved choice. Confirmed page or detected types take precedence over stale overrides.
- Persist overrides separately by match ID. Changing or resetting a type rerenders cached data locally without deleting history, scores, stages, or cache entries.
- A saved non-USPSA choice suppresses later full-fetch score and stage requests for that match; explicit single-match refresh remains unrestricted.
- Keep the selector keyboard-accessible and visible in both themes. Match History actions and controls wrap without page-level overflow at narrow widths.
