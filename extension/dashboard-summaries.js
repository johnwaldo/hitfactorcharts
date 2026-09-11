// dashboard-summaries.js — dashboard analytics summary helpers

const SUMMARY_IDS = [
  'chartTimeSummary',
  'chartPlaceSummary',
  'chartNonClfSummary',
  'chartClfSummary',
  'chartAccuracySummary',
  'chartHitZoneSummary',
];

function _avg(arr) {
  return arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : null;
}

function _finiteValues(values) {
  return values.filter(Number.isFinite);
}

// These bands are a familiar performance shorthand.  They are only official
// USPSA classes when the source is an official classifier percentage.
function performanceClass(percent) {
  if (!Number.isFinite(percent)) return null;
  if (percent >= 95) return { code: 'GM', label: 'GM', color: '#ffd700' };
  if (percent >= 85) return { code: 'M', label: 'M', color: '#e040fb' };
  if (percent >= 75) return { code: 'A', label: 'A', color: '#4caf50' };
  if (percent >= 60) return { code: 'B', label: 'B', color: '#4a9eff' };
  if (percent >= 40) return { code: 'C', label: 'C', color: '#ff9800' };
  return { code: 'D', label: 'D', color: '#8a9bb0' };
}

function _classBadge(percent, kind = 'equivalent') {
  const band = performanceClass(percent);
  if (!band) return '';
  const official = kind === 'classifier';
  const accessibleLabel = official
    ? `${band.label} Class, official classifier percentage`
    : `Approximately ${band.label} Class, unofficial match-performance equivalent`;
  const approximation = official
    ? ''
    : '<span class="performance-badge__approx" aria-hidden="true">≈</span>';
  return `<span class="performance-badge performance-badge--${band.code.toLowerCase()}" aria-label="${escHtml(accessibleLabel)}">${approximation}<span class="performance-badge__code" aria-hidden="true">${escHtml(band.code)}</span><span class="performance-badge__class" aria-hidden="true">Class</span></span>`;
}

function _recentComparison(values, recentSize = 3) {
  const finite = _finiteValues(values);
  if (finite.length <= recentSize) return null;
  const recent = finite.slice(-recentSize);
  const prior = finite.slice(0, -recentSize);
  return {
    recentAvg: _avg(recent),
    priorAvg: _avg(prior),
    delta: _avg(recent) - _avg(prior),
    recentCount: recent.length,
    priorCount: prior.length,
  };
}

function _overallTrend(values) {
  const samples = values
    .map((value, index) => ({ x: index, y: value }))
    .filter(sample => Number.isFinite(sample.y));
  if (samples.length < 3) return null;
  const regression = leastSquaresRegression(samples);
  if (!regression) return null;
  return {
    delta: regression.end.y - regression.start.y,
    count: samples.length,
  };
}

function _signed(value, digits = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function _trendStatus(delta, threshold = 1.0, lowerIsBetter = false) {
  const improvement = lowerIsBetter ? -delta : delta;
  if (improvement > threshold) return { tone: 'positive', icon: '↑', label: 'Improving' };
  if (improvement < -threshold) return { tone: 'negative', icon: '↓', label: 'Needs attention' };
  return { tone: 'neutral', icon: '→', label: 'Stable' };
}

function _contextStatus(label, icon = '•') {
  return { tone: 'context', icon, label };
}

function _insightTile({ label, value, comparison, meta, status, badge = '' }) {
  const safeStatus = status || _contextStatus('Context');
  return `
    <article class="insight-tile insight-tile--${safeStatus.tone}" role="listitem">
      <div class="insight-tile__label">${escHtml(label)}</div>
      <div class="insight-tile__value">${escHtml(value)}${badge}</div>
      <div class="insight-tile__status">
        <span class="insight-tile__icon" aria-hidden="true">${escHtml(safeStatus.icon)}</span>
        <span>${escHtml(safeStatus.label)}</span>
      </div>
      <div class="insight-tile__comparison">${escHtml(comparison)}</div>
      <div class="insight-tile__meta">${escHtml(meta)}</div>
    </article>`;
}

function _unavailableTile(label, reason) {
  return _insightTile({
    label,
    value: '—',
    comparison: reason,
    meta: 'Missing values are not treated as zero.',
    status: _contextStatus('Not enough data', '…'),
  });
}

function _renderSummary(id, tiles) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = tiles.join('');
  element.style.display = tiles.length ? '' : 'none';
}

