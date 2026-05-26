// dashboard.js

// ── Global state (declared first to avoid TDZ in event handlers below) ────────
let allResults = [];

// ── Size canvases to fill their containers ────────────────────────────────────
function sizeCanvases() {
  document.querySelectorAll('canvas').forEach(c => {
    const w = c.parentElement?.offsetWidth || 860;
    if (c.width !== w) c.width = w;
  });
}
window.addEventListener('resize', () => { sizeCanvases(); renderAll(); });
document.addEventListener('DOMContentLoaded', sizeCanvases);

// ── Version display ───────────────────────────────────────────────────────────
document.getElementById('headerVersion').textContent = 'v' + chrome.runtime.getManifest().version;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const memberInput  = document.getElementById('memberInput');
const nameInput    = document.getElementById('nameInput');
const fetchBtn     = document.getElementById('fetchBtn');
const editBtn      = document.getElementById('editBtn');
const saveBtn      = document.getElementById('saveBtn');
const cancelBtn    = document.getElementById('cancelBtn');
const statusEl     = document.getElementById('status');
const summaryBar   = document.getElementById('summaryBar');
const noDataEl     = document.getElementById('noData');
const chartsEl     = document.getElementById('charts');
const debugLogEl   = document.getElementById('debugLog');
const matchHistory = document.getElementById('matchHistory');
const matchRowsEl  = document.getElementById('matchRows');
const tooltipEl    = document.getElementById('tooltip');

// ── Update check ─────────────────────────────────────────────────────────────
const RELEASES_API      = 'https://api.github.com/repos/johnwaldo/hitfactorcharts/releases/latest';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // re-check at most every 4 hours

function parseVersion(v) {
  return (v || '').replace(/^v/, '').split('.').map(Number);
}

function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Escape HTML special characters to prevent XSS when inserting untrusted text into innerHTML
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function checkForUpdate() {
  // Don't show banner if user dismissed this version already
  const { updateCheck, updateDismissed } = await chrome.storage.local.get(['updateCheck', 'updateDismissed']);
  const now = Date.now();

  // Use cached result if fresh enough
  if (updateCheck && (now - updateCheck.checkedAt) < CHECK_INTERVAL_MS) {
    if (updateCheck.latestVersion && updateCheck.zipUrl &&
        updateDismissed !== updateCheck.latestVersion) {
      showUpdateBanner(updateCheck.latestVersion, updateCheck.zipUrl, updateCheck.releasePageUrl, updateCheck.releaseNotes || '');
    }
    return;
  }

  try {
    const res = await fetch(RELEASES_API);
    if (!res.ok) return;
    const data = await res.json();
    const latestVersion = (data.tag_name || '').replace(/^v/, '');

    // Sanitize release page URL — must be github.com
    const rawPageUrl   = data.html_url || '';
    const releasePageUrl = /^https:\/\/github\.com\//.test(rawPageUrl)
      ? rawPageUrl
      : 'https://github.com/johnwaldo/hitfactorcharts/releases/latest';

    // Find the ZIP asset — prefer pscharts-*.zip, fall back to any .zip
    const assets  = Array.isArray(data.assets) ? data.assets : [];
    const zipAsset = assets.find(a => /hitfactorcharts.*\.zip$/i.test(a.name) || /\.zip$/i.test(a.name))
                  || assets.find(a => /\.zip$/i.test(a.name));
    // Sanitize asset download URL — must be github.com or objects.githubusercontent.com
    const rawZip  = zipAsset?.browser_download_url || '';
    const zipUrl  = /^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(rawZip)
      ? rawZip
      : releasePageUrl; // fall back to release page if no ZIP attached

    const releaseNotes = (data.body || '').trim();

    await chrome.storage.local.set({
      updateCheck: { latestVersion, zipUrl, releasePageUrl, releaseNotes, checkedAt: now },
    });

    if (updateDismissed !== latestVersion) {
      showUpdateBanner(latestVersion, zipUrl, releasePageUrl, releaseNotes);
    }
  } catch (_) {}
}

function showUpdateBanner(latestVersion, zipUrl, releasePageUrl, releaseNotes) {
  const currentVersion = chrome.runtime.getManifest().version;
  if (!isNewer(latestVersion, currentVersion)) return;

  // Wire up version badge
  document.getElementById('updateVersionBadge').textContent = `v${escHtml(latestVersion)}`;

  // Wire up download button — points to ZIP if available, release page otherwise
  const dlBtn = document.getElementById('updateDownloadBtn');
  dlBtn.href = escHtml(zipUrl);

  // If the URL is the release page (no ZIP asset), update button label
  if (zipUrl === releasePageUrl) {
    dlBtn.textContent = '↗ View release';
  }

  // Release notes toggle
  const notesWrap = document.getElementById('updateNotesWrap');
  const notesEl   = document.getElementById('updateBannerNotes');
  const toggleBtn = document.getElementById('updateNotesToggle');
  if (releaseNotes) {
    notesWrap.style.display = '';
    notesEl.textContent = releaseNotes;
    toggleBtn.addEventListener('click', () => {
      const open = notesEl.classList.toggle('open');
      toggleBtn.textContent = open ? "What's new ▴" : "What's new ▾";
    });
  }

  // Dismiss button — stores the version so banner stays gone until next release
  document.getElementById('updateDismissBtn').addEventListener('click', () => {
    chrome.storage.local.set({ updateDismissed: latestVersion });
    document.getElementById('updateBanner').classList.remove('visible');
  });

  document.getElementById('updateBanner').classList.add('visible');
}

checkForUpdate();

// ── Theme toggle ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '\u263E' : '\u2606'; // moon / sun
}

// Restore saved theme (check sync first, then local)
chrome.storage.sync.get(['theme'], syncData => {
  const theme = syncData.theme || 'light';
  applyTheme(theme);
  // Also save to local for fast restore
  chrome.storage.local.set({ theme });
});

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
  chrome.storage.sync.set({ theme: next });
  // Redraw charts with new theme colors
  renderAll();
});

// ── Credential sync backup ────────────────────────────────────────────────────
// On save, back up member number + name to chrome.storage.sync so they survive
// extension reinstalls. On load, restore from sync if local is empty.
async function syncCredentials(memberNumber, name) {
  try {
    await chrome.storage.sync.set({ memberNumber, name });
  } catch (_) {} // sync may fail if quota exceeded or offline — non-critical
}

async function restoreFromSync() {
  try {
    const local = await chrome.storage.local.get(['memberNumber', 'name']);
    if (local.memberNumber || local.name) return; // local has data, no need to restore
    const sync = await chrome.storage.sync.get(['memberNumber', 'name']);
    if (sync.memberNumber || sync.name) {
      // Restore from sync to local
      await chrome.storage.local.set({
        memberNumber: sync.memberNumber || '',
        name: sync.name || '',
      });
      if (sync.memberNumber) memberInput.value = sync.memberNumber;
      if (sync.name) nameInput.value = sync.name;
      lockInputs();
    }
  } catch (_) {}
}

// ── Module state ──────────────────────────────────────────────────────────────
// allResults declared at top of file to prevent TDZ in early event handlers
let currentView      = 'ranked'; // 'ranked' | 'all'
let deselectedMatches = new Set(); // match IDs manually excluded from charts
let selectedDiv       = null;     // division filter for stats + charts (null = All)
let selectedYear      = null;     // year filter for charts (null = All Time)
let selectedDateRange = null;    // custom range { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } or null
let classificationData = null;  // data from uspsa.org/classification/[memberNumber]
let classifiersOnly  = false;   // when true, charts show only classifier stage scores

const NON_USPSA_TYPES = new Set(['IDPA', 'IPSC', 'Steel Challenge', '3-Gun', 'PCSL', 'ICORE', 'SCSA']);
// Confirmed USPSA types — only these count toward the USPSA match total in the status line.
// 'Unknown' and 'Hit Factor' are unconfirmed and shown separately.
const CONFIRMED_USPSA_TYPES = new Set(['USPSA', 'Hit Factor']);
function isLikelyUSPSA(matchType) { return !NON_USPSA_TYPES.has(matchType); }
function isConfirmedUSPSA(matchType) { return CONFIRMED_USPSA_TYPES.has(matchType); }

function isChartable(r) {
  return isLikelyUSPSA(r.match_type || 'Unknown');
}

// ── Cross-division HHF normalization (field-strength adjustment) ──────────────
// Factors derived from hitfactor.info March 2025 USPSA HHFs.
// Usage: source_hf * DIVISION_FACTORS[your_division][source_division] = your-division-equivalent HF
// Keys use hitfactor.info short names (opn, ltd, co, lo, etc.)
const DIVISION_FACTORS = {
  opn:  { opn: 1.0000, ltd: 1.1448, l10: 1.0739, prod: 1.1839, rev: 1.4776, ss: 1.1931, co: 1.1085, pcc: 0.9883, lo: 1.0971 },
  ltd:  { opn: 0.8735, ltd: 1.0000, l10: 0.9406, prod: 1.0345, rev: 1.2641, ss: 1.0276, co: 0.9668, pcc: 0.8554, lo: 0.9573 },
  l10:  { opn: 0.9312, ltd: 1.0631, l10: 1.0000, prod: 1.0942, rev: 1.3429, ss: 1.1013, co: 1.0335, pcc: 0.9026, lo: 1.0259 },
  prod: { opn: 0.8446, ltd: 0.9667, l10: 0.9139, prod: 1.0000, rev: 1.2433, ss: 1.0077, co: 0.9409, pcc: 0.8225, lo: 0.9276 },
  rev:  { opn: 0.6768, ltd: 0.7911, l10: 0.7446, prod: 0.8043, rev: 1.0000, ss: 0.8162, co: 0.7676, pcc: 0.6583, lo: 0.7529 },
  ss:   { opn: 0.8382, ltd: 0.9732, l10: 0.9080, prod: 0.9923, rev: 1.2252, ss: 1.0000, co: 0.9319, pcc: 0.8078, lo: 0.9170 },
  co:   { opn: 0.9021, ltd: 1.0343, l10: 0.9676, prod: 1.0628, rev: 1.3027, ss: 1.0731, co: 1.0000, pcc: 0.9032, lo: 0.9922 },
  pcc:  { opn: 1.0118, ltd: 1.1690, l10: 1.1079, prod: 1.2158, rev: 1.5191, ss: 1.2379, co: 1.1071, pcc: 1.0000, lo: 1.1053 },
  lo:   { opn: 0.9115, ltd: 1.0446, l10: 0.9748, prod: 1.0781, rev: 1.3282, ss: 1.0905, co: 1.0079, pcc: 0.9047, lo: 1.0000 },
};

// Map PractiScore division abbreviations (from results tables) to hitfactor.info short names
const PS_DIV_TO_HFI = {
  CO: 'co', L: 'ltd', LTD: 'ltd', LO: 'lo', O: 'opn', OPN: 'opn',
  PCC: 'pcc', REV: 'rev', SS: 'ss', P: 'prod', PROD: 'prod', L10: 'l10',
  // Full names (from combined view)
  CARRYOPTICS: 'co', LIMITED: 'ltd', LIMITEDOPTICS: 'lo', OPEN: 'opn',
  PRODUCTION: 'prod', REVOLVER: 'rev', SINGLESTACK: 'ss',
};

// Convert a PractiScore division string to hitfactor.info key
function psDivToHfi(psDiv) {
  if (!psDiv) return null;
  const key = psDiv.trim().toUpperCase().replace(/[\s\-]+/g, '');
  return PS_DIV_TO_HFI[key] || key.toLowerCase();
}

// Compute field-strength-adjusted stage percentage.
// Classifier stages are intentionally skipped: official classifier percentages
// are already normalized against USPSA national division data, so applying this
// match-field adjustment would double-normalize them.
//
// Two-pass strategy:
//   Pass 1 — own division first. If the shooter's division has a GM or M median
//             HF on this stage, use it directly (factor = 1.0, no normalization
//             error). This is the most accurate reference: an actual classified
//             competitor in the shooter's division who was standing at the same
//             match. Cross-division normalization should never override a real
//             own-division benchmark — the national HHF factors are averages and
//             will systematically inflate or deflate the reference when the actual
//             GM present is above or below the national mean.
//
//   Pass 2 — cross-division fallback. Only used when the shooter's division has
//             no GM or M class benchmark (i.e. no elite competitor was present).
//             Finds the highest reference across other divisions and normalizes it
//             to the shooter's division using DIVISION_FACTORS (hitfactor.info
//             March 2025 national HHFs). This corrects for weak-field matches.
//
// Returns { adjPct, adjClass, refDiv, refClass, refHF, normHF, method } or null.
function computeAdjustedPct(stage, shooterDiv) {
  if (isClassifierStage(stage)) return null;
  if (!stage.hf || stage.hf <= 0) return null;

  const myDivKey = psDivToHfi(shooterDiv);
  if (!myDivKey || !DIVISION_FACTORS[myDivKey]) return null;

  const benchmarks = stage.xdiv_benchmarks;
  if (!benchmarks) return null;

  // ── Pass 1: own-division GM or M ─────────────────────────────────────────
  // Find the benchmark entry whose division key matches the shooter's division.
  for (const [psDiv, bench] of Object.entries(benchmarks)) {
    if (psDivToHfi(psDiv) !== myDivKey) continue;
    // Prefer GM median; fall back to M median.
    const ref    = bench.gmMedian || bench.mMedian;
    const cls    = bench.gmMedian ? 'GM' : 'M';
    const method = bench.gmMedian ? 'gm_median' : 'm_median';
    if (!ref || ref <= 0) break; // own division found but no GM/M — go to pass 2
    const adjPct = (stage.hf / ref) * 100;
    return {
      adjPct:   Math.min(adjPct, 120),
      adjClass: classLetterForPct(adjPct),
      refDiv:   psDiv,
      refClass: cls,
      refHF:    ref,
      normHF:   ref,
      method,
    };
  }

  // ── Pass 2: cross-division fallback ───────────────────────────────────────
  // No GM or M in shooter's division. Estimate from other divisions using
  // national HHF ratio factors. Takes the highest normalized reference found.
  let bestNormalizedRef = 0;
  let bestRefDiv = null;
  let bestRefClass = null;
  let bestRefHF = null;
  let bestMethod = null;

  for (const [psDiv, bench] of Object.entries(benchmarks)) {
    const srcDivKey = psDivToHfi(psDiv);
    if (!srcDivKey || srcDivKey === myDivKey) continue; // own div already checked
    const factor = DIVISION_FACTORS[myDivKey]?.[srcDivKey];
    if (!factor) continue;

    const candidates = [
      { hf: bench.gmMedian, cls: 'GM', method: 'gm_median' },
      { hf: bench.mMedian,  cls: 'M',  method: 'm_median'  },
      { hf: bench.topHF,    cls: bench.topClass || '?', method: 'top_hf' },
    ];

    for (const cand of candidates) {
      if (!cand.hf || cand.hf <= 0) continue;
      const normalized = cand.hf * factor;
      if (normalized > bestNormalizedRef) {
        bestNormalizedRef = normalized;
        bestRefDiv        = psDiv;
        bestRefClass      = cand.cls;
        bestRefHF         = cand.hf;
        bestMethod        = cand.method;
      }
    }
  }

  if (bestNormalizedRef <= 0) return null;

  const adjPct = (stage.hf / bestNormalizedRef) * 100;
  return {
    adjPct:   Math.min(adjPct, 120),
    adjClass: classLetterForPct(adjPct),
    refDiv:   bestRefDiv,
    refClass: bestRefClass,
    refHF:    bestRefHF,
    normHF:   bestNormalizedRef,
    method:   bestMethod,
  };
}

