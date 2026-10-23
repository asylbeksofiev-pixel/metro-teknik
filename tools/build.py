"""Build the redesigned Metro Teknik site (reference implementation) into dist/.

Inputs
  content/pages.json, content/source/<tr|en|ru>/*.json, content/site/*.json   (extracted from the live site)
  content/kk/*.json                                                         (hand-written Kazakh content)
  content/corrections.json, i18n/*.json, templates/*.html, static/*

URL convention (unchanged from the live site, plus Kazakh):
  tr  /page/<slug>            en  /page/<english-slug>       ru  /page/<slug>-ru
  kk  /page/<tr-slug>-kk      home: /, /page/main-page, /page/ana-sayfa-ru, /page/ana-sayfa-kk

Usage:  python tools/build.py [--production] [--out dist]
"""
import argparse
import datetime
import hashlib
import html
import json
import re
import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
BASE_URL = "https://metro-teknik.net"
LANGS = ["tr", "en", "ru", "kk"]
SOURCE_LANGS = ["tr", "en", "ru"]
CATALOG = {"url": "https://metro-teknik.net/files/metro-teknik-katalog-haziran-2021.pdf", "size": "22 MB"}
ATTRIBUTION_URL = "http://www.ayaner.com"
COMPANY = ["kurumsal", "vizyon", "misyon", "baskanin-mesaji", "kalite-ve-cevre-politikamiz", "is-bitirme-belgelerimiz"]
SERVICES = ["havalandirma-sistemleri", "isitma-sogutma", "sihhi-tesisat", "yangin", "mekanik-otomasyon"]
LISTS = {"ongoing": "metro-teknik-devam-eden-projeler", "completed": "metro-teknik-biten-projeleri"}
FACT_ORDER = ["location", "client", "area", "date", "scope", "budget"]
TURKISH_HINT = re.compile(r"[ğĞıİşŞ]|\b(Kazakistan|Türkiye|Merkezi|Hastanesi|Kongre|Renovasyon|Malzeme|Montaj|Konutları|Alışveriş|Havalimanı|Şantiye)\b")
GA_ID = "UA-93769726-1"


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


REG = load(CONTENT / "pages.json")
PAGES = REG["pages"]
SRC = {l: {f.stem: load(f) for f in (CONTENT / "source" / l).glob("*.json")} for l in SOURCE_LANGS}
SITE = {l: load(CONTENT / "site" / f"{l}.json") for l in SOURCE_LANGS}
I18N = {l: load(ROOT / "i18n" / f"{l}.json") for l in LANGS}
CORR = load(CONTENT / "corrections.json")
KK = {}
for f in sorted((CONTENT / "kk").glob("*.json")):
    for k, v in load(f).items():
        if not k.startswith("_"):
            KK[k] = v
# localized project names/facts for tr/en/ru (content/<lang>/projects.json); Kazakh lives in KK
OVR = {l: {k: v for k, v in load(CONTENT / l / "projects.json").items() if not k.startswith("_")}
       for l in SOURCE_LANGS if (CONTENT / l / "projects.json").exists()}
ICON_PATHS = {n: re.search(r'd="([^"]+)"', (ROOT / "static" / "icons" / f"{n}.svg").read_text(encoding="utf-8")).group(1)
              for n in ("facebook", "instagram")}


# ------------------------------------------------------------------ helpers
def url(pid, lang):
    p = PAGES[pid]
    if lang == "kk":
        if pid != "home" and pid not in KK:
            return None
        return "/page/ana-sayfa-kk" if pid == "home" else p["paths"]["tr"] + "-kk"
    if lang in p["paths"]:
        return p["paths"][lang]
    if p["type"] == "project" and pid in OVR.get(lang, {}):
        return p["paths"]["tr"] + "-" + lang  # new translation, same convention as existing -en/-ru pages
    return None


def ovr(pid, lang):
    return OVR.get(lang, {}).get(pid)


def exists(pid, lang):
    return url(pid, lang) is not None


