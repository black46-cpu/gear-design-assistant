"""Local STEP exporter for the Gear Design Assistant (requires CadQuery)."""
from __future__ import annotations

import json
import math
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

if getattr(sys, "frozen", False):
    # PyInstaller puts read-only bundled assets under _MEIPASS. User data must
    # live outside that temporary/bundled directory.
    RESOURCE_ROOT = Path(sys._MEIPASS)
else:
    RESOURCE_ROOT = Path(__file__).resolve().parents[1]

WEB = RESOURCE_ROOT / "web"


def involute(angle: float) -> float:
    return math.tan(angle) - angle


def gear_outline(p: dict) -> list[tuple[float, float]]:
    """Sample an involute tooth boundary; root fillets are intentionally approximate."""
    m, z = float(p["module"]), int(p["teeth"])
    alpha = math.radians(float(p["pressure_angle"]))
    shift = float(p["profile_shift"])
    height_module = float(p.get("height_module", m))
    normal_alpha = math.radians(float(p.get("normal_pressure_angle", math.degrees(alpha))))
    pitch_d = m * z
    rb = pitch_d * math.cos(alpha) / 2
    ra = (pitch_d + 2 * height_module * (1 + shift)) / 2
    rf = (pitch_d - height_module * (2.5 - 2 * shift)) / 2
    rp = pitch_d / 2

    def half_angle(r: float) -> float:
        pitch_half = math.pi / (2 * z) + 2 * shift * math.tan(normal_alpha) / z
        if r < rb:
            return pitch_half + involute(alpha) + max(0.0, rb - r) * 0.012 / m
        pressure_at_r = math.acos(min(1.0, rb / r))
        return max(0.001, pitch_half + involute(alpha) - involute(pressure_at_r))

    flank_start = max(rb, rf)
    half_root = half_angle(flank_start) + max(0.0, flank_start - rf) * 0.012 / m
    pitch = 2 * math.pi / z
    points: list[tuple[float, float]] = []

    def polar(radius: float, angle: float) -> tuple[float, float]:
        return radius * math.cos(angle), radius * math.sin(angle)

    for tooth in range(z):
        center = -math.pi / 2 + tooth * pitch
        if tooth == 0:
            points.append(polar(rf, center - half_root))
        for j in range(10):
            radius = flank_start + (ra - flank_start) * j / 9
            points.append(polar(radius, center - half_angle(radius)))
        top_half = half_angle(ra)
        for j in range(1, 7):
            angle = center - top_half + 2 * top_half * j / 6
            points.append(polar(ra, angle))
        # The tip arc already ends at the right tip point; start the return
        # flank below the tip to avoid a zero-length duplicate edge.
        for j in range(8, -1, -1):
            radius = flank_start + (ra - flank_start) * j / 9
            points.append(polar(radius, center + half_angle(radius)))
        points.append(polar(rf, center + half_root))
        root_start = center + half_root
        root_end = -math.pi / 2 + (tooth + 1) * pitch - half_root
        for j in range(1, 6):
            points.append(polar(rf, root_start + (root_end - root_start) * j / 5))
    clean: list[tuple[float, float]] = []
    for point in points:
        if not clean or math.dist(clean[-1], point) >= 1e-8:
            clean.append(point)
    if len(clean) > 1 and math.dist(clean[0], clean[-1]) < 1e-8:
        clean.pop()
    return clean


