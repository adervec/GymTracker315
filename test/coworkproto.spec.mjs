// feat 458 — cowork hub brought up to the house protocol (CoworkSyncHub/COWORK-PROTOCOL.md) and to parity
// with Tachyread's cowork layer: a cowork.json discovery manifest, declared+echoed requestHash, agent error
// files (dead letters), a run history, permission-aware writes, a designated sync machine, and per-task
// schedules driving one scheduler tick.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildCoworkManifest === 'function' && typeof coworkDueTasks === 'function'
    && typeof parseCoworkErrorFile === 'function' && typeof coworkRole === 'function', null, { timeout: 15000 });
});

test('feat 458 — cowork.json is a valid cowork-manifest v1 and declares only files the exporter writes', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const man = buildCoworkManifest();
    // every path the manifest declares must be one the export actually produces
    const written = new Set(['cowork.json', 'README-COWORK.md', 'app-export.json']);
    for (const c of COWORK_CHANNELS) {
      written.add(c.dir + '/INSTRUCTIONS.md');
      written.add(c.dir + '/context.json');
    }
    written.add('plan-of-the-day/options.json');
    const dangling = [];
    for (const ch of man.channels) {
      (ch.request || []).forEach(p => { if (!written.has(p)) dangling.push(p); });
      if (ch.instructions && !written.has(ch.instructions)) dangling.push(ch.instructions);
    }
    return { man, dangling, dirs: COWORK_DIRS };
  });
  expect(r.man.protocol).toBe('cowork-manifest');
  expect(r.man.protocolVersion).toBe(1);
  expect(r.man.app).toBe('gymtracker');
  expect(r.man.channels.length).toBe(4);
  expect(r.dangling, 'the manifest must not declare a file the exporter never writes').toEqual([]);
  r.man.channels.forEach(ch => {
    expect(ch.name, 'name is required').toBeTruthy();
    expect(Array.isArray(ch.request) && ch.request.length, 'non-empty request is required').toBeTruthy();
    // exactly one of replyPath / replyDir
    expect(!!ch.replyDir !== !!ch.replyPath).toBe(true);
    expect(ch.replyPrefix).toBe('output-');
    expect(ch.replyProtocol).toBe('gymtracker-cowork');
    expect(ch.replyKind).toMatch(/-output$/);
    expect(ch.instructions).toBe(ch.name + '/INSTRUCTIONS.md');
  });
  // the plan-of-the-day channel carries its second request file
  const pod = r.man.channels.find(c => c.name === 'plan-of-the-day');
  expect(pod.request).toEqual(['plan-of-the-day/context.json', 'plan-of-the-day/options.json']);
});

test('feat 458 — every request declares a requestHash that round-trips and tracks the payload', async ({ page }) => {
  const r = await page.evaluate(() => {
    const a = buildCoworkEnvelope('context', { q: 1 });
    const b = buildCoworkEnvelope('context', { q: 1 });
    const c = buildCoworkEnvelope('context', { q: 2 });
    const parsed = parseCoworkEnvelope(JSON.stringify(a));
    const noHash = parseCoworkEnvelope(JSON.stringify({ protocol: 'gymtracker-cowork', protocolVersion: 1, kind: 'x', payload: {} }));
    return { a: a.requestHash, b: b.requestHash, c: c.requestHash, parsed, noHash };
  });
  expect(r.a).toBeTruthy();
  expect(r.b, 'the same payload hashes the same, so a re-export is not spuriously "new"').toBe(r.a);
  expect(r.c, 'a different payload hashes differently').not.toBe(r.a);
  expect(r.parsed.ok).toBe(true);
  expect(r.parsed.requestHash).toBe(r.a);
  expect(r.noHash.ok, 'a reply without the echo is still valid — the hash is advisory').toBe(true);
  expect(r.noHash.requestHash).toBeNull();
});

test('feat 458 — the instructions tell the agent to echo the hash and to write a dead letter on failure', async ({ page }) => {
  const r = await page.evaluate(() => {
    const md = COWORK_CHANNELS.map(c => buildInstructionsMd(c.key));
    return { echo: md.every(m => /requestHash/.test(m) && /verbatim/i.test(m)),
      dead: md.every(m => /error-<ISO-date>\.json/.test(m) && /"reason"/.test(m)),
      readme: buildCoworkReadme() };
  });
  expect(r.echo).toBe(true);
  expect(r.dead).toBe(true);
  expect(r.readme).toContain('cowork.json');
  expect(r.readme).toContain('requestHash');
  expect(r.readme).toContain('dead letter');
});

