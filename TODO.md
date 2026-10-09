# TODO

Open items, not yet scheduled. Shipped work is logged in `DESIGN.md` §3; the original
(now stale) backlog is `Fitness App Features.xls`.

## Bugs

- [ ] **Clicking around the Plan tab can still change the exercise and lose the current sets.**
  Reported 2026-10-09: *"I can sometimes still accidentally change the exercise and lose my
  current sets when clicking around the 'plan' tab."* Intermittent — the exact click path that
  triggers it is not pinned down yet, so **reproduce it first**.

  Lead (unverified): the feat-151 guard that warns before discarding work lives only in the
  **"Change exercise"** button handler (`gym-tracker.html:29162` — confirm when 2+ sets are
  entered and unsaved, fewer than 2 goes straight through). The Plan tab reaches the picker by a
  different route — `openStepPicker()` (`:26763`, feat 112) and the dashboard's "tap a step"
  handler (`:19019`) — and those paths appear not to run the same check, so selecting an exercise
  from a plan step may replace `pending` without ever asking. Worth auditing every plan-tab entry
  point that can set `pending.varUuid`, not just the one that reproduces.

  Also worth checking while in there:
  - the guard's threshold is 2+ sets — one unsaved set is discarded silently by design (feat 151);
    that may be too loose if a single set represents real work.
  - feat 107's "← Back to <exercise>" escape hatch and feat 494's `planStepFilter` clearing both
    touch the same flow; make sure a fix doesn't regress `test/changeexconfirm.spec.mjs`.

## Enhancements

