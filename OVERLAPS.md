# Overlaps

Places where this app and another app, or the hub, hold the same data, do the same job, or could
feed each other (house standard 27). Written down, not acted on: building one is the maker's call,
after a plan. The hub's register is `../CoworkSyncHub/OVERLAPS.md`.

Reviewed: 2026-11-22

- [idea] GymTracker + Run315 + CelebrityCrusher + BlackMirrorBikeRide: each takes in the same Garmin and Strava activities its own way -> fetch once (the runner's Garmin and Strava connectors), keep one `shared-activities.json` in the shared Drive folder with Run315 as owner, the others read it (from the hub register)
- [idea] GymTracker + Run315: a run can be logged as cardio in both -> GymTracker's cardio reads Run315's runs instead of storing its own (the hub's ledger already counts a double-logged run once) (from the hub register)
- [idea] GymTracker + BodybuildingProgressCoach + MacroTrackro: weight and body composition are kept separately in each -> one `shared-body.json` with one owner; macro targets and physique trends read it (from the hub register)
- [idea] MacroTrackro + GymTracker + Run315: daily calorie targets ignore the day's training -> MacroTrackro reads the day's sessions (the hub ledger, or shared-activities) to adjust the target (from the hub register)
- [idea] BodybuildingProgressCoach + GymTracker: photos and posing sit apart from the training blocks that explain them -> show the training block beside a progress timelapse (read-only) (from the hub register)
- [idea] InsightMaster + GymTracker: recovery metrics from the wearable and meditation sits are both "recovery" -> the hub's VIT and PSI could read both; no app change (from the hub register)
- [idea] GymTracker + Run315 + BlackMirrorBikeRide: GymTracker now keeps a rough outline of a Strava activity's route (64 points, shape only) while the others hold full GPX routes -> if `shared-activities.json` happens, the outline is derived from it instead of asked for in GymTracker's own Strava cowork reply
- [idea] GymTracker + SpeechImprover + any app that records audio: GymTracker's custom sounds record from the microphone, trim and store clips its own way -> one shared record-and-trim helper in font.js
- [idea] GymTracker + every app with Drive sync: GymTracker still carries its own Google sign-in and Drive code -> move onto font.js `appFont.google` so one sign-in serves every app (standard 1's to-do)
- [done] GymTracker + the AI runner: GymTracker reads the runner's shared-activities.json and shared-body.json instead of its own Garmin and Strava cowork channels (feat 590)
- [idea] GymTracker + the AI runner: the fitness feed has no sleep, daily recovery (HRV, body battery, resting HR), activity name or map, which GymTracker's old Garmin and Strava channels brought in -> the runner adds them to shared-activities.json / a shared-sleep.json, and GymTracker's sleep analysis, readiness and route outlines read them
