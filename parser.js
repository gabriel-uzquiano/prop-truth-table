/**
 * Propositional Logic Parser — with precedence
 *
 * Precedence (high to low):
 *   1. Atoms, parenthesized expressions
 *   2. ¬ (right-associative, highest)
 *   3. ∧ (left-associative)
 *   4. ∨ (left-associative)
 *   5. → (right-associative)
 *   6. ↔ (treated as abbreviation: φ↔ψ becomes (φ→ψ)∧(ψ→φ))
 *
 * Sentence letters: p, q, r, s, t with optional numeric subscripts p1, q2 etc.
 *
 * Public API:
 *   parse(input)             → AST or throws ParseError
 *   prettyPrint(node, top)   → canonical string (uses official notation with parens)
 *   collectLetters(ast)      → sorted array of letter strings
 */

'use strict';

class ParseError extends Error {
  constructor(msg) { super(msg); this.name = 'ParseError'; }
}

// ── Normalise ─────────────────────────────────────────────────
function normalise(s) {
  return s
    .replace(/<->/g, '↔').replace(/<=>/g, '↔').replace(/<>/g, '↔')
    .replace(/->/g,  '→').replace(/=>/g,  '→').replace(/>/g,  '→')
    .replace(/\/\\/g,'∧').replace(/\\\//g,'∨')
    .replace(/~|¬/g, '¬')
    .replace(/&/g,   '∧')
    .replace(/\|/g,  '∨');
}

// ── Token types ───────────────────────────────────────────────
const T = {
  LETTER: 'LETTER', NEG: 'NEG',  AND: 'AND', OR: 'OR',
  IMP: 'IMP', BICOND: 'BICOND', LPAREN: 'LPAREN', RPAREN: 'RPAREN', EOF: 'EOF',
};

function tokenise(raw) {
  const s = normalise(raw.trim());
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '¬') { tokens.push({ type: T.NEG });    i++; continue; }
    if (ch === '∧') { tokens.push({ type: T.AND });    i++; continue; }
    if (ch === '∨') { tokens.push({ type: T.OR });     i++; continue; }
    if (ch === '→') { tokens.push({ type: T.IMP });    i++; continue; }
    if (ch === '↔') { tokens.push({ type: T.BICOND }); i++; continue; }
    if (ch === '(') { tokens.push({ type: T.LPAREN }); i++; continue; }
    if (ch === ')') { tokens.push({ type: T.RPAREN }); i++; continue; }

    if (/[pqrstuvwPQRSTUVW]/.test(ch)) {
      // Accept p-w and P-W as sentence letters (case-insensitive normalise to lowercase)
      const letter = ch.toLowerCase();
      let sub = ''; i++;
      while (i < s.length && /[0-9₀-₉]/.test(s[i])) {
        // convert unicode subscript digits
        const code = s[i].codePointAt(0);
        sub += (code >= 0x2080) ? String(code - 0x2080) : s[i];
        i++;
      }
      tokens.push({ type: T.LETTER, name: letter, sub: sub || '' });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let word = ''; 
      while (i < s.length && /[a-zA-Z0-9]/.test(s[i])) { word += s[i]; i++; }
      throw new ParseError(
        `'${word}' is not a sentence letter. Use p, q, r, s, t (with optional numeric subscripts).`
      );
    }

    throw new ParseError(`Unexpected character '${ch}'.`);
  }
  tokens.push({ type: T.EOF });
  return tokens;
}

// ── Pratt / precedence parser ─────────────────────────────────
//  Binding powers (higher = tighter):
//    ↔ : 10 (right)
//    → : 20 (right)
//    ∨ : 30 (left)
//    ∧ : 40 (left)
//    ¬ : 50 (prefix/right)
//    atoms : 60

