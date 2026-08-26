# Hit Factor Charts Design

## Product UI

Hit Factor Charts is a data-dense browser dashboard. Preserve the existing Inter typography, blue accent, light/dark themes, compact controls, and chart-first hierarchy unless a feature explicitly changes them.

## Responsive layout

- The dashboard is fluid and uses 100% of the browser width. Do not restore a fixed page-level maximum width.
- Sections provide their own horizontal gutters: 24–28px on desktop and 16px at widths up to 640px.
- Charts fill their section width and redraw from their rendered width after a browser resize.
- Summary cards and controls wrap rather than forcing page-level horizontal scrolling.
- Wide layouts should use the available charting space; constrain individual text or control elements only when readability requires it.
- Stage tables may scroll within their existing panel on narrow screens, but the page itself must not acquire unintended horizontal overflow.

## Interaction and accessibility

- Preserve visible keyboard focus and keyboard access for every control.
- Do not rely on hover for required actions or information.
- Keep motion restrained in this analytical interface; resizing and filtering should feel immediate rather than animated.
- Verify layout changes in both themes at approximately 375px, 1920px, and 2560px viewport widths.
