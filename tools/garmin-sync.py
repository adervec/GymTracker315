#!/usr/bin/env python3
"""
garmin-sync.py - pull recent biometrics from your Garmin Connect account and write a
small JSON that GymTracker315 can import (Body tab -> "Import biometrics").

WHY A SCRIPT?  A browser app cannot read Garmin directly: there is no public per-user
read API, Garmin's internal Connect endpoints are not CORS-enabled and sit behind an SSO
login, and the page has no access to the phone's health store. So the data has to arrive
as a file. This script logs in locally with YOUR credentials (nothing leaves your machine
except the call to Garmin) and writes a JSON in the exact shape the app imports.

Index S2 smart-scale metrics (weight / body fat / muscle mass / bone mass / body water)
map 1:1 to the app's body-composition entry, plus optional last-night sleep score.

NOTE (unofficial - read before using): Garmin provides no public per-user read API, so this relies
on the community `garminconnect` library, which talks to Garmin Connect's private, undocumented
endpoints using your login. That may conflict with Garmin's Terms of Service, and the endpoints can
change or be blocked at any time. Use it for your OWN personal data only, at your own risk, and check
Garmin's current terms. The Strava and YouTube helpers, by contrast, use official APIs with your own keys.

----------------------------------------------------------------------------------------
SETUP (once):
    py -m pip install garminconnect          (Windows)   or   pip3 install garminconnect

RUN:
    set GARMIN_EMAIL=you@example.com          (Windows cmd; or use PowerShell $env:)
    set GARMIN_PASSWORD=yourpassword
    py garmin-sync.py [days] [outfile.json]

    - days    : how many days back to pull (default 14)
    - outfile : where to write (default gymtracker-biometrics.json in the current folder)

If you omit the env vars it will prompt. If your account uses MFA, enter the code when
asked. Then load it in the app one of two ways:
    - One-off:    Body tab -> "Import biometrics" -> pick the JSON.
    - Hands-off:  Settings -> Data -> "Biometrics Auto-Load (Garmin)" -> Pick Folder, and
                  point it at the folder this script writes to. The app remembers the folder
                  and re-imports the newest biometrics file on every load (and on Sync Now).
                  Keep the output filename containing "biometrics"/"garmin"/"gymtracker" so
                  the folder watcher recognises it. Re-run this script (e.g. on a schedule)
                  to keep the app current.

OUTPUT SHAPE (also accepted hand-made or from any source):
    {
      "bodyComp": [
        {"date":"2026-06-01","weightKg":81.2,"bodyFatPct":18.4,
         "muscleMassKg":34.1,"boneMassKg":3.2,"bodyWaterPct":55.1}
      ],
      "sleep": [ {"date":"2026-06-01","score":78,"note":"7h12m"} ]
    }
weightKg/muscleMassKg/boneMassKg are kilograms; *Pct are percentages. Missing fields are
fine (use null or omit). The app dedupes by calendar day and merges into existing data.

NOTE: Garmin's unofficial API changes from time to time. If a field comes back empty,
print the raw record (uncomment the debug line) and adjust the key names below - the app
side of the contract (the JSON shape above) is stable.
"""
import os
import sys
import json
import datetime


def _g(d, *keys):
    """First non-None value among keys from dict d."""
    for k in keys:
        if isinstance(d, dict) and d.get(k) is not None:
            return d.get(k)
    return None


def grams_to_kg(v):
    return round(v / 1000.0, 2) if isinstance(v, (int, float)) else None


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 14
    out = sys.argv[2] if len(sys.argv) > 2 else "gymtracker-biometrics.json"

    try:
        from garminconnect import Garmin
    except ImportError:
        print("Missing dependency. Install it with:  py -m pip install garminconnect")
        sys.exit(1)

    email = os.environ.get("GARMIN_EMAIL") or input("Garmin email: ").strip()
    password = os.environ.get("GARMIN_PASSWORD")
    if not password:
        import getpass
        password = getpass.getpass("Garmin password: ")

    print("Logging in to Garmin Connect ...")
    api = Garmin(email, password)
    try:
        api.login()
    except Exception as e:
        # Newer garminconnect versions may need an MFA code or token store.
        print("Login failed: %s" % e)
        print("If your account uses MFA, run garminconnect's token setup once, or see")
        print("https://github.com/cyberjunky/python-garminconnect for the MFA flow.")
        sys.exit(1)

    today = datetime.date.today()
    start = today - datetime.timedelta(days=days - 1)
    body_comp = []
    sleep = []

    # --- Body composition: one range call, iterate each scale reading ---------------
    try:
        bc = api.get_body_composition(start.isoformat(), today.isoformat())
        for s in (bc or {}).get("dateWeightList", []) or []:
            # s["date"] is epoch milliseconds; weight + masses are in grams.
            # print(s)  # <- uncomment to inspect raw keys if a field is missing
            ts = _g(s, "date", "calendarDate", "timestampGMT")
            if isinstance(ts, (int, float)):
                day = datetime.datetime.fromtimestamp(ts / 1000.0).date().isoformat()
            elif isinstance(ts, str):
                day = ts[:10]
            else:
                continue
            weight_g = _g(s, "weight")
            if not weight_g:
                continue
            body_comp.append({
                "date": day,
                "weightKg": grams_to_kg(weight_g),
                "bodyFatPct": _g(s, "bodyFat"),
                "muscleMassKg": grams_to_kg(_g(s, "muscleMass")),
                "boneMassKg": grams_to_kg(_g(s, "boneMass")),
                "bodyWaterPct": _g(s, "bodyWater"),
            })
    except Exception as e:
        print("Could not read body composition: %s" % e)

    # --- Sleep score: per-day (no range endpoint) -----------------------------------
    for i in range(days):
        d = (today - datetime.timedelta(days=i)).isoformat()
        try:
            sl = api.get_sleep_data(d)
            dto = (sl or {}).get("dailySleepDTO") or {}
            scores = dto.get("sleepScores") or {}
            score = ((scores.get("overall") or {}).get("value")) if scores else None
            secs = dto.get("sleepTimeSeconds")
            note = ""
            if isinstance(secs, (int, float)) and secs > 0:
                note = "%dh%02dm" % (int(secs) // 3600, (int(secs) % 3600) // 60)
            if score is not None or note:
                sleep.append({"date": d, "score": score, "note": note})
        except Exception:
            pass  # a given day may simply have no sleep record

    data = {"bodyComp": body_comp, "sleep": sleep}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("Wrote %d body-composition + %d sleep record(s) -> %s"
          % (len(body_comp), len(sleep), os.path.abspath(out)))
    print("Now in GymTracker315: Body tab -> Import biometrics -> pick this file.")


if __name__ == "__main__":
    main()