// Return USPSA classification letter for a given percentage
function classLetterForPct(pct) {
  if (pct >= 95) return 'GM';
  if (pct >= 85) return 'M';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 40) return 'C';
  if (pct >= 2)  return 'D';
  return 'U';
}

// ── USPSA Classifier lookup ───────────────────────────────────────────────────
// Maps classifier number (e.g. "99-11") → official name.
// isClassifierStage() checks this table first, then falls back to regex for
// any number matching the XX-YY pattern (covers new/unlisted classifiers).
const USPSA_CLASSIFIERS = new Map([
  // 99-series
  ['99-01', 'Back to Basics Standards'],
  ['99-02', 'Night Moves'],
  ['99-03', 'Celeritas and Diligentia'],
  ['99-04', 'American Standard'],
  ['99-05', 'Mob Job'],
  ['99-06', 'Toe The Line'],
  ['99-07', 'Both Sides Now #1'],
  ['99-08', 'Melody Line'],
  ['99-09', 'Long Range Standards'],
  ['99-10', 'Times Two'],
  ['99-11', 'El Presidente'],
  ['99-12', 'Take Your Choice'],
  ['99-13', 'Quicky II'],
  ['99-14', 'Hoser Heaven'],
  ['99-15', 'Diligentia and Celeritas'],
  ['99-16', 'Both Sides Now #2'],
  ['99-17', "It's All in the Upper Zone"],
  ['99-18', 'You Snooze, You Lose'],
  ['99-19', "Payne's Pain"],
  ['99-20', 'Fish House Encounter'],
  ['99-21', 'Mini Mart'],
  ['99-22', 'Nueve El Presidente'],
  ['99-23', 'Front Sight'],
  ['99-24', 'Front Sight 2'],
  ['99-27', "Lefty's Revenge"],
  ['99-28', 'Hillbillton Drill'],
  ['99-29', 'Near to Far Standards'],
  ['99-30', 'Man Down'],
  // 03-series
  ['03-02', 'Six Chickens'],
  ['03-03', 'Take Em Down'],
  ['03-04', '3-V'],
  ['03-05', 'Paper Poppers'],
  ['03-07', 'Riverdale Standards'],
  ['03-08', 'Madness'],
  ['03-09', 'On the Move'],
  ['03-10', 'Area 5 Standards'],
  ['03-11', 'El Strong & Weak Pres'],
  ['03-12', 'Ironsides'],
  ['03-14', 'Baseball Standards'],
  ['03-18', 'High Standards'],
  // 06-series
  ['06-01', 'Big Barricade'],
  // 08-series
  ['08-01', '4 Bill Drill'],
  // 09-series
  ['09-01', 'Six in Six Challenge'],
  ['09-02', 'Diamond Cutter'],
  ['09-03', 'Oh No'],
  ['09-04', 'Pucker Factor'],
  ['09-05', 'Quad Standards'],
  ['09-06', 'Quad Standards 2'],
  ['09-07', "It's Not Brain Surgery"],
  ['09-08', 'Crackerjack'],
  ['09-09', 'Lightning and Thunder'],
  ['09-10', "Life's Little Problems"],
  // 13-series
  ['13-01', 'Disaster Factor'],
  ['13-02', 'Down the Middle'],
  ['13-03', 'Short Sprint Standards'],
  ['13-04', 'The Roscoe Rattle'],
  ['13-05', 'Tick Tock'],
  ['13-06', 'Too Close for Comfort'],
  ['13-07', 'Double Deal 2'],
  ['13-08', 'More Disaster Factor'],
  ['13-09', 'Window Pain'],
  // 18-series
  ['18-01', 'Of Course It Did'],
  ['18-02', 'What Is With You People'],
  ['18-03', 'We Play Games'],
  ['18-04', "Didn't You Send the Mailman"],
  ['18-05', 'No Need to Believe in Either Side'],
  ['18-06', 'For That Day'],
  ['18-07', 'Someone Is Always Willing to Pay'],
  ['18-08', 'The Condor'],
  ['18-09', 'I Miss That Kind of Clarity'],
  // 19-series
  ['19-01', 'HI-Jinx'],
  ['19-02', 'HI-Way Robbery'],
  ['19-03', "HI'er Love"],
  ['19-04', 'HI Cost of Living'],
  // 20-series
  ['20-01', 'Wish You Were Here'],
  ['20-02', 'Deja Vu'],
  ['20-03', 'Deja Vu All Over Again'],
  // 21-series
  ['21-01', '8 x 3 Trigger Freeze'],
  // 22-series
  ['22-01', 'Righty Tighty'],
  ['22-02', 'Lefty Loosey'],
  // 23-series
  ['23-01', 'THS Short Course'],
  ['23-02', 'This Could Be the Greatest Night of Our Lives'],
  // 24-series
  ['24-01', 'Can You Strong and Weak Hand?'],
  ['24-02', 'This Is More Better Now'],
  ['24-03', 'One Box at a Time'],
  ['24-04', 'The Thrill of the Bill Drill'],
  ['24-05', 'Little Bit of Everything'],
  ['24-06', "Surely You Can't Be Serious"],
  ['24-07', 'The Near to Far Drill'],
  ['24-08', 'And Now for Something Completely Different'],
  // 25-series
  ['25-01', 'Return to Monke'],
  ['25-02', 'Look at Me I Am the Captain Now'],
  ['25-03', 'Let Him Cook'],
  ['25-04', 'We Did Our Homework'],
  ['25-05', "It's All Part of the Plan"],
  ['25-06', 'They All Count'],
  ['25-07', 'Absolute Cinema'],
  ['25-08', 'We Lost Hero or Zero'],
  ['25-09', 'Descent Into Madness'],
]);

// Strips leading "Stage N" / "Stage N:" / "Stage N -" prefix from cached stage names.
// PractiScore sometimes includes the prefix in the option text; background.js now strips
// it on fresh fetches but cached data may still carry it.
function normalizeStgName(name) {
  return (name || '').replace(/^stage\s*\d+\s*[:\-–]?\s*/i, '').trim() || name || '';
}

// Returns { number, name } if the stage is a known classifier, or null if not.
// Checks stored match_def fields first (authoritative), then falls back to name pattern matching.
function isClassifierStage(stage) {
  // Accept either a stage object or a bare name string (backwards compat)
  const stageName = typeof stage === 'string' ? stage : (stage?.name ?? '');

  // 1. Authoritative: match_def.json told us explicitly
  if (typeof stage === 'object' && stage !== null) {
    if (stage.is_classifier === true || stage.classifier_code) {
      const code = stage.classifier_code || null;
      const name = code ? (USPSA_CLASSIFIERS.get(code) ?? null) : null;
      return { number: code, name };
    }
    if (stage.is_classifier === false) return null;  // explicitly not a classifier
  }

  // 2. Fallback: extract XX-YY pattern from stage name
  const m = stageName.match(/\b(\d{2}-\d{2})\b/);
  if (!m) return null;
  const num  = m[1];
  const name = USPSA_CLASSIFIERS.get(num) ?? null;
  if (name != null) return { number: num, name };
  if (/\bCM\b/i.test(stageName)) return { number: num, name: null };
  return null;
}

