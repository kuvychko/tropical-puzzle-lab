import json
import math
from collections import Counter
from pathlib import Path

import pytest

from tropical_puzzle_lab.stl import (
    inset, piece_mesh, read_stl_triangles, roof_down_rotation, roof_height, tilt_deg, tray_mesh, volume, write_stl,
)

PUZZLES = Path(__file__).resolve().parents[2] / "puzzles"
PUZZLE_IDS = ["rev2", "new2", "new2-flat", "rat1"]


def load(puzzle_id):
    return json.loads((PUZZLES / puzzle_id / "puzzle.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module", params=PUZZLE_IDS)
def puzzle(request):
    return load(request.param)


def polygon_area(poly):
    return sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1])) / 2


def polygon_centroid(poly):
    a6 = 6 * polygon_area(poly)
    cx = sum((p[0] + q[0]) * (p[0] * q[1] - q[0] * p[1]) for p, q in zip(poly, poly[1:] + poly[:1]))
    cy = sum((p[1] + q[1]) * (p[0] * q[1] - q[0] * p[1]) for p, q in zip(poly, poly[1:] + poly[:1]))
    return cx / a6, cy / a6


def assert_closed(mesh):
    # Every directed edge is used once, and its reverse once: closed and consistently wound.
    _, faces = mesh
    edges = Counter((f[i], f[(i + 1) % 3]) for f in faces for i in range(3))
    assert all(n == 1 for n in edges.values())
    assert all((b, a) in edges for a, b in edges)


@pytest.mark.parametrize("orientation", ["underside-down", "roof-down"])
def test_piece_meshes_are_closed_with_prism_volume(puzzle, orientation):
    for piece in puzzle["pieces"]:
        mesh = piece_mesh(piece, 0.15, orientation)
        assert_closed(mesh)
        # The volume under a plane over a polygon is its area times the height at its centroid.
        poly = inset([tuple(p) for p in piece["polygon"]], 0.15)
        expected = polygon_area(poly) * roof_height(piece, *polygon_centroid(poly))
        assert volume(mesh) == pytest.approx(expected, rel=1e-9)
        assert min(v[2] for v in mesh[0]) == pytest.approx(0, abs=1e-12)


def test_roof_down_puts_the_roof_on_the_bed(puzzle):
    for piece in puzzle["pieces"]:
        vertices, _ = piece_mesh(piece, 0.15, "roof-down")
        n = len(vertices) // 2
        assert all(abs(z) < 1e-9 for _, _, z in vertices[n:]), "roof vertices are not on the bed"
        assert all(z > -1e-9 for _, _, z in vertices)
        # The roof's outward normal points straight down.
        r = piece.get("roof", {"gx": 0.0, "gy": 0.0})
        normal = (-r["gx"], -r["gy"], 1.0)
        m = roof_down_rotation(piece)
        turned = [sum(m[i][k] * normal[k] for k in range(3)) for i in range(3)]
        assert turned[0] == pytest.approx(0, abs=1e-12) and turned[1] == pytest.approx(0, abs=1e-12) and turned[2] < 0


def test_roof_down_needs_no_supports(puzzle):
    # Side walls overhang by the roof tilt; keep it well below the usual 45 degree limit.
    assert max(tilt_deg(p) for p in puzzle["pieces"]) < 30


def test_inset_moves_every_edge_inward_by_d(puzzle):
    for piece in puzzle["pieces"]:
        poly = [tuple(p) for p in piece["polygon"]]
        assert [c for v in inset(poly, 0) for c in v] == pytest.approx([c for v in poly for c in v])
        for d in (0.15, 0.4):
            shrunk = inset(poly, d)
            assert len(shrunk) == len(poly)
            for (a, b), (p, q) in zip(zip(poly, poly[1:] + poly[:1]), zip(shrunk, shrunk[1:] + shrunk[:1])):
                ex, ey = b[0] - a[0], b[1] - a[1]
                length = math.hypot(ex, ey)
                assert (q[0] - p[0]) * ey - (q[1] - p[1]) * ex == pytest.approx(0, abs=1e-9)  # parallel
                assert (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / length == pytest.approx(d, abs=1e-9)  # distance d, inside


def test_inset_rejects_bad_values():
    square = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for d in (-0.1, math.inf, math.nan, 0.6):
        with pytest.raises(ValueError):
            inset(square, d)


def test_tray_is_closed_with_the_target_cavity():
    mesh = tray_mesh(72, 7)
    assert_closed(mesh)
    assert volume(mesh) == pytest.approx(152 * 152 * 10 - 144 * 144 * 7)


def test_stl_round_trip(tmp_path, puzzle):
    mesh = piece_mesh(puzzle["pieces"][0])
    path = tmp_path / "piece.stl"
    write_stl(path, mesh)
    triangles = read_stl_triangles(path)
    assert len(triangles) == len(mesh[1])
    vertices, faces = mesh
    for tri, face in zip(triangles, faces):
        for got, want in zip(tri, face):
            assert got == pytest.approx(vertices[want], abs=1e-4)
