"""Build the favicon / app-icon set from the supplied circular Metro Teknik badge.

Only format adjustments are made: the light-grey square corners outside the circular badge become transparent
(apple-touch-icon keeps an opaque background because iOS ignores transparency), and the badge is resized.
The artwork itself is not changed.

Source: static/img/icon-source/metro-teknik-icon-source.webp (1024×1024)
Output: static/img/icons/{favicon.ico, favicon-16.png, favicon-32.png, favicon-48.png, apple-touch-icon.png,
        icon-192.png, icon-512.png}, static/site.webmanifest
"""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static" / "img" / "icon-source" / "metro-teknik-icon-source.webp"
OUT = ROOT / "static" / "img" / "icons"


def badge_bbox(im):
    """Bounding box of the badge: everything that differs from the near-white corner colour."""
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > 24 else 0)
    return diff.getbbox()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")
    box = badge_bbox(src)
    side = max(box[2] - box[0], box[3] - box[1])
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    crop = src.crop((int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2)))
    # anti-aliased circular alpha mask (drawn at 4x, then reduced)
    big = side * 4
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, big - 3, big - 3), fill=255)
    mask = mask.resize(crop.size, Image.LANCZOS)
    badge = crop.copy()
    badge.putalpha(mask)

    def sized(n):
        return badge.resize((n, n), Image.LANCZOS)

    for n in (16, 32, 48, 192, 512):
        name = f"favicon-{n}.png" if n <= 48 else f"icon-{n}.png"
        sized(n).save(OUT / name, optimize=True)
    sized(256).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # iOS: opaque square, badge on the badge's own dark background colour with a small safe margin
    dark = crop.convert("RGB").getpixel((side // 2, side // 5))
    apple = Image.new("RGBA", (180, 180), dark + (255,))
    inner = sized(164)
    apple.alpha_composite(inner, (8, 8))
    apple.convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    manifest = {
        "name": "Metro Teknik", "short_name": "Metro Teknik",
        "icons": [{"src": "/static/img/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "/static/img/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}],
        "theme_color": "#0e1835", "background_color": "#ffffff", "display": "browser", "start_url": "/",
    }
    (ROOT / "static" / "site.webmanifest").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print("badge bbox", box, "->", side, "px; dark bg", dark)


if __name__ == "__main__":
    main()
