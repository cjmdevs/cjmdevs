#!/usr/bin/env python3
"""Generate the PWA icon set with no third-party dependencies.

Draws a card-back motif (rounded square, red/black split diamond, joker pip)
straight into an RGBA buffer and writes it out as PNG via zlib.

    python3 tools/make_icons.py
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG = (20, 29, 36)
CARD = (247, 245, 238)
RED = (207, 43, 58)
BLACK = (26, 35, 43)
GOLD = (232, 194, 90)


def blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


class Canvas:
    def __init__(self, size, bg):
        self.n = size
        self.px = [[bg for _ in range(size)] for _ in range(size)]

    def set(self, x, y, color, alpha=1.0):
        if 0 <= x < self.n and 0 <= y < self.n and alpha > 0:
            if alpha >= 1.0:
                self.px[y][x] = color
            else:
                self.px[y][x] = blend(self.px[y][x], color, alpha)

    def fill_rounded(self, x0, y0, x1, y1, r, color):
        """Anti-aliased rounded rectangle via per-pixel distance."""
        for y in range(int(y0) - 2, int(y1) + 3):
            for x in range(int(x0) - 2, int(x1) + 3):
                cx = min(max(x, x0 + r), x1 - r)
                cy = min(max(y, y0 + r), y1 - r)
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                a = min(1.0, max(0.0, r + 0.5 - d)) if d > r - 1 else 1.0
                if x0 <= x <= x1 and y0 <= y <= y1:
                    self.set(x, y, color, a)

    def fill_diamond(self, cx, cy, rx, ry, color):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = abs(x - cx) / rx + abs(y - cy) / ry
                a = min(1.0, max(0.0, (1.0 - d) * max(rx, ry) * 0.5 + 0.5))
                self.set(x, y, color, a)

    def fill_circle(self, cx, cy, r, color):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                self.set(x, y, color, min(1.0, max(0.0, r + 0.5 - d)))

    def to_png(self, path):
        raw = bytearray()
        for row in self.px:
            raw.append(0)  # filter type 0
            for (r, g, b) in row:
                raw += bytes((r, g, b))

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data
                    + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", self.n, self.n, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        png += chunk(b"IEND", b"")
        path.write_bytes(png)


def draw(size, maskable=False):
    c = Canvas(size, BG)
    u = size / 100.0
    # Maskable icons must keep their art inside the safe circle.
    inset = 26 if maskable else 12

    c.fill_rounded(inset * u, (inset - 4) * u, (100 - inset) * u, (104 - inset) * u, 9 * u, CARD)

    cx, cy = size / 2, size / 2
    c.fill_diamond(cx, cy, (26 - inset * 0.35) * u, (34 - inset * 0.4) * u, RED)
    c.fill_diamond(cx, cy, (16 - inset * 0.22) * u, (22 - inset * 0.26) * u, BLACK)
    c.fill_circle(cx, cy - (5 - inset * 0.06) * u, (5.5 - inset * 0.05) * u, GOLD)

    # Three bells on the jester's cap.
    for dx in (-11, 0, 11):
        c.fill_circle(cx + dx * u * (1 - inset * 0.012),
                      cy + (13 - inset * 0.16) * u,
                      2.6 * u, GOLD)
    return c


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "icon-180.png")):
        draw(size).to_png(OUT / name)
        print("wrote", name)
    draw(512, maskable=True).to_png(OUT / "icon-maskable-512.png")
    print("wrote icon-maskable-512.png")

    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<rect width="100" height="100" rx="18" fill="#141d24"/>'
        '<rect x="12" y="8" width="76" height="84" rx="9" fill="#f7f5ee"/>'
        '<path d="M50 22 76 50 50 78 24 50Z" fill="#cf2b3a"/>'
        '<path d="M50 32 66 50 50 68 34 50Z" fill="#1a232b"/>'
        '<circle cx="50" cy="45" r="6" fill="#e8c25a"/>'
        '<circle cx="39" cy="63" r="3" fill="#e8c25a"/>'
        '<circle cx="50" cy="63" r="3" fill="#e8c25a"/>'
        '<circle cx="61" cy="63" r="3" fill="#e8c25a"/>'
        '</svg>\n'
    )
    print("wrote favicon.svg")


if __name__ == "__main__":
    main()