test('feat 458 — an agent error file is read as a dead letter, an envelope never is', async ({ page }) => {
  const r = await page.evaluate(() => ({
    reason: parseCoworkErrorFile('{"reason":"Garmin export was empty"}', 'error-2026-08-02.json'),
    altKey: parseCoworkErrorFile('{"error":"rate limited"}', 'error-x.json'),
    byName: parseCoworkErrorFile('{}', 'error-2026-08-02.json'),          // named error, no reason given
    envelope: parseCoworkErrorFile(JSON.stringify(buildCoworkEnvelope('context', {})), 'output-x.json'),
    plainJson: parseCoworkErrorFile('{"answers":[]}', 'output-x.json'),   // a bare payload is not a dead letter
    notJson: parseCoworkErrorFile('nope', 'error-x.json'),
    array: parseCoworkErrorFile('[1,2]', 'error-x.json'),
  }));
  expect(r.reason.reason).toBe('Garmin export was empty');
  expect(r.altKey.reason).toBe('rate limited');
  expect(r.byName.reason).toMatch(/no reason/);
  expect(r.envelope, 'a valid envelope must never be mistaken for a failure').toBeNull();
  expect(r.plainJson).toBeNull();
  expect(r.notJson).toBeNull();
  expect(r.array).toBeNull();
});

test('feat 458 — the run history records, caps, reads newest-first, and survives normalizeState', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.coworkLocal.history = [];
    coworkRecordRun({ kind: 'push', ok: true, note: 'first' });
    coworkRecordRun({ kind: 'check', channel: 'analysis', ok: false, note: 'agent reported: no data', auto: true });
    const newestFirst = coworkRuns().map(x => x.note);
    const onlyCheck = coworkRuns('check').length;
    const last = coworkLastRun('push');
    for (let i = 0; i < COWORK_HISTORY_CAP + 40; i++) coworkRecordRun({ kind: 'push', note: 'n' + i });
    const capped = state.coworkLocal.history.length;
    const keptNewest = state.coworkLocal.history[capped - 1].note;
    normalizeState();
    return { newestFirst, onlyCheck, last, capped, keptNewest, afterNormalize: state.coworkLocal.history.length,
      ago: [coworkFmtAgo(null), coworkFmtAgo('not a date'), coworkFmtAgo(new Date(Date.now() - 90e3).toISOString())] };
  });
  expect(r.newestFirst).toEqual(['agent reported: no data', 'first']);
  expect(r.onlyCheck).toBe(1);
  expect(r.last.note).toBe('first');
  expect(r.capped).toBe(200);
  expect(r.keptNewest, 'the cap drops the OLDEST rows').toBe('n' + (200 + 40 - 1));
  expect(r.afterNormalize).toBe(200);
  expect(r.ago).toEqual(['never', 'never', '2m ago']);
});

test('feat 458 — the designated sync machine gates every automatic run', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.deviceId = 'me';
    state.cowork.machine = null;
    const open = { role: coworkRole(state, 'me'), auto: coworkAutoAllowed() };
    state.cowork.machine = { deviceId: 'me', name: 'Windows · Chrome', at: new Date().toISOString() };
    const mine = { role: coworkRole(state, 'me'), auto: coworkAutoAllowed() };
    state.cowork.machine = { deviceId: 'other', name: 'Mac · Chrome', at: new Date().toISOString() };
    const theirs = { role: coworkRole(state, 'me'), auto: coworkAutoAllowed() };
    // a malformed designation must not lock every device out
    state.cowork.machine = { name: 'junk' }; normalizeState();
    const junk = { machine: state.cowork.machine, role: coworkRole(state, 'me'), auto: coworkAutoAllowed() };
    return { open, mine, theirs, junk, name: coworkThisDeviceName() };
  });
  expect(r.open).toEqual({ role: 'open', auto: true });          // nobody designated → unchanged behaviour
  expect(r.mine).toEqual({ role: 'machine', auto: true });
  expect(r.theirs).toEqual({ role: 'viewer', auto: false });
  expect(r.junk.machine, 'a designation with no deviceId is dropped').toBeNull();
  expect(r.junk.auto, 'and never strands a device as a permanent viewer').toBe(true);
  expect(r.name).toMatch(/·/);
});