// Normalize USPSA date "M/D/YY" or "MM/DD/YYYY" → "YYYY-MM" for comparison
function normalizeUSPSADate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${year}-${m[1].padStart(2, '0')}`;
}

// Cross-reference allResults stages against USPSA.org classifier records.
// Annotates stages with is_classifier / classifier_code when a match is found by
// HF value (exact to 3 decimal places) + month of match date.
function crossReferenceClassifiers(results, clfData) {
  if (!clfData?.classifiers?.length) return results;
  return results.map(r => {
    if (!r.stages?.length) return r;
    const stages = r.stages.map(s => {
      if (s.is_classifier) return s; // already identified by match_def.json
      const clf = clfData.classifiers.find(c => {
        if (!c.hf || !s.hf) return false;
        const cDate = normalizeUSPSADate(c.date);
        const rDate = r.date ? r.date.slice(0, 7) : null;
        if (!cDate || !rDate || cDate !== rDate) return false;
        return Math.abs(c.hf - s.hf) < 0.001;
      });
      if (!clf) return s;
      return { ...s, is_classifier: true, classifier_code: clf.code || null,
               clf_pct: clf.pct || null }; // official USPSA % (vs national reference HF)
    });
    return { ...r, stages };
  });
}

function saveDeselected() {
  chrome.storage.local.set({ deselectedMatches: [...deselectedMatches] });
}

// ── Input lock / edit ─────────────────────────────────────────────────────────
let _editSnapshot = { member: '', name: '' }; // values before edit started

function lockInputs() {
  memberInput.disabled = true;
  nameInput.disabled   = true;
  editBtn.style.display   = 'inline-block';
  saveBtn.style.display   = 'none';
  cancelBtn.style.display = 'none';
  fetchBtn.style.display  = 'inline-block';
}

function unlockInputs() {
  _editSnapshot = { member: memberInput.value, name: nameInput.value };
  memberInput.disabled = false;
  nameInput.disabled   = false;
  memberInput.focus();
  editBtn.style.display   = 'none';
  saveBtn.style.display   = 'inline-block';
  cancelBtn.style.display = 'inline-block';
  fetchBtn.style.display  = 'none';
}

editBtn.addEventListener('click', unlockInputs);


cancelBtn.addEventListener('click', () => {
  memberInput.value = _editSnapshot.member;
  nameInput.value   = _editSnapshot.name;
  lockInputs();
});

saveBtn.addEventListener('click', async () => {
  const newMember = memberInput.value.trim().toUpperCase();
  const newName   = nameInput.value.trim();

  const changed = newMember !== _editSnapshot.member.toUpperCase() ||
                  newName   !== _editSnapshot.name;

  if (changed) {
    const ok = confirm(
      'Changing your member number or name will clear all cached match data and re-fetch everything.\n\nContinue?'
    );
    if (!ok) {
      memberInput.value = _editSnapshot.member;
      nameInput.value   = _editSnapshot.name;
      lockInputs();
      return;
    }
    // Clear cache and reset UI
    await chrome.storage.local.remove(['matchCache', 'lastMatchList']);
    allResults = [];
    summaryBar.classList.remove('visible');
    chartsEl.classList.remove('visible');
    matchHistory.classList.remove('visible');
    noDataEl.style.display   = 'none';
    debugLogEl.style.display = 'none';
    setStatus('Cache cleared. Click Fetch Scores to reload.', '');
  }

  memberInput.value = newMember;
  chrome.storage.local.set({ memberNumber: newMember, name: newName });
  syncCredentials(newMember, newName);
  lockInputs();
});

// ── Onboarding card ───────────────────────────────────────────────────────────
// Shown only on first run — no saved member number, name, or match history.
// Dismissed automatically when Fetch Scores is clicked.
const onboardingCard = document.getElementById('onboardingCard');

function showOnboarding() {
  onboardingCard.classList.add('visible');
  // Clear the default status hint — the card replaces it
  setStatus('', '');
}

function hideOnboarding() {
  onboardingCard.classList.remove('visible');
}

// ── Restore persisted state on load ──────────────────────────────────────────
chrome.storage.local.get(['memberNumber', 'name', 'lastMatchList', 'matchCache', 'deselectedMatches', 'classificationData'], async d => {
  // Try restoring from sync if local has no credentials (e.g. after reinstall)
  if (!d.memberNumber && !d.name) {
    await restoreFromSync();
    // Re-read local after potential sync restore
    const refreshed = await chrome.storage.local.get(['memberNumber', 'name']);
    if (refreshed.memberNumber) d.memberNumber = refreshed.memberNumber;
    if (refreshed.name) d.name = refreshed.name;
  }

  if (d.memberNumber) memberInput.value = d.memberNumber;
  if (d.name)         nameInput.value   = d.name;
  if (d.deselectedMatches) deselectedMatches = new Set(d.deselectedMatches);

  // Lock inputs if we already have saved credentials
  if (d.memberNumber || d.name) {
    lockInputs();
    // Ensure sync is up to date
    syncCredentials(d.memberNumber || '', d.name || '');
  }

  // Show onboarding only on genuine first run — no credentials and no match history
  if (!d.memberNumber && !d.name && !d.lastMatchList) {
    showOnboarding();
  }

  if (d.lastMatchList) {
    const cache = d.matchCache || {};
    const restored = d.lastMatchList.map(m => ({
      ...m,
      ...(cache[m.match_id] || {}),
      _cached: true,
    }));
    if (restored.length > 0) {
      classificationData = d.classificationData || null;
      allResults = crossReferenceClassifiers(restored, classificationData);
      if (!d.memberNumber) switchView('all');
      renderAll();
      renderMatchList();
      const confirmedRestored  = restored.filter(r => isConfirmedUSPSA(r.match_type || 'Unknown'));
      const unconfirmedRestored = restored.filter(r => isLikelyUSPSA(r.match_type || 'Unknown') && !isConfirmedUSPSA(r.match_type || 'Unknown'));
      const nonUspsaRestored   = restored.filter(r => !isLikelyUSPSA(r.match_type || 'Unknown'));
      const scored    = confirmedRestored.filter(r => r.overall_pct != null).length;
      const uspsa     = confirmedRestored.length;
      const unconfirmedNote = unconfirmedRestored.length > 0 ? ` · ${unconfirmedRestored.length} unconfirmed type` : '';
      const skippedNote     = nonUspsaRestored.length > 0    ? ` · ${nonUspsaRestored.length} non-USPSA excluded` : '';
      setStatus(`Showing cached data — ${scored}/${uspsa} USPSA matches scored.${unconfirmedNote}${skippedNote} Click Fetch Scores to check for new matches.`, 'success');
    }
  }
});

// ── View toggle ───────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const toggleWrap = document.getElementById('classifiersToggleWrap');
  if (view !== 'ranked') {
    classifiersOnly = false;
    document.getElementById('classifiersOnlyChk').checked = false;
    toggleWrap.classList.remove('active');
    toggleWrap.style.display = 'none';
  } else {
    toggleWrap.style.display = 'flex';
  }
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    renderAll();
  });
});

document.getElementById('classifiersOnlyChk').addEventListener('change', e => {
  classifiersOnly = e.target.checked;
  document.getElementById('classifiersToggleWrap').classList.toggle('active', classifiersOnly);
  renderAll();
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  exportChartCSV();
});

// ── Fetch button ──────────────────────────────────────────────────────────────
fetchBtn.addEventListener('click', async () => {
  const memberNumber = memberInput.value.trim().toUpperCase();
  const name         = nameInput.value.trim();
  if (!memberNumber && !name) { setStatus('Please enter your USPSA member number and/or your name.', 'error'); return; }

  // Dismiss onboarding permanently once the user initiates a fetch
  hideOnboarding();

  const noMemberWarningEl = document.getElementById('noMemberWarning');
  if (!memberNumber) {
    noMemberWarningEl.style.display = 'block';
  } else {
    noMemberWarningEl.style.display = 'none';
  }

  // Guard: if credentials differ from what's cached, require going through Save
  const stored = await chrome.storage.local.get(['memberNumber', 'name', 'matchCache', 'lastMatchList']);
  const hasCachedData = stored.matchCache && Object.keys(stored.matchCache).length > 0;
  const credentialsChanged = hasCachedData && (
    memberNumber !== (stored.memberNumber || '').toUpperCase() ||
    name         !== (stored.name || '')
  );
  if (credentialsChanged) {
    const ok = confirm(
      'Your member number or name has changed. This will clear all cached match data and re-fetch everything.\n\nContinue?'
    );
    if (!ok) return;
    await chrome.storage.local.remove(['matchCache', 'lastMatchList']);
    allResults = [];
    summaryBar.classList.remove('visible');
    chartsEl.classList.remove('visible');
    matchHistory.classList.remove('visible');
  }

  chrome.storage.local.set({ memberNumber, name });
  lockInputs();
  setStatus('Opening PractiScore tab…', '', true);
  fetchBtn.disabled = true;
  noDataEl.style.display   = 'none';
  debugLogEl.style.display = 'none';
  allResults = [];

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchScores', memberNumber, name });
    if (!response.ok) throw new Error(response.error || 'Unknown error');
    if (response.data._not_logged_in_ps) {
      document.getElementById('psLoginWarning').style.display = 'block';
      setStatus('Not logged into PractiScore. Please log in and try again.', 'error');
      return;
    }
    document.getElementById('psLoginWarning').style.display = 'none';

    const { results, log } = response.data;

    if (log?.length) {
      debugLogEl.textContent = log.join('\n');
      debugLogEl.style.display = 'block';
    }

    if (!results?.length) {
      noDataEl.style.display = 'block';
      setStatus('No matches found.', 'error');
      return;
    }

    if (response.data.classificationData) {
      classificationData = response.data.classificationData;
    }
    allResults = crossReferenceClassifiers(results, classificationData);

    // Handle login warnings
    const uspsaLoginWarn = document.getElementById('uspsaLoginWarning');
    if (response.data._not_logged_in_uspsa) {
      uspsaLoginWarn.style.display = 'block';
    } else {
      uspsaLoginWarn.style.display = 'none';
    }

    // No member number → name-only results won't appear in "Scored Matches" view; switch automatically
    if (!memberNumber) switchView('all');

    renderAll();
    renderMatchList();
    updateStatusCounts('Loaded');

  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    debugLogEl.textContent = err.stack || err.message;
    debugLogEl.style.display = 'block';
  } finally {
    fetchBtn.disabled = false;
  }
});

// ── Year filter pills ─────────────────────────────────────────────────────────
// ── Year / date-range filter pill ────────────────────────────────────────────
function renderYearFilter(years) {
  const el = document.getElementById('timeFilter');
  el.innerHTML = '';
  if (years.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  const isCustom = !!selectedDateRange;
  const label    = isCustom
    ? `${selectedDateRange.start} – ${selectedDateRange.end}`
    : selectedYear || 'All Time';

  const pill = document.createElement('button');
  pill.className = 'time-btn' + (selectedYear || isCustom ? ' active' : '');
  pill.textContent = label;

  pill.onclick = (e) => {
    e.stopPropagation();
    const existing = el.querySelector('.div-dropdown');
    if (existing) { existing.remove(); return; }

    const dropdown = document.createElement('div');
    dropdown.className = 'div-dropdown';

    // Standard year options
    ['All Time', ...years].forEach(y => {
      const item = document.createElement('div');
      item.className = 'div-dropdown-item' +
        ((y === 'All Time' && !selectedYear && !isCustom) || y === selectedYear ? ' selected' : '');
      item.textContent = y;
      item.onclick = (ev) => {
        ev.stopPropagation();
        selectedYear = y === 'All Time' ? null : y;
        selectedDateRange = null;
        dropdown.remove();
        renderAll();
      };
      dropdown.appendChild(item);
    });

    // Custom range entry
    const customItem = document.createElement('div');
    customItem.className = 'div-dropdown-item' + (isCustom ? ' selected' : '');
    customItem.textContent = 'Custom Range…';
    customItem.onclick = (ev) => {
      ev.stopPropagation();
      if (dropdown.querySelector('.date-range-form')) return;
      const form = document.createElement('div');
      form.className = 'date-range-form';
      form.innerHTML = `
        <label>From</label>
        <input type="date" class="dr-from" value="${selectedDateRange?.start || ''}">
        <label>To</label>
        <input type="date" class="dr-to"   value="${selectedDateRange?.end   || ''}">
        <button class="dr-apply">Apply</button>
      `;
      form.addEventListener('click', ev2 => ev2.stopPropagation());
      form.querySelector('.dr-apply').onclick = () => {
        const start = form.querySelector('.dr-from').value;
        const end   = form.querySelector('.dr-to').value;
        if (start && end && start <= end) {
          selectedDateRange = { start, end };
          selectedYear = null;
          dropdown.remove();
          renderAll();
        }
      };
      dropdown.appendChild(form);
    };
    dropdown.appendChild(customItem);

    el.appendChild(dropdown);
    setTimeout(() => document.addEventListener('click', function close() {
      dropdown.remove();
      document.removeEventListener('click', close);
    }, { once: true }), 0);
  };

  el.appendChild(pill);
}

// ── Render charts + stats ─────────────────────────────────────────────────────
function setPlacementVisible(visible) {
  const el = document.getElementById('chartPlaceSection');
  if (visible) {
    el.style.display = '';
  } else if (el.style.display !== 'none') {
    const h = el.offsetHeight;
    el.style.display = 'none';
    window.scrollBy({ top: -h, behavior: 'instant' });
  }
}

function renderAll() {
  if (!allResults.length) return;

  // Level 2 filter: only chart USPSA/Hit Factor matches (excludes time-scored sports)
  // Also exclude matches the user has manually deselected
  const uspsaBase = allResults.filter(r =>
    isChartable(r) &&
    !deselectedMatches.has(r.match_id)
  );

  // 'ranked' = confirmed by member number, % score required
  // 'all'    = any scored match (% or HF), including HF-only results
  const chartable = currentView === 'ranked'
    ? uspsaBase.filter(r => r.found_by === 'member_number' && r.overall_pct != null)
    : uspsaBase.filter(r => r.overall_pct != null || r.hf != null);

  const sorted = [...chartable].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });

  const placeData = sorted.filter(r => r.place != null);

  summaryBar.classList.add('visible');
  chartsEl.classList.add('visible');
  sizeCanvases();
  document.getElementById('classifiersToggleWrap').style.display = currentView === 'ranked' ? 'flex' : 'none';

  if (sorted.length === 0) {
    const msg = currentView === 'ranked'
      ? 'No member-number confirmed scores.\nSwitch to "All Matches" to see name-matched results.'
      : 'No data.';
    drawMessage(document.getElementById('chartTime'),  msg);
    drawMessage(document.getElementById('chartPlace'), msg);
    document.getElementById('statMatches').textContent = '—';
    document.getElementById('statAvg').textContent     = '—';
    document.getElementById('statBest').textContent    = '—';
    document.getElementById('statDiv').textContent     = '—';
    return;
  }

  const divs = [...new Set(sorted.map(r => r.division).filter(Boolean))];

  // Validate selectedDiv / selectedYear against current data
  if (selectedDiv && !divs.includes(selectedDiv)) selectedDiv = null;
  const years = [...new Set(sorted.map(r => r.date?.slice(0, 4)).filter(Boolean))].sort();
  if (selectedYear && !years.includes(selectedYear)) selectedYear = null;

  // Filter to selected division + year/range for stats + charts
  const viewSorted = sorted.filter(r =>
    (!selectedDiv       || (r.division || 'Unknown') === selectedDiv) &&
    (!selectedYear      || r.date?.startsWith(selectedYear)) &&
    (!selectedDateRange || (r.date >= selectedDateRange.start && r.date <= selectedDateRange.end))
  );

  const avg  = viewSorted.reduce((s, r) => s + (r.overall_pct ?? 0), 0) / (viewSorted.length || 1);
  const best = viewSorted.length ? Math.max(...viewSorted.map(r => r.overall_pct ?? 0)) : 0;

  const avgBand  = CLASS_BANDS.find(b => avg  >= b.min && avg  < b.max);
  const bestBand = CLASS_BANDS.find(b => best >= b.min && best < b.max);

  document.getElementById('statMatches').textContent = viewSorted.length;
  document.getElementById('statAvg').textContent     = avg.toFixed(1) + '%';
  document.getElementById('statAvg').style.color     = avgBand?.text.replace('0.55','1') || '#4a9eff';
  document.getElementById('statBest').textContent    = best.toFixed(1) + '%';
  document.getElementById('statBest').style.color    = bestBand?.text.replace('0.55','1') || '#4a9eff';

  // Stat box tooltips — explain what each metric measures
  const divLabel = selectedDiv ? ` in ${selectedDiv}` : '';
  document.getElementById('statAvgBox').dataset.tip =
    `Your average match score${divLabel}.\n` +
    `Calculated as your points ÷ the match winner's points × 100,\n` +
    `averaged across all checked matches in the current view.`;
  document.getElementById('statBestBox').dataset.tip =
    `Your highest single-match score${divLabel}.\n` +
    `Match score = your points ÷ match winner's points × 100.\n` +
    `Color indicates the USPSA classification band for that score.`;

  // ── Consistency stat card ─────────────────────────────────────────────────
  // Standard deviation of match %. Low stddev = consistent performer.
  // Only shown when ≥3 matches (stddev is meaningless on 1-2 points).
  const consistencyBox = document.getElementById('statConsistencyBox');
  const consistencyVal = document.getElementById('statConsistency');
  const pcts = viewSorted.map(r => r.overall_pct).filter(v => v != null);
  if (pcts.length >= 3) {
    const mean   = pcts.reduce((s, v) => s + v, 0) / pcts.length;
    const stddev = Math.sqrt(pcts.reduce((s, v) => s + (v - mean) ** 2, 0) / pcts.length);
    const cls    = stddev < 5 ? 'consistency-good' : stddev < 10 ? 'consistency-ok' : 'consistency-poor';
    const label  = stddev < 5 ? 'Consistent' : stddev < 10 ? 'Variable' : 'Inconsistent';
    consistencyVal.className = `val ${cls}`;
    consistencyVal.textContent = `±${stddev.toFixed(1)}%`;
    consistencyBox.dataset.tip =
      `How consistent your scores are across matches.\n` +
      `±${stddev.toFixed(1)}% std deviation — ${label}.\n` +
      `< ±5% = consistent, ±5–10% = variable, > ±10% = inconsistent.\n` +
      `High variance means performance swings match-to-match.`;
    consistencyBox.style.display = '';
  } else {
    consistencyBox.style.display = 'none';
  }

  // ── Adjusted average stat card ────────────────────────────────────────────
  // Shows the field-strength-adjusted average % across matches with xdiv data.
  const adjAvgBox = document.getElementById('statAdjAvgBox');
  const adjAvgVal = document.getElementById('statAdjAvg');
  const adjMatchPcts = [];
  for (const r of viewSorted) {
    if (!r.stages?.length || !r.division) continue;
    const adjStages = r.stages
      .map(s => computeAdjustedPct(s, r.division))
      .filter(a => a != null);
    if (!adjStages.length) continue;
    adjMatchPcts.push(adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length);
  }
  if (adjMatchPcts.length >= 1) {
    const adjAvg = adjMatchPcts.reduce((s, v) => s + v, 0) / adjMatchPcts.length;
    const adjBand = CLASS_BANDS.find(b => adjAvg >= b.min && adjAvg < b.max);
    adjAvgVal.textContent = adjAvg.toFixed(1) + '%';
    adjAvgVal.style.color = adjBand?.text.replace('0.55', '1') || '#ff4081';
    const adjAvgLbl = adjAvgBox.querySelector('.lbl');
    if (adjAvgLbl) adjAvgLbl.textContent = adjBand ? `Adj Avg · ${adjBand.label} Class` : 'Adj Avg %';
    adjAvgBox.dataset.tip =
      `Field-strength adjusted average (${adjMatchPcts.length} match${adjMatchPcts.length > 1 ? 'es' : ''}).\n` +
      `Uses non-classifier stages and the best HF from any division at each match,\n` +
      `normalized to your division using HHF ratios from hitfactor.info.\n` +
      `Classifier stages are skipped because USPSA % is already nationally normalized.\n` +
      `This gives a more accurate read when no GM/Master is in your division.\n` +
      `Raw avg: ${avg.toFixed(1)}% → Adjusted: ${adjAvg.toFixed(1)}% (${adjBand?.label || '?'} class)`;
    adjAvgBox.style.display = '';
  } else {
    adjAvgBox.style.display = 'none';
  }

  // Division stat box — opens a dropdown
  const divStatBox = document.getElementById('statDiv').closest('.stat-box');
  const divStatVal = document.getElementById('statDiv');
  // Tooltip on the label — explains the card and the click-to-filter behaviour
  const divLblEl = divStatBox.querySelector('.lbl');
  if (divLblEl) {
    const divTipLines = divs.length > 1
      ? `The division(s) detected in your match history.\nClick to filter all charts and stats to a single division.`
      : `The division you shot in your match history.\nAll charts and stats reflect this division.`;
    divLblEl.title = divTipLines;
  }
  if (divs.length > 0) {
    divStatBox.classList.add('clickable');
    divStatBox.classList.toggle('active-filter', !!selectedDiv);
    divStatVal.textContent = selectedDiv || (divs.length === 1 ? divs[0] : 'All');
    divStatBox.onclick = (e) => {
      e.stopPropagation();
      const existing = divStatBox.querySelector('.div-dropdown');
      if (existing) { existing.remove(); return; }
      const dropdown = document.createElement('div');
      dropdown.className = 'div-dropdown';
      const options = divs.length > 1 ? ['All', ...divs] : divs;
      options.forEach(d => {
        const item = document.createElement('div');
        item.className = 'div-dropdown-item' + ((d === 'All' && !selectedDiv) || d === selectedDiv ? ' selected' : '');
        item.textContent = d;
        item.onclick = (ev) => {
          ev.stopPropagation();
          selectedDiv = d === 'All' ? null : d;
          dropdown.remove();
          renderAll();
        };
        dropdown.appendChild(item);
      });
      divStatBox.appendChild(dropdown);
      setTimeout(() => document.addEventListener('click', function close() {
        dropdown.remove();
        document.removeEventListener('click', close);
      }, { once: true }), 0);
    };
  } else {
    divStatBox.classList.remove('clickable', 'active-filter');
    divStatBox.onclick = null;
    divStatVal.textContent = '—';
  }

  // Year filter pills
  renderYearFilter(years);

  // Official classification stat box (D-GM class from USPSA.org)
  renderClassBox(selectedDiv || (divs.length === 1 ? divs[0] : null));

  const avgLbl = document.querySelector('#statMatches')?.closest('#stats')
    ?.querySelectorAll('.stat-box')[1]?.querySelector('.lbl');

  // ── Classifiers Only mode ────────────────────────────────────────────────────
  if (classifiersOnly) {
    // Collect all classifier stages from viewSorted matches.
    // Use clf_pct (official USPSA %, vs national reference HF) when available;
    // fall back to stage pct from PractiScore (vs match top HF — less accurate).
    const clfPoints = [];
    for (const r of viewSorted) {
      if (!r.stages) continue;
      for (const s of r.stages) {
        const clf = isClassifierStage(s);
        if (!clf) continue;
        const officialPct = s.clf_pct ?? null;
        const displayPct  = officialPct ?? s.pct;
        if (displayPct == null) continue;
        clfPoints.push({
          date: r.date,
          y: displayPct,
          isOfficial: officialPct != null,
          hf: s.hf,
          label: clf.number ? `CM ${clf.number}${clf.name ? ' · ' + clf.name : ''}` : 'Classifier',
          match_name: r.match_name,
          division: r.division || 'Unknown',
          code: clf.number,
          a: s.a, c: s.c, d: s.d, m: s.m, ns: s.ns, p: s.p,
        });
      }
    }

    // Sort chronologically
    clfPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (clfPoints.length === 0) {
      document.getElementById('statMatches').textContent = '0';
      document.getElementById('statAvg').textContent  = '—';
      document.getElementById('statBest').textContent = '—';
      document.getElementById('chartTimeTitle').textContent = 'Classifier Scores Over Time';
      drawMessage(document.getElementById('chartTime'), 'No classifier stages found.\nRefresh matches to detect classifiers.');
      setPlacementVisible(false);
      return;
    }

    // Stats: use official pcts where available
    const officialPcts = clfPoints.filter(p => p.isOfficial).map(p => p.y);
    const statPcts     = officialPcts.length ? officialPcts : clfPoints.map(p => p.y);
    const clfAvg  = statPcts.reduce((s, v) => s + v, 0) / statPcts.length;
    const clfBest = Math.max(...statPcts);
    const avgBandC  = CLASS_BANDS.find(b => clfAvg  >= b.min && clfAvg  < b.max);
    const bestBandC = CLASS_BANDS.find(b => clfBest >= b.min && clfBest < b.max);

    document.getElementById('statMatches').textContent = clfPoints.length;
    document.getElementById('statAvg').textContent  = clfAvg.toFixed(1) + '%';
    document.getElementById('statAvg').style.color  = avgBandC?.text.replace('0.55','1') || '#4a9eff';
    document.getElementById('statBest').textContent = clfBest.toFixed(1) + '%';
    document.getElementById('statBest').style.color = bestBandC?.text.replace('0.55','1') || '#4a9eff';
    if (avgLbl) avgLbl.textContent = avgBandC ? `Avg % · ${avgBandC.label} Class` : 'Avg %';

    // Classifier-mode tooltips
    const clfSource = officialPcts.length ? 'official USPSA % vs national HHF' : 'match % vs match top HF';
    document.getElementById('statAvgBox').dataset.tip =
      `Your average classifier score (${clfSource}),\n` +
      `averaged across all classifier stages in the current view.\n` +
      `USPSA uses your best 6 classifiers to set your classification.`;
    document.getElementById('statBestBox').dataset.tip =
      `Your highest single classifier score (${clfSource}).\n` +
      `Color indicates the USPSA classification band for that score.\n` +
      `GM = 95%+, M = 85–95%, A = 75–85%, B = 60–75%, C = 40–60%.`;

    // Build series grouped by division — gives continuous lines over time
    const DIV_PALETTE = ['#4a9eff','#4caf50','#ff9800','#e91e63','#9c27b0','#00bcd4','#ffeb3b','#ff5722'];
    const divKeys = [...new Set(clfPoints.map(p => p.division))];
    const series = divKeys.map((div, i) => ({
      label: div,
      color: DIV_PALETTE[i % DIV_PALETTE.length],
      points: clfPoints
        .filter(p => p.division === div)
        .map(p => ({ date: p.date, y: p.y, label: p.label, match_name: p.match_name, hf: p.hf,
                     isOfficial: p.isOfficial, a: p.a, c: p.c, d: p.d, m: p.m, ns: p.ns, p_: p.p })),
    }));

    const allClfDates = [...new Set(clfPoints.map(p => p.date))].sort();

    document.getElementById('chartTimeTitle').textContent = 'Classifier Scores Over Time'
      + (officialPcts.length ? ' (official %)' : ' (match % — log in to USPSA.org for official %)');
    drawMultiSeriesChart(document.getElementById('chartTime'), series, allClfDates, {
      yLabel: 'Classifier %', yMin: 0, yMax: 100, invertY: false, trend: series.length === 1, valueUnit: '%',
      showClassBands: true,
    });
    setPlacementVisible(false);
    // Hide analysis charts in classifiers-only mode
    ['chartNonClfSection','chartClfOverlaySection','chartAccuracySection','chartHitZoneSection']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    return;
  }

  // ── Normal mode ──────────────────────────────────────────────────────────────
  document.getElementById('chartTimeTitle').textContent = 'Score Over Time';
  setPlacementVisible(true);
  if (avgLbl) avgLbl.textContent = avgBand ? `Avg % · ${avgBand.label} Class` : 'Avg %';

  const DIV_PALETTE = ['#4a9eff','#4caf50','#ff9800','#e91e63','#9c27b0','#00bcd4','#ffeb3b'];

  // Group viewSorted results by division
  const byDiv = {};
  viewSorted.forEach(r => {
    const key = r.division || 'Unknown';
    if (!byDiv[key]) byDiv[key] = [];
    byDiv[key].push(r);
  });

  // All unique dates for shared X axis
  const allDates = [...new Set(viewSorted.map(r => r.date))].sort();

  const scoreSeries = Object.entries(byDiv).map(([div, matches], i) => {
    const byDate = new Map();
    for (const r of matches) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    const points = [...byDate.entries()].map(([date, group]) => {
      const ys = group.map(r => r.div_pct ?? r.overall_pct).filter(v => v != null);
      const avgY = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
      if (group.length === 1) {
        const r = group[0];
        return { date, y: avgY, label: r.match_name, division: r.division, class_: r.class_,
          overall_pct: r.overall_pct, div_pct: r.div_pct,
          place: r.div_place ?? r.place, total: r.div_total ?? r.total,
          foundBy: r.found_by, stages: r.stages || null };
      }
      return { date, y: avgY, label: `${group.length} matches`, multiMatch: group.map(r => ({
        label: r.match_name, y: r.div_pct ?? r.overall_pct, overall_pct: r.overall_pct,
        division: r.division, class_: r.class_,
        place: r.div_place ?? r.place, total: r.div_total ?? r.total, foundBy: r.found_by,
      })), division: group[0].division, class_: group[0].class_, overall_pct: avgY };
    });
    return { label: div, color: DIV_PALETTE[i % DIV_PALETTE.length], points };
  });

  // Build adjusted % series — one point per match using stage-level cross-division normalization
  const adjPoints = [];
  for (const r of viewSorted) {
    if (!r.stages?.length || !r.division) continue;
    const adjStages = r.stages
      .map(s => computeAdjustedPct(s, r.division))
      .filter(a => a != null);
    if (!adjStages.length) continue;
    const adjAvg = adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length;
    adjPoints.push({
      date: r.date, y: adjAvg, label: r.match_name,
      division: r.division, class_: classLetterForPct(adjAvg),
      overall_pct: r.overall_pct,
    });
  }

  // Add adjusted series if we have data (dashed line, distinct color)
  if (adjPoints.length >= 2) {
    scoreSeries.push({
      label: 'Adjusted %',
      color: '#ff4081',
      dash: true,
      points: adjPoints,
    });
  }

  drawMultiSeriesChart(document.getElementById('chartTime'), scoreSeries, allDates, {
    yLabel: 'Division %', yMin: 0, yMax: 100, invertY: false, trend: scoreSeries.length <= 2, valueUnit: '%',
    showClassBands: true,
  });

  const placeSeries = Object.entries(byDiv).map(([div, matches], i) => {
    const placeMatches = matches.filter(r => {
      const place = r.div_place ?? r.place;
      const total = r.div_total ?? r.total;
      return place != null && total != null && total > 0;
    });
    const byDate = new Map();
    for (const r of placeMatches) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    const points = [...byDate.entries()].map(([date, group]) => {
      const ys = group.map(r => {
        const place = r.div_place ?? r.place, total = r.div_total ?? r.total;
        return Math.round((1 - place / total) * 1000) / 10;
      });
      const avgY = ys.reduce((s, v) => s + v, 0) / ys.length;
      if (group.length === 1) {
        const r = group[0];
        return { date, y: avgY, rawPlace: r.div_place ?? r.place, label: r.match_name,
          division: r.division, class_: r.class_,
          overall_pct: r.div_pct ?? r.overall_pct, total: r.div_total ?? r.total, foundBy: r.found_by };
      }
      return { date, y: avgY, label: `${group.length} matches`, multiMatch: group.map((r, gi) => ({
        label: r.match_name, y: ys[gi], rawPlace: r.div_place ?? r.place,
        total: r.div_total ?? r.total, overall_pct: r.div_pct ?? r.overall_pct,
        division: r.division, class_: r.class_, foundBy: r.found_by,
      })), division: group[0].division, class_: group[0].class_ };
    });
    return { label: div, color: DIV_PALETTE[i % DIV_PALETTE.length], points };
  }).filter(s => s.points.length > 0);

  if (placeSeries.length > 0) {
    const allPlaceDates = [...new Set(placeSeries.flatMap(s => s.points.map(p => p.date)))].sort();
    // Field size context — show min/max competitor count as subtitle
    const allTotals = placeSeries.flatMap(s => s.points.map(p => p.total)).filter(v => v != null && v > 0);
    const placeSubEl = document.getElementById('chartPlaceSubtitle');
    if (placeSubEl && allTotals.length) {
      const minT = Math.min(...allTotals), maxT = Math.max(...allTotals);
      placeSubEl.textContent = minT === maxT
        ? `Field size: ${minT} competitors`
        : `Field size: ${minT}–${maxT} competitors across matches`;
    }
    drawMultiSeriesChart(document.getElementById('chartPlace'), placeSeries, allPlaceDates, {
      yLabel: 'Field beaten %', yMin: 0, yMax: 100, invertY: false, valueUnit: 'place%',
    });
  } else {
    drawMessage(document.getElementById('chartPlace'), 'No placement data.');
  }

  // ── Non-classifier stage trend ────────────────────────────────────────────
  // Shows avg HF% across non-classifier stages per match — a stable cross-match
  // progression signal since classifier stages are one-off courses.
  // Only shown when at least 2 matches have non-classifier stage data.
  const nonClfSection = document.getElementById('chartNonClfSection');
  const nonClfPoints = [];
  for (const r of viewSorted) {
    if (!r.stages?.length) continue;
    const nonClfStages = r.stages.filter(s => s.is_classifier === false || (s.is_classifier == null && !isClassifierStage(s)));
    if (!nonClfStages.length) continue;
    // Compute avg HF% for non-classifier stages (pct = stage % vs match top HF)
    const pcts = nonClfStages.map(s => s.pct).filter(v => v != null);
    if (!pcts.length) continue;
    const avgPct = pcts.reduce((a, v) => a + v, 0) / pcts.length;
    nonClfPoints.push({
      date: r.date,
      y: avgPct,
      label: r.match_name,
      division: r.division,
      class_: r.class_,
      stageCount: nonClfStages.length,
    });
  }
  nonClfPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (nonClfPoints.length >= 2) {
    nonClfSection.style.display = '';
    const nonClfSeries = [{ label: 'Non-Clf Avg %', color: '#00bcd4', points: nonClfPoints }];
    const nonClfDates  = nonClfPoints.map(p => p.date);
    drawMultiSeriesChart(document.getElementById('chartNonClf'), nonClfSeries, nonClfDates, {
      yLabel: 'Avg Stage %', yMin: 0, yMax: 100, invertY: false, trend: true, valueUnit: '%',
      showClassBands: true,
    });
  } else {
    nonClfSection.style.display = 'none';
  }

  // ── Classifier vs Match overlay ───────────────────────────────────────────
  // Overlays per-match score (blue) with classifier scores (gold) on one chart.
  // Shows whether classifier performance tracks match performance.
  // Only rendered when both series have ≥2 points.
  const clfOverlaySection = document.getElementById('chartClfOverlaySection');
  const matchScorePoints  = viewSorted
    .filter(r => r.overall_pct != null)
    .map(r => ({ date: r.date, y: r.overall_pct, label: r.match_name, division: r.division, class_: r.class_ }));

  const clfOverlayPoints = [];
  for (const r of viewSorted) {
    if (!r.stages) continue;
    for (const s of r.stages) {
      const clf = isClassifierStage(s);
      if (!clf) continue;
      const pct = s.clf_pct ?? s.pct;
      if (pct == null) continue;
      clfOverlayPoints.push({
        date: r.date,
        y: pct,
        label: clf.number ? `CM ${clf.number}${clf.name ? ' · ' + clf.name : ''}` : 'Classifier',
        match_name: r.match_name,
        isOfficial: s.clf_pct != null,
      });
    }
  }
  clfOverlayPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (matchScorePoints.length >= 2 && clfOverlayPoints.length >= 2) {
    clfOverlaySection.style.display = '';
    const allOverlayDates = [...new Set([
      ...matchScorePoints.map(p => p.date),
      ...clfOverlayPoints.map(p => p.date),
    ])].sort();
    const overlaySeries = [
      { label: 'Match %',      color: '#4a9eff', points: matchScorePoints },
      { label: 'Classifier %', color: '#ffd700', points: clfOverlayPoints },
    ];
    drawMultiSeriesChart(document.getElementById('chartClfOverlay'), overlaySeries, allOverlayDates, {
      yLabel: '%', yMin: 0, yMax: 100, invertY: false, trend: false, valueUnit: '%',
      showClassBands: true,
    });
  } else {
    clfOverlaySection.style.display = 'none';
  }

  // ── Accuracy trend ────────────────────────────────────────────────────────
  // Plots (M + NS) count per match over time. Requires stage hit data.
  // Lower = better accuracy. Trend line shows direction.
  const accuracySection = document.getElementById('chartAccuracySection');
  const accuracyPoints  = [];
  for (const r of viewSorted) {
    if (!r.stages?.length) continue;
    let totalM = 0, totalNS = 0, stagesWithHits = 0;
    for (const s of r.stages) {
      if (s.m == null && s.ns == null) continue;
      totalM  += s.m  || 0;
      totalNS += s.ns || 0;
      stagesWithHits++;
    }
    if (!stagesWithHits) continue;
    accuracyPoints.push({
      date: r.date,
      y: totalM + totalNS,
      label: r.match_name,
      division: r.division,
      m: totalM,
      ns: totalNS,
    });
  }
  accuracyPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (accuracyPoints.length >= 2) {
    accuracySection.style.display = '';
    const accSeries = [{ label: 'M + NS', color: '#f44336', points: accuracyPoints }];
    const accDates  = accuracyPoints.map(p => p.date);
    drawMultiSeriesChart(document.getElementById('chartAccuracy'), accSeries, accDates, {
      yLabel: 'M + NS', yMin: 0, yMax: null, invertY: false, trend: true, valueUnit: 'hits',
      showClassBands: false,
    });
  } else {
    accuracySection.style.display = 'none';
  }

  // ── Hit zone breakdown ────────────────────────────────────────────────────
  // Stacked bar chart: A / C / D / M+NS per match as % of total hits.
  // Shows whether the shooter is cleaning up hit zones over time.
  const hitZoneSection = document.getElementById('chartHitZoneSection');
  const hitZoneBars    = [];
  for (const r of viewSorted) {
    if (!r.stages?.length) continue;
    let a = 0, c = 0, d = 0, m = 0, ns = 0;
    let hasHits = false;
    for (const s of r.stages) {
      if (s.a == null && s.c == null) continue;
      a  += s.a  || 0;
      c  += s.c  || 0;
      d  += s.d  || 0;
      m  += s.m  || 0;
      ns += s.ns || 0;
      hasHits = true;
    }
    if (!hasHits) continue;
    const total = a + c + d + m + ns;
    if (!total) continue;
    hitZoneBars.push({
      date: r.date,
      label: r.match_name,
      a, c, d, bad: m + ns, total,
      aPct:   (a / total) * 100,
      cPct:   (c / total) * 100,
      dPct:   (d / total) * 100,
      badPct: ((m + ns) / total) * 100,
    });
  }
  hitZoneBars.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (hitZoneBars.length >= 2) {
    hitZoneSection.style.display = '';
    drawStackedBarChart(document.getElementById('chartHitZone'), hitZoneBars);
  } else {
    hitZoneSection.style.display = 'none';
  }

  generateSummaries(viewSorted);
}