def lang_attr(text, page_lang):
    """Mark Turkish fragments that remain inside other-language pages (untranslated source content)."""
    if page_lang != "tr" and text and TURKISH_HINT.search(text):
        return Markup(' lang="tr"')
    return Markup("")


def strip_tags(h):
    return html.unescape(re.sub(r"<[^>]+>", " ", h or "")).strip()


def excerpt(text, n=155):
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0].rstrip(",;:—-")
    return cut + "…"


def first_sentence(text, n=150):
    text = re.sub(r"\s+", " ", text).strip()
    m = re.match(r"(.{40,}?[.;])\s", text + " ")
    s = m.group(1).rstrip(";") if m else text
    return excerpt(s, n)


def is_caps(s):
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


def tel_href(text):
    d = re.sub(r"\D", "", text or "")
    if d.startswith("710"):        # "+7 10 90 …" on the Russian page = 8-10 international prefix
        d = d[3:]
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("090"):
        d = d[1:]
    if d.startswith("900"):        # "+90 0216 …"
        d = "90" + d[3:]
    if d.startswith("0") and len(d) == 11:
        d = "90" + d[1:]
    return "tel:+" + d


def corrected(lang, pid, data):
    fix = CORR.get(lang, {}).get(pid)
    if fix:
        data = dict(data)
        data.update({k: v for k, v in fix.items() if not k.startswith("_") and k != "replace"})
        for old, new in fix.get("replace", []):
            data["body_html"] = data.get("body_html", "").replace(old, new)
    return data


def src(pid, lang):
    return corrected(lang, pid, SRC[lang][pid])


def clean_heading(h):
    return re.sub(r"^(Tamamlanan Proje|Completed Project)\s*/\s*", "", h or "").strip()


# ------------------------------------------------------------------ page data (normalised per language)
def heading(pid, lang):
    if lang == "kk":
        k = KK.get(pid, {})
        return k.get("heading") or k.get("title")
    if ovr(pid, lang):
        return ovr(pid, lang)["heading"]
    d = src(pid, lang)
    h = clean_heading(d.get("heading") or d.get("title"))
    return h


def nav_label(pid, lang):
    if lang == "kk":
        return KK[pid].get("nav_label") or KK[pid]["heading"]
    return heading(pid, lang)


def body_html(pid, lang):
    if lang == "kk":
        return KK[pid].get("body_html", "")
    return src(pid, lang).get("body_html", "")


def shared_media(pid, lang):
    """Photos are language-neutral; the CMS attached galleries to some languages only."""
    order = [lang] + [l for l in SOURCE_LANGS if l != lang]
    lead, gal = None, []
    for l in order:
        d = SRC.get(l, {}).get(pid)
        if not d:
            continue
        if lead is None and d.get("images"):
            lead = d["images"][0]
        if not gal and d.get("gallery"):
            gal = d["gallery"]
    if lead is None and gal:
        lead = {"src": gal[0]["full"], "alt": "", "width": None, "height": None}
    return lead, gal


def list_item(pid):
    for key in ("ongoing", "completed"):
        for it in SRC["tr"][LISTS[key]]["items"]:
            if it["href"].split("/")[-1] == pid:
                return it
    return None


def list_item_lang(pid, lang):
    lid = LISTS.get(PAGES[pid].get("status") or "", None)
    if not lid or lang == "kk" or lid not in SRC[lang]:
        return None
    target = url(pid, lang)
    for it in SRC[lang][lid]["items"]:
        if it["href"] in (target, PAGES[pid]["paths"]["tr"]):
            return it
    return None


def project_facts(pid, lang):
    if lang != "kk" and (ovr(pid, lang) or {}).get("facts"):
        return {k: v for k, v in ovr(pid, lang)["facts"].items() if v}
    if lang == "kk":
        raw = KK[pid]["facts"]
        facts = {k: v for k, v in raw.items() if v}
    else:
        facts = {}
        for f in src(pid, lang)["facts"]:
            if f["value"] and f["key"] not in facts:
                facts[f["key"]] = f["value"]
    return facts


