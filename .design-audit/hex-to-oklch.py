#!/usr/bin/env python3
"""Hex -> OKLCH converter for the --aw-* palette conversion (one-off audit tool)."""
import sys

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_to_srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

def srgb_to_oklab(r, g, b):
    l = srgb_to_linear(r); m = srgb_to_linear(g); s = srgb_to_linear(b)
    l_ = 0.4122214708 * l + 0.5363325363 * m + 0.0514459929 * s
    m_ = 0.2119034982 * l + 0.6806995451 * m + 0.1073969566 * s
    s_ = 0.0883024619 * l + 0.2817188376 * m + 0.6299787005 * s
    l_ **= (1/3); m_ **= (1/3); s_ **= (1/3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, a, b

def oklab_to_oklch(L, a, b):
    import math
    C = math.sqrt(a*a + b*b)
    h = math.degrees(math.atan2(b, a)) % 360
    return L, C, h

for hexv in sys.argv[1:]:
    L, C, h = oklab_to_oklch(*srgb_to_oklab(*hex_to_srgb(hexv)))
    print(f"{hexv}  ->  oklch({L*100:.1f}% {C:.3f} {h:.1f})")
