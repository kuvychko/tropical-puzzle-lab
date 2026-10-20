// Three.js geometry for pieces, tray and handles. Puzzle x/y map to world x/y; z is up.
import * as THREE from 'three';
import type { PieceDef, Pose, Puzzle } from '../types';
import { radius } from '../geometry/polygon';

export function topHeight(piece: PieceDef, u: number, v: number): number {
  return piece.roof ? piece.roof.z0 + piece.roof.gx * u + piece.roof.gy * v : piece.thickness ?? 10;
}

export function maxHeight(piece: PieceDef): number {
  return Math.max(...piece.polygon.map(([u, v]) => topHeight(piece, u, v)));
}

/** Closed prism: flat underside at z=0, planar top, vertical sides (like rev2 `prism()`). */
export function pieceGeometry(piece: PieceDef): THREE.BufferGeometry {
  const poly = piece.polygon;
  const n = poly.length;
  const top = poly.map(([u, v]) => [u, v, topHeight(piece, u, v)]);
  const bottom = poly.map(([u, v]) => [u, v, 0]);
  const positions: number[] = [];
  const tri = (...pts: number[][]) => pts.forEach((p) => positions.push(...p));
  for (let k = 1; k < n - 1; k++) {
    tri(top[0], top[k], top[k + 1]);
    tri(bottom[0], bottom[k + 1], bottom[k]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(bottom[i], bottom[j], top[j]);
    tri(bottom[i], top[j], top[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface PieceObject {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  height: number;
}

export function makePiece(piece: PieceDef, index: number, colors: Palette): PieceObject {
  const geometry = pieceGeometry(piece);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors.piece, flatShading: true, roughness: 0.85 }));
  mesh.userData.index = index;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), new THREE.LineBasicMaterial({ color: colors.edge }));
  const group = new THREE.Group();
  group.add(mesh, edges);
  return { group, mesh, edges, height: maxHeight(piece) };
}

export function placeObject(object: THREE.Object3D, pose: Pose): void {
  object.position.set(pose.x, pose.y, 0);
  object.rotation.set(0, 0, pose.theta);
}

export interface Palette {
  background: number;
  table: number;
  floor: number;
  tray: number;
  piece: number;
  overlap: number;
  edge: number;
  selected: number;
  target: number;
  ghost: number;
}

export function palette(dark: boolean): Palette {
  return dark
    ? { background: 0x161b1f, table: 0x1e2529, floor: 0x2c353b, tray: 0x3a4650, piece: 0xc9c2b2, overlap: 0xe0565b, edge: 0x2b3135, selected: 0x6aa7ff, target: 0x8fb8bb, ghost: 0xe7c46a }
    : { background: 0xf4f2ed, table: 0xe9e5dc, floor: 0xfaf8f3, tray: 0x56636d, piece: 0xd8d1c1, overlap: 0xe0565b, edge: 0x4a5257, selected: 0x1f6feb, target: 0x3f7f84, ghost: 0xb8860b };
}

/** Square tray: floor, low walls outside the target, and the always-visible target outline. */
export function makeTray(puzzle: Puzzle, colors: Palette): THREE.Group {
  const group = new THREE.Group();
  const target = puzzle.geometry.target.vertices;
  const rim = puzzle.geometry.trayRimMm;
  const wall = 4;

  const table = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: colors.table, roughness: 1 }));
  table.position.z = -0.3;
  group.add(table);

  const shape = new THREE.Shape(target.map(([x, y]) => new THREE.Vector2(x, y)));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 1 }));
  floor.position.z = -0.1;
  group.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: colors.tray, roughness: 0.9 });
  for (let i = 0; i < target.length; i++) {
    const a = new THREE.Vector2(...target[i]);
    const b = new THREE.Vector2(...target[(i + 1) % target.length]);
    const along = b.clone().sub(a);
    const length = along.length();
    const outward = new THREE.Vector2(along.y, -along.x).normalize();
    const box = new THREE.Mesh(new THREE.BoxGeometry(length + 2 * wall, wall, rim), wallMaterial);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(outward.clone().multiplyScalar(wall / 2));
    box.position.set(mid.x, mid.y, rim / 2);
    box.rotation.z = Math.atan2(along.y, along.x);
    group.add(box);
  }

  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(target.map(([x, y]) => new THREE.Vector3(x, y, 0.05))),
    new THREE.LineBasicMaterial({ color: colors.target }),
  );
  group.add(outline);
  return group;
}

/** Rotation ring drawn above the selected piece; the wide invisible torus is the hit area. */
export function makeRotateHandle(colors: Palette): { group: THREE.Group; hit: THREE.Mesh; setRadius: (r: number) => void } {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: colors.selected, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), material);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), material);
  knob.position.set(1, 0, 0);
  const hit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 48), new THREE.MeshBasicMaterial({ visible: false }));
  const scaled = new THREE.Group();
  scaled.add(ring, knob, hit);
  group.add(scaled);
  group.visible = false;
  return { group, hit, setRadius: (r: number) => scaled.scale.setScalar(r) };
}

export function handleRadius(piece: PieceDef): number {
  return radius(piece.polygon) + 10;
}

/** Outlines of the reference assembly, shown only after an explicit reveal. */
export function makeGhost(puzzle: Puzzle, colors: Palette): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: colors.ghost });
  puzzle.pieces.forEach((piece, i) => {
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(piece.polygon.map(([u, v]) => new THREE.Vector3(u, v, 0.2))),
      material,
    );
    placeObject(line, puzzle.reference.poses[i]);
    group.add(line);
  });
  group.visible = false;
  return group;
}