def card(pid, lang):
    t_item = list_item(pid)
    l_item = list_item_lang(pid, lang)
    facts = project_facts(pid, lang)
    if lang == "kk":
        name = KK[pid].get("card_name") or KK[pid]["heading"]
        location = facts.get("location", "")
    elif ovr(pid, lang):
        name = ovr(pid, lang).get("card_name") or ovr(pid, lang)["heading"]
        location = facts.get("location", "") if ovr(pid, lang).get("facts") else ((l_item or {}).get("location") or facts.get("location", ""))
    else:
        h = heading(pid, lang)
        ln = (l_item or {}).get("name", "")
        name = h if not is_caps(h) else (ln if ln and not is_caps(ln) else h)
        location = (l_item or {}).get("location") or facts.get("location", "")
    lead, gal = shared_media(pid, lang)
    thumb = (t_item or {}).get("thumb") or (gal[0]["thumb"] if gal else (lead or {}).get("src"))
    return {"id": pid, "url": url(pid, lang), "name": name, "location": location, "thumb": thumb,
            "status": PAGES[pid].get("status"), "lang_attr": lang_attr(name, lang), "loc_lang_attr": lang_attr(location, lang),
            "year": (project_facts(pid, "tr").get("date") or "")}


def project_order(status):
    listed = [p for p in REG["list_order"].get(status, []) if p in PAGES]
    earlier = [pid for pid, p in PAGES.items() if p["type"] == "project" and p.get("status") == status and pid not in listed]
    earlier.sort(key=lambda pid: re.sub(r"\D", "", project_facts(pid, "tr").get("date", "0"))[:4] or "0", reverse=True)
    return listed, earlier


# ------------------------------------------------------------------ chrome (header/footer) per language
def chrome(lang):
    base = "tr" if lang == "kk" else lang
    s = SITE[base]
    t = I18N[lang]
    phone = None
    for c in s["contacts"]:
        if (c.get("href") or "").startswith("tel:"):
            text = c["label"].split("|")[-1].strip()
            phone = {"text": text, "href": tel_href(c["href"])}
    ft = s["footer"]["text"]
    # footer text order on the live site: heading, Adres, address, Telefon, phone, fax, fax, E-Mail, email, about-heading, about, …
    footer = {
        "address": ft[2], "phone": ft[4], "phone_href": tel_href(ft[4]), "fax": ft[6], "email": ft[8],
        "about": KK["chrome"]["footer_about"] if lang == "kk" else ft[10],
        "rights": t["footer"]["rights"].replace("{year}", str(datetime.date.today().year)),
        "attribution": t["footer"]["attribution"], "attribution_url": ATTRIBUTION_URL,
    }
    socials = []
    for so in s["socials"]:
        net = so["network"]
        if net in ICON_PATHS:
            socials.append({"network": net, "href": so["href"], "label": t["social"][net], "path": ICON_PATHS[net]})
    return {"phone": phone, "email": footer["email"], "catalog": CATALOG, "socials": socials, "footer": footer}


# ------------------------------------------------------------------ context builders
def nav(pid, lang):
    t = I18N[lang]["nav"]
    ptype = PAGES[pid]["type"]
    status = PAGES[pid].get("status")
    items = [
        {"key": "company", "label": t["company"], "active": pid in COMPANY,
         "children": [{"label": nav_label(c, lang), "url": url(c, lang), "current": c == pid} for c in COMPANY]},
        {"key": "services", "label": t["services"], "active": ptype == "service",
         "children": [{"label": nav_label(c, lang), "url": url(c, lang), "current": c == pid} for c in SERVICES]},
        {"key": "projects", "label": t["projects"], "active": ptype in ("list", "project"),
         "children": [{"label": t["ongoing"], "url": url(LISTS["ongoing"], lang), "current": pid == LISTS["ongoing"]},
                      {"label": t["completed"], "url": url(LISTS["completed"], lang), "current": pid == LISTS["completed"]}]},
        {"key": "gallery", "label": t["gallery"], "url": url("uygulama-ornekleri", lang),
         "active": pid == "uygulama-ornekleri", "current": pid == "uygulama-ornekleri"},
        {"key": "contact", "label": t["contact"], "url": url("iletisim", lang), "active": pid == "iletisim", "current": pid == "iletisim"},
    ]
    if ptype == "project" and status:
        for c in items[2]["children"]:
            if c["url"] == url(LISTS[status], lang):
                c["current"] = "true"
    return items


