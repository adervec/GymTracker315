# Gym Tracker — Design & As‑Built Spec

A single‑file, offline‑first progressive‑overload gym tracker plus an exhaustive
exercise reference. Everything (UI, data, exercise library, glossary, anatomy chart)
lives in **`gym-tracker.html`** — no build step, no dependencies, no network. All
user data is stored in the browser via `localStorage`, with optional file/folder
sync on Chromium desktop.

Guiding principle surfaced throughout the UI: **beat last session** — more reps,
more weight, or more sets. Strength sets are compared with estimated 1RM,
`e1RM = weight × (1 + reps/30)`.

The feature backlog lives in **`Fitness App Features.xls`** (legacy BIFF `.xls`).
Status legend used there: **DONE** shipped · **ONHOLD** deferred.

---

## 1. File architecture

`gym-tracker.html` is one HTML document with three top‑level `<script>` blocks that
share the global scope:

| Block | Role | Key contents |
|------|------|--------------|
| **1 — App logic** | The tracker | `FAMILIES` (compact, machine‑readable exercise data with UUIDs), state & storage, auto‑save/load, themes, settings drawer, volume/muscle model, muscle/cardio analytics, gyms, body comp, log modal, **`render()`** (tracker) |
| **2 — Reference & glossary** | The reference panel | `icons`, `exercises` (rich human‑readable docs sharing the same UUIDs), importance/difficulty ratings, body‑position tables, `glossary`, anatomy chart, **`renderRef()`** (reference) |
| **3 — Nav switcher** | Top‑bar panel switching | `switchPanel()`, build stamp |

Two parallel exercise datasets are intentional: **`FAMILIES`** drives logging,
the picker, volume and tracking; **`exercises`** drives the reference documentation.
They share variation **UUIDs**.

> **Adding/removing a variation touches BOTH datasets.** Put the variation in the readable
> `exercises` block (full cue/setup/movement/mistakes/programming/position docs) **and** in the
> compact `FAMILIES` JSON (`{id, uuid, title, cue, tip, warning, best, subvariation}`) under the
> matching family — using the **same UUID** in both. Editing only `exercises` documents the move
> but leaves it unloggable (it won't appear in the tracker picker); editing only `FAMILIES` makes it
> loggable but undocumented. (E.g. the Freemotion functional-trainer variations — feat 59.)

> **Latent bug fixed earlier:** both blocks declared a global `function render()`;
> block 2's reference one clobbered block 1's tracker one after load. The reference
> function was renamed **`renderRef()`**. An init simulation (`node` + DOM stub) is
> used to confirm all three blocks evaluate with no runtime errors and that every
> render path executes. It has since caught real bugs (a `GYM_EQUIP` TDZ; a string
> escaping error) before they shipped.

### Panels, tabs & overlays
- **Top bar:** title · `📈 Tracker` / `📚 Reference` tabs · `📖 Glossary` · `⚙ Settings` · `? Help`
  (Reference vs Glossary now use distinct emoji — feat 48).
- **Tracker panel** tabs: `Log` · `History` · `Volume` · `Trends` · `Body` · `Gyms`.
- **Reference panel:** searchable/filterable movement library.
- **Overlays:** Settings drawer, Help panel, Glossary panel (with anatomy chart), Log modal, Notes modal.
- The Glossary overlay relocates to `<body>` on open so it works from any panel and is themed globally.
- **Glossary view (feat 59):** opens as a full page by default, or a right-side slide-in drawer
  (Settings → Reference → *Glossary view*, persisted as `glossaryAsPage`, default `true`). Same panel and
  content either way — page mode just drops the slide animation/backdrop and goes edge-to-edge. The panel's
  z-index sits above the top bar so its header/✕ are never occluded in either mode.
- **Settings drawer cleanup (feat 60):** the drawer template stays flat (`.drawer-section-title` + sibling
  rows); after every render, **`decorateSettingsSections()`** wraps each title + its following siblings into a
  collapsible `.drawer-section`, so the giant template is untouched. A header search box (kept *outside*
  `#settings-drawer-body` so it survives re-renders) drives **`applySettingsFilter()`** for row/section-level
  filtering. Collapse state is persisted in `state.settingsCollapse` (in `SETTINGS_KEYS`, so it survives reloads
  and is kept on merge-imports); the **Theme** section is collapsed by default (43 swatches were the bulk) and
  shows the active theme as a header hint. Theme swatches were also compacted (6 cols, 24px dots).
- **Internationalization groundwork (feat 61):** `t(key, params)` resolves a string for the active language
  (`state.lang`, persisted in `SETTINGS_KEYS`; default *and only* option `'en'`) with **current → English → raw
  key** fallback and `{name}` interpolation. **`applyI18n(root)`** translates static markup tagged with
  `data-i18n` (text) / `data-i18n-title` / `data-i18n-aria` / `data-i18n-placeholder` (attributes) and runs on
  load and on every **`setLang()`**. Adding a language is **data-only**: push to `LANGUAGES` (code + native name)
  and add a matching `I18N[code]` dictionary — the Settings → *Language* picker (built from `LANGUAGES`) and the
  switch machinery handle the rest. Only the top bar + settings chrome are wired so far; JS-rendered strings use
  `t()`, and section titles can be translated safely via a `data-sec-id` override (keeps collapse IDs stable).
- **Read-only mode (feat 62):** `state.readonly` (Settings → Preferences, default off). `isReadonly()` +
  `roBlocked(action)` gate the main write paths (`saveSets`, `startWorkout`/`endWorkout`, `deleteExercise`,
  history set-delete, `importData`, `saveBodyEntry`, `saveNotes`, gym add/delete/edit, reset-all); `render()`
  toggles a `body.readonly` class that hides the FAB and shows the `#ro-banner` indicator. Settings/preferences
  stay editable (so the mode can be turned back off).
- **Choice dialog + unsaved-set guard (feat 62):** `choiceDialog({title, message, choices})` is a reusable
  promise-based 3-button modal. `endWorkout()` now checks `hasUnsavedSets()` (unsaved sets sitting in `pending`)
  and forces **Save & end / Discard & end / Continue** before finishing via `finalizeEndWorkout()`. `saveSets()`
  now returns `true`/`false` so the dialog knows whether the save succeeded.
- **Biometric freshness (feat 63):** bodyweight exercises (`exMode().mode==='bodyweight'`) can't be saved with no
  recorded bodyweight (`getCurrentBodyweightKg()`). `startWorkout()` surfaces `biometricWarnings()` — bodyweight
  missing/stale by default (`warnStaleBodyweight`), other biometrics opt-in (`warnOtherBiometrics`, default off),
  threshold `biometricStaleDays` (default 14 ≈ 2 weeks). Configured in Settings → *Biometrics*.
- **OSK Next/Done swap + About (feat 62):** the on-screen numpad's *Next* and *Done* swapped places (Next → header,
  Done → primary action). Settings → *About* now carries an **Early Access** disclaimer, a *Built by Adam Eryavec,
  P.Eng. with Claude Code* credit, and the `APP_BUILD` stamp.
- **OSK calculator + log-set fixes (feat 65):** a persistent 🧮 toggle adds `( ) ÷ × − +` keys and a safe
  BEDMAS evaluator (`evalExpr`, input restricted to arithmetic) so `45+45×2` commits `135`. `addSetRow` now
  enforces ≤1 incomplete row (no more stacked blanks); the exercise picker re-renders results-only on keystroke
  (`renderPickerResults`/`bindPickerResults`) so the search ✕ no longer jiggles.
- **TTS + UI polish (feat 66/67):** `speakRandomTip()` reads a random cue/tip aloud on exercise select
  (`state.ttsTips`, default on). App-wide `user-select: none` (form fields exempt) — supersedes the old
  highlight→glossary gesture. Tips & Details has an *Open full reference entry* link (`openReferenceFor`).
- **Workout metronome (feat 69):** customizable audio+haptic beat (`state.metronome`: bpm/audio/freq/vol/haptic/
  accentEvery, in `SETTINGS_KEYS`). Engine is a `setInterval` ticker driving a WebAudio click + `navigator.vibrate`;
  on/off is **runtime-only and resets OFF on `startWorkout`/end**. Toggle + BPM ±5 live on the Log tab during a
  workout; full config in Settings → *Metronome*.
- **Muscle-volume roll-up fix (feat 69):** `MUSCLE_CONTRIB` uses head-level ids (e.g. `biceps-long/short`); the
  `'muscle'`-level Volume view never rolled them to the parent (`biceps`), so multi-head muscles read blank and
  only single-part muscles like **brachialis** showed. `getWeeklyMuscleVolume` now applies **`toMuscleContrib`**
  (head→parent) for muscle level, mirroring `toHeadContrib` for head level.
