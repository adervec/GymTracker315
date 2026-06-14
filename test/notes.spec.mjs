// feat 122 — session notes: the Location field suggests your saved gyms (datalist), and the Injuries
// field autocompletes common lifting niggles as you type (multi-value, comma-separated).
import { test, expect } from '@playwright/test';

const APP = '/gym-tracker.html';

test.beforeEach(async ({ page }) => {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openNotesModal === 'function' && typeof window.renderInjurySuggest === 'function', null, { timeout: 15000 });
});

// feat 259 — location is no longer a freeform notes field; it is the gym (set on the Workout page). The notes
// modal shows it read-only and preserves it through a save; the subjective notes are supps/injuries/general.
test('feat 259 — location left the notes modal: shown read-only, preserved on save', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false;
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [], notes: { location: 'GoodLife Yonge' } }];
    openNotesModal(date);
    const hasLocInput = !!document.getElementById('trk-notes-location'); // the freeform field is gone
    const hint = document.querySelector('#trk-notes-body .notes-loc-hint')?.textContent || '';
    document.getElementById('trk-notes-supps').value = 'caffeine 200mg';
    saveNotes();
    const n = state.sessions[0].notes;
    return { hasLocInput, hint, location: n.location, supps: n.supps };
  });
  expect(r.hasLocInput).toBe(false);
  expect(r.hint).toContain('GoodLife Yonge'); // surfaced read-only
  expect(r.location).toBe('GoodLife Yonge');  // preserved across a notes save
  expect(r.supps).toBe('caffeine 200mg');
});

test('feat 259 — the history card shows the gym as a separate "Trained at" line, not inside Session Notes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const date = new Date().toISOString();
    const session = { id: 's', date, exercises: [], notes: { location: 'Iron Temple', supps: 'creatine' } };
    const card = renderNotesCard(session);
    return {
      hasGymLine: /session-gym-line/.test(card),
      trainedAt: /Trained at/.test(card),
      gymBeforeNotes: card.indexOf('session-gym-line') < card.indexOf('notes-card'),
      noLocationRowInNotes: !/notes-row-label">Location/.test(card),
    };
  });
  expect(r.hasGymLine).toBe(true);
  expect(r.trainedAt).toBe(true);
  expect(r.gymBeforeNotes).toBe(true);
  expect(r.noLocationRowInNotes).toBe(true);
});

test('Injuries autocompletes common niggles and appends on click (keeping prior entries)', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.gyms = [];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    const inj = document.getElementById('trk-notes-injuries');
    const box = document.getElementById('trk-notes-injury-suggest');

    inj.value = 'shoulder'; renderInjurySuggest();
    const chips1 = [...box.querySelectorAll('.injury-chip')].map(c => c.textContent);
    const first = box.querySelector('.injury-chip'); const firstText = first.textContent; first.click();
    const afterClick = inj.value;

    inj.value = 'knee pain, shoul'; renderInjurySuggest();
    const chips2 = [...box.querySelectorAll('.injury-chip')].map(c => c.textContent);
    return { chips1, firstText, afterClick, chips2 };
  });
  expect(r.chips1.length).toBeGreaterThan(0);
  expect(r.chips1.join(' ').toLowerCase()).toContain('shoulder');
  expect(r.afterClick).toBe(r.firstText + ', ');              // appended + comma, ready for the next
  expect(r.chips2.join(' ').toLowerCase()).toContain('shoulder'); // suggests for the new token, keeping "knee pain, "
});

test('no suggestions for an empty token', async ({ page }) => {
  const n = await page.evaluate(() => {
    state.readonly = false; state.gyms = [];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    const inj = document.getElementById('trk-notes-injuries');
    inj.value = 'knee pain, '; renderInjurySuggest(); // token after comma is empty
    return document.querySelectorAll('#trk-notes-injury-suggest .injury-chip').length;
  });
  expect(n).toBe(0);
});

// feat 256 — the full-screen notes modal must layer ABOVE the fixed top bar, otherwise the bar paints over its
// sticky header and clips the "Session Notes" title + Close (the bug report: "top of notes gets clipped").
test('the open notes modal sits above the top bar, so its header is never clipped', async ({ page }) => {
  const r = await page.evaluate(() => {
    state.readonly = false; state.gyms = [];
    const date = new Date().toISOString();
    state.sessions = [{ id: 's', date, exercises: [] }];
    openNotesModal(date);
    const modal = document.getElementById('trk-notes-modal');
    const topbar = document.getElementById('app-topbar');
    modal.style.transition = 'none';            // skip the 0.3s slide-up so geometry is settled
    modal.classList.add('open');
    void modal.offsetHeight;
    const modalZ = parseInt(getComputedStyle(modal).zIndex, 10);
    const topbarZ = parseInt(getComputedStyle(topbar).zIndex, 10);
    const hdr = modal.querySelector('.modal-header');
    const hr = hdr.getBoundingClientRect();
    // what actually paints at the header's centre — must be the modal's own header, not the top bar behind it
    const elAtHeader = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(hr.top + hr.height / 2));
    return { modalZ, topbarZ, headerTopmost: modal.contains(elAtHeader) };
  });
  expect(r.modalZ).toBeGreaterThan(r.topbarZ);  // overlay clears the bar (9999)
  expect(r.headerTopmost).toBe(true);           // …so the header is the element on top, not occluded
});
