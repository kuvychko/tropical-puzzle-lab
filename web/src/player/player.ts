// Puzzle player: scene, interaction, history, persistence and HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { evaluate, type Evaluation } from '../geometry/evaluate';
import { bounds, transform } from '../geometry/polygon';
import { randomSeed, scramble } from '../geometry/scramble';
import { snapPose } from '../geometry/snap';
import {
  browserStore, formatTime, loadSession, newSession, pushUndo, redo, report, saveSession, type Session, undo,
} from '../sessions/session';
import { showDifficulty } from '../difficulty/rating';
import type { Pose, Puzzle } from '../types';
import { handleRadius, makeGhost, makePiece, makeRotateHandle, makeTray, palette, placeObject, type PieceObject } from './meshes';

const NUDGE_MM = 1;
const FINE_NUDGE_MM = 0.1;
const TURN_RAD = Math.PI / 180;
const FINE_TURN_RAD = Math.PI / 1800;
const RULES_SEEN_KEY = 'tpl:rules-seen';

// Camera presets as [polar from vertical, azimuth from the front], degrees. Keys follow PrusaSlicer
// (2, the bottom view, is omitted: the camera stays above the table).
const VIEWS = { iso: [45, -30], top: [0, 0], front: [80, 0], rear: [80, 180], left: [80, -90], right: [80, 90] } as const;
type View = keyof typeof VIEWS;
const VIEW_BUTTONS: [View, string, string][] = [
  ['iso', 'Iso', '0'], ['top', 'Top', '1'], ['front', 'Front', '3'], ['rear', 'Rear', '4'], ['left', 'Left', '5'], ['right', 'Right', '6'],
];

type Drag =
  | { kind: 'move'; index: number; plane: THREE.Plane; offset: THREE.Vector2; changed: boolean }
  | { kind: 'rotate'; index: number; plane: THREE.Plane; start: number; theta0: number; changed: boolean };

