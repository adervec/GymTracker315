// i18n-wrap: wraps the English inside HTML template literals in t(), for a range of lines in gym-tracker.html.
//   node tools/i18n-wrap.mjs <fromLine> <toLine> [--dry]
// What it touches, only inside template-literal text (never in code or plain strings):
//   >Some words<           ->  >${t(…the words…)}<
//   title="Some words"     ->  title="${escapeAttr(t(…the words…))}"   (also aria-label, placeholder)
//   >Words <b>with</b> markup<  (an element's whole static content) -> ONE phrase, tags included (--no-rich: off)
//   a drawer-section-title without data-sec-id gets one from its English, so collapse/page ids never move.
// It skips text with &entities, backslashes, ${…}, or inside <style>/<script>, and anything without a letter.
// In English t() returns its argument, so the page is unchanged; prove it with tools/en-snapshot.mjs --diff.
import { readFileSync, writeFileSync } from 'node:fs';

const [from, to] = process.argv.slice(2, 4).map(Number), dry = process.argv.includes('--dry');
if (!from || !to) { console.error('usage: node tools/i18n-wrap.mjs <fromLine> <toLine> [--dry]'); process.exit(2); }
const FILE = 'gym-tracker.html', src = readFileSync(FILE, 'utf8');
const lineStart = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStart.push(i + 1);
const A = lineStart[from - 1], B = lineStart[to] ?? src.length;

