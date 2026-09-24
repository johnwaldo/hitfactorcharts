const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

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
