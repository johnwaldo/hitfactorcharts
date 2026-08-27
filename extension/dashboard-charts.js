// dashboard-charts.js — dashboard chart geometry and drawing primitives

// ═════════════════════════════════════════════════════════════════════════════
// Chart primitives (Canvas 2D)
// ═════════════════════════════════════════════════════════════════════════════

const PAD        = { top: 24, right: 52, bottom: 44, left: 48 };
const FONT       = '11px Inter, system-ui, sans-serif';

function selectAxisTickIndices(labels, positions, measureText, minGap = 10) {
  if (!labels.length || labels.length !== positions.length) return [];

  const widths = labels.map(label => measureText(label));
  const selected = [0];
  const selectedLabels = new Set([labels[0]]);
  let lastRight = positions[0] + widths[0] / 2;

  for (let index = 1; index < labels.length - 1; index++) {
    if (selectedLabels.has(labels[index])) continue;
    const left = positions[index] - widths[index] / 2;
    if (left < lastRight + minGap) continue;
    selected.push(index);
    selectedLabels.add(labels[index]);
    lastRight = positions[index] + widths[index] / 2;
  }

  if (labels.length === 1) return selected;

  const finalIndex = labels.length - 1;
  const finalLeft = positions[finalIndex] - widths[finalIndex] / 2;
  while (selected.length > 1) {
    const priorIndex = selected[selected.length - 1];
    const priorRight = positions[priorIndex] + widths[priorIndex] / 2;
    if (finalLeft >= priorRight + minGap) break;
    selected.pop();
    selectedLabels.delete(labels[priorIndex]);
  }

  const firstRight = positions[selected[0]] + widths[selected[0]] / 2;
  if (!selectedLabels.has(labels[finalIndex]) &&
      finalLeft >= firstRight + minGap) {
    selected.push(finalIndex);
  }

  return selected;
}

function formatAxisDateLabels(dates) {
  const distinctDatesByShortLabel = new Map();
  dates.forEach(date => {
    if (!date) return;
    const shortLabel = date.substring(5);
    if (!distinctDatesByShortLabel.has(shortLabel)) {
      distinctDatesByShortLabel.set(shortLabel, new Set());
    }
    distinctDatesByShortLabel.get(shortLabel).add(date);
  });

  return dates.map((date, index) => {
    if (!date) return `#${index + 1}`;
    const shortLabel = date.substring(5);
    return distinctDatesByShortLabel.get(shortLabel).size > 1 ? date : shortLabel;
  });
}

// Read CSS custom properties for canvas drawing (canvas doesn't support var())
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function GRID_COLOR() { return cssVar('--grid'); }
function AXIS_COLOR() { return cssVar('--axis'); }
function TEXT_COLOR() { return cssVar('--chart-text'); }
function CHART_BG()   { return cssVar('--chart-bg'); }

// USPSA classification bands (% thresholds)
const CLASS_BANDS = [
  { label: 'GM', min: 95,  max: 110, weight: 6, fill: 'rgba(255,215,0,0.08)',    text: 'rgba(255,215,0,0.85)' },
  { label: 'M',  min: 85,  max: 95,  weight: 5, fill: 'rgba(192,192,192,0.08)', text: 'rgba(192,192,192,0.85)' },
  { label: 'A',  min: 75,  max: 85,  weight: 4, fill: 'rgba(74,158,255,0.08)',  text: 'rgba(74,158,255,0.85)' },
  { label: 'B',  min: 60,  max: 75,  weight: 3, fill: 'rgba(76,175,80,0.08)',   text: 'rgba(76,175,80,0.85)' },
  { label: 'C',  min: 40,  max: 60,  weight: 2, fill: 'rgba(255,152,0,0.08)',   text: 'rgba(255,152,0,0.85)' },
  { label: 'D',  min: 0,   max: 40,  weight: 1, fill: 'rgba(120,120,120,0.08)', text: 'rgba(120,120,120,0.85)' },
];

