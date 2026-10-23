# Metro Teknik — redesign and Kazakh localisation (reference implementation)

A complete redesign of metro-teknik.net with full Kazakh (`kk`) support alongside Turkish, English and Russian.
The production repository/CMS was not available, so this project rebuilds the site from the public content into a
static site generator. It works as-is and is meant to be ported into the production PHP/CMS
(`docs/INTEGRATION.md`). Nothing has been deployed.

* `docs/AUDIT.md`: live-site findings, the locale-redirect root cause, content discrepancies, broken links
* `docs/INTEGRATION.md`: how to move routing, Kazakh content, SEO and templates into production
* `screenshots/`: desktop (1440 px) and mobile (390 px) captures of every page type

## Run it

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python tools/build.py
.venv/Scripts/python tools/serve.py --port 8080
```

Open http://127.0.0.1:8080/ (Turkish), `/page/main-page` (English), `/page/ana-sayfa-ru` (Russian),
`/page/ana-sayfa-kk` (Kazakh).

Refreshing content from the live site (optional): `tools/crawl.py` → `tools/extract.py` → `tools/build.py`.
`crawl.py` writes the raw HTML outside the project (`ROOT` constant at the top of the file).

## Checks

| Command | What it verifies | Last result |
|---|---|---|
| `tools/check_content.py` | i18n key parity, no raw keys/placeholders, `html[lang]`, self canonicals, reciprocal hreflang, internal links, `rel=noopener`, no Turkish leaking into Kazakh pages, sitemap coverage | 184 pages, 0 errors |
| `tools/check_behaviour.py` | routing (direct localised URLs, legacy `?lng=` and `POST /site/clang`, `/` + cookie, 301s, 404), mobile menu (open, scroll lock, inert, focus trap, Escape, focus return), keyboard dropdowns, page-preserving language switch + reload + persistence, lightbox, reduced motion, no-JS | 52/52 pass |
| `tools/check_ui.py` | Edge headless at 360/390/768/1024/1440: horizontal overflow, clipped text, broken images, console errors, small touch targets; saves screenshots (`--all`: every page at 390 and 1440) | 0 problems |

The two browser checks need `tools/serve.py` running and use the installed Microsoft Edge through Playwright.

## Structure

```
content/
  pages.json              page registry: type, status (from source metadata), slug per language
  source/{tr,en,ru}/      extracted live content, one JSON per page
  site/{tr,en,ru}.json    header/footer text from the live site
  kk/                     Kazakh content (company, services, projects, home/lists/gallery/contact)
  corrections.json        the only text correction (one Russian typo)
i18n/{tr,en,ru,kk}.json   interface strings
templates/                Jinja templates (base, header, footer, macros, one per page type)
static/css/               tokens.css (design tokens) → base → layout → components → pages
static/js/site.js         progressive enhancement, no dependencies
static/fonts/             IBM Plex Sans woff2 subsets incl. cyrillic-ext (Kazakh letters verified with fontTools)
static/icons/             Facebook / Instagram marks (Simple Icons 15.17.0, CC0)
tools/                    crawl, extract, build, serve, checks, Kazakh export
export/                   Kazakh content for the CMS (JSON with <!--:kk_kz--> values) and a review spreadsheet
dist/                     build output (generated)
```

## Design system

* **Palette from the logo:** deep navy ink `#0F1A33`, logo indigo `#2E3192` as the primary colour, the logo's orange
  `#E8622C` as the single accent (markers, active states, focus ring; `#B2441A` when used as text). All text pairs pass
  WCAG AA (body 12.8:1, muted 6.3:1, accent text 5.6:1, white on indigo 10.7:1).
* **Type:** IBM Plex Sans (variable 400–600), modest scale (`--fs-3xl` max 44 px), 68-character text measure.
* **Tokens** for colour, spacing (4 px base), radii (4/6/10 px), shadows, motion and layers in `static/css/tokens.css`.
* **Motion:** 160–220 ms interaction feedback, 420 ms one-time section reveals with 12 px shift, opacity/transform
  only; all durations drop to 0 under `prefers-reduced-motion`; content is never hidden without JavaScript.
* The logo is used unchanged at its native 16:3 proportions (white plate on dark backgrounds).

## Kazakh translation notes (for native-speaker review)

All Kazakh text was written for this project from the Turkish source, using the Russian pages to check official
facility names. Have a native speaker review it before go-live. `export/kk-review.csv` puts source and translation
side by side. Points that most need a decision:

* **Vision** is "Болашаққа көзқарас" as suggested. The **President's message** is titled "Төрағаның үндеуі", and the
  signature is "Директорлар кеңесінің төрағасы", following Turkish "Yönetim Kurulu Başkanı". The Russian page says
  "Председатель правления" (chairman of the management board), which is a different role.
* **İş Bitirme Belgeleri** is "Жұмыстың аяқталғаны туралы сертификаттар". A legal team may prefer an official term such
  as "орындалған жұмыстар актілері".
* **Facility names** follow the Russian official names where the Russian page gives them. Examples: the Library is
  "Қазақстан Республикасының Тұңғыш Президенті – Елбасы кітапханасы", and "Harp Akademileri" is "Ұлттық қорғаныс
  университеті". Names given only in Turkish were translated literally: "Көкшетау ауруханасы", "Түркістан қалалық
  ауруханасы", "Қарағанды шина зауыты", "«Керуенсарай» кешені", "Hilton қонақүйі, Алматы".
* **Technical terms:** "basınçlandırma" (pressurisation) is "ауа қысымын жасау", "duman emiş" is "түтін шығару",
  "sıhhi tesisat" is "сумен жабдықтау және су бұру", and "Malzeme+Montaj" is "материалдар және монтаж".
* **Unchanged facts:** client names (SEMBOL İNŞAAT, A-TA STROY, …), the chairman's name, ISO references, postal
  addresses and phone numbers stay exactly as in the source. Numbers use Kazakh digit grouping (163 961 м²).
* The **Rixos Borovoe** location is kept as "Астана", as in the source, although Burabay (Borovoe) lies outside the city.
* The **catalog** is labelled as Turkish/Russian on every language version, because that is its actual content.
