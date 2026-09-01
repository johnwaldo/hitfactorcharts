// dashboard.js

// ── Global state (declared first to avoid TDZ in event handlers below) ────────
let allResults = [];

// ── Size canvases to their visible CSS-pixel dimensions ───────────────────────
function sizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  canvas._logicalWidth = rect.width;
  canvas._logicalHeight = rect.height;
  canvas._canvasScaleX = width / rect.width;
  canvas._canvasScaleY = height / rect.height;
  return true;
}

function sizeCanvases() {
  document.querySelectorAll('canvas').forEach(sizeCanvas);
}

let resizeFrame = null;
function scheduleDashboardResize() {
  if (resizeFrame !== null) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    renderAll();
  });
}

window.addEventListener('resize', scheduleDashboardResize);
document.addEventListener('DOMContentLoaded', sizeCanvases);

// ── Version display ───────────────────────────────────────────────────────────
document.getElementById('headerVersion').textContent = 'v' + chrome.runtime.getManifest().version;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const memberInput  = document.getElementById('memberInput');
const nameInput    = document.getElementById('nameInput');
const divisionFilter = document.getElementById('divisionFilter');
const fetchTimelineSelect = document.getElementById('fetchTimeline');
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
const last8MatchesChk = document.getElementById('last8MatchesChk');
const last8ToggleWrap = document.getElementById('last8ToggleWrap');
const last8StatusEl = document.getElementById('last8Status');
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
let stageOverrides    = {};     // match_id -> stage key -> { included: false, note: string }
let selectedDiv       = null;     // canonical division key (null = no selection)
let selectedDatePreset = '6m';   // analytics range; resets to six months on dashboard load
let classificationData = null;  // data from uspsa.org/classification/[memberNumber]
let classifiersOnly  = false;   // when true, charts show only classifier stage scores
let adjustedOnly     = false;   // when true, Score Over Time shows only adjusted match points
let selectedFetchTimeline = '6m'; // pre-fetch request scope; independent of analytics range
let last8Matches = false;       // post-fetch analytics limit; never truncates cached history
let matchTypeOverrides = {};    // match_id -> manual type for otherwise unconfirmed matches
let lastFetchScope = null;
let lastFetchDiagnostics = null;
let fetchCoverage = null;       // verified cumulative fetch intervals; null preserves pre-metadata behavior

const FETCH_TIMELINE_PRESETS = Object.freeze({
  '1m':  { label: 'Last 1 month', months: 1 },
  '3m':  { label: '3 mo',         months: 3 },
  '6m':  { label: '6 mo',         months: 6 },
  '1y':  { label: '1 yr',         months: 12 },
});

function normalizeFetchTimeline(value) {
  return Object.hasOwn(FETCH_TIMELINE_PRESETS, value) ? value : '6m';
}

function resolveFetchTimeline(value, referenceDate = new Date()) {
  const normalized = normalizeFetchTimeline(value);
  const preset = FETCH_TIMELINE_PRESETS[normalized];
  const end = localDateOnly(referenceDate);
  const start = subtractCalendarMonths(end, preset.months);
  return { value: normalized, label: preset.label, start, end };
}

const NON_USPSA_TYPES = new Set(['IDPA', 'IPSC', 'Steel Challenge', '3-Gun', 'PCSL', 'ICORE', 'SCSA']);
const MANUAL_MATCH_TYPES = Object.freeze(['USPSA', 'IDPA', 'IPSC', 'Steel Challenge', '3-Gun', 'PCSL', 'ICORE']);
const SOURCE_MATCH_TYPES = new Set([...MANUAL_MATCH_TYPES, 'Hit Factor', 'SCSA', 'Unknown']);
// Confirmed USPSA types — only these count toward the USPSA match total in the status line.
const CONFIRMED_USPSA_TYPES = new Set(['USPSA', 'Hit Factor']);

function detectMatchType(name) {
  const normalized = String(name || '').toUpperCase();
  if (/\bIDPA\b/.test(normalized)) return 'IDPA';
  if (/\bIPSC\b/.test(normalized)) return 'IPSC';
  if (/\bSTEEL[\s-]?CHALLENGE\b|\bSCSA\b/.test(normalized)) return 'Steel Challenge';
  if (/\b3[\s-]?GUN\b/.test(normalized)) return '3-Gun';
  if (/\bPCSL\b/.test(normalized)) return 'PCSL';
  if (/\bICORE\b/.test(normalized)) return 'ICORE';
  if (/\bUSPSA\b/.test(normalized)) return 'USPSA';
  if (/\b(CARRY[\s-]?OPTICS|CARRYOPTICS|SINGLE[\s-]?STACK|SINGLESTACK|LIMITED[\s-]?OPTICS|LIMITEDOPTICS)\b/.test(normalized)) return 'USPSA';
  return 'Unknown';
}

function normalizeMatchTypeOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const [matchId, matchType] of Object.entries(value)) {
    if (!matchId || ['__proto__', 'prototype', 'constructor'].includes(matchId)) continue;
    if (MANUAL_MATCH_TYPES.includes(matchType)) normalized[matchId] = matchType;
  }
  return normalized;
}

function baseMatchType(match) {
  const storedType = typeof match?.match_type === 'string' ? match.match_type.trim() : '';
  if (SOURCE_MATCH_TYPES.has(storedType) && storedType !== 'Unknown') return storedType;
  return detectMatchType(match?.match_name);
}

function isUnconfirmedMatchType(match) {
  return baseMatchType(match) === 'Unknown';
}

function effectiveMatchType(match) {
  const detectedType = baseMatchType(match);
  if (detectedType !== 'Unknown') return detectedType;
  return matchTypeOverrides[match?.match_id] || detectedType;
}

function isLikelyUSPSA(matchType) { return !NON_USPSA_TYPES.has(matchType); }
function isConfirmedUSPSA(matchType) { return CONFIRMED_USPSA_TYPES.has(matchType); }

