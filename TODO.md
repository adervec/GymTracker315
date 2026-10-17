# TODO

Open items, not yet scheduled. Shipped work is logged in `DESIGN.md` §3; the original
(now stale) backlog is `Fitness App Features.xls`.

## Bugs

- [x] **Clicking around the Plan tab can still change the exercise and lose the current sets.** — fixed in **feat 499**: one `guardPendingDiscard` helper applied at the destruction points (plan-option chips, `editExisting`, the Change-exercise button). The lead below was correct.
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

- [x] **Put more of the audio settings in the quick 🔊 menu, especially the spoken timers.** — shipped as **feat 505**: six new boolean rows (hold-timer voice, set start/end calls, exercise voice, quality tone, rest timer); the numeric fields and voice picker stay in the drawer, whose link now lands on the audio section.
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

- [~] **Timer functions appeared to stop working ~2.5 h into a workout (seen once).** — **feat 506** added the diagnostics rather than a fix, since there is still no repro: a 10-minute heartbeat on the render path (so a freeze is bounded by its last entry) and a visible, logged auto-end carrying the idle minutes. **Next occurrence: export the log from the Data page** — it will show either an auto-end with its idle minutes, or heartbeats stopping at the freeze. Lead 2 below (twelve `setInterval` sites with no revive-on-visible path) is still open and unproven.
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

- [x] **Mark time-based holds in the picker with an icon, and make mode a filterable criterion.** — shipped as **feat 502**: ⏱/📏 badges on the rows, and a `⏱ How logged?` pill covering all four modes.
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

- [x] **Target buttons should advance to the next target instead of just going green, with a session
  streak counter — and PRs must stay un-juiceable.** — shipped as **feat 504**: green border, per-tile ladders (reps axis, weight axis for Max wt), corner streak past one, PR badge capped at one per tile, everything derived so a deleted set rolls it all back. feat 478's auto-collapse kept, with hit-once as satisfied.
  Requested 2026-10-09: *"currently after hitting the target for a given button it fills in green and
  a record is counted. I would rather it show a green border and then update to the next target for
  that particular button counting what I just did today; and in the corner of the button show the #
  of times it has been hit this session successively if >1. However the # of PRs hit this exercise
  should only count the first one; that number can't be juiced by milking one easy button. Also this
  needs to handle if accidentally enter something big then delete it."*

  Four changes to the feat-494 targets block (`exBestSets` `:28374`, `exPrTargets` `:28433`,
  `exTargetHit` `:28476`, `exSessionPrCount` `:28480`, `refreshTargetHits` `:28502`):

  1. **Green border, not a green fill.** `.target-btn.hit` (`:3159`) currently sets both
     `border-color` *and* a `rgba(63,185,80,0.13)` background — drop the background, keep the border.
  2. **Advance the target.** On a hit, recompute that button's ask from today's work: the tile that
     asked for 100×11 and got it should now ask 100×12 (and the Max-weight tile should step up
     another increment). Today each tile's value comes from the pre-session history only —
     `exWeightRows`/`exBestSets` deliberately *exclude* the pending sheet — so the advance means
     folding today's sets into that baseline per button.
  3. **Streak badge in the corner**, shown only when >1: how many times that button has been hit
     this session in a row.
  4. **PR count counts the first hit per button only.** `exSessionPrCount` (`:28480`) currently
     counts distinct *weights* whose e1RM beat the previous best at that weight. Once tiles advance,
     re-hitting the same advancing tile must not keep adding PRs — one PR per button per session.

  **The hard constraint, and it shapes the whole design:** *"handle if accidentally enter something
  big then delete it."* So nothing here may be an incrementing counter — the streak, the advanced
  target and the PR credit all have to be **derived from the session's current sets on every
  recompute**, the way `exTargetHit` already is. Enter 300 kg by mistake and the tile advances three
  rungs and shows a streak of 3; delete it and all of that must roll back to exactly where it was.
  Deriving it means that falls out for free, whereas a `streak++` on hit would strand a phantom.

  Two existing behaviours this collides with — settle both before building:
  - **feat 478 auto-collapse** closes the targets section the moment every target is hit
    (`_tgtHits === _tgtTotal`, `targetsAutoCollapse` `:28517`). If tiles always advance there is
    never an all-hit state, so the section would never auto-collapse again. Decide whether that
    feature retires, or whether "hit once" still counts as satisfied for collapse purposes.
  - **feat 482's DOM-only retint** (`refreshTargetHits` `:28502`) just toggles the `.hit` class and
    the counter from each tile's `data-w`/`data-r`. Advancing changes the tile's *label and its
    data attributes*, so this needs to rewrite the tile contents (or re-render the block) while
    keeping feat 482's promise that it updates immediately, not on the next full render.

  `test/beatrecords.spec.mjs` and `test/prtargets.spec.mjs` cover the current semantics and will
  both need reworking; the "milking one button" rule deserves a test of its own (hit the same tile
  three times → streak 3, PR count 1).

