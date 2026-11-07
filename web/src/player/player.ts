// Puzzle player: scene, interaction, history, persistence and HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { evaluate, type Evaluation } from '../geometry/evaluate';
import { bounds, transform } from '../geometry/polygon';
import { randomSeed, scramble } from '../geometry/scramble';
import { fittingPairs, groups, members, moveRigidly, type Pair, pairKey } from '../geometry/glue';
import { snapPose, snapTolerances } from '../geometry/snap';
import { matchingWalls, WALL_MATCH_STOPS_MM, type WallRef } from '../geometry/walls';
import {
  browserStore, formatTime, loadSession, newSession, pushUndo, recordGlue, recordWallMatch, redo, report, saveSession, type Session, undo,
} from '../sessions/session';
import { fetchIndex, showDifficulty } from '../difficulty/rating';
import { constructions, modeSwitchHtml } from '../gallery/modes';
import type { Pose, Puzzle } from '../types';
import {
  handleRadius, makeGhost, makePiece, makeRotateHandle, makeTray, makeWallOverlay, palette, placeObject, wallAtFace, type PieceObject,
} from './meshes';

// A press that moves less than this is a click, not a drag or an orbit.
const CLICK_SLOP_PX = 4;
const NUDGE_MM = 1;
const FINE_NUDGE_MM = 0.1;
const TURN_RAD = Math.PI / 180;
const FINE_TURN_RAD = Math.PI / 1800;
const RULES_SEEN_KEY = 'tpl:rules-seen';

// Camera presets as [polar from vertical, azimuth from the front], degrees. Keys follow PrusaSlicer
// (2, the bottom view, is omitted: the camera goes down to table level, never below it). The side
// views are at table level, to compare piece heights.
const VIEWS = { iso: [45, -30], top: [0, 0], front: [90, 0], rear: [90, 180], left: [90, -90], right: [90, 90] } as const;
// Pieces are not dragged where the pointer ray meets the drag plane at less than about 6°: near
// table level a pixel would move a piece by many millimetres, and at exactly 90° the ray never
// meets the plane. Clicking still selects, and keyboard nudges still work.
const MIN_DRAG_RAY_SLOPE = 0.1;
type View = keyof typeof VIEWS;
const VIEW_BUTTONS: [View, string, string][] = [
  ['iso', 'Iso', '0'], ['top', 'Top', '1'], ['front', 'Front', '3'], ['rear', 'Rear', '4'], ['left', 'Left', '5'], ['right', 'Right', '6'],
];

// Two presses on the same glued piece within this time detach it from its group.
const DOUBLE_CLICK_MS = 400;

// `group` is the dragged piece and everything glued to it, moved rigidly from their `poses0`.
type Drag =
  | { kind: 'move'; index: number; group: number[]; poses0: Pose[]; plane: THREE.Plane; offset: THREE.Vector2; changed: boolean }
  | { kind: 'rotate'; index: number; group: number[]; poses0: Pose[]; plane: THREE.Plane; start: number; changed: boolean };

export async function startPlayer(root: HTMLElement, puzzleId: string, params: URLSearchParams): Promise<void> {
  root.innerHTML = `<p class="loading">Loading ${escapeHtml(puzzleId)}…</p>`;
  const response = await fetch(`${import.meta.env.BASE_URL}puzzles/${encodeURIComponent(puzzleId)}/puzzle.json`);
  if (!response.ok) {
    root.innerHTML = `<div class="error"><p>Puzzle “${escapeHtml(puzzleId)}” was not found.</p><a href="${import.meta.env.BASE_URL}">Back to the gallery</a></div>`;
    return;
  }
  const puzzle: Puzzle = await response.json();
  new Player(root, puzzle, params);
  void showIndexInfo(root, puzzle);
}

