// i18n-unshadow: renames a LOCAL variable that has the translator's one-letter name, in the blocks that contain
// the given lines, so the text in those blocks can be translated. Babel (the copy inside Playwright) supplies the
// binding and every reference to it, so the rename is exact: the declaration, each read and each write.
//   node tools/i18n-unshadow.mjs <line> [<line> …] [--dry]
// A binding used as a shorthand property ({ x }) is left alone and reported.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { babelParse, traverse } = createRequire(import.meta.url)('playwright/lib/transform/babelBundle');
const NAME = 't', FILE = 'gym-tracker.html';
const wanted = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number), dry = process.argv.includes('--dry');
if (!wanted.length) { console.error('usage: node tools/i18n-unshadow.mjs <line> [<line> …] [--dry]'); process.exit(2); }
const src = readFileSync(FILE, 'utf8');
const edits = []; let renamed = 0;
for (const m of src.matchAll(/^<script>\r?\n([\s\S]*?)^<\/script>/gm)) {
  let code = m[1]; if (code.length < 200) continue;
  const base = m.index + m[0].indexOf(m[1]), line0 = src.slice(0, m.index).split('\n').length;
  let ast;
  for (let tries = 0; ; tries++) {
    try { ast = babelParse(code, 'inline.js', false); break; } catch (e) {
      const dup = /Identifier '([\w$]+)' has already been declared/.exec(e.message);
      if (!dup || tries > 50 || e.pos == null || dup[1].length < 2) throw e;
      code = code.slice(0, e.pos) + '$' + code.slice(e.pos + 1);
    }
  }
  const seen = new Set();
  traverse(ast, {
    Scope(path) {
      const b = path.scope.getOwnBinding(NAME);
      if (!b || path.scope.block.type === 'Program' || seen.has(b)) return;
      seen.add(b);
      const blk = path.scope.block, l0 = line0 + blk.loc.start.line, l1 = line0 + blk.loc.end.line;
      if (!wanted.some((w) => w >= l0 && w <= l1)) return;
      let name = 'tv'; while (path.scope.hasBinding(name) || path.scope.hasGlobal(name) || new RegExp('\\b' + name + '\\b').test(code.slice(blk.start, blk.end))) name += 'v';
      const ids = [b.identifier];                                // the declaration, then every read and write of THIS binding
      path.traverse({ Identifier(q) { if (q.node.name === NAME && q.scope.getBinding(NAME) === b && (q.isReferencedIdentifier() || q.isBindingIdentifier())) ids.push(q.node); } });
      const uniq = [...new Map(ids.map((n) => [n.start, n])).values()];
      const shorthand = b.referencePaths.some((p) => p.parent.type === 'ObjectProperty' && p.parent.shorthand);
      if (shorthand) { console.log(`left alone: a shorthand { ${NAME} } use, declared at line ${line0 + b.identifier.loc.start.line}`); return; }
      uniq.forEach((n) => edits.push([base + n.start, base + n.end, name]));
      renamed++;
      console.log(`line ${line0 + b.identifier.loc.start.line}: local "${NAME}" -> "${name}" (${uniq.length} place(s), block ${l0}-${l1})`);
    },
  });
}
edits.sort((x, y) => y[0] - x[0]);
let out = src; for (const [a, b, r] of edits) { if (out.slice(a, b) !== NAME) throw new Error('position mismatch at ' + a); out = out.slice(0, a) + r + out.slice(b); }
console.log(`${renamed} local variable(s) renamed${dry ? ' (dry run)' : ''}`);
if (!dry) writeFileSync(FILE, out);