// --- a small JS scanner: returns the [start, end) of every template-literal text chunk (quasi) in src[A..B) ---
const KW = /(?:^|[^\w$.])(return|typeof|case|in|of|new|delete|void|throw|else|do|yield|await)\s*$/;
function quasis(s, a, b) {
  const out = []; out.pairs = []; out.parens = []; const opens = [], parens = []; let i = a, last = '';            // last: previous significant code char (for regex detection)
  const stack = [];                                  // template nesting: brace depth per open ${
  const tstack = []; let tid = 0;                    // which template literal a chunk belongs to (third field)
  let depth = 0;
  const regexOK = () => !last || '(,=:[!&|?{};+-*%<>~^'.includes(last) || KW.test(s.slice(Math.max(a, i - 12), i));
  const readTemplate = () => {                       // i is just after a backtick (or a closing } of ${ })
    let q = i; const id = tstack[tstack.length - 1];
    while (i < b) {
      const c = s[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { out.push([q, i, id]); tstack.pop(); i++; last = 'x'; return 'end'; }
      if (c === '$' && s[i + 1] === '{') { out.push([q, i, id]); opens.push(i + 1); i += 2; stack.push(depth); depth = 0; last = '{'; return 'expr'; }
      i++;
    }
    return 'eof';
  };
  while (i < b) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) i = b; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { const qc = c; i++; while (i < b && s[i] !== qc && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1; i++; last = 'x'; continue; }
    if (c === '`') { i++; tstack.push(++tid); readTemplate(); continue; }
    if (c === '/' && regexOK()) {                    // regex literal
      i++; let cls = false;
      while (i < b && s[i] !== '\n') { const d = s[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
      i++; while (/[a-z]/i.test(s[i] || '')) i++; last = 'x'; continue;
    }
    if (c === '{') { depth++; opens.push(i); last = c; i++; continue; }
    if (c === '(' || c === '[') { parens.push(i); last = c; i++; continue; }
    if (c === ')' || c === ']') { if (parens.length) out.parens.push([parens.pop(), i]); last = c; i++; continue; }
    if (c === '}') {
      if (opens.length) out.pairs.push([opens.pop(), i]);
      if (depth === 0 && stack.length) { depth = stack.pop(); i++; readTemplate(); continue; }
      depth--; last = c; i++; continue;
    }
    if (!/\s/.test(c)) last = /[\w$]/.test(c) ? 'x' : c;
    i++;
  }
  return out;
}

const T = 't'; // spelled apart so the house extractor does not read this tool's own code as app strings
const esc = (x) => x.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const secId = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const notWords = (x) => /^(https?:\/\/|\/)\S*$/.test(x.trim()) || /^\W*Gym\s*Tracker\s*315\W*$/.test(x.replace(/<[^>]*>/g, '')); // a path, a URL, the wordmark
const good = (x) => /[A-Za-z]/.test(x) && !notWords(x) && !/&[#\w]+;/.test(x) && !/[\\{}$`<>]/.test(x) &&!/^\s*[\w.-]+\(/.test(x);
const RICH = !process.argv.includes('--no-rich');
// --- shadowing guard: a block with its own variable called t (a toast element, a time, a map parameter) would
// call THAT instead of the translator and throw. Every use of t that is not a call marks the innermost { } or
// ${ } around it; nothing inside a marked block is wrapped. Over-cautious on purpose.
const SHADOW = /(?<![\w$.'"`\-])t(?![\w$'"`(-])(?!\.n)/g;
const SA = src.lastIndexOf('<script', A), SB = src.indexOf('</script>', A);         // the whole script around the range
const scan = quasis(src, src.indexOf('>', SA) + 1, SB);
const pairs = scan.pairs.slice().sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));     // smallest first
const parens = scan.parens.slice().sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
const braceAt = new Map(scan.pairs.map((pr) => [pr[0], pr]));
const inner = (list, d) => list.find(([x, y]) => x < d && d < y);
const marked = [];
// where a use of t (not a call) is in scope: a parameter covers its function body; anything else covers its block
function scopeOf(d) {
  const arrowBody = (afterArrow, from) => {                      // afterArrow: index just past =>
    const m = src.slice(afterArrow).match(/^\s*\{/);
    if (m) return braceAt.get(afterArrow + m[0].length - 1) || null;
    const pp = inner(parens, from);                              // an expression body ends with the call around it
    if (pp) return pp;
    const end = src.indexOf(';', afterArrow); return [from, end < 0 ? SB : end];
  };
  const bare = src.slice(d).match(/^t\s*=>/);                    // t => …
  if (bare) return arrowBody(d + bare[0].length, d);
  const pp = inner(parens, d);
  if (pp && src[pp[0]] === '(') {
    const after = src.slice(pp[1] + 1).match(/^\s*(=>)?\s*(\{)?/);
    if (after[1]) return arrowBody(pp[1] + 1 + after[0].indexOf('=>') + 2, pp[0]);
    if (after[2] && /(\bfunction\b[^(]*|\bcatch\s*|\bfor\s*(await\s*)?|^\s*(async\s+)?[\w$]+\s*)$/m.test(src.slice(Math.max(SA, pp[0] - 80), pp[0]))) return braceAt.get(pp[1] + after[0].length) || null;
  }
  let br = inner(pairs, d);
  // const { t } = …: the braces are a pattern, not a scope; the scope is the block around the declaration
  while (br && /(const|let|var)\s*$/.test(src.slice(Math.max(SA, br[0] - 12), br[0]))) br = pairs.find(([x, y]) => x < br[0] && br[1] < y) || [SA, SB];
  if (br) return br;
  return /\b(const|let|var)\s+([\w$]+\s*=[^;]*,\s*)?$/.test(src.slice(Math.max(SA, d - 200), d)) ? [SA, SB] : null; // top level: only a declaration counts
}
for (const m of src.slice(SA, SB).matchAll(SHADOW)) { const sc = scopeOf(SA + m.index); if (sc) marked.push(sc); }
if (process.argv.includes('--marks')) { const ln = (o) => src.slice(0, o).split('\n').length; marked.filter(([x, y]) => y - x > 20000).forEach(([x, y]) => console.log('big block', ln(x), ln(y))); for (const m of src.slice(SA, SB).matchAll(SHADOW)) { const d = SA + m.index, sc = scopeOf(d); if (sc && sc[1] - sc[0] > 20000) console.log(' token at', ln(d), JSON.stringify(src.slice(d - 40, d + 30))); } }
const shadowed = (pos) => marked.some(([x, y]) => x < pos && pos < y);
if (process.argv.includes('--check')) {            // every existing t('…') call must sit outside every marked block
  let bad = 0;
  for (const m of src.slice(A, B).matchAll(/(?<![\w$.])t\((['"`])/g)) if (shadowed(A + m.index)) { bad++; console.log('shadowed t() at line ' + src.slice(0, A + m.index).split('\n').length); }
  console.log(bad ? bad + ' call(s) sit in a block that uses t as a variable' : '✓ no t() call is shadowed'); process.exit(bad ? 1 : 0);
}
const skipped = [], edits = []; let nText = 0, nAttr = 0, nSec = 0, nRich = 0, nInterp = 0, nNested = 0, nPieces = 0;

// --- placeholders: a readable {name} for each ${expr} moved into a phrase
function paramNames(exprs) {
  const used = new Set();
  return exprs.map((e0, i) => {
    const e = e0.trim(); let n = null, m;
    if (/^[A-Za-z_][\w]*$/.test(e)) n = e;
    else if ((m = e.match(/^(?:[\w$]+\.)+([A-Za-z_]\w*)$/))) n = m[1];
    else if ((m = e.match(/^[\w$.]+\(\s*(?:[\w$]+\.)*([A-Za-z_]\w*)\s*\)$/))) n = m[1];
    if (!n || n.length > 18) n = 'p' + (i + 1);
    while (used.has(n)) n += '_';
    used.add(n); return n;
  });
}
const SENT = (k) => String.fromCharCode(0xE100 + k), isSent = /[-]/, SENTG = /[-]/g;
// text with values in it: >Age ${x} · used in body-comp<  ->  ONE phrase, 'Age {x} · used in body-comp', with the
// expressions passed as params. Works on a whole template literal at a time (its chunks joined by markers).
if (process.argv.includes('--interp')) {
  const byTpl = new Map();
  for (const q of scan) { if (q[2] == null) continue; if (!byTpl.has(q[2])) byTpl.set(q[2], []); byTpl.get(q[2]).push(q); }
  for (const qs of byTpl.values()) {
    if (qs.length < 2 || qs[0][0] < A || qs[qs.length - 1][1] > B || qs.length > 5000) continue;
    qs.sort((x, y) => x[0] - y[0]);
    let V = ''; const vAt = [];                                 // vAt[k]: where chunk k starts in V
    qs.forEach((q, k) => { vAt.push(V.length); V += src.slice(q[0], q[1]); if (k < qs.length - 1) V += SENT(k); });
    if (!/<[a-zA-Z\/]/.test(V)) continue;                       // not markup
    const exprOf = (k) => src.slice(qs[k][1] + 2, qs[k + 1][0] - 1);
    const toSrc = (v, end) => {                                 // a V offset back to a source offset
      for (let k = qs.length - 1; k >= 0; k--) if (v >= vAt[k]) {
        const len = qs[k][1] - qs[k][0];
        if (v - vAt[k] <= len) return qs[k][0] + (v - vAt[k]);
        return end ? qs[k + 1][0] : qs[k][1];                   // on the marker: after the } or before the $
      }
      return qs[0][0];
    };
    const convert = (vs, raw, isRich) => {
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0], body = raw.slice(lead.length, raw.length - trail.length);
      const ks = [...body.matchAll(SENTG)].map((m) => m[0].charCodeAt(0) - 0xE100);
      const exprs = ks.map(exprOf);
      if (exprs.some((e) => e.includes('`'))) { nNested++; return false; }   // a nested template: its own text is handled first
      // a value glued to a word ("session{s}", "{label}ly") or carrying its own English ("more" / "fewer") builds
      // the sentence from pieces: left for a hand rewrite
      if (/[A-Za-z][-]|[-][A-Za-z]/.test(body) || exprs.some((e) => /(['"])(?:(?!\1).)*[A-Za-z]{3}(?:(?!\1).)*\1/.test(e))) { nPieces++; return false; }
      const names = paramNames(exprs); let i = 0;
      const key = body.replace(SENTG, () => '{' + names[i++] + '}').replace(/\s+/g, ' ');
      const params = names.map((n, j) => `${n}: (${exprs[j].trim()})`).join(', ');
      const s0 = toSrc(vs + lead.length, false), s1 = toSrc(vs + lead.length + body.length, true);
      edits.push([s0, s1, `\${${T}('${esc(key)}', { ${params} })}`]); nInterp++;
      return true;
    };
    const tagBefore = (gtV) => V.slice(V.lastIndexOf('<', gtV), gtV + 1).match(/^<(\/?)([a-zA-Z][\w-]*)[\s\S]*>$/);
    const richDone = [];
    if (RICH) for (const m of V.matchAll(/>((?:[^<>]|<\/?(?:b|i|em|strong|code|small|u|kbd|sup|sub|mark)>|<br\s*\/?>)+)<\/(div|p|li|label|summary|td|th|button|span)>/g)) {
      const inner = m[1];
      if (!isSent.test(inner)) continue;                        // no values in it: the plain pass does it
      const words = inner.replace(SENTG, '').replace(/<[^>]*>/g, '');
      if (!/[A-Za-z]{2}/.test(words) || notWords(words) || /&[#\w]+;|[\\{}$`]/.test(inner.replace(SENTG, ''))) continue;
      const open = tagBefore(m.index); if (!open || open[1] || open[2].toLowerCase() !== m[2].toLowerCase()) continue;
      if (convert(m.index + 1, inner, true)) richDone.push([m.index + 1, m.index + 1 + inner.length]);
    }
    for (const m of V.matchAll(/>([^<>]*)</g)) {
      const raw = m[1]; if (!isSent.test(raw)) continue;
      if (richDone.some(([x, y]) => m.index + 1 >= x && m.index + 1 < y)) continue;
      const words = raw.replace(SENTG, ' ').trim();
      if (!/[A-Za-z]{2}/.test(words) || !good(words)) continue;
      const lastTag = tagBefore(m.index);
      if (lastTag && !lastTag[1] && /^(style|script|textarea)$/i.test(lastTag[2])) continue;
      const nextTag = (V.slice(m.index + 1 + raw.length).match(/^<(\/?)([a-zA-Z][\w-]*)/) || []);
      const INL = /^(b|i|em|strong|code|a|span|small|u|kbd|br|sup|sub|mark)$/i;
      if ((lastTag && INL.test(lastTag[2])) || (nextTag[2] && INL.test(nextTag[2]))) { skipped.push(words); continue; }
      convert(m.index + 1, raw, false);
    }
  }
  console.log(`${nInterp} phrase(s) with values in them; left: ${nNested} with a nested template, ${nPieces} built from pieces`);
}
for (const [qa, qb] of quasis(src, A, B)) {
  const q = src.slice(qa, qb);
  if (!/<[a-zA-Z\/]/.test(q) && !/^[^<]*>/.test(q)) continue;     // not markup
  // a whole sentence with inline markup ("Disconnect in <b>Data</b> to edit it.") becomes ONE phrase, tags
  // and all, so it is translated as a sentence (never by pieces)
  const rich = [];
  if (RICH) for (const m of q.matchAll(/>((?:[^<>]|<\/?(?:b|i|em|strong|code|small|u|kbd|sup|sub|mark)>|<br\s*\/?>)+)<\/(div|p|li|label|summary|td|th|button|span)>/g)) {
    const inner = m[1], txt = inner.trim();
    if (notWords(inner)) continue;
    if (!/<[a-z]/i.test(inner) || !/[A-Za-z]/.test(txt.replace(/<[^>]*>/g, '')) || /&[#\w]+;|[\\{}$`]/.test(inner)) continue;
    const gt = qa + m.index, open = src.slice(src.lastIndexOf('<', gt), gt + 1);
    if (!new RegExp('^<' + m[2] + '\\b', 'i').test(open)) continue; // the text must be the element's whole content
    const s0 = gt + 1, lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
    edits.push([s0, s0 + inner.length, `${lead}\${${T}('${esc(txt.replace(/\s+/g, ' '))}')}${trail}`]); nRich++;
    rich.push([s0, s0 + inner.length]);
  }
  // text nodes fully inside this chunk: >text<
  for (const m of q.matchAll(/>([^<>]*)</g)) {
    const raw = m[1], txt = raw.trim();
    if (!txt || !good(txt)) continue;
    if (rich.some(([x, y]) => qa + m.index + 1 >= x && qa + m.index + 1 < y)) continue;
    const gt = qa + m.index;                                           // the > that ends the previous tag
    const tagText = src.slice(src.lastIndexOf('<', gt), gt + 1);       // the whole tag, even across ${…}
    const lastTag = tagText.match(/^<(\/?)([a-zA-Z][\w-]*)[\s\S]*>$/);
    if (lastTag && !lastTag[1] && /^(style|script|textarea)$/i.test(lastTag[2])) continue;
    // a sentence with inline markup in it ("in <b>Data</b> to edit") is left whole for a hand edit:
    // wrapping its pieces would build the sentence by concatenation
    const lt = qa + m.index + 1 + raw.length;                          // the < after the text
    const nextTag = (src.slice(lt).match(/^<(\/?)([a-zA-Z][\w-]*)/) || []);
    const INL = /^(b|i|em|strong|code|a|span|small|u|kbd|br|sup|sub|mark)$/i;
    const prevInline = lastTag && INL.test(lastTag[2]), nextInline = nextTag[2] && INL.test(nextTag[2]);
    if (prevInline || nextInline) {
      const sole = lastTag && !lastTag[1] && nextTag[1] && lastTag[2].toLowerCase() === (nextTag[2] || '').toLowerCase()
        && /(^|>)\s*$/.test(src.slice(src.lastIndexOf('>', src.lastIndexOf('<', gt) - 1) , src.lastIndexOf('<', gt)))
        && /^\s*(<|$)/.test(src.slice(src.indexOf('>', lt) + 1, src.indexOf('>', lt) + 200));
      if (!sole || /^br$/i.test(lastTag[2])) { skipped.push(txt); continue; }
    }
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    const s0 = qa + m.index + 1;
    edits.push([s0, s0 + raw.length, `${lead}\${${T}('${esc(txt.replace(/\s+/g, ' '))}')}${trail}`]); nText++;
    // a section title gets a fixed id from its English
    if (lastTag && /class="drawer-section-title"/.test(lastTag[0]) && !/data-sec-id=/.test(lastTag[0])) {
      edits.push([gt, gt, ` data-sec-id="${secId(txt)}"`]); nSec++;    // just before the tag's closing >

    }
  }
  for (const m of q.matchAll(/\s(title|aria-label|placeholder)="([^"]*)"/g)) {
    const v = m[2]; if (!good(v)) continue;
    const s0 = qa + m.index + m[0].indexOf('"') + 1;
    edits.push([s0, s0 + v.length, `\${escapeAttr(${T}('${esc(v)}'))}`]); nAttr++;
  }
}
// --- plain-text messages in code: toast('…') / confirmDialog('…') first arguments, and the title / message /
// button labels inside a dialog call's options. Only whole string literals; anything built with + or ${…}
// needs a hand rewrite into one phrase with {placeholders}.
let nCall = 0, nChain = 0;
// --- messages built in code: 'Deleted ' + n + ' sets', or `Deleted ${n} sets`  ->  ONE phrase with {n}.
// Reads one expression from `start` up to a top-level stop character. Only a chain of + is accepted; any other
// operator at the top level (?: || comparisons…) leaves the message alone.
function readChain(start, stops) {
  let i = start, depth = 0; const cuts = [start]; let bad = false;
  while (i < SB) {
    const c = src[i];
    if (c === "'" || c === '"') { i++; while (i < SB && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; i++; continue; }
    if (c === '`') { const q = scan.find((x) => x[0] === i + 1); if (!q) return null; const last = scan.filter((x) => x[2] === q[2]).sort((x, y) => y[1] - x[1])[0]; i = last[1] + 1; continue; }
    if ('([{'.includes(c)) { depth++; i++; continue; }
    if (')]}'.includes(c)) { if (depth === 0) break; depth--; i++; continue; }
    if (depth === 0) {
      if (stops.includes(c)) break;
      if (c === '+' && src[i + 1] !== '+' && src[i - 1] !== '+' && src[i + 1] !== '=') { cuts.push(i); i++; continue; }
      if ('?:|&<>=*/%!-'.includes(c)) bad = true;
    }
    i++;
  }
  if (bad) return null;
  const parts = []; cuts.push(i);
  for (let k = 0; k < cuts.length - 1; k++) { const a = cuts[k] + (k ? 1 : 0), b = cuts[k + 1]; const tx = src.slice(a, b); const lead = tx.match(/^\s*/)[0].length, tr = tx.match(/\s*$/)[0].length; parts.push([a + lead, b - tr]); }
  return { end: parts.length ? parts[parts.length - 1][1] : i, parts };
}
function chainToCall(start, stops) {
  const ch = readChain(start, stops); if (!ch || !ch.parts.length) return null;
  const segs = [];                                               // { lit } | { expr }
  for (const [a, b] of ch.parts) {
    const tx = src.slice(a, b); if (!tx) return null;
    if (/^'(?:[^'\\\n]|\\.)*'$/.test(tx)) segs.push({ lit: tx.slice(1, -1) });
    else if (/^"(?:[^"\\\n]|\\.)*"$/.test(tx)) segs.push({ lit: tx.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'") });
    else if (tx[0] === '`' && tx[tx.length - 1] === '`') {
      const q0 = scan.find((x) => x[0] === a + 1); if (!q0) return null;
      const qs = scan.filter((x) => x[2] === q0[2]).sort((x, y) => x[0] - y[0]);
      if (qs[qs.length - 1][1] !== b - 1) return null;
      qs.forEach((q, k) => {
        const raw = src.slice(q[0], q[1]).replace(/\\`/g, '`').replace(/(^|[^\\])'/g, "$1\\'").replace(/(^|[^\\])'/g, "$1\\'").replace(/\r?\n/g, '\\n');
        if (raw) segs.push({ lit: raw });
        if (k < qs.length - 1) segs.push({ expr: src.slice(q[1] + 2, qs[k + 1][0] - 1) });
      });
    } else segs.push({ expr: tx });
  }
  const lits = segs.filter((x) => x.lit != null).map((x) => x.lit).join(' ');
  if (!/[A-Za-z]{2}/.test(lits) || /[{}]|<[a-zA-Z\/]/.test(lits) || notWords(lits)) return null;       // no words, or markup
  if (segs[0].expr != null && (segs.length < 2 || segs[1].expr != null)) return null;                    // a + b + '…' may be arithmetic
  const exprs = segs.filter((x) => x.expr != null).map((x) => x.expr);
  if (exprs.some((e) => e.includes('`') || /(['"])(?:(?!\1).)*[A-Za-z]{3}(?:(?!\1).)*\1/.test(e))) return null;   // nested template, or its own English
  for (let k = 0; k < segs.length - 1; k++) {                    // a value glued to a word builds the phrase from pieces
    const x = segs[k], y = segs[k + 1];
    if (x.lit != null && y.expr != null && /[A-Za-z]$/.test(x.lit)) return null;
    if (x.expr != null && y.lit != null && /^[A-Za-z]/.test(y.lit)) return null;
    if (x.expr != null && y.expr != null) return null;
  }
  const names = paramNames(exprs); let n = 0;
  const key = segs.map((x) => (x.lit != null ? x.lit : '{' + names[n++] + '}')).join('');
  const params = exprs.length ? `, { ${names.map((nm, j) => `${nm}: (${exprs[j].trim()})`).join(', ')} }` : '';
  return { s0: ch.parts[0][0], s1: ch.end, text: `${T}('${key}'${params})`, plain: !exprs.length };
}
if (process.argv.includes('--calls')) {
  const region0 = src.slice(A, B), done = new Set();
  const push = (r) => { if (!r || done.has(r.s0)) return; done.add(r.s0); edits.push([r.s0, r.s1, r.text]); r.plain ? nCall++ : nChain++; };
  for (const m of region0.matchAll(/(?<![\w$.])(toast|confirmDialog)\(\s*/g)) push(chainToCall(A + m.index + m[0].length, ','));
  for (const m of region0.matchAll(/(?<![\w$.])(confirmDialog|choiceDialog|promptDialog)\(/g)) {
    const open = A + m.index + m[0].length - 1, pr = scan.parens.find(([x]) => x === open); if (!pr) continue;
    for (const k of src.slice(pr[0], pr[1]).matchAll(/\b(title|message|okLabel|cancelLabel|label|sub|placeholder|hint|detail)\s*:\s*/g)) push(chainToCall(pr[0] + k.index + k[0].length, ','));
  }
  for (const m of region0.matchAll(/\.(textContent|innerText)\s*=(?!=)\s*/g)) push(chainToCall(A + m.index + m[0].length, ';,\n'));
  console.log(`${nCall} plain message(s) and ${nChain} built message(s) in toast / dialog / label code`);
}
if (false) {
  const LITS = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
  const region = src.slice(A, B);
  for (const m of region.matchAll(new RegExp(String.raw`(?<![\w$.])(toast|confirmDialog)\(\s*` + LITS + String.raw`(?=\s*[,)])`, 'g'))) {
    if (!/[A-Za-z]{2}/.test(m[2])) continue;
    const s0 = A + m.index + m[0].length - m[2].length;
    edits.push([s0, s0 + m[2].length, `${T}(${m[2]})`]); nCall++;
  }
  for (const m of region.matchAll(/(?<![\w$.])(confirmDialog|choiceDialog|promptDialog)\(/g)) {
    const open = A + m.index + m[0].length - 1, pr = scan.parens.find(([x]) => x === open); if (!pr) continue;
    const body = src.slice(pr[0], pr[1]);
    for (const k of body.matchAll(new RegExp(String.raw`\b(title|message|okLabel|cancelLabel|label|sub|placeholder|hint|detail)\s*:\s*` + LITS + String.raw`(?=\s*[,}\n])`, 'g'))) {
      if (!/[A-Za-z]{2}/.test(k[2])) continue;
      const s0 = pr[0] + k.index + k[0].length - k[2].length;
      edits.push([s0, s0 + k[2].length, `${T}(${k[2]})`]); nCall++;
    }
  }
  console.log(`${nCall} plain message(s) in toast / dialog calls`);
}
if (process.argv.includes('--list')) { const ln = (o) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStart[m] <= o) lo = m; else hi = m - 1; } return lo + 1; }; edits.slice().sort((x, y) => x[0] - y[0]).forEach(([s0, s1, r]) => console.log(ln(s0) + '	' + r.trim().slice(0, 150))); }
let nShadow = 0; for (let i = edits.length - 1; i >= 0; i--) if ((/\$\{/.test(edits[i][2]) || edits[i][2].startsWith(T + '(')) && shadowed(edits[i][0])) { edits.splice(i, 1); nShadow++; }
if (nShadow) console.log(`skipped ${nShadow} edit(s) inside functions that use t as a variable`);
edits.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
let out = src; for (const [s0, s1, r] of edits) out = out.slice(0, s0) + r + out.slice(s1);
console.log(`lines ${from}-${to}: ${nText} text, ${nRich} whole sentence(s) with markup, ${nAttr} attribute, ${nSec} section id(s)${dry ? ' (dry run)' : ''}`);
if (process.argv.includes('--skipped')) skipped.forEach((x) => console.log('  skipped: ' + x.slice(0, 120)));
console.log(`left for a hand edit: ${skipped.length} sentence piece(s) with inline markup (--skipped lists them)`);
if (!dry) writeFileSync(FILE, out);
