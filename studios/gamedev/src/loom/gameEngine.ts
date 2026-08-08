import { parse } from "./parser";
import { Interpreter, World } from "./interpreter";

export interface Camera2D {
  x: number;
  y: number;
  zoom: number;
  followTarget: string | null;
}

export interface TileMapData {
  cols: number;
  rows: number;
  tileSize: number;
  grid: number[][]; // 0 = Empty, 1 = Solid Grass, 2 = Dirt, 3 = Spike, 4 = Coin, 5 = Door, 6 = Brick
}

// Default horizontal camera anchor when a world auto-follows an entity but doesn't
// declare its own `Game.cameraFocusX` -- 0.5 would center the target on screen, but
// a scrolling level is more playable when the followed entity sits left-of-center,
// leaving more of the world ahead (in the direction of travel) visible.
const DEFAULT_CAMERA_FOCUS_X = 0.35;

export const TILE_TYPES = [
  { id: 0, name: "Empty", color: "#020617" },
  { id: 1, name: "Grass Solid", color: "#10B981" },
  { id: 2, name: "Dirt Block", color: "#78350F" },
  { id: 3, name: "Spike Hazard", color: "#EF4444" },
  { id: 4, name: "Gold Coin", color: "#FACC15" },
  { id: 5, name: "Door", color: "#8B5CF6" },
  { id: 6, name: "Brick Block", color: "#64748B" },
];

