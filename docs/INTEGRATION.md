# Porting the redesign into the production PHP/CMS site

This project is a **reference implementation** built from the public site because the production repository and CMS
were not available. It is complete and working as a static build, but production should keep its PHP backend and CMS.
This guide lists what has to move across. Nothing here has been deployed.

## 1. Locale routing (fixes the `/page/kurumsal-ru` bug)

Behaviour to implement in the page controller (mirrors `tools/serve.py`):

1. Resolve the requested slug in the CMS page-translation table → `(page_id, language)`. **That language is the page
   language**, regardless of session or cookie. Set the application language from it before rendering.
2. Never redirect a valid localised slug to another language. Remove the current "rewrite slug to the session
   language" redirect.
3. `/` only: if the `mt_lang` cookie (or the old session value) names `en`, `ru` or `kk`, 302 to that home page
   (`/page/main-page`, `/page/ana-sayfa-ru`, `/page/ana-sayfa-kk`); otherwise render Turkish. Send `Vary: Cookie` on `/`.
4. `?lng=xx_yy` on any URL: 302 to the equivalent page in that language (or that language's project list when the
   page has no translation) and set `mt_lang`.
5. `POST /site/clang` (old form): same as 4, using `refurl` or the Referer as the page.
6. Old slugs that no longer exist (list in `content/pages.json → broken_legacy_links`): 301 to the completed-projects list.
7. Untranslated page in the language switcher: link to the matching project list in that language and label it
   (see `lang_switch()` in `tools/build.py`). Never show Turkish text as another language.

## 2. Adding Kazakh to the CMS

* Language code `kk` in HTML/hreflang, CMS/locale code `kk_kz` (matching `tr_tr`, `en_us`, `ru_ru`), locale `kk_KZ`.
* URL convention: Turkish slug + `-kk` (like the existing `-ru`), home `/page/ana-sayfa-kk`.
* Content: `export/kk-cms-import.json` has one record per page field (350 fields, 52 pages) with the Turkish source,
  the Kazakh text and a ready `cms_value` in the CMS's own syntax: `<!--:kk_kz-->…<!--:-->`. Append it to the
  matching multilingual field. `export/kk-review.csv` is the same data for a native-speaker review.
* Interface strings: `i18n/kk.json` (also `export/kk-ui-strings.json`) → PHP message files. Keep key parity with
  `tr/en/ru` (`tools/check_content.py` enforces this).
* Native language names in the switcher: Türkçe · English · Русский · Қазақша (the live site currently shows
  "İngilizce" for English).

## 3. SEO metadata

Generate per page from the translation table (see `seo()` and the sitemap writer in `tools/build.py`):

* `<html lang>` = page language; self-referencing `<link rel="canonical">`.
* `<link rel="alternate" hreflang>` for each **existing** translation plus `x-default` → Turkish URL.
* `sitemap.xml` with `xhtml:link` alternates (the current one is a static 2018 file with Turkish URLs only).
* Keep `robots.txt` `Disallow: /assets` (Yii asset folder); the new CSS/JS live under `/static/` so they stay crawlable.

## 4. Templates and assets

| Reference file | Production equivalent |
|---|---|
| `templates/base.html`, `header.html`, `footer.html` | main layout + header/footer partials |
| `templates/macros.html` | small view helpers (icon, card, gallery, breadcrumb, social links) |
| `templates/home.html`, `section.html`, `list.html`, `project.html`, `gallery.html`, `contact.html`, `404.html` | page views per CMS page type |
| `static/css/*.css` | one stylesheet (concatenate in the order tokens → base → layout → components → pages) |
| `static/js/site.js` | one deferred script, no dependencies (jQuery and Revolution Slider are no longer needed) |
| `static/fonts/*.woff2` | self-hosted IBM Plex Sans (SIL OFL 1.1), subsets latin, latin-ext, cyrillic, cyrillic-ext |
| `static/icons/facebook.svg`, `instagram.svg` | brand marks from Simple Icons 15.17.0 (CC0), inlined in the markup |

Project status, list order, facts and galleries come from the CMS fields already used by the live pages; the
redesign does not need new CMS fields except the Kazakh language.

## 5. Things the owner must decide before go-live

* Phone number and Istanbul address discrepancies (`docs/AUDIT.md` §4).
* Analytics: the kept snippet is Universal Analytics, which no longer collects data. Replacing it (GA4 or other)
  needs a property and a consent decision, so it was not changed. `tools/build.py --production` emits the snippet as is.
* Whether the Facebook/Instagram profiles are confirmed as official (`docs/AUDIT.md` §6).
* Native-speaker review of the Kazakh text (see README → translation notes).
