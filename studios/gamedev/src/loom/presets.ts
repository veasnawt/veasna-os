export interface GamePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  loomCode: string;
  tileMapGrid?: number[][];
  /** Applied on preset select; if omitted, whatever canvas size is already set is left alone. */
  worldWidth?: number;
  worldHeight?: number;
}

// 3-screen-wide platformer level (75 cols x 32px = 2400px), built programmatically
// rather than hand-typed as a giant literal. Tile ids match TILE_TYPES in gameEngine.ts:
// 1 grass (solid), 2 dirt (solid), 3 spike (hazard), 4 coin (pickup), 6 brick (solid).
function buildPlatformerLevel(): number[][] {
  const COLS = 75;
  const ROWS = 13;
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  const set = (r: number, c: number, v: number) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = v;
  };
  const hline = (r: number, c0: number, c1: number, v: number) => {
    for (let c = c0; c <= c1; c++) set(r, c, v);
  };

  // Ground strip (grass on top, dirt below) across the whole level.
  hline(11, 0, COLS - 1, 1);
  hline(12, 0, COLS - 1, 2);

  // Screen 1 (cols 0-24): gentle intro -- same layout as the original single-screen demo.
  set(1, 22, 4);
  hline(2, 21, 23, 6);
  hline(4, 12, 14, 4);
  hline(5, 10, 14, 6);
  set(7, 5, 4);
  hline(8, 4, 6, 6);
  hline(11, 7, 8, 3);
  hline(11, 15, 16, 3);

  // Screen 2 (cols 25-49): a jumpable chasm, then a rising staircase of brick
  // platforms with coins, guarded by spikes on the ground between them.
  hline(11, 33, 35, 0);
  hline(12, 33, 35, 0); // chasm -- falling in resets you via the KeepPlayerInWorld intent
  set(10, 26, 4);
  hline(9, 25, 27, 6);
  hline(11, 29, 30, 3);
  set(8, 40, 4);
  hline(7, 39, 41, 6);
  set(6, 45, 4);
  hline(5, 44, 46, 6);
  hline(11, 42, 43, 3);

  // Screen 3 (cols 50-74): a second chasm, more platforms, then a final elevated
  // approach up to the Star Goal at the far end of the level.
  hline(11, 58, 60, 0);
  hline(12, 58, 60, 0); // second chasm
  set(9, 52, 4);
  hline(8, 51, 53, 6);
  hline(11, 55, 56, 3);
  set(6, 63, 4);
  hline(5, 62, 64, 6);
  set(4, 68, 4);
  hline(8, 68, 74, 6); // final platform leading up to the goal
  hline(3, 70, 72, 6); // Star Goal sits just above this final platform

  return grid;
}

