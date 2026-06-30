// feat 316 — Cowork hub Phase 1: the pure export builders (app-export payload + vocab, per-channel
// INSTRUCTIONS.md + context, Plan-of-the-Day options file, README, injury taxonomy). I/O is desktop-only and
// not unit-tested; these assert the content the agent relies on.
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof buildAppExportPayload === 'function' && typeof buildInstructionsMd === 'function'
    && typeof buildChannelContext === 'function' && typeof buildPodOptionsFile === 'function'
    && typeof applyPodOptionsFile === 'function' && typeof buildCoworkReadme === 'function'
    && typeof injuryOptionList === 'function', null, { timeout: 15000 });
});

test('buildAppExportPayload includes context + a vocab of real ids', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.plans = [];
    const p = buildAppExportPayload({ scope: 'last30' });
    return {
      keys: Object.keys(p),
      hasVocab: !!p.vocab,
      cardio: (p.vocab.cardioVariations || []).length,
      cardioAllUuid: (p.vocab.cardioVariations || []).every(v => typeof v.uuid === 'string' && v.uuid.length > 0),
      families: (p.vocab.movementFamilies || []).length,
      groups: (p.vocab.muscleGroups || []).length,
      hasInjuryRegions: !!(p.vocab.injuryRegions && p.vocab.injuryRegions.joints),
      deviceId: typeof p.deviceId,
    };
  });
  ['scope', 'sessions', 'plans', 'recovery', 'gym', 'podOptions', 'vocab', 'deviceId'].forEach(k => expect(r.keys).toContain(k));
  expect(r.hasVocab).toBe(true);
  expect(r.cardio).toBeGreaterThan(0);
  expect(r.cardioAllUuid).toBe(true);
  expect(r.families).toBeGreaterThan(50);
  expect(r.groups).toBe(10);
  expect(r.hasInjuryRegions).toBe(true);
  expect(r.deviceId).toBe('string');
});

test('INSTRUCTIONS.md documents the envelope, inbox drop, and channel-specific schema', async ({ page }) => {
  const r = await page.evaluate(() => ({
    garmin: buildInstructionsMd('garmin'), strava: buildInstructionsMd('strava'), pod: buildInstructionsMd('pod'),
  }));
  for (const md of [r.garmin, r.strava, r.pod]) {
    expect(md).toContain('gymtracker-cowork');
    expect(md).toContain('inbox/');
  }
  expect(r.garmin).toContain('garmin-output');
  expect(r.garmin).toContain('bodyComp');
  expect(r.strava).toContain('strava-output');
  expect(r.strava).toContain('activities');
  expect(r.pod).toContain('pod-output');
  expect(r.pod).toContain('familyId');
  expect(r.pod).toMatch(/vocab/i); // tells the agent to use real ids
});

test('buildChannelContext returns the right shape per channel', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.sessions = []; state.stravaActivities = [];
    return { garmin: Object.keys(buildChannelContext('garmin')), strava: Object.keys(buildChannelContext('strava')), pod: Object.keys(buildChannelContext('pod')) };
  });
  expect(r.garmin).toEqual(expect.arrayContaining(['recentBodyComp', 'sleepGaps']));
  expect(r.strava).toEqual(expect.arrayContaining(['activities', 'buckets']));
  expect(r.pod).toEqual(expect.arrayContaining(['recovery', 'options', 'recentMega']));
});

test('POD options file round-trips, README mentions the channels, injury list is faceted', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.podOptions = { notes: 'go heavy', injuries: ['joint:knee', 'pattern:overhead-press'], availableMinutes: { min: 45, max: 90 }, targetMode: 'recovered', targetGroups: [], fitnessFocus: 'balance' };
    const file = buildPodOptionsFile();
    state.podOptions = { notes: '', injuries: [], availableMinutes: 60, targetMode: 'recovered', targetGroups: [], fitnessFocus: 'balance' };
    const applied = applyPodOptionsFile(file.payload);
    const readme = buildCoworkReadme();
    const inj = injuryOptionList();
    return { kind: file.kind, notes: applied.notes, injuries: applied.injuries, minutes: applied.availableMinutes,
      readmeOk: /plan-of-the-day/.test(readme) && /strava-reconciliation/.test(readme),
      injCount: inj.length, facets: [...new Set(inj.map(i => i.facet))].sort(), sample: inj[0] };
  });
  expect(r.kind).toBe('pod-options');
  expect(r.notes).toBe('go heavy');
  expect(r.injuries).toEqual(['joint:knee', 'pattern:overhead-press']);
  expect(r.minutes).toEqual({ min: 45, max: 90 }); // feat 386 — time is a {min,max} range
  expect(r.readmeOk).toBe(true);
  expect(r.injCount).toBeGreaterThan(20);
  expect(r.facets).toEqual(['joint', 'pattern', 'region']);
  expect(r.sample).toHaveProperty('id');
  expect(r.sample).toHaveProperty('label');
});
