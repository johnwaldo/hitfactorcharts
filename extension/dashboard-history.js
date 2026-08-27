// dashboard-history.js — Match History rendering and actions

// ── Match history list ────────────────────────────────────────────────────────
function renderMatchList() {
  if (!allResults.length) { matchHistory.classList.remove('visible'); return; }

  matchHistory.classList.add('visible');
  matchRowsEl.innerHTML = '';

  const sorted = allResults.filter(matchesSelectedDivision).sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (da && db) ? db - da : 0;
  });

  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'match-empty';
    empty.textContent = `No ${divisionLabel(selectedDiv)} matches found.`;
    matchRowsEl.appendChild(empty);
    return;
  }

  sorted.forEach(match => {
    const hasStages  = !!(match.stages && match.stages.length > 0);
    const matchType  = effectiveMatchType(match);
    const isUnconfirmed = isUnconfirmedMatchType(match);
    const isUSPSA    = isChartable(match);
    const isDeselected = deselectedMatches.has(match.match_id);
    const isExcluded = !isUSPSA || isDeselected;

    const dotClass = match.found_by === 'member_number' ? 'scored'
                   : match.found_by === 'name'          ? 'named'
                   : 'none';

    // Compute adjusted match % from stage-level cross-division data
    let adjMatchPct = null;
    if (hasStages && match.division) {
      const adjStages = getMetricStages(match)
        .map(s => computeAdjustedPct(s, match.division))
        .filter(a => a != null);
      if (adjStages.length > 0) {
        adjMatchPct = adjStages.reduce((sum, a) => sum + a.adjPct, 0) / adjStages.length;
      }
    }

    const adjText = adjMatchPct != null
      ? ` · adj ${fmtPct(adjMatchPct)}`
      : '';

    const scorePct = effectiveOverallPct(match);
    const filteredText = hasExcludedStages(match) ? ' · filtered' : '';
    const scoreText = scorePct != null
      ? fmtPct(scorePct) + filteredText + adjText + (match.division ? ' · ' + escHtml(match.division) : '') + (match.class_ ? '/' + escHtml(match.class_) : '')
      : null;

    const metaParts = [match.date];
    if (match.fetched_at) metaParts.push(formatAge(match.fetched_at));
    if (match.found_by === 'name') metaParts.push('matched by name');
    if (hasStages) {
      const excludedCount = excludedStageCount(match);
      metaParts.push(`${match.stages.length} stages` + (excludedCount ? ` · ${excludedCount} excluded` : ''));
    }
    if (!isUSPSA) metaParts.push('excluded from charts');

    const typeBadgeClass = !isLikelyUSPSA(matchType)              ? 'type-other'
                         : isConfirmedUSPSA(matchType)            ? 'type-uspsa'
                         : 'type-unknown';

    const item = document.createElement('div');
    item.className = 'match-item' + (isExcluded ? ' excluded' : '');

    const row = document.createElement('div');
    row.className = 'match-row';
    row.dataset.matchId = match.match_id;
    row.tabIndex = -1;
    // Build row using DOM methods for untrusted text (match_name, matchType) to prevent XSS (F1)
    row.innerHTML = `
      <input type="checkbox" class="match-include-cb" title="Include in charts"
        ${isDeselected ? '' : 'checked'}
        ${!isUSPSA ? 'disabled' : ''}>
      <div class="match-dot ${dotClass}"></div>
      <div class="match-info">
        <div class="match-name"></div>
        <div class="match-meta"></div>
      </div>
      <span class="match-type-badge ${typeBadgeClass}"></span>
      <div class="match-score ${scoreText ? '' : 'none'}">${scoreText || 'No score'}</div>
      ${hasStages ? '<button class="expand-btn" title="Show stage breakdown">&#9658;</button>' : '<span class="expand-placeholder"></span>'}
      <button class="refresh-btn" title="Re-fetch this match">&#8635;</button>
      <button class="export-btn" title="Save as image">${SAVE_ICON}</button>
      <button class="delete-btn" title="Delete from history">&#x2715;</button>
    `;
    // Set untrusted text via textContent to prevent XSS
    row.querySelector('.match-name').textContent = match.match_name;
    row.querySelector('.match-meta').textContent = metaParts.join(' · ');
    row.querySelector('.match-type-badge').textContent = matchType;

    if (isUnconfirmed) {
      const typeControl = document.createElement('label');
      typeControl.className = 'match-type-control';
      const typeLabel = document.createElement('span');
      typeLabel.textContent = 'Type';
      const typeSelect = document.createElement('select');
      typeSelect.className = 'match-type-select';
      typeSelect.setAttribute('aria-label', `Classify ${match.match_name || 'unconfirmed match'}`);
      const resetOption = document.createElement('option');
      resetOption.value = '';
      resetOption.textContent = 'Keep unconfirmed';
      typeSelect.appendChild(resetOption);
      for (const supportedType of MANUAL_MATCH_TYPES) {
        const option = document.createElement('option');
        option.value = supportedType;
        option.textContent = supportedType;
        typeSelect.appendChild(option);
      }
      typeSelect.value = matchTypeOverrides[match.match_id] || '';
      typeSelect.addEventListener('change', async () => {
        typeSelect.disabled = true;
        const stored = await chrome.storage.local.get('matchTypeOverrides');
        const latestOverrides = normalizeMatchTypeOverrides(stored.matchTypeOverrides);
        if (MANUAL_MATCH_TYPES.includes(typeSelect.value)) {
          latestOverrides[match.match_id] = typeSelect.value;
        } else {
          delete latestOverrides[match.match_id];
        }
        await chrome.storage.local.set({ matchTypeOverrides: latestOverrides });
        matchTypeOverrides = latestOverrides;
        renderAll();
        renderMatchList();
        updateStatusCounts();
      });
      typeControl.append(typeLabel, typeSelect);
      row.insertBefore(typeControl, row.querySelector('.match-type-badge'));
    }

    if (hasStages) {
      const panel = document.createElement('div');
      panel.className = 'stage-panel';

      // Compute accuracy loss (seconds lost to non-A hits) per stage:
      // acc_loss = (C×1 + D×2 + M×5 + NS×5) / your_HF
      // This converts penalty points into "seconds you'd have saved with perfect accuracy".
      // Speed gap vs GM: how many seconds behind GM pace (gm_median_hf - your_hf) / gm_median_hf * time
      function stageAccLoss(s) {
        if (!s.hf || s.hf <= 0) return null;
        const b = reportedStageHit(s, 'b');
        const c = reportedStageHit(s, 'c');
        const d = reportedStageHit(s, 'd');
        const m = reportedStageHit(s, 'm');
        const ns = reportedStageHit(s, 'ns');
        const combined = m == null && ns == null ? reportedStageHit(s, 'm_ns') : null;
        if ([b, c, d, m, ns, combined].every(value => value == null)) return null;
        const penaltyPts = (b || 0) + (c || 0) + (d || 0) * 2
          + (m || 0) * 5 + (ns || 0) * 5 + (combined || 0) * 5;
        return penaltyPts / s.hf;
      }
      function stageGmPct(s) {
        if (!s.gm_median_hf || !s.hf) return null;
        return (s.hf / s.gm_median_hf) * 100;
      }

      const hasGM = match.stages.some(s => s.gm_median_hf != null);
      const hasXdiv = match.stages.some(s => s.xdiv_benchmarks != null);
      const hasB = match.stages.some(s => (reportedStageHit(s, 'b') || 0) > 0);
      const hasM = match.stages.some(s => stageReportsHit(s, 'm'));
      const hasNS = match.stages.some(s => stageReportsHit(s, 'ns'));
      const hasCombined = match.stages.some(s => stageReportsHit(s, 'm_ns') && !stageReportsHit(s, 'm') && !stageReportsHit(s, 'ns'));

      // Build table using DOM to avoid XSS on stage names (F1)
      const table = document.createElement('table');
      table.className = 'stage-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const headers = ['Stage', 'Time', 'HF', '%'];
      if (hasXdiv) headers.push('Adj%');
      if (hasGM) headers.push('GM%', 'Acc Loss');
      headers.push('A');
      if (hasB) headers.push('B');
      headers.push('C', 'D');
      if (hasM) headers.push('M');
      if (hasNS) headers.push('NS');
      if (hasCombined) headers.push('M+NS');
      headers.push('P');
      headers.forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h;
        if (i > 0) th.style.textAlign = 'right';
        const colClass = { A: 'col-a', B: 'col-b', C: 'col-c', D: 'col-d', M: 'col-m', NS: 'col-ns', 'M+NS': 'col-mns', P: 'col-p' }[h];
        if (colClass) th.className = colClass;
        if (h === 'Adj%') {
          th.title = 'Field-strength adjusted %\nNormalizes the best HF from any division at this match to your division using HHF ratios, giving you a more accurate classification read regardless of who showed up.';
          th.style.cursor = 'help';
        }
        if (h === '%') {
          th.title = 'Raw stage % — your HF vs the top HF in your division only.\nInflated when no GM/Master is present in your division.';
          th.style.cursor = 'help';
        }
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      match.stages.forEach((s, stageIndex) => {
        const clf = isClassifierStage(s);
        const tr = document.createElement('tr');
        const key = stageKey(s, stageIndex);
        const override = getStageOverride(match, s, stageIndex);
        const included = override.included !== false;
        const note = override.note || '';
        if (!included) tr.classList.add('stage-excluded');

        // Stage name cell — use DOM to prevent XSS
        const nameTd = document.createElement('td');
        const factorLabel = document.createElement('label');
        factorLabel.className = 'stage-factor-toggle';
        factorLabel.title = 'Include this stage in match performance, adjusted %, accuracy, and hit-zone aggregates';

        const factorCb = document.createElement('input');
        factorCb.type = 'checkbox';
        factorCb.className = 'stage-factor-cb';
        factorCb.checked = included;
        factorCb.dataset.stageKey = key;
        factorLabel.appendChild(factorCb);
        factorLabel.appendChild(document.createTextNode('Factor'));
        nameTd.appendChild(factorLabel);

        const nameLine = document.createElement('div');
        nameLine.className = 'stage-name-line';
        if (clf) {
          const badge = document.createElement('a');
          badge.className = 'classifier-badge';
          badge.href = `https://uspsa.org/viewer/${encodeURIComponent(clf.number)}.pdf`;
          badge.target = '_blank';
          badge.title = `${clf.name ? clf.name + ' — ' : ''}CM ${clf.number} · View stage description`;
          badge.textContent = `CM ${clf.number}`;
          nameLine.appendChild(badge);
        }
        nameLine.appendChild(document.createTextNode(normalizeStgName(s.name)));
        if (!included) {
          const excludedBadge = document.createElement('span');
          excludedBadge.className = 'stage-excluded-badge';
          excludedBadge.textContent = 'Excluded';
          nameLine.appendChild(excludedBadge);
        }
        nameTd.appendChild(nameLine);

        const noteInput = document.createElement('input');
        noteInput.type = 'text';
        noteInput.className = 'stage-note-input';
        noteInput.placeholder = 'Exclusion note (optional)';
        noteInput.maxLength = 120;
        noteInput.value = note;
        noteInput.dataset.stageKey = key;
        noteInput.title = 'Optional reason, e.g. gun broke';
        nameTd.appendChild(noteInput);
        tr.appendChild(nameTd);

        // Numeric cells
        const cells = [
          s.time != null ? s.time.toFixed(2) + 's' : '—',
          s.hf   != null ? s.hf.toFixed(4)         : '—',
          null, // pct — uses fmtPct (HTML)
        ];
        cells.forEach((val, i) => {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        });
        // % cell — show official USPSA clf_pct as primary when available, match % as secondary
        const pctTd = tr.children[3];
        if (clf && s.clf_pct != null) {
          pctTd.innerHTML = `${fmtPct(s.clf_pct)}<br><small style="opacity:0.6" title="Match %">match: ${s.pct != null ? s.pct.toFixed(1) + '%' : '—'}</small>`;
        } else {
          pctTd.innerHTML = fmtPct(s.pct);
        }

        // Adjusted % cell — field-strength-normalized percentage
        if (hasXdiv) {
          const adj = computeAdjustedPct(s, match.division);
          const adjTd = document.createElement('td');
          if (adj) {
            const b = bandForPct(adj.adjPct);
            const color = b ? b.text.replace('0.55', '1') : '#8a9bb0';
            adjTd.innerHTML = `<span style="color:${color}">${adj.adjPct.toFixed(1)}% <small style="font-size:9px;opacity:0.75">${adj.adjClass}</small></span>`;
            // Build detailed tooltip explaining the adjustment
            adjTd.title = `Field-adjusted: your HF (${s.hf?.toFixed(4)}) vs top shooter in ${adj.refDiv} (${adj.refHF?.toFixed(4)} HF, ${adj.refClass || '?'} class)\n`
              + `Normalized to ${match.division}: ${adj.normHF?.toFixed(4)} HF\n`
              + `${s.hf?.toFixed(4)} / ${adj.normHF?.toFixed(4)} = ${adj.adjPct.toFixed(1)}% (${adj.adjClass} class)`;
          } else if (clf) {
            adjTd.textContent = '—';
            adjTd.title = 'Classifier stage — official classifier percentages are already normalized against national division data, so adjusted % is not applied.';
          } else {
            adjTd.textContent = '—';
            adjTd.title = 'No cross-division data available for this stage';
          }
          tr.appendChild(adjTd);
        }

        if (hasGM) {
          // GM% cell
          const gmPct = stageGmPct(s);
          const gmTd = document.createElement('td');
          if (gmPct != null) {
            const color = gmPct >= 95 ? '#ffd700' : gmPct >= 85 ? '#e040fb' : gmPct >= 75 ? '#4caf50' : gmPct >= 60 ? '#4a9eff' : '#ff9800';
            gmTd.innerHTML = `<span style="color:${color}">${gmPct.toFixed(1)}%</span>`;
            gmTd.title = `Your HF vs median GM HF (${s.gm_median_hf?.toFixed(4)})`;
          } else {
            gmTd.textContent = '—';
          }
          tr.appendChild(gmTd);

          // Accuracy loss cell
          const accLoss = stageAccLoss(s);
          const accTd = document.createElement('td');
          if (accLoss != null) {
            const color = accLoss < 0.5 ? '#4caf50' : accLoss < 1.5 ? '#fdd835' : '#f44336';
            accTd.innerHTML = `<span style="color:${color}" title="Estimated seconds lost from reported non-A hits; combined M+NS remains combined">−${accLoss.toFixed(2)}s</span>`;
          } else {
            accTd.textContent = '—';
          }
          tr.appendChild(accTd);
        }

        // Hit columns
        const hitCols = [
          { val: reportedStageHit(s, 'a'), cls: 'col-a' },
          hasB && { val: reportedStageHit(s, 'b'), cls: 'col-b' },
          { val: reportedStageHit(s, 'c'), cls: 'col-c' },
          { val: reportedStageHit(s, 'd'), cls: 'col-d' },
          hasM && { val: reportedStageHit(s, 'm'), cls: 'col-m' },
          hasNS && { val: reportedStageHit(s, 'ns'), cls: 'col-ns' },
          hasCombined && { val: stageReportsHit(s, 'm') || stageReportsHit(s, 'ns') ? null : reportedStageHit(s, 'm_ns'), cls: 'col-mns' },
          { val: reportedStageHit(s, 'p'), cls: 'col-p' },
        ].filter(Boolean);
        hitCols.forEach(({ val, cls }) => {
          const td = document.createElement('td');
          td.className = cls;
          td.textContent = val == null ? '—' : String(val);
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      panel.appendChild(table);

      const filterActions = document.createElement('div');
      filterActions.className = 'stage-filter-actions';
      const filterHint = document.createElement('span');
      filterHint.className = 'stage-filter-hint';
      filterHint.textContent = 'Unchecked stages stay visible here but are omitted from charts, ratings, adjusted %, and accuracy aggregates.';
      const applyBtn = document.createElement('button');
      applyBtn.className = 'stage-filter-apply';
      applyBtn.textContent = 'Apply stage filters';
      applyBtn.disabled = true;
      const resetBtn = document.createElement('button');
      resetBtn.className = 'stage-filter-reset';
      resetBtn.textContent = 'Reset stages';
      resetBtn.disabled = !stageOverrides[match.match_id];
      filterActions.append(filterHint, applyBtn, resetBtn);
      panel.appendChild(filterActions);

      const markStageFiltersDirty = () => {
        applyBtn.disabled = false;
      };
      panel.querySelectorAll('.stage-factor-cb, .stage-note-input').forEach(input => {
        input.addEventListener('change', markStageFiltersDirty);
        input.addEventListener('input', markStageFiltersDirty);
      });
      applyBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const noteInputs = new Map([...panel.querySelectorAll('.stage-note-input')]
          .map(input => [input.dataset.stageKey, input.value.trim()]));
        const nextOverrides = {};
        panel.querySelectorAll('.stage-factor-cb').forEach(cb => {
          const key = cb.dataset.stageKey;
          const note = noteInputs.get(key) || '';
          if (!cb.checked || note) nextOverrides[key] = { included: cb.checked, note };
        });
        setMatchStageOverrides(match.match_id, nextOverrides);
        await saveStageOverrides();
        renderAll();
        renderMatchList();
        updateStatusCounts();
      });
      resetBtn.addEventListener('click', async e => {
        e.stopPropagation();
        setMatchStageOverrides(match.match_id, {});
        await saveStageOverrides();
        renderAll();
        renderMatchList();
        updateStatusCounts();
      });

      const toggleExpand = () => {
        const isOpen = panel.classList.toggle('open');
        item.classList.toggle('open', isOpen);
        row.querySelector('.expand-btn').textContent = isOpen ? '▼' : '▶';
      };

      row.style.cursor = 'pointer';
      row.addEventListener('click', e => {
        if (e.target.closest('.refresh-btn, .delete-btn, .export-btn, .match-include-cb, .classifier-badge')) return;
        toggleExpand();
      });
      row.querySelector('.expand-btn').addEventListener('click', e => {
        e.stopPropagation();
        toggleExpand();
      });

      item.appendChild(row);
      item.appendChild(panel);
    } else {
      item.appendChild(row);
    }

    // Checkbox: toggle match inclusion in charts
    if (isUSPSA) {
      row.querySelector('.match-include-cb').addEventListener('change', e => {
        e.stopPropagation();
        if (e.target.checked) {
          deselectedMatches.delete(match.match_id);
        } else {
          deselectedMatches.add(match.match_id);
        }
        saveDeselected();
        item.classList.toggle('excluded', !e.target.checked);
        renderAll();
        updateStatusCounts();
      });
    }

    // Refresh button
    row.querySelector('.refresh-btn').addEventListener('click', e => {
      e.stopPropagation();
      refreshSingleMatch(match, row.querySelector('.refresh-btn'));
    });

    // Export button → show per-match/stage image export menu
    row.querySelector('.export-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (_exportMenuMatch === match && _exportMenuEl.style.display !== 'none') {
        _exportMenuEl.style.display = 'none';
        _exportMenuMatch = null;
      } else {
        showExportMenu(match, e.currentTarget);
      }
    });

    // Delete button
    row.querySelector('.delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deleteMatch(match);
    });

    matchRowsEl.appendChild(item);
  });
}