function isChartable(r) {
  return isLikelyUSPSA(effectiveMatchType(r));
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
  LIMITED10: 'l10', PISTOLCALIBERCARBINE: 'pcc',
};

const DIVISION_LABELS = {
  co: 'Carry Optics', lo: 'Limited Optics', opn: 'Open', prod: 'Production',
  ltd: 'Limited', l10: 'Limited 10', pcc: 'PCC', rev: 'Revolver', ss: 'Single Stack',
};

// Convert a PractiScore division string to hitfactor.info key
function psDivToHfi(psDiv) {
  if (!psDiv) return null;
  const key = psDiv.trim().toUpperCase().replace(/[\s\-]+/g, '');
  return PS_DIV_TO_HFI[key] || key.toLowerCase();
}

function normalizeDivision(psDiv) {
  const key = psDivToHfi(psDiv);
  return key && DIVISION_LABELS[key] ? key : null;
}

function divisionLabel(psDiv) {
  const key = normalizeDivision(psDiv);
  return key ? DIVISION_LABELS[key] : (psDiv || 'Unknown');
}

function matchesSelectedDivision(match) {
  return Boolean(selectedDiv) && normalizeDivision(match?.division) === selectedDiv;
}

// Compute field-strength-adjusted stage percentage.
// Classifier stages are intentionally skipped: official classifier percentages
// are already normalized against USPSA national division data, so applying this
// match-field adjustment would double-normalize them.
//
// Compare the strongest actual stage result from every represented division.
// Each top HF is translated to the shooter's division using DIVISION_FACTORS;
// the shooter's own division participates at factor 1.0. Using the strongest
// normalized result prevents a weak GM/M stage from inflating the percentage and
// guarantees a natural 0–100 range because the own-division winner is eligible.
//
// Returns { adjPct, refDiv, refClass, refHF, normHF, method } or null.
function computeAdjustedPct(stage, shooterDiv) {
  if (isClassifierStage(stage)) return null;
  if (!stage.hf || stage.hf <= 0) return null;

  const myDivKey = psDivToHfi(shooterDiv);
  if (!myDivKey || !DIVISION_FACTORS[myDivKey]) return null;

  const benchmarks = stage.xdiv_benchmarks;
  if (!benchmarks) return null;

  let bestNormalizedRef = 0;
  let bestRefDiv = null;
  let bestRefClass = null;
  let bestRefHF = null;

  for (const [psDiv, bench] of Object.entries(benchmarks)) {
    const srcDivKey = psDivToHfi(psDiv);
    if (!srcDivKey || !bench.topHF || bench.topHF <= 0) continue;
    const factor = srcDivKey === myDivKey ? 1 : DIVISION_FACTORS[myDivKey]?.[srcDivKey];
    if (!factor) continue;

    const normalized = bench.topHF * factor;
    if (normalized > bestNormalizedRef) {
      bestNormalizedRef = normalized;
      bestRefDiv        = psDiv;
      bestRefClass      = bench.topClass || '?';
      bestRefHF         = bench.topHF;
    }
  }

  if (bestNormalizedRef <= 0) return null;

  const adjPct = Math.min((stage.hf / bestNormalizedRef) * 100, 100);
  return {
    adjPct,
    refDiv:   bestRefDiv,
    refClass: bestRefClass,
    refHF:    bestRefHF,
    normHF:   bestNormalizedRef,
    method:   'top_hf',
  };
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

function stageKey(stage, index) {
  const num = stage?.num != null ? String(stage.num).padStart(2, '0') : String(index + 1).padStart(2, '0');
  return `${num}|${normalizeStgName(stage?.name || '')}`;
}

function getStageOverride(match, stage, index) {
  const matchOverrides = stageOverrides?.[match.match_id];
  if (!matchOverrides) return {};
  const exact = matchOverrides[stageKey(stage, index)];
  if (exact) return exact;
  const num = stage?.num != null ? String(stage.num).padStart(2, '0') : String(index + 1).padStart(2, '0');
  const numberKey = Object.keys(matchOverrides).find(key => key.startsWith(`${num}|`));
  return numberKey ? matchOverrides[numberKey] : {};
}

function isStageIncluded(match, stage, index) {
  return getStageOverride(match, stage, index).included !== false;
}

function getMetricStages(match) {
  if (!match?.stages?.length) return [];
  return match.stages.filter((stage, index) => isStageIncluded(match, stage, index));
}

function stageReportsHit(stage, key) {
  return stage?.hit_columns?.[key] === true;
}

function reportedStageHit(stage, key) {
  if (!stageReportsHit(stage, key)) return null;
  const value = Number(stage[key]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function excludedStageCount(match) {
  if (!match?.stages?.length) return 0;
  return match.stages.length - getMetricStages(match).length;
}

function hasExcludedStages(match) {
  return excludedStageCount(match) > 0;
}

function filteredStagePct(match) {
  if (!hasExcludedStages(match)) return null;
  const pcts = getMetricStages(match).map(s => s.pct).filter(v => v != null);
  return pcts.length ? _avg(pcts) : null;
}

function effectiveOverallPct(match) {
  return filteredStagePct(match) ?? match.overall_pct ?? null;
}

function effectiveDivPct(match) {
  return filteredStagePct(match) ?? match.div_pct ?? match.overall_pct ?? null;
}

async function saveStageOverrides() {
  await chrome.storage.local.set({ stageOverrides });
}

function setMatchStageOverrides(matchId, nextOverrides) {
  if (Object.keys(nextOverrides).length) {
    stageOverrides = { ...stageOverrides, [matchId]: nextOverrides };
  } else {
    const { [matchId]: _removed, ...rest } = stageOverrides;
    stageOverrides = rest;
  }
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
    await chrome.storage.local.remove(['matchCache', 'lastMatchList', 'stageOverrides', 'fetchCoverage']);
    fetchCoverage = null;
    renderDateRangeFilter();
    allResults = [];
    stageOverrides = {};
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
chrome.storage.local.get(['memberNumber', 'name', 'lastMatchList', 'matchCache', 'deselectedMatches', 'stageOverrides', 'classificationData', 'selectedDivision', 'fetchTimeline', 'last8Matches', 'matchTypeOverrides', 'fetchCoverage'], async d => {
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
  if (d.stageOverrides && typeof d.stageOverrides === 'object') stageOverrides = d.stageOverrides;
  selectedDiv = normalizeDivision(d.selectedDivision);
  divisionFilter.value = selectedDiv || '';
  selectedFetchTimeline = normalizeFetchTimeline(d.fetchTimeline);
  fetchTimelineSelect.value = selectedFetchTimeline;
  last8Matches = d.last8Matches === true;
  matchTypeOverrides = normalizeMatchTypeOverrides(d.matchTypeOverrides);
  fetchCoverage = normalizeFetchCoverage(d.fetchCoverage);
  ensureAvailableDatePreset();
  renderDateRangeFilter();
  renderLast8Control();

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
      updateStatusCounts('Showing cached data:');
    }
  }
});

// ── View toggle ───────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'ranked') {
    classifiersOnly = false;
    adjustedOnly = false;
  }
  syncChartModeControls();
}

