/* ================================================================
   Formula Checker — Propositional Semantics
   app.js  (rewritten v2: model-checker parity)
   ================================================================ */

'use strict';

/* ── Theme toggle ──────────────────────────────────────────────── */
(function () {
  var btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var html = document.documentElement;
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
  });
})();

function toggleHelp(e) {
  if (e) e.preventDefault();
  var panel = document.getElementById('help-panel');
  if (panel.hasAttribute('hidden')) {
    panel.removeAttribute('hidden');
  } else {
    panel.setAttribute('hidden', '');
  }
}

/* ── Live ASCII replacement ─────────────────────────── */
var PROP_ASCII_MAP = [
  [/<->/g,  '↔'],
  [/->/g,   '→'],
  [/\/\\/g, '∧'],
  [/\\\/g, '∨'],
  [/~/g,   '¬'],
  [/&/g,   '∧'],
  [/\|/g,  '∨'],
];
function applyPropAscii(val) {
  var s = val;
  for (var _i = 0; _i < PROP_ASCII_MAP.length; _i++) s = s.replace(PROP_ASCII_MAP[_i][0], PROP_ASCII_MAP[_i][1]);
  return s;
}
function liveReplaceInput(el) {
  var orig = el.value, pos = el.selectionStart;
  var next = applyPropAscii(orig);
  if (next !== orig) {
    el.value = next;
    var newPos = pos + (next.length - orig.length);
    el.setSelectionRange(newPos, newPos);
  }
}
document.addEventListener('keyup', function (e) {
  if (e.target.classList && e.target.classList.contains('formula-input')) {
    liveReplaceInput(e.target);
  }
});
(function () {
  var bi = document.getElementById('build-input');
  if (bi) bi.addEventListener('keyup', function () { liveReplaceInput(bi); });
})();

/* ── Shared parser helpers ─────────────────────────────────────── */
// parser.js exposes: parseFormula(str) → AST or throws
// evaluator.js exposes: evaluate(ast, assignment) → bool

/* ── Symbol bar insertion ──────────────────────────────────────── */
// For Formulas card: inserts into whichever .formula-input has focus
var _lastFormulaInput = null;
document.addEventListener('focusin', function (e) {
  if (e.target.classList.contains('formula-input') && e.target.id !== 'build-input') {
    _lastFormulaInput = e.target;
  }
});

function insertSym(sym) {
  var el = _lastFormulaInput;
  if (!el) {
    // Fall back to first slot
    var first = document.querySelector('#formula-list .formula-input');
    if (!first) return;
    el = first;
  }
  var s = el.selectionStart, e2 = el.selectionEnd;
  el.value = el.value.slice(0, s) + sym + el.value.slice(e2);
  el.selectionStart = el.selectionEnd = s + sym.length;
  el.focus();
  onSlotInput(el);
}

function insertSymBuild(sym) {
  var el = document.getElementById('build-input');
  var s = el.selectionStart, e2 = el.selectionEnd;
  el.value = el.value.slice(0, s) + sym + el.value.slice(e2);
  el.selectionStart = el.selectionEnd = s + sym.length;
  el.focus();
  onBuildInput();
}

/* ================================================================
   FORMULAS CARD
   ================================================================ */
var _formulaSlots = []; // [{id, ast, err}]
var _slotCounter = 0;

function addFormulaSlot(initialValue) {
  var id = 'fslot-' + (++_slotCounter);
  var idx = _formulaSlots.length;
  _formulaSlots.push({ id: id, ast: null, err: null });

  var list = document.getElementById('formula-list');
  var div = document.createElement('div');
  div.className = 'formula-slot';
  div.id = id;

  var label = String.fromCharCode(0x03C6); // φ
  div.innerHTML = [
    '<span class="slot-label">' + (idx + 1) + '</span>',
    '<div class="formula-input-wrap">',
    '  <input class="formula-input" type="text" autocomplete="off" spellcheck="false"',
    '    placeholder="e.g. p → q"',
    '    oninput="onSlotInput(this)" />',
    '  <span class="parse-tick" hidden>✓</span>',
    '</div>',
    '<button class="slot-remove btn-icon" onclick="removeSlot(\'' + id + '\')" title="Remove">',
    '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    '</button>',
  ].join('');
  list.appendChild(div);

  var inp = div.querySelector('.formula-input');
  if (initialValue) {
    inp.value = initialValue;
    onSlotInput(inp);
    inp.focus();
  }
}

