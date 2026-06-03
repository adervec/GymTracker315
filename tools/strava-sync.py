#!/usr/bin/env python3
"""
strava-sync.py - pull your Strava strength activities into a JSON that GymTracker can import,
and (optionally) push GymTracker workout descriptions back onto those activities.

WHY A SCRIPT?  A browser app can't talk to Strava directly: the OAuth token exchange needs
your Client Secret and Strava's API isn't CORS-enabled for browsers. This runs locally with
your own API application and your own data (which Strava's API terms allow for personal use).

ONE-TIME SETUP
  1. Create an API application: https://www.strava.com/settings/api
       - Set "Authorization Callback Domain" to:  localhost
     Note the Client ID and Client Secret.
  2. No pip install needed - this uses only the Python standard library.
  3. First run opens your browser to authorize and stores a refresh token in strava-token.json
     (kept next to this script; treat it like a password - it's git-ignored by default).

USAGE
  py strava-sync.py --auth                       # one-time: authorize (read + write, opens browser)
  py strava-sync.py [--days 30] [--out strava-activities.json]
  py strava-sync.py --push strava-push.json      # write GymTracker descriptions back to Strava

Then in GymTracker:  Settings -> Data -> Strava -> "Import activities" -> pick the JSON,
then "Reconcile" to link workouts, enrich HR/calories/duration, and copy descriptions.

NOTE: Strava rotates refresh tokens and rate-limits (~100 req / 15 min). The activity list is
"summary" data; that's all GymTracker needs to match by start time. Adjust if Strava changes.
"""
import os
import sys
import json
import time
import urllib.parse
import urllib.request
import urllib.error
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(HERE, "strava-token.json")
API = "https://www.strava.com/api/v3"
TOKEN_URL = "https://www.strava.com/oauth/token"
PORT = 8723
STRENGTH = ("weighttraining", "workout", "crossfit", "hiit", "strengthtraining")


def _post(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def _put(url, token, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="PUT",
                                 headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def load_cfg():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            return json.load(f)
    return {}


def save_cfg(cfg):
    with open(TOKEN_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def authorize(write=False):
    cfg = load_cfg()
    cid = cfg.get("client_id") or input("Strava Client ID: ").strip()
    secret = cfg.get("client_secret") or input("Strava Client Secret: ").strip()
    scope = "activity:read_all,activity:write" if write else "activity:read_all"
    captured = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            captured["code"] = params.get("code", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>GymTracker: Strava authorized. You can close this tab.</h2>")

        def log_message(self, *a):
            pass

    redirect = "http://localhost:%d" % PORT
    auth_url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": cid, "response_type": "code", "redirect_uri": redirect,
        "approval_prompt": "auto", "scope": scope})
    print("Opening browser to authorize ...")
    webbrowser.open(auth_url)
    print("If it doesn't open, paste this into your browser:\n" + auth_url)
    HTTPServer(("localhost", PORT), Handler).handle_request()  # serve exactly one redirect
    code = captured.get("code")
    if not code:
        print("No authorization code received (did you click Authorize?).")
        sys.exit(1)
    tok = _post(TOKEN_URL, {"client_id": cid, "client_secret": secret,
                            "code": code, "grant_type": "authorization_code"})
    cfg.update({"client_id": cid, "client_secret": secret, "refresh_token": tok["refresh_token"]})
    save_cfg(cfg)
    print("Authorized. Tokens stored in", TOKEN_FILE)
    return cfg


def access_token(cfg):
    tok = _post(TOKEN_URL, {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                            "refresh_token": cfg["refresh_token"], "grant_type": "refresh_token"})
    if tok.get("refresh_token") and tok["refresh_token"] != cfg.get("refresh_token"):
        cfg["refresh_token"] = tok["refresh_token"]
        save_cfg(cfg)  # Strava rotates refresh tokens
    return tok["access_token"]


def pull(days, out):
    cfg = load_cfg()
    if not cfg.get("refresh_token"):
        cfg = authorize(write=False)
    try:
        token = access_token(cfg)
    except urllib.error.HTTPError as e:
        print("Token refresh failed (%s). Re-run with --auth." % e.code)
        sys.exit(1)
    after = int(time.time()) - days * 86400
    acts, page = [], 1
    while True:
        batch = _get("%s/athlete/activities?after=%d&per_page=200&page=%d" % (API, after, page), token)
        if not batch:
            break
        acts.extend(batch)
        if len(batch) < 200:
            break
        page += 1
    strength = [a for a in acts if str(a.get("sport_type") or a.get("type") or "").lower() in STRENGTH]
    data = {"activities": [{
        "id": a["id"],
        "name": a.get("name", "Workout"),
        "sport_type": a.get("sport_type") or a.get("type"),
        "start_date": a.get("start_date"),
        "elapsed_time": a.get("elapsed_time"),
        "average_heartrate": a.get("average_heartrate"),
        "max_heartrate": a.get("max_heartrate"),
        "calories": a.get("calories"),
    } for a in strength]}
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    print("Wrote %d strength activit%s (of %d total) -> %s"
          % (len(strength), "y" if len(strength) == 1 else "ies", len(acts), os.path.abspath(out)))
    print("Import it in GymTracker: Settings -> Data -> Strava -> Import activities.")


def push(path):
    cfg = load_cfg()
    if not cfg.get("refresh_token"):
        print("Run --auth first (it requests write access).")
        sys.exit(1)
    token = access_token(cfg)
    with open(path) as f:
        items = json.load(f)
    ok = 0
    for it in items:
        try:
            _put("%s/activities/%s" % (API, it["id"]), token, {"description": it.get("description", "")})
            ok += 1
        except urllib.error.HTTPError as e:
            print("  activity %s: %s %s (need activity:write scope? re-run --auth)"
                  % (it.get("id"), e.code, e.reason))
    print("Pushed %d/%d descriptions." % (ok, len(items)))


def main():
    args = sys.argv[1:]
    if "--auth" in args:
        authorize(write=True)
        return
    if "--push" in args:
        push(args[args.index("--push") + 1])
        return
    days = int(args[args.index("--days") + 1]) if "--days" in args else 30
    out = args[args.index("--out") + 1] if "--out" in args else "strava-activities.json"
    pull(days, out)


if __name__ == "__main__":
    main()