function bandForPct(pct) {
  return CLASS_BANDS.find(b => pct >= b.min && pct < b.max) || null;
}

// ── Class-band Y-axis warp ────────────────────────────────────────────────────
// Builds a piecewise-linear warp map so each class band occupies proportional
// visual height on the chart (weighted by CLASS_BANDS weight), rather than the
// raw linear % scale which compresses A/M/GM shooters into the top sliver.
// Returns an array of { real, visual } breakpoints, or null if only one band
// is visible (in which case the chart falls back to a linear scale).
function buildWarpMap(lo, hi) {
  const segs = [];
  for (let i = CLASS_BANDS.length - 1; i >= 0; i--) {
    const b = CLASS_BANDS[i];
    const segLo = Math.max(b.min, lo);
    const segHi = Math.min(b.max, hi);
    if (segLo >= segHi) continue;
    segs.push({ lo: segLo, hi: segHi, weight: b.weight || (b.max - b.min) });
  }
  if (segs.length < 2) return null;
  const totalWeight = segs.reduce((s, g) => s + g.weight, 0);
  const pts = [{ real: segs[0].lo, visual: 0 }];
  let vPos = 0;
  for (const seg of segs) {
    vPos += seg.weight / totalWeight;
    pts.push({ real: seg.hi, visual: vPos });
  }
  return pts;
}

// Map a real % value to a [0,1] visual position using a warp map.
function warpPct(v, pts) {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    if (v <= c.real + 0.001) {
      const t = (v - p.real) / (c.real - p.real);
      return p.visual + t * (c.visual - p.visual);
    }
  }
  return 1;
}

function fmtPct(pct) {
  if (pct == null) return '—';
  const b = bandForPct(pct);
  const color = b ? b.text.replace('0.55', '1') : '#8a9bb0';
  const label = b ? ` <small style="font-size:9px;opacity:0.75">${b.label}</small>` : '';
  return `<span style="color:${color}">${pct.toFixed(1)}%${label}</span>`;
}