function removeSlot(id) {
  _formulaSlots = _formulaSlots.filter(function (s) { return s.id !== id; });
  var el = document.getElementById(id);
  if (el) el.remove();
  // Renumber labels
  var slots = document.querySelectorAll('#formula-list .formula-slot');
  slots.forEach(function (sl, i) {
    var lbl = sl.querySelector('.slot-label');
    if (lbl) lbl.textContent = i + 1;
  });
}

function onSlotInput(inp) {
  var slotDiv = inp.closest('.formula-slot');
  var id = slotDiv.id;
  var slot = _formulaSlots.find(function (s) { return s.id === id; });
  if (!slot) return;

  var raw = inp.value.trim();
  var tick = slotDiv.querySelector('.parse-tick');

  if (!raw) {
    inp.classList.remove('valid', 'invalid');
    if (tick) tick.style.display = 'none';
    slot.ast = null; slot.err = null;
    return;
  }
  try {
    slot.ast = parseFormula(raw);
    slot.err = null;
    inp.classList.add('valid'); inp.classList.remove('invalid');
    if (tick) tick.style.display = '';
  } catch (ex) {
    slot.ast = null; slot.err = ex.message;
    inp.classList.add('invalid'); inp.classList.remove('valid');
    if (tick) tick.style.display = 'none';
  }
}

function setFormulaExample(val) {
  clearFormulaSlots();
  addFormulaSlot(val);
}

function setFormulaExamples(vals) {
  clearFormulaSlots();
  vals.forEach(function (v) { addFormulaSlot(v); });
}

function clearFormulaSlots() {
  _formulaSlots = [];
  _slotCounter = 0;
  document.getElementById('formula-list').innerHTML = '';
}

// Start with one empty slot
addFormulaSlot();

/* ================================================================
   TRUTH TABLE CORE
   ================================================================ */

// Collect all sentence letters from one or more ASTs (sorted alphabetically)
function collectLetters(asts) {
  var set = {};
  function walk(node) {
    if (!node) return;
    if (node.type === 'letter') { set[node.name + (node.sub || '')] = true; return; }
    if (node.left)  walk(node.left);
    if (node.right) walk(node.right);
    if (node.arg) walk(node.arg);
  }
  asts.forEach(walk);
  return Object.keys(set).sort();
}

// Generate all 2^n assignments in textbook order:
//   letters[0] alternates slowest (block = 2^(n-1))
//   letters[n-1] alternates fastest (block = 1)
function generateAssignments(letters) {
  var n = letters.length;
  var total = Math.pow(2, n);
  var rows = [];
  for (var i = 0; i < total; i++) {
    var asgn = {};
    letters.forEach(function (ltr, k) {
      var block = Math.pow(2, n - 1 - k);
      asgn[ltr] = (Math.floor(i / block) % 2 === 0);
    });
    rows.push(asgn);
  }
  return rows;
}

// Post-order subformula walk — returns columns [{label, ast, isMain}]
// Leaves (atoms) are skipped (already in letter columns).
// Deduplicates by label within one formula block.
function getSubformulaCols(ast) {
  var seen = {};
  var cols = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'letter') return;
    if (node.left)  walk(node.left);
    if (node.right) walk(node.right);
    if (node.arg) walk(node.arg);
    var lbl = astToLabel(node);
    if (!seen[lbl]) {
      seen[lbl] = true;
      cols.push({ label: lbl, ast: node, isMain: false });
    }
  }
  walk(ast);
  if (cols.length > 0) cols[cols.length - 1].isMain = true;
  else cols.push({ label: astToLabel(ast), ast: ast, isMain: true }); // atom-only formula
  return cols;
}

// Render an AST back to a display string (unicode connectives, minimal parens)
function astToLabel(node) {
  if (!node) return '';
  if (node.type === 'letter')   return node.name + (node.sub || '');
  if (node.type === 'neg')    return '¬' + parenIf(node.arg, 'neg');
  if (node.type === 'and')    return parenIf(node.left, 'and_l') + ' ∧ ' + parenIf(node.right, 'and_r');
  if (node.type === 'or')     return parenIf(node.left, 'or_l')  + ' ∨ ' + parenIf(node.right, 'or_r');
  if (node.type === 'imp')    return parenIf(node.left, 'imp_l') + ' → ' + parenIf(node.right, 'imp_r');
  return '?';
}
function parenIf(node, pos) {
  var lbl = astToLabel(node);
  // Add parens when child is lower-precedence than parent context
  var needParen = false;
  if (pos === 'neg' && node.type !== 'letter') needParen = true;
  if ((pos === 'and_l' || pos === 'and_r') && (node.type === 'or' || node.type === 'imp')) needParen = true;
  if ((pos === 'or_l'  || pos === 'or_r')  && node.type === 'imp') needParen = true;
  if (pos === 'imp_l'  && node.type === 'imp') needParen = true;
  return needParen ? '(' + lbl + ')' : lbl;
}