function syncChartModeControls() {
  const modes = [
    ['classifiersOnlyChk', 'classifiersToggleWrap', classifiersOnly],
    ['adjustedOnlyChk', 'adjustedToggleWrap', adjustedOnly],
  ];
  modes.forEach(([inputId, wrapId, active]) => {
    document.getElementById(inputId).checked = active;
    const wrap = document.getElementById(wrapId);
    wrap.classList.toggle('active', active);
    wrap.style.display = currentView === 'ranked' ? 'flex' : 'none';
  });
}

function setChartMode(mode, enabled) {
  if (mode === 'classifiers') {
    classifiersOnly = enabled;
    if (enabled) adjustedOnly = false;
  } else {
    adjustedOnly = enabled;
    if (enabled) classifiersOnly = false;
  }
  syncChartModeControls();
  renderAll();
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    renderAll();
  });
});

document.getElementById('classifiersOnlyChk').addEventListener('change', e => {
  setChartMode('classifiers', e.target.checked);
});

document.getElementById('adjustedOnlyChk').addEventListener('change', e => {
  setChartMode('adjusted', e.target.checked);
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  exportChartCSV();
});

divisionFilter.addEventListener('change', () => {
  selectedDiv = normalizeDivision(divisionFilter.value);
  chrome.storage.local.set({ selectedDivision: selectedDiv });
  renderAll();
  renderMatchList();
  updateStatusCounts();
});

fetchTimelineSelect.addEventListener('change', () => {
  selectedFetchTimeline = normalizeFetchTimeline(fetchTimelineSelect.value);
  fetchTimelineSelect.value = selectedFetchTimeline;
  chrome.storage.local.set({ fetchTimeline: selectedFetchTimeline });
});

// ── Fetch button ──────────────────────────────────────────────────────────────
fetchBtn.addEventListener('click', async () => {
  const memberNumber = memberInput.value.trim().toUpperCase();
  const name         = nameInput.value.trim();
  selectedDiv = normalizeDivision(divisionFilter.value);
  selectedFetchTimeline = normalizeFetchTimeline(fetchTimelineSelect.value);
  const fetchTimeline = resolveFetchTimeline(selectedFetchTimeline);
  if (!selectedDiv) {
    setStatus('Please select a USPSA division before fetching scores.', 'error');
    divisionFilter.focus();
    return;
  }
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
    await chrome.storage.local.remove(['matchCache', 'lastMatchList', 'stageOverrides', 'fetchCoverage']);
    fetchCoverage = null;
    renderDateRangeFilter();
    allResults = [];
    stageOverrides = {};
    summaryBar.classList.remove('visible');
    chartsEl.classList.remove('visible');
    matchHistory.classList.remove('visible');
  }

  chrome.storage.local.set({ memberNumber, name, fetchTimeline: selectedFetchTimeline });
  lockInputs();
  setStatus(`Opening PractiScore tab — fetch timeline: ${fetchTimeline.label}…`, '', true);
  fetchBtn.disabled = true;
  noDataEl.style.display   = 'none';
  debugLogEl.style.display = 'none';
  allResults = [];

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fetchScores', memberNumber, name, fetchTimeline,
    });
    if (!response.ok) throw new Error(response.error || 'Unknown error');
    if (response.data._not_logged_in_ps) {
      document.getElementById('psLoginWarning').style.display = 'block';
      setStatus('Not logged into PractiScore. Please log in and try again.', 'error');
      return;
    }
    document.getElementById('psLoginWarning').style.display = 'none';

    const { results, log, fetchScope } = response.data;
    lastFetchScope = fetchScope || fetchTimeline;
    lastFetchDiagnostics = response.data.fetchDiagnostics || null;
    fetchCoverage = normalizeFetchCoverage(response.data.fetchCoverage);
    ensureAvailableDatePreset();
    renderDateRangeFilter();

    if (log?.length) {
      debugLogEl.textContent = log.join('\n');
      debugLogEl.style.display = 'block';
    }

    if (!results?.length) {
      noDataEl.style.display = 'block';
      setStatus(`No matches found in ${lastFetchScope.label} (${lastFetchScope.inRangeCount || 0} in range).`, 'error');
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

// ── Analytics date-range presets ──────────────────────────────────────────────
const DATE_RANGE_PRESETS = Object.freeze({
  '1m':  { label: 'Last 1 month', months: 1,  fileTag: 'last 1 month' },
  '3m':  { label: '3 mo',         months: 3,  fileTag: 'last 3 months' },
  '6m':  { label: '6 mo',         months: 6,  fileTag: 'last 6 months' },
  '1y':  { label: '1 yr',         months: 12, fileTag: 'last 1 year' },
});

function normalizeDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function localDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractCalendarMonths(dateOnly, months) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const monthIndex = month - 1 - months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return localDateOnly(new Date(targetYear, targetMonth, Math.min(day, lastDay)));
}

