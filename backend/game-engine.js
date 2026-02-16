const CANVAS_W = 900;
const CANVAS_H = 600;
const PLAYER_SIZE = 18;
const BULLET_SPEED = 7;
const BULLET_RADIUS = 5;
const MOVE_SPEED = 3;
const ROTATE_SPEED = 0.06;
const SHOOT_COOLDOWN = 300;
const MAX_HP = 5;

const AIRSTRIKE_RADIUS = 60;
const AIRSTRIKE_DAMAGE = 3;
const AIRSTRIKE_COUNT = 5;
const AIRSTRIKE_WARN_TICKS = 45; // 1.5 seconds warning at 30 ticks/sec
const AIRSTRIKE_EXPLODE_TICKS = 12; // explosion lasts 0.4s

const PLAYER_COLORS = [
  { color: 'hsl(160, 100%, 50%)', glow: 'hsl(160, 100%, 60%)' },
  { color: 'hsl(280, 100%, 65%)', glow: 'hsl(280, 100%, 75%)' },
  { color: 'hsl(30, 100%, 55%)', glow: 'hsl(30, 100%, 65%)' },
];

const SPAWN_POINTS = [
  { x: 100, y: 100 },
  { x: 800, y: 100 },
  { x: 450, y: 500 },
];

const SPAWN_ANGLES = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  -Math.PI / 2,
];

function createObstacles() {
  return [
    { pos: { x: 200, y: 150 }, width: 80, height: 30 },
    { pos: { x: 620, y: 150 }, width: 80, height: 30 },
    { pos: { x: 410, y: 280 }, width: 80, height: 40 },
    { pos: { x: 150, y: 400 }, width: 30, height: 80 },
    { pos: { x: 720, y: 400 }, width: 30, height: 80 },
    { pos: { x: 350, y: 460 }, width: 60, height: 25 },
    { pos: { x: 490, y: 460 }, width: 60, height: 25 },
    { pos: { x: 100, y: 250 }, width: 50, height: 20 },
    { pos: { x: 750, y: 250 }, width: 50, height: 20 },
  ];
}

function createPlayer(slotId) {
  const sp = SPAWN_POINTS[slotId];
  const colors = PLAYER_COLORS[slotId];
  return {
    id: slotId,
    pos: { x: sp.x, y: sp.y },
    angle: SPAWN_ANGLES[slotId],
    vel: { x: 0, y: 0 },
    hp: MAX_HP,
    color: colors.color,
    glowColor: colors.glow,
    lastShot: 0,
    alive: true,
    airstrikeUsed: false,
    godMode: false,
  };
}

function createInitialState(playerSlots) {
  const players = playerSlots.map((slot) => createPlayer(slot));
  return {
    players,
    bullets: [],
    obstacles: createObstacles(),
    airstrikes: [],
    lasers: [],
    winner: null,
    gameOver: false,
  };
}

function rectContains(obs, px, py, radius) {
  const closestX = Math.max(obs.pos.x, Math.min(px, obs.pos.x + obs.width));
  const closestY = Math.max(obs.pos.y, Math.min(py, obs.pos.y + obs.height));
  const dx = px - closestX;
  const dy = py - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function movePlayer(player, forward, rotate, obstacles) {
  if (!player.alive) return;
  player.angle += rotate * ROTATE_SPEED;
  const nx = player.pos.x + Math.cos(player.angle) * forward * MOVE_SPEED;
  const ny = player.pos.y + Math.sin(player.angle) * forward * MOVE_SPEED;

  const blocked = obstacles.some((o) => rectContains(o, nx, ny, PLAYER_SIZE));
  if (!blocked) {
    player.pos.x = Math.max(PLAYER_SIZE, Math.min(CANVAS_W - PLAYER_SIZE, nx));
    player.pos.y = Math.max(PLAYER_SIZE, Math.min(CANVAS_H - PLAYER_SIZE, ny));
  }
}

function shoot(player, now) {
  if (!player.alive || now - player.lastShot < SHOOT_COOLDOWN) return null;
  player.lastShot = now;
  return {
    pos: {
      x: player.pos.x + Math.cos(player.angle) * (PLAYER_SIZE + 5),
      y: player.pos.y + Math.sin(player.angle) * (PLAYER_SIZE + 5),
    },
    vel: {
      x: Math.cos(player.angle) * BULLET_SPEED,
      y: Math.sin(player.angle) * BULLET_SPEED,
    },
    ownerId: player.id,
    color: player.color,
  };
}

function triggerAirstrike(state, callerSlot) {
  const caller = state.players.find((p) => p.id === callerSlot);
  if (!caller || !caller.alive || caller.airstrikeUsed) return false;

  caller.airstrikeUsed = true;

  const enemies = state.players.filter((p) => p.id !== callerSlot && p.alive);
  const strikes = [];

  for (const enemy of enemies) {
    // Drop 2-3 strikes around each enemy's current position (with scatter)
    const count = enemies.length === 1 ? AIRSTRIKE_COUNT : Math.ceil(AIRSTRIKE_COUNT / enemies.length);
    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * 120;
      const offsetY = (Math.random() - 0.5) * 120;
      strikes.push({
        pos: {
          x: Math.max(AIRSTRIKE_RADIUS, Math.min(CANVAS_W - AIRSTRIKE_RADIUS, enemy.pos.x + offsetX)),
          y: Math.max(AIRSTRIKE_RADIUS, Math.min(CANVAS_H - AIRSTRIKE_RADIUS, enemy.pos.y + offsetY)),
        },
        radius: AIRSTRIKE_RADIUS,
        ownerId: callerSlot,
        color: caller.color,
        ticksLeft: AIRSTRIKE_WARN_TICKS + Math.floor(Math.random() * 10),
        phase: 'warning',
      });
    }
  }

  state.airstrikes.push(...strikes);
  return true;
}

