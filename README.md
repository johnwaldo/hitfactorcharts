# Hit Factor Charts

A Chrome extension that pulls your USPSA match results from PractiScore and displays them as interactive charts — score over time, placement, classifier tracking, and per-stage breakdowns — all inside your browser, with no server or API key required.

![Hit Factor Charts](/screenshots/top.png?raw=true "Hit Factor Charts — Score Over Time")

![Hit Factor Charts — Analytics](/screenshots/bottom.png?raw=true "Hit Factor Charts — Full Analytics Suite")

*Screenshots taken at v1.5.5. Current version is v1.6.2.*

---

## Features

- **Score over time** — match percentage plotted chronologically with USPSA classification bands (GM / M / A / B / C / D); Y-axis warped so higher classes get proportional visual space
- **Placement chart** — finish position at each match, normalized to field size
- **Per-stage breakdown** — expand any match row to see hits, HF, and percentage for every stage; classifier stages show official USPSA % (vs national reference HF) as the primary number; individual stages can be excluded from ratings with an optional note
- **Division-aware** — automatically detects which division you shot in each match and shows division-specific results
- **Field-strength adjusted %** — for non-classifier stages, finds the strongest competitor across all divisions at each match (GM median HF preferred, then Master, then top HF), translates their score to your division's scale using hitfactor.info HHF ratios, and measures you against that benchmark — a more reliable indicator of improvement than raw division % when your division draw varies
- **Chart summaries** — automatic plain-English insight below each chart: score trend (last 3 vs baseline), adjusted % context, placement percentile, and classifier trend using the national HHF reference
- **Classifier tracking** — overlay of your classifier scores against your running average; identifies each CM by number and links to the USPSA stage description PDF
- **Consistency card** — match-to-match score variance and accuracy loss metrics
- **Accuracy trend** — hit factor breakdown over time (A/C/D/M/NS/P)
- **Match type detection** — identifies USPSA, IDPA, IPSC, Steel Challenge, 3-Gun, PCSL, ICORE matches; non-USPSA matches are shown in history but excluded from charts
- **Filter matches** — checkboxes let you include or exclude individual matches from charts without deleting them
- **Filter by year or custom date range** — year dropdown includes a "Custom Range…" option with from/to date pickers
- **Export as image** — save any match or individual stage as a PNG card (floppy-disk button on each match row)
- **Export as CSV** — download all chart-visible data as a flat CSV (one row per stage) including CM numbers, USPSA %, HF, and hit counts
- **Light/dark theme** — defaults to light mode; toggle in the header; preference syncs across devices via Chrome storage
- **Inter font** — bundled variable font for clean, consistent rendering at all weights
- **Local caching** — match data is cached in browser storage; individual matches can be refreshed on demand
- **No external server** — everything runs locally in your browser using your existing PractiScore login session

---

## Understanding Division % vs Adjusted %

**Division %** is your score relative to the top shooter in your division at that match. It tells you how you placed that day, but it only reflects who happened to show up in your division — if no GM competed in your division, even a mediocre performance can read as 90%+.

**Adjusted %** is a field-strength correction for non-classifier stages, calculated in two steps:

1. **Own division first** — if a GM or Master competed in your division at that match, their median hit factor is used as the reference directly. No cross-division math needed; you're measured against the actual elite competition that was present.

2. **Cross-division fallback** — if no GM or Master competed in your division, the extension finds the strongest competitor across all other divisions (GM median preferred, then Master, then top HF), translates their hit factor to your division's equivalent using national HHF ratios from [hitfactor.info](https://hitfactor.info), and uses that as the reference. This corrects for weak-field matches where winning your division by default would otherwise inflate the score.

A 75% adjusted score means you performed at solid A-class level against the strongest competition at that match — whether they were in your division or another. Adjusted % is the better indicator of actual improvement over time because it accounts for who actually showed up, not just who showed up in your specific division. Classifier stages are excluded from adjusted % because official classifier percentages are already normalized against USPSA national division data.

---

## Requirements

