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
const SHADOW = /(?<![\w$.'"`\-])t(?![\w$'"`(-])(?!\.n\b)/g;
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
    let i = afterArrow, depth = 0;                               // an expression body: up to the first , ; ) ] } at its own level
    while (i < SB) {
      const c = src[i];
      if (c === "'" || c === '"') { i++; while (i < SB && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; i++; continue; }
      if (c === '`') { const q = scan.find((x) => x[0] === i + 1); if (!q) break; i = scan.filter((x) => x[2] === q[2]).reduce((mx, x) => Math.max(mx, x[1]), 0) + 1; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (depth === 0 && (c === ',' || c === ';')) break;
      i++;
    }
    return [from, i];
  };
  const bare = src.slice(d).match(/^t\s*=>/);                    // t => …
  if (bare) return arrowBody(d + bare[0].length, d);
  const pp = inner(parens, d);
  if (pp && src[pp[0]] === '(') {
    const after = src.slice(pp[1] + 1).match(/^\s*(=>)?\s*(\{)?/);
    if (after[1]) return arrowBody(pp[1] + 1 + after[0].indexOf('=>') + 2, pp[0]);
    if (after[2] && /(\bfunction\b[^(]*|\bcatch\s*|\bfor\s*(await\s*)?|^\s*(async\s+)?[\w$]+\s*)$/m.test(src.slice(Math.max(SA, pp[0] - 80), pp[0]))) return braceAt.get(pp[1] + after[0].length) || null;
  }
  // Not a parameter. Only a DECLARATION can hide the translator now; a mere use (t.id, f(t)) binds nothing: it
  // refers to whatever binding is in scope, and that binding marks its own block.
  let br = inner(pairs, d), pattern = false;
  // const { t } = …: the braces are a pattern, not a scope; the scope is the block around the declaration
  while (br && /\b(const|let|var)\s*$/.test(src.slice(Math.max(SA, br[0] - 12), br[0]))) { pattern = true; br = pairs.find(([x, y]) => x < br[0] && br[1] < y) || [SA, SB]; }
  const stmt = Math.max(src.lastIndexOf(';', d), src.lastIndexOf('{', d), src.lastIndexOf('}', d), SA);
  if (!br) return /\b(const|let|var)\s+$/.test(src.slice(Math.max(SA, d - 12), d)) ? [SA, SB] : null;   // top level: only `const t` itself
  if (!pattern) {                                                // is t in the NAME position of a const / let / var?
    const m = src.slice(stmt, d).match(/\b(?:const|let|var)\s([^;{}]*)$/); if (!m) return null;
    const seg = m[1];
    if (seg.includes('=')) {                                     // let a = f(1), t  — yes;  const x = g(t)  — a use
      const bal = (seg.match(/[(\[]/g) || []).length === (seg.match(/[)\]]/g) || []).length;
      if (!bal || !/,\s*$/.test(seg)) return null;
    }
  }
  return br;
}
for (const m of src.slice(SA, SB).matchAll(SHADOW)) { const sc = scopeOf(SA + m.index); if (sc) marked.push([sc[0], sc[1], SA + m.index]); }
if (process.argv.includes('--marks')) { const ln = (o) => src.slice(0, o).split('\n').length; marked.filter(([x, y]) => y - x > 20000).forEach(([x, y]) => console.log('big block', ln(x), ln(y))); for (const m of src.slice(SA, SB).matchAll(SHADOW)) { const d = SA + m.index, sc = scopeOf(d); if (sc && sc[1] - sc[0] > 20000) console.log(' token at', ln(d), JSON.stringify(src.slice(d - 40, d + 30))); } }
const shadowed = (pos) => marked.some(([x, y]) => x < pos && pos < y);
if (process.argv.includes('--check')) {            // every existing t('…') call must sit outside every marked block
  let bad = 0;
  for (const m of src.slice(A, B).matchAll(/(?<![\w$.])t(?:\.n)?\((['"`])/g)) if (shadowed(A + m.index)) { bad++; const mk = marked.find(([x, y]) => x < A + m.index && A + m.index < y); console.log('shadowed t() at line ' + src.slice(0, A + m.index).split('\n').length + ' by ' + JSON.stringify(src.slice(mk[2] - 30, mk[2] + 20))); }
  console.log(bad ? bad + ' call(s) sit in a block that uses t as a variable' : '✓ no t() call is shadowed'); process.exit(bad ? 1 : 0);
}
const skipped = [], edits = []; let nText = 0, nAttr = 0, nSec = 0, nRich = 0, nInterp = 0, nNested = 0, nPieces = 0, nPlural = 0, nClause = 0, nParts = 0;

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
const UNIT = /^(?:m|h|d|w|kg|lb|km|mi|cm|x)(?![A-Za-z])/;   // a unit right after a value ("{x}m", "{w}kg") is not a word glued on
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
    const convertSeg = (vs, raw, isRich) => {
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0], body = raw.slice(lead.length, raw.length - trail.length);
      const ks = [...body.matchAll(SENTG)].map((m) => m[0].charCodeAt(0) - 0xE100);
      const exprs = ks.map(exprOf);
      if (exprs.some((e) => e.includes('`'))) nNested++;   // a nested template rides along as a value; its own text is wrapped on the next run
      // an optional clause — ${done ? ' · done ✓' : ''} — is a phrase of its own: the clause is wrapped inside the
      // value, and the main phrase keeps one placeholder for it. Only a clause that starts with a space or a symbol
      // (never a word glued on), and only a plain string on one side with '' on the other.
      // The clause may be a plain string, a template or a + chain: it becomes its own phrase (with its own values).
      const clauseOf = (K) => {                                    // K: which ${…} of this template
        let a0 = qs[K][1] + 2, b0 = qs[K + 1][0] - 1;
        while (a0 < b0 && /\s/.test(src[a0])) a0++; while (b0 > a0 && /\s/.test(src[b0 - 1])) b0--;
        if (src[a0] === '(' && src[b0 - 1] === ')') { const pr = scan.parens.find(([x]) => x === a0); if (pr && pr[1] === b0 - 1) { a0++; b0--; } }
        let i2 = a0, depth = 0, qm = -1, cm = -1;
        while (i2 < b0) {
          const c = src[i2];
          if (c === "'" || c === '"') { i2++; while (i2 < b0 && src[i2] !== c) i2 += src[i2] === '\\' ? 2 : 1; i2++; continue; }
          if (c === '`') { const q = scan.find((x) => x[0] === i2 + 1); if (!q) return null; i2 = scan.filter((x) => x[2] === q[2]).reduce((mx, x) => Math.max(mx, x[1]), 0) + 1; continue; }
          if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
          else if (depth === 0 && c === '?') { if (src[i2 + 1] === '.' || src[i2 + 1] === '?' || src[i2 - 1] === '?' || qm >= 0) return null; qm = i2; }
          else if (depth === 0 && c === ':' && qm >= 0) { if (cm >= 0) return null; cm = i2; }
          i2++;
        }
        if (qm < 0 || cm < 0) return null;
        const cond = src.slice(a0, qm).trim(), A1 = src.slice(qm + 1, cm).trim(), B1 = src.slice(cm + 1, b0).trim();
        const emptyB = B1 === "''" || B1 === '""', emptyA = A1 === "''" || A1 === '""';
        const conv = (from, to, stop) => { let st = from; while (/\s/.test(src[st])) st++; const r = chainToCall(st, stop, true); return r && src.slice(r.s1, to).trim() === '' && /[A-Za-z]{2}/.test(r.key.replace(/<[^>]*>|\{\w+\}/g, '')) ? r : null; };   // real words, not only markup and values
        if (emptyA && emptyB) return null;
        if (emptyB || emptyA) {                                    // a clause: cond ? ' · done ✓' : ''
          const r = emptyB ? conv(qm + 1, cm, ':') : conv(cm + 1, b0, '');
          if (!r) return null;
          return { text: emptyB ? `${cond} ? ${r.text} : ''` : `${cond} ? '' : ${r.text}`, loose: /^[^A-Za-z0-9{]/.test(r.key) };
        }
        const r1 = conv(qm + 1, cm, ':'), r2 = conv(cm + 1, b0, '');   // a choice: cond ? 'projected' : 'so far'
        if (!r1 || !r2) return null;
        return { text: `${cond} ? ${r1.text} : ${r2.text}`, loose: false };
      };
      const app = ks.map((K) => clauseOf(K));
      const exprs2 = exprs.map((e, q) => (app[q] ? app[q].text : e));
      // a plural ending — session${n === 1 ? '' : 's'} — becomes a real plural: t.n('… session', '… sessions', n, …).
      // Only the === 1 / !== 1 shapes: those are exactly the rule t.n applies in English.
      const PL = /^\(?\s*(.+?)\s*(===?|!==?)\s*1\s*\?\s*'([a-z]{0,4})'\s*:\s*'([a-z]{0,4})'\s*\)?$/;
      const pl = exprs.map((e) => { const m = e.trim().match(PL); return m && !/['"`?:+]|\s[-*/]\s/.test(m[1]) ? m : null; });   // the count must be a simple value
      if (pl.some(Boolean)) {
        const counts = [...new Set(pl.filter(Boolean).map((m) => m[1].trim()))];
        const restIdx = exprs.map((e, k) => k).filter((k) => !pl[k]), rest = restIdx.map((k) => exprs2[k]);
        if (counts.length !== 1 || restIdx.some((k) => !app[k] && /(['"])(?:(?!\1).)*[A-Za-z]{3}(?:(?!\1).)*\1/.test(exprs[k]))) { nPieces++; if (process.argv.includes('--pieces')) console.log('  pieces: ' + body.replace(SENTG, (c) => '${' + exprOf(c.charCodeAt(0) - 0xE100).trim().slice(0, 60) + '}').replace(/\s+/g, ' ').slice(0, 230)); return false; }
        const names = paramNames(rest);
        const form = (one, glue) => { let k = 0, r = 0; return body.replace(SENTG, () => { const q = k++, m = pl[q]; if (!m) { const nm = names[r++]; return glue && app[q] && app[q].loose ? ' ' : '{' + nm + '}'; } const eq = m[2][0] === '='; return (eq === one) ? m[3] : m[4]; }).replace(/\s+/g, ' '); };
        const oneS = form(true), otherS = form(false);
        if (/[A-Za-z]\{|\}(?!(?:m|h|d|w|kg|lb|km|mi|cm|x)(?![A-Za-z]))[A-Za-z]/.test(form(false, true)) || oneS === otherS) { nPieces++; if (process.argv.includes('--pieces')) console.log('  pieces: ' + body.replace(SENTG, (c) => '${' + exprOf(c.charCodeAt(0) - 0xE100).trim().slice(0, 60) + '}').replace(/\s+/g, ' ').slice(0, 230)); return false; }   // still glued elsewhere
        const loose = pl.find(Boolean)[2].length === 2;                    // == / != compare loosely: so does +(x)
        const params = names.length ? `, { ${names.map((n, j) => `${n}: (${rest[j].trim()})`).join(', ')} }` : '';
        const s0 = toSrc(vs + lead.length, false), s1 = toSrc(vs + lead.length + body.length, true);
        edits.push([s0, s1, `\${${T}.n('${esc(oneS)}', '${esc(otherS)}', ${loose ? '+' : ''}(${counts[0]})${params})}`]); nPlural++;
        return true;
      }
      // a value glued to a word ("session{s}", "{label}ly") or carrying its own English ("more" / "fewer") builds
      // the sentence from pieces: left for a hand rewrite
      let glued = false, sk = 0;
      for (const sm of body.matchAll(SENTG)) { const q = sk++; if (app[q] && app[q].loose) continue; if (/[A-Za-z]/.test(body[sm.index - 1] || '') || (/^[A-Za-z]/.test(body.slice(sm.index + 1)) && !UNIT.test(body.slice(sm.index + 1)))) glued = true; }
      const shown = (e) => e.replace(/\b(weekday|month|day|year|hour|minute|second|era|timeZoneName|dateStyle|timeStyle|hourCycle|numeric|style|unit)\s*:\s*(['"])[\w-]*\2/g, ' ').replace(/[!=]==?\s*(['"])(?:(?!\1)[^\\]|\\.)*\1/g, ' ').replace(/([\w$\]])\(\s*(['"])(?:(?!\2)[^\\]|\\.)*\2\s*(?=[,)])/g, '$1(').replace(/\[\s*(['"])(?:(?!\1)[^\\]|\\.)*\1\s*\]/g, '[]');
      if (glued || exprs.some((e, q) => !app[q] && /(['"])(?:(?!\1).)*[A-Za-z]{3}(?:(?!\1).)*\1/.test(shown(e)))) { nPieces++; if (process.argv.includes('--pieces')) console.log('  pieces: ' + body.replace(SENTG, (c) => '${' + exprOf(c.charCodeAt(0) - 0xE100).trim().slice(0, 60) + '}').replace(/\s+/g, ' ').slice(0, 230)); return false; }
      if (app.some(Boolean)) nClause++;
      const names = paramNames(exprs); let i = 0;
      const key = body.replace(SENTG, () => '{' + names[i++] + '}').replace(/\s+/g, ' ');
      const params = names.map((n, j) => `${n}: (${exprs2[j].trim()})`).join(', ');
      const s0 = toSrc(vs + lead.length, false), s1 = toSrc(vs + lead.length + body.length, true);
      edits.push([s0, s1, `\${${T}('${esc(key)}', { ${params} })}`]); nInterp++;
      return true;
    };
    // A stat line — "3 exercises · 9 sets · 2 sessions" — is a list of independent phrases joined by " · ". When
    // the line as a whole cannot be one phrase, each part is converted on its own and the separators stay put.
    const convert = (vs, raw, isRich) => {
      if (convertSeg(vs, raw, isRich)) return true;
      const cuts = []; let inTag = false;
      for (let q = 0; q < raw.length - 2; q++) { const c = raw[q]; if (c === '<') inTag = true; else if (c === '>') inTag = false; else if (!inTag && raw.startsWith(' · ', q)) { cuts.push(q); q += 2; } }
      if (!cuts.length) return false;
      const mark = edits.length, counts = [nInterp, nPlural, nClause, nNested];
      let from = 0, okAny = false; const bounds = [...cuts.map((c) => [c, c + 3]), [raw.length, raw.length]];
      for (const [c0, c1] of bounds) {
        const seg = raw.slice(from, c0);
        const words = seg.replace(SENTG, ' ').replace(/<[^>]*>/g, ' ');
        const balanced = (seg.match(/<[a-zA-Z]/g) || []).length === (seg.match(/<\//g) || []).length + (seg.match(/<br\b/gi) || []).length;
        if (/[A-Za-z]{2}/.test(words)) {
          const plain = !isSent.test(seg);
          const done = balanced && (plain ? (good(seg.trim()) && !/</.test(seg) && (edits.push([toSrc(vs + from + seg.match(/^\s*/)[0].length, false), toSrc(vs + from + seg.length - seg.match(/\s*$/)[0].length, true), `\${${T}('${esc(seg.trim().replace(/\s+/g, ' '))}')}`]), true)) : convertSeg(vs + from, seg, isRich));
          if (!done) { edits.length = mark; [nInterp, nPlural, nClause, nNested] = counts; return false; }
          okAny = true;
        }
        from = c1;
      }
      if (okAny) nParts++;
      return okAny;
    };
    const tagBefore = (gtV) => V.slice(V.lastIndexOf('<', gtV), gtV + 1).match(/^<(\/?)([a-zA-Z][\w-]*)[\s\S]*>$/);
    const richDone = [];
    if (RICH) for (const m of V.matchAll(/>((?:[^<>]|<\/?(?:b|i|em|strong|code|small|u|kbd|sup|sub|mark|a|span)(?:\s[^<>]*)?>|<br\s*\/?>)+)<\/(div|p|li|label|summary|td|th|button|span|h[1-6]|a|dt|dd|legend|caption|figcaption|option)>/g)) {
      const inner = m[1];
      if (!isSent.test(inner)) continue;                        // no values in it: the plain pass does it
      const words = inner.replace(SENTG, '').replace(/<[^>]*>/g, '');
      if (!/[A-Za-z]{2}/.test(words) || notWords(words) || /&[#\w]+;|[\\{}$`]/.test(inner.replace(SENTG, ''))) continue;
      // layout markup is not a sentence: a value inside a tag, an empty element, or a pile of tags stays as it is
      if (/<[^<>]*[-][^<>]*>/.test(inner) || /<(\w+)[^<>]*>\s*<\/\1>/.test(inner) || (inner.match(/</g) || []).length > 6) continue;
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
  console.log(`${nInterp} phrase(s) with values in them, ${nPlural} plural(s), ${nClause} with an optional clause, ${nParts} stat line(s) by parts; ${nNested} carry a nested template; left: ${nPieces} built from pieces`);
}
for (const [qa, qb] of quasis(src, A, B)) {
  const q = src.slice(qa, qb);
  if (!/<[a-zA-Z\/]/.test(q) && !/^[^<]*>/.test(q)) continue;     // not markup
  // a whole sentence with inline markup ("Disconnect in <b>Data</b> to edit it.") becomes ONE phrase, tags
  // and all, so it is translated as a sentence (never by pieces)
  const rich = [];
  if (RICH) for (const m of q.matchAll(/>((?:[^<>]|<\/?(?:b|i|em|strong|code|small|u|kbd|sup|sub|mark|a|span)(?:\s[^<>]*)?>|<br\s*\/?>)+)<\/(div|p|li|label|summary|td|th|button|span|h[1-6]|a|dt|dd|legend|caption|figcaption|option)>/g)) {
    const inner = m[1], txt = inner.trim();
    if (notWords(inner) || /<(\w+)[^<>]*>\s*<\/\1>/.test(inner) || (inner.match(/</g) || []).length > 6) continue;   // layout, not a sentence
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
function chainToCall(start, stops, markup) {
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
  if (!/[A-Za-z]{2}/.test(lits) || /[{}]/.test(lits) || (!markup && /<[a-zA-Z\/]/.test(lits)) || notWords(lits)) return null;       // no words, or markup
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
  return { s0: ch.parts[0][0], s1: ch.end, text: `${T}('${key}'${params})`, plain: !exprs.length, key };
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
const shadowLines = []; let nShadow = 0; for (let i = edits.length - 1; i >= 0; i--) if ((/\$\{/.test(edits[i][2]) || edits[i][2].startsWith(T + '(')) && shadowed(edits[i][0])) { shadowLines.push(src.slice(0, edits[i][0]).split('\n').length); edits.splice(i, 1); nShadow++; }
if (process.argv.includes('--shadow-lines')) console.log('shadowed at lines: ' + [...new Set(shadowLines)].sort((x, y) => x - y).join(' '));
if (nShadow) console.log(`skipped ${nShadow} edit(s) inside functions that use t as a variable`);
// an edit inside another edit (text of a nested template whose outer phrase was just rewritten) waits for the next run
{ const before = edits.length; const outer = edits.filter((e) => e[1] > e[0]); for (let i = edits.length - 1; i >= 0; i--) { const e = edits[i]; if (outer.some((o) => o !== e && o[0] <= e[0] && e[1] <= o[1] && (o[1] - o[0]) > (e[1] - e[0]))) edits.splice(i, 1); } if (edits.length < before) console.log(`${before - edits.length} edit(s) inside a rewritten phrase wait for the next run: run again`); }
edits.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
let out = src; for (const [s0, s1, r] of edits) out = out.slice(0, s0) + r + out.slice(s1);
console.log(`lines ${from}-${to}: ${nText} text, ${nRich} whole sentence(s) with markup, ${nAttr} attribute, ${nSec} section id(s)${dry ? ' (dry run)' : ''}`);
if (process.argv.includes('--skipped')) skipped.forEach((x) => console.log('  skipped: ' + x.slice(0, 120)));
console.log(`left for a hand edit: ${skipped.length} sentence piece(s) with inline markup (--skipped lists them)`);
if (!dry) writeFileSync(FILE, out);
