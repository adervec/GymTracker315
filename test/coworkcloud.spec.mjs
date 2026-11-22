// feat 589 — cowork through the reader's cloud (house standard 3, cowork protocol v5). Requests, instructions and
// replies are files in the reader's private cloud folder (`cowork-gymtracker--a--b.json`); the AI runner answers
// there; any device can take a reply, and `applied.json` keeps a reply taken on one device from being taken on another.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/gym-tracker.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkCloudName === 'function' && typeof coworkPollAll === 'function' && VAR_INDEX.size > 0, null, { timeout: 15000 });
  // an in-memory cloud with appFont.cloud's shape: write / read / readBytes / list / remove / signedIn / signIn / label
  await page.evaluate(() => {
    const files = new Map(); let signed = true, writes = 0;
    window._cloud = { files, get writes() { return writes; }, set signed(v) { signed = v; } };
    const C = {
      label: () => 'Google Drive', signedIn: () => signed, signIn: async () => { signed = true; },
      write: async (name, body) => { writes++; files.set(name, String(body)); },
      read: async (name) => files.has(name) ? files.get(name) : null,
      readBytes: async (e) => new TextEncoder().encode(files.get(e.name || e)).buffer,
      list: async (prefix) => [...files.keys()].filter(n => n.indexOf(prefix) === 0).map(n => ({ id: n, name: n, size: files.get(n).length })),
      remove: async (name) => files.delete(name),
    };
    coworkCloud = () => C;
    normalizeState();
    state.cowork.enabled = true; state.cowork.minExportGapSec = 0;
    state.coworkLocal.history = []; state.coworkLocal.written = {}; state.coworkLocal.processed = {};
  });
});

test('feat 589 — sending writes the manifest, every channel and the brief into the cloud, and only what changed', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const ok = await coworkExportNow(true);
    const names = [..._cloud.files.keys()].sort(), first = _cloud.writes;
    const man = JSON.parse(_cloud.files.get('cowork-gymtracker--cowork.json'));
    const again = await coworkExportNow(true), second = _cloud.writes - first;      // nothing changed: nothing rewritten
    const last = coworkRuns('push')[0].note;
    return { ok, again, second, last, man, names,
      everyRequest: man.channels.every(ch => ch.request.every(p => _cloud.files.has(coworkCloudName(p))) && _cloud.files.has(coworkCloudName(ch.instructions))) };
  });
  expect(r.ok).toBe(true);
  expect(r.names).toEqual(expect.arrayContaining(['cowork-gymtracker--cowork.json', 'cowork-gymtracker--BRIEF.md', 'cowork-gymtracker--brief.json', 'cowork-gymtracker--app-export.json',
    'cowork-gymtracker--analysis--context.json', 'cowork-gymtracker--analysis--INSTRUCTIONS.md', 'cowork-gymtracker--plan-of-the-day--options.json']));
  expect(r.names.every(n => n.indexOf('cowork-gymtracker--') === 0)).toBe(true);
  expect(r.everyRequest, 'the runner finds every file the manifest names').toBe(true);
  expect(r.man.channels.find(c => c.name === 'analysis').request).toEqual(['analysis/context.json', 'app-export.json']);   // the raw data travels with the analysis request
  expect(r.again).toBe(true);
  expect(r.second).toBe(0);
  expect(r.last).toMatch(/nothing had changed/);
});

