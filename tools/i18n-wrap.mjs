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
  let depth = 0;
  const regexOK = () => !last || '(,=:[!&|?{};+-*%<>~^'.includes(last) || KW.test(s.slice(Math.max(a, i - 12), i));
  const readTemplate = () => {                       // i is just after a backtick (or a closing } of ${ })
    let q = i;
    while (i < b) {
      const c = s[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { out.push([q, i]); i++; last = 'x'; return 'end'; }
      if (c === '$' && s[i + 1] === '{') { out.push([q, i]); opens.push(i + 1); i += 2; stack.push(depth); depth = 0; last = '{'; return 'expr'; }
      i++;
    }
    return 'eof';
  };
  while (i < b) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) i = b; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 2; continue; }
    if (c === '"' || c === "'") { const qc = c; i++; while (i < b && s[i] !== qc && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1; i++; last = 'x'; continue; }
    if (c === '`') { i++; readTemplate(); continue; }
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
const skipped = [], edits = []; let nText = 0, nAttr = 0, nSec = 0, nRich = 0;
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
if (process.argv.includes('--list')) { const ln = (o) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStart[m] <= o) lo = m; else hi = m - 1; } return lo + 1; }; edits.slice().sort((x, y) => x[0] - y[0]).forEach(([s0, s1, r]) => console.log(ln(s0) + '	' + r.trim().slice(0, 150))); }
// --- plain-text messages in code: toast('…') / confirmDialog('…') first arguments, and the title / message /
// button labels inside a dialog call's options. Only whole string literals; anything built with + or ${…}
// needs a hand rewrite into one phrase with {placeholders}.
let nCall = 0;
if (process.argv.includes('--calls')) {
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
let nShadow = 0; for (let i = edits.length - 1; i >= 0; i--) if ((/\$\{/.test(edits[i][2]) || edits[i][2].startsWith(T + '(')) && shadowed(edits[i][0])) { edits.splice(i, 1); nShadow++; }
if (nShadow) console.log(`skipped ${nShadow} edit(s) inside functions that use t as a variable`);
edits.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
let out = src; for (const [s0, s1, r] of edits) out = out.slice(0, s0) + r + out.slice(s1);
console.log(`lines ${from}-${to}: ${nText} text, ${nRich} whole sentence(s) with markup, ${nAttr} attribute, ${nSec} section id(s)${dry ? ' (dry run)' : ''}`);
if (process.argv.includes('--skipped')) skipped.forEach((x) => console.log('  skipped: ' + x.slice(0, 120)));
console.log(`left for a hand edit: ${skipped.length} sentence piece(s) with inline markup (--skipped lists them)`);
if (!dry) writeFileSync(FILE, out);