// ── Chart summaries ───────────────────────────────────────────────────────────
// Simple helper: mean of a numeric array (returns 0 on empty).
function _avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

// Trend label HTML for a delta value, with a ±threshold for "stable".
function _trendLabel(delta, threshold = 1.0) {
  if (delta >  threshold) return `<span class="s-up">↑ improving</span>`;
  if (delta < -threshold) return `<span class="s-down">↓ declining</span>`;
  return `<span class="s-flat">→ stable</span>`;
}

function generateSummaries(viewSorted) {
  const sorted = [...viewSorted].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });

  // ── 1. Score over time: last 3 matches vs prior baseline ──────────────────
  const scoredMatches = sorted.filter(r => r.div_pct != null || r.overall_pct != null);
  const scoreEl = document.getElementById('chartTimeSummary');
  if (scoreEl) {
    if (scoredMatches.length >= 4) {
      const recent     = scoredMatches.slice(-3);
      const prior      = scoredMatches.slice(0, -3);
      const recentAvg  = _avg(recent.map(r => r.div_pct ?? r.overall_pct));
      const priorAvg   = _avg(prior.map(r => r.div_pct ?? r.overall_pct));
      const delta      = recentAvg - priorAvg;
      const sign       = delta >= 0 ? '+' : '';
      scoreEl.innerHTML =
        `Last 3 matches: <span class="s-val">${recentAvg.toFixed(1)}%</span> ` +
        `vs prior baseline <span class="s-val">${priorAvg.toFixed(1)}%</span> ` +
        `— ${sign}${delta.toFixed(1)}% ${_trendLabel(delta)}`;
      scoreEl.style.display = '';
    } else {
      scoreEl.style.display = 'none';
    }
  }

  // ── 2. Adjusted % vs raw division % ───────────────────────────────────────
  const adjEl = document.getElementById('chartAdjSummary');
  if (adjEl) {
    const pairs = [];
    for (const r of sorted) {
      if (!r.stages?.length || !r.division) continue;
      const adjs = r.stages.map(s => computeAdjustedPct(s, r.division)).filter(Boolean);
      if (!adjs.length) continue;
      const rawPct = r.div_pct ?? r.overall_pct;
      if (rawPct == null) continue;
      pairs.push({ adj: _avg(adjs.map(a => a.adjPct)), raw: rawPct });
    }
    if (pairs.length >= 3) {
      const meanAdj = _avg(pairs.map(p => p.adj));
      const meanRaw = _avg(pairs.map(p => p.raw));
      const diff    = meanAdj - meanRaw;
      const sign    = diff >= 0 ? '+' : '';
      const context = diff > 1.5
        ? `You're regularly competing against stronger fields than your division draw alone suggests.`
        : diff < -1.5
        ? `Your division tends to draw competitive shooters relative to the overall match field.`
        : `Your division's field strength closely mirrors the overall match field.`;
      adjEl.innerHTML =
        `Adjusted avg <span class="s-val">${meanAdj.toFixed(1)}%</span> ` +
        `vs raw division avg <span class="s-val">${meanRaw.toFixed(1)}%</span> ` +
        `(${sign}${diff.toFixed(1)}%) — ${context}`;
      adjEl.style.display = '';
    } else {
      adjEl.style.display = 'none';
    }
  }

  // ── 3. Placement: average percentile + trend ───────────────────────────────
  const placeEl = document.getElementById('chartPlaceSummary');
  if (placeEl) {
    const placeData = sorted.filter(r => r.div_place != null && r.div_total > 0);
    if (placeData.length >= 3) {
      const pcts      = placeData.map(r => r.div_place / r.div_total);
      const meanPct   = _avg(pcts);
      const topPct    = Math.round(meanPct * 100);
      let trendStr    = '';
      if (placeData.length >= 4) {
        // Lower percentile ratio = higher in the field = better
        const recentPct = _avg(pcts.slice(-3));
        const priorPct  = _avg(pcts.slice(0, -3));
        const delta     = recentPct - priorPct; // negative = moved up = improving
        trendStr        = ' ' + _trendLabel(-delta); // flip sign: lower ratio is better
      }
      placeEl.innerHTML =
        `Finishing in the top <span class="s-val">${topPct}%</span> of your division on average.${trendStr}`;
      placeEl.style.display = '';
    } else {
      placeEl.style.display = 'none';
    }
  }

  // ── 4. Classifier trend: clf_pct only (national HHF — directly comparable) ─
  const clfEl = document.getElementById('chartClfSummary');
  if (clfEl) {
    const clfStages = [];
    for (const r of sorted) {
      if (!r.stages) continue;
      for (const s of r.stages) {
        if (s.clf_pct != null) clfStages.push(s.clf_pct);
      }
    }
    if (clfStages.length >= 6) {
      const N         = Math.min(5, Math.floor(clfStages.length / 2));
      const recent    = clfStages.slice(-N);
      const prior     = clfStages.slice(0, -N);
      const recentAvg = _avg(recent);
      const priorAvg  = _avg(prior);
      const delta     = recentAvg - priorAvg;
      const sign      = delta >= 0 ? '+' : '';
      clfEl.innerHTML =
        `Last ${N} classifiers: <span class="s-val">${recentAvg.toFixed(1)}%</span> ` +
        `vs prior <span class="s-val">${priorAvg.toFixed(1)}%</span> ` +
        `— ${sign}${delta.toFixed(1)}% ${_trendLabel(delta, 1.5)} ` +
        `<span class="s-note">(national HHF reference — directly comparable across matches)</span>`;
      clfEl.style.display = '';
    } else if (clfStages.length >= 2) {
      const clfAvg = _avg(clfStages);
      clfEl.innerHTML =
        `Classifier avg: <span class="s-val">${clfAvg.toFixed(1)}%</span> ` +
        `across ${clfStages.length} stage${clfStages.length > 1 ? 's' : ''}. ` +
        `<span class="s-note">(${6 - clfStages.length} more needed for trend)</span>`;
      clfEl.style.display = '';
    } else {
      clfEl.style.display = 'none';
    }
  }
}