function chartArea(canvas) {
  return {
    x0: PAD.left,
    y0: PAD.top,
    w:  canvas.width  - PAD.left - PAD.right,
    h:  canvas.height - PAD.top  - PAD.bottom,
  };
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = CHART_BG();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Multi-series line chart ───────────────────────────────────────────────────
function drawMultiSeriesChart(canvas, seriesArr, allDates, opts = {}) {
  const hasData = seriesArr.some(s => s.points.length > 0);
  if (!hasData) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const {
    yLabel = '', yMin, yMax, invertY = false, trend = false, valueUnit = '%',
    showClassBands = false, preserveDuplicateDates = false,
  } = opts;

  const allY   = seriesArr.flatMap(s => s.points.map(p => p.y)).filter(v => v != null);
  const rawMin = yMin != null ? yMin : Math.min(...allY);
  const rawMax = yMax != null ? yMax : Math.max(...allY);
  const yRange = rawMax - rawMin || 1;

  // Build warp map for class-band-weighted Y-axis when showClassBands is active.
  // Falls back to null (linear scale) when fewer than two bands are visible.
  const warpMap = showClassBands ? buildWarpMap(rawMin, rawMax) : null;

  const dateToCanvasX = (date, pointIndex = null) => {
    const idx = preserveDuplicateDates && pointIndex != null ? pointIndex : allDates.indexOf(date);
    return area.x0 + (idx / Math.max(allDates.length - 1, 1)) * area.w;
  };
  const toY = v => {
    const norm = warpMap ? warpPct(v, warpMap) : (v - rawMin) / yRange;
    return invertY ? area.y0 + norm * area.h : area.y0 + (1 - norm) * area.h;
  };

  // Classification bands (drawn before grid so grid lines appear on top)
  if (showClassBands) {
    CLASS_BANDS.forEach(band => {
      const visMin = Math.max(band.min, rawMin);
      const visMax = Math.min(band.max, rawMax);
      if (visMin >= visMax) return;

      const y1 = toY(visMax); // top of band (higher % = lower canvas Y)
      const y2 = toY(visMin); // bottom of band
      const bh = y2 - y1;
      if (bh < 1) return;

      // Filled band
      ctx.fillStyle = band.fill;
      ctx.fillRect(area.x0, y1, area.w, bh);

      // Dashed boundary line at the top of each band
      ctx.strokeStyle = band.text.replace('0.55', '0.25');
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(area.x0, y1);
      ctx.lineTo(area.x0 + area.w, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label to the right of the chart area
      const midY = y1 + bh / 2;
      ctx.fillStyle = band.text;
      ctx.font      = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(band.label, area.x0 + area.w + 10, midY + 3);
    });
  }

  // Grid
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = rawMin + yRange * i / 5, cy = toY(v);
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), area.x0 - 5, cy + 3);
  }

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h); ctx.stroke();

  // Y label
  ctx.save(); ctx.translate(10, area.y0 + area.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0); ctx.restore();

  // X date labels
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  const dateLabels = formatAxisDateLabels(allDates);
  const datePositions = allDates.map((date, index) => dateToCanvasX(date, index));
  selectAxisTickIndices(dateLabels, datePositions, label => ctx.measureText(label).width)
    .forEach(index => {
      ctx.fillText(dateLabels[index], datePositions[index], area.y0 + area.h + 14);
  });

  // Legend (if multiple series)
  if (seriesArr.length > 1) {
    let lx = area.x0 + 8;
    const ly = area.y0 + area.h + 30;
    seriesArr.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 7, 12, 8);
      ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'left';
      ctx.fillText(s.label, lx + 16, ly);
      lx += 16 + ctx.measureText(s.label).width + 16;
    });
  }

  // Trend lines (per series, single series only)
  if (trend && seriesArr.length === 1) {
    const pts = seriesArr[0].points;
    if (pts.length >= 3) {
      const xs  = pts.map((_, i) => i);
      const ys  = pts.map(p => p.y);
      const n   = pts.length;
      const sx  = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
      const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0), sx2 = xs.reduce((a, v) => a + v * v, 0);
      const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
      const inter = (sy - slope * sx) / n;
      ctx.strokeStyle = 'rgba(255,152,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(dateToCanvasX(pts[0].date, 0),          toY(inter));
      ctx.lineTo(dateToCanvasX(pts[n - 1].date, n - 1), toY(slope * (n - 1) + inter));
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Lines + dots
  const hitMap = [];
  seriesArr.forEach(s => {
    const pts = s.points.filter(p => p.y != null);
    if (!pts.length) return;

    ctx.strokeStyle = s.color; ctx.lineWidth = s.dash ? 1.5 : 2;
    if (s.dash) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const cx = dateToCanvasX(p.date, i), cy = toY(p.y);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    if (s.dash) ctx.setLineDash([]);

    pts.forEach((p, index) => {
      const cx = dateToCanvasX(p.date, index), cy = toY(p.y);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(cx, cy, s.dash ? 3 : 4, 0, Math.PI * 2); ctx.fill();
      hitMap.push({ cx, cy, color: s.color, seriesLabel: s.label, valueUnit, ...p });
    });
  });

  // Tooltip
  canvas._hitMap    = hitMap;
  canvas._valueUnit = valueUnit;
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const my = (e.clientY - r.top)  * (canvas.height / r.height);
      let h = null;
      let nearestDistance = 16;
      for (const candidate of canvas._hitMap || []) {
        const distance = Math.hypot(candidate.cx - mx, candidate.cy - my);
        if (distance >= nearestDistance) continue;
        h = candidate;
        nearestDistance = distance;
      }
      if (h) {
        const unit = h.valueUnit;
        // Use escHtml for untrusted strings (match names, stage names) in tooltip innerHTML (F1)
        const multiMatchRows = h.multiMatch ? h.multiMatch.map(m => {
          if (unit === '%') {
            const b = bandForPct(m.y);
            const c = b ? b.text.replace('0.55', '1') : '#8a9bb0';
            return `<div class="tt-stage-row"><span class="tt-stage-name">${escHtml(m.label)}</span>`
              + `<span style="color:${c}">${m.y != null ? m.y.toFixed(1) + '%' + (b ? ' ' + b.label : '') : '—'}</span></div>`;
          }
          if (unit === 'match%') {
            return `<div class="tt-stage-row"><span class="tt-stage-name">${escHtml(m.label)}</span>`
              + `<span style="color:#8a9bb0">${m.y != null ? m.y.toFixed(1) + '%' : '—'}</span></div>`;
          }
          return `<div class="tt-stage-row"><span class="tt-stage-name">${escHtml(m.label)}</span>`
            + `<span style="color:#8a9bb0">${m.rawPlace}/${m.total} (beat ${m.y.toFixed(1)}%)</span></div>`;
        }).join('') : '';

        if (h.multiMatch) {
          const classBand = unit === '%' ? bandForPct(h.y) : null;
          const classLabel = classBand ? ` <span style="color:${classBand.text};font-size:10px">${classBand.label}</span>` : '';
          const avgLine = unit === '%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}%${classLabel} <span style="font-size:11px;color:#666">avg (div)</span></div>`
            : unit === 'match%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}% <span style="font-size:11px;color:#aab3c2">average match score</span></div>`
            : `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}% <span style="font-size:11px;color:#666">avg beaten</span></div>`;
          tooltipEl.innerHTML = `
            <div class="tt-name">${escHtml(h.label)}</div>
            <div class="tt-date">${escHtml(h.date || '')}</div>
            ${avgLine}
            <div class="tt-stages">${multiMatchRows}</div>
          `;
        } else {
          const hasOfficialClassContext = unit === '%' || (unit === 'classifier%' && h.isOfficial);
          const classBand = hasOfficialClassContext ? bandForPct(h.y) : null;
          const classLabel = classBand
            ? `<span style="color:${classBand.text};font-size:10px;margin-left:6px">${classBand.label}</span>` : '';
          const mainVal = unit === '%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}%${classLabel} <span style="font-size:11px;color:#666">(div)</span></div>`
            : unit === 'classifier%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}%${classLabel} <span style="font-size:11px;color:#aab3c2">${h.isOfficial ? 'official USPSA' : 'match-relative'}</span></div>`
            : unit === 'match%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}% <span style="font-size:11px;color:#aab3c2">match performance</span></div>`
            : unit === 'top%'
            ? `<div class="tt-score" style="color:${h.color}">${h.y.toFixed(1)}% <span style="font-size:11px;color:#aab3c2">compared with top shooter</span></div>`
            : unit === 'place%'
            ? `<div class="tt-score" style="color:${h.color}">Place ${h.rawPlace} / ${h.total} <span style="font-size:11px;color:#666">(beat ${h.y.toFixed(1)}% of field)</span></div>`
            : `<div class="tt-score" style="color:${h.color}">Place ${h.y}${h.total ? ' / ' + h.total : ''}</div>`;
          const divLine = (h.division || h.class_)
            ? `<div class="tt-meta">${escHtml([h.division, h.class_].filter(Boolean).join(' / '))}</div>` : '';
          const overallLine = ((unit === '%' || unit === 'match%') && h.overall_pct != null && Math.abs(h.overall_pct - h.y) > 0.1)
            ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% overall</div>` : '';
          const pctLine = (unit === '' && h.overall_pct != null)
            ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% score</div>` : '';
          const nameLine = h.foundBy === 'name'
            ? `<div class="tt-meta" style="color:#ff9800">matched by name</div>` : '';
          const seriesLine = (canvas._hitMap || []).some(x => x.seriesLabel !== h.seriesLabel)
            ? `<div class="tt-meta" style="color:${h.color}">${escHtml(h.seriesLabel)}</div>` : '';
          const matchNameLine = (h.match_name && h.match_name !== h.label)
            ? `<div class="tt-meta">${escHtml(h.match_name)}</div>` : '';
          const hfLine = (h.hf != null && !h.stages?.length)
            ? `<div class="tt-meta">HF ${h.hf.toFixed(4)}</div>` : '';
          const hitsLine = (!h.stages?.length && (h.a || h.c || h.d || h.m || h.ns || h.p_))
            ? `<div class="tt-meta">${[
                h.a  ? `<span style="color:#4caf50">${h.a}A</span>`                    : '',
                h.c  ? `<span style="color:#fdd835">${h.c}C</span>`                    : '',
                h.d  ? `<span style="color:#ff9800">${h.d}D</span>`                    : '',
                h.m  ? `<span style="color:#f44336;font-weight:600">${h.m}M</span>`   : '',
                h.ns ? `<span style="color:#f44336;font-weight:600">${h.ns}NS</span>` : '',
                h.p_ ? `<span style="color:#f44336">${h.p_}P</span>`                  : '',
              ].filter(Boolean).join(' ')}</div>` : '';
          const stagesHtml = (h.stages && h.stages.length > 0)
            ? `<div class="tt-stages">${h.stages.map(s => {
                const clf = isClassifierStage(s);
                const clfBadge = clf ? `<span class="classifier-badge" title="${escHtml(clf.name ? clf.name + ' — ' : '') + 'CM ' + escHtml(clf.number)}">CM ${escHtml(clf.number)}</span>` : '';
                return `
                <div class="tt-stage-row">
                  <span class="tt-stage-name">${clfBadge}${escHtml(s.name)}</span>
                  <span class="tt-stage-hf">${s.hf != null ? s.hf.toFixed(4) : '—'}</span>
                  <span class="tt-stage-hits">${s.a ? '<span style="color:#4caf50">' + s.a + 'A</span> ' : ''}${s.c ? '<span style="color:#fdd835">' + s.c + 'C</span> ' : ''}${s.d ? '<span style="color:#ff9800">' + s.d + 'D</span>' : ''}${s.m ? ' <span style="color:#f44336;font-weight:600">' + s.m + 'M</span>' : ''}${s.ns ? ' <span style="color:#f44336;font-weight:600">' + s.ns + 'NS</span>' : ''}${s.p ? ' <span style="color:#f44336">' + s.p + 'P</span>' : ''}</span>
                </div>`;
              }).join('')}</div>` : '';
          tooltipEl.innerHTML = `
            <div class="tt-name">${escHtml(h.label)}</div>
            <div class="tt-date">${escHtml(h.date || '')}</div>
            ${mainVal}${divLine}${overallLine}${pctLine}${seriesLine}${nameLine}${matchNameLine}${hfLine}${hitsLine}${stagesHtml}
          `;
        }
        const tw = 300, th = (h.multiMatch || h.stages?.length) ? 280 : 130;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
  }
}

