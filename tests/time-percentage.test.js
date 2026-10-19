const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Exercise production calculations, not a duplicated implementation of a formula.
function loadTimeMetrics(theme = 'light') {
  const background = fs.readFileSync('extension/background.js', 'utf8');
  const dashboard = fs.readFileSync('extension/dashboard.js', 'utf8');
  const context = vm.createContext({
    document: { documentElement: { getAttribute: () => theme } },
    getMetricStages: () => assert.fail('complete match totals must ignore stage-analysis selection'),
    escHtml: value => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    divisionLabel: value => value === 'co' ? 'Carry Optics' : value,
  });
  vm.runInContext(background.slice(background.indexOf('function normalizeRequestedDivision('), background.indexOf('\nfunction requireRequestedDivision(')), context);
  vm.runInContext(background.slice(background.indexOf('function computeTotalTimeBenchmarks('), background.indexOf('\n// ── Fetch stage stats')), context);
  vm.runInContext(dashboard.slice(dashboard.indexOf('const PS_DIV_TO_HFI ='), dashboard.indexOf('\nfunction syncDivisionRequirement(')), context);
  vm.runInContext(fs.readFileSync('extension/dashboard-charts.js', 'utf8'), context);
  return context;
}

function fixture() {
  const row = (competitor_id, division, time, hf) => ({ competitor_id, division, time, hf });
  const fields = [
    { num: 1, complete: true, rows: [row('shooter', 'CO', 60, 20), row('overall', 'PCC', 5, 1), row('division', 'CO', 90, 2)] },
    { num: 2, complete: true, rows: [row('shooter', 'CO', 65, 20), row('overall', 'PCC', 95, 1), row('division', 'CO', 20, 2)] },
  ];
  fields.forEach(field => { field.shooter = field.rows[0]; });
  return { fields, roster: fields[0].rows.map(row => ({ ...row })) };
}

function matchFrom(context, data = fixture()) {
  return { division: 'Carry Optics', date: '2026-10-01', match_name: 'Example',
    stages: data.fields.map(field => ({ num: field.num, time: field.shooter.time,
      is_classifier: field.num === 2, excluded: true, fastest_combined_time: 1 })),
    cache_completeness: { schema_version: 4, state: 'complete', expected_stage_count: 2, fetched_stage_count: 2, failed_stages: [] },
    match_time_benchmarks: context.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster) };
}

test('125/100/110 totals produce 80% overall and 88% division using one real competitor each', () => {
  const api = loadTimeMetrics(), match = matchFrom(api);
  assert.equal(api.computeMatchTimePct(match), 80);
  assert.equal(api.computeMatchTimePct(match, 'division'), 88);
  assert.equal(match.match_time_benchmarks.overall.competitor_id, 'overall');
  assert.equal(match.match_time_benchmarks.division.competitor_id, 'division');
  assert.equal(match.match_time_benchmarks.shooter.total_time, 125);
  // The reporting shooter has the best HF; crossed stage minima sum to only 25s.
  assert.notEqual(match.match_time_benchmarks.overall.total_time, 25);
  assert.notEqual(api.computeMatchTimePct(match), (5 / 60 + 20 / 65) * 50);
});

test('complete classifiers and excluded analysis stages still participate in raw match totals', () => {
  const api = loadTimeMetrics(), match = matchFrom(api);
  assert.equal(match.stages[1].is_classifier, true);
  assert.equal(api.getMatchTimeComparison(match).stageCount, 2);
  assert.equal(api.getMatchTimeComparison(match).shooterTime, 125);
  match.stages.forEach(stage => { stage.excluded = false; stage.is_classifier = false; });
  assert.equal(api.computeMatchTimePct(match), 80);
});

test('ties retain deterministic references without inventing a unique raw-time winner', () => {
  const api = loadTimeMetrics(), data = fixture();
  data.fields[0].rows[2].time = 80; // division total also 100
  const first = api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster);
  data.fields.forEach(field => field.rows.reverse());
  const reversed = api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster);
  assert.equal(first.overall.total_time, 100);
  assert.equal(first.overall.tie_count, 2);
  assert.equal(first.overall.competitor_id, reversed.overall.competitor_id);
  assert.equal(first.division.tie_count, 1);
  data.fields.forEach(field => { field.shooter.time = 50; });
  const match = matchFrom(api, data);
  assert.equal(api.computeMatchTimePct(match), 100);
  assert.equal(api.computeMatchTimePct(match, 'division'), 100);
  assert.equal(match.match_time_benchmarks.overall.tie_count, 3);
});

