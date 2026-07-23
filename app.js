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
  ['<->','\u2194'],
  ['->','\u2192'],
  ['/\\','\u2227'],
  ['\\/','\u2228'],
  ['~','\u00ac'],
  ['&','\u2227'],
  ['|','\u2228'],
];
function applyPropAscii(val) {
  var s = val;
  for (var _i = 0; _i < PROP_ASCII_MAP.length; _i++) s = s.split(PROP_ASCII_MAP[_i][0]).join(PROP_ASCII_MAP[_i][1]);
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

// Check whether a raw input string is an official (or unofficial-but-accepted) formula.
// Official formulas are: sentence letters, ¬φ where φ is official, or (φ ○ ψ) with
// matching outer parens. Unofficial forms like 'p ∧ q → r' (no outer parens on a
// binary connective) are rejected.
function isOfficialFormula(raw, ast) {
  // Sentence letter or negation: always ok
  if (ast.type === 'letter') return true;
  if (ast.type === 'neg')    return true;
  // Binary connective: input must be wrapped in matching outer parens
  var s = raw.trim();
  if (s[0] !== '(') return false;
  // Walk forward matching parens to confirm the final ')' closes the first '('
  var depth = 0;
  for (var i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0) return i === s.length - 1; }
  }
  return false;
}

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
    var ast = parseFormula(raw);
    if (!isOfficialFormula(raw, ast)) {
      throw new ParseError('Not an official formula — binary connectives must be enclosed in parentheses, e.g. (p ∧ q).');
    }
    slot.ast = ast;
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
    var ast = parseFormula(raw);
    if (!isOfficialFormula(raw, ast)) {
      throw new ParseError('Not an official formula — binary connectives must be enclosed in parentheses, e.g. (p ∧ q).');
    }
    _buildAST = ast;
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

/* ── URL hash encode / decode ──────────────────────────────────────── */
// Format: #v1:<base64(JSON)>
// JSON shape: { formulas?: string[], build?: string }