def lang_switch(pid, lang):
    out = []
    for m in LANGS:
        target = url(pid, m)
        missing = target is None
        if missing:  # untranslated project: offer the matching project list instead of silently showing Turkish
            st = PAGES[pid].get("status") or "completed"
            target = url(LISTS[st], m)
        out.append({"code": m, "name": I18N[m]["_lang"]["name"], "url": target, "current": m == lang, "missing": missing,
                    "missing_text": I18N[lang]["lang"]["missing"].replace("{name}", I18N[m]["_lang"]["name"])})
    return out


def seo(pid, lang):
    alts = [{"hreflang": I18N[l]["_lang"]["hreflang"], "url": BASE_URL + url(pid, l)} for l in LANGS if exists(pid, l)]
    return {"canonical": BASE_URL + url(pid, lang), "alternates": alts if len(alts) > 1 else [],
            "xdefault": BASE_URL + (url(pid, "tr") or url(pid, lang)),
            "og_alternates": [I18N[l]["_lang"]["locale"] for l in LANGS if l != lang and exists(pid, l)]}


def crumbs(pid, lang):
    t = I18N[lang]
    home = {"label": t["breadcrumb"]["home"], "url": url("home", lang)}
    cur = {"label": heading(pid, lang), "url": url(pid, lang), "lang_attr": lang_attr(heading(pid, lang), lang)}
    ptype = PAGES[pid]["type"]
    if ptype in ("company", "certificates"):
        mid = [] if pid == "kurumsal" else [{"label": t["nav"]["company"], "url": url("kurumsal", lang)}]
    elif ptype == "service":
        mid = [] if pid == SERVICES[0] else [{"label": t["nav"]["services"], "url": url(SERVICES[0], lang)}]
    elif ptype == "project":
        st = PAGES[pid].get("status") or "completed"
        mid = [{"label": t["nav"][st], "url": url(LISTS[st], lang)}]
    elif ptype == "list":
        cur["label"] = t["nav"]["ongoing" if pid == LISTS["ongoing"] else "completed"]
        mid = []
    elif ptype == "gallery":
        cur["label"] = t["nav"]["gallery"]
        mid = []
    elif ptype == "contact":
        cur["label"] = t["nav"]["contact"]
        mid = []
    else:
        mid = []
    return [home] + mid + [cur]


def description(pid, lang, fallback_text=""):
    if lang == "kk" and KK.get(pid, {}).get("description"):
        return KK[pid]["description"]
    if lang != "kk":
        d = src(pid, lang).get("description")
        if d:
            return excerpt(d, 160)
    return excerpt(fallback_text, 160)


def page_home(lang):
    t = I18N[lang]
    s_tr = SRC["tr"]["home"]
    s = KK["home"] if lang == "kk" else src("home", lang)
    slides = [sl["href"].split("/")[-1] for sl in s_tr["slides"] if sl.get("href")]
    hero_pid = slides[0] if slides else None
    hero = {"image": s_tr["slides"][0]["image"], "url": None}
    if hero_pid and exists(hero_pid, lang):
        c = card(hero_pid, lang)
        hero.update({"url": c["url"], "name": c["name"], "lang_attr": c["lang_attr"]})
    services = []
    for i, sid in enumerate(SERVICES):
        fig = shared_figure(sid, lang)
        services.append({"name": nav_label(sid, lang), "url": url(sid, lang), "image": (fig or {}).get("src"),
                         "excerpt": first_sentence(strip_tags(body_html(sid, lang)), 96)})
    featured = [card(p, lang) for p in slides if p in PAGES and exists(p, lang)][:6]
    intro = s.get("intro", "")
    data = {
        "id": "home", "type": "home", "title": t["nav"]["home"],
        "doc_title": f"Metro Teknik — {t['home']['hero_title']}",
        "description": (KK["home"]["description"] if lang == "kk" else (src("home", lang).get("description") and excerpt(src("home", lang)["description"], 160))) or excerpt(intro, 160),
        "hero": hero, "services": services, "intro_heading": s.get("intro_heading") or "METRO TEKNİK", "intro": intro,
        "company_links": [{"label": nav_label(c, lang), "url": url(c, lang)} for c in COMPANY[1:]],
        "featured": featured,
        "projects_heading": s.get("projects_heading") or t["home"]["projects_title"],
        "action_heading": (s.get("action_heading") if lang == "kk" else (s.get("action") or {}).get("heading")) or t["home"]["contact_cta"],
        "links": {"completed": url(LISTS["completed"], lang), "ongoing": url(LISTS["ongoing"], lang),
                  "services": url(SERVICES[0], lang), "company": url("kurumsal", lang)},
        "preload_image": hero["image"], "og_image": hero["image"],
    }
    return "home.html", data