test('partial, invalid and source-disqualified competitors cannot become raw-time champions', () => {
  const api = loadTimeMetrics();
  for (const invalid of [null, undefined, 0, -1, NaN, Infinity, '1']) {
    const data = fixture();
    data.fields[1].rows[1].time = invalid;
    const result = api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster);
    assert.equal(result.overall.total_time, 110);
    assert.equal(result.eligible_count, 2);
  }
  const data = fixture();
  data.fields[1].rows.splice(1, 1);
  assert.equal(api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster).overall.total_time, 110);
  data.roster[2].ineligible = true;
  assert.equal(api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster).overall.total_time, 125);
});

test('unverified coverage, ambiguous identity and invalid shooter totals are unavailable', () => {
  const api = loadTimeMetrics();
  const mutations = [
    data => { data.fields.pop(); },
    data => { data.fields[1].num = 1; },
    data => { data.fields[1].complete = false; },
    data => { data.fields[1].shooter.time = 0; },
    data => { data.fields[1].rows.splice(0, 1); },
    data => { data.fields[0].rows[1].competitor_id = null; },
    data => { data.fields[0].rows[1].division = ''; },
    data => { data.fields[0].rows.push({ ...data.fields[0].rows[1] }); },
    data => { data.roster.push({ ...data.roster[0] }); },
    data => { data.roster[0].ineligible = true; },
    data => { data.roster = null; },
  ];
  for (const mutate of mutations) {
    const data = fixture(); mutate(data);
    const benchmark = api.computeTotalTimeBenchmarks(data.fields, [1, 2], data.roster);
    assert.equal(benchmark.state, 'unavailable');
    assert.equal(typeof benchmark.reason, 'string');
    assert.equal(benchmark.overall, undefined);
  }
  assert.equal(api.computeTotalTimeBenchmarks(fixture().fields, [1, 2, 3], fixture().roster).state, 'unavailable');
});

test('legacy minima and stale/malformed complete-match records never fall back to stage means', () => {
  const api = loadTimeMetrics();
  for (const mutate of [
    match => { delete match.match_time_benchmarks; },
    match => { match.match_time_benchmarks.state = 'unavailable'; },
    match => { match.match_time_benchmarks.version = 0; },
    match => { match.cache_completeness.state = 'partial'; },
    match => { match.stages.pop(); },
    match => { match.stages[0].time = 99; },
    match => { match.stages[0] = null; },
    match => { match.stages = { length: 2 }; },
    match => { match.division = 123; },
    match => { match.match_time_benchmarks.overall.division = 123; },
    match => { match.match_time_benchmarks.division.division = 'PCC'; },
    match => { match.match_time_benchmarks.shooter.total_time = 0; },
    match => { match.match_time_benchmarks.overall.total_time = 150; },
  ]) {
    const match = matchFrom(api); mutate(match);
    assert.equal(api.computeMatchTimePct(match), null);
    assert.equal(api.computeMatchTimePct(match, 'division'), null);
  }
});

test('time series retain separate same-day matches and disclose totals with distinct theme-safe styling', () => {
  for (const theme of ['light', 'dark']) {
    const api = loadTimeMetrics(theme), match = matchFrom(api);
    const records = [match, { ...match, match_name: 'Second same-day match' }, { ...match, match_time_benchmarks: null }];
    const overall = api.buildMatchTimeSeries(records, 'overall'), division = api.buildMatchTimeSeries(records, 'division');
    assert.equal(overall.points.length, 3);
    assert.equal(overall.points[0].y, 80);
    assert.equal(overall.points[1].label, 'Second same-day match');
    assert.equal(overall.points[2].y, null);
    assert.equal(division.points[0].y, 88);
    assert.notEqual(overall.color, division.color);
    assert.notDeepEqual([...overall.dash], [...division.dash]);
    const tooltip = api.matchTimeTooltip(division.points[0].timeComparison);
    assert.match(tooltip, /125\.00s/);
    assert.match(tooltip, /Carry Optics: 110\.00s/);
    assert.match(tooltip, /2 stages, including classifiers/);
    assert.match(tooltip, /not an official score winner/);
  }
});