- [x] **On a plan step, a cross-linked exercise can be listed twice — as itself and as a cross-link.** — fixed in **feat 500**, which also collapsed a second case: an exercise cross-linked into two base families showed as two cross-link rows.
  Reported 2026-10-11: *"sometimes for a plan step I see 'crosslinked' exercises appear twice (as
  themselves and as a crosslink) - this is clutter."*

  Confirmed by reading `filterVariations()` (`:27176`). With a plan-step filter active, `stepSet`
  holds every uuid that satisfies the step — which by design includes the cross-linked ones — and
  then two separate passes each emit a row for the same uuid:
  - the **primary** pass keeps it under its own family, because it is in `stepSet` (`:27208`);
  - the **secondary** pass also emits it under the step's base family, with the "from <home
    movement>" label and jump link (`:27224`-`:27226`, feat 167).

  So a Back Extension step shows *Single-Leg Back Extension* once under **Roman Chair Work** and
  again as a cross-link under **Back Extension**. It happens when browsing unfiltered too, but there
  the two copies sit in far-apart family sections and read as intentional; a step filter shortens the
  list until they land next to each other and just look like a bug. Feat 497 took the table from 310
  to 478 links, which is almost certainly why this became noticeable now.

  Likely fix: when the primary row for a uuid is already in the result set, drop its secondary row —
  at minimum while `modalState.planStepFilter` is active, and possibly always, since the duplication
  is the same either way.

  **Do not dedupe blindly** — some variations appear *only* as a secondary row and would vanish:
  - feat 167's reconciled duplicates are suppressed in their home family (`isSuppressedVar`), so the
    cross-link row is the only way to reach them;
  - the home family may be filtered out by the mega/sub/equip pills or hidden by the active gym, so
    the primary row is absent even though the exercise is valid for the step.
  Condition the drop on the primary row actually being present in this result set, not on the mere
  existence of a primary family. `test/secondaryparents.spec.mjs` asserts the cross-link row renders
  with its jump link, and `test/crosslinks.spec.mjs` (feat 497) asserts cross-linked variations stay
  visible at home — keep both true.

- [x] **The "best path to e1RM" target can ask for absurd rep counts at a light weight.** — fixed in **feat 501**: candidates are gated by `E1_PATH_MAX_REPS = 12` and the tile is absent if none qualify. The `pv` cancellation described below was confirmed.
  Reported 2026-10-11: *"the 'best path to e1rm' target sometimes suggests enormous rep counts of
  light weight; I think this seems off - when is the last time you saw I guy do a 423 rep set."*
  Right — the suggestion is arithmetically correct and physiologically nonsense.

  **Where it comes from.** The tile's reps are solved straight out of Epley in `exPrTargets`
  (`:28446`):
  `need = floor(30 × (allBest / w − 1)) + 1`. With an all-time best e1RM of 150 and a 10 kg
  candidate weight, that is `30 × (15 − 1) + 1` = **421 reps**. Epley is only meaningful to roughly
  10-12 reps; extrapolated past that it stops describing humans.

  **Why a silly weight gets picked at all (strong hypothesis, not yet verified).** The weight is
  chosen as the highest `pv` odds from `exWeightRows` (`:28399`), where
  `odds(need, w) = 100 / (1 + exp(−((30 × (cap/w − 1)) − need) / 1.5))`
  and `pv` passes in that same `need`. Both sides of the comparison are the *same* Epley
  extrapolation — predicted capacity at `w` from the 90-day `cap`, minus reps needed to beat
  `allBest`. When `cap ≈ allBest` the two terms cancel at **every** weight, so a 10 kg row scores
  about the same ~50% as a near-maximal one, and `pick('pv')` is free to land on the lightest row in
  the history. The odds model cannot tell "3 more reps at 140" from "421 reps at 10" because the
  formula it trusts is linear in reps without limit.

  **Fix direction** (pick one, or both):
  - Constrain the candidates: only consider weights where `need` lands in a believable range
    (≈1-12, maybe up to 15), so the tile can only ever ask for a set someone would actually
    perform. If no weight qualifies, show no e1RM tile rather than a fantasy one.
  - Make the odds honest about rep count: penalise high `need` explicitly (or switch the capacity
    estimate to a model that flattens out past ~12 reps) so the cancellation stops happening and
    heavier, closer-to-maximal weights win the pick on their own.

  Check the same extrapolation elsewhere before changing the shared helper — `estimated1RM` feeds
  trends, achievements, the vulnerability tile and `exSessionPrCount`, so a global change to the
  formula is a much bigger blast radius than fixing the target's candidate filter.
  `test/prtargets.spec.mjs` and `test/vulrecord.spec.mjs` cover the current picks; a regression test
  should assert no target ever asks for more than the chosen rep ceiling.

