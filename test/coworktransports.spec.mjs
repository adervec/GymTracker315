// feat 459 — the rest of Tachyread's cowork parity: cloud sync folded into the scheduler + run history,
// per-channel enable/disable, a month activity calendar, and the DIRECT API transport (user's own key,
// device-local, routed through the same importer the folder path uses).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof coworkCalendarCells === 'function' && typeof coworkAnalysisViaApi === 'function'
    && typeof coworkChannelOn === 'function', null, { timeout: 15000 });
});

test('feat 459 — cloud sync is a scheduled, recorded task and its old interval is retired', async ({ page }) => {
  const r = await page.evaluate(async () => {
    normalizeState();
    state.coworkLocal.history = [];
    const inTable = COWORK_TASKS.map(t => t.id);
    const noProvider = await coworkCloudSyncRun(true);        // nothing connected in a test browser
    const note = coworkLastRun('cloud');
    // the standalone timer is now a no-op teardown, not a second scheduler
    coworkCloudTimerStart();
    const migrated = state.cowork.schedules.cloud;
    return { inTable, noProvider, note, migrated };
  });
  expect(r.inTable).toEqual(['push', 'check', 'cloud', 'api']);
  expect(r.noProvider).toBe(false);
  expect(r.note.kind).toBe('cloud');
  expect(r.note.ok).toBe(false);
  expect(r.note.note, 'a skip says WHY').toMatch(/no cloud provider/);
  expect(r.migrated, 'inherits the old periodicMinutes cadence').toBe('30m');
});

test('feat 459 — a channel switched off is neither declared in the manifest nor polled', async ({ page }) => {
  const r = await page.evaluate(() => {
    normalizeState();
    const allOn = buildCoworkManifest().channels.map(c => c.name);
    const defaults = COWORK_CHANNELS.map(c => coworkChannelOn(c.key));
    state.cowork.channels.garmin = false;
    state.cowork.channels.strava = false;
    const some = buildCoworkManifest().channels.map(c => c.name);
    const active = coworkActiveChannels().map(c => c.key);
    // an older synced state with no `channels` key keeps every channel live
    delete state.cowork.channels; normalizeState();
    return { allOn, defaults, some, active, afterMigrate: COWORK_CHANNELS.map(c => coworkChannelOn(c.key)) };
  });
  expect(r.defaults, 'every channel is on by default').toEqual([true, true, true, true]);
  expect(r.allOn.length).toBe(4);
  expect(r.some).toEqual(['plan-of-the-day', 'analysis']);
  expect(r.active).toEqual(['pod', 'analysis']);
  expect(r.afterMigrate, 'an absent key reads as on, so existing folders keep working').toEqual([true, true, true, true]);
});

test('feat 459 — the activity calendar is a Monday-first 42-cell grid counting runs and failures', async ({ page }) => {
  const r = await page.evaluate(() => {
    // August 2026: the 1st is a Saturday, so a Monday-first grid leads with 5 out-of-month cells
    const hist = [
      { at: '2026-08-03T10:00:00Z', ok: true }, { at: '2026-08-03T11:00:00Z', ok: true },
      { at: '2026-08-04T10:00:00Z', ok: false },
      { at: '2026-07-30T10:00:00Z', ok: true },              // previous month — still rendered, marked out
      { at: 'not a date', ok: true },                         // junk is ignored, never throws
    ];
    const cells = coworkCalendarCells(2026, 7, hist);
    const byKey = Object.fromEntries(cells.map(c => [c.key, c]));
    return { len: cells.length, lead: cells.filter(c => !c.inMonth).length > 0,
      d3: byKey['2026-08-03'], d4: byKey['2026-08-04'], d5: byKey['2026-08-05'],
      prev: byKey['2026-07-30'], empty: coworkCalendarCells(2026, 7, []).every(c => c.count === 0) };
  });
  expect(r.len).toBe(42);
  expect(r.lead).toBe(true);
  expect(r.d3).toMatchObject({ day: 3, inMonth: true, count: 2, errs: 0 });
  expect(r.d4).toMatchObject({ day: 4, inMonth: true, count: 1, errs: 1 });
  expect(r.d5).toMatchObject({ day: 5, inMonth: true, count: 0, errs: 0 });
  expect(r.prev).toMatchObject({ inMonth: false, count: 1 });
  expect(r.empty).toBe(true);
});

