#!/usr/bin/env python3
"""Writes icons/icon.svg: a clapper slate with a calendar grid on its board."""
from pathlib import Path
cols = ['#ff8a4c', '#f5b544', '#4fd1a1', '#6e9bff', '#b48cff']
stripes = ''.join(f'<path d="M{118+i*62} 118 l40 0 l-28 58 l-40 0z" fill="{c}"/>' for i, c in enumerate(cols))
cells = ''
for r in range(3):
    for c in range(5):
        x, y = 128 + c * 54, 238 + r * 54
        on = (r, c) in [(0, 3), (1, 1), (1, 2), (2, 4)]
        cells += f'<rect x="{x}" y="{y}" width="40" height="40" rx="9" fill="{"#f5b544" if on else "#2c3036"}"/>'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#101113"/>
<g transform="rotate(-8 100 190)"><rect x="92" y="112" width="328" height="70" rx="14" fill="#23262b"/>{stripes}</g>
<rect x="92" y="200" width="328" height="220" rx="22" fill="#1b1d21" stroke="#3a3e45" stroke-width="4"/>
{cells}
</svg>
'''
out = Path(__file__).resolve().parent.parent / 'icons' / 'icon.svg'
out.write_text(svg)
print(out)
