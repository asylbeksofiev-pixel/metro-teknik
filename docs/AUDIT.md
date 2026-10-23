# Metro Teknik — audit of the live site (metro-teknik.net, October 2026)

The repository and CMS of the live site were **not available** on this machine, so this audit is based on the public
site only: a full crawl in each language session (`tools/crawl.py`, 60 TR / 60 EN / 68 RU pages fetched) plus HTTP-level
tests. Everything below can be re-verified with the scripts in `tools/`.

## 1. Stack (observed from the outside)

| Area | Finding |
|---|---|
| Server | nginx in front of Plesk (`X-Powered-By: PleskLin`), PHP sessions (`PHPSESSID`) |
| Framework | PHP MVC with `controller/action` routes (`POST /site/clang`), `/assets` excluded in robots.txt — consistent with Yii 1.x |
| CMS | Pages addressed as `/page/<slug>`; multilingual fields stored qTranslate-style: `<!--:tr_tr-->…<!--:--><!--:en_us-->…<!--:-->` (visible in leaked `alt` attributes on project lists) |
| Theme | UpSolution "Impreza"-style HTML theme (`l-canvas`, `w-nav`, `g-cols`), Revolution Slider (`fullwidthbanner`, `tp-caption`), Font Awesome 4, jQuery 1.9.1 |
| Fonts | Open Sans, Roboto Slab, Playfair Display from Google Fonts **over `http://`** (mixed content on an https page) |
| Analytics | Universal Analytics `UA-93769726-1` — UA stopped processing data in July 2023, so this snippet currently collects nothing |
| Sitemap | Static `sitemap.xml` from 2018, Turkish URLs only, no hreflang |
| Build / deploy | No build pipeline visible; files served directly by Plesk |

## 2. The `/page/kurumsal-ru` → `/page/kurumsal` redirect (root cause)

Verified with cookie-isolated requests:

1. New visitor, no cookie → `GET /page/kurumsal-ru` → **302** to `/page/kurumsal` (Turkish).
2. Same visitor after `POST /site/clang lng=ru_ru` → `GET /page/kurumsal-ru` → **200**, `<html lang="ru">`, "О компании".
3. In that Russian session `GET /page/kurumsal` → **302** to `/page/kurumsal-ru`.

So the language is stored **only in the PHP session**, and the page controller rewrites any slug to the variant of the
*session* language. Localised URLs are not self-describing: a shared Russian link opens Turkish for anyone without a
Russian session, and search engines (cookieless) only ever see Turkish. It is not a broken language configuration and
not a client-side cookie: the Russian content exists and is served correctly once the session language is Russian.
The `?lng=ru_ru` query parameter only partly helps, because the redirect fires before the parameter is applied.

**Fix (implemented in the reference build, see `tools/serve.py` and `docs/INTEGRATION.md`):** the URL decides the
language; the session/cookie is consulted only for the bare domain `/`.

## 3. Content inventory

51 distinct pages (all present in Turkish):

* Home, 6 company pages (Kurumsal, Vizyon, Misyon, Başkanın Mesajı, Kalite ve Çevre Politikamız, İş Bitirme Belgelerimiz — 14 certificate scans)
* 5 service pages (ventilation, heating/cooling, plumbing, fire, mechanical automation)
* 2 project lists (4 ongoing, 15 completed) and **35 project detail pages** — 16 of them are older "Tamamlanan Proje / …" pages that are not in the completed list (reachable only through the sitemap and an image menu). The redesign lists them as "Earlier completed projects", status taken from their own heading.
* Application examples gallery (106 photos), Contact (2 offices with Google Maps embeds — **no contact form exists**)
* Catalog PDF: `files/metro-teknik-katalog-haziran-2021.pdf`, 22 MB, 49 pages, **Turkish/Russian bilingual**, image-only (no selectable text)

Translations on the live site: EN has 35 of 51 pages (16 older project pages redirect English visitors to the home page),
RU has 47 of 51 (missing: Akademi A6 Blok, Akademi A11 Blok, Türkistan Şehir Hastanesi, Tersane SPA). Türkistan Şehir
Hastanesi has no EN/RU slug; the live site serves the Turkish text under `lang="en"`/`lang="ru"`.

## 4. Discrepancies that need an owner decision (not changed silently)

