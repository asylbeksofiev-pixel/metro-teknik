"""Crawl the live metro-teknik.net site once per language session.

The live site keeps the language only in the PHP session (POST /site/clang),
so each language gets its own requests.Session. Raw HTML is saved under
raw/<lang>/ and a manifest of every fetched URL (with redirects) is written
to raw/<lang>/manifest.json.
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

BASE = "https://metro-teknik.net"
LANGS = {"tr": "tr_tr", "en": "en_us", "ru": "ru_ru"}
ROOT = Path(r"C:/Users/Daniy/AppData/Local/Temp/mt/raw")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MetroTeknikRedesignAudit/1.0"
SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|mp4|ico|css|js)$", re.I)


def norm(url):
    url, _ = urldefrag(url)
    p = urlparse(url)
    if p.netloc and p.netloc.replace("www.", "") != "metro-teknik.net":
        return None
    path = p.path or "/"
    query = "&".join(q for q in p.query.split("&") if q and not q.startswith("lng="))
    if path.startswith("/assets") or path.startswith("/site/clang"):
        return None
    if SKIP_EXT.search(path):
        return None
    return path + (("?" + query) if query else "")


def fname(path):
    s = path.strip("/").replace("/", "__").replace("?", "_q_").replace("&", "_") or "index"
    return s + ".html"


def crawl(lang, code):
    out = ROOT / lang
    out.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    s.headers["User-Agent"] = UA
    s.get(BASE + "/", timeout=30)
    s.post(BASE + "/site/clang", data={"lng": code, "refurl": ""}, timeout=30)
    seen, queue, manifest = set(), ["/"], {}
    if lang != "tr" and (ROOT / "tr" / "manifest.json").exists():
        queue += [k for k in json.loads((ROOT / "tr" / "manifest.json").read_text(encoding="utf-8")) if "?" not in k]
    sm = requests.get(BASE + "/sitemap.xml", timeout=30, headers={"User-Agent": UA}).text
    for loc in re.findall(r"<loc>([^<]+)</loc>", sm):
        n = norm(loc.replace("http://", "https://"))
        if n:
            queue.append(n)
    assets = set()
    while queue:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        try:
            r = s.get(BASE + path, timeout=30, allow_redirects=True)
        except requests.RequestException as e:
            manifest[path] = {"error": str(e)}
            continue
        m = re.search(r'<html lang="([^"]+)"', r.text)
        if m and m.group(1) != lang:
            # session language drifted (e.g. a ?lng= link); re-assert and retry once
            s.post(BASE + "/site/clang", data={"lng": code, "refurl": ""}, timeout=30)
            r = s.get(BASE + path, timeout=30, allow_redirects=True)
            m = re.search(r'<html lang="([^"]+)"', r.text)
        hops = [h.headers.get("Location") for h in r.history]
        final = norm(r.url) or r.url
        manifest[path] = {"status": r.status_code, "final": final, "redirects": hops, "lang": m.group(1) if m else None}
        if r.status_code != 200 or "text/html" not in r.headers.get("Content-Type", ""):
            continue
        if final != path and final in seen:
            continue
        seen.add(final)
        (out / fname(final)).write_text(r.text, encoding="utf-8")
        soup = BeautifulSoup(r.text, "html.parser")
        for tag, attr in (("a", "href"), ("img", "src"), ("a", "data-href")):
            for el in soup.find_all(tag):
                v = el.get(attr)
                if not v or v.startswith(("mailto:", "tel:", "javascript:", "#")):
                    continue
                absu = urljoin(BASE + final, v)
                if SKIP_EXT.search(urlparse(absu).path):
                    if "metro-teknik.net" in absu:
                        assets.add(absu)
                    continue
                n = norm(absu)
                if n and n not in seen:
                    queue.append(n)
        for m in re.findall(r"url\(['\"]?([^'\")]+)", r.text):
            absu = urljoin(BASE + final, m)
            if "metro-teknik.net" in absu and SKIP_EXT.search(urlparse(absu).path):
                assets.add(absu)
        time.sleep(0.15)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "assets.json").write_text(json.dumps(sorted(assets), ensure_ascii=False, indent=1), encoding="utf-8")
    print(lang, "pages:", len([v for v in manifest.values() if v.get("status") == 200]), "assets:", len(assets))


if __name__ == "__main__":
    for lang in sys.argv[1:] or LANGS:
        crawl(lang, LANGS[lang])
