#!/usr/bin/env python3
"""
youtube-media.py - match a creator's YouTube Shorts to your GymTracker exercises and emit a media
map you can bulk-import (Settings -> Data -> Exercise media -> "Import media map").

WHY A SCRIPT?  A browser can't enumerate a channel's Shorts or call the YouTube Data API with a
secret key, and writing video IDs by hand would just create broken embeds. So the matching runs
here against the OFFICIAL API and produces real, verifiable video IDs -- only where a title match
is found.

SETUP (once)
  1. Free YouTube Data API v3 key: https://console.cloud.google.com/ -> APIs & Services ->
     enable "YouTube Data API v3" -> Credentials -> create an API key.
  2. In GymTracker: Settings -> Data -> Exercise media -> "Export exercise list"
     (saves gymtracker-exercises.json). Put it next to this script.
  3. No pip install needed - Python standard library only.

RUN
  set YT_API_KEY=your_key                 (Windows cmd;  export YT_API_KEY=... on mac/linux)
  py youtube-media.py [exercises.json] [out.json]
  Defaults: exercises = gymtracker-exercises.json, out = gymtracker-media-map.json
  Channels: @fitonomycoaching and @pathradecha (edit CHANNELS below to add/change creators).

Then in GymTracker: Settings -> Data -> Exercise media -> "Import media map" -> pick the JSON.

NOTE: matching is heuristic (exercise-name token coverage of the video title); Shorts <= ~60s are
kept. Review afterwards -- each exercise's media carousel lets you remove any mismatch. The API has
a daily quota; one full run of two channels is well within the free tier.
"""
import os
import re
import sys
import json
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3"
CHANNELS = [                       # (handle, source tag)
    ("@fitonomycoaching", "fitonomy"),
    ("@pathradecha", "pathradecha"),
]
MIN_COVERAGE = 0.7                 # fraction of an exercise's tokens that must appear in the title
MIN_TOKENS = 2                     # ignore exercises with fewer meaningful tokens (too generic)
SHORT_MAX_SEC = 65

STOP = set((
    "the a an and or to for with your you i do how does what best top of on in at is are this that "
    "exercise workout form tutorial proper correct guide tips tip variation variations move moves "
    "movement gym home fitness training train muscle muscles build grow get got fix stop start "
    "better perfect ultimate full body day"
).split())


def norm_tokens(s):
    toks = re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split()
    return set(t for t in toks if t not in STOP and len(t) > 1)


def api_get(path, params):
    p = dict(params)
    p["key"] = KEY
    url = API + path + "?" + urllib.parse.urlencode(p)
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def resolve_uploads(handle):
    try:
        d = api_get("/channels", {"part": "contentDetails", "forHandle": handle})
        items = d.get("items") or []
        if items:
            return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    except Exception:
        pass
    d = api_get("/search", {"part": "snippet", "q": handle.lstrip("@"), "type": "channel", "maxResults": 1})
    items = d.get("items") or []
    if not items:
        return None
    cid = items[0]["snippet"]["channelId"]
    d2 = api_get("/channels", {"part": "contentDetails", "id": cid})
    return d2["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]


def list_uploads(playlist):
    vids, token = [], None
    while True:
        params = {"part": "snippet,contentDetails", "playlistId": playlist, "maxResults": 50}
        if token:
            params["pageToken"] = token
        d = api_get("/playlistItems", params)
        for it in d.get("items", []):
            vids.append((it["snippet"]["title"], it["contentDetails"]["videoId"]))
        token = d.get("nextPageToken")
        if not token:
            break
    return vids


def iso_seconds(dur):
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", dur or "")
    if not m:
        return 9999
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def durations(ids):
    out = {}
    for i in range(0, len(ids), 50):
        d = api_get("/videos", {"part": "contentDetails", "id": ",".join(ids[i:i + 50])})
        for it in d.get("items", []):
            out[it["id"]] = iso_seconds(it["contentDetails"]["duration"])
    return out


def best_match(title, exercises):
    vt = norm_tokens(title)
    if not vt:
        return None
    best, best_score, best_len = None, 0.0, 0
    for ex in exercises:
        et = ex["_tokens"]
        if len(et) < MIN_TOKENS:
            continue
        score = sum(1 for t in et if t in vt) / float(len(et))
        if score > best_score or (score == best_score and len(et) > best_len):
            best, best_score, best_len = ex, score, len(et)
    return (best, best_score) if best and best_score >= MIN_COVERAGE else None


def main():
    global KEY
    KEY = os.environ.get("YT_API_KEY") or input("YouTube Data API key: ").strip()
    ex_path = sys.argv[1] if len(sys.argv) > 1 else "gymtracker-exercises.json"
    out_path = sys.argv[2] if len(sys.argv) > 2 else "gymtracker-media-map.json"
    with open(ex_path) as f:
        data = json.load(f)
    exercises = []
    for v in data.get("variations", []):        # variations preferred (more specific)
        exercises.append({"key": {"uuid": v["uuid"]}, "title": v["title"], "_tokens": norm_tokens(v["title"])})
    for m in data.get("movements", []):
        exercises.append({"key": {"id": m["id"]}, "title": m["title"], "_tokens": norm_tokens(m["title"])})
    print("Loaded %d exercises." % len(exercises))

    best_for = {}                                 # (key-json, source) -> best candidate
    for handle, source in CHANNELS:
        print("Channel %s ..." % handle)
        up = resolve_uploads(handle)
        if not up:
            print("  could not resolve channel"); continue
        vids = list_uploads(up)
        dur = durations([vid for _, vid in vids])
        shorts = [(t, vid) for (t, vid) in vids if dur.get(vid, 9999) <= SHORT_MAX_SEC]
        print("  %d uploads, %d shorts" % (len(vids), len(shorts)))
        for title, vid in shorts:
            mm = best_match(title, exercises)
            if not mm:
                continue
            ex, score = mm
            ks = (json.dumps(ex["key"], sort_keys=True), source)
            prev = best_for.get(ks)
            if not prev or score > prev["score"]:
                best_for[ks] = {"score": score, "vid": vid, "title": ex["title"], "key": ex["key"], "source": source}

    media = []
    for v in best_for.values():
        entry = dict(v["key"])
        entry["url"] = "https://www.youtube.com/shorts/%s" % v["vid"]
        entry["match"] = v["title"]
        entry["source"] = v["source"]
        media.append(entry)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"media": media}, f, indent=2)
    print("Wrote %d matched clips -> %s" % (len(media), os.path.abspath(out_path)))
    print("Import in GymTracker: Settings -> Data -> Exercise media -> Import media map.")


if __name__ == "__main__":
    main()