def shared_figure(pid, lang):
    for l in [lang if lang != "kk" else "tr"] + SOURCE_LANGS:
        d = SRC[l].get(pid)
        if not d:
            continue
        m = re.search(r'<figure><img src="([^"]+)" alt="([^"]*)"(?: width="(\d+)" height="(\d+)")?', d.get("body_html", ""))
        if m:
            return {"src": m.group(1), "alt": m.group(2), "width": m.group(3), "height": m.group(4)}
    return None


def page_section(pid, lang):
    t = I18N[lang]
    ptype = PAGES[pid]["type"]
    group = SERVICES if ptype == "service" else COMPANY
    body = body_html(pid, lang)
    figure = None
    if ptype == "service":
        figure = shared_figure(pid, lang)
        if figure:
            figure = dict(figure)
            figure["alt"] = KK[pid].get("image_alt", "") if lang == "kk" else (figure["alt"] or heading(pid, lang))
        body = re.sub(r"\s*<figure>.*?</figure>\s*", "\n", body).strip()
    if pid == "baskanin-mesaji":
        body = re.sub(r"<p>(<strong>[^<]*</strong><br><strong>[^<]*</strong>)</p>$", r'<p class="signature">\1</p>', body)
    gallery = []
    if ptype == "certificates":
        _, gallery = shared_media(pid, lang)
    related = []
    if ptype == "service":
        related = [{"name": nav_label(s, lang), "url": url(s, lang), "image": (shared_figure(s, lang) or {}).get("src"),
                    "excerpt": first_sentence(strip_tags(body_html(s, lang)), 110), "num": SERVICES.index(s) + 1}
                   for s in SERVICES if s != pid]
    h = heading(pid, lang)
    meta_fallback = I18N[lang]["meta"]["certificates"] if ptype == "certificates" else strip_tags(body)
    data = {"id": pid, "type": ptype, "title": h, "doc_title": f"{h} | Metro Teknik", "heading": h,
            "heading_lang": lang_attr(h, lang), "body_html": Markup(body), "body_lang": lang_attr(strip_tags(body), lang),
            "description": description(pid, lang, meta_fallback), "figure": figure, "gallery": gallery,
            "related_services": related,
            "subnav": [{"label": nav_label(c, lang), "url": url(c, lang), "current": c == pid} for c in group],
            "subnav_label": t["nav"]["services" if ptype == "service" else "company"],
            "og_image": (figure or {}).get("src")}
    return "section.html", data


def page_list(pid, lang):
    t = I18N[lang]
    status = "ongoing" if pid == LISTS["ongoing"] else "completed"
    listed, earlier = project_order(status)
    items = [card(p, lang) for p in listed if exists(p, lang)]
    earlier_cards = [card(p, lang) for p in earlier if exists(p, lang)]
    counts = {}
    for st in ("ongoing", "completed"):
        a, b = project_order(st)
        counts[st] = len([p for p in a + b if exists(p, lang)])
    h = t["nav"][status]
    data = {"id": pid, "type": "list", "title": h, "doc_title": f"{h} | Metro Teknik", "heading": h,
            "description": t["meta"]["list_" + status], "cards": items, "earlier": earlier_cards,
            "total": len(items) + len(earlier_cards),
            "tabs": [{"label": t["nav"][st], "url": url(LISTS[st], lang), "current": st == status, "count": counts[st]}
                     for st in ("ongoing", "completed")],
            "og_image": items[0]["thumb"] if items else None}
    return "list.html", data


