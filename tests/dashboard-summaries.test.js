const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'dashboard-summaries.js'), 'utf8');
const context = vm.createContext({
  Number, Math, String, Map, document: { getElementById: () => null },
  escHtml: value => String(value), leastSquaresRegression: () => null,
  effectiveDivPct: record => record.divPct ?? null,
  effectiveOverallPct: record => record.overallPct ?? null,
  getMetricStages: record => record.stages || [],
  computeAdjustedPct: () => null,
  divisionLabel: value => String(value),
  isClassifierStage: stage => stage.isClassifier === true,
});
vm.runInContext(`${source};
  globalThis.performanceClassForTest = performanceClass;
  globalThis.classBadgeForTest = _classBadge;
  globalThis.scoreTilesForTest = _scoreTiles;
  globalThis.placementTilesForTest = _placementTiles;
  globalThis.nonClassifierTilesForTest = _nonClassifierTiles;
  globalThis.classifierTilesForTest = _classifierTiles;
  globalThis.outcomeTilesForTest = _outcomeTiles;
`, context);

test('performance classes include every boundary and decimal value', () => {
  const classify = context.performanceClassForTest;
  assert.equal(classify(39.999).code, 'D');
  assert.equal(classify(40).code, 'C');
  assert.equal(classify(60).code, 'B');
  assert.equal(classify(75).code, 'A');
  assert.equal(classify(76.5).code, 'A');
  assert.equal(classify(85).code, 'M');
  assert.equal(classify(95).code, 'GM');
});

test('performance classes handle finite outliers and reject missing values', () => {
  const classify = context.performanceClassForTest;
  assert.equal(classify(-1).code, 'D');
  assert.equal(classify(101).code, 'GM');
  assert.equal(classify(null), null);
  assert.equal(classify(NaN), null);
  assert.equal(classify(Infinity), null);
});

test('performance badges distinguish unofficial equivalents from official classes', () => {
  const equivalent = context.classBadgeForTest(76.5);
  assert.match(equivalent, /aria-label="Approximately A Class, unofficial match-performance equivalent"/);
  assert.match(equivalent, /performance-badge__approx[^>]*>≈</);
  assert.match(equivalent, /performance-badge__code[^>]*>A</);
  assert.match(equivalent, /performance-badge__class[^>]*>Class</);

  const official = context.classBadgeForTest(96, 'classifier');
  assert.match(official, /aria-label="GM Class, official classifier percentage"/);
  assert.doesNotMatch(official, />≈</);
});

test('recent match score receives an unofficial class-equivalent badge', () => {
  const firstTile = context.scoreTilesForTest([
    { divPct: 50 }, { divPct: 61 }, { divPct: 76 }, { divPct: 86 },
  ])[0];
  assert.match(firstTile, /Recent match score/);
  assert.match(firstTile, /Approximately B Class, unofficial match-performance equivalent/);
});

test('placement summaries add field-relative rank context without class badges', () => {
  const html = context.placementTilesForTest([
    { div_place: 1, div_total: 10 },
    { div_place: 5, div_total: 10 },
    { div_place: 2, div_total: 10 },
    { div_place: 4, div_total: 10 },
  ]).join('');

  assert.match(html, /Overall Rank Average/);
  assert.match(html, /Average placement: 3rd of 10 in the relevant field/);
  assert.match(html, /Recent placement/);
  assert.match(html, /Average placement: 4th of 10 in the relevant field/);
  assert.match(html, /Best placement/);
  assert.match(html, /90\.0%/);
  assert.match(html, /1st of 10 in the relevant field/);
  assert.match(html, /insight-tile--positive[\s\S]*?Best result/);
  assert.match(html, /Worst placement/);
  assert.match(html, /50\.0%/);
  assert.match(html, /5th of 10 in the relevant field/);
  assert.match(html, /insight-tile--negative[\s\S]*?Lowest result/);
  assert.doesNotMatch(html, /performance-badge/);
  assert.doesNotMatch(html, /≈/);
  assert.doesNotMatch(html, /Class/);
});

test('non-classifier summaries add badged finite best and worst values', () => {
  const html = context.nonClassifierTilesForTest([
    { y: 39 }, { y: 61 }, { y: 76 }, { y: 86 }, { y: NaN },
  ]).join('');

  assert.match(html, /Best stage performance/);
  assert.match(html, /86\.0%/);
  assert.match(html, /Worst stage performance/);
  assert.match(html, /39\.0%/);
  assert.match(html, /Approximately M Class, unofficial match-performance equivalent/);
  assert.match(html, /Approximately D Class, unofficial match-performance equivalent/);
});

