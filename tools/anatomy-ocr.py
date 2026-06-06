#!/usr/bin/env python3
"""
anatomy-ocr.py — map an uploaded hi-res anatomy chart to GymTracker glossary terms (feat 118).

GymTracker is a single offline HTML file with NO external scripts, so a robust OCR engine can't live
in the app. Instead you run this one-time desktop helper on your labelled chart; it OCRs the English
labels, follows each label's leader line to its muscle, and writes a small JSON "label map". Import that
map (+ the image) in the app's glossary anatomy chart to unlock the Detailed Chart View with tap targets.

Assumptions (per the feature spec): labels are English text, each with a thin line pointing from the
text to its muscle area. Where no leader line is found, the label's own position is used as a fallback.

USAGE
    python tools/anatomy-ocr.py chart.png -o anatomy-map.json
    python tools/anatomy-ocr.py chart.jpg -o map.json --no-lines      # use label positions only
    python tools/anatomy-ocr.py chart.png -o map.json --debug          # also write chart.debug.png

DEPENDENCIES (all standard, permissively-licensed OSS — no ToS concerns)
    pip install pytesseract opencv-python pillow numpy
    plus the Tesseract OCR engine binary:
      - Windows : https://github.com/UB-Mannheim/tesseract/wiki  (then add it to PATH)
      - macOS   : brew install tesseract
      - Linux   : sudo apt install tesseract-ocr

OUTPUT (normalized 0..1 coordinates relative to the image; import this in the app)
    { "version": 1, "image": "chart.png", "size": [W, H],
      "terms": [ { "term": "Lats", "label": "Latissimus Dorsi", "x": 0.31, "y": 0.44 }, ... ] }
"""
import argparse
import json
import os
import sys

# Canonical GymTracker anatomy glossary terms -> OCR alias keywords (mirrors ANATOMY_REGIONS in the app).
TERM_ALIASES = {
    "Pec / Pectorals":    ["pectoralis", "pectoral", "pec", "chest"],
    "Delts":              ["deltoid", "delt", "shoulder"],
    "Bis / Biceps":       ["biceps brachii", "biceps", "bicep"],
    "Forearms":           ["brachioradialis", "forearm", "flexor", "extensor"],
    "Core":               ["rectus abdominis", "abdominis", "abdominal", "core", "abs"],
    "Obliques":           ["external oblique", "oblique"],
    "Adductors":          ["adductor"],
    "Quads / Quadriceps": ["quadriceps", "rectus femoris", "vastus", "quad"],
    "Tibialis Anterior":  ["tibialis"],
    "Traps":              ["trapezius", "trap"],
    "Lats":               ["latissimus dorsi", "latissimus", "lat"],
    "Tris / Triceps":     ["triceps brachii", "triceps", "tricep"],
    "Erectors":           ["erector spinae", "erector", "spinae"],
    "Glutes":             ["gluteus maximus", "gluteus", "gluteal", "glute"],
    "Hams / Hamstrings":  ["biceps femoris", "semitendinosus", "semimembranosus", "hamstring"],
    "Calves":             ["gastrocnemius", "soleus", "calves", "calf"],
}


def die(msg, code=1):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(code)


def load_terms(path):
    """Optional override: a text file with one 'Term: alias, alias' line, or just 'Term' per line."""
    if not path:
        return dict(TERM_ALIASES)
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                term, rest = line.split(":", 1)
                aliases = [a.strip().lower() for a in rest.split(",") if a.strip()]
            else:
                term, aliases = line, []
            term = term.strip()
            if term:
                out[term] = aliases or [term.lower()]
    return out or dict(TERM_ALIASES)


def match_term(text, terms):
    """Best glossary term for an OCR phrase: longest alias that is a substring wins (then fuzzy)."""
    t = text.lower()
    best, best_len = None, 0
    for term, aliases in terms.items():
        for a in aliases:
            if a and a in t and len(a) > best_len:
                best, best_len = term, len(a)
    if best:
        return best
    # fuzzy fallback for OCR noise
    import difflib
    cands = []
    for term, aliases in terms.items():
        for a in aliases + [term.lower()]:
            cands.append((a, term))
    names = [c[0] for c in cands]
    close = difflib.get_close_matches(t, names, n=1, cutoff=0.82)
    if close:
        return dict(cands)[close[0]]
    return None