- [ ] **Put more of the audio settings in the quick 🔊 menu, especially the spoken timers.**
  Requested 2026-10-09: *"want more complete control over more of the audio settings from the
  quick audio tab including the various spoken timers."*

  Today the quick menu (`toggleSoundMenu` → `renderSoundMenu`, `gym-tracker.html:30109`) is driven
  by `soundSources()`, which exposes exactly four rows — **Metronome · Rest cues · Spoken tips ·
  Button taps** — each as a 🔊/📳 chip pair under the master audio/haptics switch and volume. Every
  other audio control lives in the Settings drawer, so mid-workout tuning means leaving the screen.

  Candidates to surface, the spoken timers first (all already have state, so this is mostly new rows
  in `soundSources()` plus whatever doesn't fit the boolean-chip shape):
  - **Hold-timer voice** — `wc.holdVoiceStop`, `wc.holdVoiceWord`, `wc.holdVoiceBufferS`, and the
    accelerometer stop pair `wc.holdAccelStop` / `wc.holdAccelBufferS`.
  - **Set start / end callouts** — `state.annunciation.start` / `.end` with their `startLimit` /
    `endLimit` caps (`annunciationCfg()`, `:30214`; spoken by `annunceSetStart` `:30421` and
    `annunceSetEnd` `:30456`, both currently default **off**).
  - **Exercise voice** — `wc.exVoice`.
  - **Set-quality tone** — `wc.setQualityTone`.
  - **Rest timer itself** — `wc.restTimer`, and the adaptive rest cues.
  - **Voice choice + ducking** — `state.ttsVoice` (auto / system / explicit, feat 210) and
    `annunciation.duck` (feat 209).

  Design question worth settling before building: the menu is a compact popover anchored to the
  top-bar button, and several of these are numbers (buffer seconds, callout caps) or enums (voice),
  not 🔊/📳 booleans. Either grow the menu into a scrollable sheet with a few steppers/selects, or
  keep the chips and add a "more audio settings →" link that deep-links into the drawer section.
  Ask which before picking — the quick menu's whole point is staying small.

- [ ] **Split the exercises that conflate seated and standing into separate variations.**
  Requested 2026-10-09: *"some exercises are missing division into seated and standed variations
  such as arnold press. Assume the one I have already done is the EASIER one."*

  **Arnold Press** (`shoulder-press`) is the named example: one entry, no `subvariation`, so a
  seated Arnold and a standing Arnold share one progression line even though standing costs much
  more core and stability. 24 variations already put Seated/Standing in the **title**, and there is
  precedent for positional `subvariation`s ("Stance", "Bar Position", "Rack Position"), so first
  decide which shape to use, then sweep for the other offenders.

  **The history rule (from the request, applies to every split):** whatever already exists owns the
  logged sets, so the existing entry must become the **easier** variant and the **new** entry is the
  harder one. For pressing that means the current "Arnold Press" becomes the *seated* one (back
  supported) and *standing* is added alongside. Do not relabel the existing entry as the harder
  variant — that would silently credit standing work the user never did. Easier/harder is per
  movement, not a blanket "seated is easier": for a calf raise or a cable row, standing is the
  easier/looser one, so judge each case.

  Mechanics worth knowing before choosing:
  - `trackingKey(varUuid, subUuid)` (`:3535`) is `varUuid|subUuid`, falling back to bare `varUuid`
    when there is no option. So adding a `subvariation` to an existing variation starts a **new**
    tracking line per option while old sets keep the bare-uuid key — the history does not
    automatically land under the default option. Check how that reads in Trends/history before
    committing to the subvariation shape; a second variation with its own uuid may be cleaner, and
    it also gets its own motion figure and cross-links.
  - Whichever shape wins, the existing uuid must survive untouched (old sessions resolve through it),
    and anything new needs the usual: reference entry, `FAMILY_MOTION`/`MOTION_VARS` coverage, and a
    cross-link pass per feat 497 if it is a base pattern on different support.

- [ ] **Timer functions appeared to stop working ~2.5 h into a workout (seen once).**
  Reported 2026-10-09: *"timer functions appeared to stop working about 2.5h into a workout one
  time."* One occurrence, no repro, and "timer functions" is not pinned to a specific timer yet —
  next time it happens, note **which** timer froze (rest countdown, hold timer, workout clock,
  metronome, live score) and whether the app had been backgrounded or the screen locked.

  Leads, none verified:
  1. **The session auto-ended and nothing said so.** `shouldAutoEnd()` (`:19623`) ends a session
     after `wc.autoEndMinutes` (**default 40**) of inactivity *since the last set*, not after a
     total duration. A single long rest — a phone call, a chat, waiting for a rack — crosses 40 min
     and stamps `endedAt`, after which the workout's timers legitimately stop. Over a 2.5 h session
     that is easy to hit by accident. Check whether an auto-end is visible enough when it happens,
     and whether 40 min is right for long sessions.
  2. **A throttled interval never got revived.** There are 13 `setInterval` sites, but only the rest
     tick has a recovery path: feat 248's `visibilitychange` handler (`:29938`) calls
     `ensureRestTick()` / `restTick()`, and `ensureRestTick` (`:31471`) is the only `ensure*Tick`
     helper that exists. Mobile browsers freeze or kill intervals while hidden, so any other timer
     that was ticking when the tab went hidden may simply never come back. Audit the other twelve
     for a revive-on-visible path.
  3. **Wake lock dropped and the page was reclaimed.** Wake locks release when the tab hides
     (`:19707`) and are re-acquired on visible; if Android/iOS discarded and restored the page the
     DOM can come back while the timers behind it do not.

  Diagnostics to add if it stays unreproducible: `logInfo` already exists (`:3588`) — have the
  workout clock log a heartbeat and log every auto-end with the idle minutes that triggered it, so
  the next occurrence leaves a trail instead of a guess.

- [ ] **Mark time-based holds in the picker with an icon, and make mode a filterable criterion.**
  Requested 2026-10-09: *"exercise picker should indicate which exercises are time-based holds with
  some sort of icon and this should be a filterable criteria."*

  Both halves ride on `exMode(varUuid)` (`:13908`), which already classifies every variation from
  its title into four modes — **`time`** (hang / hold / plank / L-sit / wall sit / isometric),
  `distance` (carries, sled, yoke), `bodyweight` (pull-up, dip, push-up, pistol, nordic) and
  `standard` (reps). Nothing in the picker surfaces that today: you only discover an exercise is a
  hold when the sets form opens with a **Time** field instead of Reps.

  - **Icon:** add a mode badge to the picker row's right-hand cluster, which already stacks
    `lastDoneBadge` · fav star · `spotterBadge` · `vulnerableBadge` · `pickerTrendBadge` ·
    `touchBadgeHtml` (built at `:27485` for primary rows and `:27494` for cross-linked ones — both
    need it). ⏱ for `time` is the ask; consider whether `distance` (📏) and `bodyweight` earn one
    too, or whether badging everything just adds noise — `standard` should certainly stay bare.
  - **Filter:** a new `PICKER_CYCLES` entry is the whole job (`:30109`-ish region, same pattern as
    feat 498's `🗓 Recent?`): `modalState.pickerMode` with states
    `all → ⏱ Holds → 📏 Distance → 💪 Bodyweight → reps-only`, plus one check in
    `filterVariations()` applied to both the primary and secondary loops. Default off like its
    siblings.

  Note `exMode` is a title regex with no per-variation override, so the badge inherits any
  misclassification — feat 495 deliberately named "Sorensen Hold" to land in time mode. If the icon
  makes a wrong mode visible, that is the regex to fix (or the point at which an explicit per-variation
  mode field starts earning its keep), not the badge.