export class LoomGameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  public interpreter: Interpreter;
  public activeWorld: World | null = null;

  public isRunning = false;
  public frameId: number | null = null;
  public timeScale = 1;
  public debugMode = true;

  public worldWidth = 800;
  public worldHeight = 600;
  public isBlankCanvas = false;

  public camera: Camera2D = { x: 0, y: 0, zoom: 1, followTarget: null };

  // Loaded on demand and cached by src (data URL or plain URL). Used for both the
  // world background (Game.fields.background) and per-entity sprites (fields.sprite).
  private imageCache = new Map<string, HTMLImageElement>();
  private failedImages = new Set<string>();

  public tileMap: TileMapData = {
    cols: 25,
    rows: 15,
    tileSize: 32,
    grid: Array(15).fill(0).map(() => Array(25).fill(0)),
  };

  public particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
  }[] = [];

  public keysDown: Record<string, boolean> = {};
  public mouse = { x: 0, y: 0, clicked: false };
  public selectedEntityName: string | null = "Player";

  public onLog?: (msg: string) => void;
  public onStateUpdate?: () => void;

  // The engine has no built-in knowledge of any specific game/preset content --
  // that's an application-level concern. `defaultSource` is just what's loaded
  // immediately at construction (and re-loaded if `activeWorld` is ever cleared)
  // so there's always something to render before a caller explicitly loads real
  // content. Standalone exported games pass their own project source here.
  private defaultSource: string;

  constructor(defaultSource: string = "world Empty {}\n") {
    this.interpreter = new Interpreter();
    this.defaultSource = defaultSource;

    // Pre-spawn default Player entity immediately on engine creation
    this.loadSource(this.defaultSource, undefined, false);
    this.ensurePlayerEntity();
    this.selectedEntityName = "Player";

    window.addEventListener("keydown", (e) => {
      // Ignore text input fields
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      this.keysDown[e.code] = true;
      this.keysDown[e.key] = true;
      this.keysDown[e.key.toLowerCase()] = true;
      this.keysDown[e.key.toUpperCase()] = true;

      // Prevent scrolling page when using Arrow keys or Space during gameplay
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code) &&
        (e.target === document.body || (e.target as HTMLElement).tagName === "CANVAS")
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      this.keysDown[e.code] = false;
      this.keysDown[e.key] = false;
      this.keysDown[e.key.toLowerCase()] = false;
      this.keysDown[e.key.toUpperCase()] = false;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const centerX = (this.canvas.width / this.camera.zoom - this.worldWidth) / 2;
      const centerY = (this.canvas.height / this.camera.zoom - this.worldHeight) / 2;

      this.mouse.x = (e.clientX - rect.left) / this.camera.zoom + this.camera.x - centerX;
      this.mouse.y = (e.clientY - rect.top) / this.camera.zoom + this.camera.y - centerY;
    });

    window.addEventListener("mousedown", () => {
      this.mouse.clicked = true;
    });

    window.addEventListener("mouseup", () => {
      this.mouse.clicked = false;
    });
  }

  public loadSource(loomCode: string, worldName?: string, isBlankCanvas = false) {
    this.isBlankCanvas = isBlankCanvas;
    try {
      const ast = parse(loomCode);
      this.interpreter = new Interpreter({
        log: (msg) => {
          if (this.onLog) this.onLog(msg);
        },
      });
      this.interpreter.run(ast);

      const wName = worldName || ast.worlds[0]?.name;
      this.activeWorld = this.interpreter.worlds.get(wName) || null;

      if (this.activeWorld) {
        this.ensureInputEntity();
        if (!this.isBlankCanvas && !this.activeWorld.entities.has("Player")) {
          this.ensurePlayerEntity();
        }
        // Default the camera to follow Player, but only for a world/level bigger
        // than one standard screen (800x600) -- e.g. a side-scrolling platformer
        // level. A single-screen arena (Neon Vault Rush, etc.) keeps a static
        // camera so the whole arena stays visible at once, exactly as before; a
        // bigger world would otherwise leave most of it permanently off-screen
        // with no way to reach it, since Player is now the only entity clamped to
        // world bounds. This is only a fallback seed, re-applied on every fresh
        // load: an explicit `Game.cameraFollow` field (script-authored, or set via
        // the Inspector/Hierarchy camera toggle) always takes precedence -- see
        // getCameraFollowTarget().
        const needsScrolling = this.worldWidth > 800 || this.worldHeight > 600;
        this.camera.followTarget =
          !this.isBlankCanvas && needsScrolling && this.activeWorld.entities.has("Player")
            ? "Player"
            : null;
      }

      if (this.onStateUpdate) this.onStateUpdate();
      return true;
    } catch (err: any) {
      if (this.onLog) this.onLog(`[Compilation Error] ${err.message}`);
      return false;
    }
  }

  // The live camera-follow target: an explicit `Game.cameraFollow` field (a string
  // entity name, settable from Loom script or the Inspector's generic field editor)
  // always wins when present -- including an empty string, which is how a script
  // explicitly says "no auto-follow". Falls back to the heuristic seeded once at
  // load time (see loadSource) when the world/preset declares no Game entity, or
  // its Game entity doesn't mention cameraFollow at all.
  public getCameraFollowTarget(): string | null {
    const gameEnt = this.activeWorld?.entities.get("Game");
    if (gameEnt && typeof gameEnt.fields.cameraFollow === "string") {
      return gameEnt.fields.cameraFollow || null;
    }
    return this.camera.followTarget;
  }

  // Where on screen (0 = left edge, 0.5 = center, 1 = right edge) the followed
  // entity is anchored horizontally. Same override pattern as cameraFollow above.
  public getCameraFocusX(): number {
    const gameEnt = this.activeWorld?.entities.get("Game");
    if (gameEnt && typeof gameEnt.fields.cameraFocusX === "number") {
      return Math.max(0, Math.min(1, gameEnt.fields.cameraFocusX));
    }
    return DEFAULT_CAMERA_FOCUS_X;
  }

  public ensureInputEntity() {
    if (!this.activeWorld) return;
    if (!this.activeWorld.entities.has("Input")) {
      this.activeWorld.entities.set("Input", {
        name: "Input",
        fields: {
          keyLeft: false,
          keyRight: false,
          keyUp: false,
          keyDown: false,
          keySpace: false,
          keyAction: false,
          left: false,
          right: false,
          up: false,
          down: false,
          space: false,
          action: false,
          keyW: false,
          keyA: false,
          keyS: false,
          keyD: false,
          w: false,
          a: false,
          s: false,
          d: false,
          W: false,
          A: false,
          S: false,
          D: false,
          mouseX: 0,
          mouseY: 0,
          mouseClicked: false,
        },
        isAgent: false,
        isPersistent: false,
        capabilities: [],
      });
    }
  }

  public ensurePlayerEntity() {
    if (!this.activeWorld || this.isBlankCanvas) return;
    if (!this.activeWorld.entities.has("Player")) {
      this.activeWorld.entities.set("Player", {
        name: "Player",
        fields: {
          x: 380,
          y: 280,
          width: 36,
          height: 36,
          color: "#00F2FE",
          vx: 0,
          vy: 0,
          hp: 100,
        },
        isAgent: false,
        isPersistent: false,
        capabilities: [],
      });
    }
  }

  public syncInputsToLoom() {
    if (!this.activeWorld) return;
    let inputEnt = this.activeWorld.entities.get("Input");
    if (!inputEnt) {
      this.ensureInputEntity();
      inputEnt = this.activeWorld.entities.get("Input");
    }
    if (!inputEnt) return;

    const isUp = !!(
      this.keysDown["ArrowUp"] ||
      this.keysDown["KeyW"] ||
      this.keysDown["w"] ||
      this.keysDown["W"]
    );
    const isDown = !!(
      this.keysDown["ArrowDown"] ||
      this.keysDown["KeyS"] ||
      this.keysDown["s"] ||
      this.keysDown["S"]
    );
    const isLeft = !!(
      this.keysDown["ArrowLeft"] ||
      this.keysDown["KeyA"] ||
      this.keysDown["a"] ||
      this.keysDown["A"]
    );
    const isRight = !!(
      this.keysDown["ArrowRight"] ||
      this.keysDown["KeyD"] ||
      this.keysDown["d"] ||
      this.keysDown["D"]
    );
    const isSpace = !!(
      this.keysDown["Space"] ||
      this.keysDown[" "] ||
      this.keysDown["z"] ||
      this.keysDown["Z"] ||
      this.keysDown["KeyZ"]
    );
    const isAction = !!(
      this.keysDown["x"] ||
      this.keysDown["X"] ||
      this.keysDown["KeyX"] ||
      this.keysDown["e"] ||
      this.keysDown["E"] ||
      this.keysDown["KeyE"] ||
      this.keysDown["f"] ||
      this.keysDown["F"] ||
      this.keysDown["KeyF"]
    );

    inputEnt.fields.keyLeft = isLeft;
    inputEnt.fields.keyRight = isRight;
    inputEnt.fields.keyUp = isUp;
    inputEnt.fields.keyDown = isDown;
    inputEnt.fields.keySpace = isSpace;
    inputEnt.fields.keyAction = isAction;

    inputEnt.fields.left = isLeft;
    inputEnt.fields.right = isRight;
    inputEnt.fields.up = isUp;
    inputEnt.fields.down = isDown;
    inputEnt.fields.space = isSpace;
    inputEnt.fields.action = isAction;

    inputEnt.fields.keyW = isUp;
    inputEnt.fields.keyA = isLeft;
    inputEnt.fields.keyS = isDown;
    inputEnt.fields.keyD = isRight;

    inputEnt.fields.w = isUp;
    inputEnt.fields.a = isLeft;
    inputEnt.fields.s = isDown;
    inputEnt.fields.d = isRight;

    inputEnt.fields.W = isUp;
    inputEnt.fields.A = isLeft;
    inputEnt.fields.S = isDown;
    inputEnt.fields.D = isRight;

    inputEnt.fields.mouseX = Math.round(this.mouse.x);
    inputEnt.fields.mouseY = Math.round(this.mouse.y);
    inputEnt.fields.mouseClicked = this.mouse.clicked;

    // Direct Movement for Player when arrow/WASD keys are held. This only ever SETS
    // velocity on an axis actively being pressed -- it never forces it back to 0 when
    // idle. Presets that want "stop on key release" already express that explicitly
    // via their own `when not(...) { Player.vx = 0 }` Loom rules. Forcing it here
    // unconditionally would fight any gravity-driven vy (wiping it every single frame
    // before it can accumulate across frames) for a preset that governs vertical
    // motion via gravity + impulses instead of direct arrow-key velocity -- e.g. a
    // flappy-bird-style flyer, or even the Platformer preset's own jump arc.
    const player = this.activeWorld.entities.get("Player");
    if (player && typeof player.fields.x === "number") {
      const speed = 220;
      if (isRight) player.fields.vx = speed;
      else if (isLeft) player.fields.vx = -speed;

      if (isDown) player.fields.vy = speed;
      else if (isUp) player.fields.vy = -speed;
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!this.isRunning) return;
      const dt = Math.min((time - lastTime) / 1000, 0.1) * this.timeScale;
      lastTime = time;

      this.update(dt);
      this.render();

      this.frameId = requestAnimationFrame(loop);
    };

    this.frameId = requestAnimationFrame(loop);
  }

  public pause() {
    this.isRunning = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  public step(dtMs = 16) {
    const wasRunning = this.isRunning;
    this.isRunning = true;
    this.update(dtMs / 1000);
    this.render();
    this.isRunning = wasRunning;
  }

  public update(dt: number) {
    if (!this.activeWorld) return;
    if (!this.isRunning) return;

    // 1. Sync controls to Loom Input entity & update Player velocity
    this.syncInputsToLoom();

    // 2. Re-evaluate Loom reactive rules (when / intent conditions)
    this.interpreter.settle(this.activeWorld);

    // 3. Advance Loom logical clock
    const dtMs = dt * 1000;
    this.interpreter.advanceTime(this.activeWorld, dtMs);

    // 4. Physics & Collisions
    this.updatePhysics(dt);

    // 5. Particles
    this.updateParticles(dt);

    // 6. Camera follow
    const followName = this.getCameraFollowTarget();
    if (followName && this.activeWorld.entities.has(followName)) {
      const targetEnt = this.activeWorld.entities.get(followName)!;
      const zoom = this.camera.zoom || 1;
      // canvas.width is the actual viewport size the target gets anchored within;
      // worldWidth is only needed to cancel out render()'s own centering offset
      // (see getCameraFocusX doc) so this reduces to the plain center-follow
      // formula when focusX is 0.5.
      const canvasW = this.canvas ? this.canvas.width : this.worldWidth;
      const focusX = this.getCameraFocusX();
      const tx =
        (targetEnt.fields.x || 0) - this.worldWidth / 2 + (canvasW / zoom) * (0.5 - focusX);
      const ty = (targetEnt.fields.y || 0) - this.worldHeight / 2;
      this.camera.x += (tx - this.camera.x) * 0.1;
      this.camera.y += (ty - this.camera.y) * 0.1;
    }

    // 7. Notify UI of state update & new logged occurrences
    if (this.onStateUpdate) this.onStateUpdate();
  }

  public updatePhysics(dt: number) {
    if (!this.activeWorld) return;

    const entities = Array.from(this.activeWorld.entities.values());

    for (const ent of entities) {
      if (ent.name === "Input" || ent.name === "Game") continue;
      const f = ent.fields;

      // Apply Gravity if set
      if (typeof f.gravity === "number") {
        f.vy = (f.vy || 0) + f.gravity * dt;
      }

      // Apply Velocity
      if (typeof f.vx === "number") f.x = (f.x || 0) + f.vx * dt;
      if (typeof f.vy === "number") f.y = (f.y || 0) + f.vy * dt;

      // Clamp Entity inside Canvas World Boundaries (0..800, 0..600) -- Player only.
      // Applying this to every entity indiscriminately makes it impossible for any
      // entity to exist off-screen, which breaks any preset built around scrolling
      // obstacles that are SUPPOSED to spend most of their life off the visible
      // playfield (e.g. Flappy-Bird-style pipes entering from the right and exiting
      // off the left). A preset that wants some other entity bounded uses its own
      // `when`/`intent` rule for that, same as Neon Vault Rush's sentinels already do.
      if (ent.name === "Player") {
        const w = f.width || 32;
        const h = f.height || 32;

        if (typeof f.x === "number") {
          if (f.x < 0) {
            f.x = 0;
            if (f.vx < 0) f.vx = 0;
          }
          if (f.x > this.worldWidth - w) {
            f.x = this.worldWidth - w;
            if (f.vx > 0) f.vx = 0;
          }
        }

        if (typeof f.y === "number") {
          if (f.y < 0) {
            f.y = 0;
            if (f.vy < 0) f.vy = 0;
          }
          if (f.y > this.worldHeight - h) {
            f.y = this.worldHeight - h;
            if (f.vy > 0) f.vy = 0;
          }
        }
      }

      // TileMap Solid Collisions
      this.checkTileMapCollisions(ent);
    }

    // Entity vs Entity Proximity & Collisions
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        if (a.name === "Input" || b.name === "Input" || a.name === "Game" || b.name === "Game") continue;

        const dist = Math.hypot(
          (a.fields.x || 0) - (b.fields.x || 0),
          (a.fields.y || 0) - (b.fields.y || 0)
        );

        // Define 'near' condition (< 100px)
        const nearKey = `_near_${a.name}_${b.name}`;
        (this.activeWorld as any)[nearKey] = dist < 100;

        // Check AABB collision
        const aw = a.fields.width || 32;
        const ah = a.fields.height || 32;
        const bw = b.fields.width || 32;
        const bh = b.fields.height || 32;

        const isColliding =
          (a.fields.x || 0) < (b.fields.x || 0) + bw &&
          (a.fields.x || 0) + aw > (b.fields.x || 0) &&
          (a.fields.y || 0) < (b.fields.y || 0) + bh &&
          (a.fields.y || 0) + ah > (b.fields.y || 0);

        if (isColliding) {
          this.activeWorld.logOccurrence("collision", { a: a.name, b: b.name });
          this.spawnParticle((a.fields.x || 0) + aw / 2, (a.fields.y || 0) + ah / 2, "#FACC15");
        }
      }
    }
  }

  private checkTileMapCollisions(ent: any) {
    const f = ent.fields;
    if (typeof f.x !== "number" || typeof f.y !== "number") return;

    const w = f.width || 32;
    const h = f.height || 32;
    const ts = this.tileMap.tileSize;

    f.isGrounded = false;

    // Check ground tiles directly beneath entity
    const bottomTileY = Math.floor((f.y + h + 1) / ts);
    const leftTileX = Math.floor(f.x / ts);
    const rightTileX = Math.floor((f.x + w - 1) / ts);

    for (let tx = leftTileX; tx <= rightTileX; tx++) {
      if (
        bottomTileY >= 0 &&
        bottomTileY < this.tileMap.rows &&
        tx >= 0 &&
        tx < this.tileMap.cols
      ) {
        const tileType = this.tileMap.grid[bottomTileY][tx];
        // Solid tiles: 1 (Grass), 2 (Dirt), 6 (Brick)
        if ([1, 2, 6].includes(tileType)) {
          if (f.vy > 0) {
            f.y = bottomTileY * ts - h;
            f.vy = 0;
            f.isGrounded = true;
          }
        } else if (tileType === 3) {
          // Spike Hazard
          f.hp = (f.hp || 100) - 10;
          this.spawnParticle(f.x + w / 2, f.y + h / 2, "#EF4444");
        } else if (tileType === 4) {
          // Coin Pickup
          this.tileMap.grid[bottomTileY][tx] = 0; // Collect
          f.score = (f.score || 0) + 10;
          this.spawnParticle(tx * ts + ts / 2, bottomTileY * ts + ts / 2, "#FACC15");
        }
      }
    }
  }

  public spawnParticle(x: number, y: number, color = "#00F2FE", count = 6) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        life: 1,
        maxLife: Math.random() * 0.4 + 0.2,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  public render() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const canvas = this.canvas;

    if (!this.activeWorld) {
      this.loadSource(this.defaultSource, undefined, false);
    }
    if (this.activeWorld && !this.isBlankCanvas && !this.activeWorld.entities.has("Player")) {
      this.ensurePlayerEntity();
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark grid background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate Centering offset to position world in the center of the viewport
    const zoom = Math.max(0.1, this.camera.zoom || 1);
    const centerX = (canvas.width / zoom - this.worldWidth) / 2;
    const centerY = (canvas.height / zoom - this.worldHeight) / 2;

    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.x + centerX, -this.camera.y + centerY);

    // Fill Game World Canvas Area -- a "Game" entity's `background` field (an image
    // URL or data URL) is drawn stretched to fill the world if present and loaded;
    // otherwise falls back to the flat color, exactly as before.
    const gameEnt = this.activeWorld?.entities.get("Game");
    const bgSrc = gameEnt && typeof gameEnt.fields.background === "string" ? gameEnt.fields.background : null;
    const bgImg = bgSrc ? this.getImage(bgSrc) : null;

    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, this.worldWidth, this.worldHeight);
    } else {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

      // Subtle World Grid Lines -- only over the flat background; a custom
      // background image already gives visual structure of its own.
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x <= this.worldWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.worldHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= this.worldHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.worldWidth, y);
        ctx.stroke();
      }
    }

    // Draw World Boundary Border Frame (0,0 to worldWidth,worldHeight)
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    // Render TileMap
    this.renderTileMap(ctx);

    // Render Loom Entities & Agents ("Input" and "Game" are reserved meta-state
    // entities -- like Input, Game never has x/y and is never a visual game object)
    if (this.activeWorld) {
      for (const ent of this.activeWorld.entities.values()) {
        if (ent.name === "Input" || ent.name === "Game") continue;
        this.renderEntity(ctx, ent);
      }
    }

    // Render Particle Effects
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // HUD is drawn in screen space (after restore), unaffected by camera pan/zoom
    this.renderHUD(ctx, canvas);
  }

  // Reads well-known field names off the "Player" and "Game" entities (if present) and
  // renders a HUD overlay for them. Loom scripts don't need to do anything special to get
  // a HUD -- any preset whose Player has score/lives/hp/combo fields gets one for free.
  private renderHUD(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (!this.activeWorld) return;
    const player = this.activeWorld.entities.get("Player");
    const game = this.activeWorld.entities.get("Game");
    if (!player && !game) return;

    ctx.save();
    ctx.textBaseline = "top";
    const pad = 14;
    // The Player HUD sits below the floating Select/Hand Pan/Inspect toolbar
    // (Viewport2D.tsx renders it top-left, ~48px tall starting at 12px), so it
    // starts lower than the Game HUD (which has that top-right corner to itself).
    const playerHudTop = 64;

    if (player) {
      const f = player.fields;
      const rows: ((ty: number) => void)[] = [];

      if (typeof f.score === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "SCORE", pad + 12, ty);
          this.hudValue(ctx, String(Math.floor(f.score)), pad + 78, ty, "#38BDF8");
        });
      }
      if (typeof f.best === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "BEST", pad + 12, ty);
          this.hudValue(ctx, String(Math.floor(f.best)), pad + 78, ty, "#FACC15");
        });
      }
      if (typeof f.lives === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "LIVES", pad + 12, ty);
          const lives = Math.max(0, Math.floor(f.lives));
          for (let i = 0; i < lives; i++) {
            ctx.fillStyle = "#F87171";
            ctx.beginPath();
            ctx.arc(pad + 82 + i * 15, ty + 6, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
      if (typeof f.hp === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "HP", pad + 12, ty);
          const barX = pad + 78;
          const barW = 88;
          const barH = 9;
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(barX, ty + 1, barW, barH);
          const pct = Math.max(0, Math.min(1, f.hp / 100));
          ctx.fillStyle = pct > 0.5 ? "#10B981" : pct > 0.25 ? "#F59E0B" : "#EF4444";
          ctx.fillRect(barX, ty + 1, barW * pct, barH);
          ctx.strokeStyle = "#334155";
          ctx.strokeRect(barX, ty + 1, barW, barH);
        });
      }
      if (typeof f.combo === "number" && f.combo > 1) {
        rows.push((ty) => {
          const pulse = 0.85 + Math.sin(performance.now() / 120) * 0.15;
          ctx.fillStyle = "#FACC15";
          ctx.font = `bold ${Math.round(13 * pulse)}px monospace`;
          ctx.fillText(`x${Math.floor(f.combo)} COMBO!`, pad + 12, ty);
          ctx.font = "bold 11px monospace";
        });
      }

      if (rows.length > 0) {
        const rowH = 26;
        const boxW = 190;
        const boxH = 10 + rows.length * rowH;
        ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pad, playerHudTop, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();

        let ty = playerHudTop + 10;
        for (const row of rows) {
          row(ty);
          ty += rowH;
        }
      }
    }

    if (game) {
      const f = game.fields;
      const rows: ((ty: number) => void)[] = [];
      const bx = canvas.width - pad - 130;

      if (typeof f.wave === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "WAVE", bx + 12, ty);
          this.hudValue(ctx, String(Math.floor(f.wave)), bx + 70, ty, "#EC4899");
        });
      }
      if (typeof f.timeLeft === "number") {
        rows.push((ty) => {
          this.hudLabel(ctx, "TIME", bx + 12, ty);
          this.hudValue(ctx, String(Math.max(0, Math.ceil(f.timeLeft / 1000))), bx + 70, ty, "#A855F7");
        });
      }

      if (rows.length > 0) {
        const rowH = 26;
        const boxW = 130;
        const boxH = 10 + rows.length * rowH;
        ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
        ctx.strokeStyle = "rgba(236, 72, 153, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, pad, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();

        let ty = pad + 10;
        for (const row of rows) {
          row(ty);
          ty += rowH;
        }
      }
    }

    ctx.restore();
  }

  private hudLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = "#64748B";
    ctx.font = "bold 11px monospace";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private hudValue(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "bold 13px monospace";
    ctx.fillText(text, x, y - 1);
    ctx.restore();
  }

  private renderTileMap(ctx: CanvasRenderingContext2D) {
    const ts = this.tileMap.tileSize;
    for (let r = 0; r < this.tileMap.rows; r++) {
      for (let c = 0; c < this.tileMap.cols; c++) {
        const type = this.tileMap.grid[r]?.[c];
        if (!type) continue;

        const x = c * ts;
        const y = r * ts;

        switch (type) {
          case 1: // Grass Top
            ctx.fillStyle = "#10B981";
            ctx.fillRect(x, y, ts, ts);
            ctx.fillStyle = "#047857";
            ctx.fillRect(x, y + 4, ts, ts - 4);
            break;
          case 2: // Dirt
            ctx.fillStyle = "#78350F";
            ctx.fillRect(x, y, ts, ts);
            break;
          case 3: // Spikes
            ctx.fillStyle = "#EF4444";
            ctx.beginPath();
            ctx.moveTo(x, y + ts);
            ctx.lineTo(x + ts / 2, y);
            ctx.lineTo(x + ts, y + ts);
            ctx.closePath();
            ctx.fill();
            break;
          case 4: // Gold Coin
            ctx.fillStyle = "#FACC15";
            ctx.beginPath();
            ctx.arc(x + ts / 2, y + ts / 2, ts / 3, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 5: // Door
            ctx.fillStyle = "#8B5CF6";
            ctx.fillRect(x + 4, y, ts - 8, ts);
            break;
          case 6: // Brick Block
            ctx.fillStyle = "#64748B";
            ctx.fillRect(x, y, ts, ts);
            ctx.strokeStyle = "#334155";
            ctx.strokeRect(x, y, ts, ts);
            break;
        }
      }
    }
  }

  // Returns a ready-to-draw image for `src`, or null if it's still loading / failed.
  // Kicks off loading on first request; a successful load triggers a re-render so the
  // image appears as soon as it's ready without the caller needing to poll.
  private getImage(src: string): HTMLImageElement | null {
    if (!src) return null;
    if (this.failedImages.has(src)) return null;

    const cached = this.imageCache.get(src);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }

    const img = new Image();
    img.onload = () => this.render();
    img.onerror = () => {
      this.failedImages.add(src);
      this.imageCache.delete(src);
    };
    img.src = src;
    this.imageCache.set(src, img);
    return null;
  }

  private renderEntity(ctx: CanvasRenderingContext2D, ent: any) {
    const f = ent.fields;
    const x = typeof f.x === "number" ? f.x : 100;
    const y = typeof f.y === "number" ? f.y : 100;
    const w = typeof f.width === "number" ? f.width : 32;
    const h = typeof f.height === "number" ? f.height : 32;
    const color = f.color || (ent.isAgent ? "#EC4899" : "#00F2FE");
    const isSelected = this.selectedEntityName === ent.name;
    const spriteImg = typeof f.sprite === "string" && f.sprite ? this.getImage(f.sprite) : null;

    ctx.save();

    if (spriteImg) {
      // A loaded sprite image replaces the solid shape entirely, filling the same
      // width/height box. Falls through to the solid shape below while loading (or
      // if it fails), so entities never render as nothing.
      if (isSelected) {
        ctx.shadowColor = "#FACC15";
        ctx.shadowBlur = 12;
      }
      ctx.drawImage(spriteImg, x, y, w, h);
      ctx.shadowBlur = 0;
    } else {
      // Draw Entity Shadow / Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 16 : 8;

      if (f.shape === "circle") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      }

      ctx.shadowBlur = 0;
    }

    // Agent Badge / Icon
    if (ent.isAgent) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("AG", x + 4, y + 12);
    }

    // Selection Highlight Outline
    if (isSelected) {
      ctx.strokeStyle = "#FACC15";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    }

    // Entity Label
    ctx.fillStyle = "#94A3B8";
    ctx.font = "11px monospace";
    ctx.fillText(ent.name, x, y - 6);

    ctx.restore();
  }
}
