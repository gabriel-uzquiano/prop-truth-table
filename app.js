/* ═══════════════════════════════════════════════════════════════
   Truth Table App — Main Logic
   ═══════════════════════════════════════════════════════════════

   Textbook conventions (semantics.html):
   - Columns: sentence letters (alpha) | subformulas | full formula
   - Row ordering: innermost letter (rightmost) alternates fastest
     (2^0 T then 2^0 F blocks); each step to the left doubles the block.
     e.g. p,q,r → rows TT, TF, FT, FF for last two; TTT…FFT…FFF top→bottom
     Actually: p gets 2^(n-1) block, q gets 2^(n-2) … rightmost gets 2^0
   - Main connective column highlighted
   - T/F written as T and F
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── Mode & task state ─────────────────────────────────────────
var _mode = 'check';       // 'check' | 'build'
var _checkTask = 'formula'; // 'formula' | 'consistency' | 'validity'

// Check mode: list of { input, ast, label:'premise'|'conclusion'|'formula' }
var _checkFormulas = [];

// Build mode: single formula
var _buildInput  = '';
var _buildAst    = null;
var _buildTable  = null;   // { letters, cols, rows } — see buildTruthTable()
var _buildCells  = [];     // flat array of { rowIdx, colIdx, answer: null|'T'|'F' }
var _buildChecked = false;

// ── DOM refs ──────────────────────────────────────────────────
var modeTabCheck, modeTabBuild;
var checkPanel, buildPanel;
// Check mode
var checkTaskBtns;
var checkFormulaList;
var checkAddBtn, checkConcSep;
var checkTableWrapper, checkResult;
var checkEvalBtn;
// Build mode
var buildInput, buildStatus;
var buildTableWrapper;
var buildActionsRow, buildCheckBtn, buildResetBtn, buildFeedback;
var buildNewProblemBtn;

document.addEventListener('DOMContentLoaded', function() {
  modeTabCheck  = document.getElementById('tab-check');
  modeTabBuild  = document.getElementById('tab-build');
  checkPanel    = document.getElementById('check-panel');
  buildPanel    = document.getElementById('build-panel');

  checkTaskBtns    = document.querySelectorAll('.task-btn');
  checkFormulaList = document.getElementById('check-formula-list');
  checkAddBtn      = document.getElementById('check-add-btn');
  checkConcSep     = document.getElementById('check-conc-sep');
  checkTableWrapper= document.getElementById('check-table-wrapper');
  checkResult      = document.getElementById('check-result');
  checkEvalBtn     = document.getElementById('check-eval-btn');

  buildInput       = document.getElementById('build-input');
  buildStatus      = document.getElementById('build-status');
  buildTableWrapper= document.getElementById('build-table-wrapper');
  buildActionsRow  = document.getElementById('build-actions-row');
  buildCheckBtn    = document.getElementById('build-check-btn');
  buildResetBtn    = document.getElementById('build-reset-btn');
  buildFeedback    = document.getElementById('build-feedback');
  buildNewProblemBtn= document.getElementById('build-new-problem-btn');

  // Initialise with one formula slot in check mode
  addCheckSlot();
  renderModeUI();
  loadFromHash();
});

// ── Mode switching ────────────────────────────────────────────
function switchMode(m) {
  _mode = m;
  modeTabCheck.classList.toggle('active', m === 'check');
  modeTabBuild.classList.toggle('active', m === 'build');
  checkPanel.hidden = (m !== 'check');
  buildPanel.hidden = (m !== 'build');
}

function renderModeUI() {
  switchMode(_mode);
}

// ── Task switching (check mode) ───────────────────────────────
function switchTask(task) {
  _checkTask = task;
  checkTaskBtns.forEach(function(b) {
    b.classList.toggle('active', b.dataset.task === task);
  });
  rebuildCheckSlots();
  checkTableWrapper.innerHTML = '';
  checkResult.innerHTML = '';
}

// ── Check mode: formula slots ─────────────────────────────────
function rebuildCheckSlots() {
  // Keep existing inputs if compatible, otherwise reset to one slot
  var existing = [];
  var rows = checkFormulaList.querySelectorAll('.formula-slot');
  rows.forEach(function(r) {
    existing.push(r.querySelector('.formula-input').value);
  });
  checkFormulaList.innerHTML = '';
  _checkFormulas = [];

  if (_checkTask === 'formula') {
    // Single formula
    addCheckSlot('formula', existing[0] || '');
    checkAddBtn.hidden = true;
    checkConcSep.hidden = true;
  } else if (_checkTask === 'consistency') {
    // Multiple formulas
    var n = Math.max(2, existing.length);
    for (var i = 0; i < n; i++) addCheckSlot('formula', existing[i] || '');
    checkAddBtn.hidden = false;
    checkConcSep.hidden = true;
  } else if (_checkTask === 'validity') {
    // Premises + conclusion
    var premCount = Math.max(1, existing.length - 1);
    for (var i = 0; i < premCount; i++) addCheckSlot('premise', existing[i] || '');
    addCheckSlot('conclusion', existing[premCount] || '');
    checkAddBtn.hidden = false;  // adds premises
    checkConcSep.hidden = false;
    updateConcSepPosition();
    checkAddBtn.hidden = false;
  }
}

function updateConcSepPosition() {
  // Move conc-sep to just before the last (conclusion) slot
  if (_checkTask !== 'validity') return;
  var slots = checkFormulaList.querySelectorAll('.formula-slot');
  if (slots.length < 1) return;
  var lastSlot = slots[slots.length - 1];
  checkFormulaList.insertBefore(checkConcSep, lastSlot);
  checkConcSep.hidden = false;
}

function addCheckSlot(role, value) {
  role = role || (_checkTask === 'formula' ? 'formula' : 'premise');
  value = value || '';
  var idx = _checkFormulas.length;
  _checkFormulas.push({ input: value, ast: null, role: role });

  var slot = document.createElement('div');
  slot.className = 'formula-slot';
  slot.dataset.idx = idx;

  var tag = document.createElement('span');
  tag.className = 'formula-role-tag ' + role;
  tag.textContent = role === 'formula' ? '' : role === 'premise' ? 'Premise' : 'Conclusion';

  var inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'formula-input'; inp.value = value;
  inp.placeholder = role === 'conclusion' ? 'e.g. q' : 'e.g. p → q';
  inp.setAttribute('autocomplete','off'); inp.setAttribute('spellcheck','false');
  inp.dataset.idx = idx;
  inp.addEventListener('input', function() { onCheckInput(idx, inp.value); });

  var status = document.createElement('span');
  status.className = 'formula-status'; status.dataset.statusFor = idx;

  var rmBtn = null;
  if (_checkTask !== 'formula') {
    rmBtn = document.createElement('button');
    rmBtn.className = 'formula-remove'; rmBtn.textContent = '×';
    rmBtn.title = 'Remove';
    rmBtn.addEventListener('click', function() { removeCheckSlot(idx); });
    // Don't allow removing the conclusion
    if (role === 'conclusion') rmBtn.hidden = true;
  }

  if (role !== 'formula') slot.appendChild(tag);
  slot.appendChild(inp);
  slot.appendChild(status);
  if (rmBtn) slot.appendChild(rmBtn);

  // For validity: insert before conc-sep+conclusion
  if (_checkTask === 'validity' && role === 'premise') {
    var slots = checkFormulaList.querySelectorAll('.formula-slot');
    if (slots.length > 0 && checkFormulaList.contains(checkConcSep)) {
      checkFormulaList.insertBefore(slot, checkConcSep);
    } else {
      checkFormulaList.appendChild(slot);
    }
  } else {
    checkFormulaList.appendChild(slot);
  }

  if (value) onCheckInput(idx, value);
  return slot;
}

function removeCheckSlot(idx) {
  var newFormulas = [];
  var newSlots = [];
  var slots = Array.from(checkFormulaList.querySelectorAll('.formula-slot'));
  slots.forEach(function(slot, i) {
    if (parseInt(slot.dataset.idx) !== idx) {
      newFormulas.push(_checkFormulas[parseInt(slot.dataset.idx)]);
      newSlots.push(slot);
    }
  });
  // Rebuild from scratch (re-index)
  _checkFormulas = [];
  checkFormulaList.innerHTML = '';
  newFormulas.forEach(function(f) {
    addCheckSlot(f.role, f.input);
  });
  if (_checkTask === 'validity') updateConcSepPosition();
  checkTableWrapper.innerHTML = '';
  checkResult.innerHTML = '';
}

function onCheckInput(idx, val) {
  if (!_checkFormulas[idx]) return;
  _checkFormulas[idx].input = val;
  var statusEl = checkFormulaList.querySelector('[data-status-for="' + idx + '"]');
  var inputEl  = checkFormulaList.querySelector('input[data-idx="' + idx + '"]');
  if (!val.trim()) {
    _checkFormulas[idx].ast = null;
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'formula-status'; }
    if (inputEl)  inputEl.className = 'formula-input';
    return;
  }
  try {
    _checkFormulas[idx].ast = parse(val);
    if (statusEl) { statusEl.textContent = '✓'; statusEl.className = 'formula-status ok'; }
    if (inputEl)  inputEl.className = 'formula-input valid';
  } catch(e) {
    _checkFormulas[idx].ast = null;
    if (statusEl) { statusEl.textContent = '✗'; statusEl.className = 'formula-status err'; }
    if (inputEl)  inputEl.className = 'formula-input invalid';
  }
}

function addPremise() {
  if (_checkTask === 'validity') {
    // Insert a new premise before the conclusion
    var slots = Array.from(checkFormulaList.querySelectorAll('.formula-slot'));
    var concSlot = slots[slots.length - 1];
    var concData = _checkFormulas[parseInt(concSlot.dataset.idx)];
    // Remove conclusion, add premise, re-add conclusion
    checkFormulaList.removeChild(concSlot);
    if (checkFormulaList.contains(checkConcSep)) checkFormulaList.removeChild(checkConcSep);
    _checkFormulas = [];
    var currentSlots = Array.from(checkFormulaList.querySelectorAll('.formula-slot'));
    var existing = currentSlots.map(function(s) {
      return { role: _checkFormulas[parseInt(s.dataset.idx)] ? _checkFormulas[parseInt(s.dataset.idx)].role : 'premise',
               input: s.querySelector('.formula-input').value };
    });
    // Simpler: just call rebuildCheckSlots with one extra premise
    var inputs = currentSlots.map(function(s) { return s.querySelector('.formula-input').value; });
    inputs.push('');
    checkFormulaList.innerHTML = '';
    _checkFormulas = [];
    inputs.forEach(function(v) { addCheckSlot('premise', v); });
    addCheckSlot('conclusion', concData.input || '');
    updateConcSepPosition();
  } else {
    addCheckSlot('formula', '');
  }
  checkTableWrapper.innerHTML = '';
  checkResult.innerHTML = '';
}

// ── Truth table core ──────────────────────────────────────────
/*
  buildTruthTable(asts, letters)
  Returns { letters, cols, rows, mainColIdx }

  cols: array of { label:string, ast:node, isLetter:bool, isMain:bool }
  rows: array of { assignment:{letter:bool}, values:[bool per col] }

  Column order (textbook §3):
    [letter columns] | [subformula columns, depth-first, outermost last] | [full formula]
  When multiple formulas: letters union, then each formula gets its own col block.
  For consistency/validity we show all formulas' full columns highlighted.

  Row order: letters sorted alpha; rightmost letter is innermost (fastest).
  Rightmost letter alternates T,F,T,F... (block size 1).
  Next left: block size 2. Etc.
*/
function buildTruthTable(asts, letters) {
  // letters: sorted alphabetically; row order: letter[0] is outermost (slowest)
  var n = letters.length;
  var numRows = Math.pow(2, n);

  // Build rows with assignments
  var rows = [];
  for (var r = 0; r < numRows; r++) {
    var assignment = {};
    letters.forEach(function(letter, li) {
      // li=0 is outermost/slowest (block size 2^(n-1-0) = 2^(n-1))
      // But textbook says innermost (rightmost) alternates fastest with block=1.
      // rightmost letter = letters[n-1], block = 2^0 = 1
      // letters[n-1-k] has block 2^k
      var blockSize = Math.pow(2, n - 1 - li);
      var blockIdx  = Math.floor(r / blockSize);
      assignment[letter] = (blockIdx % 2 === 0); // even block → T, odd → F
    });
    rows.push({ assignment: assignment, values: [] });
  }

  // Build columns for each ast
  var allCols = [];
  // Letter columns (shared)
  letters.forEach(function(letter, li) {
    allCols.push({
      label: letter,
      ast: { type:'letter', name: letter.replace(/[₀-₉]/g,''), sub: letter.match(/[₀-₉]+/)?.[0] || '' },
      isLetter: true,
      isMain: false,
      isSepRight: li === letters.length - 1,  // separator after last letter
      formulaIdx: -1
    });
  });

  // For each formula: subformulas in depth-first order, then full formula
  asts.forEach(function(ast, ai) {
    var subs = getSubformulaColumns(ast);
    subs.forEach(function(col, ci) {
      col.isMain = (ci === subs.length - 1);
      col.formulaIdx = ai;
      col.isSepRight = false;
      allCols.push(col);
    });
    // Last col of each formula gets a sep (except very last)
    if (ai < asts.length - 1) {
      allCols[allCols.length - 1].isSepRight = true;
    }
  });

  // Evaluate all cells
  rows.forEach(function(row) {
    allCols.forEach(function(col) {
      row.values.push(evaluate(col.ast, row.assignment));
    });
  });

  return { letters: letters, cols: allCols, rows: rows };
}