test('feat 459 — the API key is device-local and the transport refuses to run without one', async ({ page }) => {
  const r = await page.evaluate(async () => {
    normalizeState();
    state.coworkLocal.history = [];
    const cfg = aiApiCfg();
    const beforeKey = { configured: aiApiConfigured(), model: cfg.model };
    const noKey = await coworkAnalysisViaApi(false);
    const noKeyNote = coworkLastRun('api');
    cfg.key = 'sk-ant-test';
    state.analysisRequests = [];                        // key present but nothing to ask
    const noReqs = await coworkAnalysisViaApi(false);
    const noReqNote = coworkLastRun('api');
    return { beforeKey, noKey, noKeyNote, noReqs, noReqNote,
      neverSynced: NEVER_SYNC_EXTRA.includes('aiApi'),
      notInSettings: !SETTINGS_KEYS.includes('aiApi'),
      models: AI_API_MODELS.map(m => m.id),
      payload: Object.keys(syncPayload()).includes('aiApi') };
  });
  expect(r.beforeKey.configured).toBe(false);
  expect(r.beforeKey.model).toBe('claude-sonnet-5');
  expect(r.noKey).toBe(false);
  expect(r.noKeyNote.note).toMatch(/no Anthropic API key/);
  expect(r.noReqs, 'nothing to answer is not a failure').toBe(true);
  expect(r.noReqNote.note).toMatch(/no open analysis requests/);
  expect(r.neverSynced, 'the key must never leave the device that entered it').toBe(true);
  expect(r.notInSettings).toBe(true);
  expect(r.payload, 'and must not appear in the cloud payload').toBe(false);
  expect(r.models).toContain('claude-opus-5');
});

test('feat 459 — a direct API answer lands through the SAME importer as a folder reply', async ({ page }) => {
  const r = await page.evaluate(async () => {
    normalizeState();
    state.coworkLocal.history = [];
    aiApiCfg().key = 'sk-ant-test';
    state.analysisRequests = [{ id: 'q1', q: 'Are my squats progressing?', created: '2026-08-01T00:00:00Z', status: 'pending', updatedAt: '2026-08-01T00:00:00Z' }];
    // stub the network at the fetch boundary — everything above it is the real code path
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ model: 'claude-sonnet-5', usage: { input_tokens: 1200, output_tokens: 300 },
        content: [{ type: 'text', text: '```json\n{"answers":[{"id":"q1","answer":"Yes — up 7.5kg over 30 days."}]}\n```' }] }) };
    };
    const ok = await coworkAnalysisViaApi(false);
    const req = state.analysisRequests[0];
    const run = coworkLastRun('api');
    return { ok, req, run, call: calls[0], usage: aiApiCfg().lastUsage };
  });
  expect(r.ok).toBe(true);
  expect(r.req.status, 'the request is answered exactly as a folder reply would answer it').toBe('answered');
  expect(r.req.answer).toContain('7.5kg');
  expect(r.req.answeredAt).toBeTruthy();
  expect(r.call.url).toBe('https://api.anthropic.com/v1/messages');
  expect(r.call.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(r.call.headers['x-api-key']).toBe('sk-ant-test');
  expect(r.call.body.model).toBe('claude-sonnet-5');
  expect(JSON.stringify(r.call.body), 'the open request travels with the call').toContain('Are my squats progressing?');
  expect(r.usage).toMatchObject({ inTok: 1200, outTok: 300 });
  expect(r.run.note).toMatch(/answered 1 request/);
  expect(r.run.note).toMatch(/1200 in \/ 300 out/);
});

test('feat 459 — an API failure is recorded, not thrown, and answers nothing', async ({ page }) => {
  const r = await page.evaluate(async () => {
    normalizeState();
    state.coworkLocal.history = [];
    aiApiCfg().key = 'sk-ant-bad';
    state.analysisRequests = [{ id: 'q1', q: 'q', created: '2026-08-01T00:00:00Z', status: 'pending', updatedAt: '2026-08-01T00:00:00Z' }];
    window.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'nope' } }) });
    const bad = await coworkAnalysisViaApi(true);
    const badNote = coworkLastRun('api');
    // and a reply that isn't JSON is a failure too, not a crash
    window.fetch = async () => ({ ok: true, json: async () => ({ usage: {}, content: [{ type: 'text', text: 'sorry, no' }] }) });
    const junk = await coworkAnalysisViaApi(true);
    const junkNote = coworkLastRun('api');
    return { bad, badNote, junk, junkNote, status: state.analysisRequests[0].status };
  });
  expect(r.bad).toBe(false);
  expect(r.badNote.note).toMatch(/Invalid Anthropic API key/);
  expect(r.junk).toBe(false);
  expect(r.junkNote.note).toMatch(/API call failed/);
  expect(r.status, 'a failed call must not mark the request answered').toBe('pending');
});