def page_project(pid, lang):
    t = I18N[lang]
    status = PAGES[pid].get("status") or "completed"
    h = heading(pid, lang)
    facts = project_facts(pid, lang)
    lead, gal = shared_media(pid, lang)
    rows = []
    for k in FACT_ORDER:
        if facts.get(k):
            rows.append({"label": t["facts"][k], "value": facts[k], "wide": k == "scope", "lang_attr": lang_attr(facts[k], lang)})
    note = {"value": facts["note"], "lang_attr": lang_attr(facts["note"], lang)} if facts.get("note") else None
    listed, earlier = project_order(status)
    seq = [p for p in listed + earlier if exists(p, lang)]
    i = seq.index(pid) if pid in seq else -1
    related = [card(seq[(i + k) % len(seq)], lang) for k in range(1, 4) if len(seq) > 1 and seq[(i + k) % len(seq)] != pid]
    loc = facts.get("location", "")
    scope = facts.get("scope", "")
    tmpl = t["meta"]["project"]
    desc = tmpl.replace("{name}", h).replace("{location}", loc).replace("{scope}", scope) if scope else f"{h} — {loc}."
    extra_body = body_html(pid, lang) if lang != "kk" and pid in SRC[lang] and lang in PAGES[pid]["paths"] else ""
    if strip_tags(extra_body) in ("Project Budget", ""):
        extra_body = ""  # EN library page: orphaned label, the value is already shown as a fact
    data = {"id": pid, "type": "project", "title": h, "doc_title": f"{h} | Metro Teknik", "heading": h,
            "heading_lang": lang_attr(h, lang), "status": status, "location": loc, "location_lang": lang_attr(loc, lang),
            "date": facts.get("date"), "facts": rows, "note": note, "lead_image": lead, "gallery": gal,
            "body_html": Markup(extra_body), "related": related, "description": excerpt(desc, 160),
            "list_url": url(LISTS[status], lang), "list_label": t["nav"][status],
            "preload_image": (lead or {}).get("src"), "og_image": (lead or {}).get("src")}
    return "project.html", data


def page_gallery(pid, lang):
    t = I18N[lang]
    _, gal = shared_media(pid, lang)
    if lang == "kk":
        sub, body = KK[pid]["subheading"], KK[pid]["body_html"]
    else:
        d = src(pid, lang)
        sub, body = d.get("subheading", ""), d.get("body_html", "")
    # the CMS body ends with the two list buttons; they are rendered as real buttons instead
    paras = [p for p in re.findall(r"<p>(.*?)</p>", body, re.S) if "<a " not in p]
    intro = strip_tags(paras[0]) if paras else ""
    h = t["nav"]["gallery"]
    data = {"id": pid, "type": "gallery", "title": h, "doc_title": f"{h} | Metro Teknik", "heading": h,
            "subheading": sub if sub and sub.lower() != h.lower() else "", "intro": intro, "gallery": gal,
            "description": t["meta"]["gallery"],
            "links": {"ongoing": url(LISTS["ongoing"], lang), "completed": url(LISTS["completed"], lang)},
            "og_image": gal[0]["full"] if gal else None}
    return "gallery.html", data


