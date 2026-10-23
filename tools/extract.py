"""Turn the raw crawl (raw/<lang>/*.html) into structured, sanitised content.

Output (in the project, versioned):
  content/pages.json            page registry: id, type, status, slug per language
  content/site/<lang>.json      shared chrome text taken from the live site (nav, header, footer)
  content/source/<lang>/<id>.json  per-page content for tr / en / ru

Kazakh content is NOT produced here; it lives in content/kk/ and is written by hand.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup, NavigableString, Tag, Comment

RAW = Path(r"C:/Users/Daniy/AppData/Local/Temp/mt/raw")
PROJECT = Path(__file__).resolve().parent.parent
OUT = PROJECT / "content"
BASE = "https://metro-teknik.net"
LANGS = ["tr", "en", "ru"]

COMPANY = ["kurumsal", "vizyon", "misyon", "baskanin-mesaji", "kalite-ve-cevre-politikamiz", "is-bitirme-belgelerimiz"]
SERVICES = ["havalandirma-sistemleri", "isitma-sogutma", "sihhi-tesisat", "yangin", "mekanik-otomasyon"]
LISTS = {"metro-teknik-devam-eden-projeler": "ongoing", "metro-teknik-biten-projeleri": "completed"}
HOME_ALIASES = {"tr": ["/", "/page/ana-sayfa"], "en": ["/page/main-page"], "ru": ["/page/ana-sayfa-ru"]}

# images that are pure decoration or carry baked-in (Turkish) text; replaced by real headings in the redesign
DECOR = re.compile(r"(divider|/component/|circle\.png|dotdot|/backgrounds/|button_\d|-title|slider-button|/sliders/)", re.I)

FACT_KEYS = [
    ("location", r"^(yer|location|place|местоположение|место|расположение|адрес объекта)"),
    ("client", r"^(i̇şveren|işveren|employer|investor|client|заказчик|работодатель|инвестор)"),
    ("area", r"^(kapalı|closed|indoor|covered|total|construction area|закрыт|площадь|общая)"),
    ("date", r"^(tarih|date|year|дата|год|срок)"),
    ("scope", r"^(proje kapsamı|project scope|scope|объем|объём|состав|сфера|в рамках проекта)"),
    ("budget", r"^(proje bütçesi|project budget|budget|бюджет|стоимость)"),
    ("note", r"^(not|note|примечание)$"),
]


def fname(path):
    s = path.strip("/").replace("/", "__").replace("?", "_q_").replace("&", "_") or "index"
    return s + ".html"


def load(lang, path):
    f = RAW / lang / fname(path)
    if not f.exists():
        return None
    s = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
    for c in s.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    return s


def absu(src):
    if not src:
        return src
    src = src.strip()
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("http://metro-teknik.net"):
        return "https://" + src[len("http://"):]
    return urljoin(BASE + "/", src)


def local_path(href):
    """Internal link -> path without lng param; external links untouched."""
    if not href:
        return href
    p = urlparse(absu(href))
    if p.netloc.replace("www.", "") != "metro-teknik.net":
        return href
    q = "&".join(x for x in p.query.split("&") if x and not x.startswith("lng="))
    return (p.path or "/") + (("?" + q) if q else "")


def clean_text(t):
    t = t.replace("\xa0", " ")
    return re.sub(r"\s+", " ", t)


def strip_multilang(t):
    # <!--:tr_tr-->x<!--:--> remnants in alt attributes
    m = re.search(r"<!--:[a-z_]+-->(.*?)<!--:-->", t or "")
    return (m.group(1) if m else (t or "")).strip()


# ---------------------------------------------------------------- body sanitiser
INLINE_KEEP = {"strong": "strong", "b": "strong", "em": "em", "i": "em", "a": "a", "sup": "sup", "sub": "sub"}
BLOCKS = {"div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote", "hr", "center", "section"}


def tokens(el, out):
    for c in el.children:
        if isinstance(c, NavigableString):
            if isinstance(c, Comment):
                continue
            t = clean_text(str(c))
            if t:
                out.append(("text", t))
            continue
        if not isinstance(c, Tag):
            continue
        n = c.name
        if n in ("script", "style", "iframe", "form", "noscript"):
            continue
        if n == "br":
            out.append(("br",))
        elif n == "img":
            src = c.get("src", "")
            if DECOR.search(src) or "fa-" in " ".join(c.get("class") or []):
                continue
            out.append(("img", {"src": absu(src), "alt": strip_multilang(c.get("alt") or c.get("title") or ""),
                                "width": c.get("width"), "height": c.get("height")}))
        elif n in ("ul", "ol"):
            items = []
            for li in c.find_all("li", recursive=False):
                sub = []
                tokens(li, sub)
                html = assemble(sub, inline_only=True)
                if html.strip():
                    items.append(html)
            if items:
                out.append(("block",))
                out.append(("list", n, items))
                out.append(("block",))
        elif n in ("h1", "h2", "h3", "h4", "h5", "h6"):
            sub = []
            tokens(c, sub)
            imgs = [t for t in sub if t[0] == "img"]
            txt = assemble([t for t in sub if t[0] != "img"], inline_only=True)
            out.append(("block",))
            out.extend(imgs)
            if re.sub(r"<[^>]+>|\s", "", txt):
                out.append(("heading", n, re.sub(r"</?(strong|em)>", "", txt).strip()))
            out.append(("block",))
        elif n == "table":
            rows = []
            for tr in c.find_all("tr"):
                cells = [clean_text(td.get_text(" ")).strip() for td in tr.find_all(["td", "th"])]
                if any(cells):
                    rows.append(cells)
            if rows:
                out.append(("block",))
                out.append(("table", rows))
                out.append(("block",))
        elif n in INLINE_KEEP:
            tag = INLINE_KEEP[n]
            attrs = {}
            if tag == "a":
                href = c.get("href", "")
                if not href or href.startswith("javascript"):
                    tokens(c, out)
                    continue
                attrs["href"] = local_path(href)
            out.append(("open", tag, attrs))
            tokens(c, out)
            out.append(("close", tag))
        else:
            block = n in BLOCKS
            if block:
                out.append(("block",))
            if n == "hr":
                continue
            tokens(c, out)
            if block:
                out.append(("block",))


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def assemble(toks, inline_only=False):
    """Token stream -> clean HTML. Double <br> or block boundaries make paragraphs."""
    parts, para = [], []

    def flush():
        html = "".join(para)
        html = re.sub(r"^(\s|<br>)+|(\s|<br>)+$", "", html)
        html = re.sub(r"<(strong|em|sup|sub)>\s*</\1>", "", html)
        if re.sub(r"<[^>]+>|\s", "", html):
            parts.append(html if inline_only else "<p>%s</p>" % html.strip())
        para.clear()

    i = 0
    while i < len(toks):
        t = toks[i]
        k = t[0]
        if k == "text":
            para.append(esc(t[1]))
        elif k == "open":
            a = "".join(' %s="%s"' % (x, esc(y)) for x, y in t[2].items())
            para.append("<%s%s>" % (t[1], a))
        elif k == "close":
            para.append("</%s>" % t[1])
        elif k == "br":
            j = i
            while j + 1 < len(toks) and (toks[j + 1][0] == "br" or (toks[j + 1][0] == "text" and not toks[j + 1][1].strip())):
                j += 1
            nbr = sum(1 for x in toks[i:j + 1] if x[0] == "br")
            if nbr >= 2 and not inline_only:
                flush()
            else:
                para.append("<br>")
            i = j
        elif k == "block":
            if not inline_only:
                flush()
            else:
                para.append(" ")
        elif k == "img":
            if not inline_only:
                flush()
                im = t[1]
                wh = ""
                if im.get("width") and im.get("height"):
                    wh = ' width="%s" height="%s"' % (im["width"], im["height"])
                parts.append('<figure><img src="%s" alt="%s"%s></figure>' % (esc(im["src"]), esc(im["alt"]), wh))
        elif k == "heading":
            if not inline_only:
                flush()
                lvl = "h2" if t[1] in ("h1", "h2") else "h3"
                parts.append("<%s>%s</%s>" % (lvl, t[2], lvl))
            else:
                para.append(t[2])
        elif k == "list":
            flush()
            parts.append("<%s>%s</%s>" % (t[1], "".join("<li>%s</li>" % x for x in t[2]), t[1]))
        elif k == "table":
            flush()
            rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % esc(c) for c in r) for r in t[1])
            parts.append("<table>%s</table>" % rows)
        i += 1
    flush()
    return ("".join(parts) if inline_only else "\n".join(parts))


def sanitize(el):
    toks = []
    tokens(el, toks)
    html = assemble(toks)
    # fix unbalanced inline tags produced by CMS markup split across paragraphs
    for tag in ("strong", "em", "a"):
        html = "\n".join(balance(p, tag) for p in html.split("\n"))
    return html


def balance(p, tag):
    opens = len(re.findall(r"<%s[ >]" % tag, p))
    closes = p.count("</%s>" % tag)
    if opens > closes:
        p = re.sub(r"(</(p|h2|h3|li)>)$", "</%s>" % tag * (opens - closes) + r"\1", p)
    elif closes > opens:
        for _ in range(closes - opens):
            p = p.replace("</%s>" % tag, "", 1)
    return p


# ---------------------------------------------------------------- page parsers
def meta(s):
    t = s.find("title")
    d = s.find("meta", attrs={"name": "description"})
    return clean_text(t.get_text()).strip() if t else "", clean_text(d.get("content", "")).strip() if d else ""


def gallery(scope):
    items = []
    for a in scope.select(".w-gallery a[href]"):
        img = a.find("img")
        items.append({"full": absu(a["href"]), "thumb": absu(img["src"]) if img else absu(a["href"]),
                      "alt": strip_multilang(img.get("alt", "")) if img else ""})
    return items


def facts(container):
    """<strong>Label :</strong> value<br> ... -> [{key,label,value}] and remove them from the container."""
    out = []
    for st in list(container.find_all(["strong", "b"])):
        label = clean_text(st.get_text()).strip()
        sib_txt = ""
        nxt = st.next_sibling
        if label.endswith(":") or (isinstance(nxt, NavigableString) and nxt.strip().startswith(":")):
            pass
        else:
            continue
        vals, rm = [], []
        n = st.next_sibling
        while n is not None:
            if isinstance(n, Tag) and n.name in ("strong", "b", "div", "h1", "h2", "h3", "p", "img"):
                break
            if isinstance(n, Tag) and n.name == "br":
                rm.append(n)
                if vals and "".join(vals).strip():
                    break
                n = n.next_sibling
                continue
            vals.append(n.get_text(" ") if isinstance(n, Tag) else str(n))
            rm.append(n)
            n = n.next_sibling
        value = clean_text("".join(vals)).strip().lstrip(":").strip()
        lab = label.rstrip(":").strip()
        key = None
        for k, rx in FACT_KEYS:
            if re.search(rx, lab.lower()):
                key = k
                break
        if not value and not key:
            continue
        if key is None and not lab and value.startswith("$"):
            key = "budget"  # EN library page: label lost in the CMS markup, value is the budget
        if key is None and lab == value:
            key = "client"  # RU stadium page: client name was typed into the label as well
        out.append({"key": key or "other", "label": lab, "value": value})
        for r in rm:
            r.extract() if hasattr(r, "extract") else None
        st.decompose()
    return out


def parse_company_or_service(s, kind):
    m = s.select_one(".l-main")
    side = m.select_one(".one-third")
    menu = []
    if side:
        for a in side.select("a[href]"):
            menu.append({"href": local_path(a["href"]), "label": clean_text(a.get_text(" ")).strip()})
    body = m.select_one(".two-thirds") or m.select_one(".l-submain-h")
    gal = gallery(body)
    for g in body.select(".w-gallery"):
        g.decompose()
    h1 = body.find("h1")
    heading = clean_text(h1.get_text(" ")).strip() if h1 else ""
    if h1:
        h1.decompose()
    return {"menu": menu, "heading": heading, "body_html": sanitize(body), "gallery": gal}


def parse_list(s):
    m = s.select_one(".l-main")
    t = m.select_one(".title h1")
    items = []
    for c in m.select(".w-cms"):
        a = c.select_one("a[href]")
        img = c.select_one("img")
        name = c.select_one(".w-cms-name")
        loc = c.select_one(".w-cms-description")
        items.append({"href": local_path(a["href"]), "name": clean_text(name.get_text(" ")).strip() if name else "",
                      "location": clean_text(loc.get_text(" ")).strip() if loc else "",
                      "thumb": absu(img["src"]) if img else None})
    return {"heading": clean_text(t.get_text(" ")).strip() if t else "", "items": items}


def parse_project(s):
    m = s.select_one(".l-main")
    legacy = None
    ph = m.select_one(".w-pagehead h1")
    if ph:
        legacy = clean_text(ph.get_text(" ")).strip()
        container = m.select_one(".l-content-h") or m.select_one(".l-content")
    else:
        container = m.select_one(".l-submain-h")
    # drop related project list (rendered by the template instead)
    for t in container.select(".title"):
        t.decompose()
    for gc in container.select(".g-cols"):
        if gc.select(".w-cms"):
            gc.decompose()
    gal = gallery(container)
    for g in container.select(".w-gallery"):
        g.decompose()
    h1 = container.find(["h1", "h2"])
    heading = clean_text(h1.get_text(" ")).strip() if h1 else ""
    if h1:
        h1.decompose()
    fs = facts(container)
    imgs = []
    for im in container.find_all("img"):
        src = im.get("src", "")
        if DECOR.search(src):
            im.decompose()
            continue
        imgs.append({"src": absu(src), "alt": strip_multilang(im.get("alt") or im.get("title") or ""),
                     "width": im.get("width"), "height": im.get("height")})
        im.decompose()
    body = sanitize(container)
    return {"pagehead": legacy, "heading": heading, "facts": fs, "images": imgs, "body_html": body, "gallery": gal}


def parse_gallery_page(s):
    m = s.select_one(".l-main .l-submain-h") or s.select_one(".l-main")
    scope = s.select_one(".l-main")
    gal = gallery(scope)
    for g in scope.select(".w-gallery"):
        g.decompose()
    heads = [clean_text(h.get_text(" ")).strip() for h in scope.find_all(["h1", "h2", "h3"])]
    for h in scope.find_all(["h1", "h2", "h3"]):
        h.decompose()
    return {"heading": heads[0] if heads else "", "subheading": heads[1] if len(heads) > 1 else "",
            "body_html": sanitize(scope), "gallery": gal}


def parse_contact(s):
    m = s.select_one(".l-main")
    offices = []
    for col in m.select(".one-half"):
        h = col.find("h2")
        office = {"name": clean_text(h.get_text(" ")).strip() if h else "", "fields": [], "map": None}
        ifr = col.find("iframe")
        if ifr:
            office["map"] = ifr.get("src")
        cur = None
        for n in col.children:
            if isinstance(n, Tag) and n.name in ("strong", "b"):
                cur = {"label": clean_text(n.get_text()).strip().rstrip(":").strip(), "lines": []}
                office["fields"].append(cur)
            elif isinstance(n, NavigableString) and cur is not None:
                t = clean_text(str(n)).strip()
                if t:
                    cur["lines"].append(t)
            elif isinstance(n, Tag) and n.name in ("span", "a", "div", "p") and cur is not None:
                t = clean_text(n.get_text(" ")).strip()
                if t:
                    cur["lines"].append(t)
        offices.append(office)
    return {"offices": offices}


def parse_home(s):
    m = s.select_one(".l-main")
    slides = []
    for li in m.select(".fullwidthbanner li"):
        bg = li.find("img")
        link = li.select_one(".tp-caption a[href]")
        slides.append({"image": absu(bg["src"]), "alt": strip_multilang(bg.get("alt", "")),
                       "href": local_path(link["href"]) if link else None})
    intro_h = None
    intro = ""
    for h in m.find_all("h3"):
        if h.find_parent(class_="one-third") or h.find_parent(class_="w-actionbox"):
            continue
        intro_h = clean_text(h.get_text(" ")).strip()
        for div in h.find_next_siblings("div"):
            if "g-hr" in (div.get("class") or []):
                continue
            intro = clean_text(div.get_text(" ")).strip()
            if intro:
                break
        break
    projects_h = None
    for h in m.find_all("h1"):
        projects_h = clean_text(h.get_text(" ")).strip()
    featured = []
    for col in m.select(".one-third"):
        name = col.find("h3")
        img = [i for i in col.find_all("img") if not DECOR.search(i.get("src", ""))]
        a = col.select_one("a.g-btn")
        featured.append({"name": clean_text(name.get_text(" ")).strip() if name else "",
                         "image": absu(img[0]["src"]) if img else None,
                         "href": local_path(a["href"]) if a else None,
                         "cta": clean_text(a.get_text(" ")).strip() if a else ""})
    ab = m.select_one(".w-actionbox")
    action = None
    if ab:
        action = {"heading": clean_text(ab.find("h3").get_text(" ")).strip(),
                  "buttons": [{"href": local_path(b["href"]), "label": clean_text(b.get_text(" ")).strip()}
                              for b in ab.select("a.w-actionbox-button")]}
    return {"slides": slides, "intro_heading": intro_h, "intro": intro, "projects_heading": projects_h,
            "featured": featured, "action": action}


def parse_chrome(s):
    """Header / nav / footer text of one language."""
    nav = []
    root = s.select_one(".w-nav-list.level_1")
    for item in root.find_all(class_=lambda c: c and "w-nav-item" in c and "level_1" in c, recursive=True):
        a = item.find("a")
        entry = {"label": clean_text(a.get_text(" ")).strip(), "href": local_path(a.get("href")), "children": []}
        for sub in item.find_all(class_=lambda c: c and "w-nav-item" in c and "level_2" in c):
            sa = sub.find("a")
            entry["children"].append({"label": clean_text(sa.get_text(" ")).strip(), "href": local_path(sa.get("href"))})
        nav.append(entry)
    if not nav:  # fallback: flat list of anchors
        for a in root.find_all("a"):
            nav.append({"label": clean_text(a.get_text(" ")).strip(), "href": local_path(a.get("href")), "children": []})
    contacts = []
    for it in s.select(".w-contacts-item"):
        a = it.find("a")
        if a:
            contacts.append({"label": clean_text(a.get_text(" ")).strip(), "href": a.get("href"),
                             "icon": (it.find("i").get("class") or [None, None])[-1] if it.find("i") else None})
    socials = [{"network": (d.get("class") or ["", ""])[-1], "href": d.find("a")["href"]}
               for d in s.select(".w-socials-item") if d.find("a")]
    foot = s.select_one(".l-footer")
    footer = {"text": [clean_text(x).strip() for x in foot.stripped_strings]} if foot else {}
    if foot:
        footer["links"] = [{"href": a.get("href"), "label": clean_text(a.get_text(" ")).strip()} for a in foot.find_all("a")]
    ga = re.search(r"ga\('create',\s*'([^']+)'", str(s))
    return {"nav": nav, "contacts": contacts, "socials": socials, "footer": footer, "ga": ga.group(1) if ga else None}


# ---------------------------------------------------------------- registry
def registry():
    man = {l: json.loads((RAW / l / "manifest.json").read_text(encoding="utf-8")) for l in LANGS}
    pages = {}
    for path, v in man["tr"].items():
        if "?" in path or v.get("status") != 200:
            continue
        if v["final"] != path:
            continue
        slug = path.split("/")[-1] if path != "/" else ""
        if path in ("/", "/page/ana-sayfa"):
            pid, typ = "home", "home"
        else:
            pid = slug
            typ = ("company" if slug in COMPANY else "service" if slug in SERVICES else
                   "list" if slug in LISTS else "gallery" if slug == "uygulama-ornekleri" else
                   "contact" if slug == "iletisim" else "project")
            if slug == "is-bitirme-belgelerimiz":
                typ = "certificates"
        p = pages.setdefault(pid, {"id": pid, "type": typ, "paths": {}, "aliases": {}})
        if pid == "home":
            p["paths"] = {"tr": "/", "en": "/page/main-page", "ru": "/page/ana-sayfa-ru"}
            p["aliases"] = {"tr": ["/page/ana-sayfa"]}
            continue
        p["paths"]["tr"] = path
        for l in ("en", "ru"):
            e = man[l].get(path)
            if not e or e.get("status") != 200:
                continue
            fin = e["final"]
            if fin in HOME_ALIASES[l] or fin == "/" or fin == path or e.get("lang") != l:
                continue  # not translated: live site falls back to home page or shows Turkish
            p["paths"][l] = fin
    # broken legacy links (live site redirects them to "/")
    broken = sorted(k for k, v in man["tr"].items() if "?" not in k and v.get("final") == "/" and k not in ("/",))
    return pages, broken


def main():
    pages, broken = registry()
    ongoing, completed = set(), set()
    for lang in LANGS:
        (OUT / "source" / lang).mkdir(parents=True, exist_ok=True)
        (OUT / "site").mkdir(parents=True, exist_ok=True)
        chrome_src = load(lang, pages["home"]["paths"][lang])
        (OUT / "site" / f"{lang}.json").write_text(json.dumps(parse_chrome(chrome_src), ensure_ascii=False, indent=1), encoding="utf-8")
        for pid, p in pages.items():
            path = p["paths"].get(lang)
            if not path:
                continue
            s = load(lang, path)
            if s is None:
                print("missing raw", lang, path)
                continue
            title, desc = meta(s)
            html_lang = s.find("html").get("lang")
            data = {"id": pid, "type": p["type"], "lang": lang, "path": path, "html_lang": html_lang,
                    "title": title, "description": desc}
            t = p["type"]
            if t == "home":
                data.update(parse_home(s))
            elif t in ("company", "service", "certificates"):
                data.update(parse_company_or_service(s, t))
            elif t == "list":
                data.update(parse_list(s))
                if lang == "tr":
                    target = ongoing if LISTS[pid] == "ongoing" else completed
                    target.update(i["href"].split("/")[-1] for i in data["items"])
            elif t == "gallery":
                data.update(parse_gallery_page(s))
            elif t == "contact":
                data.update(parse_contact(s))
            else:
                data.update(parse_project(s))
            (OUT / "source" / lang / f"{pid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    # project status comes only from existing metadata: list membership or the page's own "Tamamlanan Proje" heading
    for pid, p in pages.items():
        if p["type"] != "project":
            continue
        src = json.loads((OUT / "source" / "tr" / f"{pid}.json").read_text(encoding="utf-8"))
        if pid in ongoing:
            p["status"], p["status_source"] = "ongoing", "listed on /page/metro-teknik-devam-eden-projeler"
        elif pid in completed:
            p["status"], p["status_source"] = "completed", "listed on /page/metro-teknik-biten-projeleri"
        elif any((src.get(k) or "").lower().startswith("tamamlanan proje") for k in ("pagehead", "title")):
            p["status"], p["status_source"] = "completed", "page heading/title 'Tamamlanan Proje / ...'"
        else:
            p["status"], p["status_source"] = None, "no status in source"
        p["in_list"] = pid in ongoing or pid in completed
    order = {"ongoing": sorted(ongoing), "completed": sorted(completed)}
    for pid in LISTS:
        src = json.loads((OUT / "source" / "tr" / f"{pid}.json").read_text(encoding="utf-8"))
        order[LISTS[pid]] = [i["href"].split("/")[-1] for i in src["items"]]
    reg = {"pages": pages, "list_order": order, "broken_legacy_links": broken}
    (OUT / "pages.json").write_text(json.dumps(reg, ensure_ascii=False, indent=1), encoding="utf-8")
    print("pages", len(pages), "ongoing", len(ongoing), "completed", len(completed), "broken", len(broken))
    missing = {l: [pid for pid, p in pages.items() if l not in p["paths"]] for l in ("en", "ru")}
    print("untranslated:", json.dumps(missing, ensure_ascii=False))


if __name__ == "__main__":
    main()