function drawLineChart(canvas, points, opts = {}) {
  if (!points.length) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const { yLabel = '', yMin, yMax, invertY = false, color = '#4a9eff', trend = false } = opts;

  const xs     = points.map((_, i) => i);
  const ys     = points.map(p => p.y);
  const rawMin = yMin != null ? yMin : Math.min(...ys);
  const rawMax = yMax != null ? yMax : Math.max(...ys);
  const yRange = rawMax - rawMin || 1;

  const toX = i => area.x0 + (i / Math.max(xs.length - 1, 1)) * area.w;
  const toY = v => {
    const norm = (v - rawMin) / yRange;
    return invertY ? area.y0 + norm * area.h : area.y0 + (1 - norm) * area.h;
  };

  // Grid
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const v = rawMin + yRange * i / 5, cy = toY(v);
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(0), area.x0 - 5, cy + 3);
  }

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h); ctx.stroke();

  // Y label
  ctx.save(); ctx.translate(10, area.y0 + area.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0); ctx.restore();

  // Trend
  if (trend && points.length >= 3) {
    const n = points.length;
    const sx = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
    const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0), sx2 = xs.reduce((a, v) => a + v * v, 0);
    const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
    const inter = (sy - slope * sx) / n;
    ctx.strokeStyle = 'rgba(255,152,0,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(toX(0), toY(inter)); ctx.lineTo(toX(n - 1), toY(slope * (n - 1) + inter));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Line
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => { i === 0 ? ctx.moveTo(toX(i), toY(p.y)) : ctx.lineTo(toX(i), toY(p.y)); });
  ctx.stroke();

  // Dots + hit map
  const hitMap = [];
  points.forEach((p, i) => {
    const cx = toX(i), cy = toY(p.y);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    hitMap.push({ cx, cy, label: p.label, value: p.y, date: p.date });
  });

  // X labels (MM-DD)
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  const pointLabels = formatAxisDateLabels(points.map(point => point.date));
  const pointPositions = points.map((_, index) => toX(index));
  selectAxisTickIndices(pointLabels, pointPositions, label => ctx.measureText(label).width)
    .forEach(index => {
      ctx.fillText(pointLabels[index], pointPositions[index], area.y0 + area.h + 14);
  });

  // Interactive tooltip
  canvas._hitMap   = hitMap;
  canvas._valueUnit = opts.valueUnit ?? '%';
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const my = (e.clientY - r.top)  * (canvas.height / r.height);
      const h  = (canvas._hitMap || []).find(h => Math.hypot(h.cx - mx, h.cy - my) < 16);
      if (h) {
        const unit = canvas._valueUnit;
        const scoreLine = unit === '%'
          ? `<div class="tt-score">${h.value.toFixed(2)}%</div>`
          : `<div class="tt-score">Place ${h.value}${h.total ? ' / ' + h.total : ''}</div>`;
        const divLine = (h.division || h.class_)
          ? `<div class="tt-meta">${[h.division, h.class_].filter(Boolean).join(' / ')}</div>`
          : '';
        const pctLine = (unit === '' && h.overall_pct != null)
          ? `<div class="tt-meta">${h.overall_pct.toFixed(1)}% overall</div>`
          : '';
        const placeLine = (unit === '%' && h.place != null)
          ? `<div class="tt-meta">Place ${h.place}${h.total ? ' / ' + h.total : ''}</div>`
          : '';
        const nameLine = h.foundBy === 'name'
          ? `<div class="tt-meta" style="color:#ff9800">matched by name</div>` : '';

        tooltipEl.innerHTML = `
          <div class="tt-name">${h.label}</div>
          <div class="tt-date">${h.date || ''}</div>
          ${scoreLine}${divLine}${pctLine}${placeLine}${nameLine}
        `;
        // Keep tooltip on screen
        const tw = 260, th = 120;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });
  }
}