test('feat 458 — schedules: due maths, catalog order, and the pollMinutes migration', async ({ page }) => {
  const r = await page.evaluate(() => {
    const now = Date.parse('2026-08-02T12:00:00Z');
    const hourAgo = new Date(now - 3600e3 - 1000).toISOString();
    const minAgo = new Date(now - 60e3).toISOString();
    const out = {
      manual: coworkNextDueAt('off', 0),
      neverRun: coworkDueTasks({ push: 'hourly', check: '5m' }, {}, now),          // never run → due at once
      order: coworkDueTasks({ push: 'daily', check: 'daily' }, {}, now),           // stable catalog order
      onlyPush: coworkDueTasks({ push: 'hourly', check: '30m' }, { push: hourAgo, check: minAgo }, now),
      none: coworkDueTasks({ push: 'hourly', check: '30m' }, { push: minAgo, check: minAgo }, now),
      offNeverDue: coworkDueTasks({ push: 'off', check: 'off' }, {}, now),
      badId: coworkDueTasks({ push: 'nonsense' }, {}, now),                        // unknown id falls back to the default
    };
    // migration: an old state carrying only pollMinutes gets a matching (never faster) check cadence
    const mig = (mins) => { state.cowork = { enabled: true, pollMinutes: mins, minExportGapSec: 120, podKeepDays: 7 }; normalizeState(); return state.cowork.schedules.check; };
    out.mig5 = mig(5); out.mig10 = mig(10); out.mig45 = mig(45); out.mig60 = mig(60);
    out.pushDefault = state.cowork.schedules.push;
    return out;
  });
  expect(r.manual, 'manual is never due').toBeNull();
  expect(r.neverRun).toEqual(['push', 'check']);
  expect(r.order, 'push runs before check, so a reply is read against the request it answered').toEqual(['push', 'check']);
  expect(r.onlyPush).toEqual(['push']);
  expect(r.none).toEqual([]);
  expect(r.offNeverDue).toEqual([]);
  expect(r.badId).toEqual(['push', 'check']);
  expect(r.mig5).toBe('5m');
  expect(r.mig10).toBe('15m');       // rounds UP — never polls more often than asked
  expect(r.mig45).toBe('hourly');
  expect(r.mig60).toBe('hourly');
  expect(r.pushDefault).toBe('hourly');
});

test('feat 458 — the scheduler tick only fires on an allowed device and stamps each task it ran', async ({ page }) => {
  const r = await page.evaluate(async () => {
    normalizeState();
    state.deviceId = 'me'; state.cowork.enabled = true;
    state.cowork.schedules = { push: 'hourly', check: '5m' };
    state.coworkLocal.lastRuns = {}; state.coworkLocal.history = [];
    // a viewer device never runs, whatever is due
    state.cowork.machine = { deviceId: 'other', name: 'Mac', at: new Date().toISOString() };
    const viewer = await coworkSchedulerTick();
    // disabled hub never runs either
    state.cowork.machine = null; state.cowork.enabled = false;
    const off = await coworkSchedulerTick();
    // enabled + allowed → both due tasks fire and are stamped, and each records a run
    state.cowork.enabled = true;
    const ran = await coworkSchedulerTick();
    const stamped = Object.keys(state.coworkLocal.lastRuns).sort();
    const again = await coworkSchedulerTick();          // immediately after → nothing is due
    return { viewer, off, ran, stamped, again, notes: coworkRuns().map(x => x.note) };
  });
  expect(r.viewer, 'a viewer device never touches the folder').toEqual([]);
  expect(r.off, 'a disabled hub never runs').toEqual([]);
  expect(r.ran).toEqual(['push', 'check']);
  expect(r.stamped).toEqual(['check', 'push']);
  expect(r.again, 'stamping happens before the run, so a throwing task still waits its interval').toEqual([]);
  // with no folder handle in a test browser both tasks record a skip — the point is that they RECORD
  expect(r.notes.length).toBeGreaterThanOrEqual(2);
  expect(r.notes.every(n => /skipped|failed|wrote|imported/.test(n))).toBe(true);
});

test('feat 458 — the settings page shows the role, both cadences and the run log', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    state.aiExport.enabled = true; state.cowork.enabled = true;
    state.coworkLocal.history = [];
    coworkRecordRun({ kind: 'check', channel: 'analysis', ok: false, note: 'agent reported: no data' });
    renderSettingsDrawer();
    const body = document.getElementById('settings-drawer-body');
    const html = body.innerHTML;
    const scheds = [...body.querySelectorAll('[data-cowork-sched]')].map(s => s.dataset.coworkSched);
    // claiming the machine flips the role line and is persisted
    body.querySelector('#cowork-machine-claim').click();
    const claimed = { machine: state.cowork.machine && state.cowork.machine.deviceId,
      html: document.getElementById('settings-drawer-body').innerHTML };
    document.getElementById('settings-drawer-body').querySelector('#cowork-machine-clear').click();
    return { hasStatus: html.includes('cowork-status'), scheds,
      showsFailure: html.includes('agent reported: no data'), failClass: /cowork-run bad/.test(html),
      openRole: /cowork-role open/.test(html),
      claimedRole: /cowork-role machine/.test(claimed.html), claimedId: claimed.machine,
      released: state.cowork.machine, inKeys: SETTINGS_KEYS.includes('cowork'),
      localNotSynced: NEVER_SYNC_EXTRA.includes('coworkLocal') };
  });
  expect(r.hasStatus).toBe(true);
  expect(r.scheds).toEqual(['push', 'check']);
  expect(r.showsFailure, 'a failed run must be visible, not just logged').toBe(true);
  expect(r.failClass).toBe(true);
  expect(r.openRole).toBe(true);
  expect(r.claimedRole).toBe(true);
  expect(r.claimedId).toBeTruthy();
  expect(r.released).toBeNull();
  expect(r.inKeys, 'the designation syncs so other devices can see it').toBe(true);
  expect(r.localNotSynced, 'but the run history stays device-local').toBe(true);
});