function clearChartSummaries() {
  for (const id of SUMMARY_IDS) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.innerHTML = '';
    element.style.display = 'none';
  }
}

function _comparisonTile(label, comparison, unit, threshold = 1.0, lowerIsBetter = false, badge = '') {
  if (!comparison) return _unavailableTile(label, 'At least 4 results are required.');
  const status = _trendStatus(comparison.delta, threshold, lowerIsBetter);
  const thresholdNote = status.label === 'Stable'
    ? ` · stable within ±${threshold.toFixed(1)} ${unit === '%' ? '%' : 'hits'}`
    : '';
  return _insightTile({
    label,
    value: `${comparison.recentAvg.toFixed(1)}${unit}`,
    comparison: `${_signed(comparison.delta)}${unit === '%' ? '%' : ''} vs prior ${comparison.priorAvg.toFixed(1)}${unit}`,
    meta: `Recent ${comparison.recentCount} vs prior ${comparison.priorCount}${thresholdNote}`,
    status,
    badge,
  });
}

function _overallTrendTile(label, values, threshold = 1.0, lowerIsBetter = false) {
  const trend = _overallTrend(values);
  if (!trend) return _unavailableTile(label, 'At least 3 comparable results are required.');
  const status = _trendStatus(trend.delta, threshold, lowerIsBetter);
  const thresholdNote = status.label === 'Stable' ? ` · stable within ±${threshold.toFixed(1)}%` : '';
  return _insightTile({
    label,
    value: `${_signed(trend.delta)}%`,
    comparison: 'Predicted first-to-last change',
    meta: `Least-squares trend · n=${trend.count}${thresholdNote}`,
    status,
  });
}

function _extremeTile(label, values, direction, comparison, badgeKind = '') {
  const finite = _finiteValues(values);
  if (!finite.length) return _unavailableTile(label, 'Comparable results are unavailable.');
  const best = direction === 'best';
  const value = best ? Math.max(...finite) : Math.min(...finite);
  return _insightTile({
    label,
    value: `${value.toFixed(1)}%`,
    badge: badgeKind ? _classBadge(value, badgeKind) : '',
    comparison,
    meta: `${best ? 'Highest' : 'Lowest'} of ${finite.length} results in the filtered view`,
    status: _contextStatus(best ? 'Best result' : 'Lowest result', best ? '★' : '◇'),
  });
}

function _ordinal(value) {
  const rounded = Math.round(value);
  const remainder = rounded % 100;
  if (remainder >= 11 && remainder <= 13) return `${rounded}th`;
  return `${rounded}${['th', 'st', 'nd', 'rd'][rounded % 10] || 'th'}`;
}

function _averagePlacementContext(entries) {
  const averagePlace = _avg(entries.map(entry => entry.place));
  const averageTotal = _avg(entries.map(entry => entry.total));
  return `Average placement: ${_ordinal(averagePlace)} of ${Math.round(averageTotal)} in the relevant field`;
}