def page_contact(pid, lang):
    t = I18N[lang]
    base = "tr" if lang == "kk" else lang
    offices = []
    tr_offices = SRC["tr"][pid]["offices"]
    for i, o in enumerate(src(pid, base)["offices"]):
        addr, phones = [], []
        for f in o["fields"]:
            lab = f["label"].lower()
            if lab.startswith(("adres", "addres", "address", "адрес")):
                addr = f["lines"]
            elif lab.startswith(("telefon", "telephone", "телефон", "phone")):
                phones = [{"text": ln, "href": tel_href(ln)} for ln in f["lines"]]
        name = KK[pid]["offices"][i]["name"] if lang == "kk" else o["name"]
        tr_addr = next((f["lines"] for f in tr_offices[i]["fields"] if f["label"].lower().startswith("adres")), addr)
        q = re.sub(r"\s+", "+", " ".join(tr_addr).strip())
        offices.append({"name": name, "address": addr, "address_lang": "tr" if TURKISH_HINT.search(" ".join(addr)) or base == "tr" or base == "en" else base,
                        "phones": phones, "map": o.get("map"),
                        "map_link": "https://www.google.com/maps/search/?api=1&query=" + q if q else None})
    kz = load(CONTENT / "offices_extra.json")["kz"]
    if kz.get("address"):
        offices.append({"name": t["contact"]["kz_office"], "address": kz["address"], "address_lang": "kk" if lang == "kk" else lang,
                        "phones": [{"text": ph, "href": tel_href(ph)} for ph in kz.get("phones", [])], "map": kz.get("map"),
                        "map_link": "https://www.google.com/maps/search/?api=1&query=" + re.sub(r"\s+", "+", " ".join(kz["address"]))})
    elif lang == "tr":
        print("WARNING: Kazakhstan office address missing (content/offices_extra.json) — not shown on the contact page")
    h = t["nav"]["contact"]
    data = {"id": pid, "type": "contact", "title": h, "doc_title": f"{h} | Metro Teknik", "heading": h,
            "description": t["meta"]["contact"], "offices": offices}
    return "contact.html", data


BUILDERS = {"home": page_home, "company": page_section, "service": page_section, "certificates": page_section,
            "list": page_list, "project": page_project, "gallery": page_gallery, "contact": page_contact}