def make_gear(p: dict):
    try:
        import cadquery as cq
    except ImportError as exc:
        raise RuntimeError("当前 Python 环境没有安装 CadQuery。请使用包含 CadQuery 的 Python 环境运行本程序。") from exc

    gear_type = p.get("type", "spur")
    if gear_type not in ("spur", "helical", "bevel"):
        raise ValueError("当前版本支持外啮合直齿、斜齿圆柱齿轮及单个直齿锥齿轮。")
    m, z = float(p["module"]), int(p["teeth"])
    width, bore = float(p["width"]), float(p["bore"])
    pressure = float(p["pressure_angle"])
    shift = float(p["profile_shift"])
    if not (0.5 <= m <= 20 and 6 <= z <= 200 and width > 0):
        raise ValueError("请检查模数、齿数和齿宽范围。")
    if not (14.5 <= pressure <= 30 and -0.5 <= shift <= 1):
        raise ValueError("请检查压力角或变位系数范围。")
    beta = math.radians(float(p.get("helix_angle", 0))) if gear_type == "helical" else 0.0
    if gear_type == "helical" and not math.radians(5) <= beta <= math.radians(45):
        raise ValueError("斜齿螺旋角需在 5° 到 45° 之间。")
    # UI module and pressure angle are normal-system values for helical gears.
    mt = m / math.cos(beta)
    alpha_t = math.atan(math.tan(math.radians(pressure)) / math.cos(beta))
    root_d = mt * z - m * (2.5 - 2 * shift)
    outer_d = mt * z + 2 * m * (1 + shift)
    if root_d <= 0 or outer_d <= 0 or bore < 0 or bore >= root_d:
        raise ValueError("齿顶圆、齿根圆或轴孔尺寸无效。")

    if gear_type == "bevel":
        pitch_radius = mt * z / 2
        if width > pitch_radius * 0.35:
            raise ValueError(f"该课程近似锥齿轮的齿宽需不大于 {pitch_radius * 0.35:.2f} mm。")
        sections = []
        section_count = max(8, min(24, math.ceil(width / 2)))
        outline = gear_outline({**p, "module": mt, "pressure_angle": math.degrees(alpha_t),
                                "normal_pressure_angle": pressure, "height_module": m})
        for index in range(section_count + 1):
            t = index / section_count
            scale = 1 - width * t / pitch_radius
            wire = (cq.Workplane("XY").polyline([(x * scale, y * scale) for x, y in outline])
                    .close().val().translate(cq.Vector(0, 0, width * t)))
            sections.append(wire)
        bevel_solid = cq.Solid.makeLoft(sections, ruled=False)
        profile = cq.Workplane("XY").newObject([bevel_solid])
        if bore > 0:
            profile = profile.faces(">Z").workplane().hole(bore)
        return profile

    transverse = {**p, "module": mt, "pressure_angle": math.degrees(alpha_t),
                   "normal_pressure_angle": pressure, "height_module": m}
    profile = cq.Workplane("XY").polyline(gear_outline(transverse)).close()
    if gear_type == "helical":
        twist = math.degrees(width * math.tan(beta) / (mt * z / 2))
        if p.get("hand", "right") == "left":
            twist = -twist
        solid = profile.twistExtrude(width, twist)
    else:
        solid = profile.extrude(width)
    if bore > 0:
        solid = solid.faces(">Z").workplane().hole(bore)
    return solid


def make_gear_pair(p: dict):
    """Build a nominal external gear-pair assembly with parallel, opposed axes."""
    import cadquery as cq

    if p.get("type") == "rack":
        rack, length = make_rack(p)
        pinion = make_gear({**p, "type": "spur", "helix_angle": 0})
        pinion = pinion.rotate((0, 0, 0), (0, 0, 1), 180)
        pinion = pinion.translate((0, -float(p["module"]) * int(p["teeth"]) / 2, 0))
        assembly = cq.Assembly(name="rack_and_pinion")
        assembly.add(pinion.val(), name=f"Pinion_z{p['teeth']}", color=cq.Color(0.78, 0.84, 0.92))
        assembly.add(rack.val(), name="Rack", color=cq.Color(0.31, 0.52, 0.78))
        return assembly, length

    if p.get("type") not in ("spur", "helical"):
        raise ValueError("齿轮副支持外啮合直齿或斜齿圆柱齿轮。")
    z1, z2 = int(p["teeth"]), int(p["teeth2"])
    if not 6 <= z2 <= 200:
        raise ValueError("齿轮 2 齿数需在 6 到 200 之间。")
    gear1 = make_gear({**p, "teeth": z1})
    gear2_params = {**p, "teeth": z2, "bore": float(p.get("bore2", p.get("bore", 0))),
                     # Keep the standard center distance by balancing the
                     # selected profile shift across the two gears.
                     "profile_shift": -float(p.get("profile_shift", 0)),
                     "hand": "left" if p.get("hand", "right") == "right" else "right"}
    gear2 = make_gear(gear2_params)
    normal_module = float(p["module"])
    beta = (math.radians(float(p.get("helix_angle", 0)))
            if p.get("type") == "helical" else 0.0)
    transverse_module = normal_module / math.cos(beta)
    center = transverse_module * (z1 + z2) / 2
    # Keep both axes parallel (+Z) and use opposite helix hands. This makes
    # the angular lead of the two flanks mirror across the line of centers.
    # The second gear's tooth center is half a circular pitch from the first
    # gear's tooth center at the contact line.
    gear1 = gear1.rotate((0, 0, 0), (0, 0, 1), 90)
    gear2_phase = 270 + 180 / z2
    gear2 = gear2.rotate((0, 0, 0), (0, 0, 1), gear2_phase)
    gear2 = gear2.translate((center, 0, 0))
    assembly = cq.Assembly(name="helical_gear_pair")
    assembly.add(gear1.val(), name=f"Gear1_z{z1}", color=cq.Color(0.78, 0.84, 0.92))
    assembly.add(gear2.val(), name=f"Gear2_z{z2}", color=cq.Color(0.31, 0.52, 0.78))
    return assembly, center


