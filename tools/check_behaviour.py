"""Interaction and routing tests against the local preview (tools/serve.py running).

Usage: python tools/check_behaviour.py [--base http://127.0.0.1:8080]
"""
import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def raw(base, path, data=None, cookie=None):
    req = urllib.request.Request(base + path, data=data, method="POST" if data else "GET")
    if cookie:
        req.add_header("Cookie", cookie)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(req)
        return r.status, r.headers, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8", "replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    base = ap.parse_args().base

    # ---------- routing (no browser, no cookies) ----------
    s, h, body = raw(base, "/page/kurumsal-ru")
    check("direct /page/kurumsal-ru without cookie is Russian", s == 200 and '<html lang="ru"' in body, s)
    s, h, body = raw(base, "/page/kurumsal-kk")
    check("direct /page/kurumsal-kk is Kazakh", s == 200 and '<html lang="kk"' in body and "Компания туралы" in body, s)
    s, h, body = raw(base, "/page/kurumsal", cookie="mt_lang=ru")
    check("Turkish URL stays Turkish even with a Russian cookie", s == 200 and '<html lang="tr"' in body, s)
    s, h, _ = raw(base, "/page/kurumsal?lng=ru_ru")
    check("legacy ?lng=ru_ru redirects to Russian equivalent", s == 302 and h["Location"] == "/page/kurumsal-ru", (s, h.get("Location")))
    s, h, _ = raw(base, "/page/kokshetau-hospital?lng=kk_kz")
    check("?lng=kk_kz redirects to Kazakh equivalent", s == 302 and h["Location"] == "/page/kokshetau-hospital-kk", (s, h.get("Location")))
    s, h, _ = raw(base, "/page/akbozat-restoran?lng=en_us")
    check("untranslated page + ?lng=en_us goes to English completed list (not Turkish, not home)",
          s == 302 and h["Location"] == "/page/metro-teknik-completed-projects", (s, h.get("Location")))
    s, h, _ = raw(base, "/site/clang", data=urllib.parse.urlencode({"lng": "kk_kz", "refurl": "/page/vizyon"}).encode())
    check("legacy POST /site/clang keeps the page", s == 302 and h["Location"] == "/page/vizyon-kk", (s, h.get("Location")))
    s, h, _ = raw(base, "/", cookie="mt_lang=kk")
    check("/ with mt_lang=kk cookie goes to Kazakh home", s == 302 and h["Location"] == "/page/ana-sayfa-kk", (s, h.get("Location")))
    s, h, body = raw(base, "/")
    check("/ without cookie is Turkish", s == 200 and '<html lang="tr"' in body, s)
    s, h, body = raw(base, "/page/ana-sayfa")
    check("/page/ana-sayfa alias still works (canonical /)", s == 200 and 'rel="canonical" href="https://metro-teknik.net/"' in body, s)
    s, h, _ = raw(base, "/page/teknopark-astana")
    check("removed legacy page 301s to completed list", s == 301 and h["Location"] == "/page/metro-teknik-biten-projeleri", (s, h.get("Location")))
    s, h, body = raw(base, "/page/does-not-exist-kk")
    check("unknown Kazakh URL gives localized 404", s == 404 and '<html lang="kk"' in body, s)
    for p in ["/page/corporate", "/page/main-page", "/page/contact", "/page/metro-teknik-ongoing-projects", "/page/iletisim-ru",
              "/page/expo-2017-kongre-merkezi-astana-en", "/page/primat-santiyesi-mekanik-iscilik-astana-ru", "/sitemap.xml", "/robots.txt"]:
        s, _, _ = raw(base, p)
        check(f"existing URL {p} still 200", s == 200, s)

    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True)

        # ---------- mobile menu ----------
        ctx = b.new_context(viewport={"width": 390, "height": 844})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "/page/havalandirma-sistemleri-kk")
        tog = pg.locator("[data-menu-toggle]")
        tog.click()
        check("menu opens", pg.locator("#mobile-menu.is-open").count() == 1 and tog.get_attribute("aria-expanded") == "true")
        check("menu locks page scroll", pg.evaluate("document.documentElement.classList.contains('is-locked')"))
        check("content behind menu is inert", pg.evaluate("document.getElementById('main').hasAttribute('inert')"))
        check("focus moves into menu", pg.evaluate("document.getElementById('mobile-menu').contains(document.activeElement)"))
        sub = pg.locator("[data-mnav-toggle][aria-controls='m-services']")
        check("active section is pre-expanded", sub.get_attribute("aria-expanded") == "true")
        comp = pg.locator("[data-mnav-toggle][aria-controls='m-company']")
        comp.click()
        check("nested section expands", comp.get_attribute("aria-expanded") == "true" and pg.locator("#m-company.is-open").count() == 1)
        for _ in range(40):
            pg.keyboard.press("Tab")
        check("focus trapped in menu", pg.evaluate("document.getElementById('mobile-menu').contains(document.activeElement) || document.activeElement.matches('[data-menu-toggle]')"))
        pg.keyboard.press("Escape")
        check("Escape closes menu", tog.get_attribute("aria-expanded") == "false" and pg.locator("#mobile-menu.is-open").count() == 0)
        check("focus returns to menu button", pg.evaluate("document.activeElement.matches('[data-menu-toggle]')"))
        check("scroll unlocked after close", not pg.evaluate("document.documentElement.classList.contains('is-locked')"))
        check("no JS errors (mobile)", not errs, errs)
        ctx.close()

        # ---------- desktop dropdown + keyboard ----------
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        pg.goto(base + "/page/kurumsal-ru")
        btn = pg.locator(".nav [aria-controls='dd-company']")
        btn.focus()
        pg.keyboard.press("Enter")
        check("dropdown opens with Enter", btn.get_attribute("aria-expanded") == "true")
        pg.keyboard.press("ArrowDown")
        check("ArrowDown moves into menu", pg.evaluate("document.activeElement.closest('#dd-company') !== null"))
        check("current page marked aria-current", pg.locator("#dd-company a[aria-current='page']").count() == 1)
        pg.keyboard.press("Escape")
        check("Escape closes dropdown and returns focus", btn.get_attribute("aria-expanded") == "false" and pg.evaluate("document.activeElement.getAttribute('aria-controls') === 'dd-company'"))
        check("active section underlined", "is-active" in (btn.get_attribute("class") or ""))
        # mouse users: hover opens, the click that follows must not close it again
        lt = pg.locator(".lang__toggle")
        lt.hover()
        pg.wait_for_timeout(50)
        lt.click()
        check("hover then click keeps language menu open", lt.get_attribute("aria-expanded") == "true")
        pg.locator("#dd-lang a[data-lang-switch='kk']").click()
        pg.wait_for_load_state()
        check("switch RU→KK keeps equivalent page", pg.url.endswith("/page/kurumsal-kk"), pg.url)
        pg.reload()
        check("reload keeps Kazakh", pg.evaluate("document.documentElement.lang") == "kk")
        cookies = {c["name"]: c["value"] for c in ctx.cookies()}
        check("language preference cookie stored", cookies.get("mt_lang") == "kk", cookies)
        pg.goto(base + "/")
        check("bare domain returns user to Kazakh home", pg.url.endswith("/page/ana-sayfa-kk"), pg.url)
        # untranslated EN page: switcher offers the list, not Turkish content
        pg.goto(base + "/page/akbozat-restoran-kk")
        en = pg.locator("#dd-lang a[data-lang-switch='en']")
        check("missing EN translation links to EN completed list", en.get_attribute("href") == "/page/metro-teknik-completed-projects")
        check("missing EN translation is labelled", en.get_attribute("title") is not None)
        # lightbox
        pg.goto(base + "/page/uygulama-ornekleri-kk")
        first = pg.locator("a[data-lightbox]").first
        first.click()
        dlg = pg.locator("dialog.lightbox")
        check("lightbox opens", dlg.evaluate("d => d.open"))
        pg.keyboard.press("ArrowRight")
        pos = pg.locator(".lightbox__pos").text_content()
        check("ArrowRight advances", pos.startswith("2 /"), pos)
        pg.keyboard.press("Escape")
        check("Escape closes lightbox", not dlg.evaluate("d => d.open"))
        check("focus returns to thumbnail", pg.evaluate("document.activeElement.matches('a[data-lightbox]')"))
        check("full image link works without JS (href to full size)", "/main/" in first.get_attribute("href"))
        ctx.close()

        # ---------- reduced motion ----------
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        pg = ctx.new_page()
        pg.goto(base + "/page/ana-sayfa-kk")
        check("reduced motion: reveal not armed", not pg.evaluate("document.documentElement.classList.contains('reveal-armed')"))
        dur = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--dur-base').trim()")
        check("reduced motion: durations zeroed", dur in ("0ms", "0s"), dur)
        ctx.close()

        # ---------- no JavaScript ----------
        ctx = b.new_context(viewport={"width": 390, "height": 844}, java_script_enabled=False)
        pg = ctx.new_page()
        pg.goto(base + "/page/ana-sayfa-kk")
        vis = pg.evaluate("[...document.querySelectorAll('[data-reveal]')].every(e => getComputedStyle(e).opacity === '1')")
        check("no-JS: all content visible", vis)
        pg.locator("[data-menu-toggle]").click()
        check("no-JS: mobile menu reachable", pg.evaluate("getComputedStyle(document.getElementById('mobile-menu')).visibility") == "visible")
        ctx.close()
        b.close()

    ok = sum(1 for r in results if r[1])
    for name, passed, detail in results:
        print(("PASS " if passed else "FAIL ") + name + ("" if passed else f"  -> {detail}"))
    print(f"{ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
