// feat 361 — requested additions via EXTRA_VARIATIONS (each lands in both the loggable FAMILIES and the reference docs):
//  • the full set of rotating push-up handle ("Perfect Pushup") uses → flat-bench-press (bodyweight mode)
//  • the mace's NON-rotational strength work (curls/extensions/push-up) → mace-club-work
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

const VARS = [
  // Perfect Pushup rotating handles — bodyweight (the title carries "push-up")
  { uuid: 'b6a1ac4f-d90b-4404-a0d5-4128d68a9c49', fam: 'flat-bench-press', mode: 'bodyweight', re: /Rotating Push-Up \(Perfect Pushup\)/ },
  { uuid: '2d331c75-62b1-433e-a30a-e99f167fa19d', fam: 'flat-bench-press', mode: 'bodyweight', re: /Wide Rotating Push-Up \(Perfect Pushup\)/ },
  { uuid: '5f3eef3b-6673-4fa7-b2c1-5f174aaa28a1', fam: 'flat-bench-press', mode: 'bodyweight', re: /Close Rotating Push-Up \(Perfect Pushup\)/ },
  { uuid: '42398147-e5bd-4d3b-976d-c28705801226', fam: 'flat-bench-press', mode: 'bodyweight', re: /Deep Rotating Push-Up \(Perfect Pushup\)/ },
  // Mace non-rotational — loaded reps (standard), except the grip push-up (bodyweight)
  { uuid: '6e360bd9-e2d0-468f-8fad-902b8815ef17', fam: 'mace-club-work', mode: 'standard',   re: /^Mace Curl$/ },
  { uuid: '40a7940d-1dce-43a1-98f2-f3648534bc87', fam: 'mace-club-work', mode: 'standard',   re: /Mace Reverse Curl/ },
  { uuid: 'a4b1a516-3193-4f1e-8ff6-e894c56f8d9a', fam: 'mace-club-work', mode: 'standard',   re: /Mace Hammer Curl/ },
  { uuid: 'a953c1d3-5851-40e9-adce-045af8b72a8c', fam: 'mace-club-work', mode: 'standard',   re: /Mace Ballistic Curl/ },
  { uuid: '040be35a-f13f-4f23-87d6-bbd935c8e5de', fam: 'mace-club-work', mode: 'standard',   re: /Mace Triceps Extension/ },
  { uuid: 'b2f8948e-8517-4b87-b6fd-ae035486bbeb', fam: 'mace-club-work', mode: 'bodyweight', re: /Mace-Grip Push-Up/ },
  // feat 362 — missing canonical isometrics; all auto-resolve to TIME mode via a hold/hang/plank keyword
  { uuid: '840bc157-da9a-4d40-9761-7ca6dcbde055', fam: 'core-stability',  mode: 'time', re: /Reverse Plank Hold/ },
  { uuid: 'aaa48013-5d75-4072-8aaa-6c92061498bd', fam: 'core-stability',  mode: 'time', re: /Bear Plank Hold/ },
  { uuid: '5f824e49-918b-4c75-8d5b-6f58c37c83bc', fam: 'gymnastics-core', mode: 'time', re: /Wall Handstand Hold/ },
  { uuid: 'b70f4c1e-b697-41b7-87f6-e8d9820d1ea4', fam: 'gymnastics-core', mode: 'time', re: /Support Hold \(Parallettes \/ Dip Bars\)/ },
  { uuid: '6ec110ab-4d1e-4e67-a609-0e47eb354783', fam: 'pull-up',         mode: 'time', re: /Flexed-Arm Hang \(Chin-Up Hold\)/ },
];

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof VAR_INDEX !== 'undefined' && typeof varVisibleInPicker === 'function'
    && typeof exMode === 'function' && typeof exercises !== 'undefined', null, { timeout: 15000 });
});

test('each new variation is loggable in the right family, in the right mode, and present in the reference docs', async ({ page }) => {
  const r = await page.evaluate((VARS) => VARS.map(x => {
    const info = VAR_INDEX.get(x.uuid);
    const exFam = exercises.find(e => e.id === x.fam);
    return {
      found: !!info,
      fam: info && info.family.id,
      title: info && info.variation.title,
      visible: info && varVisibleInPicker(info.family, info.variation),
      mode: info && exMode(x.uuid).mode,
      inDocs: !!(exFam && (exFam.variations || []).some(v => v.uuid === x.uuid)),
    };
  }), VARS);
  r.forEach((x, i) => {
    expect(x.found, `${VARS[i].uuid} missing`).toBe(true);
    expect(x.fam).toBe(VARS[i].fam);
    expect(x.title).toMatch(VARS[i].re);
    expect(x.visible).toBe(true);
    expect(x.mode, `${VARS[i].uuid} mode`).toBe(VARS[i].mode);
    expect(x.inDocs, `${VARS[i].uuid} not in reference`).toBe(true);
  });
});

test('the new variations are findable by search (contiguous-substring queries)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const search = (q) => {
      modalState.pickerSearch = q; modalState.planStepFilter = null;
      const titles = [];
      filterVariations().forEach(g => { (g.variations || []).forEach(v => titles.push(v.title)); (g.secondaryVars || []).forEach(s => titles.push(s.v.title)); });
      return titles;
    };
    return {
      perfect: search('perfect pushup'),
      maceCurl: search('mace curl'),
      maceTri: search('mace triceps'),
      macePush: search('mace-grip push'),
      handstand: search('handstand'),
      reversePlank: search('reverse plank'),
      flexedHang: search('flexed-arm'),
    };
  });
  expect(r.perfect.filter(t => /Perfect Pushup/.test(t)).length).toBeGreaterThanOrEqual(4); // all four handle uses
  expect(r.maceCurl.some(t => /^Mace Curl$/.test(t))).toBe(true);
  expect(r.maceTri.some(t => /Mace Triceps Extension/.test(t))).toBe(true);
  expect(r.macePush.some(t => /Mace-Grip Push-Up/.test(t))).toBe(true);
  expect(r.handstand.some(t => /Wall Handstand Hold/.test(t))).toBe(true);
  expect(r.reversePlank.some(t => /Reverse Plank Hold/.test(t))).toBe(true);
  expect(r.flexedHang.some(t => /Flexed-Arm Hang/.test(t))).toBe(true);
});
