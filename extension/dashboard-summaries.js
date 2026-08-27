// dashboard-summaries.js — dashboard analytics summary helpers

// ── Chart summaries ───────────────────────────────────────────────────────────
// Simple helper: mean of a numeric array (returns 0 on empty).
function _avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

// Trend label HTML for a percentage-point delta, with an inclusive ±threshold for "stable".
function _trendLabel(delta, threshold = 1.0) {
  if (delta >  threshold) return `<span class="s-up">↑ improving</span>`;
  if (delta < -threshold) return `<span class="s-down">↓ declining</span>`;
  const unit = threshold === 1 ? 'percentage point' : 'percentage points';
  return `<span class="s-flat">→ stable</span> ` +
    `<span class="s-note">(within ±${threshold.toFixed(1)} ${unit} of baseline)</span>`;
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

function generateSummaries(viewSorted) {
  const sorted = [...viewSorted].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });

  // ── 1. Score over time: last 3 matches vs prior baseline ──────────────────
  const scoredMatches = sorted.filter(r => effectiveDivPct(r) != null || effectiveOverallPct(r) != null);
  const scoreEl = document.getElementById('chartTimeSummary');
  if (scoreEl) {
    if (scoredMatches.length >= 4) {
      const recent     = scoredMatches.slice(-3);
      const prior      = scoredMatches.slice(0, -3);
      const recentAvg  = _avg(recent.map(r => effectiveDivPct(r) ?? effectiveOverallPct(r)).filter(v => v != null));
      const priorAvg   = _avg(prior.map(r => effectiveDivPct(r) ?? effectiveOverallPct(r)).filter(v => v != null));
      const delta      = recentAvg - priorAvg;
      const sign       = delta >= 0 ? '+' : '';
      scoreEl.innerHTML =
        `Last 3 matches: <span class="s-val">${recentAvg.toFixed(1)}%</span> ` +
        `vs prior baseline <span class="s-val">${priorAvg.toFixed(1)}%</span> ` +
        `— ${sign}${delta.toFixed(1)} pp ${_trendLabel(delta)}`;
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
      const adjs = getMetricStages(r).map(s => computeAdjustedPct(s, r.division)).filter(Boolean);
      if (!adjs.length) continue;
      const rawPct = effectiveDivPct(r) ?? effectiveOverallPct(r);
      if (rawPct == null) continue;
      pairs.push({
        adj: _avg(adjs.map(a => a.adjPct)),
        raw: rawPct,
        references: adjs.map(({ refClass, refDiv }) => ({ refClass, refDiv })),
      });
    }
    if (pairs.length >= 3) {
      const meanAdj = _avg(pairs.map(p => p.adj));
      const meanRaw = _avg(pairs.map(p => p.raw));
      const diff    = meanAdj - meanRaw;
      const sign    = diff >= 0 ? '+' : '';
      const eliteReference = dominantEliteReference(pairs);
      const context = diff > 1.5
        ? `You're regularly competing against stronger fields than your division draw alone suggests.`
        : diff < -1.5
        ? `Your division tends to draw competitive shooters relative to the overall match field.`
        : eliteReference
        ? `Your raw division % was already measured against predominantly ${escHtml(eliteReference.refClass)}-class competition in ${escHtml(divisionLabel(eliteReference.refDiv))}, so little field-strength adjustment was needed.`
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
        const recentPct = _avg(pcts.slice(-3)) * 100;
        const priorPct  = _avg(pcts.slice(0, -3)) * 100;
        const delta     = priorPct - recentPct; // positive = moved up = improving
        const sign      = delta >= 0 ? '+' : '';
        trendStr        = ` Recent: top <span class="s-val">${recentPct.toFixed(1)}%</span> ` +
          `vs prior top <span class="s-val">${priorPct.toFixed(1)}%</span> ` +
          `— ${sign}${delta.toFixed(1)} pp ${_trendLabel(delta)}.`;
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
      for (const s of getMetricStages(r)) {
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
        `— ${sign}${delta.toFixed(1)} pp ${_trendLabel(delta, 1.5)} ` +
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
