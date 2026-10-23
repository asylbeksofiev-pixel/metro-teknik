"""Export the Kazakh content for the production CMS and for translation review.

Writes:
  export/kk-cms-import.json   one record per page/field: Turkish source, Kazakh text, and the value wrapped in the
                              CMS's multilingual comment syntax (<!--:kk_kz-->…<!--:-->) used by the live site
  export/kk-review.csv        the same, as a spreadsheet for a native-speaker review (UTF-8 with BOM)
  export/kk-ui-strings.json   interface strings (i18n/kk.json) for the PHP translation files
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "export"


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def main():
    OUT.mkdir(exist_ok=True)
    reg = load(ROOT / "content" / "pages.json")["pages"]
    kk = {}
    for f in sorted((ROOT / "content" / "kk").glob("*.json")):
        kk.update({k: v for k, v in load(f).items() if not k.startswith("_")})
    rows = []
    for pid, p in reg.items():
        src = load(ROOT / "content" / "source" / "tr" / f"{pid}.json")
        k = kk.get(pid, {})
        slug_tr = p["paths"]["tr"]
        slug_kk = "/page/ana-sayfa-kk" if pid == "home" else slug_tr + "-kk"

        def add(field, tr_val, kk_val):
            if kk_val in (None, ""):
                return
            rows.append({"page": pid, "type": p["type"], "url_tr": slug_tr, "url_kk": slug_kk, "field": field,
                         "tr": tr_val or "", "kk": kk_val, "cms_value": f"<!--:kk_kz-->{kk_val}<!--:-->"})

        add("title", src.get("title"), k.get("title") or k.get("heading"))
        add("heading", src.get("heading"), k.get("heading"))
        add("meta_description", src.get("description"), k.get("description"))
        add("body_html", src.get("body_html"), k.get("body_html"))
        add("card_name", None, k.get("card_name"))
        if p["type"] == "project":
            tr_facts = {f["key"]: f["value"] for f in src.get("facts", [])}
            for key, val in (k.get("facts") or {}).items():
                add(f"fact.{key}", tr_facts.get(key), val)
        if pid == "home":
            for key in ("intro", "action_heading", "projects_heading"):
                tr_val = src.get(key) if key != "action_heading" else (src.get("action") or {}).get("heading")
                add(key, tr_val, k.get(key))
        if pid == "iletisim":
            for i, o in enumerate(k.get("offices", [])):
                add(f"office.{i}.name", src["offices"][i]["name"], o["name"])
        if p["type"] == "gallery":
            add("subheading", src.get("subheading"), k.get("subheading"))
    rows.append({"page": "_chrome", "type": "chrome", "url_tr": "", "url_kk": "", "field": "footer_about",
                 "tr": load(ROOT / "content" / "site" / "tr.json")["footer"]["text"][10], "kk": kk["chrome"]["footer_about"],
                 "cms_value": f"<!--:kk_kz-->{kk['chrome']['footer_about']}<!--:-->"})
    (OUT / "kk-cms-import.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(OUT / "kk-review.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["page", "type", "url_tr", "url_kk", "field", "tr", "kk"], extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    (OUT / "kk-ui-strings.json").write_text((ROOT / "i18n" / "kk.json").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"exported {len(rows)} Kazakh content fields for {len({r['page'] for r in rows})} pages")


if __name__ == "__main__":
    main()