function parse(input) {
  const tokens = tokenise(input);
  let pos = 0;

  function peek()    { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parseExpr(minBp) {
    let lhs = parsePrefix();
    while (true) {
      const tok = peek();
      const info = infixBp(tok.type);
      if (!info || info.lbp < minBp) break;
      consume();
      if (tok.type === T.BICOND) {
        // φ↔ψ ≡ (φ→ψ)∧(ψ→φ)
        const rhs = parseExpr(info.rbp);
        lhs = { type: 'and',
                left:  { type: 'imp', left: lhs,  right: rhs },
                right: { type: 'imp', left: clone(rhs), right: clone(lhs) } };
      } else {
        const rhs = parseExpr(info.rbp);
        lhs = { type: binType(tok.type), left: lhs, right: rhs };
      }
    }
    return lhs;
  }

  function parsePrefix() {
    const tok = peek();
    if (tok.type === T.NEG) {
      consume();
      const arg = parseExpr(50); // right-assoc, high bp
      return { type: 'neg', arg };
    }
    if (tok.type === T.LPAREN) {
      consume();
      const inner = parseExpr(0);
      if (peek().type !== T.RPAREN) {
        throw new ParseError(`Expected ')' but got ${descTok(peek())}.`);
      }
      consume();
      return inner;
    }
    if (tok.type === T.LETTER) {
      consume();
      return { type: 'letter', name: tok.name, sub: tok.sub };
    }
    if (tok.type === T.EOF) {
      throw new ParseError('Unexpected end of input — formula is incomplete.');
    }
    throw new ParseError(`Unexpected ${descTok(tok)} — expected a sentence letter, ¬, or '('.`);
  }

  function infixBp(type) {
    if (type === T.BICOND) return { lbp: 10, rbp: 10 }; // right: rbp = lbp
    if (type === T.IMP)    return { lbp: 20, rbp: 20 }; // right-assoc
    if (type === T.OR)     return { lbp: 30, rbp: 31 }; // left: rbp = lbp+1
    if (type === T.AND)    return { lbp: 40, rbp: 41 }; // left
    return null;
  }

  function binType(tt) {
    if (tt === T.AND) return 'and';
    if (tt === T.OR)  return 'or';
    if (tt === T.IMP) return 'imp';
    return '?';
  }

  function descTok(tok) {
    if (tok.type === T.EOF)    return 'end of input';
    if (tok.type === T.LETTER) return `letter '${tok.name}'`;
    const sym = { NEG:'¬', AND:'∧', OR:'∨', IMP:'→', BICOND:'↔', LPAREN:'(', RPAREN:')' };
    return `'${sym[tok.type] || tok.type}'`;
  }

  function clone(node) {
    return JSON.parse(JSON.stringify(node));
  }

  const ast = parseExpr(0);
  if (peek().type !== T.EOF) {
    throw new ParseError(`Unexpected ${descTok(peek())} — check your parentheses.`);
  }
  return ast;
}

// ── Pretty-print ──────────────────────────────────────────────
function prettyPrint(node, topLevel) {
  if (topLevel === undefined) topLevel = true;
  if (!node) return '';
  switch (node.type) {
    case 'letter': return node.name + (node.sub || '');
    case 'neg':    return '¬' + prettyAtom(node.arg);
    case 'and':    return wrap(`${prettyPrint(node.left, false)} ∧ ${prettyPrint(node.right, false)}`, topLevel);
    case 'or':     return wrap(`${prettyPrint(node.left, false)} ∨ ${prettyPrint(node.right, false)}`, topLevel);
    case 'imp':    return wrap(`${prettyPrint(node.left, false)} → ${prettyPrint(node.right, false)}`, topLevel);
    default: return '?';
  }
}

function prettyAtom(node) {
  if (node.type === 'letter' || node.type === 'neg') return prettyPrint(node, false);
  return '(' + prettyPrint(node, true) + ')';
}

function wrap(s, topLevel) {
  return topLevel ? s : `(${s})`;
}

// ── collectLetters ────────────────────────────────────────────
function collectLetters(ast) {
  const letters = new Set();
  function walk(node) {
    if (!node) return;
    if (node.type === 'letter') { letters.add(node.name + (node.sub || '')); return; }
    if (node.type === 'neg') { walk(node.arg); return; }
    walk(node.left); walk(node.right);
  }
  walk(ast);
  return [...letters].sort();
}