/** Rating and Relief | Flat switch from index.json. On failure the plain badge stays and the rating is hidden. */
async function showIndexInfo(root: HTMLElement, puzzle: Puzzle): Promise<void> {
  try {
    const index = await fetchIndex();
    const entry = index.puzzles.find((e) => e.id === puzzle.id);
    if (!entry) return;
    showDifficulty(root, root.querySelector<HTMLElement>('[data-ui="difficulty"]')!, entry.difficulty);
    const modes = constructions(index).find((m) => m[puzzle.variant]?.id === puzzle.id);
    if (modes && Object.keys(modes).length > 1) root.querySelector<HTMLElement>('[data-ui="mode"]')!.innerHTML = modeSwitchHtml(modes, puzzle.variant);
  } catch (error) {
    console.warn(`index entry for ${puzzle.id} unavailable`, error);
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function storageFlag(key: string, value?: string): string | null {
  try {
    if (value !== undefined) window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

class Player {
  private store = browserStore();
  private session!: Session;
  private evaluation!: Evaluation;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 1, 10000);
  private controls: OrbitControls;
  private pieces: PieceObject[];
  private handle: ReturnType<typeof makeRotateHandle>;
  private ghost: THREE.Group;
  private colors = palette(matchMedia('(prefers-color-scheme: dark)').matches);
  private raycaster = new THREE.Raycaster();
  private selected: number | null = null;
  private drag: Drag | null = null;
  private lastClick: { x: number; y: number; index: number; time: number } | null = null;
  /** Glued pairs and the group label of each piece, from the last committed poses. */
  private glued: Pair[] = [];
  private groupOf: number[] = [];
  private emptyPress: { x: number; y: number } | null = null;
  private wallPress: (WallRef & { x: number; y: number }) | null = null;
  private activeWall: WallRef | null = null;
  private wallCandidates: WallRef[] = [];
  private wallOverlays: { parent: THREE.Group; mesh: ReturnType<typeof makeWallOverlay> }[] = [];
  private burstTimer: number | undefined;
  private dirty = true;
  private wasSolved = false;
  private lastTick = performance.now();
  private ui: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private puzzle: Puzzle, params: URLSearchParams) {
    root.innerHTML = this.template();
    root.querySelectorAll<HTMLElement>('[data-ui]').forEach((el) => (this.ui[el.dataset.ui!] = el));

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.ui.stage.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(this.colors.background);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-120, -200, 300);
    this.scene.add(sun);
    this.scene.add(makeTray(puzzle, this.colors));

    this.pieces = puzzle.pieces.map((p, i) => makePiece(p, i, this.colors));
    this.pieces.forEach((p) => this.scene.add(p.group));
    this.handle = makeRotateHandle(this.colors);
    this.scene.add(this.handle.group);
    this.ghost = makeGhost(puzzle, this.colors);
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Line) {
        (o.material as THREE.Material).depthTest = false;
        o.renderOrder = 10;
      }
    });
    this.scene.add(this.ghost);

    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // PrusaSlicer-style: left-drag on empty space orbits (left-drag on a piece moves it, see
    // onPointerDown), right- or middle-drag pans, the wheel zooms toward the cursor.
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.zoomToCursor = true;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.addEventListener('change', () => (this.dirty = true));

    this.initSession(params);
    this.bindEvents();
    this.resize();
    this.setView('iso');
    if (!storageFlag(RULES_SEEN_KEY)) this.toggleRules(true);
    (window as unknown as { tpl: unknown }).tpl = this.debugApi();
    requestAnimationFrame(this.frame);
  }

  private template(): string {
    const p = this.puzzle;
    const base = import.meta.env.BASE_URL;
    const relief = p.variant === 'relief';
    return `
      <div class="player">
        <header class="bar">
          <a class="back" href="${base}">← Gallery</a>
          <h1>${escapeHtml(p.name)}</h1>
          <span data-ui="mode"><span class="badge">${relief ? 'relief' : 'flat tiling'}</span></span>
          <span data-ui="difficulty"></span>
          <span class="spacer"></span>
          <button data-ui="rulesButton" type="button">Rules &amp; controls</button>
        </header>
        <div class="stage" data-ui="stage"></div>
        <div class="notice" data-ui="notice" hidden></div>
        <div class="status" data-ui="status"></div>
        <aside class="panel">
          <div class="row">
            <button data-ui="undo" type="button" title="Undo (Ctrl+Z)">Undo</button>
            <button data-ui="redo" type="button" title="Redo (Ctrl+Shift+Z)">Redo</button>
            <button data-ui="restart" type="button" title="Back to the start of this scramble">Restart</button>
            <button data-ui="newScramble" type="button" title="New random scramble">New scramble</button>
          </div>
          <div class="row">
            ${VIEW_BUTTONS.map(([view, label, key]) => `<button class="small" data-view="${view}" type="button" title="${label} view (${key})">${label}</button>`).join('')}
            <button class="small" data-ui="fit" type="button" title="Zoom to fit (Z)">Fit</button>
          </div>
          <div class="row">
            <button data-ui="reveal" type="button" title="Show the reference outlines (recorded in the report)">Show solution</button>
          </div>
          <label class="toggle" title="When you release a piece, align it flush with a nearby tray wall or piece edge (S). Recorded in the report.">
            <input data-ui="sticky" type="checkbox" /> Sticky edges
          </label>
          <label class="toggle" title="Pieces that fit together are glued and move as one; double-click a piece to detach it (G). Recorded in the report.">
            <input data-ui="glue" type="checkbox" /> Glue
          </label>
          ${relief ? `<label class="toggle" title="Click a piece's side wall to highlight pieces whose wall heights agree with it (M). Recorded in the report.">
            <input data-ui="wallMatch" type="checkbox" /> Wall match
          </label>
          <div class="wall-match" data-ui="wallMatchControls" hidden>
            <label>Height tolerance: <b data-ui="wallMatchTol"></b>
              <input data-ui="wallMatchSlider" type="range" min="0" max="${WALL_MATCH_STOPS_MM.length - 1}" step="1" />
            </label>
            <span class="result" data-ui="wallMatchResult"></span>
          </div>` : ''}
          <dl class="facts">
            <dt>Puzzle</dt><dd>${escapeHtml(p.id)} · rev ${p.revision}</dd>
            <dt>Seed</dt><dd data-ui="seed"></dd>
            <dt>Time</dt><dd data-ui="time"></dd>
          </dl>
          <button data-ui="copyReport" type="button" class="wide">Copy report line</button>
        </aside>
        <div class="rules" data-ui="rules" hidden>
          <div class="card">
            <h2>${escapeHtml(p.name)}</h2>
            <p>${escapeHtml(p.description)}</p>
            <ul>
              <li>Move all ${p.pieces.length} pieces into the square tray so they fill it with no overlaps.</li>
              ${relief ? '<li>The sloped tops must meet: neighbouring roofs agree in height along every shared edge.</li>' : '<li>Heights are uniform here; only the outlines matter.</li>'}
              <li>Pieces can be moved and turned but never flipped. Nothing snaps into place.</li>
              <li>Pieces may pass through each other while you work. Overlapping pieces, and pieces pushed through the tray wall, turn red.</li>
              <li>Any assembly that fills the tray within tolerance counts, not only the reference one.</li>
              <li>Optional <b>sticky edges</b> (off by default): a released piece aligns flush with a tray wall or piece edge it is already next to. It never pulls pieces toward the solution, and its use is noted in the report.</li>
              <li>Optional <b>glue</b> (off by default): two pieces that fit together, sharing an edge${relief ? ' with tops that meet' : ''}, are glued and move and turn as one. It judges only how the pieces fit, never the solution${relief ? '' : ', so in a flat puzzle wrong pairs can glue too'}. Double-click a piece to detach it. Its use is noted in the report.</li>
              ${relief ? '<li>Optional <b>wall match</b> (off by default): click a side wall to highlight walls of other pieces with the same heights at both ends. A tighter tolerance is a stronger hint. Nothing moves, and its use and tightest tolerance are noted in the report.</li>' : ''}
            </ul>
            <h3>Controls</h3>
            <ul class="keys">
              <li><b>Left-drag</b> a piece to move it; drag the ring of the selected piece to turn it.</li>
              <li><b>Arrows</b> nudge 1 mm (Shift: 0.1 mm). <b>Q / E</b> turn 1° (Shift: 0.1°).</li>
              <li><b>Tab</b> selects the next piece. Click the same spot again to reach a piece underneath.</li>
              <li>Camera as in PrusaSlicer: <b>left-drag</b> empty space to orbit, <b>right-</b> or <b>middle-drag</b> to pan, the <b>wheel</b> zooms.</li>
              <li>Views: <b>0</b> iso, <b>1</b> top, <b>3</b> front, <b>4</b> rear, <b>5</b> left, <b>6</b> right (side views at table level, to compare heights), <b>Z</b> zoom to fit. <b>S</b> turns sticky edges on or off, <b>G</b> glue.${relief ? ' <b>M</b> turns wall match on or off.' : ''}</li>
              <li><b>Ctrl+Z</b> undo, <b>Ctrl+Shift+Z</b> redo. Progress is saved in this browser.</li>
            </ul>
            <button data-ui="closeRules" type="button">Start</button>
          </div>
        </div>
      </div>`;
  }

  // ---- session -------------------------------------------------------------

  private initSession(params: URLSearchParams): void {
    const loaded = loadSession(this.puzzle, this.store);
    const seedParam = Number(params.get('seed'));
    const requested = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : null;
    if (loaded.status === 'incompatible') this.notify('Saved progress was for a different version of this puzzle and was discarded.');
    if (loaded.status === 'ok' && (requested == null || requested === loaded.session.seed)) {
      this.session = loaded.session;
    } else {
      const revealed = loaded.status === 'ok' && loaded.session.revealed;
      const seed = requested ?? this.puzzle.scramble.defaultSeed;
      this.session = newSession(this.puzzle, seed, scramble(this.puzzle, seed), revealed);
      if (loaded.status === 'ok') this.notify(`Started seed ${seed}; the previous attempt (seed ${loaded.session.seed}) was replaced.`);
    }
    this.ghost.visible = false;
    this.refreshGlue();
    this.afterPosesChanged();
    this.wasSolved = this.evaluation.solved;
    this.save();
  }

  private save(): void {
    saveSession(this.session, this.store);
    // Keep the address bar a stable link to this attempt.
    const url = new URL(window.location.href);
    if (url.searchParams.get('seed') !== String(this.session.seed)) {
      url.searchParams.set('seed', String(this.session.seed));
      history.replaceState(null, '', url);
    }
  }

  private start(seed: number): void {
    this.session = newSession(
      this.puzzle, seed, scramble(this.puzzle, seed), this.session.revealed, this.session.stickyEdges,
      this.session.wallMatch, this.session.wallMatchMm, this.session.glue,
    );
    this.clearWall();
    this.refreshGlue();
    this.select(null);
    this.afterPosesChanged();
    this.wasSolved = this.evaluation.solved;
    this.save();
    this.fitView();
  }

  private beginChange(): void {
    pushUndo(this.session);
  }

  private commit(): void {
    this.refreshGlue();
    this.afterPosesChanged();
    this.save();
  }

  // ---- glue ----------------------------------------------------------------

  private pairId([a, b]: Pair): string {
    return pairKey(this.puzzle.pieces[a].id, this.puzzle.pieces[b].id);
  }

  /**
   * Glue is recomputed from the committed poses: every pair that fits is glued, except pairs the
   * player detached, until they are moved apart. A glued group moves rigidly, so it stays glued.
   * While glue is off nothing is glued, and detached pairs are kept for when it is turned back on.
   */
  private refreshGlue(): void {
    const s = this.session;
    const fitting = s.glue ? fittingPairs(this.puzzle, s.poses) : [];
    if (s.glue) {
      const fitKeys = new Set(fitting.map((p) => this.pairId(p)));
      s.glueDetached = s.glueDetached.filter((k) => fitKeys.has(k));
    }
    const detached = new Set(s.glueDetached);
    const next = fitting.filter((p) => !detached.has(this.pairId(p)));
    recordGlue(s, next.map((p) => this.pairId(p)));
    this.glued = next;
    this.groupOf = groups(this.pieces.length, next);
    this.updateHighlights();
  }

  /** The piece and every piece glued to it. */
  private groupOfPiece(index: number): number[] {
    return this.session.glue ? members(this.groupOf, index) : [index];
  }

  private detach(index: number): void {
    this.session.glueDetached.push(...this.glued.filter(([a, b]) => a === index || b === index).map((p) => this.pairId(p)));
    this.refreshGlue();
    this.save();
    this.notify(`Piece ${this.puzzle.pieces[index].id} detached. Move it away before it can glue to those pieces again.`);
  }

  private setGlue(on: boolean): void {
    this.session.glue = on;
    this.refreshGlue();
    this.save();
    this.updateHud();
  }

  private afterPosesChanged(): void {
    this.session.poses.forEach((pose, i) => placeObject(this.pieces[i].group, pose));
    this.evaluation = evaluate(this.puzzle, this.session.poses);
    const e = this.evaluation;
    this.pieces.forEach((p, i) => p.mesh.material.color.setHex(e.overlapping[i] || e.crossingWall[i] ? this.colors.overlap : this.colors.piece));
    if (this.evaluation.solved && !this.wasSolved && !this.session.solvedAt) this.session.solvedAt = new Date().toISOString();
    this.wasSolved = this.evaluation.solved;
    this.updateHandle();
    this.updateHud();
    this.dirty = true;
  }

  // ---- selection and handle ------------------------------------------------

  private select(index: number | null): void {
    this.selected = index;
    this.updateHighlights();
    this.updateHandle();
  }

  /** Selection, glue and wall-match tints. These use the emissive channel, so overlap red still shows. */
  private updateHighlights(): void {
    const { selected, match, edge } = this.colors;
    const group = this.selected == null ? [] : this.groupOfPiece(this.selected);
    this.pieces.forEach((p, i) => {
      const isSelected = i === this.selected;
      const isGlued = !isSelected && group.includes(i);
      const isCandidate = this.wallCandidates.some((c) => c.piece === i);
      p.edges.material.color.setHex(isSelected || isGlued ? selected : isCandidate ? match : edge);
      p.mesh.material.emissive.setHex(isSelected || isGlued ? selected : isCandidate ? match : 0x000000);
      p.mesh.material.emissiveIntensity = isSelected ? 0.12 : isGlued ? 0.06 : isCandidate ? 0.35 : 0;
    });
    this.dirty = true;
  }

  // ---- wall match ----------------------------------------------------------

  private get wallMatchOn(): boolean {
    return this.puzzle.variant === 'relief' && this.session.wallMatch;
  }

  private removeWallOverlays(): void {
    for (const { parent, mesh } of this.wallOverlays) {
      parent.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.wallOverlays = [];
  }

  private addWallOverlay({ piece, wall }: WallRef, color: number): void {
    const parent = this.pieces[piece].group;
    const mesh = makeWallOverlay(this.puzzle.pieces[piece], wall, color);
    parent.add(mesh);
    this.wallOverlays.push({ parent, mesh });
  }

  /** Look up the active wall at the current tolerance and show the result. Each call is one recorded query. */
  private queryWall(): void {
    const active = this.activeWall;
    if (!active) return;
    this.wallCandidates = matchingWalls(this.puzzle, active.piece, active.wall, this.session.wallMatchMm);
    this.removeWallOverlays();
    this.addWallOverlay(active, this.colors.selected);
    this.wallCandidates.forEach((c) => this.addWallOverlay(c, this.colors.match));
    recordWallMatch(this.session);
    this.save();
    this.updateHighlights();
    this.updateHud();
  }

  private clearWall(): void {
    this.activeWall = null;
    this.wallCandidates = [];
    this.removeWallOverlays();
    this.updateHighlights();
    this.updateHud();
  }

  private toggleWall(ref: WallRef): void {
    const active = this.activeWall;
    if (active && active.piece === ref.piece && active.wall === ref.wall) {
      this.clearWall();
      return;
    }
    this.activeWall = { piece: ref.piece, wall: ref.wall };
    this.queryWall();
  }

  private setWallMatch(on: boolean): void {
    this.session.wallMatch = on;
    this.clearWall();
    this.save();
  }

  private setWallMatchTolerance(mm: number): void {
    this.session.wallMatchMm = mm;
    if (this.activeWall) this.queryWall();
    else {
      this.save();
      this.updateHud();
    }
  }

  private updateHandle(): void {
    const i = this.selected;
    this.handle.group.visible = i != null;
    if (i == null) return;
    const pose = this.session.poses[i];
    this.handle.setRadius(handleRadius(this.puzzle.pieces[i]));
    this.handle.group.position.set(pose.x, pose.y, this.pieces[i].height + 2);
    this.handle.group.rotation.set(0, 0, pose.theta);
  }

  // ---- input ---------------------------------------------------------------

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    // Capture phase: runs before OrbitControls' own listener, so a press on a piece can disable orbiting.
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    new ResizeObserver(() => this.resize()).observe(this.ui.stage);
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => {
      this.lastTick = performance.now();
      if (document.hidden) this.save();
    });

    const on = (name: string, fn: () => void) => this.ui[name].addEventListener('click', fn);
    on('undo', () => this.historyStep(undo));
    on('redo', () => this.historyStep(redo));
    on('restart', () => this.start(this.session.seed));
    on('newScramble', () => this.start(randomSeed()));
    on('fit', () => this.fitView());
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => this.setView(b.dataset.view as View)));
    on('reveal', () => this.toggleReveal());
    on('copyReport', () => this.copyReport());
    on('rulesButton', () => this.toggleRules(true));
    on('closeRules', () => this.toggleRules(false));
    const sticky = this.ui.sticky as HTMLInputElement;
    sticky.addEventListener('change', () => {
      this.setSticky(sticky.checked);
      sticky.blur(); // keep keyboard shortcuts working
    });
    const glue = this.ui.glue as HTMLInputElement;
    glue.addEventListener('change', () => {
      this.setGlue(glue.checked);
      glue.blur();
    });
    if (this.puzzle.variant === 'relief') {
      const wallMatch = this.ui.wallMatch as HTMLInputElement;
      wallMatch.addEventListener('change', () => {
        this.setWallMatch(wallMatch.checked);
        wallMatch.blur();
      });
      const slider = this.ui.wallMatchSlider as HTMLInputElement;
      slider.addEventListener('input', () => this.setWallMatchTolerance(WALL_MATCH_STOPS_MM[Number(slider.value)]));
      slider.addEventListener('change', () => slider.blur());
    }
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private pointOnPlane(e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.dot(plane.normal)) < MIN_DRAG_RAY_SLOPE) return null;
    return ray.intersectPlane(plane, new THREE.Vector3());
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.controls.enabled = true;
    this.emptyPress = null;
    this.wallPress = null;
    if (e.button !== 0) return;
    this.endBurst();
    this.raycaster.setFromCamera(this.ndc(e), this.camera);

    if (this.selected != null && this.handle.group.visible && this.raycaster.intersectObject(this.handle.hit).length) {
      const index = this.selected;
      const pose = this.session.poses[index];
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.handle.group.position.z);
      const p = this.pointOnPlane(e, plane);
      if (!p) return;
      this.controls.enabled = false;
      this.drag = {
        kind: 'rotate', index, group: this.groupOfPiece(index), poses0: this.session.poses.map((q) => ({ ...q })),
        plane, start: Math.atan2(p.y - pose.y, p.x - pose.x), changed: false,
      };
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    const hits = this.raycaster.intersectObjects(this.pieces.map((p) => p.mesh));
    const order: { index: number; point: THREE.Vector3; wall: number | null }[] = [];
    for (const h of hits) {
      const index = h.object.userData.index as number;
      if (!order.some((o) => o.index === index)) order.push({ index, point: h.point, wall: wallAtFace(this.puzzle.pieces[index], h.faceIndex!) });
    }
    if (!order.length) {
      // Empty space: OrbitControls orbits. A click without dragging deselects (on release).
      this.emptyPress = { x: e.clientX, y: e.clientY };
      this.lastClick = null;
      return;
    }
    this.controls.enabled = false;
    const last = this.lastClick;
    const now = performance.now();
    // A quick second press on a glued piece detaches it from its group.
    if (
      last && now - last.time < DOUBLE_CLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < CLICK_SLOP_PX &&
      order.some((o) => o.index === last.index) && this.groupOfPiece(last.index).length > 1
    ) {
      this.lastClick = null;
      this.detach(last.index);
      this.select(last.index);
      return;
    }
    // Clicking the same spot again reaches the next piece underneath.
    let choice = order[0];
    // Clicking the active wall again clears it, rather than reaching for a piece behind it.
    const onActiveWall = this.activeWall?.piece === order[0].index && this.activeWall.wall === order[0].wall;
    if (!onActiveWall && last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < CLICK_SLOP_PX) {
      const k = order.findIndex((o) => o.index === last.index);
      if (k >= 0) choice = order[(k + 1) % order.length];
    }
    this.select(choice.index);
    this.lastClick = { x: e.clientX, y: e.clientY, index: choice.index, time: now };
    // Recorded before the drag plane check: table-level views can't drag, but show walls best.
    if (this.wallMatchOn && choice.wall != null) this.wallPress = { x: e.clientX, y: e.clientY, piece: choice.index, wall: choice.wall };
    const pose = this.session.poses[choice.index];
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -choice.point.z);
    if (!this.pointOnPlane(e, plane)) return;
    this.drag = {
      kind: 'move', index: choice.index, group: this.groupOfPiece(choice.index), poses0: this.session.poses.map((q) => ({ ...q })),
      plane, offset: new THREE.Vector2(pose.x - choice.point.x, pose.y - choice.point.y), changed: false,
    };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) {
      this.updateCursor(e);
      return;
    }
    // A little jitter while clicking a wall must not move the piece.
    if (this.wallPress) {
      if (Math.hypot(e.clientX - this.wallPress.x, e.clientY - this.wallPress.y) < CLICK_SLOP_PX) return;
      this.wallPress = null;
    }
    const p = this.pointOnPlane(e, drag.plane);
    if (!p) return;
    if (!drag.changed) {
      this.beginChange();
      drag.changed = true;
      this.lastClick = null;
    }
    const start = drag.poses0[drag.index];
    if (drag.kind === 'move') {
      moveRigidly(this.session.poses, drag.poses0, drag.group, drag.index, p.x + drag.offset.x - start.x, p.y + drag.offset.y - start.y, 0);
    } else {
      // A group turns about the centre of the piece whose handle is dragged.
      moveRigidly(this.session.poses, drag.poses0, drag.group, drag.index, 0, 0, Math.atan2(p.y - start.y, p.x - start.x) - drag.start);
    }
    this.afterPosesChanged();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.controls.enabled = true;
    const press = this.emptyPress;
    this.emptyPress = null;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP_PX) {
      this.select(null);
      this.clearWall();
    }
    const wall = this.wallPress;
    this.wallPress = null;
    if (wall && e.type === 'pointerup' && Math.hypot(e.clientX - wall.x, e.clientY - wall.y) < CLICK_SLOP_PX) this.toggleWall(wall);
    if (!this.drag) return;
    if (this.drag.changed) {
      if (this.session.stickyEdges) this.applySticky(this.drag.index);
      this.commit();
    }
    this.drag = null;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
  };

  /**
   * Sticky edges: align a released piece with an edge it is already next to (part of the same undo
   * step). A glued group moves with it as one, and its own pieces are not edges to snap to.
   */
  private applySticky(index: number): void {
    const group = this.groupOfPiece(index);
    const poses = this.session.poses;
    const snapped = snapPose(this.puzzle, poses, index, snapTolerances(this.puzzle), new Set(group));
    const pose = poses[index];
    if (!snapped || (snapped.x === pose.x && snapped.y === pose.y && snapped.theta === pose.theta)) return;
    const before = poses.map((q) => ({ ...q }));
    moveRigidly(poses, before, group, index, snapped.x - pose.x, snapped.y - pose.y, snapped.theta - pose.theta);
    this.session.snaps++;
  }

  private setSticky(on: boolean): void {
    this.session.stickyEdges = on;
    this.save();
    this.updateHud();
  }

  private updateCursor(e: PointerEvent): void {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const overHandle = this.handle.group.visible && this.raycaster.intersectObject(this.handle.hit).length > 0;
    const overPiece = !overHandle && this.raycaster.intersectObjects(this.pieces.map((p) => p.mesh)).length > 0;
    this.renderer.domElement.style.cursor = overHandle ? 'alias' : overPiece ? 'grab' : 'default';
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === 'z') {
      e.preventDefault();
      this.historyStep(e.shiftKey ? redo : undo);
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.historyStep(redo);
      return;
    }
    if (mod || e.altKey) return;
    if (key === 'escape') {
      if (!this.ui.rules.hidden) this.toggleRules(false);
      else {
        this.select(null);
        this.clearWall();
      }
      return;
    }
    const view = VIEW_BUTTONS.find(([, , k]) => k === key);
    if (view) return this.setView(view[0]);
    if (key === 'z') return this.fitView();
    if (key === 's') return this.setSticky(!this.session.stickyEdges);
    if (key === 'g') return this.setGlue(!this.session.glue);
    if (key === 'm' && this.puzzle.variant === 'relief') return this.setWallMatch(!this.session.wallMatch);
    if (key === 'tab') {
      e.preventDefault();
      const n = this.pieces.length;
      this.select(this.selected == null ? (e.shiftKey ? n - 1 : 0) : (this.selected + (e.shiftKey ? n - 1 : 1)) % n);
      return;
    }
    if (this.selected == null) return;
    const step = e.shiftKey ? FINE_NUDGE_MM : NUDGE_MM;
    const turn = e.shiftKey ? FINE_TURN_RAD : TURN_RAD;
    const moves: Record<string, [number, number, number]> = {
      arrowleft: [-step, 0, 0], arrowright: [step, 0, 0], arrowup: [0, step, 0], arrowdown: [0, -step, 0],
      q: [0, 0, turn], e: [0, 0, -turn],
    };
    const move = moves[key];
    if (!move) return;
    e.preventDefault();
    // Consecutive key presses form one undo step.
    if (this.burstTimer === undefined) this.beginChange();
    else window.clearTimeout(this.burstTimer);
    this.burstTimer = window.setTimeout(() => this.endBurst(), 700);
    const before = this.session.poses.map((q) => ({ ...q }));
    moveRigidly(this.session.poses, before, this.groupOfPiece(this.selected), this.selected, move[0], move[1], move[2]);
    this.afterPosesChanged();
  };

  private endBurst(): void {
    if (this.burstTimer === undefined) return;
    window.clearTimeout(this.burstTimer);
    this.burstTimer = undefined;
    this.commit();
  }

  private historyStep(step: (s: Session) => boolean): void {
    this.endBurst();
    if (step(this.session)) this.commit();
  }

  // ---- camera --------------------------------------------------------------

  private sceneBounds(): { cx: number; cy: number; r: number } {
    const polys = [this.puzzle.geometry.target.vertices, ...this.puzzle.pieces.map((p, i) => transform(p.polygon, this.session.poses[i]))];
    const box = bounds(polys.flat());
    return { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, r: Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2 };
  }

  /** Frame the tray and all pieces from the given direction (polar from vertical, azimuth from the front). */
  private placeCamera(polar: number, azimuth: number): void {
    const { cx, cy, r } = this.sceneBounds();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = r / Math.sin(fov / 2) / Math.min(1, this.camera.aspect) * 0.8;
    const p = Math.max(polar, 1e-4);
    this.camera.position.set(cx + fit * Math.sin(p) * Math.sin(azimuth), cy - fit * Math.sin(p) * Math.cos(azimuth), fit * Math.cos(p));
    this.controls.target.set(cx, cy, 0);
    this.controls.update();
    this.dirty = true;
  }

  private setView(view: View): void {
    const [polar, azimuth] = VIEWS[view];
    this.placeCamera(THREE.MathUtils.degToRad(polar), THREE.MathUtils.degToRad(azimuth));
  }

  /** Zoom to fit, keeping the current viewing direction. */
  private fitView(): void {
    const d = this.camera.position.clone().sub(this.controls.target).normalize();
    this.placeCamera(Math.acos(THREE.MathUtils.clamp(d.z, -1, 1)), Math.atan2(d.x, -d.y));
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.ui.stage;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ---- HUD -----------------------------------------------------------------

  private updateHud(): void {
    const e = this.evaluation;
    const s = this.session;
    const red = e.overlapping.filter(Boolean).length;
    const walls = e.crossingWall.filter(Boolean).length;
    const plural = (k: number) => (k === 1 ? 'piece' : 'pieces');
    let status: string;
    let cls = '';
    if (e.solved) {
      const notes = [s.revealed && 'solution was shown', s.snaps && 'sticky edges', s.wallMatches && 'wall match', s.glues && 'glue'].filter(Boolean);
      status = `Solved in ${formatTime(s.elapsedMs)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      cls = 'solved';
    } else if (red || walls) {
      status = [red && `${red} ${plural(red)} overlapping`, walls && `${walls} ${plural(walls)} through the tray wall`].filter(Boolean).join(', ');
      cls = 'warn';
    } else if (e.checks.noOverlap && e.checks.inside && e.checks.area && !e.checks.roof) {
      status = 'The outlines fit, but the roof heights do not meet';
      cls = 'warn';
    } else {
      status = '';
    }
    this.ui.status.textContent = status;
    this.ui.status.className = `status ${cls}`;
    this.ui.status.hidden = !status;
    this.ui.seed.textContent = String(s.seed);
    this.ui.time.textContent = formatTime(s.elapsedMs);
    (this.ui.undo as HTMLButtonElement).disabled = !s.undo.length;
    (this.ui.redo as HTMLButtonElement).disabled = !s.redo.length;
    this.ui.reveal.textContent = this.ghost.visible ? 'Hide solution' : 'Show solution';
    (this.ui.sticky as HTMLInputElement).checked = s.stickyEdges;
    (this.ui.glue as HTMLInputElement).checked = s.glue;
    if (this.puzzle.variant === 'relief') this.updateWallMatchHud();
  }

  private updateWallMatchHud(): void {
    const s = this.session;
    (this.ui.wallMatch as HTMLInputElement).checked = s.wallMatch;
    this.ui.wallMatchControls.hidden = !s.wallMatch;
    (this.ui.wallMatchSlider as HTMLInputElement).value = String((WALL_MATCH_STOPS_MM as readonly number[]).indexOf(s.wallMatchMm));
    this.ui.wallMatchTol.textContent = `±${s.wallMatchMm} mm`;
    const pieces = new Set(this.wallCandidates.map((c) => c.piece)).size;
    this.ui.wallMatchResult.textContent = !this.activeWall
      ? 'Click a side wall of a piece.'
      : pieces === 0 ? 'No piece fits this wall.' : pieces === 1 ? '1 piece could fit this wall.' : `${pieces} pieces could fit this wall.`;
  }

  private toggleReveal(): void {
    this.ghost.visible = !this.ghost.visible;
    if (this.ghost.visible && !this.session.revealed) {
      this.session.revealed = true;
      this.save();
    }
    this.updateHud();
    this.dirty = true;
  }

  private toggleRules(show: boolean): void {
    this.ui.rules.hidden = !show;
    if (!show) storageFlag(RULES_SEEN_KEY, '1');
  }

  private notify(text: string): void {
    this.ui.notice.textContent = text;
    this.ui.notice.hidden = false;
    window.setTimeout(() => (this.ui.notice.hidden = true), 8000);
  }

  private async copyReport(): Promise<void> {
    const line = report(this.puzzle, this.session, this.evaluation.solved);
    try {
      await navigator.clipboard.writeText(line);
      this.notify(`Copied: ${line}`);
    } catch {
      this.notify(line);
    }
  }

  // ---- loop ----------------------------------------------------------------

  private frame = (now: number): void => {
    // Active timer: runs while the page is visible, after the first move, until solved.
    const delta = now - this.lastTick;
    this.lastTick = now;
    const started = this.session.undo.length > 0 || this.session.elapsedMs > 0;
    if (!document.hidden && started && !this.evaluation.solved && delta < 1000) {
      const before = Math.floor(this.session.elapsedMs / 1000);
      this.session.elapsedMs += delta;
      const after = Math.floor(this.session.elapsedMs / 1000);
      if (after !== before) {
        this.ui.time.textContent = formatTime(this.session.elapsedMs);
        if (after % 10 === 0) this.save();
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.frame);
  };

  /** Console hook for testing and research: `tpl.evaluate()`, `tpl.setPoses(...)`. */
  private debugApi() {
    return {
      puzzle: this.puzzle,
      getPoses: (): Pose[] => this.session.poses.map((p) => ({ ...p })),
      setPoses: (poses: Pose[]) => {
        this.beginChange();
        this.session.poses = poses.map((p) => ({ ...p }));
        this.commit();
      },
      evaluate: () => this.evaluation,
      session: () => this.session,
      wallMatch: () => ({ active: this.activeWall, candidates: this.wallCandidates }),
      glue: () => this.glued.map((p) => this.pairId(p)),
    };
  }
}
