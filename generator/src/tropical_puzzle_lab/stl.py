"""Printable meshes (binary STL) of a generated puzzle.

Works from a `puzzle.json` definition, so the printed pieces are exactly the
pieces of the browser puzzle. Fabrication choices follow the rev2 source
(`puzzles/rev2/source/PRINTING.md`): every footprint edge is offset inward by
`xy_inset` mm, the roof plane stays where it is (it is evaluated on the smaller
footprint), and there is no Z compensation. Floats are fine here: the exact
construction has already been validated by `tpl-export`.
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

from .geometry import clip

Vec3 = tuple[float, float, float]
Mesh = tuple[list[Vec3], list[tuple[int, int, int]]]

DEFAULT_XY_INSET_MM = 0.15
DEFAULT_WALL_MM = 4.0
DEFAULT_FLOOR_MM = 3.0
ORIENTATIONS = ("roof-down", "underside-down")


def inset(poly: list[tuple[float, float]], d: float) -> list[tuple[float, float]]:
    """Offset every edge of a convex CCW polygon inward by d (perpendicular to the edge)."""
    if not math.isfinite(d) or d < 0:
        raise ValueError("inset must be a finite, nonnegative distance in mm")
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    out = [(min(xs), min(ys)), (max(xs), min(ys)), (max(xs), max(ys)), (min(xs), max(ys))]
    for a, b in zip(poly, poly[1:] + poly[:1]):
        # Inward (left) normal of the CCW edge a -> b, unit length.
        n = (a[1] - b[1], b[0] - a[0])
        length = math.hypot(*n)
        n = (n[0] / length, n[1] / length)
        out = clip(out, n, n[0] * a[0] + n[1] * a[1] + d)
        if len(out) < 3:
            raise ValueError(f"inset {d} mm eliminates the piece; use a smaller value")
    # Float clipping can leave near-duplicate vertices where a clip line passes through a corner.
    out = [p for i, p in enumerate(out) if math.dist(p, out[i - 1]) > 1e-9]
    if len(out) < 3:
        raise ValueError(f"inset {d} mm eliminates the piece; use a smaller value")
    # Start at the vertex nearest the source's first one, so vertices correspond while no edge vanishes.
    k = min(range(len(out)), key=lambda i: math.dist(out[i], poly[0]))
    return out[k:] + out[:k]


def roof_height(piece: dict, u: float, v: float) -> float:
    """Height above the underside at local point (u, v): the roof plane, or the uniform thickness."""
    if "roof" in piece:
        r = piece["roof"]
        return r["z0"] + r["gx"] * u + r["gy"] * v
    return piece["thickness"]


def tilt_deg(piece: dict) -> float:
    """Angle between the roof and the underside."""
    r = piece.get("roof")
    return math.degrees(math.atan(math.hypot(r["gx"], r["gy"]))) if r else 0.0


def prism(poly: list[tuple[float, float]], height) -> Mesh:
    """Closed, outward-wound mesh between z=0 and z=height(u, v) over a convex CCW polygon."""
    n = len(poly)
    vertices = [(u, v, 0.0) for u, v in poly] + [(u, v, height(u, v)) for u, v in poly]
    faces = []
    for k in range(1, n - 1):
        faces.append((0, k + 1, k))  # underside, facing -z
        faces.append((n, n + k, n + k + 1))  # roof
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j))
        faces.append((i, n + j, n + i))
    return vertices, faces


def _rotation(axis: Vec3, angle: float) -> list[list[float]]:
    """Rodrigues rotation matrix about a unit axis."""
    x, y, z = axis
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    return [
        [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
        [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
        [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
    ]


def _matmul(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def roof_down_rotation(piece: dict) -> list[list[float]]:
    """Rotation that turns the roof's outward normal to -z, so the roof lies on the print bed."""
    r = piece.get("roof", {"gx": 0.0, "gy": 0.0})
    gx, gy = r["gx"], r["gy"]
    g = math.hypot(gx, gy)
    # First level the roof: turn its normal (-gx, -gy, 1) up to +z about the axis normal x ez.
    level = _rotation((-gy / g, gx / g, 0.0), math.atan(g)) if g > 0 else _rotation((1.0, 0.0, 0.0), 0.0)
    # Then turn the piece over about x.
    return _matmul(_rotation((1.0, 0.0, 0.0), math.pi), level)


def piece_mesh(piece: dict, xy_inset: float = DEFAULT_XY_INSET_MM, orientation: str = "roof-down") -> Mesh:
    """Print mesh of one piece in local coordinates (origin at the ideal footprint's centroid)."""
    if orientation not in ORIENTATIONS:
        raise ValueError(f"orientation must be one of {ORIENTATIONS}")
    poly = inset([tuple(p) for p in piece["polygon"]], xy_inset)
    vertices, faces = prism(poly, lambda u, v: roof_height(piece, u, v))
    if orientation == "roof-down":
        m = roof_down_rotation(piece)
        vertices = [tuple(sum(m[i][k] * p[k] for k in range(3)) for i in range(3)) for p in vertices]
        z0 = min(p[2] for p in vertices)
        vertices = [(x, y, z - z0) for x, y, z in vertices]
    return vertices, faces