function updateAirstrikes(state) {
  state.airstrikes = state.airstrikes.filter((strike) => {
    strike.ticksLeft--;

    if (strike.phase === 'warning' && strike.ticksLeft <= 0) {
      // Transition to explode phase -- deal damage now
      strike.phase = 'explode';
      strike.ticksLeft = AIRSTRIKE_EXPLODE_TICKS;

      for (const p of state.players) {
        if (p.id === strike.ownerId || !p.alive) continue;
        const dx = p.pos.x - strike.pos.x;
        const dy = p.pos.y - strike.pos.y;
        if (dx * dx + dy * dy < (strike.radius + PLAYER_SIZE) ** 2) {
          p.hp -= AIRSTRIKE_DAMAGE;
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
          }
        }
      }
    }

    return strike.ticksLeft > 0;
  });
}

const LASER_DISPLAY_TICKS = 10;
const LASER_WIDTH = 8;
const LASER_DAMAGE = 2;

function shootLaser(player, state, now) {
  if (!player.alive || now - player.lastShot < SHOOT_COOLDOWN) return null;
  player.lastShot = now;

  const startX = player.pos.x + Math.cos(player.angle) * (PLAYER_SIZE + 5);
  const startY = player.pos.y + Math.sin(player.angle) * (PLAYER_SIZE + 5);

  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  let endX = startX;
  let endY = startY;
  for (let t = 0; t < 1500; t += 2) {
    endX = startX + dx * t;
    endY = startY + dy * t;
    if (endX < 0 || endX > CANVAS_W || endY < 0 || endY > CANVAS_H) break;
  }

  for (const p of state.players) {
    if (p.id === player.id || !p.alive) continue;
    const apx = p.pos.x - startX;
    const apy = p.pos.y - startY;
    const abx = endX - startX;
    const aby = endY - startY;
    const abLen2 = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
    const closestX = startX + t * abx;
    const closestY = startY + t * aby;
    const dist = Math.sqrt((p.pos.x - closestX) ** 2 + (p.pos.y - closestY) ** 2);
    if (dist < LASER_WIDTH + PLAYER_SIZE) {
      p.hp -= LASER_DAMAGE;
      if (p.hp <= 0) { p.hp = 0; p.alive = false; }
    }
  }

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    ownerId: player.id,
    color: player.color,
    glowColor: player.glowColor,
    ticksLeft: LASER_DISPLAY_TICKS,
  };
}

function updateLasers(state) {
  state.lasers = state.lasers.filter((l) => {
    l.ticksLeft--;
    return l.ticksLeft > 0;
  });
}

function updateBullets(state) {
  state.bullets = state.bullets.filter((b) => {
    b.pos.x += b.vel.x;
    b.pos.y += b.vel.y;

    if (b.pos.x < 0 || b.pos.x > CANVAS_W || b.pos.y < 0 || b.pos.y > CANVAS_H) return false;
    if (state.obstacles.some((o) => rectContains(o, b.pos.x, b.pos.y, BULLET_RADIUS))) return false;

    for (const p of state.players) {
      if (p.id === b.ownerId || !p.alive) continue;
      const dx = p.pos.x - b.pos.x;
      const dy = p.pos.y - b.pos.y;
      if (dx * dx + dy * dy < (PLAYER_SIZE + BULLET_RADIUS) ** 2) {
        p.hp--;
        if (p.hp <= 0) p.alive = false;
        return false;
      }
    }
    return true;
  });

  const alive = state.players.filter((p) => p.alive);
  if (alive.length <= 1 && !state.gameOver) {
    state.gameOver = true;
    state.winner = alive.length === 1 ? alive[0].id : -1;
  }
}

module.exports = {
  CANVAS_W, CANVAS_H, PLAYER_SIZE, BULLET_SPEED, BULLET_RADIUS,
  MOVE_SPEED, ROTATE_SPEED, SHOOT_COOLDOWN, MAX_HP,
  AIRSTRIKE_RADIUS, AIRSTRIKE_DAMAGE, AIRSTRIKE_COUNT,
  AIRSTRIKE_WARN_TICKS, AIRSTRIKE_EXPLODE_TICKS,
  PLAYER_COLORS, SPAWN_POINTS, SPAWN_ANGLES,
  createObstacles, createPlayer, createInitialState,
  movePlayer, shoot, shootLaser, updateBullets,
  triggerAirstrike, updateAirstrikes, updateLasers,
};
