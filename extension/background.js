// background.js — service worker

const PS_BASE = 'https://practiscore.com';
const USPSA_BASE = 'https://uspsa.org';

// ── Open dashboard tab (or focus if already open) ─────────────────────────────
chrome.action.onClicked.addListener(async () => {
  const dashUrl = chrome.runtime.getURL('dashboard.html');
  const existing = await chrome.tabs.query({ url: dashUrl });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: dashUrl });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fetchScores') {
    fetchScores(msg.memberNumber, msg.name, msg.fetchTimeline)
      .then(data  => sendResponse({ ok: true,  data }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'fetchClassification') {
    fetchUSPSAClassification(msg.memberNumber, m => console.log('[HFC]', m))
      .then(async data => {
        if (data && !data._not_logged_in) {
          const stored = { ...data, member_number: msg.memberNumber, updated_at: Date.now() };
          await chrome.storage.local.set({ classificationData: stored });
        }
        sendResponse({ ok: true, data });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'refreshMatch') {
    refreshMatch(msg.match, msg.memberNumber, msg.name)
      .then(data  => sendResponse({ ok: true,  data }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ── Cache helpers ─────────────────────────────────────────────────────────────
async function getCache() {
  const d = await chrome.storage.local.get('matchCache');
  return d.matchCache || {};
}

async function updateMatchCache(matchId, scoreData) {
  const cache = await getCache();
  cache[matchId] = { ...scoreData, fetched_at: Date.now() };
  await chrome.storage.local.set({ matchCache: cache });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const FETCH_TIMELINES = Object.freeze({
  '1m':  { label: 'Last 1 month', months: 1 },
  '3m':  { label: '3 mo',         months: 3 },
  '6m':  { label: '6 mo',         months: 6 },
  '1y':  { label: '1 yr',         months: 12 },
  '3y':  { label: '3 yr',         months: 36 },
  'all': { label: 'all time',     months: null },
});

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

function normalizeDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function resolveFetchTimeline(requested, referenceDate = new Date()) {
  const requestedValue = typeof requested === 'object' ? requested?.value : requested;
  const value = Object.hasOwn(FETCH_TIMELINES, requestedValue) ? requestedValue : '6m';
  const preset = FETCH_TIMELINES[value];
  const end = preset.months == null ? null : localDateOnly(referenceDate);
  const start = end == null ? null : subtractCalendarMonths(end, preset.months);
  return { value, label: preset.label, start, end };
}

function filterMatchListByTimeline(matchList, scope) {
  let invalidDateCount = 0;
  let futureDateCount = 0;
  let beforeCutoffCount = 0;

  if (scope.value === 'all') {
    invalidDateCount = matchList.filter(match => normalizeDateOnly(match.date) == null).length;
    return { matches: [...matchList], invalidDateCount, futureDateCount, beforeCutoffCount };
  }

  const matches = matchList.filter(match => {
    const date = normalizeDateOnly(match.date);
    if (!date) {
      invalidDateCount++;
      return false;
    }
    if (date > scope.end) {
      futureDateCount++;
      return false;
    }
    if (date < scope.start) {
      beforeCutoffCount++;
      return false;
    }
    return true;
  });
  return { matches, invalidDateCount, futureDateCount, beforeCutoffCount };
}

function mergeMatchLists(existing, incoming, { preserveMissing = true } = {}) {
  const existingById = new Map((existing || []).filter(match => match?.match_id).map(match => [match.match_id, match]));
  const incomingIds = new Set();
  const merged = [];

  for (const match of incoming || []) {
    if (!match?.match_id || incomingIds.has(match.match_id)) continue;
    incomingIds.add(match.match_id);
    const prior = existingById.get(match.match_id) || {};
    const next = { ...prior, ...match };
    if (next.match_type === 'Unknown' && prior.match_type && prior.match_type !== 'Unknown') {
      next.match_type = prior.match_type;
    }
    merged.push(next);
  }

  if (preserveMissing) {
    for (const match of existing || []) {
      if (!match?.match_id || incomingIds.has(match.match_id)) continue;
      incomingIds.add(match.match_id);
      merged.push(match);
    }
  }
  return merged;
}

// ── Match type detection ──────────────────────────────────────────────────────
function detectMatchType(name) {
  const n = (name || '').toUpperCase();
  if (/\bIDPA\b/.test(n)) return 'IDPA';
  if (/\bIPSC\b/.test(n)) return 'IPSC';
  if (/\bSTEEL[\s-]?CHALLENGE\b|\bSCSA\b/.test(n)) return 'Steel Challenge';
  if (/\b3[\s-]?GUN\b/.test(n)) return '3-Gun';
  if (/\bPCSL\b/.test(n)) return 'PCSL';
  if (/\bICORE\b/.test(n)) return 'ICORE';
  if (/\bUSPSA\b/.test(n)) return 'USPSA';
  // Common USPSA division keywords strongly imply USPSA
  if (/\b(CARRY[\s-]?OPTICS|CARRYOPTICS|SINGLE[\s-]?STACK|SINGLESTACK|LIMITED[\s-]?OPTICS|LIMITEDOPTICS)\b/.test(n)) return 'USPSA';
  return 'Unknown';
}

const MANUAL_MATCH_TYPES = Object.freeze(['USPSA', 'IDPA', 'IPSC', 'Steel Challenge', '3-Gun', 'PCSL', 'ICORE']);
const SOURCE_MATCH_TYPES = new Set([...MANUAL_MATCH_TYPES, 'Hit Factor', 'SCSA', 'Unknown']);

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

function effectiveMatchType(match, overrides) {
  const detectedType = baseMatchType(match);
  if (detectedType !== 'Unknown') return detectedType;
  return overrides?.[match?.match_id] || detectedType;
}

// Types confirmed as non-USPSA — skip score fetching for these
const NON_USPSA_TYPES = new Set(['IDPA', 'IPSC', 'Steel Challenge', '3-Gun', 'PCSL', 'ICORE', 'SCSA']);

function isLikelyUSPSA(matchType) {
  return !NON_USPSA_TYPES.has(matchType);
}

// Map the Div abbreviation shown in the results table to the PractiScore URL key.
// e.g. "CO" → "carryoptics", "L" → "limited"
function divisionToUrlKey(div) {
  const map = {
    CO:  'carryoptics',
    L:   'limited',
    LO:  'limitedoptics',
    O:   'open',
    PCC: 'pcc',
    REV: 'revolver',
    SS:  'singlestack',
    P:   'production',
  };
  const key = (div || '').trim().toUpperCase();
  return map[key] || key.toLowerCase().replace(/[\s\-]+/g, '');
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const h = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(h);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(h);
  });
}

async function runInTab(tabId, fn, args = []) {
  const res = await chrome.scripting.executeScript({ target: { tabId }, func: fn, args });
  return res[0].result;
}

function buildResult(match, score, memberNumber) {
  return {
    match_id:    match.match_id,
    match_name:  match.match_name,
    match_type:  match.match_type || 'Unknown',
    date:        match.date,
    division:    score.division    || '',
    class_:      score.class_      || '',
    overall_pct: score.overall_pct ?? null,
    div_pct:     score.div_pct     ?? null,
    hf:          score.hf          ?? null,
    place:       score.place       ?? null,
    div_place:   score.div_place   ?? null,
    div_total:   score.div_total   ?? null,
    total:       score.total       ?? null,
    found_by:    score.found_by    || null,
    stages:      score.stages      || null,
    cached_for:  (memberNumber || '').toUpperCase() || null,
    fetched_at:  Date.now(),
  };
}

function isReusableMatchCache(cached, memberNumber) {
  if (!cached || typeof cached !== 'object') return false;
  const expectedOwner = (memberNumber || '').toUpperCase() || null;
  return cached.cached_for === expectedOwner;
}

// ── results/new/{matchId} scraper — injected into tab ─────────────────────────
// Reads the dynamically-rendered table in #mainResultsDiv plus the dropdown
// options for #resultLevel and #divisionLevel.
function getResultsNewState(mem, nm) {
  const isCF = /challenge|security|just a moment/i.test(document.title) ||
               !!document.querySelector('#cf-challenge-running, #challenge-form');
  if (isCF) return { _cf: true };

  // Spinner still visible → still loading
  const spinner = document.querySelector('#spinner');
  if (spinner && getComputedStyle(spinner).display !== 'none') {
    return { _loading: true, _debug: 'spinner visible' };
  }

  const mainDiv = document.querySelector('#mainResultsDiv');
  const tables  = mainDiv ? Array.from(mainDiv.querySelectorAll('table')) : [];
  if (!tables.length) {
    const txt = (mainDiv?.textContent || '').trim().substring(0, 80).replace(/\s+/g, ' ');
    return { _loading: true, _debug: 'no table — ' + txt };
  }

  // Read dropdown options (may still be empty on first paint)
  const readSelect = id => Array.from(document.getElementById(id)?.options || [])
    .map(o => ({ value: o.value, text: o.textContent.trim() }))
    .filter(o => o.text);

  const divisionOptions    = readSelect('divisionLevel');
  const resultLevelOptions = readSelect('resultLevel');

  // Extract confirmed sport type from page header:
  // <h4>Match Title <small>USPSA 2026-02-28</small></h4>
  let pageMatchType = null;
  const SPORT_TOKENS = ['USPSA', 'IDPA', 'IPSC', 'SCSA', 'PCSL', 'ICORE'];
  for (const h4 of document.querySelectorAll('h4')) {
    for (const small of h4.querySelectorAll('small')) {
      const txt   = small.textContent.trim();
      const words = txt.split(/\s+/);
      const first = words[0].toUpperCase();
      const firstTwo = words.slice(0, 2).join(' ').toUpperCase();
      if (firstTwo === 'HIT FACTOR')     { pageMatchType = 'Hit Factor'; break; }
      if (SPORT_TOKENS.includes(first))  { pageMatchType = first; break; }
      if (/^3[-\s]?GUN$/i.test(first))   { pageMatchType = '3-Gun'; break; }
    }
    if (pageMatchType) break;
  }

  // Largest table = results table
  const table = tables.sort(
    (a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length
  )[0];

  // Headers
  let thEls = Array.from(table.querySelectorAll('thead th, thead td'));
  if (!thEls.length) {
    const first = table.querySelector('tr');
    if (first) thEls = Array.from(first.querySelectorAll('th, td'));
  }
  const ths = thEls.map(th => th.textContent.trim().toLowerCase());

  const hi = {
    place: ths.findIndex(h => /^(place|#|rank|no\.?)$/.test(h)),
    mem:   ths.findIndex(h => /mem/.test(h)),
    div:   ths.findIndex(h => /^div/.test(h)),
    cls:   ths.findIndex(h => /^class$/.test(h)),
    pct:   ths.findIndex(h => /^(%|pct|percent|match\s*%|stage\s*%)$/.test(h)),
    hf:    ths.findIndex(h => /^(hf|hit\s*factor)$/.test(h)),
    time:  ths.findIndex(h => /^time$/.test(h)),
    a:     ths.findIndex(h => h === 'a'),
    c:     ths.findIndex(h => h === 'c'),
    d:     ths.findIndex(h => h === 'd'),
    m:     ths.findIndex(h => h === 'm'),
    ns:    ths.findIndex(h => h === 'ns' || h === 'n/s' || h === 'ns/m'),
    p:     ths.findIndex(h => h === 'p' || h === 'proc' || h === 'pen'),
  };

  let rows = Array.from(table.querySelectorAll('tbody tr'));
  if (!rows.length) rows = Array.from(table.querySelectorAll('tr')).slice(1);
  const total = rows.length;

  // Table exists but is empty — data hasn't rendered yet
  if (!total) return { _loading: true, _debug: 'table has 0 rows' };

  function parseRow(row) {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
    const out   = { total };
    if (hi.div  >= 0) out.division = cells[hi.div] || '';
    if (hi.cls  >= 0) out.class_   = cells[hi.cls] || '';
    if (hi.hf   >= 0) out.hf       = parseFloat(cells[hi.hf])   || null;
    if (hi.time >= 0) out.time     = parseFloat(cells[hi.time])  || null;
    if (hi.a    >= 0) out.a        = parseInt(cells[hi.a])   || 0;
    if (hi.c    >= 0) out.c        = parseInt(cells[hi.c])   || 0;
    if (hi.d    >= 0) out.d        = parseInt(cells[hi.d])   || 0;
    if (hi.m    >= 0) out.m        = parseInt(cells[hi.m])   || 0;
    if (hi.ns   >= 0) out.ns       = parseInt(cells[hi.ns])  || 0;
    if (hi.p    >= 0) out.p        = parseInt(cells[hi.p])   || 0;

    if (hi.place >= 0) out.place = parseInt(cells[hi.place]) || null;
    if (!out.place && cells.length) {
      const pm = cells[0].match(/^(\d+)/);
      if (pm) out.place = parseInt(pm[1]);
    }
    if (hi.pct >= 0) out.overall_pct = parseFloat(cells[hi.pct]);
    if (out.overall_pct == null || isNaN(out.overall_pct)) {
      for (const c of cells) {
        const pm = c.match(/^(\d{1,3}\.\d{2,4})\s*%?$/);
        if (pm) { out.overall_pct = parseFloat(pm[1]); break; }
      }
    }
    return out;
  }

  // Build name variants for matching
  const memUp  = (mem || '').toUpperCase();
  const raw    = (nm || '').trim().toUpperCase();
  const parts  = raw.split(/[\s,]+/).filter(Boolean);
  const variants = new Set(raw ? [raw] : []);
  if (parts.length >= 2) {
    variants.add(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`);
    variants.add(`${parts[0]}, ${parts.slice(1).join(' ')}`);
    variants.add(parts.join(' '));
  }

  // Collect ALL competitor rows for GM benchmark computation
  const allCompetitorRows = rows.map(row => parseRow(row));

  for (const row of rows) {
    const cells   = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
    const cellsUp = cells.map(c => c.toUpperCase());

    const memMatch  = memUp && (
      hi.mem >= 0
        ? (cells[hi.mem] || '').toUpperCase() === memUp
        : cells.some(c => c.toUpperCase() === memUp)
    );
    const nameMatch = variants.size && [...variants].some(v =>
      cellsUp.some(c => c === v || c.replace(/^\d+[.\-]\s*/, '') === v)
    );

    if (!memMatch && !nameMatch) continue;

    return {
      _ready: true, _found: true,
      found_by: memMatch ? 'member_number' : 'name',
      divisionOptions,
      resultLevelOptions,
      competitorData: parseRow(row),
      allCompetitorRows,
      _rowCount: total,
      pageMatchType,
    };
  }

  return {
    _ready: true, _found: false,
    divisionOptions, resultLevelOptions,
    allCompetitorRows,
    _rowCount: total, _headers: ths,
    pageMatchType,
  };
}

// Injected helper — sets a <select> value and fires a change event
function setSelectAndFire(selectId, value) {
  const el = document.getElementById(selectId);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// ── HTML results page scraper — injected into tab, no external references ─────
// (kept as fallback for stage data on static pages)
function scrapeHTMLResultsPage(mem, nm) {
  const isCF = /challenge|security|just a moment/i.test(document.title) ||
               !!document.querySelector('#cf-challenge-running, #challenge-form');
  if (isCF) return { _cf: true };

  // Find largest table on the page
  const tables = Array.from(document.querySelectorAll('table'));
  const table = tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
  if (!table) {
    const snippet = (document.body?.textContent || '').trim().substring(0, 120).replace(/\s+/g, ' ');
    return { _loading: true, _debug: 'no table — body: ' + snippet };
  }

  // Headers: prefer <thead>, fall back to first <tr>
  let thEls = Array.from(table.querySelectorAll('thead th, thead td'));
  if (!thEls.length) {
    const firstTr = table.querySelector('tr');
    if (firstTr) thEls = Array.from(firstTr.querySelectorAll('th, td'));
  }
  if (!thEls.length) return { _loading: true, _debug: 'no headers in table' };

  // Rows: prefer <tbody>, fall back to all <tr> after the first
  let rows = Array.from(table.querySelectorAll('tbody tr'));
  if (!rows.length) {
    const allTrs = Array.from(table.querySelectorAll('tr'));
    rows = allTrs.slice(1); // skip header row
  }
  if (!rows.length) {
    const hdrs = thEls.map(th => th.textContent.trim()).join(', ');
    return { _loading: true, _debug: `0 rows — headers: [${hdrs}]` };
  }

  const ths = thEls.map(th => th.textContent.trim().toLowerCase());
  const hi = {
    place: ths.findIndex(h => /^(place|#|rank|no\.?)$/.test(h)),
    mem:   ths.findIndex(h => /mem/.test(h)),
    div:   ths.findIndex(h => /^div/.test(h)),
    cls:   ths.findIndex(h => /^class$/.test(h)),
    pct:   ths.findIndex(h => /^(%|pct|percent|match\s*%)$/.test(h)),
    hf:    ths.findIndex(h => /^(hf|hit\s*factor)$/.test(h)),
    time:  ths.findIndex(h => /^time$/.test(h)),
    a:     ths.findIndex(h => h === 'a'),
    c:     ths.findIndex(h => h === 'c'),
    d:     ths.findIndex(h => h === 'd'),
    m:     ths.findIndex(h => h === 'm'),
    ns:    ths.findIndex(h => h === 'ns' || h === 'n/s' || h === 'ns/m'),
    p:     ths.findIndex(h => h === 'p' || h === 'proc' || h === 'pen'),
  };

  const total = rows.length;

  function parseRow(row) {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
    const out = { total };
    if (hi.div  >= 0) out.division = cells[hi.div] || '';
    if (hi.cls  >= 0) out.class_   = cells[hi.cls] || '';
    if (hi.hf   >= 0) out.hf       = parseFloat(cells[hi.hf]) || null;
    if (hi.time >= 0) out.time     = parseFloat(cells[hi.time]) || null;
    if (hi.a    >= 0) out.a        = parseInt(cells[hi.a])  || 0;
    if (hi.c    >= 0) out.c        = parseInt(cells[hi.c])  || 0;
    if (hi.d    >= 0) out.d        = parseInt(cells[hi.d])  || 0;
    if (hi.m    >= 0) out.m        = parseInt(cells[hi.m])  || 0;
    if (hi.ns   >= 0) out.ns       = parseInt(cells[hi.ns]) || 0;
    if (hi.p    >= 0) out.p        = parseInt(cells[hi.p])  || 0;
    // Place: dedicated column or leading digits in first cell
    if (hi.place >= 0) out.place = parseInt(cells[hi.place]) || null;
    if (!out.place && cells.length) {
      const m = cells[0].match(/^(\d+)/);
      if (m) out.place = parseInt(m[1]);
    }
    // Match %: dedicated column or first cell matching "NN.NN"
    if (hi.pct >= 0) out.overall_pct = parseFloat(cells[hi.pct]);
    if (out.overall_pct == null || isNaN(out.overall_pct)) {
      for (const c of cells) {
        const m = c.match(/^(\d{1,3}\.\d{2,4})\s*%?$/);
        if (m) { out.overall_pct = parseFloat(m[1]); break; }
      }
    }
    return out;
  }

  // Stage navigation links on this page
  const stageLinks = [...document.querySelectorAll('a[href*="page=stage"]')]
    .reduce((acc, a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/page=stage(\d+)-(.+)$/);
      if (!m) return acc;
      const num = parseInt(m[1]);
      if (!acc.find(x => x.num === num)) acc.push({ num, href, text: a.textContent.trim() });
      return acc;
    }, []);

  const memUp  = (mem || '').toUpperCase();
  const raw    = (nm  || '').trim().toUpperCase();
  const parts  = raw.split(/[\s,]+/).filter(Boolean);
  const variants = new Set(raw ? [raw] : []);
  if (parts.length >= 2) {
    variants.add(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`);
    variants.add(`${parts[0]}, ${parts.slice(1).join(' ')}`);
    variants.add(parts.join(' '));
  }

  // Search by member number — exact cell match
  if (memUp) {
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      const matched = hi.mem >= 0
        ? (cells[hi.mem] || '').toUpperCase() === memUp
        : cells.some(c => c.toUpperCase() === memUp);
      if (!matched) continue;
      return { _found: true, found_by: 'member_number', stageLinks, ...parseRow(row) };
    }
  }

  // Search by name — exact cell match, with/without leading "N." place prefix
  if (variants.size) {
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      const cellsUp = cells.map(c => c.toUpperCase());
      const matched = [...variants].some(v =>
        cellsUp.some(c => c === v || c.replace(/^\d+[.\-]\s*/, '') === v)
      );
      if (!matched) continue;
      return { _found: true, found_by: 'name', stageLinks, ...parseRow(row) };
    }
  }

  return { _notFound: true, _rowCount: rows.length };
}

// ── Fetch match definition JSON from PractiScore S3 ──────────────────────────
// Returns a Map<stageNum (1-based), { is_classifier: bool, classifier_code: string|null }>
// or null if the fetch fails or the data is unusable.
async function fetchMatchDef(matchId, push) {
  const url = `https://s3.amazonaws.com/ps-scores/production/${matchId}/match_def.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) { if (res.status !== 403) push(`     match_def: HTTP ${res.status}`); return null; }
    const def = await res.json();
    const raw = def.match_stages || def.stages;
    if (!Array.isArray(raw) || !raw.length) { push('     match_def: no stages array'); return null; }

    // Log the first stage's full key set so we can identify the real field names
    console.log('[HFC] match_def stage[0] keys:', Object.keys(raw[0]));
    console.log('[HFC] match_def stage[0]:', JSON.stringify(raw[0]));

    const map = new Map();
    raw.forEach((s, idx) => {
      // Stage number: prefer explicit field, fall back to 1-based index
      const num = s.stage_number ?? s.stage_num ?? (idx + 1);

      // Classifier flag — PractiScore uses various field names; check all known variants
      const isClf = !!(s.stage_classifiers || s.stage_classifier || s.classifiers || s.classifier);

      // Classifier code (e.g. "99-11") — check known field name variants
      const code = s.stage_classifier_id ?? s.stage_classifiercode ?? s.classifier_id
                ?? s.classifiercode ?? s.classifier_code ?? null;

      map.set(num, { is_classifier: isClf || !!code, classifier_code: code || null });
    });
    push(`     match_def: ${raw.length} stage(s), ${[...map.values()].filter(v => v.is_classifier).length} classifier(s)`);
    return map;
  } catch (e) {
    push(`     match_def: ${e.message}`);
    return null;
  }
}

// ── Compute median of an array of numbers ────────────────────────────────────
function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Fetch stage stats via #resultLevel dropdown (tab already on results/new) ───
// Also captures all competitor rows to compute GM benchmark HF per stage,
// and fetches the Combined (all-divisions) view to find the best HF across
// all divisions for field-strength-adjusted scoring.
async function fetchStageData(tabId, matchId, memberNumber, name, divKey, stageOptions, push, classifierMap, divisionOptions) {
  if (!stageOptions || !stageOptions.length) {
    push('     no stage options found');
    return null;
  }

  // Find the "Combined" option in the division dropdown (shows all divisions)
  const combinedOpt = (divisionOptions || []).find(o =>
    /^(combined|all|overall)$/i.test(o.text.trim()) || o.value === '' || o.value === 'combined'
  );

  // Find the user's division option to switch back after combined view
  const userDivOpt = (divisionOptions || []).find(o => {
    const t = o.text.toLowerCase().replace(/\s+/g, '');
    const v = (o.value || '').toLowerCase().replace(/\s+/g, '');
    return t.includes(divKey) || v.includes(divKey);
  });

  push(`     fetching ${stageOptions.length} stage(s)…`);
  const stages = [];

  for (const opt of stageOptions) {
    // Switch #resultLevel to this stage (division is already set from fetchMatchScore)
    await runInTab(tabId, setSelectAndFire, ['resultLevel', opt.href || opt.value || opt.text]);
    await sleep(900);

    // Wait for re-render
    let page = null;
    for (let i = 0; i < 6; i++) {
      page = await runInTab(tabId, getResultsNewState, [memberNumber || '', name || '']);
      if (page._loading) { await sleep(1000); continue; }
      break;
    }

    if (!page?._found) { push(`     ${opt.text}: not found`); continue; }

    const d = page.competitorData;
    const stageName = opt.text.replace(/^stage\s*\d+\s*[:\-–]?\s*/i, '').trim() || opt.text;
    const stageNum  = parseInt(opt.text.match(/\d+/)?.[0]) || stages.length + 1;

    // ── GM benchmark: collect HF values for all GM-class competitors in same division ──
    // allCompetitorRows contains every row from the current (division-filtered) stage view.
    // class_ field uses single-letter codes: G=GM, M=Master, A=A-class, etc.
    let gm_median_hf = null;
    const allRows = page.allCompetitorRows || [];
    if (allRows.length > 0) {
      const gmHFs = allRows
        .filter(r => r.class_ && r.class_.toUpperCase() === 'G' && r.hf != null && r.hf > 0)
        .map(r => r.hf);
      if (gmHFs.length > 0) {
        gm_median_hf = median(gmHFs);
        push(`     ${opt.text}: ${gmHFs.length} GM(s), median HF ${gm_median_hf?.toFixed(4)}`);
      }
    }

    // ── Cross-division benchmark: switch to Combined view to find top HFs across all divisions ──
    // This gives us the data needed to compute field-strength-adjusted percentages.
    let xdiv_benchmarks = null;
    if (combinedOpt) {
      await runInTab(tabId, setSelectAndFire, ['divisionLevel', combinedOpt.value]);
      await sleep(900);

      let combinedPage = null;
      for (let i = 0; i < 4; i++) {
        combinedPage = await runInTab(tabId, getResultsNewState, [memberNumber || '', name || '']);
        if (combinedPage._loading) { await sleep(800); continue; }
        break;
      }

      const combinedRows = combinedPage?.allCompetitorRows || [];
      if (combinedRows.length > 0) {
        // Group by division, find top HF and top HF by class in each division
        const byDiv = {};
        for (const row of combinedRows) {
          const div = (row.division || '').trim().toUpperCase();
          if (!div || row.hf == null || row.hf <= 0) continue;
          if (!byDiv[div]) byDiv[div] = { topHF: 0, topClass: '', gmHFs: [], mHFs: [], aHFs: [] };
          if (row.hf > byDiv[div].topHF) {
            byDiv[div].topHF = row.hf;
            byDiv[div].topClass = (row.class_ || '').toUpperCase();
          }
          const cls = (row.class_ || '').toUpperCase();
          if (cls === 'G') byDiv[div].gmHFs.push(row.hf);
          else if (cls === 'M') byDiv[div].mHFs.push(row.hf);
          else if (cls === 'A') byDiv[div].aHFs.push(row.hf);
        }

        // Build compact benchmark object: { DIV: { topHF, topClass, gmMedian, mMedian, aMedian } }
        xdiv_benchmarks = {};
        for (const [div, data] of Object.entries(byDiv)) {
          xdiv_benchmarks[div] = {
            topHF:    data.topHF,
            topClass: data.topClass,
            gmMedian: data.gmHFs.length ? median(data.gmHFs) : null,
            mMedian:  data.mHFs.length  ? median(data.mHFs)  : null,
            aMedian:  data.aHFs.length  ? median(data.aHFs)  : null,
          };
        }

        const divCount = Object.keys(xdiv_benchmarks).length;
        const topOverall = Math.max(...Object.values(xdiv_benchmarks).map(b => b.topHF));
        push(`     ${opt.text}: xdiv ${divCount} div(s), top HF ${topOverall.toFixed(4)}`);
      }

      // Switch back to user's division for the next stage
      if (userDivOpt) {
        await runInTab(tabId, setSelectAndFire, ['divisionLevel', userDivOpt.value]);
        await sleep(600);
      }
    }

    stages.push({
      name:            stageName,
      num:             stageNum,
      time:            d.time ?? null,
      hf:              d.hf   ?? null,
      pct:             d.overall_pct ?? null,
      a:               d.a  ?? 0,
      c:               d.c  ?? 0,
      d:               d.d  ?? 0,
      m:               d.m  ?? 0,
      ns:              d.ns ?? 0,
      p:               d.p  ?? 0,
      gm_median_hf,
      xdiv_benchmarks,
      is_classifier:   null,
      classifier_code: null,
    });
    push(`     ${opt.text}: ${d.hf?.toFixed(4) ?? '?'} HF  ${d.overall_pct?.toFixed(1) ?? '?'}%`);
  }

  return stages.length ? stages : null;
}

// ── USPSA.org classification page scraper ─────────────────────────────────────
// Injected into uspsa.org/classification/[memberNumber]
function scrapeUSPSAClassificationPage() {
  const url = window.location.href;

  // Login detection
  if (/[/]login|[/]signin|[?]redirect/i.test(url) ||
      document.querySelector('input[name="password"], #loginForm, form[action*="login"]')) {
    return { _not_logged_in: true };
  }

  const divisions  = {};
  const classifiers = [];

  // ── Table: Classifications (table with "Classifications" th and division TH-in-row structure)
  // Structure: tbody rows each have a <th> (division name) + <td> cells like "Class: U", "Pct: 0.0000"
  for (const table of document.querySelectorAll('table')) {
    const allThs = [...table.querySelectorAll('th')].map(th => th.textContent.trim());
    if (!allThs.includes('Classifications')) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      const divTh = row.querySelector('th');
      if (!divTh) continue;
      const divName = divTh.textContent.trim();
      const cells   = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
      const classCell = cells.find(c => /^class:/i.test(c));
      const pctCell   = cells.find(c => /^pct:/i.test(c));
      if (!classCell && !pctCell) continue;
      divisions[divName] = {
        class_: classCell ? classCell.replace(/^class:\s*/i, '').trim() : null,
        pct:    pctCell   ? parseFloat(pctCell.replace(/^pct:\s*/i, '')) || null : null,
      };
    }
  }

  // ── Table: "[Division] Classifiers" — single <th> header, first tbody row is col headers
  // e.g. "Carry Optics Classifiers (Click to Expand)"
  for (const table of document.querySelectorAll('table')) {
    const thText  = table.querySelector('th')?.textContent?.trim() || '';
    const divMatch = thText.match(/^(.+?)\s+Classifiers\b/i);
    if (!divMatch) continue;
    const divName = divMatch[1].trim();
    const allRows = [...table.querySelectorAll('tbody tr')];
    if (allRows.length < 2) continue;

    // First tbody row contains column header labels as <td> elements
    const colHeaders = [...allRows[0].querySelectorAll('td')]
      .map(td => td.textContent.trim().toLowerCase());
    const iDate = colHeaders.indexOf('date');
    const iNum  = colHeaders.indexOf('number');
    const iPct  = colHeaders.indexOf('percent');
    const iHF   = colHeaders.indexOf('hf');
    const iFlag = colHeaders.indexOf('f');
    const iClub = colHeaders.indexOf('club');

    for (const row of allRows.slice(1)) {
      const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
      if (!cells.length) continue;
      classifiers.push({
        date:     iDate >= 0 ? cells[iDate] : null,
        code:     iNum  >= 0 ? cells[iNum]  : null,
        pct:      iPct  >= 0 ? parseFloat(cells[iPct])  || null : null,
        hf:       iHF   >= 0 ? parseFloat(cells[iHF])   || null : null,
        flag:     iFlag >= 0 ? cells[iFlag] : null,  // Y=counts, U=unpaid, P=pending
        club:     iClub >= 0 ? cells[iClub] : null,
        division: divName,
      });
    }
  }

  // Division select options — used by fetchUSPSAClassification for calculator loop
  const divSelect = (() => {
    const s = document.getElementById('calc_selDiv');
    return s ? [...s.options].map(o => ({ value: o.value, text: o.textContent.trim() })) : [];
  })();

  return { divisions, classifiers, divSelect };
}

// Injected: selects a division in the Classification Calculator and clicks Calculate.
function triggerClassificationCalculator(divValue) {
  const sel = document.getElementById('calc_selDiv');
  if (!sel) return false;
  sel.value = divValue;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const calcBtn = [...document.querySelectorAll('button, input[type="button"]')]
    .find(b => /^calculate$/i.test(b.textContent.trim()) || /^calculate$/i.test(b.value));
  if (calcBtn) { calcBtn.click(); return true; }
  return false;
}

// Injected: reads the Classification Calculator result after it renders.
// Captures whatever text/elements changed — we log it so we can refine the parser.
function readCalculatorResult() {
  // Capture the full result area — try several common selectors
  const selectors = [
    '#calcResult', '#calc_result', '.calc-result', '.classification-result',
    '#classificationResult', '[id*="result"]', '[class*="result"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      return { selector: sel, html: el.innerHTML, text: el.textContent.replace(/\s+/g,' ').trim() };
    }
  }
  // Fallback: capture text near the Calculate button
  const calcBtn = [...document.querySelectorAll('button')]
    .find(b => /^calculate$/i.test(b.textContent.trim()));
  if (calcBtn) {
    const container = calcBtn.closest('div, section, form') || calcBtn.parentElement;
    return { selector: 'parent', html: container?.innerHTML, text: container?.textContent.replace(/\s+/g,' ').trim().slice(0, 400) };
  }
  return null;
}

// Fetches USPSA classification for the given member number.
// Returns { divisions, classifiers } or { _not_logged_in: true } or null on error.
async function fetchUSPSAClassification(memberNumber, push) {
  if (!memberNumber) return null;
  let tabId = null;
  try {
    push('Fetching USPSA classification…');
    const tab = await chrome.tabs.create({
      url: `${USPSA_BASE}/classification/${memberNumber}`,
      active: false,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(2000);

    const state = await runInTab(tabId, scrapeUSPSAClassificationPage);

    if (state?._not_logged_in) {
      push('  Not logged into USPSA.org — classification data unavailable');
      return { _not_logged_in: true };
    }

    // Log compact debug info — tables and division select only
    console.log('[HFC] USPSA page debug:', JSON.stringify(state._debug, null, 2));
    // Log the actual parsed classifier records so we can verify dates/pcts/codes
    console.log('[HFC] USPSA classifiers parsed:', JSON.stringify(state.classifiers, null, 2));

    const clf = state?.classifiers?.length ?? 0;
    push(`  Found ${clf} classifier record(s) for ${memberNumber}`);

    // ── Classification Calculator: iterate each division to get D-GM class ──────
    const divOptions = state._debug?.divSelect || [];
    const divClassifications = { ...state.divisions };

    for (const opt of divOptions) {
      const triggered = await runInTab(tabId, triggerClassificationCalculator, [opt.value]);
      if (!triggered) { push(`  Calculator not found — skipping division loop`); break; }
      await sleep(1200);
      const result = await runInTab(tabId, readCalculatorResult);
      console.log(`[HFC] Calculator result for ${opt.text}:`, JSON.stringify(result));
      if (result?.text) push(`  ${opt.text}: ${result.text.slice(0, 80)}`);
    }

    return { classifiers: state.classifiers, divisions: divClassifications } ?? null;

  } catch (e) {
    push(`  USPSA classification error: ${e.message}`);
    return null;
  } finally {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  }
}

// ── Fetch all match scores ────────────────────────────────────────────────────
async function fetchScores(memberNumber, name, requestedTimeline) {
  const log = [];
  const push = m => { log.push(m); console.log('[HFC]', m); };
  let tabId = null;
  const fetchScope = resolveFetchTimeline(requestedTimeline);

  try {
    const bounds = fetchScope.value === 'all' ? '' : ` (${fetchScope.start} through ${fetchScope.end})`;
    push(`Loading match history — fetch timeline: ${fetchScope.label}${bounds}…`);
    const tab = await chrome.tabs.create({ url: `${PS_BASE}/associate/step2`, active: false });
    tabId = tab.id;
    await waitForTabLoad(tabId);
    await sleep(2500);

    // Check PractiScore login — if redirected away from associate page, not logged in
    const psTab = await chrome.tabs.get(tabId);
    if (psTab.url && !psTab.url.includes('practiscore.com/associate')) {
      push('Not logged into PractiScore — please log in at practiscore.com and try again.');
      return { results: [], log, _not_logged_in_ps: true };
    }

    const rawMatchList = await runInTab(tabId, extractMatchList);
    push(`Found ${rawMatchList.length} match(es).`);
    console.log('[HFC] matchList:', JSON.stringify(rawMatchList, null, 2));

    // Annotate every match with its detected type
    const annotatedMatchList = rawMatchList.map(m => ({ ...m, match_type: detectMatchType(m.match_name) }));
    const filtered = filterMatchListByTimeline(annotatedMatchList, fetchScope);
    const matchList = filtered.matches;
    Object.assign(fetchScope, {
      extractedCount: rawMatchList.length,
      inRangeCount: matchList.length,
      invalidDateCount: filtered.invalidDateCount,
      futureDateCount: filtered.futureDateCount,
      beforeCutoffCount: filtered.beforeCutoffCount,
    });
    push(`Fetch timeline ${fetchScope.label}: ${matchList.length}/${rawMatchList.length} match(es) in range.`);
    if (filtered.invalidDateCount && fetchScope.value === 'all') {
      push(`Retaining ${filtered.invalidDateCount} match(es) with missing or malformed dates for this all-time fetch.`);
    } else if (filtered.invalidDateCount) {
      push(`Skipping ${filtered.invalidDateCount} match(es) with missing or malformed dates for this bounded fetch.`);
    }
    if (filtered.futureDateCount) push(`Skipping ${filtered.futureDateCount} future-dated match(es).`);
    if (filtered.beforeCutoffCount) push(`Skipping ${filtered.beforeCutoffCount} match(es) before ${fetchScope.start}.`);

    const stored = await chrome.storage.local.get(['lastMatchList', 'matchCache', 'matchTypeOverrides']);
    const previousMatchList = stored.lastMatchList || [];
    const cache = stored.matchCache || {};
    const matchTypeOverrides = normalizeMatchTypeOverrides(stored.matchTypeOverrides);
    const preserveMissingHistory = fetchScope.value !== 'all' || rawMatchList.length === 0;
    let mergedMatchList = mergeMatchLists(previousMatchList, matchList, { preserveMissing: preserveMissingHistory });
    await chrome.storage.local.set({ lastMatchList: mergedMatchList });
    const mergedById = new Map(mergedMatchList.map(match => [match.match_id, match]));
    const workMatches = matchList.map(match => mergedById.get(match.match_id) || match);

    if (rawMatchList.length === 0) {
      push('No matches extracted — preserving previously cached history.');
    }

    // Level 1: skip confirmed non-USPSA matches before fetching scores
    const uspsaMatches = workMatches.filter(m => isLikelyUSPSA(effectiveMatchType(m, matchTypeOverrides)));
    const skippedMatches = workMatches.filter(m => !isLikelyUSPSA(effectiveMatchType(m, matchTypeOverrides)));
    const skipped = skippedMatches.length;
    if (skipped > 0) {
      const names = skippedMatches.map(m => `${m.match_name} (${effectiveMatchType(m, matchTypeOverrides)})`).join(', ');
      push(`Skipping ${skipped} non-USPSA match(es): ${names}`);
    }

    const results = [];

    // Include non-USPSA matches in results (without scores) for history display
    for (const m of skippedMatches) {
      results.push(buildResult(m, {}, memberNumber));
    }

    const cachedMatches = [];
    const uncachedMatches = [];
    for (const match of uspsaMatches) {
      const cached = cache[match.match_id];
      if (isReusableMatchCache(cached, memberNumber)) cachedMatches.push(match);
      else uncachedMatches.push(match);
    }

    for (const match of cachedMatches) {
      results.push({ ...match, ...cache[match.match_id], _cached: true });
    }
    if (cachedMatches.length > 0) {
      push(`Reusing ${cachedMatches.length} cached in-range match(es).`);
    }

    push(`Fetching scores for ${uncachedMatches.length} uncached in-range USPSA match(es)…`);

    for (let i = 0; i < uncachedMatches.length; i++) {
      const match = uncachedMatches[i];
      push(`  → [${i + 1}/${uncachedMatches.length}] ${match.match_name} (${match.date})`);

      const score  = await fetchMatchScore(tabId, match.match_id, memberNumber, name, push);

      // Override match type with the confirmed value read from the results page
      if (score._pageMatchType) match.match_type = score._pageMatchType;

      const classifierMap = score.overall_pct != null
        ? await fetchMatchDef(match.match_id, push)
        : null;
      const stages = score.overall_pct != null
        ? await fetchStageData(tabId, match.match_id, memberNumber, name, score._divKey, score._stageOptions, push, classifierMap, score._divisionOptions)
        : null;
      const result = buildResult(match, { ...score, stages }, memberNumber);
      // Only cache when a score was actually found — prevents cache poisoning from wrong credentials
      if (result.overall_pct != null) {
        await updateMatchCache(match.match_id, result);
      }
      results.push({ ...result, _cached: false });

      push(`     score: ${score.overall_pct != null ? score.overall_pct + '%' : 'not found'} [${score.found_by || 'none'}]`);
    }

    // Re-save the merged list with any match types confirmed from results pages.
    mergedMatchList = mergeMatchLists(previousMatchList, workMatches, { preserveMissing: preserveMissingHistory });
    await chrome.storage.local.set({ lastMatchList: mergedMatchList });

    const n = results.filter(r => r.overall_pct != null).length;
    const newlyScoredCount = results.filter(r => r._cached === false && r.overall_pct != null).length;
    push(`Done — ${n}/${uspsaMatches.length} matches with scores; ${cachedMatches.length} reused, ${uncachedMatches.length} requested.`);

    // Refresh USPSA classification only when this run fetched at least one new score.
    let classificationData = null;
    let _not_logged_in_uspsa = false;
    if (memberNumber && newlyScoredCount > 0) {
      const clfResult = await fetchUSPSAClassification(memberNumber, push);
      if (clfResult?._not_logged_in) {
        _not_logged_in_uspsa = true;
      } else if (clfResult) {
        classificationData = { ...clfResult, member_number: memberNumber, updated_at: Date.now() };
        await chrome.storage.local.set({ classificationData });
      }
    }

    const fetchedById = new Map(results.map(result => [result.match_id, result]));
    const combinedResults = mergedMatchList.map(match => {
      if (fetchedById.has(match.match_id)) return fetchedById.get(match.match_id);
      const cached = cache[match.match_id];
      if (isReusableMatchCache(cached, memberNumber)) {
        return { ...match, ...cached, _cached: true };
      }
      return buildResult(match, {}, memberNumber);
    });

    return { results: combinedResults, log, classificationData, _not_logged_in_uspsa, fetchScope };

  } finally {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  }
}

// ── Refresh a single match ────────────────────────────────────────────────────
async function refreshMatch(match, memberNumber, name) {
  const log = [];
  const push = m => { log.push(m); console.log('[HFC]', m); };
  let tabId = null;

  try {
    push(`Refreshing ${match.match_name}…`);
    const tab = await chrome.tabs.create({
      url: `${PS_BASE}/results/new/${match.match_id}`,
      active: false,
    });
    tabId = tab.id;
    await waitForTabLoad(tabId);

    const score  = await fetchMatchScore(tabId, match.match_id, memberNumber, name, push);
    if (score._pageMatchType) match.match_type = score._pageMatchType;
    const classifierMap = score.overall_pct != null
      ? await fetchMatchDef(match.match_id, push)
      : null;
    const stages = score.overall_pct != null
      ? await fetchStageData(tabId, match.match_id, memberNumber, name, score._divKey, score._stageOptions, push, classifierMap, score._divisionOptions)
      : null;
    const result = buildResult(match, { ...score, stages }, memberNumber);
    if (result.overall_pct != null) {
      await updateMatchCache(match.match_id, result);
    }

    // Persist confirmed match type back to lastMatchList
    if (score._pageMatchType) {
      const stored = await chrome.storage.local.get('lastMatchList');
      const list = stored.lastMatchList || [];
      const idx = list.findIndex(m => m.match_id === match.match_id);
      if (idx >= 0) { list[idx].match_type = score._pageMatchType; await chrome.storage.local.set({ lastMatchList: list }); }
    }

    push(`Done — ${score.overall_pct != null ? score.overall_pct + '%' : 'not found'} [${score.found_by || 'none'}]`);
    return { result: { ...result, _cached: false }, log };

  } finally {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
  }
}

// ── Fetch score from results/new/{matchId} ────────────────────────────────────
async function fetchMatchScore(tabId, matchId, memberNumber, name, push) {
  const url = `${PS_BASE}/results/new/${matchId}`;

  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  await sleep(1500);

  // ── Step 1: wait for page to render, find competitor in default (combined) view ──
  let state = null;
  for (let i = 0; i < 10; i++) {
    state = await runInTab(tabId, getResultsNewState, [memberNumber || '', name || '']);
    if (state._cf)      { push(`     CF — waiting (${i + 1})`); await sleep(3000); continue; }
    if (state._loading) { await sleep(1500); continue; }
    break;
  }

  if (!state?._ready) {
    push(`     results/new did not load: ${state?._debug || 'unknown'}`);
    return {};
  }

  // Capture confirmed match type from the page (available regardless of whether competitor was found)
  const _pageMatchType = state.pageMatchType || null;
  if (_pageMatchType) push(`     page type: ${_pageMatchType}`);

  if (!state._found) {
    push(`     not found in combined view (${state._rowCount} rows, headers: [${state._headers?.join(', ')}])`);
    return { _pageMatchType };
  }

  const division = state.competitorData.division;
  push(`     found via ${state.found_by} — div: ${division}`);

  // ── Step 2: ensure #resultLevel = Overall ────────────────────────────────
  const overallOpt = state.resultLevelOptions.find(o =>
    /^(overall|match)$/i.test(o.text.trim())
  );
  if (overallOpt) {
    await runInTab(tabId, setSelectAndFire, ['resultLevel', overallOpt.value]);
    await sleep(600);
  }

  // ── Step 3: set #divisionLevel to the competitor's division ──────────────
  const divKey  = divisionToUrlKey(division);
  const divOpt  = state.divisionOptions.find(o => {
    const t = o.text.toLowerCase().replace(/\s+/g, '');
    const v = (o.value || '').toLowerCase().replace(/\s+/g, '');
    return t.includes(divKey) || v.includes(divKey) ||
           t === division.toLowerCase() || v === division.toLowerCase();
  });

  if (divOpt) {
    push(`     setting division: "${divOpt.text}" (value="${divOpt.value}")`);
    await runInTab(tabId, setSelectAndFire, ['divisionLevel', divOpt.value]);
    await sleep(1000);
  } else {
    push(`     no matching division option found for "${division}" — reading combined stats`);
  }

  // ── Step 4: read competitor's stats from the now-filtered division view ──
  let finalState = null;
  for (let i = 0; i < 6; i++) {
    finalState = await runInTab(tabId, getResultsNewState, [memberNumber || '', name || '']);
    if (finalState._loading) { await sleep(1200); continue; }
    break;
  }

  if (!finalState?._found) {
    push(`     not found after division filter — falling back to combined stats`);
    finalState = state;
  }

  const d = finalState.competitorData;
  push(`     overall_pct=${d.overall_pct}  place=${d.place}/${d.total}`);

  // Collect stage options (everything in #resultLevel that isn't Overall/Match)
  const stageOptions = (finalState.resultLevelOptions || state.resultLevelOptions)
    .filter(o => /stage\s*\d+/i.test(o.text));

  return {
    overall_pct: d.overall_pct,
    div_pct:     d.overall_pct,
    div_place:   d.place,
    div_total:   d.total,
    place:       d.place,
    total:       d.total,
    division,
    class_:      d.class_,
    hf:          d.hf,
    found_by:    state.found_by,
    _pageMatchType,
    _divOpt:     divOpt,
    _divisionOptions: state.divisionOptions,
    _stageOptions: stageOptions,
    _divKey:     divKey,
    _stageLinks: stageOptions.map((o, i) => ({ num: i, href: o.value, text: o.text })),
  };
}

// ── Extract match list from /associate/step2 ─────────────────────────────────
function extractMatchList() {
  const DATE_FULL   = /^\d{4}-\d{2}-\d{2}$/;
  const UUID_FULL   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UUID_SEARCH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  const uuidByDate = new Map();
  for (const script of document.querySelectorAll('script:not([src])')) {
    const text = script.textContent;
    if (!text.includes('-')) continue;
    for (const m of text.matchAll(/\{[^{}]{5,2000}\}/g)) {
      try {
        const obj  = JSON.parse(m[0]);
        const vals = Object.values(obj).filter(v => typeof v === 'string');
        const uuid = vals.find(v => UUID_FULL.test(v));
        const date = vals.find(v => DATE_FULL.test(v));
        if (uuid && date && !uuidByDate.has(date)) uuidByDate.set(date, uuid.toLowerCase());
      } catch (_) {}
    }
  }

  const nameByDate = new Map();
  for (const row of document.querySelectorAll('tr')) {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
    const date  = cells.find(c => DATE_FULL.test(c));
    if (!date) continue;
    const name  = cells.find(c => c !== date && c.length > 3 && !UUID_FULL.test(c));
    if (name && !nameByDate.has(date)) nameByDate.set(date, name);
  }

  const results = [];
  for (const [date, uuid] of uuidByDate) {
    results.push({ match_id: uuid, match_name: nameByDate.get(date) || `Match ${uuid.substring(0, 8)}`, date });
  }

  if (results.length === 0 && nameByDate.size > 0) {
    const uuids = [...new Set([...document.body.innerHTML.matchAll(UUID_SEARCH)].map(m => m[0].toLowerCase()))];
    [...nameByDate.entries()].forEach(([date, name], i) => {
      if (uuids[i]) results.push({ match_id: uuids[i], match_name: name, date });
    });
  }

  return results;
}