test('feat 589 — a reply is taken, archived to processed, recorded in applied.json, and never taken twice', async ({ page }) => {
  const r = await page.evaluate(async () => {
    state.coworkReview = { analysis: false };                                 // apply as it arrives, to see the effect
    state.analysisRequests = [{ id: 'q1', q: 'How is my bench?', created: new Date().toISOString(), status: 'pending' }];
    await coworkExportNow(true);
    const reply = JSON.stringify(buildCoworkEnvelope('analysis-output', { answers: [{ id: 'q1', answer: 'Up 5% in a month.' }] }));
    const inbox = coworkCloudName('analysis/inbox/output-2026-11-22T0700.json');
    _cloud.files.set(inbox, reply);
    await coworkPollAll(false);
    const applied = JSON.parse(_cloud.files.get(coworkCloudName('applied.json')));
    const out = { answer: state.analysisRequests[0].answer, inInbox: _cloud.files.has(inbox), processed: _cloud.files.has(coworkCloudName('analysis/processed/output-2026-11-22T0700.json')),
      applied, hash: String(coworkHashText(reply)) };
    // the same reply turning up again (another device, a re-sync) is archived, not applied a second time
    state.analysisRequests[0].answer = 'changed by hand';
    _cloud.files.set(inbox, reply);
    await coworkPollAll(false);
    out.second = state.analysisRequests[0].answer; out.gone = !_cloud.files.has(inbox);
    // a reply another device already took (only in applied.json, not in this device's ledger) is left alone too
    const other = JSON.stringify(buildCoworkEnvelope('analysis-output', { answers: [{ id: 'q1', answer: 'from the phone' }] }));
    _cloud.files.set(coworkCloudName('applied.json'), JSON.stringify({ protocol: 'cowork-applied', protocolVersion: 1, applied: [String(coworkHashText(other))] }));
    _cloud.files.set(coworkCloudName('analysis/inbox/output-2026-11-22T0800.json'), other);
    await coworkPollAll(false);
    out.third = state.analysisRequests[0].answer;
    return out;
  });
  expect(r.answer).toBe('Up 5% in a month.');
  expect(r.inInbox).toBe(false);
  expect(r.processed).toBe(true);
  expect(r.applied).toEqual({ protocol: 'cowork-applied', protocolVersion: 1, applied: [r.hash] });
  expect(r.second).toBe('changed by hand');
  expect(r.gone).toBe(true);
  expect(r.third).toBe('changed by hand');
});

test('feat 589 — an error reply shows its reason; signed out, a scheduled run waits and a tap signs in', async ({ page }) => {
  const r = await page.evaluate(async () => {
    await coworkExportNow(true);
    _cloud.files.set(coworkCloudName('log-review/inbox/error-2026-11-22T0700.json'), JSON.stringify({ reason: 'the request is too large for the runner' }));
    await coworkPollAll(false);
    const err = coworkRuns('check').find(x => /agent reported/.test(x.note || ''));
    _cloud.signed = false;
    const before = _cloud.writes;
    const auto = await coworkExportNow(true);
    const skipped = coworkRuns('push')[0].note, wroteWhileOut = _cloud.writes - before;
    const tapped = await coworkExportNow(false);                               // a tap may sign in
    return { err: err && err.note, auto, skipped, wroteWhileOut, tapped, label: coworkPanelData().folder };
  });
  expect(r.err).toBe('agent reported: the request is too large for the runner');
  expect(r.auto).toBe(false);
  expect(r.skipped).toMatch(/not signed in to your cloud/);
  expect(r.wroteWhileOut).toBe(0);
  expect(r.tapped).toBe(true);
  expect(r.label).toBe('Google Drive');
});

test('feat 589 — cowork settings appear on any device, with no folder to choose', async ({ page }) => {
  await page.evaluate(() => { state.aiExport = { ...(state.aiExport || {}), enabled: false }; navTo('set-cowork'); });
  await page.waitForSelector('#trk-main .drawer-section[data-sec="ai-cowork"]', { state: 'attached' });
  const r = await page.evaluate(() => {
    const txt = document.querySelector('#trk-main .drawer-section[data-sec="ai-cowork"]').textContent;
    const out = { runner: /AI runner/.test(txt), folder: /folder above|AI export folder|Chrome\/Edge/i.test(txt), send: !!document.querySelector('#cowork-write-now'), toggle: !!document.querySelector('[data-cowork="on"]') };
    return out;
  });
  expect(r).toEqual({ runner: true, folder: false, send: true, toggle: true });
});
