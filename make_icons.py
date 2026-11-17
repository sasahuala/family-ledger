#!/usr/bin/env python3
"""生成账本 PWA 图标（纯标准库，无需 Pillow）"""
import zlib, struct, math, sys

def sd_round_box(px, py, hw, hh, r):
    dx = abs(px) - hw + r
    dy = abs(py) - hh + r
    ax, ay = max(dx, 0.0), max(dy, 0.0)
    return math.sqrt(ax * ax + ay * ay) + min(max(dx, dy), 0.0) - r

def render(size):
    S = float(size)
    scale = S / 512.0
    out = bytearray()
    SS = 2  # 超采样
    for y in range(size):
        out.append(0)
        for x in range(size):
            ar = ag = ab = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    px = (x + (sx + 0.5) / SS) / scale - 256.0
                    py = (y + (sy + 0.5) / SS) / scale - 256.0
                    t = min(1.0, max(0.0, (px + 256.0) / 512.0 * 0.35 + (py + 256.0) / 512.0 * 0.65))
                    r = 255 * (1 - t) + 238 * t
                    g = 138 * (1 - t) + 78 * t
                    b = 92 * (1 - t) + 40 * t
                    # 白色圆角边框
                    d = sd_round_box(px, py, 146.0, 146.0, 46.0)
                    cover = 0.0
                    if -28.0 <= d <= 0.0:
                        cover = 1.0
                    # 三条横线
                    for ly in (-52.0, 0.0, 52.0):
                        dl = sd_round_box(px - 6.0, py - ly, 66.0, 9.0, 9.0)
                        if dl < 0:
                            cover = 1.0
                    # 右侧小圆点（第 4 条更短的线）
                    dc = math.hypot(px - 60.0, py - 52.0)
                    if dc < 12.0:
                        cover = 1.0
                    r = r * (1 - cover) + 255 * cover
                    g = g * (1 - cover) + 255 * cover
                    b = b * (1 - cover) + 255 * cover
                    ar += r; ag += g; ab += b
            n = SS * SS
            out += bytes((int(ar / n), int(ag / n), int(ab / n), 255))
    return bytes(out)

def write_png(path, size):
    raw = render(size)
    comp = zlib.compress(raw, 9)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', comp) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, len(png), 'bytes')

for s in (512, 192, 180):
    write_png(f'icon-{s}.png', s)