// ── Render official class badge in the stat box ────────────────────────────────
// Shows the USPSA.org classification for the currently selected (or most common) division.
function renderClassBox(viewSortedDivision) {
  const box = document.getElementById('statClassBox');
  const val = document.getElementById('statClass');
  if (!classificationData?.divisions) { box.style.display = 'none'; return; }

  const divs = classificationData.divisions;
  // Match official division names to the canonical key used by the primary filter.
  let info = null;
  let matchedKey = null;
  if (viewSortedDivision) {
    matchedKey = Object.keys(divs).find(k => normalizeDivision(k) === normalizeDivision(viewSortedDivision));
    if (matchedKey) info = divs[matchedKey];
  }
  if (!info && !viewSortedDivision) {
    matchedKey = Object.keys(divs)[0];
    info = matchedKey ? divs[matchedKey] : null;
  }
  if (!info?.class_) { box.style.display = 'none'; return; }

  const c = info.class_.toUpperCase();

  // Three-line layout: class letter → percentage → "USPSA Class" label
  // Rebuild inner HTML directly so we're not fighting the val/lbl two-slot structure
  const bandColor = { GM:'#ffd700', M:'#e040fb', A:'#4caf50', B:'#4a9eff', C:'#ff9800', D:'#8a9bb0', U:'#666' }[c] || '#8a9bb0';
  const pctLine   = info.pct != null
    ? `<div style="font-size:14px;font-weight:600;color:#aaa;margin:2px 0 1px">${info.pct.toFixed(1)}%</div>`
    : '';
  box.innerHTML = `
    <div style="font-size:26px;font-weight:700;color:${bandColor};line-height:1.1">${escHtml(c)}</div>
    ${pctLine}
    <div style="font-size:12px;color:#777;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">USPSA Class</div>
  `;

  // Tooltip — explain what the class and % mean
  const divName = matchedKey || divisionLabel(viewSortedDivision) || 'your division';
  const tipPctLine = info.pct != null
    ? `${info.pct.toFixed(1)}% — your current classifier average.\n`
    : '';
  box.dataset.tip =
    `Your official USPSA classification in ${divName}.\n` +
    `${tipPctLine}` +
    `Classification is set by your best 6 classifier scores.\n` +
    `GM ≥95% · M ≥85% · A ≥75% · B ≥60% · C ≥40% · D <40%`;

  box.style.display = '';
}