- **Workout plans (feat 70):** `state.plans` (in `SETTINGS_KEYS`, seeded once from `SEED_PLANS` — 8 plans:
  PPL / Upper / Lower / 2× Full Body / Core). A plan = `{id, name, steps:[{id, sets, options:[{type:'movement',
  familyId} | {type:'variation', uuid}]}]}` — ordered, **suggested-not-enforced** steps; each option is a whole
  movement or a specific variation. Optionally attached to a session via **`session.planId`** (changeable/
  abandonable mid-workout). On the Log tab `renderPlanGuide` shows the plan card (per-step `logged/target` sets,
  current/done state, tap-an-option to log it, **live ETA** from `computePlanETA` = remaining sets ×
  `computeRestStats` set+rest times, and a **⚠ gym** warning via `stepImpossibleInGym` when an active gym can do
  none of a step's options). The feat-55 auto PUSH/PULL/LOWER/CORE suggester (`computeRemainingWork`) is gated to
  run **only when no plan is attached**. The plans overlay (`#plans-panel`) is a full builder: list → editor
  (name, add/reorder/delete steps, per-step set count, add movement/variation options via a search picker) → use.
- **Plan descriptions, history & more plans (feat 71):** plans and steps carry an optional `desc` (shown on the
  card, list, and editor). Seeding is now **additive by id** with a `state.seededPlanIds` ledger (new seed plans
  append for existing users; deleted ones don't reappear) and **backfills descriptions** onto pristine seed
  plans. Library grew to **15** with rich theme/benefit blurbs, including **station / one-zone** plans (Squat
  Rack Strength, Dumbbell Corner, One Cable Station, Bench + Dumbbells) for staying posted up when the gym is
  packed, plus Arms Blaster / Glute Focus / Beginner Full Body. History (`renderSession`) shows a **plan badge**
  with full/partial completion (`stepStatus` over the session). The reference page's circular glossary **FAB was
  removed** — the top-bar 📖 is the single entry point.
- **Heart-rate monitor (feat 72):** **Web Bluetooth** (`navigator.bluetooth`, Android Chrome/Edge only) against the
  standard Heart Rate Service (`0x180D` / `0x2A37`) — connects to a BLE strap or a watch in *broadcast HR* mode
  (it cannot tap a watch bonded to its own app, or the phone's health store). `hrConnect()` (user gesture) picks +
  remembers the device in **`state.hrDevice`**; **`hrTryReconnect()`** auto-reconnects via `getDevices()` on load
  and at `startWorkout`, and a `gattserverdisconnected` retry loop keeps trying to get it back. Samples stream into
  **`session.hrSamples` = [[msFromStart, bpm], …]** at ~1 Hz (throttled saves); `hrFinalize` rolls them into
  `session.hr` avg/max on end. A Log-tab `renderHrBar` shows live BPM + connect/disconnect; **`renderHrChart`** draws
  the per-session trend with **set periods shaded** (`set.wTs→ts`) so the rise-during-set / recover-during-rest
  pattern is visible in history. Manual HR entry (feat 25) stays as the iOS fallback.
- **Garmin biometrics import (feat 73):** a browser cannot read Garmin directly (no public per-user API, internal
  Connect endpoints are non-CORS + behind SSO, no web access to the phone health store), so data arrives as a **file**.
  Body tab → **"Import biometrics"** (`#bc-import-btn`) reads a JSON or CSV via `importBiometrics()` →
  `parseBiometrics()`. **JSON** shape `{bodyComp:[{date, weightKg, bodyFatPct?, muscleMassKg?, boneMassKg?,
  bodyWaterPct?}], sleep:[{date, score?, note?}]}` (also accepts `weightLb`/`*MassLb`); **CSV** is tolerant — columns
  detected by header keyword (date/weight/fat/muscle/bone/water), unit inferred from the weight header (`lb`/`kg`,
  else `state.bodyCompUnit`). `normBiometricEntry()` normalizes to the canonical `bodyComp` entry (kg, noon-UTC date,
  rounded), merged **dedupe-by-calendar-day** exactly like `saveBodyEntry`. Sleep rows are matched to a workout's
  calendar day (`dayKey` anchors date-only strings to noon UTC so they don't slip a day in western TZs) and written to
  **`session.sleep`** (a short string, e.g. `"Score 78 · 7h12m"`), surfaced + editable in the workout-stats card
  (feat 25) and shown as `😴 …` in history. **`tools/garmin-sync.py`** (community `garminconnect` lib) logs in locally
  with the user's own credentials and writes that JSON from Index S2 body-comp + last-night sleep score. Kept lean:
  one optional sleep field, no per-metric ingestion beyond the S2 set.
- **Biometrics auto-load (feat 73):** Settings → Data → **"Biometrics Auto-Load (Garmin)"** picks a file or folder
  (`bioLoadPickFile`/`bioLoadPickFolder`) and **always merges** (never overwrites) — independent of the main
  Auto-Save/Load; `state.bioAutoLoad{enabled,mode}`. Unlike the main Auto-Load (memory-only handles), the handle is
  **persisted in IndexedDB** (`gymtracker-fs` store; tiny `bioIdbGet/Set/Del` wrappers) so it survives reloads.
  `bioLoadNow(silent, interactive)` restores it, checks `queryPermission` on boot (silent, no prompt) /
  `requestPermission` on the **Sync Now** gesture, then imports via `importBiometrics(text, {silent})`. Folder mode reads
  the newest file matching `bio|garmin|weight|gymtracker` (`.json|.csv|.txt`) by last-modified. Boot hook fires
  `bioLoadNow(true,false)` after the main auto-load. `importBiometrics` now takes `{silent}` and returns
  `{added, sleepN}` for status reporting.
- **Sound & haptics quick control (feat 74):** a top-bar button (`#app-sound-btn`, left of the glossary icon) opens a
  themed popover (`#sound-menu` + transparent backdrop, anchored under the button via `getBoundingClientRect`) to
  mute/adjust master **Audio** (toggle + volume slider) and **Haptics** (toggle), with a **Test** button and a
  "Sound settings →" link to the drawer. New master gate **`state.sound{audio,haptics,volume}`** (in `SETTINGS_KEYS`,
  normalized + volume-clamped) is enforced inside the four audio/haptic primitives — `safeVibrate` (haptics gate),
  `restBeep`/`metroBeep` (audio gate + `sndVol()` scaling), and `speakRandomTip` (audio gate + `u.volume`) — so one
  switch silences everything app-wide. Helpers `sndAudioOn/sndHapticOn/sndVol`. The icon reflects live state via
  `refreshSoundIcon()`: speaker glyph by volume (🔇/🔈/🔉/🔊) plus a 📳 badge shown only when haptics are on, and a
  dimmed `muted-all` state when both are off. Called on boot and after every change. Below the master controls a
  **"Per sound"** section (`soundSources()`) exposes the individual channels as 🔊/📳 chips wired straight to their
  settings — Metronome (`metronome.audio/haptic`), Rest cues (`workoutControls.feedbackBeep/feedbackVibrate`) and
  Spoken tips (`ttsTips`); the master switch still gates them all. Menu scrolls (`max-height`) on short screens.
- **Exercise reference media (feat 75):** attach form-reference clips (YouTube / Shorts, TikTok, Instagram Reels)
  to a variation and review them in a swipeable carousel popup. **`state.exerciseMedia{[uuid]:[{platform,vid,
  embedUrl,watchUrl,url,addedAt}]}`** (in `SETTINGS_KEYS`, normalized to `{}`), keyed by variation uuid — the same id
  Reference and Log Sets share. **`parseMediaUrl`** normalizes a pasted link → platform + embed URL: YouTube/Shorts/
  youtu.be/m. → `youtube-nocookie.com/embed/ID`, TikTok `/video/ID` → `tiktok.com/player/v1/ID`, Instagram
  `/reel|p|tv/CODE` → `/embed`; short links (`vm.tiktok`) and unknown hosts become **link-only** cards, non-domains are
  rejected. `add/get/removeExerciseMedia` (add is read-only-gated + de-duped). The **`#media-modal`** popover has a
  **carousel** mode (horizontal scroll-snap slides, lazy iframes loaded via `IntersectionObserver` so only the visible
  clip streams, dots, 9:16 frames / 16:9 for YouTube, an Open ↗ fallback when a clip can't embed — nothing is cached)
  and a **manage** mode (paste-to-add input + list + remove); empty opens to manage. Entry points: a 🎬 button in every
  Reference variation badge-row and a "🎬 Reference videos (N)" button in the Log-Sets exercise header.
  **Two levels:** media attaches to a **variation** (`v.uuid`) *or* a whole **movement** (`ex.id` = `fam.id` =
  `info.family.id`, shared across datasets). A variation's carousel — in Reference and Log Sets — merges its own clips
  **plus its movement's** (`openExerciseMedia(uuid, title, movementId)` → `combinedMediaItems()` de-dupes by embed/url
  and tags each slide "This variation"/"Whole movement"); manage mode shows one add/remove section per level. The
  Reference movement header has its own "🎬 Movement" button. `refreshMediaCounts()` recomputes every `[data-media-label]`
  badge (variation-only, movement-only, or combined via `data-media-mov`) without a re-render.
- **Reference compact views (feat 76):** a Detailed / 🌳 Tree / ▦ Table toggle (`#ref-view-toggle`, persisted in
  **`state.refView`** ∈ SETTINGS_KEYS) at the top of the Reference panel; `renderRef()` branches to `renderRefTree` /
  `renderRefTable` before its detailed render. **Tree** = collapsible movements → compact variation rows; **Table** =
  one row per variation (Movement · Variation · Group `megaBadge` · Meta). Both flag attached metadata *without* showing
  details via `refMetaBadges(uuid, movId)` — **📝** note (feat 54, per-variation) and **🎬**(+count) video links (feat
  75, own row only); the 🎬 badge opens the carousel (`stopPropagation`), tapping the row elsewhere calls `refDrillTo` to
  jump to the full detailed entry (expanded + scrolled, toggle re-synced). `syncRefViewToggle` keeps the segmented
  control in sync.
- **Strava reconciliation (feat 77):** link logged workouts to Strava strength activities (usually watch-synced). A
  browser can't reach Strava directly (OAuth needs a client secret + no CORS), so activities arrive as a **file**:
  `tools/strava-sync.py` (stdlib-only OAuth + `/athlete/activities`, writes `strava-activities.json`; `--push` PUTs
  descriptions back) or a Strava bulk-export `activities.csv`. **Settings → Data → Strava**: Import → `parseStravaActivities`
  (JSON raw-API or normalized, or quoted-CSV) → `normStravaActivity` → merged into **`state.stravaActivities`** (∈
  SETTINGS_KEYS, dedupe by id). `reconcileStravaBuckets()` does a **greedy 1:1 start-time match** (±`STRAVA_MATCH_WINDOW_MIN`
  = 120) into **linked / proposed / gymOnly / stravaOnly** (`isStrengthType` filters WeightTraining/Workout/etc). The
  reconcile overlay (`#strava-modal`, reuses the media-modal box) lists the buckets with per-row **Link / Unlink**, **Link
  all**, and **📋 copy description**; `linkStrava` sets `session.stravaId` and **enriches** the session (backfills
  `hr{avg,max,calories}` if empty; derives `endedAt` from `elapsed_time` for past sessions). `stravaDescriptionFor`
  builds an exercise/top-set/volume summary; `exportStravaPush` writes a `strava-push.json` for the script. `strava-token.json`
  + generated sync files are git-ignored.
- **Equipment "X Setup" pickers in the OSK (feat 78/79):** seven loading tools (`SETUP_KINDS`) — **Barbell** (renamed
  from Plate Loader; bar + per-side plates, smith via bar option), **Dumbbell** (per-hand / total-×2), **Kettlebell**
  (single / double), **Medicine Ball**, **Plate Picker** (plate sum), **Landmine** (loaded-end plates + optional bar),
  **Pin Setup** (stack stepper with adjustable increment + add-on **toppers**) — surfaced two ways from one source of
  truth via a namespace `ns` (`'inl'` | `'np'`): the **inline** sets-form panel (`renderSetupInline`, only when the OSK
  is off) and the **OSK** strip (`renderNpSetup`, top of the numpad on a weight field) — a chunky **"{icon} {label}:
  {total}"** button + a ⚙ configurator (`renderSetupBody`/`bindSetup`); tapping commits the weight and advances to reps
  (`commitSetField` → `numpadNext`). **Default assignment is per-variation**, not family-wide: `autoSetupKind` reads the
  variation's own title/id tokens (e.g. "Smith"→barbell, "Roc-It"→pin, "MTS/Iso-Lateral"→plate, "Landmine/Meadows",
  "Goblet"→dumbbell), excludes bodyweight (`exMode` + title) and time/distance, and for silent strength variations falls
  back to the **family's primary (first-listed) `equip`**. A per-variation **override** (`state.exerciseSetup`, ∈
  SETTINGS_KEYS) via the in-configurator Tool selector sets a specific tool or **None**. State is `modalState.setup[kind]`
  / `modalState.setupOpen` (reset per exercise); `setupTotal`/`plateSum` compute the loaded weight.
- **Pin profiles + picker graphics (feat 80):** Pin Setup gains **named machine profiles** — `state.pinProfiles`
  (`[{id,name,inc}]`, ∈ SETTINGS_KEYS): a "Machine profile" row of saved-stack chips (tap to apply that machine's
  increment, ✕ to delete) plus **＋ Save** (names the current increment via `prompt`); the active one is tracked on the
  pin state's `profileId`. And every picker now shows a **stylized theme-matching SVG glyph** via `setupIconSvg(kind)`
  (barbell/dumbbell/kettlebell/med-ball/plate/landmine/pin, `stroke="currentColor"` so it inherits the button's accent)
  in place of the emoji on the chunky OSK button and inline toggle/header.
- **Live loaded-barbell illustration (feat 81):** `renderBarbellSvg(st)` draws the plates actually on the bar inside
  the Barbell Setup configurator — symmetric, largest plate inside-out, **height ∝ weight**, theme-coloured by size band
  (`--accent` / `--accent2` / `--text3`), with a `+N more per side` label past 11 plates. Built from the same
  `st.plates` map, so it updates live on every add/remove.
- **Baseline-adaptive plans + intensity/ETA (feat 82):** plan steps carry a relative **`load`** (`light`/`moderate`/
  `heavy` → 0.7/0.85/0.95) and plans a **1-5 `intensity`**. `baselineWeightVar` (heaviest set in the most recent
  session that trained a variation) × `loadFactor(load)`, rounded to the unit increment, yields a **suggested working
  weight** shown per step in the plan guide ("heavy · ≈190lb", with a "% of baseline" tooltip). Starting a step seeds
  that weight into the first set **and pre-loads the matching equipment picker** (`_planLoadCtx` threaded through both
  `startExerciseFromSuggestion` and the picker-tap path → `seedSetupForWeight` → `solveSetupState`: `greedyPlates` solves
  a barbell/plate/landmine loadout, `nearestInList` snaps dumbbell/kettlebell/med-ball, pin rounds to its increment).
  `estimatePlanMinutes` (≈2.5 min/set + 1/exercise, **rounded to 15 min**) and `intensityDots` show on plan cards + the
  guide. Six new seed plans (Heavy Lower, Upper Hypertrophy, Express 30, Posterior Chain, Powerbuilding A, Athletic Full
  Body); `intensity`/`load` backfilled for existing users in the seed-merge.
- **Plan video (feat 83):** a plan can carry **one** attached web video — `plan.media` (a normalized `parseMediaUrl`
  item, persisted on `state.plans`). Attached/removed in the plan editor (paste a YouTube/Shorts/TikTok/Reel link →
  Attach; shows platform + Preview/🗑). Watched read-only via `openPlanMedia(planId)`, which reuses the feat-75
  `#media-modal` through a new explicit-list path: `_mediaCtx.items` makes `combinedMediaItems` return the given clip(s)
  and `renderMediaModal` hides the Manage button (editing lives in the plan editor). A 🎬 button surfaces on the plans
  list row and a "🎬 Watch" on the live plan guide.
- **Bulk exercise-media population (feat 84):** a browser can't enumerate a creator's YouTube Shorts or hold a Data-API
  key, so matching runs in **`tools/youtube-media.py`** (stdlib; resolves a channel handle → uploads, keeps Shorts
  ≤~60 s, fuzzy-matches video titles to exercises by token coverage, emits real `/shorts/<id>` URLs only where matched —
  no fabricated IDs). **Settings → Data → Exercise media**: `exportExerciseList()` dumps
  `{movements:[{id,title}], variations:[{uuid,title,movement}]}` for the script; `importExerciseMediaMap()` ingests the
  result `{media:[{uuid|id|match, url, source?}]}` → `resolveExerciseKey` (uuid → id → normalized exact/contains title)
  → `parseMediaUrl` → merged into `state.exerciseMedia` (de-duped; reports added/unmatched/dup/bad). Default channels:
  `@fitonomycoaching`, `@pathradecha`.
- **Deferred-trio cleanup (feat 85):** (1) **Equipment setup now persists within a workout** — the picker no longer
  wipes `modalState.setup` on every exercise switch (only collapses `setupOpen`); it's cleared instead at `startWorkout`
  and `finalizeEndWorkout`, so a loaded bar/dumbbell/pin config carries by type across exercises. (2) **Plan builder edits
  load + intensity** — `renderPlanEditor` gains a 1–5 intensity pill row (per plan) and a light/moderate/heavy load pill
  row per step (`data-plan-intensity` / `data-step-load`), so custom plans drive the feat-82 suggested weights too. (3)
  **Resizable SETS panel** — the sets list lives in `.sets-section` with a sticky header and a `.sets-scroll`
  (`resize: vertical`, `max-height`, internal scroll), and `.tips-content` is capped at `38vh` with its own scroll, so a
  long Tips section can never bury the sets.
- **Themed dialogs everywhere (feat 86):** every remaining native `confirm()`/`prompt()` is replaced by themed,
  Promise-based dialogs built on the `choiceDialog` sheet — `confirmDialog(msg, {title,okLabel,danger})` → `Promise<bool>`
  and `promptDialog({title,message,placeholder,…})` → `Promise<string|null>` (with a `.choice-input`). Converted sites:
  end-workout, reset-all, delete-all-history (now a 3-way export/delete/cancel `choiceDialog`), delete-set, delete-exercise,
  clear-notes, custom-variation name, pin-profile name, and `guardedConfirm`'s fallback. **`saveSets` is now async**
  (`Promise<boolean>`): the commit logic is extracted into an inner `commit()` gated behind `confirmDialog`, and its one
  return-value caller (the end-workout "Save & end" path) was updated to `.then`. No `confirm`/`prompt`/`alert` calls
  remain.
- **Smith/custom bar + assign-picker-from-Reference (feat 87):** Barbell Setup gains a **custom bar weight** input
  (`data-{ns}-barcustom` → `st.bar`) alongside the preset pills, and detects **Smith** variations (`isSmithVar`, title/id
  match) — `barbellBars()` swaps in counterbalanced-carriage presets (`[15,20,25,45,0]` lb), `defaultSetupState` seeds a
  lighter 25 lb / 15 kg default, and the body shows a "Smith carriage — effective weight" label + note. And the
  per-variation **loading-tool override** (`state.exerciseSetup`) is now assignable **from the Reference panel** too: each
  variation body with a relevant tool shows a `🛠 Loading tool` `<select>` (Auto · {detected} / 7 kinds / None) wired to
  `setSetupOverride` — which also lets you re-enable a tool after setting it to None.
- **Mix sub-variations in one log (feat 88):** a default-OFF setting (`workoutControls.mixSubvariations`, Settings →
  Workout Session) lets you pick a **sub-option per set** for exercises that have a subvariation (grip/bar/angle). When
  on (and not editing), each set row in the Log modal gets a `.set-sub-select` (`data-set-sub` → `set.subUuid`); on save
  `saveSets` tags each valid set with its sub and **groups them into one exercise entry per sub** (so each grip tracks
  separately under its own `varUuid|subUuid`), stripping the temp field. Off (default) = the original single-sub
  behaviour; editing mode always uses the one selected sub.
- **Strava activities auto-load (feat 89):** mirrors the feat-73 biometrics auto-load for Strava — `state.stravaAutoLoad
  {enabled,mode}` (∈ SETTINGS_KEYS), `_stravaLoad{File,Dir}Handle`, and `stravaLoad{NewestInDir,Apply,Now,PickFolder,
  PickFile,Disable}` reusing the same `bioIdb*` IndexedDB handle store (keys `stravaDir`/`stravaFile`). Pick a folder/file
  (e.g. where `strava-sync.py` writes); the handle persists across reloads, and on boot (`stravaLoadNow(true,false)`) +
  "Sync Now" it imports the newest `strava|activities|gymtracker` file via `importStravaActivities(text,{silent})` (which
  gained a silent option) — always merging. Settings → Data → Strava shows the auto-load controls (gated by
  `autoLoadSupported`).
- **Coaching & Progression tab + new disciplines (feat 90):** a third top-level panel (`panel-coaching`, 🧭) built
  from the bundled `/Guides` (endurance reference, bouldering, Captains-of-Crush grip). `renderCoaching()` builds three
  cards (Endurance / Bouldering / Grip & Digit Strength) from a `COACHING` data array — distilled cues, zone models,
  progression protocols and the CoC gripper ladder. **Crosslinking:** each card's chips call `openInReference(search,
  mega)` (sets `#ref-search` / clicks a mega pill, then `switchPanel`); a guide chip opens the full bundled guide; and
  the Reference panel carries a `coach-banner` back to the tab (`goPanel`). **New trackable families** arrive via a new
  `EXTRA_FAMILIES` + `applyExtraFamilies()` injector (mirrors `EXTRA_VARIATIONS`, pushes whole families into `FAMILIES`
  + `VAR_INDEX` + the Reference `exercises`): `neck-training` (mega `neck`), `jaw-training` (mega `jaw`), and `climbing`
  (mega `cardio`, so `isCardioVar()` logs **bouldering as a cardio session**). Grip/digit work (pinch hold, support
  hang, thick-bar, finger-extension band) is added to the existing `grip-training` family via `EXTRA_VARIATIONS`; the
  keyword-driven `exMode()` already routes holds/hangs → time and the rest → weight×reps. **Trainable muscles updated:**
  `forearms`, `neck`, `jaw` added to `BP_LABELS` + `BODY_PARTS`; a `FOREARM_FAMILIES` override in `getBP()` reclassifies
  grip/wrist work (sourced as `pull::arms` → biceps) to `forearms`, and `BP_MAP` gains `neck::strength`/`jaw::strength`/
  `cardio::climbing`. Covered by `test/coaching.spec.mjs`.
- **Guides baked into the single file + in-app themed reader (feat 91):** the three `/Guides` HTML docs are
  embedded into `gym-tracker.html` as inert, marker-delimited `<template id="guide-*">` blocks by
  `tools/embed-guides.mjs` (idempotent — re-run when a guide changes; strips their external font `<link>`s to stay
  offline). The Coaching tab's guide chips are now buttons → `openGuide(gid)` opens a full-screen reader
  (`#guide-reader`, z-index above the app chrome) whose `<iframe srcdoc>` = the template's HTML +
  `buildGuideTheme()`. That override reads the app's **live** theme (`getComputedStyle` of `--bg/--bg2/--bg3/--text/
  --text3/--accent/--border2` + the body font) and injects it over each guide — remapping bouldering's CSS variables
  (`--paper/--ink/--tape`…) and the hard-coded dark palettes of the coc/endurance guides — so all three adopt the app
  theme + font (bouldering flips from its light "field-guide" look to dark). The iframe still runs each guide's own
  script, so the collapsible coc cards and the data-driven endurance reference (69 topics built at runtime) keep
  working. The app is now fully self-contained — distribute `gym-tracker.html` alone. `test/check.mjs` strips the
  `GUIDES:START…END` block so the embedded guides aren't linted as app code. The reader (which covers the app's top
  nav) is escapable three ways: a prominent **✕ Close** button (safe-area-padded so it clears a phone notch), the
  **Escape** key, and the **device Back button** (open pushes a history entry; `popstate` closes the reader without
  leaving the app).
- **UI tap feedback on every button (feat 92):** `state.uiFeedback {audio,haptic}` (default **ON**, ∈ SETTINGS_KEYS)
  drives a single capture-phase `click` listener (`uiTapFeedback`) on `document`. For any interactive target —
  `_uiFeedbackTarget()` matches semantic controls (`button`/`a`/`[role=button]`/`[onclick]`/`select`) or, for the app's
  clickable divs, walks up to 4 ancestors looking for `cursor:pointer` — it plays a crisp `uiClickSound()` (a short
  1100→620 Hz triangle blip on the shared `_restAudioCtx`) and a `safeVibrate(8)` buzz. Both still route through the
  feat-74 master gates (`sndAudioOn`/`sndHapticOn` + volume), and a new **"Button taps"** row in the sound quick-menu
  toggles the audio/haptic independently. Capture phase means it fires even when a handler stops propagation; text
  inputs (cursor `text`) are skipped. Covered by `test/feedback.spec.mjs`.
- **Installable HTTPS PWA + deploy (feat 93):** the app ships as an offline-first PWA on GitHub Pages.
  Added `manifest.webmanifest` (standalone, dark theme, 192/512/maskable icons generated by
  `tools/make-icons.mjs`, which rasterises a branded dumbbell SVG via the Playwright we already depend on),
  a `sw.js` service worker (network-first for the document so it's fresh online + cached offline,
  cache-first for assets; cache `gt-cache-<build>` stamped from `APP_BUILD` at deploy, old caches purged on
  activate), and `<head>` meta + manifest/apple-touch links + an inline SW registration (skipped on
  `file://`; toasts "reopen to apply" when a new SW is waiting). `.github/workflows/deploy.yml` runs the
  static check, embeds the guides, assembles `_site/` (`gym-tracker.html`→`index.html` + manifest + sw +
  icons, `__BUILD__` stamped) and publishes to Pages on push to `dev`. `gym-tracker.html` stays the
  single-file source; the PWA files are deploy artifacts. `test/check.mjs` validates the PWA assets and
  `test/pwa.spec.mjs` checks the manifest, head wiring, and that the SW registers + caches the shell.
  *(Phase 1 of the PWA + Google-Drive-sync plan; data-model hardening + Drive sync follow.)*
- **Open-source / going-public legal (feat 94):** added a top-level `LICENSE` (MIT, © 2026 Adam Eryavec)
  and a single in-app disclaimer source, `legalDisclaimerHtml()`, surfaced in both **Help** (a "Disclaimer
  & licence" section) and **Settings → About** (a collapsible `<details>`): not-professional-advice +
  exercise-at-your-own-risk, no-warranty (MIT), trademarks-belong-to-owners / not-affiliated (Captains of
  Crush, Hoist/Roc-It, Life Fitness, Strava, Garmin, …), data-stays-local, and a references note. A license
  + disclaimer banner comment heads `gym-tracker.html`. README gained Disclaimer / Privacy / Trademarks /
  License sections + a MIT badge; `tools/garmin-sync.py` and the README flag that the Garmin helper uses the
  *unofficial* `garminconnect` library (Strava/YouTube helpers use official APIs). Audit confirmed: no
  bundled third-party libraries (vanilla single file; Playwright is a dev-only Apache-2.0 dep), no committed
  secrets, no remote fonts/CDN/trackers. Covered by `test/legal.spec.mjs`.
- **Sync data model (feat 95):** the foundation for cross-device Google Drive sync (Phase 2 of the plan).
  Every session now carries a stable `id` (`newSession()` → `crypto.randomUUID()`) + `updatedAt`; existing
  sessions are backfilled on load (`normalizeState` sets `updatedAt = endedAt || date` but **NOT** an id — so
  two devices migrating the same legacy session don't fork into duplicates; legacy sessions key by date).
  Deletions push a tombstone to `state.deletedSessions [{id, deletedAt}]` (`deleteExercise` session-removal,
  the full `finalConfirmDeleteAll` wipe; pruned > 1 yr). `touchSession()` bumps `updatedAt` on the non-set
  edits (cardio, notes, sleep, HR, Strava link); set logging needs none since `sessionTs()` already takes the
  newest set `ts`. `applyImport()`'s merge mode was rewritten from a naive date-merge into a **last-write-wins
  union**: sessions keyed by `id || 'd:'+date`, newest `sessionTs` wins, tombstones drop a session only when
  the deletion is at least as new as its last edit, and settings do a coarse whole-object LWW via a
  `saveState`-stamped top-level `savedAt`. Covered by `test/sync.spec.mjs`.
- **Tracker button press timing (feat 96):** `state.trackerPress { shortMs, longMs }` (default `{0, 2000}`, ∈
  SETTINGS_KEYS, in Settings → Preferences) defines a **short tap** (released ≥ `shortMs`; 0 = instant) vs a
  **press-and-hold long-press** (held ≥ `longMs`) that fires a *separate* shortcut, for Tracker-tab buttons.
  `longMs` is always kept ≥ `shortMs` + 1 s. `attachTrackerPress(btn, onShort, onLong, label)` classifies the
  press (reusing the `attachLongPress` `lp-holding` fill + a haptic on long-press; a release under `shortMs` is
  ignored as an accidental tap). The long-press time also now drives the existing destructive **hold-to-confirm**
  (`attachLongPress` defaults its hold to `trackerPress.longMs`). Specific per-button long-press shortcuts are
  wired on request. Covered by `test/press.spec.mjs`.
- **Tracker log UX pass (feat 97):** removed the wasted "Gym management moved" disclaimer from Settings; capped
  the in-modal Tips panel at 22vh (was 38vh) so an open Tips section no longer pushes the Sets pane off-screen;
  made the **on-screen numpad the default** (`workoutControls.onScreenNumpad`), which moves the plate/pin/bar
  **equipment setup into the keypad as a ⚙ toggle** (`renderNpSetup`) instead of the inline configurator — keeping
  the Sets pane visible on mobile; added rep-range **ghost text** under the numpad when entering reps (Strength
  1–5 · Hypertrophy 6–12 · Pump 15–20+). Also extended `attachTrackerPress` (feat 96) with a **two-phase progress
  indicator**: a charging fill toward `shortMs` (the accidental-tap "arming") then toward `longMs`, with an
  `lp-armed` accent-tint once the tap is valid (an instant tap with no long action shows nothing). Covered by
  `test/press.spec.mjs`.
- **History outlier review (feat 98):** `findOutlierSets()` scans weighted (standard-mode) history and flags a
  set as a likely **data-entry slip** when its weight exceeds the configured limit (`maxWeightLb`), its reps are
  absurd (> 100), or its e1RM is more than 3× this exercise's own median (needs ≥ 4 samples as a baseline — robust
  to the outlier itself). The History list prepends a **⚠️ review card** with per-set **Keep** (sets `set._ok`, a
  vetted flag that travels in export/sync so a confirmed-real PR is never re-flagged) and **Delete** (removes the
  set, prunes an emptied exercise, tombstones an emptied session). Read-only mode blocks edits. Covered by
  `test/history.spec.mjs`.
- **Top-bar long-press shortcuts (feat 99):** each top-bar icon gains a press-and-hold shortcut layered over its
  normal tap. `attachTopbarLongPress(btn, onLong, label, holdMs=550)` reuses the `.lp-holding` progress fill, fires
  a confirm haptic, and **swallows the trailing click** via a *document* capture-phase listener (so it beats the
  button's earlier-registered inline `onclick`). Shortcuts: **🔊** mute audio + haptics (`topbarMuteAll`); **📖**
  glossary search of the current muscle target (`BP_GLOSS_TERM[bp]` → `openGlossaryTo`); **📚** open the current/last
  variation in Reference (`openReferenceFor`); **⚙️** jump to the most recently changed setting (a drawer-body
  change/click listener records `state.lastSettingAnchor {id,sec}`; `openSettingsToLastChanged` expands the section,
  scrolls, and flashes it); **🧭** scroll Coaching to the most relevant card (`coachingCardForExercise` →
  endurance/bouldering/grip); **❓** unchanged (tap == hold). `currentOrLastExercise()` (active log → newest history)
  is the shared context. Covered by `test/topbar.spec.mjs`.
- **Numpad digit long-press ×10 (feat 100):** an on-screen-keypad digit **tapped** appends as before, but **held**
  (≥ 400 ms) from an *empty* field enters that digit ×10 (hold `7` → `70`) — a fast path for round numbers. With
  digits already present, or in calculator mode, a hold is just a normal short press. `bindNumpadKeys` now routes
  digit keys through `attachNumpadDigit` (self-contained pointer tap/hold, no document listener — safe under the
  numpad's frequent re-render) and the shared key logic was extracted to `numpadHandleKey(k)`. The ×10 fires
  `numpadHandleKey(k)` then `numpadHandleKey('0')`, shows a `×10` hold hint + the `lp-holding` fill. Covered by
  `test/numpad.spec.mjs`.
- **Rename "subscription" → "subvariation" (feat 101):** the variation sub-option concept was historically named
  `subscription` (a confusing word implying payment). Renamed the data property (`variation.subvariation`), every
  accessor, the `subvariations` lookup table, the `.var-subvariation` CSS class, the Trends `subvariation` dimension +
  its tab label, and comments — 819 lowercase + 2 capitalized occurrences, a same-length swap (both words are 12
  chars) so byte size is unchanged. **Safe** because persisted user data keys by `subUuid`, never the word
  `subscription`; the rename is confined to the static `FAMILIES`/`exercises` datasets and code. (Aligns with the
  already-"subvariation" `workoutControls.mixSubvariations` control.)
- **History filtering + time bounds + all-time link (feat 102):** the History list gains a filter bar —
  a **time window** (`HISTORY_RANGES`: all / year / 6mo / 3mo / month / week) plus cascading **body part → movement
  → variation** dropdowns and a debounced **text search**. State lives in `state.historyFilter
  {range,bp,family,varKey,q}` (device-local, not in `SETTINGS_KEYS`). `historyAggregate()` rebuilds the per-key
  stats over only the sessions/sets passing the window + filters (`exPassesHistoryFilter`); `historyFilterOptions()`
  builds the dropdown options present in-window, honoring parent selections so they cascade. The list is split into
  its own `#hist-list` so the text search re-renders **list-only** (keeps input focus); dropdown changes do a full
  re-render. A variation's **detail** now respects the window and, when one is active, shows a **🕘 View all-time**
  link (`#trk-all-time`) that drops the window. The outlier-review card (feat 98) was extracted to
  `buildOutlierReviewHtml()` and stays **filter-independent** (data hygiene is always surfaced). Covered by
  `test/historyfilter.spec.mjs`.
- **Metronome mantra mode (feat 103):** a `metronome.mantra` toggle (Settings → Metronome) makes the metronome
  **chant the current exercise's setup cues** on each beat instead of beeping — a looping, hypnotic form reminder.
  `metroNextMantraTip(ex)` cycles `collectExerciseTips(ex)` (cue / tip / family setup·movement·mistakes) by a module
  index; `metroSpeakNextTip` speaks it via `speechSynthesis`, guarded by `_metroSpeaking` (waits for the previous
  utterance's `onend` so a fast tempo doesn't clip words — the cues self-pace to speech length) and the master audio
  gate. The target exercise is the pending log exercise, else `currentOrLastExercise()`. `stopMetronome` cancels any
  in-progress chant. Covered by `test/metronome.spec.mjs`.
- **Metronome set-active gating + rest-cue timer (feat 104):** two parts. (1) `metronome.setActiveOnly`
  (**default on**) makes `metroTick` stay silent unless `metroSetActive()` (an open set — weight entered, reps
  pending) so the beat only sounds while you're actually repping; an Off pill restores free-run. (2) A **separate,
  configurable audible rest timer** `state.restCues {enabled,mode,target,interval,countdown,endCue,audio,haptic,freq}`
  (in `SETTINGS_KEYS`, default **off**), independent of the recommended-rest zone beeps. `restCueTick()` (hooked into
  the 1 Hz `restTick`, fires ≤ once per integer second via `_lastRestCueSec`) emits, during same-exercise rest:
  **count-up** interval beeps + an end cue at `target`; or **countdown** interval beeps, a per-second tick over the
  final `countdown` seconds, and a distinct triple end cue at zero. Countdown mode also shows `⏳ remaining` on the
  rest bar. Both configured in Settings → Metronome / Rest timer cues. Covered by `test/restcues.spec.mjs`.
- **Headphone-only audio (feat 105):** `state.audioHeadphonesOnly` (**default on**) suppresses *audio* output (every
  beep/cue/TTS — never haptics) unless it's routed to headphones, so the app never blares through a phone speaker in
  a public gym. Browser output detection is **best-effort**: `probeAudioOutput()` reads `audiooutput` device labels
  (`enumerateDevices`, refreshed on `devicechange`) and matches a headphone/bluetooth regex. `headphoneGatePasses()`
  blocks **only** when the setting is on AND we *positively* detected speaker-only (`_headphonesConnected === false`);
  when labels are hidden (no permission) or the API is absent it **fails open** (`null` → allowed) so audio is never
  silently broken. The gate is added to the four audio emitters (`metroBeep` / `restBeep` / `uiClickSound` /
  `metroSpeakNextTip`) + `speakRandomTip`. Settings shows live status + an optional **enable-detection** link
  (`unlockHeadphoneDetection` — a one-off `getUserMedia` to reveal device labels, then stops the track). Covered by
  `test/headphones.spec.mjs`. *(Caveat: on Android Chrome without the optional permission, labels are hidden →
  detection is unknown → fail-open, so the gate is effectively inert until the user enables detection.)*
- **Auto-connect HR on workout start (feat 106):** `workoutControls.hrAutoConnect` (**default on**, toggle in
  Settings → Workout, only shown when `hrSupported()`) gates the existing `startWorkout()` → `hrTryReconnect()` call,
  so each workout silently re-attaches your last heart-rate monitor (no chooser) — or not, if you turn it off. The
  reconnect uses `navigator.bluetooth.getDevices()` (no user gesture needed for a remembered device). Covered by
  `test/hrconnect.spec.mjs`.
- **Change-exercise / add-note buttons + picker escape hatch (feat 107):** the log modal's **Change exercise** and
  **Add note / edit** controls became real `<button>`s (proper tap targets + button styling) instead of tiny
  underlined text spans. And because tapping Change exercise opens the picker without clearing `pending.varUuid`, the
  picker now renders a **← Back to {current}** button (`#trk-picker-back-current`, shown when there's a current
  exercise and you're not editing/superset-picking) that sets `showPicker = false` to return to the in-progress
  exercise unchanged — recovering a mis-tap. Covered by `test/changeexercise.spec.mjs`.
- **Long-press End Workout skips the confirm (feat 108):** the **End Workout** button now uses `attachTrackerPress`
  (feat 96/97) instead of `setupConfirmButton`: a **tap** runs `endWorkout(false)` (the themed confirm dialog), a
  **long-press** runs `endWorkout(true)` (ends immediately, skipping the popup) — with the two-phase charging
  progress indicator, and independent of the global hold-to-confirm setting. A hold shorter than the threshold still
  falls back to the confirm dialog (accidental-press safety). Covered by `test/endworkout.spec.mjs`.
- **Data management as its own page (feat 109):** all data rows (Export/Import JSON, Export Workout/CSV, Activity
  Log, Auto-Save, Auto-Load, Biometrics, Strava, bulk Exercise media, Reset) moved out of the Settings drawer into a
  full-screen **Data Management page** (`#data-page`). Implementation avoids relocating ~340 lines of HTML + bindings:
  the sections still render inside the drawer wrapped in `#drawer-data-wrap`, and `renderSettingsDrawer` then **moves
  that wrapper node** (with its already-attached event listeners riding along) into `#data-page-body` — leaving only
  an "📦 Open Data Management →" entry button in Settings. `openDataPage()`/`closeDataPage()` toggle it; re-renders
  (from data actions) rebuild + re-relocate, so the page stays live. Covered by `test/datapage.spec.mjs`.
- **Desktop bulk media wizard (feat 110):** a desktop-only full-screen tool (`#media-wizard`, gated by
  `isDesktopWizard()` = File-System-Access support or a wide fine-pointer viewport; entry button in the Data page's
  Exercise-media section) to manage reference links across **every** exercise at once. `renderMediaWizard()` lists
  variations (search, "with media only" toggle, capped at 150) each with their links; per link: an embeddable/link-only
  badge, **↗ open** (new tab — the "test"), **→ move** (`reassignMedia` to another variation via an inline 2-char
  search picker), **✕ delete**; per row an **add-link** input. **↻ Re-test all** (`mediaWizardRetestAll`) re-parses
  every link to refresh `embedUrl`/platform. Reuses the existing `parseMediaUrl`/`add`/`removeExerciseMedia` API.
  Covered by `test/mediawizard.spec.mjs`.
- **Plan-progress dashboard (feat 111):** `renderPlanGuide` now shows, per step, **sets hit** (`logged/target ✓`) and
  an **effort badge** (`stepEffort` — did the heaviest logged set reach the step's `load`-derived target weight,
  within 3%; n/a when there's no baseline) plus a live roll-up line (`planExecutionSummary`: sets, steps, effort
  hits) and **ETC ~Nmin · ETA clock**. A **comparison line** (`findPlanExecutions`) shows the **most-recent** and
  **all-time-best** prior runs of the same plan (best by stored `finalScore.points`, else set count; either may be
  absent or the same run). Because step→exercise matching is by exercise (`stepLoggedSets`/`optionMatchesVar`),
  progress is **retroactive across a mid-workout plan change** — sets logged under the old plan count toward the new
  plan's matching steps automatically. Covered by `test/plandash.spec.mjs`.
- **Plan-aware picker (feat 112 + 115):** when a plan is active, the exercise picker shows its **incomplete steps as
  chips** (`renderPicker`); tapping one sets `modalState.planStepFilter` so `filterVariations()` returns **exactly
  that step's exercises** — the union of its options (`stepQualifyingVarSet`) — **overriding** the mega/sub/equip
  pills (a set no normal filter could produce). A "✕ all exercises" chip clears it. From the **dashboard**, tapping a
  `.plan-step` calls `openStepPicker(idx)` to open the same filtered picker (and seeds the suggested weight via
  `_planLoadCtx`). The filter clears on pick / modal close. Covered by `test/planpicker.spec.mjs`.
- **Log-Sets current-step indicator (feat 116):** the strength Log-Sets form now leads with a banner
  (`planStepIndicatorHtml`) naming the plan step the current exercise belongs to (`planStepForVar` — earliest
  incomplete matching step), its **sets logged/target with a progress bar**, and whether the **effort is on target**
  (`stepEffort`). Off-plan exercises get a muted "not part of any plan step" note. Covered by `test/logstep.spec.mjs`.
- **Plan-complete popup + post-save picker routing (feat 113 + 114):** when the plan finishes, the card shows a
  **🎉 complete banner** (End / Summary) and `showPlanCompleteDialog()` pops a summary (steps, sets, effort, time, vs
  best) offering **End workout / Keep training**. And `saveSets` no longer drops you on the dashboard after a save —
  it routes to the **exercise picker** instead: blank/unfiltered with no plan, or **pre-filtered to the earliest
  incomplete step** (`currentPlanStepIndex` → `planStepFilter`, seeding `_planLoadCtx`) with a plan. **Exception:** a
  save that *just completed* the plan (`planExecutionSummary().complete` flips false→true) closes to the dashboard and
  fires the complete dialog. A new `endingWorkout` arg keeps the end-workout "save & end" path on its old close-to-
  dashboard behavior (the Save button calls `saveSets()` with no event arg). Covered by `test/postsave.spec.mjs`.
- **"All relevant trends" deep-link (feat 117):** a 📈 button on the **Reference** variation row and the **Log-Sets**
  form calls `openTrendsFor(varUuid, subUuid)` → sets `trendFocus`, switches to the Trends tab, and renders a focused
  view (`renderFocusedTrends`) with three cards from `buildFocusedTrends`: the exercise's **own subvariation** trend
  (`getSeriesForKey`), its **muscle** trend (body-part `bp`-grouped), and its **muscle-group** trend (mega-category
  grouped) — each via the existing `computeTrend`/`renderTrendCard`. A "← All trends" button clears the focus.
  Covered by `test/trendfocus.spec.mjs`.
- **Custom hi-res anatomy chart + OCR mapping (feat 118):** the glossary anatomy chart gains a **Simple** (built-in
  wireframe) vs **Detailed** view toggle. Uploading a hi-res labelled chart stores it in IndexedDB
  (`bioIdb*` 'anatomyChartImage'), unlocks + defaults to **Detailed**, and renders the image with clickable **tap
  hotspots** (each → `openGlossaryTo`). The hotspot map (`state.anatomyChart.map`, normalized 0..1 coords keyed to
  glossary terms) is produced offline by a new **desktop helper `tools/anatomy-ocr.py`** (Tesseract + OpenCV) that
  OCRs English labels, follows each leader line to its muscle, and emits a JSON map you import in-app — keeping the
  app single-file/offline (no bundled OCR engine). `renderAnatomyChart` was extended with the view toggle +
  upload/import/remove; `anatomyImportMap` validates + clamps the map. Covered by `test/anatomy.spec.mjs` (app) and
  `check.mjs` py_compile (tool). *(Approach chosen by the user: desktop helper over a multi-MB in-app WASM OCR.)*
- **Collapsible plan card (feat 127):** the active-workout plan card (`renderPlanGuide`) folds down to just its
  name + progress line. Tapping `.plan-card-head` (keyboard-operable, `role=button`) toggles
  `state.dashboard.planCollapsed` (persisted; a chevron flips ▾/▸) and re-renders; the bulky `.plan-card-body`
  (meta, comparison, steps, complete-banner, actions) gets the `hidden` attribute while the glanceable progress
  line stays visible. Covered by `test/plandash.spec.mjs`.
- **More mobility content (feat 128):** 24 new bodyweight movements drawn from yoga, pilates, tai chi and martial
  arts — 7 **dynamic** (Sun Salutation flow, Tai Chi Cloud Hands, Cossack flow, Pilates roll-up, shoulder
  pass-throughs, Frankenstein walks, Spiderman lunge) added to `mobility-warmup`; 8 **static** stretches (down dog,
  cobra/up-dog, seated fold, lizard, frog, seated twist, cow-face arms, standing side-bend) added to
  `static-stretch`; and a brand-new **Isometric Holds** family (`iso-poses`) with 9 held poses (chair, warrior II,
  boat, tree, horse stance/Mabu, Zhan Zhuang standing post, goddess, bridge, locust). Like every exercise these are
  hand-maintained in **both** representations — the detailed `exercises` array (drives the Reference panel's
  setup/movement/mistakes/programming) and the lean minified `FAMILIES` array (drives the picker / logging /
  `VAR_INDEX`) — plus a tier-map entry for the new family. Covered by `test/coaching.spec.mjs` (present + indexed in
  both, well-formed).
- **Per-category export + data summary (feat 129 / 130):** the Data Management page gains a **"By category"** block
  driven by one registry, `dataCats()` — Workouts, Body composition, Sleep, Strava, Plans, Exercise media, Custom
  variations, Settings. Each row shows the **count + date range** (`dataCatRange`) and offers export as **app-readable
  JSON** (a state slice — `{sessions,…}` for workouts, or a settings-type slice stamped with a fresh `savedAt` so
  `applyImport` merge re-adopts it) or a **human-readable CSV** (`csvWorkouts` one-row-per-set incl. cardio +
  e1RM, `csvBodyComp`, `csvSleep`, `csvStrava`, `csvPlans`; map-shaped categories are JSON-only). `exportCategoryJson`
  / `exportCategoryCsv` download a `gymtracker-<key>_<ts>.(json|csv)`; the table is built by `dataCategoryTableHtml`
  and rides along into the relocated Data page. Covered by `test/dataexport.spec.mjs` (counts/ranges, slice shapes,
  CSV rows, JSON re-import round-trip, rendered buttons).
- **Centered modal close button (feat 131):** `.media-head .media-close` (the ✕ on the media carousel and the Strava
  reconciliation modal) was a fixed 30×30 box with no flex centering, so the glyph sat low/off-center. Added
  `display:inline-flex; align-items:center; justify-content:center; line-height:1; padding:0`. An audit of the other
  ✕/× controls found this was the only fixed-square one missing centering (the picker clear button was already
  flex-centered; the rest are padding-sized). Covered by `test/mediawizard.spec.mjs` (computed-style centering).
- **Defensive OAuth origin allowlist (feat 132):** the committed public OAuth client ids (`SYNC_CLIENTS`) are
  gated app-side to an `OAUTH_ORIGINS` allowlist (`https://adervec.github.io` + localhost via a hostname check).
  `cloudOriginAllowed(origin)` (pure, parses `new URL(origin).hostname`, arg-overridable for tests) backs three
  gates: `cloudConnect` refuses `kind:'oauth'` providers on an unlisted origin (custom endpoint exempt);
  `cloudSyncCardHtml` disables the OAuth buttons + shows a note when the origin isn't allowed; and
  `cloudOAuthHandleRedirect` won't complete a token exchange off-origin. Defense-in-depth only — the providers
  already enforce their *Authorized JavaScript origins* server-side — but it makes a **fork of this public repo**
  fail fast (clear message, no leaked consent screen / quota use) instead of relying solely on Google's rejection.
  Data isolation was never at risk: each user authenticates as themselves and their data lives in their own Drive
  `appDataFolder`; the owner can't see others' data. Covered by `test/sync.spec.mjs` (allowlist logic + enabled/
  disabled button render); existing connect tests stay green since the test origin (`127.0.0.1`) is allowlisted.
- **Volume "Split" view (feat 119):** the Volume tab gains a **Split** level (alongside Group / Muscle / Heads) that
  aggregates the week's strength sets by **training split** — the family **mega** category (push / pull / lower /
  core / full). `getWeeklySplitVolume(weekOffset)` mirrors `getWeeklyVolume` but keys by `family.mega`;
  `renderVolumeSplit` draws the per-split bars (sets + %) plus a quick **push:pull** and **upper:lower** balance
  read. Covered by `test/volumesplit.spec.mjs`.
- **Richer Log workout cards (feat 120):** each `renderSession` card now shows a **grade chip** (`sessionGrade` —
  stored `finalScore` or live `computeWorkoutScore`), the **plan** it followed (explicit badge when `planId`, else an
  **inferred split** via `sessionSplitLabel` — push/pull/legs/upper/full-body/mixed from the mega mix, marked
  "implicit"), a **key-deltas** line (`sessionDeltaSummaryHtml`: 🏆 PR count, the biggest non-PR e1RM gainer, and #
  regressions vs each exercise's prior best), and — when the gap to the previous logged workout exceeds **48h** — a
  "🛌 rested N days" banner (`sessionGapTagHtml`). Covered by `test/logcards.spec.mjs`.
- **Picker "touched" familiarity badge (feat 121):** every exercise-picker row shows a discrete familiarity/recency
  chip — **new** if never trained, else **N×** (distinct calendar days you've logged it) colored by recency
  (recent ≤ 14 d / stale ≤ 60 d / old). `buildTouchMap()` does one pass over sessions per picker render
  (varUuid → distinct-day set + last timestamp); `touchBadgeHtml()` renders the chip (full "trained on N days · last
  X ago" in the tooltip). Covered by `test/touched.spec.mjs`.
- **Notes: gym + injury suggestions (feat 122):** the session-notes modal's **Location** field gets a `<datalist>`
  of your saved gyms (`state.gyms`) for quick autocomplete, and the **Injuries / Pain** field autocompletes from a
  curated `COMMON_INJURIES` list as you type. The injuries field is **multi-value** (comma-separated):
  `renderInjurySuggest()` matches the token after the last comma (excluding already-listed entries) and clicking a
  chip appends it + `, ` so you can list several. Covered by `test/notes.spec.mjs`.
- **End-workout confirm → add notes (feat 123):** `finalizeEndWorkout`'s confirm is now a 3-way `choiceDialog` —
  **🏁 End workout / 📝 Add notes, then end / Cancel**. Choosing notes opens the session-notes modal via a new
  `openNotesModal(date, onSaved)` callback; **Save** (relabeled "Save & End Workout") runs the chained `finish()` to
  end the workout, while closing the modal without saving cancels the end (`closeNotesModal` clears `_notesOnSaved`).
  Long-press End / plan-complete "End" still skip straight through (`skipConfirm`). Covered by `test/endnotes.spec.mjs`.
- **Cloud sync — Google Drive (feat 124, plan Phase 3):** automatic cross-device sync that works on the **phone**
  (unlike the desktop-only File-System Auto-Save/Load). A provider-agnostic engine sits behind the feat-95
  last-write-wins merge: a `SyncProvider` only reads/writes **one** canonical state JSON and `applyImport(remote,
  'merge')` reconciles edits/deletes (session `id` + `updatedAt` + tombstones). `saveState()` → `cloudPushTrigger()`
  (1.2 s debounce); boot does a silent `cloudPullNow`. Every push is **read-merge-write** (re-pull + merge before
  upload) so no device clobbers another. The first backend, **Google Drive**, uses the GIS browser token model
  (scope `drive.appdata` — a private per-app folder, light consent), stores one `gymtracker-state.json`, loads the
  Google Identity SDK **dynamically** on connect (keeps the app single-file + the no-external-`<script src>` lint),
  holds the access token **in memory only** (never persisted) and caches the Drive fileId in IndexedDB (`bioIdb*`
  `cloudGoogleFileId`). `state.cloudSync` is **device-local — intentionally NOT in `SETTINGS_KEYS`** so connection
  state never travels cross-device (each device authorizes with its own browser-scoped consent). The public OAuth
  client id lives in `SYNC_CLIENTS.google` (empty until the user does the one-time free Google Cloud setup — see
  README → Cloud Sync; until then the Settings card shows the setup steps instead of a Connect button). The engine
  is provider-pluggable: a custom-endpoint / Dropbox / OneDrive backend can be added by registering another entry in
  `CLOUD_PROVIDERS` with no engine changes. Covered by `test/sync.spec.mjs` (stubbed GIS + routed Drive REST:
  connect → find-or-create → push; pull → LWW merge; device-local-by-default).
- **Cloud sync — more backends (feat 125):** three more entries in `CLOUD_PROVIDERS`, no engine change. **Custom
  endpoint** (`kind:'endpoint'`) — the universal/Apple-friendly option: `GET`/`PUT` one JSON to a user-supplied
  URL with an optional bearer token (`state.cloudSync.perProvider.custom`, local only); ships a ~30-line Cloudflare
  Worker template [`tools/sync-worker.js`](tools/sync-worker.js). **Dropbox** + **OneDrive** (`kind:'oauth'`) share
  a hand-rolled **OAuth 2.0 PKCE redirect** flow (no SDK, no client secret): `cloudOAuthBegin` stashes a PKCE
  verifier + redirects to consent; on return the app boots with `?code=…`, `cloudOAuthHandleRedirect` exchanges it
  (`cloudOAuthExchange`) and finishes via the shared `cloudFinishConnect`. Access tokens stay in memory
  (`_cloudOAuthTokens`); **refresh tokens** persist in IndexedDB (`bioIdb*` `cloud_<provider>_rt`) so a reload
  re-syncs silently (`cloudOAuthToken` → `cloudOAuthForceRefresh` on expiry/401). Dropbox uses the content API
  (App-folder, `/gymtracker-state.json`); OneDrive uses Graph `special/approot` (personal accounts only —
  `Files.ReadWrite.AppFolder`). `cloudConnect` returns early when a provider's `connect()` reports `'redirecting'`.
  The Settings card became a provider picker (`cloudSyncCardHtml`) listing every backend + custom URL/token inputs +
  a Setup-help disclosure. iCloud stays out of scope (needs a paid Apple Developer account + CloudKit). Covered by
  `test/sync.spec.mjs` (PKCE digest; custom connect/push/pull with bearer auth; simulated Dropbox+OneDrive
  redirect-return → token exchange → push; registry + multi-provider picker render).
- **Two-hour seed plans (feat 126):** four high-volume `SEED_PLANS` for longer sessions — **Full Body Blast**,
  **Leg Marathon**, **Chest & Back**, and **Shoulders & Arms** (all "(2h)") — each tuned to ~45 sets across
  10–11 steps so `estimatePlanMinutes` (`round((2.5·sets + steps)/15)·15`) reports **~120 min**. They use only
  existing movement families (`_mvOpt` ids), so they inherit gym-feasibility, picker matching and progress
  tracking for free, and auto-append for existing users via the `seededPlanIds` merge in `normalizeState`.
  Covered by `test/app.spec.mjs` (present + 120-min estimate + every step references a real family).

---

## 2. State & storage

- `STORAGE_KEY = overload_tracker_v2` — the full `state` object (JSON).
- `PENDING_KEY = overload_tracker_pending_v2` — in‑progress log entry (incl. cardio / superset drafts).
- `LOG_KEY = overload_tracker_log_v1` — **separate** activity/error log; kept out of the data JSON.
- `SETTINGS_KEYS` — keys preserved on *merge* import / replaced on *overwrite* import.
- `normalizeState()` backfills nested defaults so older saved state stays valid.

### `state` shape (high level)
```
{
  unit, theme, maxWeightLb, alwaysConfirm, tipsMode, tipsExpanded,
  autoSave{}, autoLoad{}, workoutControls{ autoEndMinutes, showLiveScoreAfterMin, paceAnalysisStartMin },
  profile{ name, dob, heightCm, gender },                  // feat 34
  dashboard{ stats, timeline, liveScore, pace, physique },  // feat 33
  longPressConfirm{ enabled, ms },                          // feat 32
  bodyComp[], bodyCompUnit,                                 // feat 24
  muscleWeights|null, muscleWeightPreset,                   // feat 10/11
  hiddenVars{}, hiddenMovements{},                          // feat 23
  hiddenCategories{},                                       // feat 8  (cardio/mobility/recovery)
  cardioGoals{ weeklyMinutes, weeklyDistance, weeklySessions, distanceUnit }, // feat 7
  customVariations[],                                       // feat 16
  gyms[], activeGymId,                                      // feat 36/37/38/44/46
  glossaryHighlight,                                        // feat 31
  sessions[]
}
// session: { date, exercises[], endedAt?, endReason?, finalScore?, hr?:{avg,max,calories}, notes? }   (hr = feat 25)
// exercise: { varUuid, subUuid, sets:[{w,r,wTs?,ts}], supersetId?, cardio?:{elapsedMin,distance,distanceUnit,steps,power,calories,setting,effort,temp,weather,notes,ts} }
//   set timing (feat 51): wTs = set START (weight entered); ts = set DONE (reps entered). Old sets have ts only.
```

---

## 3. Feature catalog (as built)

### Data, backup & import/export — DONE
Export/import JSON (merge vs overwrite); auto‑save / auto‑load to file or folder with
deletion policies (Chromium); settings inside the JSON; CSV export of the reference.

**Workout export (50):** export a single workout (the `⤴` button on any session card) or a date
range (Settings → Data → *Export Workout / Range…*) as a **themed portrait image** and as **plain
text**. Scope presets: single workout · this week · this month · last 30 days · all‑time · custom
from/to (`selectSessionsForExport`). The image is drawn with the **Canvas 2D API** (zero‑deps — no
html2canvas / SVG `<foreignObject>`, which taints the canvas on iOS Safari): a header band in the
active theme's `--accent` (header text auto‑contrasted via `pickContrast`), a 2×3 stat grid
(duration · volume · sets · score · HR · calories), then the exercise list with top sets; height is
computed before sizing and scaled by `devicePixelRatio` for crisp output. Delivery shares one
`downloadBlob` helper (the JSON/CSV/log exporters were refactored onto it) plus `copyText`
(Clipboard API + `<textarea>`/`execCommand` fallback) and `shareExport` (Web Share with the PNG as a
`File` where `navigator.canShare({files})`). `buildWorkoutText()` produces clean, Strava‑ready text.

### Profile & preferences — DONE
- **Profile (34):** name, DOB→age, height, gender → BMI / relative‑strength context.
- **Hold‑to‑confirm (32):** press‑and‑hold replaces yes/no popups on destructive buttons.
- **Highlight → glossary (31):** select & hold text 5s to open the matching entry.

### Themes (22, 47) — DONE
**43 themes in 10 categories** — Classic, Grimdark, Animanga, Neon, Elemental, Mono, Gemstone, **Coffee, Bloom, Dusk**
— with oblique thematic names. The 5 original themes use CSS `[data-theme]` blocks; the rest are
**palette‑driven** via `mkTheme()` → CSS custom properties applied inline by `applyTheme()`.

### Workout session dashboard — DONE
Start/End (12) with confirmation (13); auto‑start/auto‑end; workout score vs prior sessions;
live chunky estimate (14); pace algorithm (28); a remaining‑exercises suggester (55, superseding balanced‑physique 15); per‑element
visibility toggles (33). **Forerunner stats (25):** manual avg HR / max HR / calories attached to
any session via an inline ❤️ editor on the session card.

### Smart rest timer & set lifecycle (51) — DONE
A set now **starts when its weight is entered** (`wTs`) and is **done when reps are entered** (`ts`); the reps
field stays locked until a weight is present (`isSetOpen`). Only **one open set** is allowed at a time, and an
open set left without reps for `workoutControls.abandonMinutes` (default 5) is reaped (`reapAbandonedSet`).
**Add Set:** single‑click adds an empty (or plate‑loader) set, double‑click pre‑fills the previous set's weight
(`addSetRow`); the old clone button is hidden. A global **rest bar** under the top bar — driven by a single 1 s
`restTick`, visible across tabs while a workout is active — shows the live *set‑active* time or the rest since the
last set, colour‑coded against a **recommended range** (`recommendRest`): research‑based bands by exercise nature,
adjusted by previous‑set intensity (overload level / e1RM / reps) and in‑session fatigue, then blended toward the
user's own median rest for that exercise (`medianInterSetRest`) as data accrues — clamped 1 s…10 min. Optional
vibrate / beep fire once per zone transition (settings toggles). The **timeline** draws `wTs→ts` duration bars +
rest gaps (inter‑exercise rest styled distinctly, legacy ticks for un‑timed sets), and the Log tab shows live
**set‑time / rest** analytics (`computeRestStats`) with inter‑exercise rest bucketed separately.

### Rest bar — opaque progress bar in the top bar (56) — DONE
The feat‑51 bar was reworked into a **solid, opaque** strip flush under the emoji top bar (zone colours no longer
use `rgba` whole‑bar tints, so page content never shows through). It now doubles as a **progress bar**: an
absolutely‑positioned `.rest-bar-fill` grows left→right to show how far through the *current* colour zone you are —
how close the next colour change is (`restZoneFill`: `restSec/minSec` in the orange zone,
`(restSec−minSec)/(maxSec−minSec)` in the green zone ⇒ 50 % at mid‑green; 100 % + flash in the red over‑zone, with
the flash now animating the *fill* rather than the whole bar so opacity is preserved). When **not** working out it
stays visible as a **compact 18 px strip** ("`<d>d <h>h since last set`" via `lastExerciseEndedMs`/`formatSinceGap`),
expanding to the 30 px timer while training; `body.rest-bar-on` (78 px) / `body.rest-bar-idle` (66 px) drive the
panel offset. Hidden only when the timer setting is off or no set has been logged yet.

### On-screen numpad for set entry (57) — DONE
An opt-in `workoutControls.onScreenNumpad` (Settings → On-screen numpad) replaces the native mobile keyboard for the
weight/reps set inputs, whose slide-in used to reflow the form ("jump around"). When on, `renderSetsForm` renders the
inputs as `type="text" inputmode="none" readonly` (no keyboard fires) and a tap opens a **fixed bottom-sheet numpad**
(`#trk-numpad`); being `position:fixed` it never reflows the form. Keys (digits · `.` · `±` · `⌫` · Clear · Next ·
Done) are built by the pure **`numpadApplyKey(buf, key, {decimal, sign, maxLen})`** — decimal only for weight and
time/distance reps, `±` for bodyweight "assist" weight, integer reps otherwise. Entry flows through the shared
**`commitSetField(i, f, val)`** (extracted from the native input handler, used by both paths) so `wTs`/`ts` stamping,
the reps-locked-until-weight rule, overload tags and the rest bar behave identically; `updateRowLive` was hoisted to
module scope so both paths can call it. With the option off, native keyboard entry is unchanged (cardio/superset/HR
inputs still use it).

### Set-form button rework + opt-in prefill (58) — DONE
The set-action buttons now live on one row — the modal footer is **Save · Add · Copy · Clear · Close** (the old hidden
Clone is gone; the body "+ Add Set" row and the "LAST: …" quick-fill row are removed). The footer `Add`/`Copy` are
sets-only (`renderModal` hides `#trk-add-set` for the picker/cardio/superset forms, since the footer is shared).
**Add Set** is now single-click = a fresh empty set (or the plate-loader default); the old double-click-for-previous-
weight behaviour is gone. **Copy** (`copyWeightToNextSet`) builds the *next* set's weight only: if the bottom set has a
weight it appends a new set carrying it (≡ the old double-click), else it fills the empty bottom set from the nearest
weighted set above, else from history (`getLastSetForExercise`) — it never copies reps. Auto-prefilling the first set
from the last session is now an **opt-in** `workoutControls.prefillFromHistory` (**default off**); the three
start-an-exercise prefill sites (picker tap, sub-option change, suggestion chip) are gated on it.

### Tracking modes — DONE
`exMode()` classifies a variation as **standard** (weight×reps), **bodyweight** (added load; − =
assist; shows effective load — feat 26), **distance** (carries — feat 27), or **time** (holds — 27).
**Cardio (feat 6)** is a fully separate path: `isCardioVar()` (mega `cardio`) routes the log modal to
`renderCardioForm()`, which captures elapsed time + optional distance/steps/power/setting/calories/
effort(1–5)/temp/weather/notes. Cardio entries store `cardio:{}` with empty `sets`, so they are
**excluded from volume, scoring, trends and progression history** but render with their metrics in
the session/history views.

### Plate loader (41/42) — DONE
For barbell movements (`isBarbellVar`), an optional collapsible loader in the sets form: pick a bar
(default 45 lb / 20 kg + variants), tap plates per side, see the live total, and **“Set as weight”**
fills empty sets and becomes the default weight for newly added sets. Symmetric only; a note explains
asymmetric is reserved for a few obscure lifts.

### Supersets — DONE (two distinct features)
- **Post‑hoc link (39):** a `⇄` button links a logged exercise with the one above it (shared `supersetId`).
- **Obscure real‑time superset (43):** a discrete “⇄ Superset two exercises” entry in the picker lets you
  pick exercise A then B, then add sets of **either** in any order; saved as two `supersetId`‑linked entries.
  Changing the chosen exercise discards the in‑progress superset, and a normal in‑progress set cannot be
  converted into a superset (you start superset mode fresh from the picker).

### Volume & muscle analysis — DONE
Body‑part, **per‑muscle (9)** and **per‑head (29)** views from a muscle model + per‑family contribution
map; adjustable **weightings (10)** scaling MEV/MAV/MRV targets with **cited sources** and revert‑to‑default;
imbalance **presets (11)**; over/under‑doing sort. **Cardio goals & adherence (7):** a card on the Volume
tab sets weekly minutes/distance/sessions goals and shows this‑period adherence bars (hidden when cardio
category is hidden).

### Session analytics (52) — DONE
A **Sessions** sub‑tab in Trends (`renderSessionTrends`) gives a light, *informational* read on training
habits — explicitly not progression. From `sessionTrendData()` (per‑session size/length/time, duration via
`endedAt` else last‑set time): summary tiles (avg length / sets / volume / typical start), sparklines for
per‑session **volume** and **duration** (`trendSparkSVG`), and bar charts (`trendBarsSVG`) for **time of day**
(6 buckets), **day of week**, and **workouts per week** (last 10). Reuses `computeSessionStats`/`lastSetTs`/
`startOfWeek`; charts are theme‑coloured via CSS vars.

### Categories visibility (8) — DONE
Settings → Categories hides **cardio / mobility / recovery** entirely: `categoryHidden()` removes them from
the picker (via `varVisibleInPicker`) and suppresses their features (e.g. cardio goals).

### Body composition (24) — DONE
`Body` tab: manual Garmin Index S2‑style entry (weight, body‑fat %, muscle/bone mass, water %), kg‑canonical,
displayed in lb/kg; BMI from latest weight + profile height; history with deltas.

### Reference, variations & glossary — DONE
Hide flags + reset (23); custom variations (16, manual‑flagged, removable only if unlogged, basis selectable);
built‑in extras (17/18 — Roc‑It dip/leg press/leg extension/leg curl/abdominal & oblique crunch, Life Fitness
torso rotation, hack‑squat foot positions, sissy hack squat); same‑stimulus alternatives with cues (19);
top‑bar glossary (20) & help (21); bodybuilder/lore entries (40) in a `Lore` category — **with no personal
lifespans (feat 45)**; **anatomy chart (30)** as a clickable left pane, bidirectionally cross‑linked to entries.

### Gyms (36/37/38/44/46) — DONE
Gym management is its **own tab (46)**. Define gyms by available equipment, build **from a template**,
select the **active** gym (overrides hide flags / force‑shows specific exercises), pin **GPS** (manual,
“pin here”, or **paste a Google Maps link / lat,lng — feat 44** via `parseMapsLatLng`), and a Maps **search**
link. Workout start pings location to auto‑select the nearest saved gym (≤2 km).

### Activity & error log (35) — DONE
Ring‑buffer event log in its own storage key; global error capture; in‑drawer viewer; export to `.txt`.

### UI chrome & build stamp (53) — DONE
The top app bar is **emoji‑only** (📈 / 📚 panel tabs · 📖 / ⚙️ / ❓ actions) to save width on mobile — no
wordmark, height stays 48px (so the rest‑bar/panel/picker offsets are untouched). The build identity is a
**single `APP_BUILD` constant** shown discreetly at the foot of the **Help** panel (not the top bar); a tracked
**`.githooks/pre-commit`** hook (`stamp-build.js`) rewrites it to `build <commit#> · <YYYY‑MM‑DD HH:MM>` on
every commit, so it never goes stale. The auto‑save status badge is a self‑contained fixed pill (decoupled
from the old top‑bar `#app-ts` anchor).

### Per‑exercise notes (54) — DONE
The log‑sets header (`.selected-exercise`) carries a **custom note that sticks to the exercise** —
add / edit / view / clear inline, persisted globally and re‑shown every time that exercise is logged (the
Strong/Hevy convention), independent of any session. Stored as `state.exerciseNotes[varUuid] = {text, updatedAt}`
keyed by **variation** (so the note is stable across grip/sub‑option changes); `getExerciseNote`/`setExerciseNote`
read/write it and `normalizeState` defaults the map. The header shows "📝 …note… · edit" when set and
"＋ Add note" when empty; an inline textarea (Save / Cancel / Clear) drives it, toggled by
`modalState.exNoteEditing` + a `renderModal()` re‑render, and reset on every modal open / exercise switch.

### Remaining‑exercises evaluation (55) — DONE
The live "what's left to round out this session" card (upgrades the feat‑15 balance card, same `dashboard.physique`
toggle). `computeRemainingWork(session)` finds the dominant mega and the still‑light **bodyparts** via `getBP()`
(the clean per‑exercise bodypart — `push`→chest/shoulders/triceps, `pull`→back/biceps, `lower`→quads/hams/glutes/calves,
`core`), then suggests one specific, currently‑visible exercise per missing area (excluding what's already done,
preferring the user's most‑used). Suggestions render as **tappable chips** — `startExerciseFromSuggestion(varUuid)`
opens the log modal preset to that exercise. Recomputed on every submit (it lives in `renderLog`). This also fixes a
latent feat‑15 bug: the old card tallied `family.sub` against keys (`triceps`/`biceps`/`core`) that are never a `sub`,
so those areas always read "light". The **projected grade** (Live score estimate) already reevaluated per submit and
is unchanged.

### Deferred — ONHOLD
- **#49** — Make the anatomy chart toggle to externally‑attached, more richly detailed charts and ensure the
  glossary covers everything on them. (Requires source charts that aren't provided; the built‑in stylized
  chart + comprehensive anatomy glossary ship today.)
- **#50‑Strava** — push the workout summary into the Strava activity the Garmin Forerunner
  auto‑generates (match by overlapping time window, then `PUT /activities/{id}` description). Deferred:
  Strava's API only exposes the activity *description/name* (no structured sets), and OAuth needs a
  server‑side secret + token refresh — so it requires a small backend (the same one the multi‑device
  sync question is parked on; a serverless worker would cover both). The text export is already
  Strava‑ready, so this becomes "authenticate + match + PUT" once a backend exists.

---

## 4. Notable design decisions
- **Palette‑driven theming** keeps each new theme to a single data entry, no per‑theme CSS.
- **Runtime injection over editing giant literals** for custom + built‑in‑extra variations.
- **Single picker‑visibility source of truth** (`varVisibleInPicker`) composes category‑hide, gym rules,
  hide flags and custom flags; gym force‑show wins for specific exercises.
- **Cardio is data‑shaped to opt out of strength math**: empty `sets` means every volume/score/trend
  function ignores it automatically; a guard in History skips zero‑set entries.
- **Separate log storage** so JSON export/import stays clean.
- **Two-layer test suite** (see §6): a zero-dependency static check (parses every inline `<script>`, lints,
  verifies the build stamp + Python helpers) plus a Playwright behavioral suite that boots the real file in
  headless Chromium and asserts the pure helpers + a clean boot. GitHub Actions runs both on every push/PR.

## 5. Known limitations
- Per‑muscle distribution is directional (explicit map for major lifts, even split otherwise), not lab‑accurate.
- The anatomy chart is a stylized schematic (see ONHOLD #49 for the richer‑chart follow‑up).
- Auto‑save/load and GPS need Chromium / geolocation permission; file handles reset on reload.
- Editing one of several cardio bouts of the *same* machine in a single session targets the first match.
- `parseMapsLatLng` reads coordinates from common Google Maps URL forms or a plain `lat,lng`; it does not call any Maps API.
- Rest analytics & the recommended‑rest blend only populate from sessions logged **after** feat 51 shipped (older sets lack the `wTs` start timestamp); they fall back to heuristics until then.
- The build stamp auto‑updates via a git pre‑commit hook; enable it once per clone with `git config core.hooksPath .githooks` (Node must be on PATH). Each commit therefore touches `gym-tracker.html` with the refreshed stamp.
- Exercise notes are **global per variation** — the same note shows for every grip/sub‑option and in every session; they are intentionally not repeated on per‑session history rows or in the image/text export (easy follow‑ups).
- The remaining‑exercises suggester uses the coarse `getBP` bodypart map (compound lower lifts count as quads; only the four strength megas are covered) and surfaces one suggestion per missing area — a nudge to round out balance, not a full program.

## 6. Testing & CI
The app is one ~1.4 MB self‑contained file, so the test tooling lives alongside it (`package.json`, `test/`,
`playwright.config.mjs`, `.github/workflows/ci.yml`) and never touches the shipped HTML. Two layers:

**Layer 1 — static checks (`npm run check`, zero dependencies, ~1 s).** `test/check.mjs` extracts every inline
`<script>` block and parses each with `vm.Script` (this is what catches a stray token that would otherwise break
the whole script at load — the exact failure mode that has bitten this repo). It also lints for native
`confirm/alert/prompt` calls (the themed dialogs replaced them), `debugger` statements and external `<script src>`
(the file must stay single‑file); checks `APP_BUILD` is well‑formed; greps that the critical functions are still
defined; and `py_compile`s the three `tools/*.py` helpers. Wired into the pre‑commit hook so a parse break can't be
committed (bypass with `git commit --no-verify`).

**Layer 2 — behavioral suite (`npm test`, Playwright + headless Chromium).** `test/app.spec.mjs` serves the file
over `http://127.0.0.1` (a tiny zero‑dep server, `test/serve.mjs`) and, in an isolated context per test, asserts:
the app boots with **no console/page errors** and renders its shell; the critical globals are exposed; and the pure
helpers compute correctly — `estimated1RM` (Epley), `kgToLb`/`lbToKg` round‑trip, `parseMediaUrl`
(YouTube/TikTok/Instagram id extraction + junk rejection), `estimatePlanMinutes`/`intensityDots`, `autoLoadSupported`,
`normalizeState` → `saveState` sync defaults, and a silent `importStravaActivities` merge. `npm test` runs the static
checks first (`pretest`).

**CI.** `.github/workflows/ci.yml` runs both layers on every push to `main`/`dev` and on PRs (Ubuntu, Node 20 +
Python 3, `npm ci`, then `playwright install chromium`), uploading the Playwright report as an artifact.

> The behavioral suite paid for itself on day one: its clean‑boot assertion caught a real shipped bug — the feat‑72
> HR auto‑reconnect call in the INIT block ran *above* the `let _hrConnected` declaration, so it threw a
> temporal‑dead‑zone rejection on every load and **auto‑reconnect never actually ran**. Fixed by deferring the call
> one tick (`setTimeout(hrTryReconnect, 0)`) so it fires after the script finishes initializing.