export async function startPlayer(root: HTMLElement, puzzleId: string, params: URLSearchParams): Promise<void> {
  root.innerHTML = `<p class="loading">Loading ${escapeHtml(puzzleId)}…</p>`;
  const response = await fetch(`${import.meta.env.BASE_URL}puzzles/${encodeURIComponent(puzzleId)}/puzzle.json`);
  if (!response.ok) {
    root.innerHTML = `<div class="error"><p>Puzzle “${escapeHtml(puzzleId)}” was not found.</p><a href="${import.meta.env.BASE_URL}">Back to the gallery</a></div>`;
    return;
  }
  const puzzle: Puzzle = await response.json();
  new Player(root, puzzle, params);
  void showDifficulty(root, root.querySelector<HTMLElement>('[data-ui="difficulty"]')!, puzzle.id);
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
  private lastClick: { x: number; y: number; index: number } | null = null;
  private emptyPress: { x: number; y: number } | null = null;
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
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
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
          <span class="badge">${relief ? 'relief' : 'flat tiling'}</span>
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
              <li>Pieces may pass through each other while you work. Overlapping pieces turn red.</li>
              <li>Any assembly that fills the tray within tolerance counts, not only the reference one.</li>
              <li>Optional <b>sticky edges</b> (off by default): a released piece aligns flush with a tray wall or piece edge it is already next to. It never pulls pieces toward the solution, and its use is noted in the report.</li>
            </ul>
            <h3>Controls</h3>
            <ul class="keys">
              <li><b>Left-drag</b> a piece to move it; drag the ring of the selected piece to turn it.</li>
              <li><b>Arrows</b> nudge 1 mm (Shift: 0.1 mm). <b>Q / E</b> turn 1° (Shift: 0.1°).</li>
              <li><b>Tab</b> selects the next piece. Click the same spot again to reach a piece underneath.</li>
              <li>Camera as in PrusaSlicer: <b>left-drag</b> empty space to orbit, <b>right-</b> or <b>middle-drag</b> to pan, the <b>wheel</b> zooms.</li>
              <li>Views: <b>0</b> iso, <b>1</b> top, <b>3</b> front, <b>4</b> rear, <b>5</b> left, <b>6</b> right, <b>Z</b> zoom to fit. <b>S</b> turns sticky edges on or off.</li>
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
    this.session = newSession(this.puzzle, seed, scramble(this.puzzle, seed), this.session.revealed, this.session.stickyEdges);
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
    this.afterPosesChanged();
    this.save();
  }

  private afterPosesChanged(): void {
    this.session.poses.forEach((pose, i) => placeObject(this.pieces[i].group, pose));
    this.evaluation = evaluate(this.puzzle, this.session.poses);
    this.pieces.forEach((p, i) => p.mesh.material.color.setHex(this.evaluation.overlapping[i] ? this.colors.overlap : this.colors.piece));
    if (this.evaluation.solved && !this.wasSolved && !this.session.solvedAt) this.session.solvedAt = new Date().toISOString();
    this.wasSolved = this.evaluation.solved;
    this.updateHandle();
    this.updateHud();
    this.dirty = true;
  }

  // ---- selection and handle ------------------------------------------------

  private select(index: number | null): void {
    this.selected = index;
    this.pieces.forEach((p, i) => {
      p.edges.material.color.setHex(i === index ? this.colors.selected : this.colors.edge);
      p.mesh.material.emissive.setHex(i === index ? this.colors.selected : 0x000000);
      p.mesh.material.emissiveIntensity = i === index ? 0.12 : 0;
    });
    this.updateHandle();
    this.dirty = true;
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
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private pointOnPlane(e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.controls.enabled = true;
    this.emptyPress = null;
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
      this.drag = { kind: 'rotate', index, plane, start: Math.atan2(p.y - pose.y, p.x - pose.x), theta0: pose.theta, changed: false };
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    const hits = this.raycaster.intersectObjects(this.pieces.map((p) => p.mesh));
    const order: { index: number; point: THREE.Vector3 }[] = [];
    for (const h of hits) {
      const index = h.object.userData.index as number;
      if (!order.some((o) => o.index === index)) order.push({ index, point: h.point });
    }
    if (!order.length) {
      // Empty space: OrbitControls orbits. A click without dragging deselects (on release).
      this.emptyPress = { x: e.clientX, y: e.clientY };
      this.lastClick = null;
      return;
    }
    this.controls.enabled = false;
    // Clicking the same spot again reaches the next piece underneath.
    let choice = order[0];
    const last = this.lastClick;
    if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 4) {
      const k = order.findIndex((o) => o.index === last.index);
      if (k >= 0) choice = order[(k + 1) % order.length];
    }
    this.select(choice.index);
    this.lastClick = { x: e.clientX, y: e.clientY, index: choice.index };
    const pose = this.session.poses[choice.index];
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -choice.point.z);
    this.drag = { kind: 'move', index: choice.index, plane, offset: new THREE.Vector2(pose.x - choice.point.x, pose.y - choice.point.y), changed: false };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) {
      this.updateCursor(e);
      return;
    }
    const p = this.pointOnPlane(e, drag.plane);
    if (!p) return;
    if (!drag.changed) {
      this.beginChange();
      drag.changed = true;
      this.lastClick = null;
    }
    const pose = this.session.poses[drag.index];
    if (drag.kind === 'move') {
      pose.x = p.x + drag.offset.x;
      pose.y = p.y + drag.offset.y;
    } else {
      pose.theta = drag.theta0 + Math.atan2(p.y - pose.y, p.x - pose.x) - drag.start;
    }
    this.afterPosesChanged();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.controls.enabled = true;
    const press = this.emptyPress;
    this.emptyPress = null;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) this.select(null);
    if (!this.drag) return;
    if (this.drag.changed) {
      if (this.session.stickyEdges) this.applySticky(this.drag.index);
      this.commit();
    }
    this.drag = null;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
  };

  /** Sticky edges: align a released piece with an edge it is already next to (part of the same undo step). */
  private applySticky(index: number): void {
    const snapped = snapPose(this.puzzle, this.session.poses, index);
    const pose = this.session.poses[index];
    if (!snapped || (snapped.x === pose.x && snapped.y === pose.y && snapped.theta === pose.theta)) return;
    this.session.poses[index] = snapped;
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
      else this.select(null);
      return;
    }
    const view = VIEW_BUTTONS.find(([, , k]) => k === key);
    if (view) return this.setView(view[0]);
    if (key === 'z') return this.fitView();
    if (key === 's') return this.setSticky(!this.session.stickyEdges);
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
    const pose = this.session.poses[this.selected];
    pose.x += move[0];
    pose.y += move[1];
    pose.theta += move[2];
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
    let status: string;
    let cls = '';
    if (e.solved) {
      const notes = [s.revealed && 'solution was shown', s.snaps && 'sticky edges'].filter(Boolean);
      status = `Solved in ${formatTime(s.elapsedMs)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      cls = 'solved';
    } else if (red) {
      status = `${red} pieces overlapping`;
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
    };
  }
}