// ── Match history list ────────────────────────────────────────────────────────
function renderMatchList() {
  if (!allResults.length) { matchHistory.classList.remove('visible'); return; }

  matchHistory.classList.add('visible');
  matchRowsEl.innerHTML = '';

  const sorted = [...allResults].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? db - da : 0;
  });

  sorted.forEach(match => {
    const hasStages  = !!(match.stages && match.stages.length > 0);
    const matchType  = match.match_type || 'Unknown';
    const isUSPSA    = isChartable(match);
    const isDeselected = deselectedMatches.has(match.match_id);
    const isExcluded = !isUSPSA || isDeselected;

    const dotClass = match.found_by === 'member_number' ? 'scored'
                   : match.found_by === 'name'          ? 'named'
                   : 'none';

    // Compute adjusted match % from stage-level cross-division data
    let adjMatchPct = null;
    if (hasStages && match.division) {
      const adjStages = match.stages
        .map(s => computeAdjustedPct(s, match.division))
        .filter(a => a != null);
      if (adjStages.length > 0) {
        adjMatchPct = adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length;
      }
    }

    const adjText = adjMatchPct != null
      ? ` · adj ${fmtPct(adjMatchPct)}`
      : '';

    const scoreText = match.overall_pct != null
      ? fmtPct(match.overall_pct) + adjText + (match.division ? ' · ' + escHtml(match.division) : '') + (match.class_ ? '/' + escHtml(match.class_) : '')
      : null;

    const metaParts = [match.date];
    if (match.fetched_at) metaParts.push(formatAge(match.fetched_at));
    if (match.found_by === 'name') metaParts.push('matched by name');
    if (hasStages) metaParts.push(`${match.stages.length} stages`);
    if (!isUSPSA) metaParts.push('excluded from charts');

    const typeBadgeClass = !isChartable(match)                    ? 'type-other'    // red  — non-USPSA/non-HF sport
                         : match.found_by === 'member_number'    ? 'type-uspsa'    // green — confirmed by member #
                         : 'type-unknown';                                          // orange — name-only or not found

    const item = document.createElement('div');
    item.className = 'match-item' + (isExcluded ? ' excluded' : '');

    const row = document.createElement('div');
    row.className = 'match-row';
    row.dataset.matchId = match.match_id;
    // Build row using DOM methods for untrusted text (match_name, matchType) to prevent XSS (F1)
    row.innerHTML = `
      <input type="checkbox" class="match-include-cb" title="Include in charts"
        ${isDeselected ? '' : 'checked'}
        ${!isUSPSA ? 'disabled' : ''}>
      <div class="match-dot ${dotClass}"></div>
      <div class="match-info">
        <div class="match-name"></div>
        <div class="match-meta"></div>
      </div>
      <span class="match-type-badge ${typeBadgeClass}"></span>
      <div class="match-score ${scoreText ? '' : 'none'}">${scoreText || 'No score'}</div>
      ${hasStages ? '<button class="expand-btn" title="Show stage breakdown">&#9658;</button>' : '<span class="expand-placeholder"></span>'}
      <button class="refresh-btn" title="Re-fetch this match">&#8635;</button>
      <button class="export-btn" title="Save as image">${SAVE_ICON}</button>
      <button class="delete-btn" title="Delete from history">&#x2715;</button>
    `;
    // Set untrusted text via textContent to prevent XSS
    row.querySelector('.match-name').textContent = match.match_name;
    row.querySelector('.match-meta').textContent = metaParts.join(' · ');
    row.querySelector('.match-type-badge').textContent = matchType;

    if (hasStages) {
      const panel = document.createElement('div');
      panel.className = 'stage-panel';

      // Compute accuracy loss (seconds lost to non-A hits) per stage:
      // acc_loss = (C×1 + D×2 + M×5 + NS×5) / your_HF
      // This converts penalty points into "seconds you'd have saved with perfect accuracy".
      // Speed gap vs GM: how many seconds behind GM pace (gm_median_hf - your_hf) / gm_median_hf * time
      function stageAccLoss(s) {
        if (!s.hf || s.hf <= 0) return null;
        const penaltyPts = (s.c || 0) * 1 + (s.d || 0) * 2 + (s.m || 0) * 5 + (s.ns || 0) * 5;
        return penaltyPts / s.hf;
      }
      function stageGmPct(s) {
        if (!s.gm_median_hf || !s.hf) return null;
        return (s.hf / s.gm_median_hf) * 100;
      }

      const hasGM = match.stages.some(s => s.gm_median_hf != null);
      const hasXdiv = match.stages.some(s => s.xdiv_benchmarks != null);

      // Build table using DOM to avoid XSS on stage names (F1)
      const table = document.createElement('table');
      table.className = 'stage-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const headers = ['Stage', 'Time', 'HF', '%'];
      if (hasXdiv) headers.push('Adj%');
      if (hasGM) headers.push('GM%', 'Acc Loss');
      headers.push('A', 'C', 'D', 'M', 'NS', 'P');
      headers.forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h;
        if (i > 0) th.style.textAlign = 'right';
        const colClass = { A: 'col-a', C: 'col-c', D: 'col-d', M: 'col-m', NS: 'col-ns', P: 'col-p' }[h];
        if (colClass) th.className = colClass;
        if (h === 'Adj%') {
          th.title = 'Field-strength adjusted %\nNormalizes the best HF from any division at this match to your division using HHF ratios, giving you a more accurate classification read regardless of who showed up.';
          th.style.cursor = 'help';
        }
        if (h === '%') {
          th.title = 'Raw stage % — your HF vs the top HF in your division only.\nInflated when no GM/Master is present in your division.';
          th.style.cursor = 'help';
        }
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      match.stages.forEach(s => {
        const clf = isClassifierStage(s);
        const tr = document.createElement('tr');

        // Stage name cell — use DOM to prevent XSS
        const nameTd = document.createElement('td');
        if (clf) {
          const badge = document.createElement('a');
          badge.className = 'classifier-badge';
          badge.href = `https://uspsa.org/viewer/${encodeURIComponent(clf.number)}.pdf`;
          badge.target = '_blank';
          badge.title = `${clf.name ? clf.name + ' — ' : ''}CM ${clf.number} · View stage description`;
          badge.textContent = `CM ${clf.number}`;
          nameTd.appendChild(badge);
        }
        nameTd.appendChild(document.createTextNode(normalizeStgName(s.name)));
        tr.appendChild(nameTd);

        // Numeric cells
        const cells = [
          s.time != null ? s.time.toFixed(2) + 's' : '—',
          s.hf   != null ? s.hf.toFixed(4)         : '—',
          null, // pct — uses fmtPct (HTML)
        ];
        cells.forEach((val, i) => {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        });
        // % cell — show official USPSA clf_pct as primary when available, match % as secondary
        const pctTd = tr.children[3];
        if (clf && s.clf_pct != null) {
          pctTd.innerHTML = `${fmtPct(s.clf_pct)}<br><small style="opacity:0.6" title="Match %">match: ${s.pct != null ? s.pct.toFixed(1) + '%' : '—'}</small>`;
        } else {
          pctTd.innerHTML = fmtPct(s.pct);
        }

        // Adjusted % cell — field-strength-normalized percentage
        if (hasXdiv) {
          const adj = computeAdjustedPct(s, match.division);
          const adjTd = document.createElement('td');
          if (adj) {
            const b = bandForPct(adj.adjPct);
            const color = b ? b.text.replace('0.55', '1') : '#8a9bb0';
            adjTd.innerHTML = `<span style="color:${color}">${adj.adjPct.toFixed(1)}% <small style="font-size:9px;opacity:0.75">${adj.adjClass}</small></span>`;
            // Build detailed tooltip explaining the adjustment
            const methodLabel = adj.method === 'gm_median' ? 'GM median' : adj.method === 'm_median' ? 'Master median' : 'top shooter';
            adjTd.title = `Field-adjusted: your HF (${s.hf?.toFixed(4)}) vs ${methodLabel} in ${adj.refDiv} (${adj.refHF?.toFixed(4)} HF)\n`
              + `Normalized to ${match.division}: ${adj.normHF?.toFixed(4)} HF\n`
              + `${s.hf?.toFixed(4)} / ${adj.normHF?.toFixed(4)} = ${adj.adjPct.toFixed(1)}% (${adj.adjClass} class)`;
          } else if (clf) {
            adjTd.textContent = '—';
            adjTd.title = 'Classifier stage — official classifier percentages are already normalized against national division data, so adjusted % is not applied.';
          } else {
            adjTd.textContent = '—';
            adjTd.title = 'No cross-division data available for this stage';
          }
          tr.appendChild(adjTd);
        }

        if (hasGM) {
          // GM% cell
          const gmPct = stageGmPct(s);
          const gmTd = document.createElement('td');
          if (gmPct != null) {
            const color = gmPct >= 95 ? '#ffd700' : gmPct >= 85 ? '#e040fb' : gmPct >= 75 ? '#4caf50' : gmPct >= 60 ? '#4a9eff' : '#ff9800';
            gmTd.innerHTML = `<span style="color:${color}">${gmPct.toFixed(1)}%</span>`;
            gmTd.title = `Your HF vs median GM HF (${s.gm_median_hf?.toFixed(4)})`;
          } else {
            gmTd.textContent = '—';
          }
          tr.appendChild(gmTd);

          // Accuracy loss cell
          const accLoss = stageAccLoss(s);
          const accTd = document.createElement('td');
          if (accLoss != null) {
            const color = accLoss < 0.5 ? '#4caf50' : accLoss < 1.5 ? '#fdd835' : '#f44336';
            accTd.innerHTML = `<span style="color:${color}" title="Seconds lost to non-A hits: (C×1 + D×2 + M×5 + NS×5) / HF">−${accLoss.toFixed(2)}s</span>`;
          } else {
            accTd.textContent = '—';
          }
          tr.appendChild(accTd);
        }

        // Hit columns
        const hitCols = [
          { val: s.a,  cls: 'col-a' },
          { val: s.c,  cls: 'col-c' },
          { val: s.d,  cls: 'col-d' },
          { val: s.m,  cls: 'col-m' },
          { val: s.ns, cls: 'col-ns' },
          { val: s.p,  cls: 'col-p' },
        ];
        hitCols.forEach(({ val, cls }) => {
          const td = document.createElement('td');
          td.className = cls;
          td.textContent = val || '—';
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      panel.appendChild(table);

      const toggleExpand = () => {
        const isOpen = panel.classList.toggle('open');
        item.classList.toggle('open', isOpen);
        row.querySelector('.expand-btn').textContent = isOpen ? '▼' : '▶';
      };

      row.style.cursor = 'pointer';
      row.addEventListener('click', e => {
        if (e.target.closest('.refresh-btn, .delete-btn, .export-btn, .match-include-cb, .classifier-badge')) return;
        toggleExpand();
      });
      row.querySelector('.expand-btn').addEventListener('click', e => {
        e.stopPropagation();
        toggleExpand();
      });

      item.appendChild(row);
      item.appendChild(panel);
    } else {
      item.appendChild(row);
    }

    // Checkbox: toggle match inclusion in charts
    if (isUSPSA) {
      row.querySelector('.match-include-cb').addEventListener('change', e => {
        e.stopPropagation();
        if (e.target.checked) {
          deselectedMatches.delete(match.match_id);
        } else {
          deselectedMatches.add(match.match_id);
        }
        saveDeselected();
        item.classList.toggle('excluded', !e.target.checked);
        renderAll();
        updateStatusCounts();
      });
    }

    // Refresh button
    row.querySelector('.refresh-btn').addEventListener('click', e => {
      e.stopPropagation();
      refreshSingleMatch(match, row.querySelector('.refresh-btn'));
    });

    // Export button → show per-match/stage image export menu
    row.querySelector('.export-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (_exportMenuMatch === match && _exportMenuEl.style.display !== 'none') {
        _exportMenuEl.style.display = 'none';
        _exportMenuMatch = null;
      } else {
        showExportMenu(match, e.currentTarget);
      }
    });

    // Delete button
    row.querySelector('.delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteMatch(match);
    });

    matchRowsEl.appendChild(item);
  });
}