| # | Item | Values found | What the redesign does |
|---|---|---|---|
| 1 | Main phone number | Header (all languages): **0216 345 1116** (`tel:0902163451116`, malformed). TR contact page and every footer: **0216 345 11 61**. EN contact: "+90 0216 345 11 61". RU contact: "+7 10 90 216 345 11 16". Fax = 0216 345 1161 | Each location keeps its source number. `tel:` links normalised to E.164 (`+902163451116`, `+902163451161`) without changing digits |
| 2 | Istanbul office address | TR contact page + all footers: Zühtü Paşa Mah. Kolej Sok. Kardeşler Apt B Blok D:1, Kızıltoprak, Kadıköy. EN + RU contact pages (and RU map embed): Osmanağa Mah. Kuşdili Cad. No:65 K:5 Yüksel İş Hanı, Kadıköy | Each language keeps its own source; Kazakh follows Turkish (primary source) |
| 3 | Kervansaray | TR: Türkistan, 2020. EN/RU: Aktau, 2019 | Per-language source kept; Kazakh follows TR |
| 4 | Older projects, RU vs TR | RU gives areas TR leaves empty (Stadium 140 000 m², Children's hospital 45 000 m², Neurosurgery 45 000 m²); RU NU stage 1 client "SEMBOL / GEMTAŞ" vs TR "SEMBOL"; several RU scopes are narrower/wider than TR | Kept as is per language |
| 5 | Quality policy, TR | Item "Hizmet esnasında ve diğer faaliyetlerimizden kaynaklanan atıkları," is cut off mid-sentence (RU completes it as "take into account waste…") | Kazakh follows the RU completion; TR left unchanged |
| 6 | Town Center image | `alt="Fairmont Otel"` | Redesign uses the project name as alt |
| 7 | Typo (RU) | Heading "топление/Охлаждение" | Corrected to "Отопление/Охлаждение" (`content/corrections.json`, the only text correction) |
| 8 | Untranslated EN/RU text | e.g. EN "Mega 2 Alışveriş Merkezi", RU facts labelled "Yer / İşveren / Tarih", Karaganda note in Turkish on EN/RU pages, a Turkish fragment inside the RU quality policy | All 35 projects now have localized names, locations, scope and units in TR/EN/RU/KK (`content/{en,ru,tr}/projects.json`, `content/kk/projects.json`); the RU fragment is removed via `content/corrections.json`. Company names, addresses and personal names stay in their original form |
| 9 | Galleries | Attached per language in the CMS: e.g. Aktau, Expo, Forum, Mega have photos only on EN/RU | Photos are shared by every language of the project |

## 5. Broken links on the live site

* 8 links in the old project image menu go to removed pages and redirect to `/` (`teknopark-astana`, `pk-6-…`, `pk-8-…`, `35-blok-spor-salonu-astana`, `nazarbayev-universitesi-astana`, `nazarbayev-universitesi-44-45-bloklar-astana`, `nazarbayev-uni-24-25-ogrenci-yurt-bloklari`, `primat-santiyesi-mekanik-iscilik-astana` in TR). Redesign: 301 to the completed list.
* EN home: "Nazarbayev Üniversitesi" card → `/page/pk-8-bilimsel-egitim-kompleksi-astana` (redirects to home).
* RU home: "ТЕКУЩИЕ ПРОЕКТЫ" → removed dormitory page; "ЗАВЕРШЕННЫЕ ПРОЕКТЫ" → a single project.
* Application examples page: "DEVAM EDEN PROJELERİMİZ" button → Tienshan project page.

## 6. Social profiles

Both links are the same on every page: `https://www.facebook.com/metroteknik01/?fref=ts` and
`https://www.instagram.com/metroteknik/`. They are preserved unchanged. Their ownership could not be confirmed without
signing in to Facebook/Instagram; please confirm that both profiles belong to Metro Teknik. The `?fref=ts` parameter is
a leftover Facebook tracking parameter and can be dropped if you want.

## 7. Kazakhstan office address — **required from the owner**

No Kazakhstan office address exists anywhere in the available material: the live site (all languages, header,
footer, contact pages), the extracted CMS content, or the 2021 catalog (49 pages, no contact page). Nothing was
invented. `content/offices_extra.json` holds a clearly marked placeholder (`"status": "ADDRESS_REQUIRED"`); once the
official address is entered there, the office appears on the contact page in all four languages
(names come from `i18n/*.json → contact.kz_office`). The build prints a warning while the address is missing.

## 8. Contact page and forms

The live contact page has no form, so no form, fields, placeholders or validation messages were added (adding
a non-functional form was explicitly out of scope). Every visible label on the page is localized in all four languages.
