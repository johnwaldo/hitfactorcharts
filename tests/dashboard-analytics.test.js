const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function hitShares(hits) {
  const total = Object.values(hits).reduce((sum, value) => sum + value, 0);
  return total ? Object.fromEntries(Object.entries(hits).map(([key, value]) => [key, value / total * 100])) : null;
}

function loadHitZoneHelper(context) {
  const charts = fs.readFileSync('extension/dashboard-charts.js', 'utf8');
  const helper = charts.slice(charts.indexOf('function buildRecentHitZoneBars('), charts.indexOf('\n// Raw shares are stored'));
  vm.runInContext(helper, context);
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
  const context = vm.createContext({
    getMetricStages: record => record.stages.filter(stage => !stage.excluded),
    reportedStageHit: (stage, key) => stage[key] ?? null,
  });
  loadHitZoneHelper(context);
  const records = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-01-0${index + 1}`, match_name: `Match ${index + 1}`,
    stages: [{ a: index === 1 ? 0 : 8, c: index === 1 ? 0 : 2 }],
  }));
  records[7].stages = [
    { a: 8, m: 1, ns: 0, m_ns: 99, p: 7 },
    { c: 2, m_ns: 1, p: 3 },
    { a: 100, excluded: true },
  ];
  records.push(
    { date: '2026-01-09', stages: [] },
    { date: '2026-01-10', stages: [{ p: 20 }] },
    { date: '2026-01-11', stages: [{}] },
    { date: '2026-01-12', stages: [{ a: 100, excluded: true }] },
  );
  const bars = context.buildRecentHitZoneBars(records.reverse());
  assert.deepEqual(Array.from(bars, record => record.date), [
    '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
  ]);
  const latest = bars[5];
  assert.equal(latest.label, 'Match 8');
  assert.equal(latest.total, 12);
  assert.equal(latest.a, 8);
  assert.equal(latest.aPct, 8 / 12 * 100);
  assert.equal(latest.cPct, 2 / 12 * 100);
  assert.equal(latest.mPct, 1 / 12 * 100);
  assert.equal(latest.nsPct, 0);
  assert.equal(latest.m_ns, 1);
  assert.equal(latest.m_nsPct, 1 / 12 * 100);
  assert.equal(latest.bPct, null);
  assert.equal(latest.dPct, null);
  assert.equal(latest.procedurals, 10);
});

test('Hit Zone defaults off without aggregation or canvas drawing and can be restored', () => {
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');
  const html = fs.readFileSync('extension/dashboard.html', 'utf8');
  assert.match(html, /id="chartHitZoneSection" hidden style="display:none"/);
  const activation = script.match(/const HIT_ZONE_BREAKDOWN_ENABLED = false;/)[0];
  const flow = script.slice(script.indexOf('  // ── Hit zone breakdown'), script.indexOf('\nfunction setStatus')).trim().replace(/\n}$/, '');
  for (const enabled of [false, true]) {
    const section = { hidden: true, style: { display: 'none' } };
    let aggregations = 0, draws = 0, analysis;
    const records = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-01-0${index + 1}`, match_name: `Match ${index + 1}`, stages: [{ a: 8, c: 2 }],
    }));
    const context = vm.createContext({
      viewSorted: records, nonClfPoints: [], accuracyPoints: [],
      document: { getElementById: id => id === 'chartHitZoneSection' ? section : {} },
      getMetricStages: record => { aggregations++; return record.stages; },
      reportedStageHit: (stage, key) => stage[key] ?? null,
      drawStackedBarChart: () => { draws++; },
      generateSummaries: (_, value) => { analysis = value; },
    });
    loadHitZoneHelper(context);
    vm.runInContext(`${enabled ? activation.replace('false', 'true') : activation}\n${flow}`, context);
    assert.equal(aggregations, enabled ? 8 : 0);
    assert.equal(draws, enabled ? 1 : 0);
    assert.equal(section.hidden, !enabled);
    assert.equal(section.style.display, enabled ? '' : 'none');
    assert.equal(analysis.hitZoneBars.length, enabled ? 6 : 0);
    if (enabled) {
      assert.equal(analysis.hitZoneBars[0].aPct, 80);
      assert.deepEqual(Array.from(analysis.hitZoneBars, bar => bar.date), [
        '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
      ]);
    }
  }
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