// ── Render official class badge in the stat box ────────────────────────────────
// Shows the USPSA.org classification for the currently selected (or most common) division.
function renderClassBox(viewSortedDivision) {
  const box = document.getElementById('statClassBox');
  const val = document.getElementById('statClass');
  if (!classificationData?.divisions) { box.style.display = 'none'; return; }

  const divs = classificationData.divisions;
  // Use the selected division key, or try to match by substring, or first available
  let info = null;
  if (viewSortedDivision) {
    const key = Object.keys(divs).find(k =>
      k.toLowerCase().includes(viewSortedDivision.toLowerCase().slice(0, 4)) ||
      viewSortedDivision.toLowerCase().includes(k.toLowerCase().slice(0, 4))
    );
    if (key) info = divs[key];
  }
  if (!info) info = Object.values(divs)[0];
  if (!info?.class_) { box.style.display = 'none'; return; }

  const c = info.class_.toUpperCase();

  // Three-line layout: class letter → percentage → "USPSA Class" label
  // Rebuild inner HTML directly so we're not fighting the val/lbl two-slot structure
  const bandColor = { GM:'#ffd700', M:'#e040fb', A:'#4caf50', B:'#4a9eff', C:'#ff9800', D:'#8a9bb0', U:'#666' }[c] || '#8a9bb0';
  const pctLine   = info.pct != null
    ? `<div style="font-size:14px;font-weight:600;color:#aaa;margin:2px 0 1px">${info.pct.toFixed(1)}%</div>`
    : '';
  box.innerHTML = `
    <div style="font-size:26px;font-weight:700;color:${bandColor};line-height:1.1">${escHtml(c)}</div>
    ${pctLine}
    <div style="font-size:12px;color:#777;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">USPSA Class</div>
  `;

  // Tooltip — explain what the class and % mean
  const divName = Object.keys(classificationData.divisions).find(k =>
    k.toLowerCase().includes((viewSortedDivision || '').toLowerCase().slice(0, 4)) ||
    (viewSortedDivision || '').toLowerCase().includes(k.toLowerCase().slice(0, 4))
  ) || viewSortedDivision || 'your division';
  const tipPctLine = info.pct != null
    ? `${info.pct.toFixed(1)}% — your current classifier average.\n`
    : '';
  box.dataset.tip =
    `Your official USPSA classification in ${divName}.\n` +
    `${tipPctLine}` +
    `Classification is set by your best 6 classifier scores.\n` +
    `GM ≥95% · M ≥85% · A ≥75% · B ≥60% · C ≥40% · D <40%`;

  box.style.display = '';
}

// ── Delete a match from history/cache ────────────────────────────────────────
async function deleteMatch(match) {
  const ok = confirm(
    `Delete "${match.match_name}" from match history?\n\n` +
    `This removes it from your local cache. It will be re-fetched next time you click Fetch Scores.`
  );
  if (!ok) return;

  allResults = allResults.filter(r => r.match_id !== match.match_id);
  deselectedMatches.delete(match.match_id);

  const d = await chrome.storage.local.get(['matchCache', 'lastMatchList']);
  const cache     = d.matchCache     || {};
  const matchList = d.lastMatchList  || [];
  delete cache[match.match_id];
  const newList = matchList.filter(m => m.match_id !== match.match_id);

  await chrome.storage.local.set({
    matchCache:        cache,
    lastMatchList:     newList,
    deselectedMatches: [...deselectedMatches],
  });

  renderAll();
  renderMatchList();

  if (!allResults.length) {
    summaryBar.classList.remove('visible');
    chartsEl.classList.remove('visible');
    matchHistory.classList.remove('visible');
    setStatus('No matches. Click Fetch Scores to load.', '');
  } else {
    const uspsaLeft = allResults.filter(r => isLikelyUSPSA(r.match_type || 'Unknown'));
    const scored = uspsaLeft.filter(r => r.overall_pct != null).length;
    setStatus(`${uspsaLeft.length} USPSA match(es) — ${scored} with scores.`, 'success');
  }
}

async function refreshSingleMatch(match, btn) {
  btn.disabled = true;
  btn.classList.add('spinning');

  const memberNumber = memberInput.value.trim().toUpperCase();
  const name         = nameInput.value.trim();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'refreshMatch',
      match:  { match_id: match.match_id, match_name: match.match_name, date: match.date },
      memberNumber,
      name,
    });
    if (!response.ok) throw new Error(response.error);

    const { result } = response.data;
    const idx = allResults.findIndex(r => r.match_id === match.match_id);
    if (idx >= 0) allResults[idx] = { ...allResults[idx], ...result };

    renderAll();
    renderMatchList();

  } catch (err) {
    console.error('Refresh failed:', err);
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, type = '', loading = false) {
  statusEl.className = type;
  statusEl.innerHTML = loading ? `<div class="spinner"></div>${msg}` : msg;
}

// Recompute and display the status line from current allResults + deselectedMatches.
// verb = 'Loaded' on first fetch, omitted (defaults to 'Showing') on checkbox changes.
function updateStatusCounts(verb) {
  if (!allResults.length) return;
  const confirmedUSPSA  = allResults.filter(r => isConfirmedUSPSA(r.match_type || 'Unknown'));
  const unconfirmed     = allResults.filter(r => isLikelyUSPSA(r.match_type || 'Unknown') && !isConfirmedUSPSA(r.match_type || 'Unknown'));
  const nonUspsa        = allResults.filter(r => !isLikelyUSPSA(r.match_type || 'Unknown'));
  const uspsa           = confirmedUSPSA.length;
  const scored          = confirmedUSPSA.filter(r => r.overall_pct != null).length;
  const checked         = confirmedUSPSA.filter(r => !deselectedMatches.has(r.match_id)).length;

  const prefix           = verb || 'Showing';
  const checkedNote      = checked < uspsa ? ` · ${checked} checked` : '';
  const unconfirmedNote  = unconfirmed.length > 0 ? ` · ${unconfirmed.length} unconfirmed type` : '';
  const skippedNote      = nonUspsa.length > 0    ? ` · ${nonUspsa.length} non-USPSA excluded` : '';
  setStatus(`${prefix} ${uspsa} USPSA match(es) — ${scored} with scores${checkedNote}.${unconfirmedNote}${skippedNote}`, 'success');
}

// ── Save icon SVG (floppy disk, feather-style) ────────────────────────────────
const SAVE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

// ── Export menu ───────────────────────────────────────────────────────────────
let _exportMenuMatch = null;
const _exportMenuEl  = document.getElementById('exportMenu');

function showExportMenu(match, anchorEl) {
  _exportMenuMatch = match;
  const stages = match.stages || [];
  _exportMenuEl.innerHTML = `
    <div class="export-menu-title">Save as Image</div>
    <div class="export-menu-item" data-action="match">Full Match</div>
    ${stages.map((s, i) => {
      const nm = normalizeStgName(s.name);
      return `<div class="export-menu-item" data-action="stage" data-idx="${i}">Stage ${i + 1}: ${nm.length > 32 ? nm.slice(0, 30) + '\u2026' : nm}</div>`;
    }).join('')}
  `;
  _exportMenuEl.style.display = 'block';
  const r = anchorEl.getBoundingClientRect();
  const mh = _exportMenuEl.offsetHeight;
  const top = r.bottom + mh + 4 > window.innerHeight ? r.top - mh - 4 : r.bottom + 4;
  _exportMenuEl.style.top  = top + 'px';
  _exportMenuEl.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
}

_exportMenuEl.addEventListener('click', e => {
  const item = e.target.closest('.export-menu-item');
  if (!item || !_exportMenuMatch) return;
  _exportMenuEl.style.display = 'none';
  if (item.dataset.action === 'match') {
    exportMatchCard(_exportMenuMatch);
  } else {
    exportStageCard(_exportMenuMatch, _exportMenuMatch.stages[+item.dataset.idx]);
  }
  _exportMenuMatch = null;
});

document.addEventListener('click', e => {
  if (_exportMenuEl.style.display !== 'none' && !_exportMenuEl.contains(e.target)
      && !e.target.closest('.export-btn')) {
    _exportMenuEl.style.display = 'none';
    _exportMenuMatch = null;
  }
});

// ── Export card helpers ───────────────────────────────────────────────────────
function _rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function _trunc(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
  return t + '\u2026';
}

function _cardColor(pct) {
  if (pct == null) return '#8a9bb0';
  if (pct >= 95) return '#ffd700';
  if (pct >= 85) return '#e040fb';
  if (pct >= 75) return '#4caf50';
  if (pct >= 60) return '#4a9eff';
  if (pct >= 40) return '#ff9800';
  return '#8a9bb0';
}

function _cardLabel(pct) {
  if (pct == null) return '';
  if (pct >= 95) return 'GM';
  if (pct >= 85) return 'M';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 40) return 'C';
  return 'D';
}

function _dividerLine(ctx, x, y, w) {
  ctx.save();
  ctx.strokeStyle = '#2a2d3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

function _downloadPng(canvas, name) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name || 'card').replace(/[^a-z0-9._-]/gi, '_') + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function exportMatchCard(match) {
  const DPR = 2, F = 'Inter, system-ui, -apple-system, sans-serif';
  const W = 320, PAD = 16;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `bold 13px ${F}`;
  const nameLines  = _wrapText(probe, match.match_name || '', W - PAD * 2);
  const scorePct   = match.div_pct ?? match.overall_pct;
  const hasScore   = scorePct != null;
  const showOverall = match.overall_pct != null && match.div_pct != null
                     && Math.abs(match.overall_pct - match.div_pct) > 0.1;
  const hasStages  = match.stages?.length > 0;

  let H = PAD;
  H += nameLines.length * 16;
  H += 4 + 14;
  if (hasScore) {
    H += 10 + 30;
    if (showOverall) H += 14;
    H += 8;
  }
  if (hasStages) { H += 1 + 8 + match.stages.length * 20 + 6; }
  H += 1 + 8 + 14 + PAD;

  const canvas = document.createElement('canvas');
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  const ox = 0, oy = 0;

  ctx.fillStyle = '#1a1d27';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  let y = oy + PAD;

  ctx.font = `bold 13px ${F}`; ctx.fillStyle = '#fff';
  nameLines.forEach(l => { ctx.fillText(l, ox + PAD, y + 12); y += 16; });
  y += 4;

  ctx.font = `11px ${F}`; ctx.fillStyle = '#888';
  const meta = [match.date, [match.division, match.class_].filter(Boolean).join('/')].filter(Boolean).join(' \u00b7 ');
  ctx.fillText(meta, ox + PAD, y + 10);
  y += 14;

  if (hasScore) {
    y += 10;
    const color = _cardColor(scorePct), label = _cardLabel(scorePct);
    ctx.font = `bold 28px ${F}`; ctx.fillStyle = color;
    const ps = scorePct.toFixed(1) + '%';
    ctx.fillText(ps, ox + PAD, y + 24);
    const pw = ctx.measureText(ps).width;
    ctx.font = `bold 12px ${F}`; ctx.fillStyle = color;
    ctx.fillText(label, ox + PAD + pw + 6, y + 20);
    ctx.font = `9px ${F}`; ctx.fillStyle = '#555';
    ctx.fillText(match.div_pct != null ? 'div %' : 'overall %', ox + PAD + pw + 6, y + 30);
    y += 30;
    if (showOverall) {
      ctx.font = `11px ${F}`; ctx.fillStyle = '#888';
      ctx.fillText(`overall: ${match.overall_pct.toFixed(1)}%`, ox + PAD, y + 10);
      y += 14;
    }
    y += 8;
  }

  if (hasStages) {
    _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 8;
    const pctX = ox + W - PAD;
    const hfX  = pctX - 52;
    const nameMaxW = hfX - 50 - (ox + PAD);
    match.stages.forEach(s => {
      const clf = isClassifierStage(s);
      const pct = clf && s.clf_pct != null ? s.clf_pct : s.pct;
      ctx.font = clf ? `bold 11px ${F}` : `11px ${F}`;
      ctx.fillStyle = clf ? '#4a9eff' : '#ccc';
      const nm = (clf ? `CM ${clf.number} \u00b7 ` : '') + normalizeStgName(s.name);
      ctx.fillText(_trunc(ctx, nm, nameMaxW), ox + PAD, y + 10);
      ctx.font = `11px ${F}`;
      ctx.fillStyle = '#555';
      const hfStr = s.hf != null ? s.hf.toFixed(4) : '\u2014';
      ctx.fillText(hfStr, hfX - ctx.measureText(hfStr).width, y + 10);
      ctx.fillStyle = _cardColor(pct);
      const pStr = pct != null ? pct.toFixed(1) + '%' : '\u2014';
      ctx.fillText(pStr, pctX - ctx.measureText(pStr).width, y + 10);
      y += 20;
    });
    y += 6;
  }

  _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 8;
  ctx.font = `10px ${F}`; ctx.fillStyle = '#444';
  ctx.fillText('Hit Factor Charts', ox + W - PAD - ctx.measureText('Hit Factor Charts').width, y + 10);

  _downloadPng(canvas, [match.match_name || 'match', match.date].filter(Boolean).join(' '));
}

