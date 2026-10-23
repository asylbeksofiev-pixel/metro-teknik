"""Browser checks against the local preview (tools/serve.py must be running).

For every URL x viewport width: horizontal overflow, console errors, failed requests, broken images,
clipped text in headings/nav, html[lang]; optional full-page screenshots.

Usage: python tools/check_ui.py [--base http://127.0.0.1:8080] [--shots screenshots] [--all]
"""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WIDTHS = [360, 390, 768, 1024, 1440]
SAMPLE = [
    "/", "/page/ana-sayfa-kk", "/page/main-page", "/page/ana-sayfa-ru",
    "/page/kurumsal-kk", "/page/kurumsal-ru", "/page/corporate", "/page/baskanin-mesaji-kk",
    "/page/kalite-ve-cevre-politikamiz-kk", "/page/is-bitirme-belgelerimiz-kk",
    "/page/havalandirma-sistemleri-kk", "/page/mekanik-otomasyon-ru", "/page/heating-and-cooling",
    "/page/metro-teknik-devam-eden-projeler-kk", "/page/metro-teknik-biten-projeleri-kk", "/page/metro-teknik-completed-projects",
    "/page/kokshetau-hospital-kk", "/page/kutuphane-binasi-astana-kk", "/page/expo-2017-kongre-merkezi-astana-ru",
    "/page/aktau-resort-hotel", "/page/turkistan-sehir-hastanesi-kk",
    "/page/uygulama-ornekleri-kk", "/page/iletisim-kk", "/page/contact", "/page/iletisim",
]
SHOT = {"/page/ana-sayfa-kk": "home-kk", "/": "home-tr", "/page/kurumsal-kk": "company-kk",
        "/page/havalandirma-sistemleri-kk": "service-kk", "/page/metro-teknik-biten-projeleri-kk": "projects-kk",
        "/page/kokshetau-hospital-kk": "project-kk", "/page/uygulama-ornekleri-kk": "gallery-kk",
        "/page/iletisim-kk": "contact-kk", "/page/kurumsal-ru": "company-ru", "/page/main-page": "home-en"}

JS_AUDIT = """
() => {
  const vw = document.documentElement.clientWidth;
  const over = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.mobile-panel, .dropdown, .visually-hidden, dialog')) over.push(el.tagName + '.' + el.className);
  });
  const clipped = [];
  document.querySelectorAll('h1:not(.visually-hidden),h2:not(.visually-hidden),h3,.nav__link,.btn,.card__title,.tabs a,.lang__toggle,.menu-toggle,dt,dd').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') clipped.push(el.textContent.trim().slice(0, 40));
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).whiteSpace === 'nowrap') clipped.push('nowrap:' + el.textContent.trim().slice(0, 40));
  });
  const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.src);
  const small = [...document.querySelectorAll('a, button')].filter(el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.height < 24 && s.display !== 'inline' && !el.closest('.visually-hidden, .breadcrumb, .prose, .footer-about');
  }).map(el => el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label'));
  return {lang: document.documentElement.lang, scrollW: document.documentElement.scrollWidth, vw,
          overflow: [...new Set(over)].slice(0, 6), clipped: [...new Set(clipped)].slice(0, 6), broken: imgs, smallTargets: [...new Set(small)].slice(0, 6),
          title: document.title};
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--shots", default=str(ROOT / "screenshots"))
    ap.add_argument("--all", action="store_true", help="check every built page at 390 and 1440")
    a = ap.parse_args()
    shots = Path(a.shots)
    shots.mkdir(exist_ok=True)
    urls = SAMPLE
    widths = WIDTHS
    if a.all:
        urls = list(json.loads((ROOT / "dist" / "_routes.json").read_text(encoding="utf-8"))["url_index"])
        widths = [390, 1440]
    problems = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        for w in widths:
            ctx = browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            failed = []
            page.on("requestfailed", lambda r: failed.append(r.url) if "127.0.0.1" in r.url else None)
            for u in urls:
                errors.clear(); failed.clear()
                page.goto(a.base + u, wait_until="networkidle")
                page.evaluate("document.fonts.ready")
                # scroll through the page so lazy images load and reveal animations finish
                page.evaluate("""async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo({top: y, behavior: 'instant'}); await new Promise(r => setTimeout(r, 40)); } window.scrollTo({top: 0, behavior: 'instant'}); }""")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(300)
                r = page.evaluate(JS_AUDIT)
                bad = r["scrollW"] > r["vw"] or r["overflow"] or r["clipped"] or r["broken"] or errors or failed
                if bad or r["smallTargets"]:
                    problems += 1 if bad else 0
                    print(f"[{w}] {u} lang={r['lang']} scrollW={r['scrollW']} overflow={r['overflow']} clipped={r['clipped']} broken={r['broken'][:3]} errors={errors[:3]} failed={failed[:3]} small={r['smallTargets']}")
                if not a.all and u in SHOT and w in (390, 1440):
                    page.screenshot(path=str(shots / f"{SHOT[u]}-{w}.png"), full_page=True)
            ctx.close()
        browser.close()
    print(f"checked {len(urls)} urls x {len(widths)} widths, pages with problems: {problems}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
