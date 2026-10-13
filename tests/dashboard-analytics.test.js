const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function hitShares(hits) {
  const total = Object.values(hits).reduce((sum, value) => sum + value, 0);
  return total ? Object.fromEntries(Object.entries(hits).map(([key, value]) => [key, value / total * 100])) : null;
}

function latestEligible(records) {
  return records.filter(record => record.total > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
}

test('accuracy shares use valid reported-hit denominators and reject zero totals', () => {
  assert.deepEqual(hitShares({ a: 8, c: 1, m: 1 }), { a: 80, c: 10, m: 10 });
  assert.equal(hitShares({ a: 0, c: 0, m: 0 }), null);
});

test('Accuracy Trend selects its geometry-only custom scale', () => {
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');
  assert.match(script, /chartAccuracy[\s\S]*?warpPoints: ACCURACY_TREND_WARP_POINTS/);
  assert.match(script, /chartAccuracy[\s\S]*?yTickValues: ACCURACY_TREND_TICKS/);
});

test('Accuracy Trend includes reported A-zone shares as a green series', () => {
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');
  assert.match(script, /\['A', '#22c55e', 'a'\]/);
  assert.match(script, /\['A', '#22c55e', 'a'\][\s\S]*?\['C', '#fdd835', 'c'\]/);
});

test('Hit Zone retains the six newest eligible records after filtering', () => {
  const records = Array.from({ length: 8 }, (_, index) => ({ date: `2026-01-0${index + 1}`, total: index === 1 ? 0 : 10 }));
  assert.deepEqual(latestEligible(records).map(record => record.date), [
    '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
  ]);
});

test('dashboard exposes and synchronizes the required division affordance', () => {
  const html = fs.readFileSync('extension/dashboard.html', 'utf8');
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');

  assert.match(html, /<select id="divisionFilter" required aria-describedby="divisionRequirement" aria-invalid="true"/);
  assert.match(html, /Select division — required/);
  assert.match(html, /Select a division before fetching scores\./);
  assert.match(html, /\.division-control\.is-required select/);
  assert.match(html, /\.division-control \{[\s\S]*?transform: translateY\(11px\);/);
  assert.match(html, /\.division-control__help\[hidden\]/);
  assert.match(html, /\.division-control select \{\s*min-height: 42px;/);
  assert.match(script, /function syncDivisionRequirement\(\)/);
  assert.match(script, /divisionControl\.classList\.toggle\('is-required', required\)/);
  assert.match(script, /syncDivisionRequirement\(\);/);
});

test('fetch snapshots division before asynchronous storage work and sends it explicitly', () => {
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');
  const fetch = script.slice(script.indexOf('async function fetchScoresFromDashboard('));
  assert.ok(fetch.indexOf('const requestedDivision = selectedDiv;') < fetch.indexOf('await chrome.storage.local.get'));
  assert.match(fetch, /action: 'fetchScores', memberNumber, name, fetchTimeline, fullHistory, requestedDivision/);
});

test('single-match refresh sends a division snapshot and replaces intentionally skipped scores', async () => {
  const script = fs.readFileSync('extension/dashboard-history.js', 'utf8');
  const refresh = script.slice(script.indexOf('async function refreshSingleMatch('));
  const skipped = { match_id: 'pcc-match', overall_pct: null, stages: null, _divisionSkipped: 'mismatch' };
  let request;
  const context = vm.createContext({
    selectedDiv: 'co', normalizeDivision: value => value,
    memberInput: { value: 'a103' }, nameInput: { value: 'Shooter' },
    allResults: [{ match_id: 'pcc-match', division: 'PCC', overall_pct: 90, stages: [{ a: 100 }], hf: 10 }],
    chrome: { runtime: { sendMessage: async message => {
      request = message;
      context.selectedDiv = 'pcc';
      return { ok: true, data: { result: skipped } };
    } } },
    renderAll() {}, renderMatchList() {}, updateStatusCounts() {}, console,
  });
  vm.runInContext(refresh, context);
  await context.refreshSingleMatch({ match_id: 'pcc-match' }, { classList: { add() {}, remove() {} } });
  assert.equal(request.requestedDivision, 'co');
  assert.deepEqual(context.allResults[0], skipped);
  assert.equal(context.allResults[0].hf, undefined);
});