export const GAME_PRESETS: GamePreset[] = [
  {
    id: "empty_starter",
    name: "Empty Project (Starter)",
    category: "Starter Template",
    description: "Clean empty Loom world with a starter Player entity and smooth WASD / Arrow movement controls.",
    loomCode: `world MyWorld {

    // Starter Player Entity
    entity Player {
        x: 380,
        y: 280,
        vx: 0,
        vy: 0,
        width: 36,
        height: 36,
        color: "#00F2FE",
        hp: 100
    }

    // WASD & Arrow Movement Controls
    when Input.keyRight or Input.keyD {
        Player.vx = 220
    }

    when Input.keyLeft or Input.keyA {
        Player.vx = -220
    }

    when Input.keyUp or Input.keyW {
        Player.vy = -220
    }

    when Input.keyDown or Input.keyS {
        Player.vy = 220
    }

    when not(Input.keyRight) and not(Input.keyLeft) and not(Input.keyD) and not(Input.keyA) {
        Player.vx = 0
    }

    when not(Input.keyUp) and not(Input.keyDown) and not(Input.keyW) and not(Input.keyS) {
        Player.vy = 0
    }
}
`,
    tileMapGrid: Array(15).fill(0).map(() => Array(25).fill(0)),
  },
  {
    id: "blank_canvas",
    name: "Blank Canvas (Empty World)",
    category: "Blank Slate",
    description: "Completely empty Loom world. Add entities and agents visually or write Loom code from scratch.",
    loomCode: `world MyGame {

    // Click '+ Add Entity' in the toolbar to create your first object!

}
`,
    tileMapGrid: Array(15).fill(0).map(() => Array(25).fill(0)),
  },
  {
    id: "platformer",
    name: "Loom Platformer Odyssey",
    category: "2D Platformer Demo",
    description: "A real 3-screen side-scrolling platformer: gravity, coin collection, hazard spikes, chasms, and intent bounds enforcement, with the camera following the player across a level wider than one screen.",
    worldWidth: 2400,
    worldHeight: 600,
    loomCode: `world PlatformerWorld {

    // Camera tracks Player and keeps them anchored left-of-center on screen
    // (32% from the left edge) so more of the level ahead is visible while
    // running right toward the Star Goal.
    entity Game {
        cameraFollow: "Player",
        cameraFocusX: 0.32
    }

    // Player Hero entity
    entity Player {
        x: 60,
        y: 200,
        vx: 0,
        vy: 0,
        width: 32,
        height: 32,
        color: "#00F2FE",
        gravity: 850,
        hp: 100,
        score: 0
    }

    // Companion Agent Rixie with scoped capabilities
    agent Rixie {
        x: 100,
        y: 180,
        width: 24,
        height: 24,
        color: "#EC4899",
        can: read Player.x, control Player.score, act
    }

    // Goal Star Entity -- all the way at the far end of the 3-screen level
    entity StarGoal {
        x: 2272,
        y: 64,
        width: 32,
        height: 32,
        color: "#F59E0B",
        shape: "circle"
    }

    // Player Input Control Rule (WASD & Arrows)
    when Input.keyRight or Input.keyD {
        Player.vx = 220
    }

    when Input.keyLeft or Input.keyA {
        Player.vx = -220
    }

    when not(Input.keyRight) and not(Input.keyLeft) and not(Input.keyD) and not(Input.keyA) {
        Player.vx = 0
    }

    // Jump logic when grounded (W, Up Arrow, or Space)
    when (Input.keyUp or Input.keyW or Input.keySpace) and Player.isGrounded {
        Player.vy = -460
        Rixie.say("Up we go!")
    }

    // Reactive win condition when near the Star Goal
    when Player near StarGoal {
        Player.score = Player.score + 100
        Rixie.say("Goal Reached! Victory!")
    }

    // Loom Intent: falling off a platform or into a chasm resets you to the start
    // of the level, not just the start of the current screen -- the camera follows
    // Player automatically, so there's no separate "screen" to reset within.
    intent KeepPlayerInWorld {
        ensure Player.y <= 550
        otherwise {
            Player.x = 60
            Player.y = 200
            Player.vy = 0
        }
    }
}
`,
    tileMapGrid: buildPlatformerLevel(),
  },
  {
    id: "neon_vault_rush",
    name: "Neon Vault Rush",
    category: "Arcade Score Chaser",
    description: "Dodge roaming sentinel drones, chain fast shard pickups for combo score, and clear escalating waves in this fast, addictive arcade chaser with a full on-screen HUD.",
    loomCode: `world NeonVaultRush {

    // Meta/run state -- read by the engine's HUD renderer for the WAVE badge
    entity Game {
        wave: 1
    }

    // Floating companion agent that narrates key moments
    agent Rixie {
        x: 400,
        y: 40,
        width: 18,
        height: 18,
        color: "#A855F7",
        shape: "circle",
        can: act
    }

    // Player -- score/lives/combo are all picked up automatically by the HUD
    entity Player {
        x: 400,
        y: 300,
        vx: 0,
        vy: 0,
        width: 28,
        height: 28,
        color: "#00F2FE",
        shape: "circle",
        score: 0,
        lives: 3,
        combo: 1,
        comboTimer: 0,
        invuln: 1500
    }

    // Two roaming hazard drones -- speed scales up with Game.wave
    agent Sentinel1 {
        x: 150,
        y: 150,
        vx: 150,
        vy: 110,
        width: 30,
        height: 30,
        color: "#F87171",
        can: read Player.x, read Player.y, act
    }

    agent Sentinel2 {
        x: 650,
        y: 450,
        vx: -130,
        vy: -100,
        width: 30,
        height: 30,
        color: "#FB923C",
        can: read Player.x, read Player.y, act
    }

    // Five collectible data shards laid out across the arena
    entity Shard1 { x: 120, y: 120, width: 20, height: 20, color: "#FACC15", shape: "circle", collected: 0 }
    entity Shard2 { x: 680, y: 120, width: 20, height: 20, color: "#FACC15", shape: "circle", collected: 0 }
    entity Shard3 { x: 400, y: 300, width: 20, height: 20, color: "#FACC15", shape: "circle", collected: 0 }
    entity Shard4 { x: 120, y: 480, width: 20, height: 20, color: "#FACC15", shape: "circle", collected: 0 }
    entity Shard5 { x: 680, y: 480, width: 20, height: 20, color: "#FACC15", shape: "circle", collected: 0 }

    // WASD / Arrow movement
    when Input.keyRight or Input.keyD { Player.vx = 260 }
    when Input.keyLeft or Input.keyA { Player.vx = -260 }
    when not(Input.keyRight) and not(Input.keyLeft) and not(Input.keyD) and not(Input.keyA) { Player.vx = 0 }

    when Input.keyUp or Input.keyW { Player.vy = -260 }
    when Input.keyDown or Input.keyS { Player.vy = 260 }
    when not(Input.keyUp) and not(Input.keyDown) and not(Input.keyW) and not(Input.keyS) { Player.vy = 0 }

    // Sentinel patrol bounce -- gets faster every wave
    when Sentinel1.x >= 720 { Sentinel1.vx = 0 - (150 + Game.wave * 20) }
    when Sentinel1.x <= 60  { Sentinel1.vx = 150 + Game.wave * 20 }
    when Sentinel1.y >= 520 { Sentinel1.vy = 0 - (150 + Game.wave * 20) }
    when Sentinel1.y <= 60  { Sentinel1.vy = 150 + Game.wave * 20 }

    when Sentinel2.x >= 720 { Sentinel2.vx = 0 - (130 + Game.wave * 18) }
    when Sentinel2.x <= 60  { Sentinel2.vx = 130 + Game.wave * 18 }
    when Sentinel2.y >= 520 { Sentinel2.vy = 0 - (130 + Game.wave * 18) }
    when Sentinel2.y <= 60  { Sentinel2.vy = 130 + Game.wave * 18 }

    // Shard pickups: score scales with current combo, and picking up quickly keeps the combo alive
    when Player collides Shard1 and Shard1.collected == 0 {
        Shard1.collected = 1
        Shard1.x = -200
        Player.score = Player.score + (10 * Player.combo)
        Player.combo = Player.combo + 1
        Player.comboTimer = 1500
    }
    when Player collides Shard2 and Shard2.collected == 0 {
        Shard2.collected = 1
        Shard2.x = -200
        Player.score = Player.score + (10 * Player.combo)
        Player.combo = Player.combo + 1
        Player.comboTimer = 1500
    }
    when Player collides Shard3 and Shard3.collected == 0 {
        Shard3.collected = 1
        Shard3.x = -200
        Player.score = Player.score + (10 * Player.combo)
        Player.combo = Player.combo + 1
        Player.comboTimer = 1500
    }
    when Player collides Shard4 and Shard4.collected == 0 {
        Shard4.collected = 1
        Shard4.x = -200
        Player.score = Player.score + (10 * Player.combo)
        Player.combo = Player.combo + 1
        Player.comboTimer = 1500
    }
    when Player collides Shard5 and Shard5.collected == 0 {
        Shard5.collected = 1
        Shard5.x = -200
        Player.score = Player.score + (10 * Player.combo)
        Player.combo = Player.combo + 1
        Player.comboTimer = 1500
    }

    // Combo decays if you go too long without a pickup
    every 100ms {
        Player.comboTimer = Player.comboTimer - 100
    }
    when Player.comboTimer <= 0 and Player.combo > 1 {
        Player.combo = 1
        Player.comboTimer = 0
    }

    // Clearing all 5 shards starts the next, harder wave and gives a bonus
    when Shard1.collected == 1 and Shard2.collected == 1 and Shard3.collected == 1 and Shard4.collected == 1 and Shard5.collected == 1 {
        Game.wave = Game.wave + 1
        Player.score = Player.score + 100
        Shard1.collected = 0
        Shard1.x = 120
        Shard1.y = 120
        Shard2.collected = 0
        Shard2.x = 680
        Shard2.y = 120
        Shard3.collected = 0
        Shard3.x = 400
        Shard3.y = 300
        Shard4.collected = 0
        Shard4.x = 120
        Shard4.y = 480
        Shard5.collected = 0
        Shard5.x = 680
        Shard5.y = 480
        Rixie.say("Wave cleared! Vault defenses accelerating.")
    }

    // Getting caught costs a life and grants brief invulnerability + a knockback to center
    when (Player collides Sentinel1 or Player collides Sentinel2) and Player.invuln <= 0 {
        Player.lives = Player.lives - 1
        Player.invuln = 1200
        Player.combo = 1
        Player.comboTimer = 0
        Player.x = 400
        Player.y = 300
        Player.vx = 0
        Player.vy = 0
        Rixie.say("Hit! Vault breach detected.")
    }
    every 100ms {
        Player.invuln = Player.invuln - 100
    }

    // Game over: full run reset
    when Player.lives <= 0 {
        Player.lives = 3
        Player.score = 0
        Player.combo = 1
        Player.comboTimer = 0
        Player.invuln = 2000
        Player.x = 400
        Player.y = 300
        Player.vx = 0
        Player.vy = 0
        Game.wave = 1
        Shard1.collected = 0
        Shard1.x = 120
        Shard1.y = 120
        Shard2.collected = 0
        Shard2.x = 680
        Shard2.y = 120
        Shard3.collected = 0
        Shard3.x = 400
        Shard3.y = 300
        Shard4.collected = 0
        Shard4.x = 120
        Shard4.y = 480
        Shard5.collected = 0
        Shard5.x = 680
        Shard5.y = 480
        Sentinel1.x = 150
        Sentinel1.y = 150
        Sentinel1.vx = 150
        Sentinel1.vy = 110
        Sentinel2.x = 650
        Sentinel2.y = 450
        Sentinel2.vx = -130
        Sentinel2.vy = -100
        Rixie.say("Game Over! Resetting the vault...")
    }
}
`,
    tileMapGrid: Array(15).fill(0).map(() => Array(25).fill(0)),
  },
  {
    id: "neon_flap_rush",
    name: "Neon Flap Rush",
    category: "Endless Arcade Flyer",
    description: "Tap to flap through three lanes of scrolling neon energy barriers. Chain gaps to build score, beat your session best, speed ramps up the longer you survive. (Note: Loom has no random() builtin, so barrier gaps cycle through fixed patterns rather than true randomness.)",
    loomCode: `world NeonFlapRush {

    // Tap Space to flap. flapCooldown rate-limits holding the key so it can't
    // turn into "fly mode" -- still very tap-friendly, just capped.
    entity Player {
        x: 150,
        y: 280,
        vx: 0,
        vy: 0,
        width: 28,
        height: 28,
        color: "#00F2FE",
        shape: "circle",
        gravity: 600,
        score: 0,
        best: 0,
        flapCooldown: 0
    }

    // Three barrier lanes, each an independent Top/Bottom pair. Each pair cycles
    // through 3 fixed gap heights (upper/middle/lower) as it recycles, offset from
    // each other so the combined pattern doesn't feel like an obvious 3-beat loop.
    entity Pipe1Top    { x: 800,  y: 0,   width: 60, height: 110, color: "#EC4899", pattern: 0, scored: 0, vx: -200 }
    entity Pipe1Bottom { x: 800,  y: 260, width: 60, height: 340, color: "#EC4899", vx: -200 }

    entity Pipe2Top    { x: 1080, y: 0,   width: 60, height: 250, color: "#A855F7", pattern: 1, scored: 0, vx: -200 }
    entity Pipe2Bottom { x: 1080, y: 400, width: 60, height: 200, color: "#A855F7", vx: -200 }

    entity Pipe3Top    { x: 1360, y: 0,   width: 60, height: 390, color: "#38BDF8", pattern: 2, scored: 0, vx: -200 }
    entity Pipe3Bottom { x: 1360, y: 540, width: 60, height: 60,  color: "#38BDF8", vx: -200 }

    // Space only (not Up/W) -- those also drive the engine's hardcoded arrow-key
    // Player velocity, which would otherwise fight this flap impulse.
    when Input.keySpace and Player.flapCooldown <= 0 {
        Player.vy = -300
        Player.flapCooldown = 230
    }
    every 20ms {
        Player.flapCooldown = Player.flapCooldown - 20
    }

    // Score once per barrier successfully passed
    when Pipe1Top.x + 60 < Player.x and Pipe1Top.scored == 0 {
        Pipe1Top.scored = 1
        Player.score = Player.score + 1
    }
    when Pipe2Top.x + 60 < Player.x and Pipe2Top.scored == 0 {
        Pipe2Top.scored = 1
        Player.score = Player.score + 1
    }
    when Pipe3Top.x + 60 < Player.x and Pipe3Top.scored == 0 {
        Pipe3Top.scored = 1
        Player.score = Player.score + 1
    }

    // Track session best live
    when Player.score > Player.best {
        Player.best = Player.score
    }

    // All six pipe halves always share one speed, continuously re-synced from score.
    // (Keeping speed a single shared value -- rather than snapshotting it separately
    // in each recycle block below -- is what keeps the three lanes evenly spaced
    // forever; independent snapshots would let them gradually drift out of sync.)
    when Player.score >= 0 {
        Pipe1Top.vx = 0 - (200 + Player.score * 2)
        Pipe1Bottom.vx = 0 - (200 + Player.score * 2)
        Pipe2Top.vx = 0 - (200 + Player.score * 2)
        Pipe2Bottom.vx = 0 - (200 + Player.score * 2)
        Pipe3Top.vx = 0 - (200 + Player.score * 2)
        Pipe3Bottom.vx = 0 - (200 + Player.score * 2)
    }

    // Recycling adds a fixed distance to the pipe's OWN current x (a wraparound)
    // rather than jumping to an absolute x. That's what keeps the three lanes'
    // relative spacing exact forever -- an absolute reset would drift over many
    // cycles since -70 isn't hit at the exact same instant each time.

    // Pipe1 recycle: cycles upper -> lower -> middle -> upper
    when Pipe1Top.x <= -70 and Pipe1Top.pattern == 0 {
        Pipe1Top.x = Pipe1Top.x + 970
        Pipe1Bottom.x = Pipe1Bottom.x + 970
        Pipe1Top.height = 390
        Pipe1Bottom.y = 540
        Pipe1Bottom.height = 60
        Pipe1Top.pattern = 1
        Pipe1Top.scored = 0
    }
    when Pipe1Top.x <= -70 and Pipe1Top.pattern == 1 {
        Pipe1Top.x = Pipe1Top.x + 970
        Pipe1Bottom.x = Pipe1Bottom.x + 970
        Pipe1Top.height = 250
        Pipe1Bottom.y = 400
        Pipe1Bottom.height = 200
        Pipe1Top.pattern = 2
        Pipe1Top.scored = 0
    }
    when Pipe1Top.x <= -70 and Pipe1Top.pattern == 2 {
        Pipe1Top.x = Pipe1Top.x + 970
        Pipe1Bottom.x = Pipe1Bottom.x + 970
        Pipe1Top.height = 110
        Pipe1Bottom.y = 260
        Pipe1Bottom.height = 340
        Pipe1Top.pattern = 0
        Pipe1Top.scored = 0
    }

    // Pipe2 recycle: middle -> upper -> lower -> middle
    when Pipe2Top.x <= -70 and Pipe2Top.pattern == 0 {
        Pipe2Top.x = Pipe2Top.x + 970
        Pipe2Bottom.x = Pipe2Bottom.x + 970
        Pipe2Top.height = 390
        Pipe2Bottom.y = 540
        Pipe2Bottom.height = 60
        Pipe2Top.pattern = 1
        Pipe2Top.scored = 0
    }
    when Pipe2Top.x <= -70 and Pipe2Top.pattern == 1 {
        Pipe2Top.x = Pipe2Top.x + 970
        Pipe2Bottom.x = Pipe2Bottom.x + 970
        Pipe2Top.height = 250
        Pipe2Bottom.y = 400
        Pipe2Bottom.height = 200
        Pipe2Top.pattern = 2
        Pipe2Top.scored = 0
    }
    when Pipe2Top.x <= -70 and Pipe2Top.pattern == 2 {
        Pipe2Top.x = Pipe2Top.x + 970
        Pipe2Bottom.x = Pipe2Bottom.x + 970
        Pipe2Top.height = 110
        Pipe2Bottom.y = 260
        Pipe2Bottom.height = 340
        Pipe2Top.pattern = 0
        Pipe2Top.scored = 0
    }

    // Pipe3 recycle: lower -> middle -> upper -> lower
    when Pipe3Top.x <= -70 and Pipe3Top.pattern == 0 {
        Pipe3Top.x = Pipe3Top.x + 970
        Pipe3Bottom.x = Pipe3Bottom.x + 970
        Pipe3Top.height = 390
        Pipe3Bottom.y = 540
        Pipe3Bottom.height = 60
        Pipe3Top.pattern = 1
        Pipe3Top.scored = 0
    }
    when Pipe3Top.x <= -70 and Pipe3Top.pattern == 1 {
        Pipe3Top.x = Pipe3Top.x + 970
        Pipe3Bottom.x = Pipe3Bottom.x + 970
        Pipe3Top.height = 250
        Pipe3Bottom.y = 400
        Pipe3Bottom.height = 200
        Pipe3Top.pattern = 2
        Pipe3Top.scored = 0
    }
    when Pipe3Top.x <= -70 and Pipe3Top.pattern == 2 {
        Pipe3Top.x = Pipe3Top.x + 970
        Pipe3Bottom.x = Pipe3Bottom.x + 970
        Pipe3Top.height = 110
        Pipe3Bottom.y = 260
        Pipe3Bottom.height = 340
        Pipe3Top.pattern = 0
        Pipe3Top.scored = 0
    }

    // Crash on the ground or any barrier -- full run reset (classic Flappy Bird rules)
    when Player.y >= 572 or Player collides Pipe1Top or Player collides Pipe1Bottom or Player collides Pipe2Top or Player collides Pipe2Bottom or Player collides Pipe3Top or Player collides Pipe3Bottom {
        Player.y = 280
        Player.vy = 0
        Player.score = 0
        Player.flapCooldown = 0

        Pipe1Top.x = 800
        Pipe1Top.height = 110
        Pipe1Top.pattern = 0
        Pipe1Top.scored = 0
        Pipe1Bottom.x = 800
        Pipe1Bottom.y = 260
        Pipe1Bottom.height = 340

        Pipe2Top.x = 1080
        Pipe2Top.height = 250
        Pipe2Top.pattern = 1
        Pipe2Top.scored = 0
        Pipe2Bottom.x = 1080
        Pipe2Bottom.y = 400
        Pipe2Bottom.height = 200

        Pipe3Top.x = 1360
        Pipe3Top.height = 390
        Pipe3Top.pattern = 2
        Pipe3Top.scored = 0
        Pipe3Bottom.x = 1360
        Pipe3Bottom.y = 540
        Pipe3Bottom.height = 60

        Player.say("Crashed! Resetting run...")
    }
}
`,
    tileMapGrid: Array(15).fill(0).map(() => Array(25).fill(0)),
  },
];