/* Build full column spec for a single formula:
   returns { letters (shared), formulaCols: [{label, ast, isMain}] }
   letter cols are rendered separately (shared across all formulas).
*/
function buildColumns(ast, letters) {
  return getSubformulaCols(ast);
}

/* Evaluate every cell:
   returns rows array where each row has .assignment and .values per col
*/
function computeTable(ast, letters) {
  var assignments = generateAssignments(letters);
  var formulaCols = buildColumns(ast, letters);
  var rows = assignments.map(function (asgn) {
    var letterVals = letters.map(function (l) { return asgn[l]; });
    var colVals = formulaCols.map(function (col) {
      return evaluate(col.ast, asgn);
    });
    return { assignment: asgn, letterVals: letterVals, colVals: colVals };
  });
  return { letters: letters, formulaCols: formulaCols, rows: rows };
}

/* ── HTML rendering helpers ──────────────────────────────────────*/
function tvSpan(bool) {
  var cls = bool ? 'tv-T' : 'tv-F';
  return '<span class="' + cls + '">' + (bool ? 'T' : 'F') + '</span>';
}

/* Render a read-only truth table for one formula.
   highlightFn(rowIdx, row) → null | 'consistent' | 'counterex'
*/
function renderTable(table, highlightFn) {
  var letters = table.letters;
  var formulaCols = table.formulaCols;

  var html = '<div class="tt-scroll"><table class="truth-table">';

  // THEAD
  html += '<thead><tr>';
  letters.forEach(function (l, i) {
    var sep = (i === letters.length - 1) ? ' col-sep' : '';
    html += '<th class="' + sep + '">' + l + '</th>';
  });
  formulaCols.forEach(function (col) {
    var cls = col.isMain ? 'col-main' : '';
    html += '<th class="' + cls + '">' + col.label + '</th>';
  });
  html += '</tr></thead>';

  // TBODY
  html += '<tbody>';
  table.rows.forEach(function (row, ri) {
    var hl = highlightFn ? highlightFn(ri, row) : null;
    var rowCls = hl ? ' class="row-' + hl + '"' : '';
    html += '<tr' + rowCls + '>';
    letters.forEach(function (l, i) {
      var sep = (i === letters.length - 1) ? ' col-sep' : '';
      html += '<td class="' + sep + '">' + tvSpan(row.assignment[l]) + '</td>';
    });
    row.colVals.forEach(function (v, ci) {
      var col = formulaCols[ci];
      var cls = col.isMain ? 'col-main' : '';
      html += '<td class="' + cls + '">' + tvSpan(v) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

/* ================================================================
   BUILD CARD
   ================================================================ */
var _buildAST = null;
var _buildTable = null;
var _buildCells = []; // {rowIdx, colIdx, el, answer}

function onBuildInput() {
  var inp = document.getElementById('build-input');
  var status = document.getElementById('build-status');
  var tick = document.getElementById('build-tick');
  var raw = inp.value.trim();

  document.getElementById('build-table-wrap').style.display = 'none';
  document.getElementById('build-btn-row').style.display = 'none';
  document.getElementById('build-verdict').style.display = 'none';
  _buildAST = null; _buildTable = null; _buildCells = [];

  if (!raw) {
    inp.classList.remove('valid', 'invalid');
    tick.style.display = 'none';
    status.innerHTML = 'Type a formula above, then fill in the table that appears below.';
    status.className = 'parse-status';
    return;
  }
  try {
    _buildAST = parseFormula(raw);
    inp.classList.add('valid'); inp.classList.remove('invalid');
    tick.style.display = '';
    status.innerHTML = astToLabel(_buildAST) + ' &nbsp;—&nbsp; fill in every cell (T / F). Sentence-letter columns are pre-filled.';
    status.className = 'parse-status ok';
    generateBuildTable();
  } catch (ex) {
    _buildAST = null;
    inp.classList.add('invalid'); inp.classList.remove('valid');
    tick.style.display = 'none';
    status.textContent = ex.message; status.className = 'parse-status err';
  }
}

function setBuildExample(val) {
  var inp = document.getElementById('build-input');
  inp.value = val;
  onBuildInput();
}

function generateBuildTable() {
  if (!_buildAST) return;

  var letters = collectLetters([_buildAST]);
  _buildTable = computeTable(_buildAST, letters);
  _buildCells = [];

  var formulaCols = _buildTable.formulaCols;
  var rows = _buildTable.rows;

  // Build HTML — letter cols pre-filled, formula cols as cell-btns
  var html = '<div class="tt-scroll"><table class="truth-table">';

  // thead
  html += '<thead><tr>';
  letters.forEach(function (l, i) {
    var sep = (i === letters.length - 1) ? ' col-sep' : '';
    html += '<th class="' + sep + '">' + l + '</th>';
  });
  formulaCols.forEach(function (col) {
    var cls = col.isMain ? 'col-main' : '';
    html += '<th class="' + cls + '">' + col.label + '</th>';
  });
  html += '</tr></thead>';

  // tbody
  html += '<tbody>';
  rows.forEach(function (row, ri) {
    html += '<tr>';
    letters.forEach(function (l, i) {
      var sep = (i === letters.length - 1) ? ' col-sep' : '';
      html += '<td class="' + sep + '">' + tvSpan(row.assignment[l]) + '</td>';
    });
    formulaCols.forEach(function (col, ci) {
      var cls = col.isMain ? 'col-main' : '';
      var cellId = 'bc-' + ri + '-' + ci;
      _buildCells.push({ rowIdx: ri, colIdx: ci, id: cellId, answer: null });
      html += '<td class="' + cls + '"><button class="cell-btn" id="' + cellId + '"'
            + ' data-val="" onclick="cycleCellBuild(\'' + cellId + '\')">?</button></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  var wrap = document.getElementById('build-table-wrap');
  wrap.innerHTML = html;
  wrap.style.display = '';

  document.getElementById('build-btn-row').style.display = '';
  document.getElementById('build-verdict').style.display = 'none';
}

function cycleCellBuild(cellId) {
  var cell = _buildCells.find(function (c) { return c.id === cellId; });
  if (!cell) return;
  var el = document.getElementById(cellId);
  if (!el || el.classList.contains('correct') || el.classList.contains('wrong')) return;

  var next = { '': 'T', 'T': 'F', 'F': '' }[cell.answer || ''];
  cell.answer = next || null;
  el.dataset.val = next || '';
  el.textContent = next || '?';
  if (next) {
    el.classList.add('filled');
    el.classList.toggle('tv-T', next === 'T');
    el.classList.toggle('tv-F', next === 'F');
  } else {
    el.classList.remove('filled', 'tv-T', 'tv-F');
  }
}

function checkBuild() {
  if (!_buildTable) return;
  var rows = _buildTable.rows;
  var correct = 0;
  _buildCells.forEach(function (cell) {
    var el = document.getElementById(cell.id);
    if (!el) return;
    var expected = rows[cell.rowIdx].colVals[cell.colIdx] ? 'T' : 'F';
    var got = cell.answer;
    if (got === expected) {
      el.classList.add('correct'); el.classList.remove('wrong');
      correct++;
    } else {
      el.classList.add('wrong'); el.classList.remove('correct');
      if (!got) { el.textContent = '?'; }
    }
  });

  var total = _buildCells.length;
  var verd = document.getElementById('build-verdict');
  if (correct === total) {
    verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span>All <strong>' + total + '</strong> cells correct.</span></div>';
  } else {
    verd.innerHTML = '<div class="verdict verdict-warn"><span class="verdict-icon">✗</span>'
      + '<span><strong>' + (total - correct) + '</strong> cell' + (total - correct !== 1 ? 's' : '') + ' incorrect — wrong cells marked in red.</span></div>';
  }
  verd.style.display = '';
}

function resetBuild() {
  _buildCells.forEach(function (cell) {
    var el = document.getElementById(cell.id);
    if (!el) return;
    cell.answer = null;
    el.dataset.val = '';
    el.textContent = '?';
    el.classList.remove('correct', 'wrong', 'filled', 'tv-T', 'tv-F');
    el.style.pointerEvents = '';
  });
  document.getElementById('build-verdict').style.display = 'none';
}

/* ================================================================
   CHECK CARD (consistency of Formulas card)
   ================================================================ */
function runCheck() {
  var validSlots = _formulaSlots.filter(function (s) { return s.ast !== null; });
  var wrap = document.getElementById('check-table-wrap');
  var verd = document.getElementById('check-verdict');
  wrap.style.display = 'none';
  verd.style.display = 'none';

  if (validSlots.length === 0) {
    verd.innerHTML = '<div class="verdict verdict-warn"><span class="verdict-icon">⚠</span>'
      + '<span>Enter at least one valid formula in the <em>Formulas</em> card first.</span></div>';
    verd.style.display = '';
    return;
  }

  var asts = validSlots.map(function (s) { return s.ast; });
  // Check for parse errors in any slot
  var errSlot = _formulaSlots.find(function (s) {
    var inp = document.querySelector('#' + s.id + ' .formula-input');
    return inp && inp.value.trim() && s.ast === null;
  });
  if (errSlot) {
    verd.innerHTML = '<div class="verdict verdict-warn"><span class="verdict-icon">⚠</span>'
      + '<span>Fix the parse error in the <em>Formulas</em> card before checking.</span></div>';
    verd.style.display = '';
    return;
  }

  var letters = collectLetters(asts);
  var assignments = generateAssignments(letters);

  // For each formula, compute its full column spec
  var formulaBlocks = asts.map(function (ast) {
    return { ast: ast, cols: buildColumns(ast, letters), label: astToLabel(ast) };
  });

  // Find consistent rows: rows where every formula's main connective is T
  var consistentRows = {};
  assignments.forEach(function (asgn, ri) {
    var allTrue = formulaBlocks.every(function (fb) {
      // Main connective is last col
      var mainAst = fb.cols[fb.cols.length - 1].ast;
      return evaluate(mainAst, asgn);
    });
    if (allTrue) consistentRows[ri] = true;
  });
  var isConsistent = Object.keys(consistentRows).length > 0;

  // Build combined table HTML
  var html = '<div class="tt-scroll"><table class="truth-table"><thead><tr>';
  // Letter columns
  letters.forEach(function (l, i) {
    var sep = (i === letters.length - 1 && formulaBlocks.length > 0) ? ' col-sep' : '';
    html += '<th class="' + sep + '">' + l + '</th>';
  });
  // Formula blocks
  formulaBlocks.forEach(function (fb, bi) {
    fb.cols.forEach(function (col, ci) {
      var cls = col.isMain ? 'col-main' : '';
      html += '<th class="' + cls + '">' + col.label + '</th>';
    });
    // Separator between formula blocks (not after last)
    if (bi < formulaBlocks.length - 1) {
      // The main col already has right border; extra separator via the last col of this block
    }
  });
  html += '</tr></thead><tbody>';

  assignments.forEach(function (asgn, ri) {
    var hl = consistentRows[ri] ? ' class="row-consistent"' : '';
    html += '<tr' + hl + '>';
    letters.forEach(function (l, i) {
      var sep = (i === letters.length - 1 && formulaBlocks.length > 0) ? ' col-sep' : '';
      html += '<td class="' + sep + '">' + tvSpan(asgn[l]) + '</td>';
    });
    formulaBlocks.forEach(function (fb, bi) {
      fb.cols.forEach(function (col, ci) {
        var cls = col.isMain ? 'col-main' : '';
        html += '<td class="' + cls + '">' + tvSpan(evaluate(col.ast, asgn)) + '</td>';
      });
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  wrap.innerHTML = html;
  wrap.style.display = '';

  // Verdict
  var numConsistent = Object.keys(consistentRows).length;
  if (isConsistent) {
    var rowWord = numConsistent === 1 ? 'row' : 'rows';
    verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span><strong>Consistent</strong> — ' + numConsistent + ' ' + rowWord
      + ' (highlighted) make' + (numConsistent === 1 ? 's' : '') + ' every formula true simultaneously.</span></div>';
  } else {
    verd.innerHTML = '<div class="verdict verdict-fail"><span class="verdict-icon">✗</span>'
      + '<span><strong>Inconsistent</strong> — no row makes every formula true simultaneously.</span></div>';
  }
  verd.style.display = '';
}