function exportStageCard(match, stage) {
  const DPR = 2, F = 'Inter, system-ui, -apple-system, sans-serif';
  const W = 280, PAD = 14;

  const clf         = isClassifierStage(stage);
  const officialPct = clf && stage.clf_pct != null ? stage.clf_pct : null;
  const displayPct  = officialPct ?? stage.pct;
  const showMatchPct = officialPct != null && stage.pct != null;
  const hits = [
    stage.a  > 0 && { t: `${stage.a}A`,   c: '#4caf50' },
    stage.c  > 0 && { t: `${stage.c}C`,   c: '#fdd835' },
    stage.d  > 0 && { t: `${stage.d}D`,   c: '#ff9800' },
    stage.m  > 0 && { t: `${stage.m}M`,   c: '#f44336' },
    stage.ns > 0 && { t: `${stage.ns}NS`, c: '#f44336' },
    stage.p  > 0 && { t: `${stage.p}P`,   c: '#f44336' },
  ].filter(Boolean);

  let H = PAD;
  if (clf) H += 14;
  H += 16 + 8;
  H += 1 + 10;
  if (displayPct != null) {
    H += 32;
    if (showMatchPct) H += 14;
  }
  H += 10 + 1 + 8;
  H += 14;
  if (hits.length) H += 14;
  H += 8 + 1 + 8 + 14 + PAD;

  const canvas = document.createElement('canvas');
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  const ox = 0, oy = 0;

  ctx.fillStyle = '#1a1d27';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  let y = oy + PAD;

  if (clf) {
    ctx.font = `bold 11px ${F}`; ctx.fillStyle = '#4a9eff';
    ctx.fillText(`CM ${clf.number}`, ox + PAD, y + 10);
    y += 14;
  }

  ctx.font = `bold 13px ${F}`; ctx.fillStyle = '#fff';
  ctx.fillText(_trunc(ctx, normalizeStgName(stage.name), W - PAD * 2), ox + PAD, y + 12);
  y += 16; y += 8;

  _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 10;

  if (displayPct != null) {
    const color = _cardColor(displayPct), label = _cardLabel(displayPct);
    ctx.font = `bold 28px ${F}`; ctx.fillStyle = color;
    const ps = displayPct.toFixed(1) + '%';
    ctx.fillText(ps, ox + PAD, y + 26);
    const pw = ctx.measureText(ps).width;
    ctx.font = `bold 13px ${F}`; ctx.fillStyle = color;
    ctx.fillText(label, ox + PAD + pw + 6, y + 22);
    y += 32;
    if (showMatchPct) {
      ctx.font = `11px ${F}`; ctx.fillStyle = '#666';
      ctx.fillText(`match: ${stage.pct.toFixed(1)}%`, ox + PAD, y + 10);
      y += 14;
    }
  }
  y += 10;

  _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 8;

  ctx.font = `11px ${F}`; ctx.fillStyle = '#888';
  const stats = [
    stage.hf   != null && `HF: ${stage.hf.toFixed(4)}`,
    stage.time != null && `Time: ${stage.time.toFixed(2)}s`,
  ].filter(Boolean).join('   ');
  if (stats) ctx.fillText(stats, ox + PAD, y + 10);
  y += 14;

  if (hits.length) {
    let hx = ox + PAD;
    hits.forEach(h => {
      ctx.font = `11px ${F}`; ctx.fillStyle = h.c;
      ctx.fillText(h.t, hx, y + 10);
      hx += ctx.measureText(h.t + '  ').width;
    });
    y += 14;
  }
  y += 8;

  _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 8;
  ctx.font = `10px ${F}`;
  ctx.fillStyle = '#555';
  const fl = _trunc(ctx, [match.match_name, match.date].filter(Boolean).join(' \u00b7 '), W - PAD * 2 - 68);
  ctx.fillText(fl, ox + PAD, y + 10);
  ctx.fillStyle = '#444';
  ctx.fillText('Hit Factor Charts', ox + W - PAD - ctx.measureText('Hit Factor Charts').width, y + 10);

  const stageBase = clf ? `CM ${clf.number} ${normalizeStgName(stage.name)}` : normalizeStgName(stage.name) || 'stage';
  _downloadPng(canvas, [stageBase, match.date].filter(Boolean).join(' '));
}

// ── CSV Export ────────────────────────────────────────────────────────────────
// Exports chart-visible match data as a flat CSV (one row per stage).
// Respects the active division / year / custom date-range filter.
// Includes USPSA clf_pct when available (official % vs national reference HF).
function exportChartCSV() {
  const uspsaBase = allResults.filter(r => isChartable(r) && !deselectedMatches.has(r.match_id));
  const chartable = currentView === 'ranked'
    ? uspsaBase.filter(r => r.found_by === 'member_number' && r.overall_pct != null)
    : uspsaBase.filter(r => r.overall_pct != null || r.hf != null);
  const sorted = [...chartable].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });
  const viewSorted = sorted.filter(r =>
    (!selectedDiv       || (r.division || 'Unknown') === selectedDiv) &&
    (!selectedYear      || r.date?.startsWith(selectedYear)) &&
    (!selectedDateRange || (r.date >= selectedDateRange.start && r.date <= selectedDateRange.end))
  );

  // Flat format: one row per stage (match-level fields repeated).
  // In classifiersOnly mode, only classifier stages are included.
  const headers = [
    'Date', 'Match', 'Division', 'Class', 'Overall %', 'Div %', 'Place', 'Div Place',
    'Stage', 'Stage HF', 'Stage Match %', 'Stage Time', 'A', 'C', 'D', 'M', 'NS', 'P',
    'CM #', 'CM Name', 'USPSA %',
  ];
  const rows = [headers];

  for (const r of viewSorted) {
    const matchCols = [
      r.date        || '',
      r.match_name  || '',
      r.division    || '',
      r.class_      || '',
      r.overall_pct != null ? r.overall_pct.toFixed(2) : '',
      r.div_pct     != null ? r.div_pct.toFixed(2)     : '',
      r.place       != null ? r.place                   : '',
      r.div_place   != null ? r.div_place               : '',
    ];

    if (!r.stages?.length) {
      if (!classifiersOnly) rows.push([...matchCols, '', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }

    for (const s of r.stages) {
      const clf = isClassifierStage(s);
      if (classifiersOnly && !clf) continue;
      rows.push([
        ...matchCols,
        s.name  || '',
        s.hf    != null ? s.hf.toFixed(4)   : '',
        s.pct   != null ? s.pct.toFixed(2)  : '',
        s.time  != null ? s.time.toFixed(2) : '',
        s.a  ?? '', s.c  ?? '', s.d  ?? '',
        s.m  ?? '', s.ns ?? '', s.p  ?? '',
        clf?.number || '',
        clf?.name   || '',
        s.clf_pct != null ? s.clf_pct.toFixed(2) : '',
      ]);
    }
  }

  const csv      = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const dateTag  = selectedDateRange
    ? `${selectedDateRange.start} to ${selectedDateRange.end}`
    : selectedYear || 'all time';
  const filename = (classifiersOnly ? 'hfc_classifiers' : 'hfc_scores') + ` ${dateTag}.csv`;
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function formatAge(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)    return 'just now';
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Chart primitives (Canvas 2D)
// ═════════════════════════════════════════════════════════════════════════════

const PAD        = { top: 24, right: 52, bottom: 44, left: 48 };
const FONT       = '11px Inter, system-ui, sans-serif';

// Read CSS custom properties for canvas drawing (canvas doesn't support var())
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function GRID_COLOR() { return cssVar('--grid'); }
function AXIS_COLOR() { return cssVar('--axis'); }
function TEXT_COLOR() { return cssVar('--chart-text'); }
function CHART_BG()   { return cssVar('--chart-bg'); }

// USPSA classification bands (% thresholds)
const CLASS_BANDS = [
  { label: 'GM', min: 95,  max: 110, weight: 6, fill: 'rgba(255,215,0,0.08)',    text: 'rgba(255,215,0,0.85)' },
  { label: 'M',  min: 85,  max: 95,  weight: 5, fill: 'rgba(192,192,192,0.08)', text: 'rgba(192,192,192,0.85)' },
  { label: 'A',  min: 75,  max: 85,  weight: 4, fill: 'rgba(74,158,255,0.08)',  text: 'rgba(74,158,255,0.85)' },
  { label: 'B',  min: 60,  max: 75,  weight: 3, fill: 'rgba(76,175,80,0.08)',   text: 'rgba(76,175,80,0.85)' },
  { label: 'C',  min: 40,  max: 60,  weight: 2, fill: 'rgba(255,152,0,0.08)',   text: 'rgba(255,152,0,0.85)' },
  { label: 'D',  min: 0,   max: 40,  weight: 1, fill: 'rgba(120,120,120,0.08)', text: 'rgba(120,120,120,0.85)' },
];

function bandForPct(pct) {
  return CLASS_BANDS.find(b => pct >= b.min && pct < b.max) || null;
}

// ── Class-band Y-axis warp ────────────────────────────────────────────────────
// Builds a piecewise-linear warp map so each class band occupies proportional
// visual height on the chart (weighted by CLASS_BANDS weight), rather than the
// raw linear % scale which compresses A/M/GM shooters into the top sliver.
// Returns an array of { real, visual } breakpoints, or null if only one band
// is visible (in which case the chart falls back to a linear scale).
function buildWarpMap(lo, hi) {
  const segs = [];
  for (let i = CLASS_BANDS.length - 1; i >= 0; i--) {
    const b = CLASS_BANDS[i];
    const segLo = Math.max(b.min, lo);
    const segHi = Math.min(b.max, hi);
    if (segLo >= segHi) continue;
    segs.push({ lo: segLo, hi: segHi, weight: b.weight || (b.max - b.min) });
  }
  if (segs.length < 2) return null;
  const totalWeight = segs.reduce((s, g) => s + g.weight, 0);
  const pts = [{ real: segs[0].lo, visual: 0 }];
  let vPos = 0;
  for (const seg of segs) {
    vPos += seg.weight / totalWeight;
    pts.push({ real: seg.hi, visual: vPos });
  }
  return pts;
}

// Map a real % value to a [0,1] visual position using a warp map.
function warpPct(v, pts) {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    if (v <= c.real + 0.001) {
      const t = (v - p.real) / (c.real - p.real);
      return p.visual + t * (c.visual - p.visual);
    }
  }
  return 1;
}

function fmtPct(pct) {
  if (pct == null) return '—';
  const b = bandForPct(pct);
  const color = b ? b.text.replace('0.55', '1') : '#8a9bb0';
  const label = b ? ` <small style="font-size:9px;opacity:0.75">${b.label}</small>` : '';
  return `<span style="color:${color}">${pct.toFixed(1)}%${label}</span>`;
}

function chartArea(canvas) {
  return {
    x0: PAD.left,
    y0: PAD.top,
    w:  canvas.width  - PAD.left - PAD.right,
    h:  canvas.height - PAD.top  - PAD.bottom,
  };
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = CHART_BG();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Multi-series line chart ───────────────────────────────────────────────────
function drawMultiSeriesChart(canvas, seriesArr, allDates, opts = {}) {
  const hasData = seriesArr.some(s => s.points.length > 0);
  if (!hasData) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const { yLabel = '', yMin, yMax, invertY = false, trend = false, valueUnit = '%', showClassBands = false } = opts;

  const allY   = seriesArr.flatMap(s => s.points.map(p => p.y)).filter(v => v != null);
  const rawMin = yMin != null ? yMin : Math.min(...allY);
  const rawMax = yMax != null ? yMax : Math.max(...allY);
  const yRange = rawMax - rawMin || 1;

  // Build warp map for class-band-weighted Y-axis when showClassBands is active.
  // Falls back to null (linear scale) when fewer than two bands are visible.
  const warpMap = showClassBands ? buildWarpMap(rawMin, rawMax) : null;

  const dateToCanvasX = date => {
    const idx = allDates.indexOf(date);
    return area.x0 + (idx / Math.max(allDates.length - 1, 1)) * area.w;
  };
  const toY = v => {
    const norm = warpMap ? warpPct(v, warpMap) : (v - rawMin) / yRange;
    return invertY ? area.y0 + norm * area.h : area.y0 + (1 - norm) * area.h;
  };

  // Classification bands (drawn before grid so grid lines appear on top)
  if (showClassBands) {
    CLASS_BANDS.forEach(band => {
      const visMin = Math.max(band.min, rawMin);
      const visMax = Math.min(band.max, rawMax);
      if (visMin >= visMax) return;

      const y1 = toY(visMax); // top of band (higher % = lower canvas Y)
      const y2 = toY(visMin); // bottom of band
      const bh = y2 - y1;
      if (bh < 1) return;

      // Filled band
      ctx.fillStyle = band.fill;
      ctx.fillRect(area.x0, y1, area.w, bh);

      // Dashed boundary line at the top of each band
      ctx.strokeStyle = band.text.replace('0.55', '0.25');
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(area.x0, y1);
      ctx.lineTo(area.x0 + area.w, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label to the right of the chart area
      const midY = y1 + bh / 2;
      ctx.fillStyle = band.text;
      ctx.font      = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(band.label, area.x0 + area.w + 10, midY + 3);
    });
  }

  // Grid
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = rawMin + yRange * i / 5, cy = toY(v);
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), area.x0 - 5, cy + 3);
  }

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h); ctx.stroke();

  // Y label
  ctx.save(); ctx.translate(10, area.y0 + area.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0); ctx.restore();

  // X date labels
  const step = Math.ceil(allDates.length / 8);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  allDates.forEach((d, i) => {
    if (i % step !== 0 && i !== allDates.length - 1) return;
    ctx.fillText(d.substring(5), dateToCanvasX(d), area.y0 + area.h + 14); // MM-DD
  });

  // Legend (if multiple series)
  if (seriesArr.length > 1) {
    let lx = area.x0 + 8;
    const ly = area.y0 + area.h + 30;
    seriesArr.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 7, 12, 8);
      ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'left';
      ctx.fillText(s.label, lx + 16, ly);
      lx += 16 + ctx.measureText(s.label).width + 16;
    });
  }

  // Trend lines (per series, single series only)
  if (trend && seriesArr.length === 1) {
    const pts = seriesArr[0].points;
    if (pts.length >= 3) {
      const xs  = pts.map((_, i) => i);
      const ys  = pts.map(p => p.y);
      const n   = pts.length;
      const sx  = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
      const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0), sx2 = xs.reduce((a, v) => a + v * v, 0);
      const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      const inter = (sy - slope * sx) / n;
      ctx.strokeStyle = 'rgba(255,152,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(dateToCanvasX(pts[0].date),          toY(inter));
      ctx.lineTo(dateToCanvasX(pts[n - 1].date),      toY(slope * (n - 1) + inter));
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Lines + dots
  const hitMap = [];
  seriesArr.forEach(s => {
    const pts = s.points.filter(p => p.y != null);
    if (!pts.length) return;

    ctx.strokeStyle = s.color; ctx.lineWidth = s.dash ? 1.5 : 2;
    if (s.dash) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const cx = dateToCanvasX(p.date), cy = toY(p.y);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    if (s.dash) ctx.setLineDash([]);

    pts.forEach(p => {
      const cx = dateToCanvasX(p.date), cy = toY(p.y);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(cx, cy, s.dash ? 3 : 4, 0, Math.PI * 2); ctx.fill();
      hitMap.push({ cx, cy, color: s.color, seriesLabel: s.label, valueUnit, ...p });
    });
  });

  // Tooltip
  canvas._hitMap    = hitMap;
  canvas._valueUnit = valueUnit;
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const my = (e.clientY - r.top)  * (canvas.height / r.height);
      const h  = (canvas._hitMap || []).find(h => Math.hypot(h.cx - mx, h.cy - my) < 16);
      if (h) {
        const unit = h.valueUnit;
        // Use escHtml for untrusted strings (match names, stage names) in tooltip innerHTML (F1)
        const multiMatchRows = h.multiMatch ? h.multiMatch.map(m => {
          if (unit === '%') {
            const b = bandForPct(m.y);
            const c = b ? b.text.replace('0.55', '1') : '#8a9bb0';
            return `<div class="tt-stage-row"><span class="tt-stage-name">${escHtml(m.label)}</span>`
              + `<span style="color:${c}">${m.y != null ? m.y.toFixed(1) + '%' + (b ? ' ' + b.label : '') : '—'}</span></div>`;
          }
          return `<div class="tt-stage-row"><span class="tt-stage-name">${escHtml(m.label)}</span>`
            + `<span style="color:#8a9bb0">${m.rawPlace}/${m.total} (beat ${m.y.toFixed(1)}%)</span></div>`;
        }).join('') : '';

        if (h.multiMatch) {
          const classBand = unit === '%' ? bandForPct(h.y) : null;
          const classLabel = classBand ? ` <span style="color:${classBand.text};font-size:10px">${classBand.label}</span>` : '';
          const avgLine = unit === '%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}%${classLabel} <span style="font-size:11px;color:#666">avg (div)</span></div>`
            : `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}% <span style="font-size:11px;color:#666">avg beaten</span></div>`;
          tooltipEl.innerHTML = `
            <div class="tt-name">${escHtml(h.label)}</div>
            <div class="tt-date">${escHtml(h.date || '')}</div>
            ${avgLine}
            <div class="tt-stages">${multiMatchRows}</div>
          `;
        } else {
          const classBand = unit === '%' ? bandForPct(h.y) : null;
          const classLabel = classBand
            ? `<span style="color:${classBand.text};font-size:10px;margin-left:6px">${classBand.label}</span>` : '';
          const mainVal = unit === '%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}%${classLabel} <span style="font-size:11px;color:#666">(div)</span></div>`
            : unit === 'place%'
            ? `<div class="tt-score" style="color:${h.color}">Place ${h.rawPlace} / ${h.total} <span style="font-size:11px;color:#666">(beat ${h.y.toFixed(1)}% of field)</span></div>`
            : `<div class="tt-score" style="color:${h.color}">Place ${h.y}${h.total ? ' / ' + h.total : ''}</div>`;
          const divLine = (h.division || h.class_)
            ? `<div class="tt-meta">${escHtml([h.division, h.class_].filter(Boolean).join(' / '))}</div>` : '';
          const overallLine = (unit === '%' && h.overall_pct != null && Math.abs(h.overall_pct - h.y) > 0.1)
            ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% overall</div>` : '';
          const pctLine = (unit === '' && h.overall_pct != null)
            ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% score</div>` : '';
          const nameLine = h.foundBy === 'name'
            ? `<div class="tt-meta" style="color:#ff9800">matched by name</div>` : '';
          const seriesLine = (canvas._hitMap || []).some(x => x.seriesLabel !== h.seriesLabel)
            ? `<div class="tt-meta" style="color:${h.color}">${escHtml(h.seriesLabel)}</div>` : '';
          const matchNameLine = (h.match_name && h.match_name !== h.label)
            ? `<div class="tt-meta">${escHtml(h.match_name)}</div>` : '';
          const hfLine = (h.hf != null && !h.stages?.length)
            ? `<div class="tt-meta">HF ${h.hf.toFixed(4)}</div>` : '';
          const hitsLine = (!h.stages?.length && (h.a || h.c || h.d || h.m || h.ns || h.p_))
            ? `<div class="tt-meta">${[
                h.a  ? `<span style="color:#4caf50">${h.a}A</span>`                    : '',
                h.c  ? `<span style="color:#fdd835">${h.c}C</span>`                    : '',
                h.d  ? `<span style="color:#ff9800">${h.d}D</span>`                    : '',
                h.m  ? `<span style="color:#f44336;font-weight:600">${h.m}M</span>`   : '',
                h.ns ? `<span style="color:#f44336;font-weight:600">${h.ns}NS</span>` : '',
                h.p_ ? `<span style="color:#f44336">${h.p_}P</span>`                  : '',
              ].filter(Boolean).join(' ')}</div>` : '';
          const stagesHtml = (h.stages && h.stages.length > 0)
            ? `<div class="tt-stages">${h.stages.map(s => {
                const clf = isClassifierStage(s);
                const clfBadge = clf ? `<span class="classifier-badge" title="${escHtml(clf.name ? clf.name + ' — ' : '') + 'CM ' + escHtml(clf.number)}">CM ${escHtml(clf.number)}</span>` : '';
                return `
                <div class="tt-stage-row">
                  <span class="tt-stage-name">${clfBadge}${escHtml(s.name)}</span>
                  <span class="tt-stage-hf">${s.hf != null ? s.hf.toFixed(4) : '—'}</span>
                  <span class="tt-stage-hits">${s.a ? '<span style="color:#4caf50">' + s.a + 'A</span> ' : ''}${s.c ? '<span style="color:#fdd835">' + s.c + 'C</span> ' : ''}${s.d ? '<span style="color:#ff9800">' + s.d + 'D</span>' : ''}${s.m ? ' <span style="color:#f44336;font-weight:600">' + s.m + 'M</span>' : ''}${s.ns ? ' <span style="color:#f44336;font-weight:600">' + s.ns + 'NS</span>' : ''}${s.p ? ' <span style="color:#f44336">' + s.p + 'P</span>' : ''}</span>
                </div>`;
              }).join('')}</div>` : '';
          tooltipEl.innerHTML = `
            <div class="tt-name">${escHtml(h.label)}</div>
            <div class="tt-date">${escHtml(h.date || '')}</div>
            ${mainVal}${divLine}${overallLine}${pctLine}${seriesLine}${nameLine}${matchNameLine}${hfLine}${hitsLine}${stagesHtml}
          `;
        }
        const tw = 300, th = (h.multiMatch || h.stages?.length) ? 280 : 130;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
  }
}