function _placementExtremeTile(label, entries, direction) {
  if (!entries.length) return _unavailableTile(label, 'Placement data is unavailable.');
  const best = direction === 'best';
  const entry = entries.reduce((selected, candidate) => (
    best
      ? candidate.fieldBeaten > selected.fieldBeaten ? candidate : selected
      : candidate.fieldBeaten < selected.fieldBeaten ? candidate : selected
  ));
  return _insightTile({
    label,
    value: `${entry.fieldBeaten.toFixed(1)}%`,
    comparison: `${_ordinal(entry.place)} of ${entry.total} in the relevant field`,
    meta: `${best ? 'Highest' : 'Lowest'} percentage of the relevant field beaten`,
    status: best
      ? { tone: 'positive', icon: '★', label: 'Best result' }
      : { tone: 'negative', icon: '◇', label: 'Lowest result' },
  });
}

function _adjustedPairs(sorted) {
  const pairs = [];
  for (const record of sorted) {
    if (!record.stages?.length || !record.division) continue;
    const adjustedStages = getMetricStages(record)
      .map(stage => computeAdjustedPct(stage, record.division))
      .filter(Boolean);
    const raw = effectiveDivPct(record) ?? effectiveOverallPct(record);
    if (!adjustedStages.length || !Number.isFinite(raw)) continue;
    pairs.push({
      adjusted: _avg(adjustedStages.map(stage => stage.adjPct)),
      raw,
      references: adjustedStages.map(({ refClass, refDiv }) => ({ refClass, refDiv })),
    });
  }
  return pairs;
}

