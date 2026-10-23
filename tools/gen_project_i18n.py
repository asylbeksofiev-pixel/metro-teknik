"""Generate content/{en,ru}/projects.json: localized project names and facts for every project.

Names are hand-written below (official names kept where they are proper names). Facts start from the
language's own source value when it exists (so per-language discrepancies are preserved), otherwise from the
Turkish source, and are then localized: place names, scope terms, units and number formatting.
Clients/employers are company names and are not translated.
Re-run after content changes; review the output before publishing.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "source"

NAMES = {  # pid: (EN heading, EN card, RU heading, RU card)
    "forum-avm-santiyesi-almata": ("Forum Almaty Shopping and Entertainment Centre", "Forum Almaty Mall", "Торгово-развлекательный центр «Forum Almaty»", "ТРЦ «Forum Almaty»"),
    "tienshan-konutlari-astana": ("Tien Shan Gardens Residential Complex", "Tien Shan Gardens Residences", "Жилой комплекс «Tien Shan Gardens»", "ЖК «Tien Shan Gardens»"),
    "expo-2017-kongre-merkezi-astana": ("EXPO-2017 Congress Centre", "EXPO-2017 Congress Centre", "Конгресс-центр «ЭКСПО-2017»", "Конгресс-центр «ЭКСПО-2017»"),
    "mega-2-alisveris-merkezi-almaata": ("Mega 2 Shopping and Entertainment Centre", "Mega 2 Mall", "Торгово-развлекательный центр MEGA Center (Mega 2)", "ТРЦ MEGA Center"),
    "kutuphane-binasi-astana": ("Library of the First President of the Republic of Kazakhstan", "First President's Library", "Библиотека Первого Президента Республики Казахстан", "Библиотека Первого Президента"),
    "mega-3-alisveris-merkezi-almaata": ("Mega 3 Shopping and Entertainment Centre", "Mega 3 Mall", "Торгово-развлекательный центр MEGA Park (Mega 3)", "ТРЦ MEGA Park"),
    "akademi-a6-blok-astana": ("National Defence University, Block A6", "National Defence University, Block A6", "Национальный университет обороны, блок A6", "Университет обороны, блок A6"),
    "akademi-a11-blok-astana": ("National Defence University, Block A11", "National Defence University, Block A11", "Национальный университет обороны, блок A11", "Университет обороны, блок A11"),
    "rixos-otel-borovoe": ("Rixos Borovoe Hotel", "Rixos Borovoe Hotel", "Отель «Rixos Borovoe»", "Отель «Rixos Borovoe»"),
    "han-cadir-mekanik-iscilik-astana": ("Khan Shatyr Entertainment Centre", "Khan Shatyr", "Торгово-развлекательный центр «Хан Шатыр»", "ТРЦ «Хан Шатыр»"),
    "stadyum-mekanik-iscilik-astana": ("Astana Arena Stadium", "Astana Arena Stadium", "Стадион «Астана Арена»", "Стадион «Астана Арена»"),
    "cocuk-hastanesi-mekanik-iscilik-astana": ("Republican Children's Rehabilitation Centre", "Children's Rehabilitation Centre", "АО «Республиканский детский реабилитационный центр»", "Детский реабилитационный центр"),
    "sariarka-alisveris-merkezi-astana": ("Saryarka Shopping and Entertainment Centre", "Saryarka Mall", "Торгово-развлекательный центр «Сарыарка»", "ТРЦ «Сарыарка»"),
    "noroloji-hastanesi-mekanik-iscilik-astana": ("National Centre for Neurosurgery", "National Centre for Neurosurgery", "АО «Национальный центр нейрохирургии»", "Национальный центр нейрохирургии"),
    "kokshetau-hospital": ("Kokshetau Hospital", "Kokshetau Hospital", "Больница в Кокшетау", "Больница в Кокшетау"),
    "turkistan-sehir-hastanesi": ("Turkistan City Hospital", "Turkistan City Hospital", "Городская больница Туркестана", "Городская больница Туркестана"),
    "karaganda-lastik-fabrikasi": ("Karaganda Tyre Factory", "Karaganda Tyre Factory", "Шинный завод в Караганде", "Шинный завод в Караганде"),
    "kervansaray": ("Kervansaray Complex", "Kervansaray", "Комплекс «Керуен-Сарай»", "Комплекс «Керуен-Сарай»"),
    "tema-park": ("Tema Park", "Tema Park", "Tema Park", "Tema Park"),
    "town-center": ("Town Center", "Town Center", "Town Center", "Town Center"),
    "aktau-resort-hotel": ("Aktau Resort Hotel", "Aktau Resort Hotel", "Aktau Resort Hotel", "Aktau Resort Hotel"),
    "nazarbayev-merkezi-idari-binasi": ("Nazarbayev Center Administrative Building", "Nazarbayev Center Administrative Building", "Административное здание Назарбаев Центра", "Административное здание Назарбаев Центра"),
    "nazarbayev-universitesi": ("Nazarbayev University", "Nazarbayev University", "Назарбаев Университет", "Назарбаев Университет"),
    "kizilorda-korkut-ata-havalimani-terminal-binasi": ("Kyzylorda (Korkyt Ata) Airport Terminal Building", "Kyzylorda Airport Terminal", "Терминал аэропорта Кызылорда (Коркыт Ата)", "Терминал аэропорта Кызылорда"),
    "akademi-a6-a11-blok-astana": ("National Defence University, Blocks A6–A11", "National Defence University, Blocks A6–A11", "Национальный университет обороны, блоки A6–A11", "Университет обороны, блоки A6–A11"),
    "astana-kongre-merkezi-komple-renovasyon": ("Astana Congress Centre (Complete Renovation)", "Astana Congress Centre Renovation", "Конгресс-центр Астаны (полная реконструкция)", "Реконструкция конгресс-центра Астаны"),
    "piramit-santiyesi-mekanik-iscilik-astana": ("Palace of Peace and Reconciliation (Pyramid)", "Palace of Peace and Reconciliation", "Дворец мира и согласия («Пирамида»)", "Дворец мира и согласия"),
    "nazarbayev-universitesi-1-etap": ("Nazarbayev University, Phase 1", "Nazarbayev University, Phase 1", "Назарбаев Университет, 1-й этап", "Назарбаев Университет, 1-й этап"),
    "cumhurbaskanligi-hastanesi": ("Presidential Hospital", "Presidential Hospital", "Президентская больница", "Президентская больница"),
    "akbozat-restoran": ("Akbozat Restaurant", "Akbozat Restaurant", "Ресторан «Акбозат»", "Ресторан «Акбозат»"),
    "bugday-depolari": ("Grain Warehouses", "Grain Warehouses", "Зерновые склады", "Зерновые склады"),
    "astana-motors-bmw-otosalon": ("Astana Motors BMW Showroom", "Astana Motors BMW Showroom", "Автосалон BMW Astana Motors", "Автосалон BMW Astana Motors"),
    "king-halid-havalimani": ("King Khalid Airport", "King Khalid Airport", "Аэропорт имени короля Халида", "Аэропорт имени короля Халида"),
    "almata-hilton": ("Hilton Hotel, Almaty", "Hilton Hotel, Almaty", "Отель Hilton, Алматы", "Отель Hilton, Алматы"),
    "tersane-istanbul-spa-merkezi-villa": ("Tersane İstanbul SPA Centre and Villa", "Tersane İstanbul SPA and Villa", "Tersane İstanbul: SPA-центр и вилла", "Tersane İstanbul: SPA-центр и вилла"),
}

PLACES = [  # (regex on source value, EN, RU)
    (r"almaata|almata|almaty|алматы", "Almaty", "Алматы"),
    (r"astana|астана", "Astana", "Астана"),
    (r"kokshetau|kökşetau", "Kokshetau", "Кокшетау"),
    (r"türkistan|turkistan", "Turkistan", "Туркестан"),
    (r"karaganda", "Karaganda", "Караганда"),
    (r"aktau", "Aktau", "Актау"),
    (r"kızılorda|kizilorda", "Kyzylorda", "Кызылорда"),
    (r"öskemen|өскемен", "Oskemen", "Усть-Каменогорск"),
    (r"riyad|рияд", "Riyadh", "Эр-Рияд"),
    (r"istanbul|i̇stanbul|İstanbul", "Istanbul", "Стамбул"),
]
COUNTRIES = [(r"kazakistan|казахстан", "Kazakhstan", "Казахстан"), (r"türkiye|турция", "Türkiye", "Турция")]

SCOPE = [  # (TR token regex, EN, RU)
    (r"ISITMA", "heating", "отопление"),
    (r"SOĞUTMA", "cooling", "охлаждение"),
    (r"BUHAR", "steam systems", "паровые системы"),
    (r"HAVALANDIRMA", "ventilation", "вентиляция"),
    (r"DUMAN EMİŞ", "smoke extraction", "дымоудаление"),
    (r"BASINÇLANDIRMA", "pressurisation", "подпор воздуха"),
    (r"YANGIN", "fire protection", "пожаротушение"),
    (r"SIHHİ TESİSAT", "plumbing and drainage", "водоснабжение и канализация"),
]
SUPPLY = {"en": "supply and installation", "ru": "поставка материалов и монтаж"}
NOTE = {"en": "Installation photos cannot be published because of the project's media restrictions.",
        "ru": "Фотографии монтажных работ не публикуются из-за ограничений проекта на использование медиаматериалов."}


def tr_upper(s):
    return s.replace("i", "İ").replace("ı", "I").upper()


def place(value, lang):
    v = value.lower()
    city = next(((en, ru) for rx, en, ru in PLACES if re.search(rx, v)), None)
    country = next(((en, ru) for rx, en, ru in COUNTRIES if re.search(rx, v)), None)
    i = 0 if lang == "en" else 1
    parts = [x[i] for x in (city, country) if x]
    return ", ".join(parts) if parts else value


def scope(value, lang):
    if not value:
        return ""
    if lang == "ru" and re.search(r"[А-Яа-я]", value):
        s = value.lower().replace(" + ", " и ").replace("установка и материалы", "поставка материалов и монтаж")
        s = s.replace("автоматическая система пожаротушения", "пожаротушение").replace("водопровода, канализации", "водоснабжение и канализация")
        return s[0].upper() + s[1:]
    u = tr_upper(value)
    items = [(m.start(), en if lang == "en" else ru) for rx, en, ru in SCOPE for m in [re.search(rx, u)] if m]
    items = [x for _, x in sorted(items)]
    if not items:
        return value
    s = ", ".join(items)
    if "MONTAJ" in u or "MALZEME" in u:
        s += "; " + SUPPLY[lang]
    return s[0].upper() + s[1:]


def number(value, lang):
    def fmt(m):
        raw = m.group(0)
        intpart, _, dec = raw.partition(",")
        digits = intpart.replace(".", "")
        n = int(digits)
        s = f"{n:,}".replace(",", "," if lang == "en" else " ")
        if dec:
            s += ("." if lang == "en" else ",") + dec
        return s
    return re.sub(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+", fmt, value)


def area(value, lang):
    if not value:
        return ""
    v = number(value, lang)
    v = re.sub(r"\s*m2", " m²" if lang == "en" else " м²", v)
    v = re.sub(r"\((\d+) Yataklı\)", r"(\1 beds)" if lang == "en" else r"(\1 коек)", v)
    return v


def budget(value, lang):
    v = value.strip()
    if not v or v == "-":
        return "—" if v == "-" else ""
    cur = "$" if "$" in v else ("₸" if "₸" in v else "")
    num = number(v.replace("$", "").replace("₸", "").strip(), lang)
    if lang == "en":
        return (cur + num) if cur == "$" else f"{num} {cur}".strip()
    return f"{num} {cur}".strip()


def main():
    reg = json.loads((ROOT / "content" / "pages.json").read_text(encoding="utf-8"))["pages"]
    for lang in ("en", "ru"):
        out = {"_note": "Generated by tools/gen_project_i18n.py from the per-language sources (Turkish as fallback). "
                        "Client names are company names and stay unchanged."}
        for pid, p in reg.items():
            if p["type"] != "project":
                continue
            tr = {f["key"]: f["value"] for f in json.loads((SRC / "tr" / f"{pid}.json").read_text(encoding="utf-8"))["facts"]}
            own_f = SRC / lang / f"{pid}.json"
            own = {f["key"]: f["value"] for f in json.loads(own_f.read_text(encoding="utf-8"))["facts"]} if (own_f.exists() and lang in p["paths"]) else {}
            pick = lambda k: (own.get(k) or tr.get(k) or "").strip()
            client = pick("client")
            facts = {
                "location": place(pick("location"), lang),
                "client": client,
                "area": area(pick("area"), lang),
                "date": pick("date").replace("-", "–"),
                "scope": scope(pick("scope"), lang),
                "budget": budget(pick("budget"), lang),
            }
            if tr.get("note"):
                facts["note"] = NOTE[lang]
            en_h, en_c, ru_h, ru_c = NAMES[pid]
            out[pid] = {"heading": en_h if lang == "en" else ru_h, "card_name": en_c if lang == "en" else ru_c,
                        "facts": {k: v for k, v in facts.items() if v}}
        d = ROOT / "content" / lang
        d.mkdir(exist_ok=True)
        (d / "projects.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        print(lang, len(out) - 1, "projects")


if __name__ == "__main__":
    main()