function drawMessage(canvas, msg) {
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, canvas);
  canvas._hitMap = [];
  canvas._valueUnit = '';
  canvas.style.cursor = '';
  tooltipEl.style.display = 'none';
  ctx.fillStyle = TEXT_COLOR(); ctx.font = '13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
  const lines = String(msg).split('\n');
  const lineHeight = 19;
  const firstY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, firstY + index * lineHeight));
}

// ── Stacked bar chart — hit zone breakdown ────────────────────────────────────
// bars: [{ date, label, aPct, cPct, dPct, badPct, a, c, d, bad, total }]
// Segments: A (green) / C (yellow) / D (orange) / M+NS (red)
function drawStackedBarChart(canvas, bars) {
  if (!bars.length) { drawMessage(canvas, 'No data.'); return; }

  const ctx  = canvas.getContext('2d');
  const area = chartArea(canvas);
  clearCanvas(ctx, canvas);

  const COLORS = {
    a:   '#4caf50',
    c:   '#fdd835',
    d:   '#ff9800',
    bad: '#f44336',
  };
  const SEGMENTS = ['a', 'c', 'd', 'bad'];
  const SEG_LABELS = { a: 'A', c: 'C', d: 'D', bad: 'M+NS' };

  const n       = bars.length;
  const barW    = Math.max(4, Math.min(40, (area.w / n) * 0.7));
  const gap     = area.w / n;
  const hitMap  = [];

  bars.forEach((bar, i) => {
    const cx = area.x0 + gap * i + gap / 2;
    let yBottom = area.y0 + area.h;

    SEGMENTS.forEach(seg => {
      const pct = bar[seg + 'Pct'];
      if (!pct) return;
      const segH = (pct / 100) * area.h;
      const yTop = yBottom - segH;
      ctx.fillStyle = COLORS[seg];
      ctx.fillRect(cx - barW / 2, yTop, barW, segH);
      yBottom = yTop;
    });

    hitMap.push({ cx, cy: area.y0 + area.h / 2, bar });

  });

  // X labels
  ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'center';
  const barLabels = formatAxisDateLabels(bars.map(bar => bar.date));
  const barPositions = bars.map((_, index) => area.x0 + gap * index + gap / 2);
  selectAxisTickIndices(barLabels, barPositions, label => ctx.measureText(label).width)
    .forEach(index => {
      ctx.fillText(barLabels[index], barPositions[index], area.y0 + area.h + 14);
  });

  // Y axis — 0/25/50/75/100%
  ctx.strokeStyle = GRID_COLOR(); ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(v => {
    const cy = area.y0 + area.h - (v / 100) * area.h;
    ctx.beginPath(); ctx.moveTo(area.x0, cy); ctx.lineTo(area.x0 + area.w, cy); ctx.stroke();
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'right';
    ctx.fillText(v + '%', area.x0 - 5, cy + 3);
  });

  // Axes
  ctx.strokeStyle = AXIS_COLOR(); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x0, area.y0);
  ctx.lineTo(area.x0, area.y0 + area.h);
  ctx.lineTo(area.x0 + area.w, area.y0 + area.h);
  ctx.stroke();

  // Legend
  let lx = area.x0 + 8;
  const ly = area.y0 + area.h + 30;
  SEGMENTS.forEach(seg => {
    ctx.fillStyle = COLORS[seg];
    ctx.fillRect(lx, ly - 7, 10, 8);
    ctx.fillStyle = TEXT_COLOR(); ctx.font = FONT; ctx.textAlign = 'left';
    ctx.fillText(SEG_LABELS[seg], lx + 14, ly);
    lx += 14 + ctx.measureText(SEG_LABELS[seg]).width + 14;
  });

  // Tooltip
  canvas._hitMap    = hitMap;
  canvas._valueUnit = 'hitzones';
  if (!canvas._tooltipBound) {
    canvas._tooltipBound = true;
    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (canvas.width  / r.width);
      const h  = (canvas._hitMap || []).find(h => Math.abs(h.cx - mx) < (area.w / bars.length) / 2);
      if (h) {
        const b = h.bar;
        tooltipEl.innerHTML = `
          <div class="tt-name">${escHtml(b.label)}</div>
          <div class="tt-date">${escHtml(b.date || '')}</div>
          <div class="tt-meta" style="margin-top:4px">
            <span style="color:#4caf50">${b.a}A (${b.aPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#fdd835">${b.c}C (${b.cPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#ff9800">${b.d}D (${b.dPct.toFixed(0)}%)</span> &nbsp;
            <span style="color:#f44336;font-weight:600">${b.bad} M+NS (${b.badPct.toFixed(0)}%)</span>
          </div>
          <div class="tt-meta" style="color:#666">${b.total} total hits</div>
        `;
        const tw = 280, th = 110;
        const tx = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
        const ty = e.clientY - 10 + th > window.innerHeight ? e.clientY - th      : e.clientY - 10;
        tooltipEl.style.left    = tx + 'px';
        tooltipEl.style.top     = ty + 'px';
        tooltipEl.style.display = 'block';
        canvas.style.cursor = 'crosshair';
      } else {
        tooltipEl.style.display = 'none';
        canvas.style.cursor = '';
      }
    });
    canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
  }
}