# ------------------------------------------------------------------ build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--production", action="store_true", help="emit the existing analytics snippet")
    ap.add_argument("--out", default=str(ROOT / "dist"))
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    (out / "page").mkdir(parents=True)

    # assets
    st = out / "static"
    shutil.copytree(ROOT / "static", st, ignore=shutil.ignore_patterns("css", "ranges.json", "icon-source"))
    (st / "css").mkdir()
    css = "\n".join((ROOT / "static" / "css" / f).read_text(encoding="utf-8")
                    for f in ("tokens.css", "base.css", "layout.css", "components.css", "pages.css"))
    (st / "css" / "site.css").write_text(css, encoding="utf-8")
    hashes = {}

    def asset(path, bust=True):
        if bust and path not in hashes:
            hashes[path] = hashlib.md5((st / path).read_bytes()).hexdigest()[:8]
        return "/static/" + path + (("?v=" + hashes[path]) if bust else "")

    env = Environment(loader=FileSystemLoader(str(ROOT / "templates")), autoescape=select_autoescape(["html"]),
                      trim_blocks=False, lstrip_blocks=False)
    env.globals["asset"] = asset

    routes = {"pages": {}, "url_index": {}, "aliases": {"/page/ana-sayfa": "/"},
              "broken": {b: LISTS["completed"] for b in REG["broken_legacy_links"]}, "status": {}}
    sitemap = []
    count = 0
    for lang in LANGS:
        t = I18N[lang]
        ch = chrome(lang)
        ui = {"menu": t["nav"]["menu"], "close": t["nav"]["close"], "dialog": t["gallery"]["dialog"],
              "close_viewer": t["gallery"]["close"], "prev": t["gallery"]["prev"], "next": t["gallery"]["next"],
              "position": t["gallery"]["position"]}
        for pid, p in PAGES.items():
            if not exists(pid, lang):
                continue
            tpl, data = BUILDERS[p["type"]](pid, lang) if p["type"] != "home" else BUILDERS["home"](lang)
            u = url(pid, lang)
            ctx = {"L": lang, "t": t, "page": data, "nav": nav(pid, lang), "langs": lang_switch(pid, lang),
                   "seo": seo(pid, lang), "breadcrumb": crumbs(pid, lang), "chrome": ch,
                   "home_url": url("home", lang), "contact_url": url("iletisim", lang),
                   "footer_links": [{"label": t["nav"]["home"], "url": url("home", lang), "current": pid == "home"},
                                    {"label": t["nav"]["company"], "url": url("kurumsal", lang), "current": pid == "kurumsal"},
                                    {"label": t["nav"]["services"], "url": url(SERVICES[0], lang), "current": pid == SERVICES[0]},
                                    {"label": t["nav"]["ongoing"], "url": url(LISTS["ongoing"], lang), "current": pid == LISTS["ongoing"]},
                                    {"label": t["nav"]["completed"], "url": url(LISTS["completed"], lang), "current": pid == LISTS["completed"]},
                                    {"label": t["nav"]["gallery"], "url": url("uygulama-ornekleri", lang), "current": pid == "uygulama-ornekleri"},
                                    {"label": t["nav"]["contact"], "url": url("iletisim", lang), "current": pid == "iletisim"}],
                   "ui_json": Markup(json.dumps(ui, ensure_ascii=False).replace("</", "<\\/")),
                   "analytics_id": GA_ID if args.production else None}
            html_out = env.get_template(tpl).render(**ctx)
            target = out / "index.html" if u == "/" else out / (u.lstrip("/") + ".html")
            target.write_text(html_out, encoding="utf-8")
            if pid == "home" and lang == "tr":
                (out / "page" / "ana-sayfa.html").write_text(html_out, encoding="utf-8")  # alias, canonical → /
            routes["pages"].setdefault(pid, {})[lang] = u
            routes["url_index"][u] = [pid, lang]
            sitemap.append((pid, lang, u))
            count += 1
        # localized 404
        others = [{"code": o, "title": I18N[o]["notfound"]["title"], "text": I18N[o]["notfound"]["text"],
                   "link": I18N[o]["notfound"]["home"], "home": url("home", o)} for o in LANGS if o != lang]
        nf = {"id": "404", "type": "notfound", "title": t["notfound"]["title"], "doc_title": f"{t['notfound']['title']} | Metro Teknik",
              "description": t["notfound"]["text"], "others": others}
        ctx = {"L": lang, "t": t, "page": nf, "nav": nav("home", lang), "langs": lang_switch("home", lang),
               "seo": {"canonical": BASE_URL + url("home", lang), "alternates": [], "xdefault": BASE_URL + "/", "og_alternates": []},
               "breadcrumb": [], "chrome": ch, "home_url": url("home", lang), "contact_url": url("iletisim", lang),
               "footer_links": [], "ui_json": Markup(json.dumps(ui, ensure_ascii=False)), "analytics_id": None}
        nf_html = env.get_template("404.html").render(**ctx)
        (out / f"404-{lang}.html").write_text(nf_html, encoding="utf-8")
        if lang == "tr":
            (out / "404.html").write_text(nf_html, encoding="utf-8")  # default 404 for static hosts
    for pid, p in PAGES.items():
        if p["type"] == "project":
            routes["status"][pid] = p.get("status")
    routes["lists"] = LISTS
    routes["legacy_codes"] = {I18N[l]["_lang"]["legacy"]: l for l in LANGS}
    (out / "_routes.json").write_text(json.dumps(routes, ensure_ascii=False, indent=1), encoding="utf-8")

    # sitemap with hreflang alternates
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for pid, lang, u in sitemap:
        lines.append("  <url>")
        lines.append(f"    <loc>{BASE_URL}{u}</loc>")
        alts = [l for l in LANGS if exists(pid, l)]
        if len(alts) > 1:
            for l in alts:
                lines.append(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{BASE_URL}{url(pid, l)}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE_URL}{url(pid, "tr")}"/>')
        lines.append("  </url>")
    lines.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "robots.txt").write_text("User-agent: *\nDisallow: /assets\nSitemap: https://metro-teknik.net/sitemap.xml\n", encoding="utf-8")
    shutil.copy(ROOT / "static" / "img" / "icons" / "favicon.ico", out / "favicon.ico")
    shutil.copy(ROOT / "static" / "img" / "icons" / "apple-touch-icon.png", out / "apple-touch-icon.png")
    print(f"built {count} pages into {out}")


if __name__ == "__main__":
    main()