/*
  getSubformulaColumns(ast)
  Returns ordered array of { label, ast, isLetter, isMain }
  Order: children first (post-order / leaves → root), so root is last = main connective.
  Letter-only atoms are excluded from subformula columns (they already appear in letter cols).
*/
function getSubformulaColumns(ast) {
  var cols = [];
  var seen = new Set();

  function walk(node) {
    if (!node) return;
    var label = prettyPrint(node, true);
    switch (node.type) {
      case 'letter':
        return; // skip — already in letter columns
      case 'neg':
        walk(node.arg);
        break;
      case 'and': case 'or': case 'imp':
        walk(node.left);
        walk(node.right);
        break;
    }
    if (!seen.has(label)) {
      seen.add(label);
      cols.push({ label: label, ast: node, isLetter: false, isMain: false });
    }
  }

  walk(ast);
  // Last element is the full formula → mark as main
  if (cols.length > 0) cols[cols.length - 1].isMain = true;
  return cols;
}

// ── Render truth table (view-only) ────────────────────────────
function renderTable(tableData, container, opts) {
  opts = opts || {};
  // opts.highlightRows: array of row indices to highlight
  // opts.multiFormulas: array of formula labels for header grouping
  container.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'table-wrapper';
  var tbl = document.createElement('table');
  tbl.className = 'truth-table';

  // Header
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  tableData.cols.forEach(function(col) {
    var th = document.createElement('th');
    th.textContent = col.label;
    if (col.isMain) th.classList.add('main-col');
    if (col.isSepRight) th.classList.add('sep-right');
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  tbl.appendChild(thead);

  // Body
  var tbody = document.createElement('tbody');
  tableData.rows.forEach(function(row, ri) {
    var tr = document.createElement('tr');
    if (opts.highlightRows && opts.highlightRows.indexOf(ri) !== -1) tr.classList.add('row-highlight');
    row.values.forEach(function(val, ci) {
      var td = document.createElement('td');
      var col = tableData.cols[ci];
      if (col.isMain) td.classList.add('main-col');
      if (col.isSepRight) td.classList.add('sep-right');
      var span = document.createElement('span');
      span.className = val ? 'tv-T' : 'tv-F';
      span.textContent = val ? 'T' : 'F';
      td.appendChild(span);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  container.appendChild(wrap);
}

// ── Check mode: evaluate ──────────────────────────────────────
function runCheck() {
  checkResult.innerHTML = '';
  checkTableWrapper.innerHTML = '';
  // Show New Problem button when there's content
  var hasContent = _checkFormulas.some(function(f) { return f.input.trim(); });
  document.getElementById('check-new-problem-btn').hidden = !hasContent;
  var outCard = document.getElementById('check-output-card');
  if (outCard) outCard.hidden = false;

  // Gather valid ASTs
  var entries = _checkFormulas.filter(function(f) { return f.ast !== null && f.input.trim() !== ''; });
  if (entries.length === 0) {
    checkResult.innerHTML = '<p class="hint-text">Enter at least one valid formula above.</p>';
    return;
  }

  var asts   = entries.map(function(f) { return f.ast; });
  var labels = entries.map(function(f) { return prettyPrint(f.ast, true); });

  // Collect all letters across all formulas
  var letterSet = new Set();
  asts.forEach(function(ast) {
    collectLetters(ast).forEach(function(l) { letterSet.add(l); });
  });
  var letters = Array.from(letterSet).sort();

  if (letters.length > 5) {
    checkResult.innerHTML = '<p class="parse-error">⚠ Too many sentence letters (' + letters.length + '). Maximum 5 supported.</p>';
    return;
  }

  var table = buildTruthTable(asts, letters);

  if (_checkTask === 'formula') {
    // Single formula: classify as tautology / contradiction / contingent
    var ast  = asts[0];
    var mainColIdx = table.cols.findIndex(function(c) { return c.isMain; });
    var allTrue  = table.rows.every(function(r) { return r.values[mainColIdx]; });
    var allFalse = table.rows.every(function(r) { return !r.values[mainColIdx]; });
    var classification = allTrue ? 'tautology' : allFalse ? 'contradiction' : 'contingent';

    renderTable(table, checkTableWrapper);
    renderFormulaVerdict(classification, labels[0], checkResult);

  } else if (_checkTask === 'consistency') {
    // All formulas: find a row where all are T
    var mainColIdxes = table.cols.map(function(c,i) { return c.isMain ? i : -1; }).filter(function(i){ return i>=0; });
    var witnessRows  = [];
    table.rows.forEach(function(row, ri) {
      var allTrue = mainColIdxes.every(function(ci) { return row.values[ci]; });
      if (allTrue) witnessRows.push(ri);
    });
    var consistent = witnessRows.length > 0;
    renderTable(table, checkTableWrapper, { highlightRows: consistent ? [witnessRows[0]] : [] });
    renderConsistencyVerdict(consistent, witnessRows, labels, checkResult);

  } else if (_checkTask === 'validity') {
    // Premises: all entries except last; conclusion: last
    var premAsts   = asts.slice(0, -1);
    var concAst    = asts[asts.length - 1];
    var premMainIdxes = [];
    var concMainIdx   = -1;
    var pCount = 0;
    table.cols.forEach(function(col, ci) {
      if (!col.isMain) return;
      if (col.formulaIdx < asts.length - 1) premMainIdxes.push(ci);
      else concMainIdx = ci;
    });
    // Counterexample: row where all premises T and conclusion F
    var counterRows = [];
    table.rows.forEach(function(row, ri) {
      var allPremsT = premMainIdxes.every(function(ci) { return row.values[ci]; });
      var concF     = !row.values[concMainIdx];
      if (allPremsT && concF) counterRows.push(ri);
    });
    var valid = counterRows.length === 0;
    renderTable(table, checkTableWrapper, { highlightRows: valid ? [] : [counterRows[0]] });
    renderValidityVerdict(valid, counterRows, entries, checkResult);
  }
}

function renderFormulaVerdict(classification, label, container) {
  var isGood = classification === 'tautology';
  var isBad  = classification === 'contradiction';
  var cls    = isGood ? 'success' : isBad ? 'error' : 'neutral';
  var icon   = isGood ? '✓' : isBad ? '✗' : '◦';
  var title  = classification.charAt(0).toUpperCase() + classification.slice(1);
  var detail = classification === 'tautology'     ? 'True under every assignment.' :
               classification === 'contradiction'  ? 'False under every assignment.' :
                                                     'True under some assignments, false under others.';
  container.innerHTML =
    '<div class="verdict-banner ' + cls + '">' +
      '<span class="verdict-icon">' + icon + '</span>' +
      '<div class="verdict-content">' +
        '<div class="verdict-title">' + escHtml(label) + '</div>' +
        '<div class="verdict-detail">' + detail + '</div>' +
        '<div class="classification-row">' +
          '<span class="class-chip ' + classification + '">' + title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderConsistencyVerdict(consistent, witnessRows, labels, container) {
  var cls   = consistent ? 'success' : 'error';
  var icon  = consistent ? '✓' : '✗';
  var title = consistent ? 'Consistent' : 'Inconsistent';
  var detail = consistent
    ? 'There is an assignment (highlighted) under which all formulas are true.'
    : 'There is no assignment under which all formulas are true simultaneously.';
  container.innerHTML =
    '<div class="verdict-banner ' + cls + '">' +
      '<span class="verdict-icon">' + icon + '</span>' +
      '<div class="verdict-content">' +
        '<div class="verdict-title">' + title + '</div>' +
        '<div class="verdict-detail">' + detail + '</div>' +
        '<div class="classification-row">' +
          '<span class="class-chip ' + (consistent?'consistent':'inconsistent') + '">' + title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderValidityVerdict(valid, counterRows, entries, container) {
  var premises   = entries.slice(0,-1).map(function(e){ return prettyPrint(e.ast,true); });
  var conclusion = prettyPrint(entries[entries.length-1].ast, true);
  var cls    = valid ? 'success' : 'error';
  var icon   = valid ? '✓' : '✗';
  var title  = valid ? 'Valid' : 'Invalid';
  var detail = valid
    ? 'There is no assignment making all premises true and the conclusion false.'
    : 'The highlighted row is a counterexample: all premises are true but the conclusion is false.';
  container.innerHTML =
    '<div class="verdict-banner ' + cls + '">' +
      '<span class="verdict-icon">' + icon + '</span>' +
      '<div class="verdict-content">' +
        '<div class="verdict-title">' + title + '</div>' +
        '<div class="verdict-detail">' + detail + '</div>' +
        '<div class="classification-row">' +
          '<span class="class-chip ' + (valid?'valid':'invalid') + '">' + title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ── Build mode ────────────────────────────────────────────────
function onBuildInput() {
  var val = buildInput.value.trim();
  _buildInput = val;
  checkTableWrapper && (checkTableWrapper.innerHTML = '');

  if (!val) {
    _buildAst = null; _buildTable = null;
    buildStatus.textContent = ''; buildStatus.className = 'formula-status';
    buildInput.className = 'formula-input';
    buildTableWrapper.innerHTML = '';
    buildActionsRow.hidden = true;
    buildNewProblemBtn.hidden = true;
    return;
  }
  try {
    _buildAst = parse(val);
    buildStatus.textContent = '✓';
    buildStatus.className = 'formula-status ok';
    buildInput.className = 'formula-input valid';
    buildNewProblemBtn.hidden = false;
    startBuildMode();
  } catch(e) {
    _buildAst = null; _buildTable = null;
    buildStatus.textContent = '✗';
    buildStatus.className = 'formula-status err';
    buildInput.className = 'formula-input invalid';
    buildTableWrapper.innerHTML = '<p class="parse-error" style="margin-top:var(--space-2)">⚠ ' + escHtml(e.message) + '</p>';
    buildActionsRow.hidden = true;
    buildNewProblemBtn.hidden = false;
  }
}

function startBuildMode() {
  if (!_buildAst) return;
  var card = document.getElementById('build-table-card');
  if (card) { card.hidden = false; card.style.display = ''; }
  var title = document.getElementById('build-table-title');
  if (title) title.textContent = prettyPrint(_buildAst, true);
  var letters = collectLetters(_buildAst);
  if (letters.length > 4) {
    buildTableWrapper.innerHTML = '<p class="parse-error" style="margin-top:var(--space-2)">⚠ Build mode supports up to 4 sentence letters.</p>';
    buildActionsRow.hidden = true;
    return;
  }
  _buildTable   = buildTruthTable([_buildAst], letters);
  _buildChecked = false;
  _buildCells   = [];
  buildFeedback.textContent = '';
  buildFeedback.className = 'build-feedback';
  renderBuildTable();
  buildActionsRow.hidden = false;
}

function renderBuildTable() {
  buildTableWrapper.innerHTML = '';
  _buildCells = [];
  var tableData = _buildTable;
  var wrap = document.createElement('div');
  wrap.className = 'table-wrapper';
  var tbl = document.createElement('table');
  tbl.className = 'truth-table';

  // Header
  var thead = document.createElement('thead');
  var hr = document.createElement('tr');
  tableData.cols.forEach(function(col) {
    var th = document.createElement('th');
    th.textContent = col.label;
    if (col.isMain) th.classList.add('main-col');
    if (col.isSepRight) th.classList.add('sep-right');
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  tbl.appendChild(thead);

  // Body
  var tbody = document.createElement('tbody');
  tableData.rows.forEach(function(row, ri) {
    var tr = document.createElement('tr');
    row.values.forEach(function(val, ci) {
      var td = document.createElement('td');
      var col = tableData.cols[ci];
      if (col.isMain) td.classList.add('main-col');
      if (col.isSepRight) td.classList.add('sep-right');

      if (col.isLetter) {
        // Pre-filled letter cells
        var span = document.createElement('span');
        span.className = val ? 'tv-T cell-locked' : 'tv-F cell-locked';
        span.textContent = val ? 'T' : 'F';
        td.appendChild(span);
      } else {
        // Interactive cell
        var cellIdx = _buildCells.length;
        _buildCells.push({ rowIdx: ri, colIdx: ci, answer: null, correct: val });
        var btn = document.createElement('button');
        btn.className = 'cell-btn';
        btn.textContent = '?';
        btn.dataset.cellIdx = cellIdx;
        btn.addEventListener('click', function() { toggleBuildCell(cellIdx); });
        td.appendChild(btn);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  buildTableWrapper.appendChild(wrap);
}

function toggleBuildCell(cellIdx) {
  if (_buildChecked) return; // lock after check
  var cell = _buildCells[cellIdx];
  var btn  = buildTableWrapper.querySelector('[data-cell-idx="' + cellIdx + '"]');
  if (!btn) return;
  // Cycle: null → T → F → null
  cell.answer = cell.answer === null ? 'T' : cell.answer === 'T' ? 'F' : null;
  if (cell.answer === null) {
    btn.textContent = '?'; btn.className = 'cell-btn';
  } else {
    btn.textContent = cell.answer;
    btn.className = 'cell-btn filled-' + cell.answer;
  }
  buildFeedback.textContent = '';
  buildFeedback.className = 'build-feedback';
}

function checkBuild() {
  var filled    = _buildCells.filter(function(c) { return c.answer !== null; });
  var unfilled  = _buildCells.filter(function(c) { return c.answer === null; });

  if (unfilled.length > 0) {
    buildFeedback.textContent = unfilled.length + ' cell' + (unfilled.length > 1 ? 's' : '') + ' still empty.';
    buildFeedback.className = 'build-feedback wrong';
    return;
  }

  var correct = 0;
  _buildCells.forEach(function(cell) {
    var btn = buildTableWrapper.querySelector('[data-cell-idx="' + _buildCells.indexOf(cell) + '"]');
    var right = (cell.answer === 'T') === cell.correct;
    if (right) {
      correct++;
      if (btn) { btn.classList.remove('cell-wrong'); btn.classList.add('cell-correct'); }
    } else {
      if (btn) { btn.classList.remove('cell-correct'); btn.classList.add('cell-wrong'); }
    }
  });

  var total = _buildCells.length;
  if (correct === total) {
    buildFeedback.textContent = '✓ All correct!';
    buildFeedback.className = 'build-feedback correct';
    _buildChecked = true;
  } else {
    buildFeedback.textContent = correct + ' / ' + total + ' correct. Wrong cells marked in red.';
    buildFeedback.className = 'build-feedback wrong';
    // Don't lock — let student try again after seeing errors
  }
}

function resetBuild() {
  _buildChecked = false;
  buildFeedback.textContent = '';
  buildFeedback.className = 'build-feedback';
  _buildCells.forEach(function(cell) { cell.answer = null; });
  var btns = buildTableWrapper.querySelectorAll('.cell-btn');
  btns.forEach(function(btn) {
    btn.textContent = '?';
    btn.className = 'cell-btn';
  });
}

function newProblemBuild() {
  buildInput.value = '';
  buildInput.className = 'formula-input';
  buildStatus.textContent = '';
  buildStatus.className = 'formula-status';
  _buildAst = null; _buildTable = null; _buildCells = [];
  _buildChecked = false;
  buildTableWrapper.innerHTML = '';
  buildActionsRow.hidden = true;
  buildFeedback.textContent = '';
  buildNewProblemBtn.hidden = true;
  var card = document.getElementById('build-table-card');
  if (card) { card.hidden = true; card.style.display = 'none'; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(function() { buildInput.focus(); }, 300);
}

// ── Examples ──────────────────────────────────────────────────
var _checkExamples = [
  // formula examples
  { mode:'check', task:'formula', formulas:['(p → q) ∨ (q → p)'],
    label:'(p → q) ∨ (q → p)' },
  { mode:'check', task:'formula', formulas:['¬(p → q) ∧ (q ∨ ¬p)'],
    label:'¬(p → q) ∧ (q ∨ ¬p)' },
  { mode:'check', task:'formula', formulas:['p → q'],
    label:'p → q' },
  // consistency
  { mode:'check', task:'consistency', formulas:['p → q', 'q → r', 'r → ¬p'],
    label:'p→q, q→r, r→¬p' },
  // validity
  { mode:'check', task:'validity',
    formulas:['p ∨ q', '¬(p ∧ ¬r)', 'r → q'],
    label:'p∨q, ¬(p∧¬r) ⊢ r→q' },
  { mode:'check', task:'validity',
    formulas:['p ∨ q', 'p → ¬r', '¬r ∨ p'],
    label:'p∨q, p→¬r ⊢ ¬r∨p' },
];
var _buildExamples = [
  '¬(p ∧ q)',
  '¬(q → p)',
  '¬(p ∧ q) ∨ ¬(q → p)',
  'p → q',
  '(p ∧ q) → r',
];

function loadCheckExample(ex) {
  // Switch to correct mode/task
  if (_mode !== 'check') switchMode('check');
  _checkTask = ex.task;
  checkTaskBtns.forEach(function(b) {
    b.classList.toggle('active', b.dataset.task === ex.task);
  });
  checkFormulaList.innerHTML = '';
  _checkFormulas = [];
  checkTableWrapper.innerHTML = '';
  checkResult.innerHTML = '';

  if (ex.task === 'formula') {
    checkAddBtn.hidden = true;
    checkConcSep.hidden = true;
    addCheckSlot('formula', ex.formulas[0]);
  } else if (ex.task === 'consistency') {
    checkAddBtn.hidden = false;
    checkConcSep.hidden = true;
    ex.formulas.forEach(function(f) { addCheckSlot('formula', f); });
  } else if (ex.task === 'validity') {
    checkAddBtn.hidden = false;
    ex.formulas.slice(0, -1).forEach(function(f) { addCheckSlot('premise', f); });
    addCheckSlot('conclusion', ex.formulas[ex.formulas.length - 1]);
    updateConcSepPosition();
    checkConcSep.hidden = false;
  }

  // Highlight active example chip
  document.querySelectorAll('.example-chip').forEach(function(el) {
    el.classList.toggle('active', el.dataset.exLabel === ex.label);
  });

  runCheck();
}

function loadBuildExample(formula) {
  if (_mode !== 'build') switchMode('build');
  buildInput.value = formula;
  document.querySelectorAll('.build-example-chip').forEach(function(el) {
    el.classList.toggle('active', el.dataset.formula === formula);
  });
  onBuildInput();
}

// ── Hash / permalink ──────────────────────────────────────────
function loadFromHash() {
  var hash = window.location.hash;
  if (!hash || hash.length < 3) return;
  try {
    var json = JSON.parse(atob(hash.slice(1)));
    if (json.mode === 'build' && json.f) {
      switchMode('build');
      buildInput.value = json.f;
      onBuildInput();
    } else if (json.mode === 'check' && json.formulas) {
      // handled via check examples
    }
  } catch(e) { /* ignore bad hash */ }
}

// ── Utilities ─────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Symbol insertion ────────────────────────────────────────
var _lastCheckInput = null;

function insertCheckSym(sym) {
  // Insert into the focused formula input, or the last one
  var focused = document.activeElement;
  var inp = (focused && focused.classList.contains('formula-input')) ? focused : _lastCheckInput;
  if (!inp) {
    var inputs = checkFormulaList.querySelectorAll('.formula-input');
    inp = inputs[inputs.length - 1];
  }
  if (!inp) return;
  var start = inp.selectionStart, end = inp.selectionEnd;
  inp.value = inp.value.slice(0, start) + sym + inp.value.slice(end);
  inp.setSelectionRange(start + sym.length, start + sym.length);
  inp.focus();
  // Trigger input event
  var idx = parseInt(inp.dataset.idx);
  onCheckInput(idx, inp.value);
}

document.addEventListener('focusin', function(e) {
  if (e.target && e.target.classList.contains('formula-input') && checkFormulaList.contains(e.target)) {
    _lastCheckInput = e.target;
  }
});

function insertBuildSym(sym) {
  var inp = buildInput;
  var start = inp.selectionStart, end = inp.selectionEnd;
  inp.value = inp.value.slice(0, start) + sym + inp.value.slice(end);
  inp.setSelectionRange(start + sym.length, start + sym.length);
  inp.focus();
  onBuildInput();
}

// ── Help ─────────────────────────────────────────────────────
function toggleHelp() {
  var overlay = document.getElementById('help-overlay');
  overlay.hidden = !overlay.hidden;
}

// ── New Problem (check mode) ──────────────────────────────────
function newProblemCheck() {
  checkFormulaList.innerHTML = '';
  _checkFormulas = [];
  checkTableWrapper.innerHTML = '';
  checkResult.innerHTML = '';
  // Reset task to formula
  switchTask('formula');
  document.getElementById('check-new-problem-btn').hidden = true;
  // Hide output card
  var outCard = document.getElementById('check-output-card');
  if (outCard) outCard.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(function() {
    var inp = checkFormulaList.querySelector('.formula-input');
    if (inp) inp.focus();
  }, 300);
}

// ── Dark mode ─────────────────────────────────────────────────
function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme');
  var next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-btn').textContent = next === 'dark' ? '☀' : '☾';
}