test('Score Over Time defaults to independently visible performance series', () => {
  const html = fs.readFileSync('extension/dashboard.html', 'utf8');
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');

  assert.match(html, /Division performance/);
  assert.match(html, /Adjusted %<\/span>/);
  assert.match(html, /Overall Time %<\/span>/);
  assert.match(html, /Division Time %<\/span>/);
  assert.match(html, /id="divisionTimePctChk" aria-describedby="timePctHelp"/);
  assert.doesNotMatch(html, /Adjusted % Only|Time % Only/);
  assert.match(script, /let showDivisionPct\s*=\s*true/);
  assert.match(script, /let showAdjustedPct\s*=\s*true/);
  assert.match(script, /let showTimePct\s*=\s*true/);
  assert.match(script, /let showDivisionTimePct\s*=\s*true/);
  assert.match(script, /if \(showAdjustedPct\) \{/);
  assert.match(script, /if \(showTimePct\) \{/);
  assert.match(script, /selectedSeries\.push\(adjustedSeries\)/);
  assert.match(script, /selectedSeries\.push\(timeSeries\)/);
  assert.match(script, /selectedSeries\.push\(divisionTimeSeries\)/);
  assert.match(script, /availability\.textContent = unavailableMetrics\.join/);
  assert.doesNotMatch(script, /adjustedOnly/);
});

test('normal time controls are independent and survive Classifiers Only round trips', () => {
  const script = fs.readFileSync('extension/dashboard.js', 'utf8');
  const elements = new Map();
  const context = vm.createContext({ document: { getElementById: id => {
    if (!elements.has(id)) elements.set(id, { checked: false, style: {}, classList: { toggle() {} } });
    return elements.get(id);
  } }, renderAll() {} });
  vm.runInContext(`let currentView = 'ranked', classifiersOnly = false,
    showDivisionPct = true, showAdjustedPct = true, showTimePct = true, showDivisionTimePct = true;
    ${script.slice(script.indexOf('function syncChartModeControls('), script.indexOf("\ndocument.querySelectorAll('.view-btn').forEach"))}`, context);
  context.setChartMode('divisionTime', false);
  assert.equal(elements.get('divisionTimePctChk').checked, false);
  assert.equal(elements.get('timePctChk').checked, true);
  assert.equal(elements.get('divisionPctChk').checked, true);
  assert.equal(elements.get('adjustedPctChk').checked, true);
  context.setChartMode('classifiers', true);
  assert.equal(elements.get('classifiersOnlyChk').checked, true);
  context.setChartMode('classifiers', false);
  assert.equal(elements.get('timePctChk').checked, true);
  assert.equal(elements.get('divisionTimePctChk').checked, false);
  context.setChartMode('time', false);
  context.setChartMode('divisionTime', true);
  assert.equal(elements.get('timePctChk').checked, false);
  assert.equal(elements.get('divisionTimePctChk').checked, true);
});

test('CSV exports complete-match ratios and seconds separately from legacy stage columns', async () => {
  const api = loadTimeMetrics(), match = matchFrom(api);
  const legacy = { ...match, match_name: 'Legacy', match_time_benchmarks: null };
  let blob, downloads = 0;
  Object.assign(api, {
    Blob, URL: { createObjectURL: value => { blob = value; return 'blob:csv'; }, revokeObjectURL() {} },
    selectAnalyticsRecords: () => ({ records: [match, legacy] }),
    classifiersOnly: false, selectedDatePreset: '6m', selectedDiv: 'co', last8Matches: false,
    DATE_RANGE_PRESETS: { '6m': { label: '6 mo', fileTag: '6mo' } },
    effectiveOverallPct: () => 90, effectiveDivPct: () => 90,
    getStageOverride: () => ({ included: false }), computeAdjustedPct: () => null,
    isClassifierStage: stage => stage.is_classifier, reportedStageHit: () => null, stageReportsHit: () => false,
    setStatus: () => assert.fail('valid CSV should not report an empty export'),
  });
  api.document.createElement = () => ({ click: () => { downloads++; } });
  api.document.body = { appendChild() {}, removeChild() {} };
  const dashboard = fs.readFileSync('extension/dashboard.js', 'utf8');
  vm.runInContext(dashboard.slice(dashboard.indexOf('function computeTimePct('), dashboard.indexOf('// ── USPSA Classifier lookup')), api);
  const exports = fs.readFileSync('extension/dashboard-exports.js', 'utf8');
  vm.runInContext(exports.slice(exports.indexOf('function exportChartCSV(')), api);
  api.exportChartCSV();
  assert.equal(downloads, 1);
  const rows = (await blob.text()).split('\n').map(line => line.slice(1, -1).split('","'));
  const headers = rows[0], index = name => headers.indexOf(name);
  assert.ok(index('Overall Time %') >= 0);
  assert.ok(index('Division Time %') >= 0);
  assert.ok(index('Legacy Stage Time % (non-classifier)') >= 0);
  for (const row of rows.slice(1)) assert.equal(row.length, headers.length);
  for (const row of rows.slice(1, 3)) {
    assert.equal(row[index('Overall Time %')], '80.00');
    assert.equal(row[index('Division Time %')], '88.00');
    assert.equal(row[index('Complete Match Raw Time (s)')], '125.00');
    assert.equal(row[index('Overall Fastest Complete Raw Time (s)')], '100.00');
    assert.equal(row[index('Division Fastest Complete Raw Time (s)')], '110.00');
    assert.equal(row[index('Stage Included')], 'No');
  }
  for (const row of rows.slice(3)) {
    assert.equal(row[index('Overall Time %')], '');
    assert.equal(row[index('Division Time %')], '');
  }
});
