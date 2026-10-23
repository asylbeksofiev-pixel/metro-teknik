"""Static checks on dist/: translations, language mixing, SEO metadata, internal links, Kazakh glyphs.

Usage: python tools/check_content.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
BASE = "https://metro-teknik.net"
LANGS = ["tr", "en", "ru", "kk"]
KK_ONLY = set("ӘәҒғҚқҢңӨөҰұҮүҺһІі")
TR_ONLY = re.compile(r"[ğĞışŞİ]")
# Turkish proper names that are allowed to stay in Turkish on Kazakh pages (registered names, addresses, people)
ALLOWED_TR = re.compile(r"(İNŞAAT|İnşaat|HOLDİNG|GEMTAŞ|METRO TEKNİK|METRO-TEKNİK|Metro Teknik İnşaat İklimlendirme|HÜSEYİN TÜRKAN|Bilişim|TEKNİK2011|METROTEKNİK|Tersane İstanbul|Ltd\. Şti\.|Zühtü Paşa|Kızıltoprak|Kadıköy|İstanbul|Türkiye|Çınarlı|İnönü|Günep|Kuruköprü|İş Merk)")

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(flatten(v, prefix + k + "."))
        else:
            out[prefix + k] = v
    return out


# 1. i18n key parity and empty values
keys = {l: flatten(json.loads((ROOT / "i18n" / f"{l}.json").read_text(encoding="utf-8"))) for l in LANGS}
for l in LANGS:
    for k in set(keys["tr"]) - set(keys[l]):
        err(f"i18n/{l}.json missing key {k}")
    for k in set(keys[l]) - set(keys["tr"]):
        err(f"i18n/{l}.json has extra key {k}")
    for k, v in keys[l].items():
        if isinstance(v, str) and not v.strip():
            err(f"i18n/{l}.json empty value {k}")

routes = json.loads((DIST / "_routes.json").read_text(encoding="utf-8"))
url_index = routes["url_index"]
pages = routes["pages"]

# 2. every page id that exists in Turkish exists in Kazakh
for pid, langs in pages.items():
    if "tr" in langs and "kk" not in langs:
        err(f"no Kazakh version for {pid}")

titles = Counter()
for u, (pid, lang) in url_index.items():
    f = DIST / "index.html" if u == "/" else DIST / (u.lstrip("/") + ".html")
    soup = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
    html_lang = soup.html.get("lang")
    if html_lang != lang:
        err(f"{u}: html lang={html_lang}, expected {lang}")
    # canonical is self-referencing
    can = soup.find("link", rel="canonical")["href"]
    if can != BASE + u:
        err(f"{u}: canonical {can}")
    # hreflang alternates are reciprocal and match routes
    alts = {a["hreflang"]: a["href"] for a in soup.find_all("link", rel="alternate") if a.get("hreflang")}
    expected = {l: BASE + pages[pid][l] for l in LANGS if l in pages[pid]}
    if len(expected) > 1:
        exp = dict(expected)
        exp["x-default"] = BASE + pages[pid]["tr"]
        if alts != exp:
            err(f"{u}: hreflang mismatch {alts} != {exp}")
    title = soup.title.get_text()
    desc = soup.find("meta", attrs={"name": "description"})["content"]
    if not title.strip() or not desc.strip():
        err(f"{u}: empty title/description")
    titles[(lang, title)] += 1
    text = soup.body.get_text(" ")
    # raw keys / placeholders
    for pat in (r"\{[a-z_]+\}", r"\b(nav|common|facts|gallery|home|projects|contact|footer)\.[a-z_]+\b", r"None\b", r"undefined"):
        m = re.search(pat, text)
        if m:
            err(f"{u}: raw template text '{m.group(0)}'")
    # internal links resolve
    for a in soup.find_all("a", href=True):
        h = a["href"]
        if h.startswith("/page/") or h == "/":
            path = h.split("?")[0].split("#")[0]
            if path not in url_index and path not in routes["aliases"]:
                err(f"{u}: broken internal link {h}")
        if a.get("target") == "_blank" and "noopener" not in (a.get("rel") or []):
            err(f"{u}: target=_blank without rel=noopener: {h}")
    # language mixing on Kazakh pages: Turkish-only letters outside allowed proper names / lang="tr" islands
    if lang == "kk":
        for el in soup.find_all(attrs={"lang": "tr"}):
            el.decompose()
        body_text = soup.body.get_text(" ")
        stripped = ALLOWED_TR.sub("", body_text)
        bad = TR_ONLY.findall(stripped)
        if bad:
            ctx = re.search(r".{0,30}[ğĞışŞİ].{0,30}", stripped)
            err(f"{u}: Turkish characters on Kazakh page near '{ctx.group(0).strip() if ctx else ''}'")
        if not (KK_ONLY & set(body_text)):
            err(f"{u}: no Kazakh-specific letters found")
        # Kazakh pages must not link to other-language pages except via the language switcher
        for a in soup.find_all("a", href=True):
            h = a["href"]
            if h.startswith("/page/") and not a.get("data-lang-switch") and url_index.get(h.split("?")[0], [None, "kk"])[1] != "kk":
                err(f"{u}: Kazakh page links to non-Kazakh page {h}")

for (lang, title), n in titles.items():
    if n > 1:
        warnings.append(f"duplicate title in {lang}: '{title}' x{n}")

# 3. sitemap covers every url
sm = (DIST / "sitemap.xml").read_text(encoding="utf-8")
for u in url_index:
    if f"<loc>{BASE}{u}</loc>" not in sm:
        err(f"sitemap missing {u}")

for e in errors:
    print("ERROR", e)
for w in warnings:
    print("WARN ", w)
print(f"{len(url_index)} pages checked: {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