- Google Chrome (or any Chromium-based browser that supports Manifest V3 extensions)
- A [PractiScore](https://practiscore.com) account with match history

---

## Installation

Chrome does not allow side-loading extensions from a zip file directly, so you load the extension folder manually. This takes about 30 seconds.

### 1 — Download the extension

**Option A — Download a release (recommended)**

1. Go to the [Releases page](https://github.com/johnwaldo/hitfactorcharts/releases)
2. Download the latest `HitFactorCharts.zip`
3. Unzip the archive anywhere on your computer

**Option B — Clone the repo**

```bash
git clone https://github.com/johnwaldo/hitfactorcharts.git
```

### 2 — Open Chrome Extensions

Navigate to `chrome://extensions` in your browser, or:

- Open Chrome menu → **More tools** → **Extensions**

### 3 — Enable Developer Mode

In the top-right corner of the Extensions page, toggle on **Developer mode**.

### 4 — Load the extension

1. Click **Load unpacked**
2. Navigate to the unzipped folder — if you used Option A (release ZIP), select the top-level unzipped folder; if you used Option B (cloned repo), select the `extension/` subfolder (the one containing `manifest.json`)
3. Click **Select Folder**

The Hit Factor Charts icon will appear in your Chrome toolbar. Pin it for easy access via the puzzle-piece menu.

---

## Usage

1. **Log in to PractiScore** — visit [practiscore.com](https://practiscore.com) and sign in normally. The extension uses your existing browser session.

2. **Open Hit Factor Charts** — click the Hit Factor Charts icon in the toolbar. The dashboard opens in a new tab.

3. **Enter your member number and/or name** — type your USPSA member number (e.g. `A12345`) and/or your name as it appears on result sheets (e.g. `Smith, Jane`). At least one is required; providing both improves match accuracy.

4. **Click Fetch Scores** — the extension navigates to your PractiScore history, opens each match's results page, selects your division, and records your score. Progress is shown in the status bar.

5. **Explore your data** — the summary bar shows matches found, average %, best %, field-strength adjusted average, and your USPSA classification. The **Scored Matches / All Matches** toggle below the cards switches between member-number lookup results and all name-matched results.

### Reading the chart summaries

Below the Score Over Time and Placement charts, plain-English summaries show:

- **Score trend** — your last 3 matches averaged vs your prior baseline, with direction
- **Adjusted % context** — whether your adjusted average runs above or below your raw division average, and what that means about field strength
- **Placement** — your average finishing percentile in your division, with trend
- **Classifier trend** — your recent classifier average vs prior, using the national HHF reference (the only stage-level metric that is directly comparable across different matches and courses)

Summaries appear automatically once enough data is loaded. Classifier trend requires at least 6 classifier stages.

### Filtering by date

Click the **All Time** pill above the chart to filter by year, or choose **Custom Range…** at the bottom of the dropdown to enter exact from/to dates. The filter applies to charts, stats, and CSV exports.

### Exporting data

**As image:** Click the floppy-disk icon on any match row to open the export menu. Choose **Full Match** for a match summary card or any individual stage for a per-stage card. Both download as PNG at 2× resolution.

**As CSV:** Click **⤓ CSV** in the chart section header to download all currently visible match data as a spreadsheet. One row per stage, includes match name, division, class, overall %, div %, placement, stage HF, time, hit counts (A/C/D/M/NS/P), classifier number, and official USPSA %.

### Filtering matches

Each USPSA match row has a checkbox. Uncheck a match to exclude it from charts without deleting it.

### Filtering stages

Expand a match row to manage individual stages. Each stage is selected by default. Uncheck **Factor**, optionally add a note such as “gun broke,” then click **Apply stage filters** to omit that stage from match performance, adjusted %, accuracy, and hit-zone aggregates while keeping it visible in the history table.

### Refreshing a single match

Each match row has a refresh button (↻). Click it to re-fetch just that match without re-scraping your entire history.

### Deleting a match

Click the delete button (✕) on a match row to permanently remove it from history and cache.

### Clearing all data

Use the **⚠ Clear All Data** button in the header to wipe all cached scores from browser storage and start fresh.

---

## Privacy

- No data ever leaves your browser. All scraping happens locally via Chrome's tab and scripting APIs.
- Your PractiScore credentials are never accessed by the extension — it only uses your existing login session cookies.
- Match data is stored in `chrome.storage.local` on your device only.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "No score data found" | Make sure you are logged in to PractiScore, then click Fetch Scores again |
| Scores show 0% or wrong division | Your name in the Name field must match the result sheet exactly (e.g. `Doe, John`) |
| Extension doesn't appear | Confirm Developer Mode is on and you loaded the `extension/` subfolder, not the repo root |
| Match list is empty | Visit [practiscore.com/associate/step2](https://practiscore.com/associate/step2) while logged in to verify your history is accessible |
| Charts show wrong colors | If upgrading from v1.4 or earlier, clear all data and re-fetch |

---

## Building a release ZIP

A helper script is included to package the extension for distribution:

```bash
./build.sh
```

This creates `dist/HitFactorCharts.zip` containing only the extension files, ready to share or submit to the Chrome Web Store.

---

## Project structure

```
extension/          ← Load this folder in Chrome
  manifest.json
  background.js     ← Service worker: scraping and fetch logic
  dashboard.html    ← Dashboard UI
  dashboard.js      ← Charts, analytics, summaries, and UI logic
  fonts/
    Inter-Variable.woff2  ← Bundled Inter variable font (latin, 100–900)
  icons/
    icon16.png
    icon48.png
    icon128.png
build.sh            ← Packages extension/ into dist/HitFactorCharts.zip
```
