#!/usr/bin/env python3
"""Candidate AW state colors: OKLCH -> sRGB -> WCAG ratio on the ink ramp."""

def oklch_to_srgb(L, C, h):
    import math
    L = L / 100 if L > 1 else L
    h = math.radians(h)
    a = C * math.cos(h)
    b = C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l = l_ ** 3; m = m_ ** 3; s = s_ ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    def gamma(c):
        c = min(1, max(0, c))
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return gamma(r), gamma(g), gamma(bb)

def lum(rgb):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(fg, bg):
    hi, lo = sorted((lum(fg), lum(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)

def hx(rgb):
    return "#" + "".join(f"{round(c*255):02x}" for c in rgb)

inks = {"ink-900 #0b0e0f": (0.043, 0.055, 0.059), "ink-800 #10161a": (0.063, 0.086, 0.102)}

candidates = {
    "warn  oklch(80% 0.13 75)": (80, 0.13, 75),
    "warn  oklch(82% 0.12 78)": (82, 0.12, 78),
    "danger oklch(66% 0.20 25)": (66, 0.20, 25),
    "danger oklch(68% 0.19 25)": (68, 0.19, 25),
    "danger oklch(70% 0.18 25)": (70, 0.18, 25),
    "ok   phosphor oklch(84.4% 0.137 164)": (84.4, 0.137, 164.1),
    "info  teal oklch(73.1% 0.113 182)": (73.1, 0.113, 182.5),
    "text  #e9e2d9 oklch(91.6% 0.014 74)": (91.6, 0.014, 74.4),
    "soft  #bdb6ad oklch(77.9% 0.015 74)": (77.9, 0.015, 74.4),
    "copper oklch(69.7% 0.114 58.2)": (69.7, 0.114, 58.2),
    "copper-bright oklch(79.8% 0.113 65.8)": (79.8, 0.113, 65.8),
}
for name, (L, C, h) in candidates.items():
    rgb = oklch_to_srgb(L, C, h)
    out = [f"{name:42s} {hx(rgb)}"]
    for iname, irgb in inks.items():
        out.append(f"{ratio(rgb, irgb):.2f}")
    print("  ".join(out))