def ocr_labels(image_path, min_conf):
    """Return [(text, x, y, w, h)] label phrases (grouped per text line) from Tesseract."""
    try:
        import cv2
        import numpy as np
        import pytesseract
    except ImportError as e:
        die("missing dependency: %s\n  pip install pytesseract opencv-python pillow numpy" % e.name)
    img = cv2.imread(image_path)
    if img is None:
        die("could not read image: " + image_path)
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # mild upscaling + Otsu threshold tends to help label OCR
    scale = 2 if max(W, H) < 1600 else 1
    if scale != 1:
        gray = cv2.resize(gray, (W * scale, H * scale), interpolation=cv2.INTER_CUBIC)
    _, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    data = pytesseract.image_to_data(thr, output_type=pytesseract.Output.DICT)
    lines = {}
    n = len(data["text"])
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        try:
            conf = float(data["conf"][i])
        except (ValueError, TypeError):
            conf = -1
        if not txt or conf < min_conf:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        g = lines.setdefault(key, {"words": [], "x0": x, "y0": y, "x1": x + w, "y1": y + h})
        g["words"].append(txt)
        g["x0"] = min(g["x0"], x); g["y0"] = min(g["y0"], y)
        g["x1"] = max(g["x1"], x + w); g["y1"] = max(g["y1"], y + h)
    out = []
    for g in lines.values():
        text = " ".join(g["words"]).strip()
        if len(text) < 2:
            continue
        bx = (g["x0"] / scale, g["y0"] / scale, (g["x1"] - g["x0"]) / scale, (g["y1"] - g["y0"]) / scale)
        out.append((text, bx[0], bx[1], bx[2], bx[3]))
    return out, (W, H)


def detect_lines(image_path):
    """Leader-line segments as [((x1,y1),(x2,y2))] via probabilistic Hough on Canny edges."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []
    img = cv2.imread(image_path)
    if img is None:
        return []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    segs = cv2.HoughLinesP(edges, 1, 3.14159 / 180, threshold=40, minLineLength=25, maxLineGap=6)
    if segs is None:
        return []
    return [((int(s[0][0]), int(s[0][1])), (int(s[0][2]), int(s[0][3]))) for s in segs]


def target_for_label(bx, segs, max_attach):
    """Follow the leader line: the segment endpoint nearest the label -> the FAR endpoint is the target."""
    cx, cy = bx[0] + bx[2] / 2.0, bx[1] + bx[3] / 2.0
    best, best_d = None, max_attach
    for (p1, p2) in segs:
        for near, far in ((p1, p2), (p2, p1)):
            d = ((near[0] - cx) ** 2 + (near[1] - cy) ** 2) ** 0.5
            if d < best_d:
                best_d, best = d, far
    return best if best else (cx, cy)


def main():
    ap = argparse.ArgumentParser(description="OCR an anatomy chart into a GymTracker label map (feat 118).")
    ap.add_argument("image", help="path to the labelled anatomy chart (png/jpg)")
    ap.add_argument("-o", "--output", default="anatomy-map.json", help="output JSON path")
    ap.add_argument("--terms", help="optional term/alias override file")
    ap.add_argument("--no-lines", action="store_true", help="ignore leader lines; use label positions")
    ap.add_argument("--min-conf", type=float, default=40, help="min Tesseract word confidence (default 40)")
    ap.add_argument("--max-attach-frac", type=float, default=0.12,
                    help="max label->line-endpoint distance, as a fraction of image diagonal (default 0.12)")
    ap.add_argument("--debug", action="store_true", help="also write <image>.debug.png with detected targets")
    args = ap.parse_args()

    if not os.path.isfile(args.image):
        die("no such file: " + args.image)
    terms = load_terms(args.terms)
    labels, (W, H) = ocr_labels(args.image, args.min_conf)
    segs = [] if args.no_lines else detect_lines(args.image)
    max_attach = (W * W + H * H) ** 0.5 * args.max_attach_frac

    mapped, seen = [], {}
    for (text, x, y, w, h) in labels:
        term = match_term(text, terms)
        if not term:
            continue
        tx, ty = target_for_label((x, y, w, h), segs, max_attach) if segs else (x + w / 2.0, y + h / 2.0)
        entry = {"term": term, "label": text,
                 "x": round(max(0.0, min(1.0, tx / W)), 4), "y": round(max(0.0, min(1.0, ty / H)), 4)}
        # keep the first (usually highest-confidence) hit per term
        if term not in seen:
            seen[term] = entry
            mapped.append(entry)

    out = {"version": 1, "image": os.path.basename(args.image), "size": [W, H], "terms": mapped}
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print("OCR'd %d label line(s); matched %d/%d glossary terms." % (len(labels), len(mapped), len(terms)))
    for e in mapped:
        print("  %-22s <- %-28s @ (%.3f, %.3f)" % (e["term"], e["label"][:28], e["x"], e["y"]))
    missing = [t for t in terms if t not in seen]
    if missing:
        print("Unmatched terms (add them by hand in the app, or improve the scan): " + ", ".join(missing))
    print("Wrote " + args.output)

    if args.debug:
        try:
            import cv2
            img = cv2.imread(args.image)
            for e in mapped:
                px, py = int(e["x"] * W), int(e["y"] * H)
                cv2.circle(img, (px, py), 10, (0, 200, 0), 2)
                cv2.putText(img, e["term"], (px + 12, py), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 0), 1)
            dbg = os.path.splitext(args.image)[0] + ".debug.png"
            cv2.imwrite(dbg, img)
            print("Wrote " + dbg)
        except Exception as ex:  # noqa: BLE001 - debug aid only
            print("debug image skipped: %s" % ex)


if __name__ == "__main__":
    main()
