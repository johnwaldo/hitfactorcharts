// dashboard-exports.js — dashboard export menus and downloads

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

function _classifierCardColor(pct) {
  if (pct == null) return '#8a9bb0';
  if (pct >= 95) return '#ffd700';
  if (pct >= 85) return '#e040fb';
  if (pct >= 75) return '#4caf50';
  if (pct >= 60) return '#4a9eff';
  if (pct >= 40) return '#ff9800';
  return '#8a9bb0';
}

function _classifierCardLabel(pct) {
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
  const scorePct   = effectiveDivPct(match) ?? effectiveOverallPct(match);
  const hasScore   = scorePct != null;
  const showOverall = effectiveOverallPct(match) != null && effectiveDivPct(match) != null
                     && Math.abs(effectiveOverallPct(match) - effectiveDivPct(match)) > 0.1;
  const cardStages = getMetricStages(match);
  const hasStages  = cardStages.length > 0;

  let H = PAD;
  H += nameLines.length * 16;
  H += 4 + 14;
  if (hasScore) {
    H += 10 + 30;
    if (showOverall) H += 14;
    H += 8;
  }
  if (hasStages) { H += 1 + 8 + cardStages.length * 20 + 6; }
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
    ctx.font = `bold 28px ${F}`; ctx.fillStyle = '#8a9bb0';
    const ps = scorePct.toFixed(1) + '%';
    ctx.fillText(ps, ox + PAD, y + 24);
    const pw = ctx.measureText(ps).width;
    ctx.font = `9px ${F}`; ctx.fillStyle = '#555';
    ctx.fillText(hasExcludedStages(match) ? 'filtered %' : (match.div_pct != null ? 'div %' : 'overall %'), ox + PAD + pw + 6, y + 30);
    y += 30;
    if (showOverall) {
      ctx.font = `11px ${F}`; ctx.fillStyle = '#888';
      ctx.fillText(`overall: ${effectiveOverallPct(match).toFixed(1)}%`, ox + PAD, y + 10);
      y += 14;
    }
    y += 8;
  }

  if (hasStages) {
    _dividerLine(ctx, ox + PAD, y, W - PAD * 2); y += 8;
    const pctX = ox + W - PAD;
    const hfX  = pctX - 52;
    const nameMaxW = hfX - 50 - (ox + PAD);
    cardStages.forEach(s => {
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
      ctx.fillStyle = clf && s.clf_pct != null ? _classifierCardColor(pct) : '#8a9bb0';
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
  const hit = (key, label, color, positiveOnly = false) => {
    const value = reportedStageHit(stage, key);
    if (value == null || (positiveOnly && value <= 0)) return false;
    return { t: `${value}${label}`, c: color };
  };
  const hits = [
    hit('a', 'A', '#2eaf65'),
    hit('b', 'B', '#3b82f6', true),
    hit('c', 'C', '#d4a900'),
    hit('d', 'D', '#f97316'),
    hit('m', 'M', '#ef4444'),
    hit('ns', 'NS', '#d946ef'),
    !stageReportsHit(stage, 'm') && !stageReportsHit(stage, 'ns') && hit('m_ns', ' M+NS', '#8b5cf6'),
    hit('p', 'P', '#f44336'),
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
    const isOfficialClassifier = officialPct != null;
    const color = isOfficialClassifier ? _classifierCardColor(displayPct) : '#8a9bb0';
    const label = isOfficialClassifier ? _classifierCardLabel(displayPct) : '';
    ctx.font = `bold 28px ${F}`; ctx.fillStyle = color;
    const ps = displayPct.toFixed(1) + '%';
    ctx.fillText(ps, ox + PAD, y + 26);
    const pw = ctx.measureText(ps).width;
    if (label) {
      ctx.font = `bold 13px ${F}`; ctx.fillStyle = color;
      ctx.fillText(label, ox + PAD + pw + 6, y + 22);
    }
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
// Respects the active division, date-range preset, and Last 8 preference.
// Includes USPSA clf_pct when available (official % vs national reference HF).
function exportChartCSV() {
  const uspsaBase = allResults.filter(r => isChartable(r) && !deselectedMatches.has(r.match_id));
  const chartable = currentView === 'ranked'
    ? uspsaBase.filter(r => r.found_by === 'member_number' && effectiveOverallPct(r) != null)
    : uspsaBase.filter(r => effectiveOverallPct(r) != null || r.hf != null);
  const sorted = chartable.filter(matchesSelectedDivision).sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? da - db : 0;
  });
  const viewSorted = applyLast8Limit(filterByActiveDateRange(sorted));

  // Flat format: one row per stage (match-level fields repeated).
  // In classifiersOnly mode, only classifier stages are included.
  const headers = [
    'Date', 'Match', 'Division', 'Class', 'Overall %', 'Div %', 'Place', 'Div Place',
    'Stage', 'Stage HF', 'Stage Match %', 'Stage Time', 'A', 'B', 'C', 'D', 'M', 'NS', 'M+NS', 'P',
    'Stage Included', 'Stage Note', 'CM #', 'CM Name', 'USPSA %',
    'Adjusted %', 'Adjusted Ref Division', 'Adjusted Ref Class', 'Adjusted Ref HF',
    'Adjusted Normalized HF', 'Adjusted Method',
  ];
  const rows = [headers];

  for (const r of viewSorted) {
    const matchCols = [
      r.date        || '',
      r.match_name  || '',
      r.division    || '',
      r.class_      || '',
      effectiveOverallPct(r) != null ? effectiveOverallPct(r).toFixed(2) : '',
      effectiveDivPct(r)     != null ? effectiveDivPct(r).toFixed(2)     : '',
      r.place       != null ? r.place                   : '',
      r.div_place   != null ? r.div_place               : '',
    ];

    if (!r.stages?.length) {
      if (!classifiersOnly) rows.push([...matchCols, ...Array(headers.length - matchCols.length).fill('')]);
      continue;
    }

    for (const [stageIndex, s] of r.stages.entries()) {
      const clf = isClassifierStage(s);
      if (classifiersOnly && !clf) continue;
      const override = getStageOverride(r, s, stageIndex);
      const included = override.included !== false;
      const adj = computeAdjustedPct(s, r.division);
      rows.push([
        ...matchCols,
        s.name  || '',
        s.hf    != null ? s.hf.toFixed(4)   : '',
        s.pct   != null ? s.pct.toFixed(2)  : '',
        s.time  != null ? s.time.toFixed(2) : '',
        reportedStageHit(s, 'a') ?? '',
        reportedStageHit(s, 'b') ?? '',
        reportedStageHit(s, 'c') ?? '',
        reportedStageHit(s, 'd') ?? '',
        reportedStageHit(s, 'm') ?? '',
        reportedStageHit(s, 'ns') ?? '',
        stageReportsHit(s, 'm') || stageReportsHit(s, 'ns') ? '' : (reportedStageHit(s, 'm_ns') ?? ''),
        reportedStageHit(s, 'p') ?? '',
        included ? 'Yes' : 'No',
        override.note || '',
        clf?.number || '',
        clf?.name   || '',
        s.clf_pct != null ? s.clf_pct.toFixed(2) : '',
        adj?.adjPct != null ? adj.adjPct.toFixed(2) : '',
        adj?.refDiv || '',
        adj?.refClass || '',
        adj?.refHF != null ? adj.refHF.toFixed(4) : '',
        adj?.normHF != null ? adj.normHF.toFixed(4) : '',
        adj?.method || '',
      ]);
    }
  }

  const csv      = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const dateTag  = (DATE_RANGE_PRESETS[selectedDatePreset] || DATE_RANGE_PRESETS['6m']).fileTag;
  const divisionTag = selectedDiv ? ` ${divisionLabel(selectedDiv)}` : '';
  const last8Tag = last8Matches ? ' last 8' : '';
  const filename = (classifiersOnly ? 'hfc_classifiers' : 'hfc_scores') + `${divisionTag} ${dateTag}${last8Tag}.csv`;
  const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