test('classifier fallback stays unbadged while official percentages receive official badges', () => {
  context.leastSquaresRegression = samples => ({
    start: { y: samples[0].y },
    end: { y: samples.at(-1).y },
  });
  const fallbackTiles = context.classifierTilesForTest([
    { stages: [{ isClassifier: true, pct: 45 }], overallPct: 55 },
    { stages: [{ isClassifier: true, pct: 50 }], overallPct: 60 },
    { stages: [{ isClassifier: true, pct: 55 }], overallPct: 65 },
    { stages: [{ isClassifier: true, pct: 60 }], overallPct: 70 },
    { stages: [{ isClassifier: true, pct: 65 }], overallPct: 75 },
    { stages: [{ isClassifier: true, pct: 70 }], overallPct: 80 },
  ]);
  assert.doesNotMatch(fallbackTiles[0], /performance-badge/);
  assert.doesNotMatch(fallbackTiles[1], /performance-badge/);
  assert.match(fallbackTiles[3], /Match finish trend/);
  assert.match(fallbackTiles[3], /\+25\.0%/);
  assert.match(fallbackTiles[3], /Improving/);
  assert.doesNotMatch(fallbackTiles.join(''), /(?:correlation|association)/i);

  const officialTiles = context.classifierTilesForTest([
    { stages: [{ isClassifier: true, clf_pct: 75 }], overallPct: 70 },
    { stages: [{ isClassifier: true, clf_pct: 76 }], overallPct: 71 },
    { stages: [{ isClassifier: true, clf_pct: 77 }], overallPct: 72 },
    { stages: [{ isClassifier: true, clf_pct: 78 }], overallPct: 73 },
    { stages: [{ isClassifier: true, clf_pct: 79 }], overallPct: 74 },
    { stages: [{ isClassifier: true, clf_pct: 80 }], overallPct: 75 },
  ]);
  assert.match(officialTiles[0], /A Class, official classifier percentage/);
  assert.doesNotMatch(officialTiles[0], />≈</);
});

test('classifier match finish trend is unavailable with fewer than three match scores', () => {
  const tiles = context.classifierTilesForTest([
    { stages: [{ isClassifier: true, clf_pct: 75 }], overallPct: 70 },
    { stages: [{ isClassifier: true, clf_pct: 76 }], overallPct: 71 },
  ]);

  assert.match(tiles[3], /Match finish trend/);
  assert.match(tiles[3], /At least 3 comparable results are required/);
  assert.match(tiles[3], /Not enough data/);
});

test('missing placement and non-classifier values remain unavailable rather than zero', () => {
  const placement = context.placementTilesForTest([]).join('');
  const nonClassifier = context.nonClassifierTilesForTest([{ y: NaN }]).join('');
  assert.doesNotMatch(placement, />0\.0%</);
  assert.doesNotMatch(nonClassifier, />0\.0%</);
  assert.match(placement, /Not enough data/);
  assert.match(nonClassifier, /Not enough data/);
});

test('accuracy trends classify every nonzero percentage change directionally', () => {
  context.leastSquaresRegression = samples => ({
    start: { y: samples[0].y },
    end: { y: samples.at(-1).y },
  });

  const improving = context.outcomeTilesForTest([{ ns: 4 }, { ns: 3.8 }, { ns: 3.6 }], 'percentage').join('');
  assert.match(improving, /insight-tile--positive/);
  assert.match(improving, /Improving/);
  assert.match(improving, /-0\.4% predicted change/);
  assert.doesNotMatch(improving, /pp/);

  const needsAttention = context.outcomeTilesForTest([{ a: 10 }, { a: 9.8 }, { a: 9.6 }], 'percentage').join('');
  assert.match(needsAttention, /insight-tile--negative/);
  assert.match(needsAttention, /Needs attention/);
  assert.match(needsAttention, /-0\.4% predicted change/);

  const stable = context.outcomeTilesForTest([{ a: 10 }, { a: 10 }, { a: 10 }], 'percentage').join('');
  assert.match(stable, /insight-tile--neutral/);
  assert.match(stable, /Stable/);
});