function dominantEliteReference(pairs) {
  const knownReferences = pairs
    .flatMap(pair => pair.references || [])
    .map(reference => ({
      refClass: String(reference.refClass || '').trim().toUpperCase(),
      refDiv: String(reference.refDiv || '').trim(),
    }))
    .filter(reference => /^[A-Z]{1,2}$/.test(reference.refClass) && reference.refDiv);
  if (!knownReferences.length) return null;

  const counts = new Map();
  for (const reference of knownReferences) {
    const key = `${reference.refClass}\u0000${reference.refDiv}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [topKey, topCount] = ranked[0];
  if (ranked[1]?.[1] === topCount || topCount <= knownReferences.length / 2) return null;

  const [refClass, refDiv] = topKey.split('\u0000');
  return ['GM', 'M'].includes(refClass) ? { refClass, refDiv } : null;
}

function _scoreTiles(sorted) {
  const rawValues = sorted
    .map(record => effectiveDivPct(record) ?? effectiveOverallPct(record))
    .filter(Number.isFinite);
  const adjustedPairs = _adjustedPairs(sorted);
  const adjustedValues = adjustedPairs.map(pair => pair.adjusted);
  const recentRaw = _recentComparison(rawValues);
  const tiles = [
    _comparisonTile(
      'Recent match score',
      recentRaw,
      '%',
      1.0,
      false,
      recentRaw ? _classBadge(recentRaw.recentAvg) : '',
    ),
  ];

  if (adjustedPairs.length >= 3) {
    const adjustedAverage = _avg(adjustedValues);
    const rawAverage = _avg(adjustedPairs.map(pair => pair.raw));
    const difference = adjustedAverage - rawAverage;
    const eliteReference = dominantEliteReference(adjustedPairs);
    const context = difference > 1.5
      ? 'Stronger overall fields than the division draw'
      : difference < -1.5
      ? 'Strong division draw relative to the match field'
      : eliteReference
      ? `Similar field strength · mostly ${eliteReference.refClass} ${divisionLabel(eliteReference.refDiv)}`
      : 'Division and overall field strength are similar';
    tiles.push(_insightTile({
      label: 'Adjusted average',
      value: `${adjustedAverage.toFixed(1)}%`,
      badge: _classBadge(adjustedAverage),
      comparison: `${_signed(difference)}% vs paired raw ${rawAverage.toFixed(1)}%`,
      meta: `${context} · unofficial match-performance equivalent · n=${adjustedPairs.length}`,
      status: _contextStatus('Field context', '◆'),
    }));
  } else {
    tiles.push(_unavailableTile('Adjusted average', 'At least 3 paired matches are required.'));
  }

  tiles.push(_overallTrendTile('Overall match trend', rawValues));
  tiles.push(_overallTrendTile('Overall adjusted trend', adjustedValues));
  return tiles;
}

function _placementTiles(sorted) {
  const placements = sorted
    .filter(record => Number.isFinite(record.div_place)
      && Number.isFinite(record.div_total)
      && record.div_place >= 1
      && record.div_place <= record.div_total)
    .map(record => ({
      place: record.div_place,
      total: record.div_total,
      fieldBeaten: (1 - record.div_place / record.div_total) * 100,
    }));
  const fieldBeaten = placements.map(placement => placement.fieldBeaten);
  const average = _avg(fieldBeaten);
  const recentPlacements = placements.slice(-3);
  const recent = _recentComparison(fieldBeaten);
  const averageTile = average == null
    ? _unavailableTile('Overall Rank Average', 'Placement data is unavailable.')
    : _insightTile({
      label: 'Overall Rank Average',
      value: `${average.toFixed(1)}%`,
      comparison: 'Average percentage of the relevant field beaten',
      meta: `${_averagePlacementContext(placements)} · n=${placements.length}`,
      status: _contextStatus('Overall view', '◎'),
    });
  const recentTile = recent
    ? _insightTile({
      label: 'Recent placement',
      value: `${recent.recentAvg.toFixed(1)}%`,
      comparison: `${_signed(recent.delta)}% vs prior ${recent.priorAvg.toFixed(1)}%`,
      meta: `${_averagePlacementContext(recentPlacements)} · recent ${recent.recentCount} vs prior ${recent.priorCount}`,
      status: _trendStatus(recent.delta),
    })
    : _unavailableTile('Recent placement', 'At least 4 results are required.');
  return [
    averageTile,
    recentTile,
    _placementExtremeTile('Best placement', placements, 'best'),
    _placementExtremeTile('Worst placement', placements, 'worst'),
  ];
}

function _nonClassifierTiles(points) {
  const values = points.map(point => point.y).filter(Number.isFinite);
  const recent = _recentComparison(values);
  return [
    _comparisonTile(
      'Recent stage performance',
      recent,
      '%',
      1.0,
      false,
      recent ? _classBadge(recent.recentAvg) : '',
    ),
    _overallTrendTile('Overall stage trend', values),
    _extremeTile(
      'Best stage performance',
      values,
      'best',
      'Match-relative non-classifier stage result',
      'equivalent',
    ),
    _extremeTile(
      'Worst stage performance',
      values,
      'worst',
      'Match-relative non-classifier stage result',
      'equivalent',
    ),
  ];
}

function _classifierData(sorted) {
  const officialScores = [];
  const fallbackScores = [];
  const matchScores = [];

  for (const record of sorted) {
    const classifiers = getMetricStages(record).filter(stage => isClassifierStage(stage));
    if (!classifiers.length) continue;
    const official = classifiers.map(stage => stage.clf_pct).filter(Number.isFinite);
    const fallback = classifiers.map(stage => stage.clf_pct ?? stage.pct).filter(Number.isFinite);
    officialScores.push(...official);
    fallbackScores.push(...fallback);

    const matchScore = effectiveOverallPct(record);
    if (!Number.isFinite(matchScore)) continue;
    matchScores.push(matchScore);
  }

  const useOfficial = officialScores.length > 0;
  const scores = useOfficial ? officialScores : fallbackScores;
  return {
    scores,
    basis: useOfficial ? 'Official USPSA national HHF' : 'Match-relative classifier fallback',
    matchScores,
  };
}

function _classifierTiles(sorted) {
  const data = _classifierData(sorted);
  const recentSize = Math.min(5, Math.floor(data.scores.length / 2));
  const recent = recentSize >= 1 && data.scores.length >= 6
    ? _recentComparison(data.scores, recentSize)
    : null;
  const averageMatchScore = _avg(data.matchScores);

  return [
    recent
      ? _comparisonTile(
        'Recent classifiers',
        recent,
        '%',
        1.5,
        false,
        data.basis.startsWith('Official') ? _classBadge(recent.recentAvg, 'classifier') : '',
      )
      : _unavailableTile('Recent classifiers', 'At least 6 classifier stages are required.'),
    data.scores.length
      ? _insightTile({
        label: 'Best classifier',
        value: `${Math.max(...data.scores).toFixed(1)}%`,
        badge: data.basis.startsWith('Official') ? _classBadge(Math.max(...data.scores), 'classifier') : '',
        comparison: data.basis,
        meta: `Best of ${data.scores.length} stages`,
        status: _contextStatus('Best result', '★'),
      })
      : _unavailableTile('Best classifier', 'Classifier scores are unavailable.'),
    averageMatchScore == null
      ? _unavailableTile('Classifier vs Match Performance', 'No paired match scores are available.')
      : _insightTile({
        label: 'Average match finish',
        value: `${averageMatchScore.toFixed(1)}%`,
        badge: _classBadge(averageMatchScore),
        comparison: 'If match finish counted as classification, this would be your average.',
        meta: `Unofficial match-performance equivalent · n=${data.matchScores.length}`,
        status: _contextStatus('Match context', '◎'),
      }),
    _overallTrendTile('Match finish trend', data.matchScores),
  ];
}

function _outcomeTiles(points, mode) {
  const definitions = [
    ['a', 'A hits', false],
    ['b', 'B hits', true],
    ['c', 'C hits', true],
    ['d', 'D hits', true],
    ['m', 'Misses', true],
    ['ns', 'No-shoots', true],
    ['m_ns', 'Combined M+NS', true],
  ];
  const tiles = [];

  for (const [key, label, lowerIsBetter] of definitions) {
    const property = mode === 'share' ? `${key}Pct` : key;
    const values = points.map(point => point[property]).filter(Number.isFinite);
    if (!values.length || (key === 'b' && !values.some(value => value > 0))) continue;

    if (mode === 'share' || mode === 'percentage') {
      const average = _avg(values);
      const trend = _overallTrend(values);
      const threshold = mode === 'percentage' ? 0 : 1.0;
      const status = trend ? _trendStatus(trend.delta, threshold, lowerIsBetter) : null;
      const thresholdNote = status?.label === 'Stable' ? ' · stable within ±1.0%' : '';
      tiles.push(_insightTile({
        label,
        value: `${average.toFixed(1)}%`,
        comparison: trend ? `${_signed(trend.delta)}% predicted change` : 'Trend needs at least 3 matches',
        meta: `Average reported hit-zone share · n=${values.length}${thresholdNote}`,
        status: status || _contextStatus('Not enough trend data', '…'),
      }));
      continue;
    }

    const comparison = _recentComparison(values);
    tiles.push(comparison
      ? _comparisonTile(label, comparison, '', 0.5, lowerIsBetter)
      : _unavailableTile(label, 'At least 4 matches with this reported column are required.'));
  }
  return tiles;
}

function generateSummaries(viewSorted, analysis = {}) {
  clearChartSummaries();
  const sorted = [...viewSorted].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });

  if (analysis.mode === 'classifiersOnly') {
    _renderSummary('chartTimeSummary', _classifierTiles(sorted));
    return;
  }

  _renderSummary('chartTimeSummary', _scoreTiles(sorted));
  _renderSummary('chartPlaceSummary', _placementTiles(sorted));
  _renderSummary('chartNonClfSummary', _nonClassifierTiles(analysis.nonClfPoints || []));
  _renderSummary('chartClfSummary', _classifierTiles(sorted));
  _renderSummary('chartAccuracySummary', _outcomeTiles(analysis.accuracyPoints || [], 'percentage'));
  _renderSummary('chartHitZoneSummary', _outcomeTiles(analysis.hitZoneBars || [], 'share'));
}