function addCalendarDays(dateOnly, days) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return localDateOnly(new Date(year, month - 1, day + days));
}

function normalizeFetchCoverage(value, today = localDateOnly()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.allTime === true) return { allTime: true, intervals: [] };
  if (!Array.isArray(value.intervals) || value.intervals.length === 0) return null;

  const intervals = [];
  for (const interval of value.intervals) {
    const start = normalizeDateOnly(interval?.start);
    const end = normalizeDateOnly(interval?.end);
    if (!start || !end || start > end || end > today) return null;
    intervals.push({ start, end });
  }

  intervals.sort((left, right) => left.start.localeCompare(right.start));
  return {
    allTime: false,
    intervals: intervals.reduce((merged, interval) => {
      const previous = merged.at(-1);
      if (previous && interval.start <= addCalendarDays(previous.end, 1)) {
        if (interval.end > previous.end) previous.end = interval.end;
      } else {
        merged.push({ ...interval });
      }
      return merged;
    }, []),
  };
}

function isDatePresetAvailable(presetKey, referenceDate = new Date()) {
  const preset = DATE_RANGE_PRESETS[presetKey];
  if (!preset) return false;
  if (!fetchCoverage || fetchCoverage.allTime) return true;
  const end = localDateOnly(referenceDate);
  const start = subtractCalendarMonths(end, preset.months);
  return fetchCoverage.intervals.some(interval => interval.start <= start && interval.end >= end);
}

function ensureAvailableDatePreset(referenceDate = new Date()) {
  if (isDatePresetAvailable(selectedDatePreset, referenceDate)) return;
  const available = Object.keys(DATE_RANGE_PRESETS).filter(key => isDatePresetAvailable(key, referenceDate));
  if (available.length > 0) selectedDatePreset = available.at(-1);
}

function activeDateBounds(referenceDate = new Date()) {
  const preset = DATE_RANGE_PRESETS[selectedDatePreset] || DATE_RANGE_PRESETS['6m'];
  const end = localDateOnly(referenceDate);
  return { start: subtractCalendarMonths(end, preset.months), end };
}

function filterByActiveDateRange(records, referenceDate = new Date()) {
  const bounds = activeDateBounds(referenceDate);
  return records.filter(record => {
    const date = normalizeDateOnly(record.date);
    if (!date) return false;
    return !bounds || (date >= bounds.start && date <= bounds.end);
  });
}

function applyLast8Limit(records) {
  return last8Matches ? records.slice(-8) : records;
}

// Keep every chart surface and the CSV export on the same final filter pipeline.
// Intermediate sets make empty-state explanations specific without mutating state.
function selectAnalyticsRecords(referenceDate = new Date()) {
  const chartableBase = allResults.filter(isChartable);
  const selectedRecords = chartableBase.filter(r => !deselectedMatches.has(r.match_id));
  const viewRecords = currentView === 'ranked'
    ? selectedRecords.filter(r => r.found_by === 'member_number' && effectiveOverallPct(r) != null)
    : selectedRecords.filter(r => effectiveOverallPct(r) != null || r.hf != null);
  const divisionRecords = viewRecords.filter(matchesSelectedDivision).sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });
  const rangeRecords = filterByActiveDateRange(divisionRecords, referenceDate);

  return {
    chartableBase,
    selectedRecords,
    viewRecords,
    divisionRecords,
    rangeRecords,
    records: applyLast8Limit(rangeRecords),
  };
}

function renderLast8Control(totalCount = null, visibleCount = null) {
  last8MatchesChk.checked = last8Matches;
  last8ToggleWrap.classList.toggle('active', last8Matches);
  if (totalCount == null || visibleCount == null) {
    last8StatusEl.textContent = last8Matches ? 'Last 8 enabled' : 'All matches in range';
    return;
  }
  const noun = totalCount === 1 ? 'match' : 'matches';
  last8StatusEl.textContent = last8Matches
    ? `Showing ${visibleCount} of ${totalCount} ${noun} in range`
    : `${totalCount} ${noun} in range`;
}

function renderDateRangeFilter() {
  document.querySelectorAll('[data-date-preset]').forEach(button => {
    const available = isDatePresetAvailable(button.dataset.datePreset);
    const active = available && button.dataset.datePreset === selectedDatePreset;
    button.classList.toggle('active', active);
    button.classList.toggle('unavailable', !available);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-disabled', String(!available));
    if (available) button.removeAttribute('aria-describedby');
    else button.setAttribute('aria-describedby', 'dateRangeAvailabilityHelp');
    button.title = available ? '' : 'Fetch a longer timeline to use this range.';
  });
}

document.querySelectorAll('[data-date-preset]').forEach(button => {
  button.addEventListener('click', () => {
    if (!DATE_RANGE_PRESETS[button.dataset.datePreset] || !isDatePresetAvailable(button.dataset.datePreset)) return;
    selectedDatePreset = button.dataset.datePreset;
    renderDateRangeFilter();
    renderAll();
  });
});
renderDateRangeFilter();

last8MatchesChk.addEventListener('change', () => {
  last8Matches = last8MatchesChk.checked;
  chrome.storage.local.set({ last8Matches });
  renderAll();
});
renderLast8Control();

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

function resetSecondaryAnalysis() {
  ['chartNonClfSection', 'chartClfOverlaySection', 'chartAccuracySection', 'chartHitZoneSection']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });
  ['chartTimeSummary', 'chartAdjSummary', 'chartPlaceSummary', 'chartClfSummary']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });
  document.getElementById('chartPlaceSubtitle').textContent = '';
}

