"""Local server for dist/ that mirrors the intended production routing.

* The URL alone decides the language: /page/kurumsal-ru is Russian for every visitor, cookie or not.
* "/" serves Turkish (x-default); a returning visitor whose mt_lang cookie names another language is
  sent to that language's home page.
* Legacy compatibility: ?lng=xx_yy on any page and POST /site/clang (the old language form) redirect
  to the equivalent page in the requested language instead of changing a hidden session.
* Legacy links whose pages no longer exist (they redirected to "/" on the live site) get a 301 to the
  completed-projects list.

Usage: python tools/serve.py [--port 8080] [--dist dist]
"""
import argparse
import json
import mimetypes
import sys
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/svg+xml", ".svg")


def make_handler(dist: Path):
    routes = json.loads((dist / "_routes.json").read_text(encoding="utf-8"))
    pages, index, legacy = routes["pages"], routes["url_index"], routes["legacy_codes"]
    lists, status = routes["lists"], routes["status"]

    def equivalent(path, lang):
        """URL of the page `path` in `lang`, falling back to the matching section when untranslated."""
        path = routes["aliases"].get(path, path)
        hit = index.get(path)
        if not hit:
            return pages["home"].get(lang, "/")
        pid = hit[0]
        if lang in pages.get(pid, {}):
            return pages[pid][lang]
        st = status.get(pid) or "completed"
        return pages[lists[st]].get(lang, pages["home"][lang])

    class Handler(BaseHTTPRequestHandler):
        server_version = "MetroTeknikPreview/1.0"

        def log_message(self, fmt, *args):
            sys.stderr.write("%s %s\n" % (self.command, fmt % args))

        def redirect(self, location, code=HTTPStatus.FOUND, lang=None):
            self.send_response(code)
            self.send_header("Location", location)
            if lang:
                self.send_header("Set-Cookie", f"mt_lang={lang}; Path=/; Max-Age=31536000; SameSite=Lax")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def send_file(self, f: Path, code=HTTPStatus.OK, cache="no-cache"):
            data = f.read_bytes()
            ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "image/svg+xml"):
                ctype += "; charset=utf-8"
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", cache)
            if f.suffix == ".html":
                self.send_header("Vary", "Cookie")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def not_found(self, path):
            lang = "tr"
            for code in ("en", "ru", "kk"):
                if path.endswith("-" + code):
                    lang = code
            self.send_file(dist / f"404-{lang}.html", HTTPStatus.NOT_FOUND)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            u = urlparse(self.path)
            path = u.path.rstrip("/") or "/"
            q = parse_qs(u.query)
            if "lng" in q:  # legacy ?lng=ru_ru links from the old project lists
                lang = legacy.get(q["lng"][0].lower())
                if lang:
                    return self.redirect(equivalent(path, lang), lang=lang)
            if path in routes["broken"]:
                return self.redirect(pages[routes["broken"][path]]["tr"], HTTPStatus.MOVED_PERMANENTLY)
            if path == "/":
                cookie = SimpleCookie(self.headers.get("Cookie", ""))
                pref = cookie.get("mt_lang").value if cookie.get("mt_lang") else None
                if pref in ("en", "ru", "kk"):
                    return self.redirect(pages["home"][pref])
                return self.send_file(dist / "index.html")
            if path.startswith("/static/"):
                f = (dist / path.lstrip("/")).resolve()
                if dist.resolve() in f.parents and f.is_file():
                    return self.send_file(f, cache="public, max-age=31536000, immutable")
                return self.not_found(path)
            for name in ("sitemap.xml", "robots.txt", "favicon.ico", "apple-touch-icon.png"):
                if path == "/" + name:
                    return self.send_file(dist / name)
            if path.startswith("/page/"):
                f = dist / "page" / (path[len("/page/"):] + ".html")
                if f.is_file() and "/" not in path[len("/page/"):]:
                    return self.send_file(f)
            return self.not_found(path)

        def do_POST(self):
            u = urlparse(self.path)
            if u.path.rstrip("/") == "/site/clang":  # old language form: lng=ru_ru&refurl=
                length = int(self.headers.get("Content-Length") or 0)
                form = parse_qs(self.rfile.read(length).decode("utf-8", "replace"))
                lang = legacy.get((form.get("lng") or [""])[0].lower())
                ref = (form.get("refurl") or [""])[0] or self.headers.get("Referer") or "/"
                ref_path = urlparse(ref).path or "/"
                if lang:
                    return self.redirect(equivalent(ref_path.rstrip("/") or "/", lang), lang=lang)
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    a = ap.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(Path(a.dist)))
    print(f"Serving {a.dist} at http://127.0.0.1:{a.port}/", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