def tray_mesh(half_span: float, rim: float, wall: float = DEFAULT_WALL_MM, floor: float = DEFAULT_FLOOR_MM) -> Mesh:
    """Single watertight square tray, as in rev2: the cavity is the target square, `rim` mm deep."""
    outer = half_span + wall
    top = floor + rim

    def ring(r: float, z: float) -> list[Vec3]:
        return [(-r, -r, z), (r, -r, z), (r, r, z), (-r, r, z)]

    vertices = ring(outer, 0.0) + ring(outer, top) + ring(half_span, top) + ring(half_span, floor)
    panels = [(3, 2, 1, 0), (12, 13, 14, 15)]
    for k in range(4):
        j = (k + 1) % 4
        panels += [(k, j, 4 + j, 4 + k), (4 + k, 4 + j, 8 + j, 8 + k), (8 + k, 8 + j, 12 + j, 12 + k)]
    faces = [(p[0], p[i], p[i + 1]) for p in panels for i in range(1, len(p) - 1)]
    return vertices, faces


def volume(mesh: Mesh) -> float:
    """Signed volume by the divergence theorem; positive for an outward-wound closed mesh."""
    vertices, faces = mesh
    total = 0.0
    for i, j, k in faces:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = vertices[i], vertices[j], vertices[k]
        total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    return total / 6


def write_stl(path: Path, mesh: Mesh, header: str = "tropical-puzzle-lab, units mm") -> None:
    vertices, faces = mesh
    with path.open("wb") as out:
        out.write(header.encode("ascii")[:80].ljust(80, b" "))
        out.write(struct.pack("<I", len(faces)))
        for face in faces:
            a, b, c = (vertices[i] for i in face)
            u = [b[k] - a[k] for k in range(3)]
            v = [c[k] - a[k] for k in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            length = math.hypot(*n) or 1.0
            out.write(struct.pack("<12fH", *(x / length for x in n), *a, *b, *c, 0))


def read_stl_triangles(path: Path) -> list[tuple[Vec3, Vec3, Vec3]]:
    data = path.read_bytes()
    (count,) = struct.unpack_from("<I", data, 80)
    triangles = []
    for k in range(count):
        values = struct.unpack_from("<12f", data, 84 + 50 * k)
        triangles.append((values[3:6], values[6:9], values[9:12]))
    return triangles


def export_print(puzzle: dict, out_dir: Path, xy_inset: float = DEFAULT_XY_INSET_MM, orientation: str = "roof-down",
                 wall: float = DEFAULT_WALL_MM, floor: float = DEFAULT_FLOOR_MM) -> list[Path]:
    """Write one STL per piece, the tray and SETTINGS.txt; return the written paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    geometry = puzzle["geometry"]
    written = []
    for piece in puzzle["pieces"]:
        path = out_dir / f"piece-{piece['id']}.stl"
        write_stl(path, piece_mesh(piece, xy_inset, orientation))
        written.append(path)
    path = out_dir / "tray.stl"
    write_stl(path, tray_mesh(geometry["spanMm"] / 2, geometry["trayRimMm"], wall, floor))
    written.append(path)
    max_tilt = max(tilt_deg(p) for p in puzzle["pieces"])
    settings = "\n".join([
        f"Puzzle: {puzzle['id']} ({puzzle['name']}), revision {puzzle['revision']}, {len(puzzle['pieces'])} pieces",
        f"Recipe hash: {puzzle['provenance']['recipeHash']}",
        f"Geometry hash: {puzzle['geometryHash']}",
        "Units: mm. Import at 100% scale.",
        f"XY inset per piece edge: {xy_inset:.3f} mm (nominal neighbour gap {2 * xy_inset:.3f} mm, wall gap {xy_inset:.3f} mm)",
        "Z clearance: 0 mm; roof planes and flat undersides preserved.",
        f"Piece orientation: {orientation}" + (
            f". The roof lies on the bed; side walls overhang by at most {max_tilt:.1f} degrees, so no supports are needed."
            if orientation == "roof-down" else "."),
        f"Tray: cavity {geometry['spanMm']:g} mm square, rim {geometry['trayRimMm']:g} mm, wall {wall:g} mm, floor {floor:g} mm.",
        "Physical fit is untested. First-layer (elephant-foot) compensation is separate from model clearance.",
        "",
    ])
    path = out_dir / "SETTINGS.txt"
    path.write_text(settings, encoding="utf-8", newline="\n")
    written.append(path)
    return written