function _ttEncode(obj) {
  try { return '#v1:' + btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  catch (e) { return ''; }
}
function _ttDecode(hash) {
  try {
    if (!hash || !hash.startsWith('#v1:')) return null;
    return JSON.parse(decodeURIComponent(escape(atob(hash.slice(4)))));
  } catch (e) { return null; }
}

function pushHash() {
  var formulas = [];
  document.querySelectorAll('.formula-slot .formula-input').forEach(function (inp) {
    var v = inp.value.trim();
    if (v) formulas.push(v);
  });
  var buildInp = document.getElementById('build-input');
  var build = buildInp ? buildInp.value.trim() : '';
  var obj = {};
  if (formulas.length) obj.formulas = formulas;
  if (build) obj.build = build;
  var h = Object.keys(obj).length ? _ttEncode(obj) : '';
  history.replaceState(null, '', h || window.location.pathname);
}

function loadHash() {
  var state = _ttDecode(window.location.hash);
  if (!state) return;

  // Restore Formulas card
  if (state.formulas && state.formulas.length) {
    // Clear existing slots and rebuild
    var list = document.getElementById('formula-list');
    // Remove all existing slots
    _formulaSlots = [];
    list.innerHTML = '';
    state.formulas.forEach(function (f) {
      addFormulaSlot();
      var slots = list.querySelectorAll('.formula-slot');
      var lastSlot = slots[slots.length - 1];
      var inp = lastSlot.querySelector('.formula-input');
      inp.value = f;
      onSlotInput(inp);
    });
  }

  // Restore Build card
  if (state.build) {
    var bi = document.getElementById('build-input');
    if (bi) {
      bi.value = state.build;
      onBuildInput();
    }
  }
}

// Wire pushHash into every state-changing action
(function () {
  // Patch onSlotInput to push hash after updating state
  var _origSlotInput = onSlotInput;
  onSlotInput = function (inp) { _origSlotInput(inp); pushHash(); };

  // Patch onBuildInput
  var _origBuildInput = onBuildInput;
  onBuildInput = function () {
    _origBuildInput();
    pushHash();
    // If solved mode is active, auto-fill after table renders
    var solved = new URLSearchParams(window.location.search).get('solved') === '1';
    if (solved) setTimeout(solveAll, 0);
  };

  // Load state — runs after all globals are ready (script is deferred or at end of body)
  // Use setTimeout(0) to ensure the initial addFormulaSlot() DOM is rendered first
  setTimeout(loadHash, 0);
  setTimeout(applyCardMode, 100);  // after loadHash + onBuildInput have run
})();

// ── Card mode (?card=table) ───────────────────────────────────────────────────
// ?card=table → show Build table only: hide Formulas, Check, header, help,
//               build-input row, examples, and buttons; formula comes from hash
// Auto-fill all build cells with correct answers (used by ?card=table&solved=1)
function solveAll() {
  // Retry until _buildTable and DOM cells are ready
  if (!_buildTable || !_buildCells.length) {
    setTimeout(solveAll, 50);
    return;
  }
  var firstEl = document.getElementById(_buildCells[0].id);
  if (!firstEl) { setTimeout(solveAll, 50); return; }

  var rows = _buildTable.rows;
  _buildCells.forEach(function (cell) {
    var el = document.getElementById(cell.id);
    if (!el) return;
    var val = rows[cell.rowIdx].colVals[cell.colIdx] ? 'T' : 'F';
    cell.answer = val;
    el.dataset.val = val;
    el.textContent = val;
    el.classList.add('filled', 'tv-' + val, 'correct');
    el.classList.remove('wrong');
    el.style.pointerEvents = 'none';  // read-only
    el.onclick = null;  // disable cycling
  });
  var verd = document.getElementById('build-verdict');
  if (verd) verd.style.display = 'none';
  var btnRow = document.getElementById('build-btn-row');
  if (btnRow) btnRow.hidden = true;
}

function applyCardMode() {
  var cp     = new URLSearchParams(window.location.search).get('card');
  var solved = new URLSearchParams(window.location.search).get('solved') === '1';
  if (!cp && !solved) return;

  // Always hide header, help, copy/new buttons
  var header = document.querySelector('.app-header');
  if (header) header.hidden = true;
  var help = document.getElementById('help-panel');
  if (help) help.hidden = true;
  var copyBtn = document.getElementById('copy-link-btn');
  if (copyBtn) copyBtn.hidden = true;
  var newBtn = document.getElementById('new-problem-btn');
  if (newBtn) newBtn.hidden = true;

  if (cp === 'table') {
    // Hide Formulas and Check cards entirely
    var fSec = document.getElementById('formula-section');
    if (fSec) fSec.hidden = true;
    var cSec = document.getElementById('check-section');
    if (cSec) cSec.hidden = true;
    // Hide the Build card's own input row and examples (formula comes from hash)
    var buildInputWrap = document.querySelector('#build-section .formula-input-wrap');
    if (buildInputWrap) buildInputWrap.hidden = true;
    var buildStatus = document.getElementById('build-status');
    if (buildStatus) buildStatus.hidden = true;
    var buildExamples = document.querySelector('#build-section .formula-examples');
    if (buildExamples) buildExamples.hidden = true;
    // Auto-fill if ?solved=1 — use retry loop in case table isn't ready yet
    if (solved) setTimeout(solveAll, 0);
  }
}

/* ================================================================
   CHECK MODES: tautology | equivalence | validity
   Activated via ?mode=tautology|equivalence|validity in the URL.
   ================================================================ */

var _checkMode = null; // null | 'tautology' | 'equivalence' | 'validity'

function applyCheckMode() {
  var sp = new URLSearchParams(window.location.search);
  var mode = sp.get('mode');
  if (!mode) return;
  _checkMode = mode;

  // Always hide header, help in embedded mode
  var header = document.querySelector('.app-header');
  if (header) header.hidden = true;
  var help = document.getElementById('help-panel');
  if (help) help.hidden = true;

  // Hide the Formulas card (formulas come from hash, already loaded into slots)
  var fSec = document.getElementById('formula-section');
  if (fSec) fSec.hidden = true;

  // Hide the Build card's own input row — formula comes from hash
  var buildInputWrap = document.querySelector('#build-section .formula-input-wrap');
  if (buildInputWrap) buildInputWrap.hidden = true;
  var buildStatus = document.getElementById('build-status');
  if (buildStatus) buildStatus.hidden = true;
  var buildExamples = document.querySelector('#build-section .formula-examples');
  if (buildExamples) buildExamples.hidden = true;

  // Generate combined build table once formulas are in slots
  // (loadHash has already run at 0ms; slots are populated)
  setTimeout(generateCombinedBuildTable, 10);

  // Update Check card hint and button label
  var hint = document.querySelector('#check-section .card-hint');
  var btn  = document.getElementById('check-run-btn');

  if (mode === 'tautology') {
    if (hint) hint.innerHTML =
      'Populate the truth table, then click <em>Evaluate</em> to check whether the formula is a <strong>tautology</strong>. ' +
      'If it is not, a counterexample row will be highlighted.';
    if (btn) btn.textContent = 'Evaluate';
  } else if (mode === 'equivalence') {
    if (hint) hint.innerHTML =
      'Populate the truth table, then click <em>Evaluate</em> to check whether the two formulas are <strong>logically equivalent</strong>. ' +
      'If they are not, a row where they differ will be highlighted.';
    if (btn) btn.textContent = 'Evaluate';
  } else if (mode === 'validity') {
    if (hint) hint.innerHTML =
      'Populate the truth table, then click <em>Evaluate</em> to check whether the argument is <strong>valid</strong>. ' +
      'Premises are shown first; the conclusion is the last formula. ' +
      'If the argument is invalid, a counterexample row (premises all true, conclusion false) will be highlighted.';
    if (btn) btn.textContent = 'Evaluate';
  }

  // Override runCheck to dispatch to the right mode handler
  (function () {
    var origRunCheck = runCheck;
    window.runCheck = function () {
      if (_checkMode === 'tautology')  return runTautologyCheck();
      if (_checkMode === 'equivalence') return runEquivalenceCheck();
      if (_checkMode === 'validity')   return runValidityCheck();
      return origRunCheck();
    };
  })();
}

/* ── shared helpers for mode checks ──────────────────────── */
function _modeSetup() {
  var validSlots = _formulaSlots.filter(function (s) { return s.ast !== null; });
  var wrap  = document.getElementById('check-table-wrap');
  var verd  = document.getElementById('check-verdict');
  wrap.style.display = 'none';
  verd.style.display = 'none';
  return { validSlots: validSlots, wrap: wrap, verd: verd };
}

function _modeWarn(verd, msg) {
  verd.innerHTML = '<div class="verdict verdict-warn"><span class="verdict-icon">⚠</span><span>' + msg + '</span></div>';
  verd.style.display = '';
}

function _renderModeTable(letters, formulaBlocks, assignments, highlightFn) {
  var html = '<div class="tt-scroll"><table class="truth-table"><thead><tr>';
  letters.forEach(function (l, i) {
    var sep = (i === letters.length - 1) ? ' col-sep' : '';
    html += '<th class="' + sep + '">' + l + '</th>';
  });
  formulaBlocks.forEach(function (fb, bi) {
    fb.cols.forEach(function (col) {
      var cls = col.isMain ? 'col-main' : '';
      if (bi < formulaBlocks.length - 1 && col.isMain) cls += ' col-sep';
      html += '<th class="' + cls.trim() + '">' + col.label + '</th>';
    });
  });
  html += '</tr></thead><tbody>';
  assignments.forEach(function (asgn, ri) {
    var hl = highlightFn(ri, asgn) || '';
    html += '<tr' + (hl ? ' class="' + hl + '"' : '') + '>';
    letters.forEach(function (l, i) {
      var sep = (i === letters.length - 1) ? ' col-sep' : '';
      html += '<td class="' + sep + '">' + tvSpan(asgn[l]) + '</td>';
    });
    formulaBlocks.forEach(function (fb, bi) {
      fb.cols.forEach(function (col) {
        var cls = col.isMain ? 'col-main' : '';
        if (bi < formulaBlocks.length - 1 && col.isMain) cls += ' col-sep';
        html += '<td class="' + cls.trim() + '">' + tvSpan(evaluate(col.ast, asgn)) + '</td>';
      });
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

/* ── Tautology check ─────────────────────────────────────── */
function runTautologyCheck() {
  var d = _modeSetup();
  if (d.validSlots.length === 0) { _modeWarn(d.verd, 'No formula loaded.'); return; }
  if (d.validSlots.length > 1)   { _modeWarn(d.verd, 'Tautology check expects exactly one formula.'); return; }

  var ast     = d.validSlots[0].ast;
  var letters = collectLetters([ast]);
  var assignments = generateAssignments(letters);
  var fb = { ast: ast, cols: buildColumns(ast, letters), label: astToLabel(ast) };

  // Find counterexample rows (main connective = F)
  var counterRows = {};
  assignments.forEach(function (asgn, ri) {
    var mainAst = fb.cols[fb.cols.length - 1].ast;
    if (!evaluate(mainAst, asgn)) counterRows[ri] = true;
  });

  d.wrap.innerHTML = _renderModeTable(letters, [fb], assignments, function (ri) {
    return counterRows[ri] ? 'row-counterex' : null;
  });
  d.wrap.style.display = '';

  if (Object.keys(counterRows).length === 0) {
    d.verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span><strong>Tautology</strong> — the formula is true on every row.</span></div>';
  } else {
    d.verd.innerHTML = '<div class="verdict verdict-fail"><span class="verdict-icon">✗</span>'
      + '<span><strong>Not a tautology</strong> — highlighted row(s) are counterexamples where the formula is false.</span></div>';
  }
  d.verd.style.display = '';
}

/* ── Equivalence check ───────────────────────────────────── */
function runEquivalenceCheck() {
  var d = _modeSetup();
  if (d.validSlots.length < 2) { _modeWarn(d.verd, 'Equivalence check requires exactly two formulas.'); return; }
  if (d.validSlots.length > 2) { _modeWarn(d.verd, 'Equivalence check expects exactly two formulas.'); return; }

  var asts    = d.validSlots.map(function (s) { return s.ast; });
  var letters = collectLetters(asts);
  var assignments = generateAssignments(letters);
  var fbs = asts.map(function (ast) {
    return { ast: ast, cols: buildColumns(ast, letters), label: astToLabel(ast) };
  });

  // Counterexample: rows where main connectives differ
  var counterRows = {};
  assignments.forEach(function (asgn, ri) {
    var vals = fbs.map(function (fb) {
      return evaluate(fb.cols[fb.cols.length - 1].ast, asgn);
    });
    if (vals[0] !== vals[1]) counterRows[ri] = true;
  });

  d.wrap.innerHTML = _renderModeTable(letters, fbs, assignments, function (ri) {
    return counterRows[ri] ? 'row-counterex' : null;
  });
  d.wrap.style.display = '';

  if (Object.keys(counterRows).length === 0) {
    d.verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span><strong>Equivalent</strong> — the formulas have the same truth value on every row.</span></div>';
  } else {
    d.verd.innerHTML = '<div class="verdict verdict-fail"><span class="verdict-icon">✗</span>'
      + '<span><strong>Not equivalent</strong> — highlighted row(s) show where the truth values differ.</span></div>';
  }
  d.verd.style.display = '';
}

/* ── Validity check ──────────────────────────────────────── */
function runValidityCheck() {
  var d = _modeSetup();
  if (d.validSlots.length < 2) { _modeWarn(d.verd, 'Validity check requires at least one premise and a conclusion (two or more formulas).'); return; }

  var asts      = d.validSlots.map(function (s) { return s.ast; });
  var premiseAsts   = asts.slice(0, -1);
  var conclusionAst = asts[asts.length - 1];
  var letters   = collectLetters(asts);
  var assignments = generateAssignments(letters);

  var fbs = asts.map(function (ast, i) {
    return { ast: ast, cols: buildColumns(ast, letters), label: astToLabel(ast) };
  });

  // Counterexample: all premises true AND conclusion false
  var counterRows = {};
  assignments.forEach(function (asgn, ri) {
    var premisesTrue = premiseAsts.every(function (pa, i) {
      return evaluate(fbs[i].cols[fbs[i].cols.length - 1].ast, asgn);
    });
    var conclusionFalse = !evaluate(fbs[fbs.length - 1].cols[fbs[fbs.length - 1].cols.length - 1].ast, asgn);
    if (premisesTrue && conclusionFalse) counterRows[ri] = true;
  });

  d.wrap.innerHTML = _renderModeTable(letters, fbs, assignments, function (ri) {
    return counterRows[ri] ? 'row-counterex' : null;
  });
  d.wrap.style.display = '';

  if (Object.keys(counterRows).length === 0) {
    d.verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span><strong>Valid</strong> — no row makes all premises true and the conclusion false.</span></div>';
  } else {
    d.verd.innerHTML = '<div class="verdict verdict-fail"><span class="verdict-icon">✗</span>'
      + '<span><strong>Invalid</strong> — highlighted row(s) are counterexamples where premises are true and conclusion is false.</span></div>';
  }
  d.verd.style.display = '';
}

// Run on load — after loadHash (0ms) and applyCardMode (100ms)
setTimeout(applyCheckMode, 150);

/* ================================================================
   COMBINED BUILD TABLE
   Used by ?mode=tautology|equivalence|validity.
   Shows: sentence-letter columns (pre-filled) + one main-connective
   column per formula (blank, student fills). No subformula columns.
   ================================================================ */

var _combinedBuildCells = [];  // [{rowIdx, formulaIdx, id, answer}]
var _combinedLetters    = [];
var _combinedFormulas   = [];  // [{ast, label}]
var _combinedAssignments = [];

function generateCombinedBuildTable() {
  var validSlots = _formulaSlots.filter(function (s) { return s.ast !== null; });
  if (validSlots.length === 0) return;

  _combinedFormulas   = validSlots.map(function (s) {
    return { ast: s.ast, label: astToLabel(s.ast) };
  });
  _combinedLetters    = collectLetters(_combinedFormulas.map(function (f) { return f.ast; }));
  _combinedAssignments = generateAssignments(_combinedLetters);
  _combinedBuildCells  = [];

  // Build HTML
  var html = '<div class="tt-scroll"><table class="truth-table"><thead><tr>';
  _combinedLetters.forEach(function (l, i) {
    var sep = (i === _combinedLetters.length - 1) ? ' col-sep' : '';
    html += '<th class="' + sep + '">' + l + '</th>';
  });
  _combinedFormulas.forEach(function (f, fi) {
    var cls = 'col-main' + (fi < _combinedFormulas.length - 1 ? ' col-sep' : '');
    html += '<th class="' + cls + '">' + f.label + '</th>';
  });
  html += '</tr></thead><tbody>';

  _combinedAssignments.forEach(function (asgn, ri) {
    html += '<tr>';
    _combinedLetters.forEach(function (l, i) {
      var sep = (i === _combinedLetters.length - 1) ? ' col-sep' : '';
      html += '<td class="' + sep + '">' + tvSpan(asgn[l]) + '</td>';
    });
    _combinedFormulas.forEach(function (f, fi) {
      var cls = 'col-main' + (fi < _combinedFormulas.length - 1 ? ' col-sep' : '');
      var cellId = 'cb-' + ri + '-' + fi;
      _combinedBuildCells.push({ rowIdx: ri, formulaIdx: fi, id: cellId, answer: null });
      html += '<td class="' + cls + '">'
            + '<button class="cell-btn" id="' + cellId + '" data-val=""'
            + ' onclick="cycleCombinedCell(\'' + cellId + '\')">?</button></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Inject into build-table-wrap (reuse existing element)
  var wrap = document.getElementById('build-table-wrap');
  wrap.innerHTML = html;
  wrap.style.display = '';

  // Show check/reset buttons (reuse build-btn-row)
  var btnRow = document.getElementById('build-btn-row');
  btnRow.style.display = '';
  btnRow.hidden = false;
  // Swap button labels for combined mode
  var checkBtn = document.getElementById('build-check-btn');
  if (checkBtn) { checkBtn.textContent = 'Check'; checkBtn.onclick = checkCombinedBuild; }
  var resetBtn = document.getElementById('build-reset-btn');
  if (resetBtn) { resetBtn.onclick = resetCombinedBuild; }

  document.getElementById('build-verdict').style.display = 'none';
}

function cycleCombinedCell(cellId) {
  var el = document.getElementById(cellId);
  if (!el) return;
  var cur = el.dataset.val;
  var next = cur === '' ? 'T' : cur === 'T' ? 'F' : '';
  el.dataset.val = next;
  el.textContent = next || '?';
  el.classList.remove('tv-T', 'tv-F', 'correct', 'wrong');
  if (next) el.classList.add('tv-' + next);
}

function resetCombinedBuild() {
  _combinedBuildCells.forEach(function (cell) {
    var el = document.getElementById(cell.id);
    if (!el) return;
    el.dataset.val = '';
    el.textContent = '?';
    el.classList.remove('tv-T', 'tv-F', 'correct', 'wrong');
    el.style.pointerEvents = '';
    el.onclick = function () { cycleCombinedCell(cell.id); };
  });
  document.getElementById('build-verdict').style.display = 'none';
}

function checkCombinedBuild() {
  var allFilled = _combinedBuildCells.every(function (cell) {
    return document.getElementById(cell.id) &&
           document.getElementById(cell.id).dataset.val !== '';
  });
  var verd = document.getElementById('build-verdict');
  if (!allFilled) {
    verd.innerHTML = '<div class="verdict verdict-warn"><span class="verdict-icon">⚠</span>'
      + '<span>Fill in every cell before checking.</span></div>';
    verd.style.display = '';
    return;
  }
  var allCorrect = true;
  _combinedBuildCells.forEach(function (cell) {
    var el = document.getElementById(cell.id);
    if (!el) return;
    var asgn    = _combinedAssignments[cell.rowIdx];
    var correct = evaluate(_combinedFormulas[cell.formulaIdx].ast, asgn);
    var entered = el.dataset.val === 'T';
    if (entered === correct) {
      el.classList.add('correct'); el.classList.remove('wrong');
    } else {
      el.classList.add('wrong'); el.classList.remove('correct');
      allCorrect = false;
    }
    el.style.pointerEvents = 'none';
  });
  if (allCorrect) {
    verd.innerHTML = '<div class="verdict verdict-ok"><span class="verdict-icon">✓</span>'
      + '<span>All cells correct.</span></div>';
  } else {
    verd.innerHTML = '<div class="verdict verdict-fail"><span class="verdict-icon">✗</span>'
      + '<span>Some cells are incorrect — highlighted in red. Reset to try again.</span></div>';
  }
  verd.style.display = '';
}