def make_rack(p: dict):
    """Create a straight, approximate involute rack extrusion for learning/CAD preview."""
    import cadquery as cq

    m, z, width = float(p["module"]), int(p["teeth"]), float(p["width"])
    count = max(8, z + 4)
    pitch = math.pi * m
    length = pitch * count
    root, tip = 1.25 * m, -0.5 * m
    root_width, tip_width = 0.78 * pitch, 0.5 * pitch
    points = [(-length / 2, root + 2 * m), (length / 2, root + 2 * m), (length / 2, root)]
    for i in range(count - 1, -1, -1):
        center = -length / 2 + (i + 0.5) * pitch
        points.extend(((center + root_width / 2, root), (center + tip_width / 2, tip),
                       (center - tip_width / 2, tip), (center - root_width / 2, root)))
    points.append((-length / 2, root))
    solid = cq.Workplane("XY").polyline(points).close().extrude(width)
    return solid, length


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self):
        path = urlparse(self.path).path
        file_name = {"/": "index.html", "/index.html": "index.html", "/style.css": "style.css", "/app.js": "app.js", "/vendor/three.module.js": "vendor/three.module.js", "/vendor/three.core.js": "vendor/three.core.js"}.get(path)
        if not file_name:
            self.send_error(404)
            return
        content = (WEB / file_name).read_bytes()
        content_type = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8"}[Path(file_name).suffix]
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        if urlparse(self.path).path != "/api/export-step":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 20_000:
                raise ValueError("请求数据过大。")
            params = json.loads(self.rfile.read(length))
            pair_mode = params.get("mode") == "pair"
            if pair_mode:
                solid, center_distance = make_gear_pair(params)
            else:
                solid = make_gear(params)
            if params.get("type") == "rack":
                stem = f"rack_pinion_m{params['module']}_z{params['teeth']}"
            elif pair_mode:
                stem = f"{params.get('type', 'spur')}_pair_m{params['module']}_z{params['teeth']}_z{params['teeth2']}"
            else:
                stem = f"gear_{params.get('type','spur')}_m{params['module']}_z{params['teeth']}"
            with tempfile.TemporaryDirectory(prefix="GearDesign-STEP-") as temp_dir:
                step_path = Path(temp_dir) / f"{stem}.step"
                if pair_mode:
                    solid.export(str(step_path), exportType="STEP", unit="MM")
                else:
                    solid.val().exportStep(str(step_path), unit="MM")
                data = step_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/step")
            self.send_header("Content-Disposition", f'attachment; filename="{step_path.name}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass
        except Exception as exc:
            payload = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("齿轮设计助手已启动：http://127.0.0.1:8765")
    print("生成的 STEP 文件保存到界面中选择的位置。按 Ctrl+C 停止。")
    server.serve_forever()