function drawLineChart(canvas, points, opts = {}) {
  if (!points.length) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const { yLabel = '', yMin, yMax, invertY = false, color = '#4a9eff', trend = false } = opts;

  const xs     = points.map((_, i) => i);
  const ys     = points.map(p => p.y);
  const rawMin = yMin != null ? yMin : Math.min(...ys);
  const rawMax = yMax != null ? yMax : Math.max(...ys);
  const yRange = rawMax - rawMin || 1;

  const toX = i => area.x0 + (i / Math.max(xs.length - 1, 1)) * area.w;
  const toY = v => {
    const norm = (v - rawMin) / yRange;
    return invertY ? area.y0 + norm * area.h : area.y0 + (1 - norm) * area.h;
  };

  // Grid
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = rawMin + yRange * i / 5, cy = toY(v);
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), area.x0 - 5, cy + 3);
  }

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h); ctx.stroke();

  // Y label
  ctx.save(); ctx.translate(10, area.y0 + area.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0); ctx.restore();

  // Trend
  if (trend && points.length >= 3) {
    const n = points.length;
    const sx = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
    const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0), sx2 = xs.reduce((a, v) => a + v * v, 0);
    const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    const inter = (sy - slope * sx) / n;
    ctx.strokeStyle = 'rgba(255,152,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(toX(0), toY(inter)); ctx.lineTo(toX(n - 1), toY(slope * (n - 1) + inter));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Line
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => { i === 0 ? ctx.moveTo(toX(i), toY(p.y)) : ctx.lineTo(toX(i), toY(p.y)); });
  ctx.stroke();

  // Dots + hit map
  const hitMap = [];
  points.forEach((p, i) => {
    const cx = toX(i), cy = toY(p.y);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    hitMap.push({ cx, cy, label: p.label, value: p.y, date: p.date });
  });

  // X labels (MM-DD)
  const step = Math.ceil(points.length / 8);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const lbl = p.date ? p.date.substring(5) : `#${i+1}`;
    ctx.fillText(lbl, toX(i), area.y0 + area.h + 14);
  });

  // Interactive tooltip
  canvas._hitMap   = hitMap;
  canvas._valueUnit = opts.valueUnit ?? '%';
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const my = (e.clientY - r.top)  * (canvas.height / r.height);
      const h  = (canvas._hitMap || []).find(h => Math.hypot(h.cx - mx, h.cy - my) < 16);
      if (h) {
        const unit = canvas._valueUnit;
        const scoreLine = unit === '%'
          ? `<div class="tt-score">${h.value.toFixed(2)}%</div>`
          : `<div class="tt-score">Place ${h.value}${h.total ? ' / ' + h.total : ''}</div>`;
        const divLine = (h.division || h.class_)
          ? `<div class="tt-meta">${[h.division, h.class_].filter(Boolean).join(' / ')}</div>`
          : '';
        const pctLine = (unit === '' && h.overall_pct != null)
          ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% overall</div>`
          : '';
        const placeLine = (unit === '%' && h.place != null)
          ? `<div class="tt-meta">Place ${h.place}${h.total ? ' / ' + h.total : ''}</div>`
          : '';
        const nameLine = h.foundBy === 'name'
          ? `<div class="tt-meta" style="color:#ff9800">matched by name</div>` : '';

        tooltipEl.innerHTML = `
          <div class="tt-name">${h.label}</div>
          <div class="tt-date">${h.date || ''}</div>
          ${scoreLine}${divLine}${pctLine}${placeLine}${nameLine}
        `;
        // Keep tooltip on screen
        const tw = 260, th = 120;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });
  }
}


function drawMessage(canvas, msg) {
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, canvas);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = '13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

// ── Stacked bar chart — hit zone breakdown ────────────────────────────────────
// bars: [{ date, label, aPct, cPct, dPct, badPct, a, c, d, bad, total }]
// Segments: A (green) / C (yellow) / D (orange) / M+NS (red)
function drawStackedBarChart(canvas, bars) {
  if (!bars.length) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const COLORS = {
    a:   '#4caf50',
    c:   '#fdd835',
    d:   '#ff9800',
    bad: '#f44336',
  };
  const SEGMENTS = ['a', 'c', 'd', 'bad'];
  const SEG_LABELS = { a: 'A', c: 'C', d: 'D', bad: 'M+NS' };

  const n       = bars.length;
  const barW    = Math.max(4, Math.min(40, (area.w / n) * 0.7));
  const gap     = area.w / n;
  const hitMap  = [];

  bars.forEach((bar, i) => {
    const cx = area.x0 + gap * i + gap / 2;
    let yBottom = area.y0 + area.h;

    SEGMENTS.forEach(seg => {
      const pct = bar[seg + 'Pct'];
      if (!pct) return;
      const segH = (pct / 100) * area.h;
      const yTop = yBottom - segH;
      ctx.fillStyle = COLORS[seg];
      ctx.fillRect(cx - barW / 2, yTop, barW, segH);
      yBottom = yTop;
    });

    hitMap.push({ cx, cy: area.y0 + area.h / 2, bar });

    // X label
    if (n <= 12 || i % Math.ceil(n / 8) === 0 || i === n - 1) {
      ctx.fillStyle = TEXT_COLOR();
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.fillText(bar.date ? bar.date.substring(5) : `#${i + 1}`, cx, area.y0 + area.h + 14);
    }
  });

  // Y axis — 0/25/50/75/100%
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(v => {
    const cy = area.y0 + area.h - (v / 100) * area.h;
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v + '%', area.x0 - 5, cy + 3);
  });

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h);
  ctx.stroke();

  // Legend
  let lx = area.x0 + 8;
  const ly = area.y0 + area.h + 30;
  SEGMENTS.forEach(seg => {
    ctx.fillStyle = COLORS[seg];
    ctx.fillRect(lx, ly - 7, 10, 8);
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'left';
    ctx.fillText(SEG_LABELS[seg], lx + 14, ly);
    lx += 14 + ctx.measureText(SEG_LABELS[seg]).width + 14;
  });

  // Tooltip
  canvas._hitMap    = hitMap;
  canvas._valueUnit = 'hitzones';
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const h  = (canvas._hitMap || []).find(h => Math.abs(h.cx - mx) < (area.w / bars.length) / 2);
      if (h) {
        const b = h.bar;
        tooltipEl.innerHTML = `
          <div class="tt-name">${escHtml(b.label)}</div>
          <div class="tt-date">${escHtml(b.date || '')}</div>
          <div class="tt-meta" style="margin-top:4px">
            <span style="color:#4caf50">${b.a}A (${b.aPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#fdd835">${b.c}C (${b.cPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#ff9800">${b.d}D (${b.dPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#f44336;font-weight:600">${b.bad} M+NS (${b.badPct.toFixed(0)}%)</span>
          </div>
          <div class="tt-meta" style="color:#666">${b.total} total hits</div>
        `;
        const tw = 280, th = 110;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
  }
}