- [x] **"Inhuman" is still awarded too freely on some movements.** — **feat 503** (code written, suite NOT yet run, NOT committed): six machine/isolation families cap at Elite; squat/deadlift/bench/incline/decline tops re-anchored near raw records. **Still open:** the isolation lifts with no record reference (`chest-fly`, `pullover`, `tricep-extension`, `lat-pulldown`, `row`, `lunge`, `bicep-curl`, `hammer-curl`, `lateral-raise`, `front-raise`, `shoulder-press`) keep their feat-438 top bound — they need either a per-movement reference or the same Elite cap.
  Reported 2026-10-11: *"the inhuman rating is still given too freely for some movements indicating
  weak understanding of what they entail. That is supposed to be for eddie hall /david goggins type
  feats."*

  The tier comes from `STRENGTH_STANDARDS` (`:13358`) — per family, four e1RM÷bodyweight cutoffs
  (`light → average → heavy → elite → inhuman`), consumed by `objectiveSetTier` (`:13392`). feat 438
  already moved every bound a full tier stricter; this is about the **top** bound specifically, and
  on specific movements rather than across the board.

  **Prime suspects — machines and isolation work, where the 4th cutoff is a number ordinary gym
  regulars hit.** At 80 kg bodyweight the current "inhuman" line means:
  - `leg-press` 4.50× = **360 kg** — routine on a 45° sled, and the plates are not the limit.
  - `calf-raise` 2.50× = **200 kg** — a standing calf raise at 200 kg is common, not legendary.
  - `hip-thrust` 3.10× = **248 kg** — plenty of people train above this.
  - `leg-extension` 2.05× = **164 kg** and `leg-curl` 1.50× = **120 kg** — often just the full stack.
  - `shrugs` 2.80× = **224 kg** — heavy, but strapped shrugs go well past it.
  These share a cause: machine leverage varies between manufacturers, stacks cap out, and partial
  ROM inflates the number — so a bodyweight ratio means much less than it does on a barbell lift.

  **The deeper modelling problem.** A pure e1RM÷BW ratio cannot express "Eddie Hall". Hall's 500 kg
  deadlift at ~196 kg bodyweight is about **2.55×BW — below** this table's 3.00 "inhuman" deadlift
  line, while a 60 kg lifter pulling 180 kg lands exactly on 3.00× and gets the badge. The ratio
  model systematically flatters light lifters and under-rates the actual strongman feats the tier is
  named for. Worth deciding whether the top tier needs an **absolute-load** component (or a
  Wilks/DOTS-style allometric scale) rather than another round of cutoff nudging.

  Suggested approach: go movement by movement rather than scaling the column. For each of the 23
  families with standards, ask what the real-world record-ish load actually is and whether a ratio
  can express it at all; for machine lifts consider dropping the top tier entirely (cap them at
  Elite) instead of inventing an unreachable number. `test/objtier.spec.mjs` covers the tiering —
  the retune wants fixture sets per family asserting a known-strong-but-human set does **not** read
  Inhuman.

- [x] **Switching exercises from the PICKER carries your typed sets over to the new exercise.** — decided: **a feature**. **feat 507** drops the false "will discard" warning from Change exercise, announces the carry with a toast, and keeps the cardio pick (which does empty the sheet) guarded.
  Found while fixing feat 499 (2026-10-11), verified by probe: with 100×10 and 100×9 entered for
  Barbell Bench, clicking *Dumbbell Flat Bench* in the picker switches `pending.varUuid` and **keeps
  both sets** — `bindPickerResults` (`:27583`) never resets `pending.sets` for a strength→strength
  switch. So they would save under the wrong exercise. feat 151's dialog says "will discard them",
  which is simply wrong for this route (it is right for the plan-chip route, which does reset).

  feat 499 **did** guard the one picker outcome that genuinely destroys — picking a *cardio* exercise empties
  `pending.sets`, so that now asks first. The strength→strength carry-over below is what remains open.

  Not fixed in feat 499 because it is a **product decision, not a defect to settle unilaterally**:
  - carrying over is arguably a *feature* — you typed 100×10, realised you picked Barbell instead of
    Dumbbell bench, switch, and your numbers follow you;
  - or it is misattribution waiting to happen, and the sheet should reset like every other route.
  Pick one, then make the dialog wording tell the truth for whichever it is. If carry-over stays, the
  confirm on that route should say "move to" rather than "discard" — and arguably should not require a
  confirm at all, since nothing is lost.
