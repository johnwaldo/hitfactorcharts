# Hit Factor Charts Design

## Product UI

Hit Factor Charts is a data-dense browser dashboard. Preserve the existing Inter typography, blue accent, light/dark themes, compact controls, and chart-first hierarchy unless a feature explicitly changes them.

## Responsive layout

- The dashboard is fluid and uses 100% of the browser width. Do not restore a fixed page-level maximum width.
- Sections provide their own horizontal gutters: 24–28px on desktop and 16px at widths up to 640px.
- Charts fill their section width and redraw from their rendered width after a browser resize.
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

## Analytics date range

- Keep all six presets immediately visible above the charts in this order: **Last 1 month**, **3 mo**, **6 mo**, **1 yr**, **3 yr**, and **all time**.
- Activate **6 mo** on every dashboard load. Exactly one preset must expose a visible active state and `aria-pressed="true"`.
- Use compact native buttons with a clear keyboard focus ring. The group wraps at narrow widths rather than becoming a dropdown or creating horizontal page overflow.
- Date-range changes update the existing cached analytics immediately. They do not hide or delete older Match History records.

## Master Calendar

- Show exactly six chronological calendar-month blocks: the current month and the previous five months. Keep this window independent from the graph date preset.
- Use three columns on wide screens, two on medium screens, and one at widths up to 640px. Day cells and match entries must remain inside their month block without page-level overflow.
- Display the match name plus division and score when space allows. Preserve the full date, identity, division, and score in each entry's accessible name.
- Calendar entries are native buttons that move keyboard focus to the corresponding Match History row. The destination receives a short, restrained highlight.
- Empty months retain their complete calendar grid. If the whole window is empty, state that clearly without hiding the month blocks.