function renderAll() {
  renderDateRangeFilter();
  if (!allResults.length) {
    renderLast8Control(0, 0);
    return;
  }

  const analyticsSelection = selectAnalyticsRecords();
  const { viewRecords, divisionRecords: sorted, rangeRecords: rangeSorted, records: viewSorted } = analyticsSelection;
  const divs = [...new Set(viewRecords.map(r => normalizeDivision(r.division)).filter(Boolean))];
  summaryBar.classList.add('visible');
  chartsEl.classList.add('visible');
  syncChartModeControls();

  if (sorted.length === 0) {
    renderLast8Control(0, 0);
    const msg = selectedDiv
      ? `No ${divisionLabel(selectedDiv)} matches found in the current view.`
      : currentView === 'ranked'
      ? 'No member-number confirmed scores.\nSwitch to "All Matches" to see name-matched results.'
      : 'No data.';
    setPlacementVisible(!classifiersOnly);
    resetSecondaryAnalysis();
    drawMessage(document.getElementById('chartTime'),  msg);
    if (!classifiersOnly) drawMessage(document.getElementById('chartPlace'), msg);
    document.getElementById('statMatches').textContent = '0';
    document.getElementById('statAvg').textContent     = '—';
    document.getElementById('statBest').textContent    = '—';
    document.getElementById('statDiv').textContent     = selectedDiv ? divisionLabel(selectedDiv) : '—';
    document.getElementById('statConsistencyBox').style.display = 'none';
    document.getElementById('statAdjAvgBox').style.display = 'none';
    document.getElementById('chartTimeTitle').textContent = classifiersOnly
      ? 'Classifier Scores Over Time'
      : adjustedOnly
      ? 'Adjusted % Over Time'
      : 'Score Over Time';
    renderClassBox(selectedDiv);
    return;
  }

  // Apply one shared range and optional recent-match limit to every analytics surface.
  renderLast8Control(rangeSorted.length, viewSorted.length);

  if (viewSorted.length === 0) {
    const msg = selectedDiv
      ? `No ${divisionLabel(selectedDiv)} matches found in the selected date range.`
      : 'No matches found in the selected date range.';
    setPlacementVisible(!classifiersOnly);
    resetSecondaryAnalysis();
    drawMessage(document.getElementById('chartTime'), msg);
    if (!classifiersOnly) drawMessage(document.getElementById('chartPlace'), msg);
    document.getElementById('statMatches').textContent = '0';
    document.getElementById('statAvg').textContent = '—';
    document.getElementById('statBest').textContent = '—';
    document.getElementById('statDiv').textContent = selectedDiv
      ? divisionLabel(selectedDiv)
      : (divs.length === 1 ? divisionLabel(divs[0]) : 'All');
    document.getElementById('statConsistencyBox').style.display = 'none';
    document.getElementById('statAdjAvgBox').style.display = 'none';
    document.getElementById('chartTimeTitle').textContent = classifiersOnly
      ? 'Classifier Scores Over Time'
      : adjustedOnly
      ? 'Adjusted % Over Time'
      : 'Score Over Time';
    renderClassBox(selectedDiv);
    return;
  }

  const overallPcts = viewSorted.map(r => effectiveOverallPct(r)).filter(v => v != null);
  const avg  = overallPcts.length ? _avg(overallPcts) : 0;
  const best = overallPcts.length ? Math.max(...overallPcts) : 0;

  document.getElementById('statMatches').textContent = viewSorted.length;
  document.getElementById('statAvg').textContent     = avg.toFixed(1) + '%';
  document.getElementById('statAvg').style.color     = '#4a9eff';
  document.getElementById('statBest').textContent    = best.toFixed(1) + '%';
  document.getElementById('statBest').style.color    = '#4a9eff';

  // Stat box tooltips — explain what each metric measures
  const divLabel = selectedDiv ? ` in ${divisionLabel(selectedDiv)}` : '';
  const filteredStageTotal = viewSorted.reduce((sum, r) => sum + excludedStageCount(r), 0);
  const filteredStageTip = filteredStageTotal
    ? `\n${filteredStageTotal} excluded stage${filteredStageTotal > 1 ? 's are' : ' is'} omitted; filtered match scores use the average included stage %.`
    : '';
  document.getElementById('statAvgBox').dataset.tip =
    `Your average match score${divLabel}.\n` +
    `Calculated as your points ÷ the match winner's points × 100,\n` +
    `averaged across all checked matches in the current view.` + filteredStageTip;
  document.getElementById('statBestBox').dataset.tip =
    `Your highest single-match score${divLabel}.\n` +
    `Match score = your points ÷ match winner's points × 100.\n` +
    `This is match-relative performance, not an official classification percentage.` + filteredStageTip;

  // ── Consistency stat card ─────────────────────────────────────────────────
  // Standard deviation of match %. Low stddev = consistent performer.
  // Only shown when ≥3 matches (stddev is meaningless on 1-2 points).
  const consistencyBox = document.getElementById('statConsistencyBox');
  const consistencyVal = document.getElementById('statConsistency');
  const pcts = viewSorted.map(r => effectiveOverallPct(r)).filter(v => v != null);
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
    const adjStages = getMetricStages(r)
      .map(s => computeAdjustedPct(s, r.division))
      .filter(a => a != null);
    if (!adjStages.length) continue;
    adjMatchPcts.push(adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length);
  }
  if (adjMatchPcts.length >= 1) {
    const adjAvg = adjMatchPcts.reduce((s, v) => s + v, 0) / adjMatchPcts.length;
    adjAvgVal.textContent = adjAvg.toFixed(1) + '%';
    adjAvgVal.style.color = '#ff4081';
    const adjAvgLbl = adjAvgBox.querySelector('.lbl');
    if (adjAvgLbl) adjAvgLbl.textContent = 'Adj Avg %';
    adjAvgBox.dataset.tip =
      `Field-strength adjusted average (${adjMatchPcts.length} match${adjMatchPcts.length > 1 ? 'es' : ''}).\n` +
      `Uses non-classifier stages and the best HF from any division at each match,\n` +
      `normalized to your division using HHF ratios from hitfactor.info.\n` +
      `Classifier stages are skipped because USPSA % is already nationally normalized.\n` +
      `This gives a more accurate read when the division field varies in strength.\n` +
      `Raw avg: ${avg.toFixed(1)}% → Adjusted: ${adjAvg.toFixed(1)}%. Neither is an official classification percentage.`;
    adjAvgBox.style.display = '';
  } else {
    adjAvgBox.style.display = 'none';
  }

  // Division stat box mirrors the primary filter and is intentionally display-only.
  const divStatBox = document.getElementById('statDiv').closest('.stat-box');
  const divStatVal = document.getElementById('statDiv');
  const divLblEl = divStatBox.querySelector('.lbl');
  divStatBox.classList.remove('clickable', 'active-filter');
  divStatBox.onclick = null;
  if (divLblEl) divLblEl.title = 'Use the division selector above to filter all progress data.';
  if (divs.length > 0) {
    divStatVal.textContent = selectedDiv
      ? divisionLabel(selectedDiv)
      : (divs.length === 1 ? divisionLabel(divs[0]) : 'All');
  } else {
    divStatVal.textContent = '—';
  }

  // Official classification stat box (D-GM class from USPSA.org)
  renderClassBox(selectedDiv || (divs.length === 1 ? normalizeDivision(divs[0]) : null));

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
      for (const s of getMetricStages(r)) {
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
          division: divisionLabel(r.division),
          code: clf.number,
          a: reportedStageHit(s, 'a'), b: reportedStageHit(s, 'b'),
          c: reportedStageHit(s, 'c'), d: reportedStageHit(s, 'd'),
          m: reportedStageHit(s, 'm'), ns: reportedStageHit(s, 'ns'),
          m_ns: reportedStageHit(s, 'm_ns'), p: reportedStageHit(s, 'p'),
        });
      }
    }

    // Sort chronologically
    clfPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Classifier-only mode never displays the normal analysis charts.
    resetSecondaryAnalysis();

    if (clfPoints.length === 0) {
      document.getElementById('statMatches').textContent = '0';
      document.getElementById('statAvg').textContent  = '—';
      document.getElementById('statBest').textContent = '—';
      document.getElementById('chartTimeTitle').textContent = 'Classifier Scores Over Time';
      setPlacementVisible(false);
      drawMessage(document.getElementById('chartTime'), 'No classifier stages found.\nRefresh matches to detect classifiers.');
      return;
    }

    // Stats: use official pcts where available
    const officialPcts = clfPoints.filter(p => p.isOfficial).map(p => p.y);
    const statPcts     = officialPcts.length ? officialPcts : clfPoints.map(p => p.y);
    const clfAvg  = statPcts.reduce((s, v) => s + v, 0) / statPcts.length;
    const clfBest = Math.max(...statPcts);
    const hasOfficialStats = officialPcts.length > 0;
    const avgBandC  = hasOfficialStats ? CLASS_BANDS.find(b => clfAvg  >= b.min && clfAvg  < b.max) : null;
    const bestBandC = hasOfficialStats ? CLASS_BANDS.find(b => clfBest >= b.min && clfBest < b.max) : null;

    document.getElementById('statMatches').textContent = clfPoints.length;
    document.getElementById('statAvg').textContent  = clfAvg.toFixed(1) + '%';
    document.getElementById('statAvg').style.color  = avgBandC?.text.replace('0.55','1') || '#4a9eff';
    document.getElementById('statBest').textContent = clfBest.toFixed(1) + '%';
    document.getElementById('statBest').style.color = bestBandC?.text.replace('0.55','1') || '#4a9eff';
    if (avgLbl) avgLbl.textContent = avgBandC ? `Avg % · ${avgBandC.label} Class` : 'Avg %';

    // Classifier-mode tooltips
    const clfSource = hasOfficialStats ? 'official USPSA % vs national HHF' : 'match % vs match top HF';
    document.getElementById('statAvgBox').dataset.tip =
      `Your average classifier score (${clfSource}),\n` +
      `averaged across all classifier stages in the current view.\n` +
      `USPSA uses your best 6 classifiers to set your classification.`;
    document.getElementById('statBestBox').dataset.tip =
      `Your highest single classifier score (${clfSource}).\n` +
      (hasOfficialStats
        ? `Color indicates the USPSA classification band for that official score.\n` +
          `GM = 95%+, M = 85–95%, A = 75–85%, B = 60–75%, C = 40–60%.`
        : `Match-relative fallback values do not receive an inferred USPSA class.`);

    // Build series grouped by division — gives continuous lines over time
    const DIV_PALETTE = ['#4a9eff','#4caf50','#ff9800','#e91e63','#9c27b0','#00bcd4','#ffeb3b','#ff5722'];
    const divKeys = [...new Set(clfPoints.map(p => p.division))];
    const series = divKeys.map((div, i) => ({
      label: div,
      color: DIV_PALETTE[i % DIV_PALETTE.length],
      points: clfPoints
        .filter(p => p.division === div)
        .map(p => ({ date: p.date, y: p.y, label: p.label, match_name: p.match_name, hf: p.hf,
                     isOfficial: p.isOfficial, a: p.a, b: p.b, c: p.c, d: p.d,
                     m: p.m, ns: p.ns, m_ns: p.m_ns, p_: p.p })),
    }));

    const allClfDates = [...new Set(clfPoints.map(p => p.date))].sort();

    const allClassifierScoresOfficial = clfPoints.every(point => point.isOfficial);
    document.getElementById('chartTimeTitle').textContent = 'Classifier Scores Over Time'
      + (allClassifierScoresOfficial
        ? ' (official %)'
        : officialPcts.length
        ? ' (official and match-relative %)'
        : ' (match % — log in to USPSA.org for official %)');
    drawMultiSeriesChart(document.getElementById('chartTime'), series, allClfDates, {
      yLabel: 'Classifier %', yMin: 0, yMax: 100, invertY: false,
      trend: true, valueUnit: 'classifier%',
      showClassBands: allClassifierScoresOfficial,
    });
    setPlacementVisible(false);
    return;
  }

  // ── Normal mode ──────────────────────────────────────────────────────────────
  document.getElementById('chartTimeTitle').textContent = 'Score Over Time';
  setPlacementVisible(true);
  if (avgLbl) avgLbl.textContent = 'Avg match %';

  const DIV_PALETTE = ['#4a9eff','#4caf50','#ff9800','#e91e63','#9c27b0','#00bcd4','#ffeb3b'];

  // Group viewSorted results by division
  const byDiv = {};
  viewSorted.forEach(r => {
    const key = divisionLabel(r.division);
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
      const ys = group.map(r => effectiveDivPct(r)).filter(v => v != null);
      const avgY = ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
      if (group.length === 1) {
        const r = group[0];
        return { date, y: avgY, label: r.match_name, division: r.division,
          overall_pct: effectiveOverallPct(r), div_pct: effectiveDivPct(r),
          place: r.div_place ?? r.place, total: r.div_total ?? r.total,
          foundBy: r.found_by, stages: getMetricStages(r) };
      }
      return { date, y: avgY, label: `${group.length} matches`, multiMatch: group.map(r => ({
        label: r.match_name, y: effectiveDivPct(r), overall_pct: effectiveOverallPct(r),
        division: r.division,
        place: r.div_place ?? r.place, total: r.div_total ?? r.total, foundBy: r.found_by,
      })), division: group[0].division, overall_pct: avgY };
    });
    return { label: div, color: DIV_PALETTE[i % DIV_PALETTE.length], points };
  });

  // Build adjusted % series — one point per match using stage-level cross-division normalization
  const adjPoints = [];
  for (const r of viewSorted) {
    if (!r.stages?.length || !r.division) continue;
    const adjStages = getMetricStages(r)
      .map(s => computeAdjustedPct(s, r.division))
      .filter(a => a != null);
    if (!adjStages.length) continue;
    const adjAvg = adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length;
    adjPoints.push({
      date: r.date, y: adjAvg, label: r.match_name,
      division: r.division,
      overall_pct: effectiveOverallPct(r),
    });
  }

  const adjustedSeries = {
    label: 'Adjusted %',
    color: '#ff4081',
    dash: true,
    points: adjPoints,
  };

  if (adjustedOnly) {
    document.getElementById('chartTimeTitle').textContent = 'Adjusted % Over Time';
    if (adjPoints.length >= 2) {
      drawMultiSeriesChart(
        document.getElementById('chartTime'),
        [adjustedSeries],
        adjPoints.map(point => point.date),
        {
          yLabel: 'Adjusted match %', yMin: 0, yMax: 100, invertY: false,
          trend: true, valueUnit: 'match%', preserveDuplicateDates: true,
          showPercentageReferenceGuides: true,
        }
      );
    } else {
      drawMessage(
        document.getElementById('chartTime'),
        'Adjusted % needs 2 usable matches.\n' +
        'Refresh older matches for non-classifier\n' +
        'cross-division benchmark data.'
      );
    }
  } else {
    // Add adjusted series if we have data (dashed line, distinct color)
    if (adjPoints.length >= 2) scoreSeries.push(adjustedSeries);
    drawMultiSeriesChart(document.getElementById('chartTime'), scoreSeries, allDates, {
      yLabel: 'Match performance %', yMin: 0, yMax: 100, invertY: false,
      trend: true, valueUnit: 'match%',
      showPercentageReferenceGuides: true,
    });
  }

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
          overall_pct: effectiveDivPct(r) ?? effectiveOverallPct(r), total: r.div_total ?? r.total, foundBy: r.found_by };
      }
      return { date, y: avgY, label: `${group.length} matches`, multiMatch: group.map((r, gi) => ({
        label: r.match_name, y: ys[gi], rawPlace: r.div_place ?? r.place,
        total: r.div_total ?? r.total, overall_pct: effectiveDivPct(r) ?? effectiveOverallPct(r),
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
      yLabel: 'Field beaten %', yMin: 0, yMax: 100, invertY: false, trend: true, valueUnit: 'place%',
    });
  } else {
    drawMessage(document.getElementById('chartPlace'), 'No placement data.');
  }

  // ── Non-classifier stage trend ────────────────────────────────────────────
  // Shows average match-relative stage percentage for non-classifier stages.
  // Each stage is compared with that match's top shooter, not a national HHF.
  // Only shown when at least 2 matches have non-classifier stage data.
  const nonClfSection = document.getElementById('chartNonClfSection');
  const nonClfPoints = [];
  for (const r of viewSorted) {
    if (!r.stages?.length) continue;
    const nonClfStages = getMetricStages(r).filter(s => s.is_classifier === false || (s.is_classifier == null && !isClassifierStage(s)));
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
      stageCount: nonClfStages.length,
    });
  }
  nonClfPoints.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (nonClfPoints.length >= 2) {
    nonClfSection.style.display = '';
    const nonClfSeries = [{ label: 'Avg vs top shooter', color: '#00bcd4', points: nonClfPoints }];
    const nonClfDates  = nonClfPoints.map(p => p.date);
    drawMultiSeriesChart(document.getElementById('chartNonClf'), nonClfSeries, nonClfDates, {
      yLabel: '% compared with top shooter', yMin: 0, yMax: 100, invertY: false,
      trend: true, valueUnit: 'top%', preserveDuplicateDates: true,
      showPercentageReferenceGuides: true,
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
    .filter(r => effectiveOverallPct(r) != null)
    .map(r => ({ date: r.date, y: effectiveOverallPct(r), label: r.match_name, division: r.division, class_: r.class_ }));

  const clfOverlayPoints = [];
  for (const r of viewSorted) {
    if (!r.stages) continue;
    for (const s of getMetricStages(r)) {
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
      yLabel: '%', yMin: 0, yMax: 100, invertY: false, trend: true, valueUnit: '%',
      showPercentageReferenceGuides: true,
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
    let totalM = 0, totalNS = 0, totalCombined = 0, stagesWithHits = 0;
    for (const s of getMetricStages(r)) {
      const stageM = reportedStageHit(s, 'm');
      const stageNS = reportedStageHit(s, 'ns');
      if (stageM != null || stageNS != null) {
        totalM += stageM || 0;
        totalNS += stageNS || 0;
      } else {
        const stageCombined = reportedStageHit(s, 'm_ns');
        if (stageCombined == null) continue;
        totalCombined += stageCombined;
      }
      stagesWithHits++;
    }
    if (!stagesWithHits) continue;
    accuracyPoints.push({
      date: r.date,
      y: totalM + totalNS + totalCombined,
      label: r.match_name,
      division: r.division,
      m: totalM,
      ns: totalNS,
      m_ns: totalCombined,
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
  // Stacked bar chart of reported hit-zone outcomes per match. Raw values stay
  // unchanged; the renderer transforms cumulative boundaries for readability.
  const hitZoneSection = document.getElementById('chartHitZoneSection');
  const hitZoneBars    = [];
  for (const r of viewSorted) {
    if (!r.stages?.length) continue;
    const totals = { a: 0, b: 0, c: 0, d: 0, m: 0, ns: 0, m_ns: 0, p: 0 };
    const available = { a: false, b: false, c: false, d: false, m: false, ns: false, m_ns: false, p: false };
    for (const s of getMetricStages(r)) {
      for (const key of ['a', 'b', 'c', 'd', 'p']) {
        const value = reportedStageHit(s, key);
        if (value == null) continue;
        available[key] = true;
        totals[key] += value;
      }

      const stageM = reportedStageHit(s, 'm');
      const stageNS = reportedStageHit(s, 'ns');
      if (stageM != null || stageNS != null) {
        if (stageM != null) { available.m = true; totals.m += stageM; }
        if (stageNS != null) { available.ns = true; totals.ns += stageNS; }
      } else {
        const stageCombined = reportedStageHit(s, 'm_ns');
        if (stageCombined != null) {
          available.m_ns = true;
          totals.m_ns += stageCombined;
        }
      }
    }

    const zoneKeys = ['a', 'b', 'c', 'd', 'm', 'ns', 'm_ns'];
    if (!zoneKeys.some(key => available[key])) continue;
    const total = zoneKeys.reduce((sum, key) => sum + totals[key], 0);
    if (!total) continue;
    const values = Object.fromEntries(zoneKeys.map(key => [key, available[key] ? totals[key] : null]));
    const percentages = Object.fromEntries(zoneKeys.map(key => [key + 'Pct', available[key] ? (totals[key] / total) * 100 : null]));
    hitZoneBars.push({
      date: r.date,
      label: r.match_name,
      ...values,
      ...percentages,
      total,
      procedurals: available.p ? totals.p : null,
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, type = '', loading = false) {
  statusEl.className = type;
  statusEl.innerHTML = loading ? `<div class="spinner"></div>${msg}` : msg;
}

// Recompute and display the status line from current allResults + deselectedMatches.
// verb = 'Loaded' on first fetch, omitted (defaults to 'Showing') on checkbox changes.
function updateStatusCounts(verb) {
  if (!allResults.length) return;
  const visibleResults  = allResults.filter(matchesSelectedDivision);
  const confirmedUSPSA  = visibleResults.filter(r => isConfirmedUSPSA(effectiveMatchType(r)));
  const unconfirmed     = visibleResults.filter(r => effectiveMatchType(r) === 'Unknown');
  const nonUspsa        = visibleResults.filter(r => !isLikelyUSPSA(effectiveMatchType(r)));
  const uspsa           = confirmedUSPSA.length;
  const scored          = confirmedUSPSA.filter(r => r.overall_pct != null).length;
  const checked         = confirmedUSPSA.filter(r => !deselectedMatches.has(r.match_id)).length;

  const prefix           = verb || 'Showing';
  const divisionNote     = selectedDiv ? ` ${divisionLabel(selectedDiv)}` : '';
  const checkedNote      = checked < uspsa ? ` · ${checked} checked` : '';
  const unconfirmedNote  = unconfirmed.length > 0 ? ` · ${unconfirmed.length} unconfirmed type` : '';
  const skippedNote      = nonUspsa.length > 0    ? ` · ${nonUspsa.length} non-USPSA excluded` : '';
  const fetchNote        = lastFetchScope
    ? ` · Fetch ${lastFetchScope.label}: ${lastFetchScope.inRangeCount ?? '?'} in range`
    : '';
  const detailNote = lastFetchDiagnostics
    ? ` · Matches: ${lastFetchDiagnostics.extractedMatches} extracted, ${lastFetchDiagnostics.completeCacheReused} complete cached, ${lastFetchDiagnostics.partialRepairs} partial repaired, ${lastFetchDiagnostics.unknownRepairs} legacy repaired, ${lastFetchDiagnostics.newMatches} new · Stages: ${lastFetchDiagnostics.fetchedStages}/${lastFetchDiagnostics.expectedStages} fetched, ${lastFetchDiagnostics.failedStages} failed`
    : '';
  setStatus(`${prefix}${divisionNote} ${uspsa} USPSA match(es) — ${scored} with scores${checkedNote}.${unconfirmedNote}${skippedNote}${fetchNote}${detailNote}`, 'success');
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
