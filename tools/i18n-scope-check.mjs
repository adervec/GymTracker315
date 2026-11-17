// i18n-scope-check: proves with a real parser that every translator call in gym-tracker.html — a call to the
// global function, plain or its .n plural form — resolves to the GLOBAL translator and never to a local variable
// of the same one-letter name (a toast element, a time, a map parameter). A shadowed call would throw in every
// language, English included. Uses the Babel parser that ships inside Playwright, so there is nothing to install.
//   node tools/i18n-scope-check.mjs        exit 1 and the lines, if any call is shadowed
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { babelParse, traverse } = createRequire(import.meta.url)('playwright/lib/transform/babelBundle');
const NAME = 't';
const src = readFileSync(process.argv[2] || 'gym-tracker.html', 'utf8');
let bad = 0, calls = 0, scripts = 0;
// the app's own inline scripts: a <script> at the start of a line (the embedded font.js has its own private t)
for (const m of src.matchAll(/^<script>\r?\n([\s\S]*?)^<\/script>/gm)) {       // closed at a line start: a "</script>" inside a string is not the end
  let code = m[1]; if (code.length < 200) continue;
  const line0 = src.slice(0, m.index).split('\n').length;
  scripts++;
  let ast;
  for (let tries = 0; ; tries++) {
    try { ast = babelParse(code, 'inline.js', false); break; } catch (e) {
      // a browser lets a script declare the same function twice (the later one wins); Babel does not. Rename the
      // repeat in this in-memory copy only (same length, so every position stays true) and try again.
      const dup = /Identifier '([\w$]+)' has already been declared/.exec(e.message);
      if (!dup || tries > 50 || e.pos == null || dup[1].length < 2 || dup[1] === NAME) throw e;
      code = code.slice(0, e.pos) + '$' + code.slice(e.pos + 1);
    }
  }
  traverse(ast, {
    CallExpression(path) {
      const c = path.node.callee;
      const id = c.type === 'Identifier' ? c : (c.type === 'MemberExpression' && c.object.type === 'Identifier' && !c.computed && c.property.name === 'n' ? c.object : null);
      if (!id || id.name !== NAME) return;
      const arg = path.node.arguments[0];
      if (!arg || (arg.type !== 'StringLiteral' && arg.type !== 'TemplateLiteral')) return;   // a phrase call, not some other function
      calls++;
      const b = path.scope.getBinding(NAME);
      if (b && b.scope.block.type !== 'Program') { bad++; console.log(`shadowed at line ${line0 + path.node.loc.start.line}: the local "${NAME}" declared at line ${line0 + b.identifier.loc.start.line}`); }
    },
  });
}
console.log(bad ? `${bad} of ${calls} call(s) are shadowed` : `✓ all ${calls} translator calls in ${scripts} scripts resolve to the global function`);
process.exit(bad ? 1 : 0);