// ── Delete a match from history/cache ────────────────────────────────────────
async function deleteMatch(match) {
  const ok = confirm(
    `Delete "${match.match_name}" from match history?\n\n` +
    `This removes it from your local cache. It will be re-fetched next time you click Fetch Scores.`
  );
  if (!ok) return;

  allResults = allResults.filter(r => r.match_id !== match.match_id);
  deselectedMatches.delete(match.match_id);
  setMatchStageOverrides(match.match_id, {});

  const d = await chrome.storage.local.get(['matchCache', 'lastMatchList']);
  const cache     = d.matchCache     || {};
  const matchList = d.lastMatchList  || [];
  delete cache[match.match_id];
  const newList = matchList.filter(m => m.match_id !== match.match_id);

  await chrome.storage.local.set({
    matchCache:        cache,
    lastMatchList:     newList,
    deselectedMatches: [...deselectedMatches],
    stageOverrides,
  });

  renderAll();
  renderMatchList();

  if (!allResults.length) {
    summaryBar.classList.remove('visible');
    chartsEl.classList.remove('visible');
    matchHistory.classList.remove('visible');
    setStatus('No matches. Click Fetch Scores to load.', '');
  } else {
    updateStatusCounts();
  }
}

async function refreshSingleMatch(match, btn) {
  btn.disabled = true;
  btn.classList.add('spinning');

  const memberNumber = memberInput.value.trim().toUpperCase();
  const name         = nameInput.value.trim();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'refreshMatch',
      match:  { match_id: match.match_id, match_name: match.match_name, date: match.date },
      memberNumber,
      name,
    });
    if (!response.ok) throw new Error(response.error);

    const { result } = response.data;
    const idx = allResults.findIndex(r => r.match_id === match.match_id);
    if (idx >= 0) allResults[idx] = { ...allResults[idx], ...result };

    renderAll();
    renderMatchList();
    updateStatusCounts();

  } catch (err) {
    console.error('Refresh failed:', err);
    btn.disabled = false;
    btn.classList.remove('spinning');
  }
}
