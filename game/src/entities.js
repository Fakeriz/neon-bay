// Neon Bay's moving pieces: the player (on foot or in a car), traffic, pedestrians,
// police, bullets and particles. All state lives in one `world` object the main
// loop owns; this module only steps it.

import { WORLD, CAR, PLAYER, TRAFFIC, PEDS, WANTED, PAINTS } from './config.js';
import { makeRng } from './rng.js';
import { collideCircleBuildings, collideCarBuildings, isWater, nearestNode, nextNode, onRoad } from './world.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(city, seed) {
  const rng = makeRng(seed);
  const player = {
    x: city.places.garage.x,
    y: city.places.garage.y,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    cash: 120,
    ammo: PLAYER.pistolAmmoStart,
    hasPistol: true,
    inCar: null,
    punchCd: 0,
    shootCd: 0,
    hurtCd: 0,
    speed: 0,
  };
  const cars = [];
  for (const spot of city.parkedSpots) {
    const paint = rng.pick(PAINTS.filter((p) => p.name !== 'Police'));
    cars.push({
      id: cars.length,
      x: spot.x,
      y: spot.y,
      angle: spot.angle,
      speed: 0,
      health: CAR.maxHealth,
      paint,
      parked: true,
      isPolice: false,
      driver: null,
      skid: 0,
    });
  }
  const traffic = [];
  for (let i = 0; i < TRAFFIC.count; i++) {
    const node = rng.pick(city.nodes);
    const target = nextNode(city, node, node, rng);
    const paint = rng.pick(PAINTS.filter((p) => p.name !== 'Police'));
    traffic.push({
      id: 100 + i,
      x: node.x + rng.range(-20, 20),
      y: node.y + rng.range(-20, 20),
      angle: Math.atan2(target.y - node.y, target.x - node.x),
      speed: TRAFFIC.speed + rng.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
      node,
      target,
      health: CAR.maxHealth,
      paint,
      parked: false,
      isPolice: false,
      driver: 'civilian',
      skid: 0,
    });
  }
  const peds = [];
  for (let i = 0; i < PEDS.count; i++) {
    const node = rng.pick(city.nodes);
    peds.push({
      x: node.x + rng.range(-90, 90),
      y: node.y + rng.range(-90, 90),
      angle: rng.range(0, Math.PI * 2),
      speed: PEDS.speed + rng.range(-PEDS.speedJitter, PEDS.speedJitter),
      color: rng.pick(['#e8b04b', '#4b8ae8', '#e84b6b', '#8ae84b', '#e8e84b', '#c9a0dc', '#f0f0f0']),
      state: 'walk',
      tx: 0,
      ty: 0,
      fleeT: 0,
      health: 30,
    });
  }
  return {
    city,
    rng,
    player,
    cars,
    traffic,
    peds,
    police: [],
    goons: [],
    bullets: [],
    particles: [],
    pickups: [],
    skidMarks: [],
    wanted: 0,
    heat: 0,
    unseenT: 0,
    bustT: 0,
    time: 0,
    clockHour: 17.2,
    stats: { crimes: 0, carsStolen: 0, missionsDone: 0, shotsFired: 0 },
  };
}

/** All cars the player can drive: parked ones plus traffic (stealable). */
export function drivableCars(w) {
  return [...w.cars, ...w.traffic];
}

export function nearestCar(w, x, y, maxDist) {
  let best = null;
  let bd = maxDist * maxDist;
  for (const c of drivableCars(w)) {
    if (c === w.player.inCar) continue;
    const d = dist2(c, { x, y });
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function addWanted(w, amount, reason) {
  w.heat = Math.min(5, w.heat + amount);
  w.wanted = Math.ceil(w.heat);
  w.unseenT = 0;
  if (amount > 0) w.stats.crimes++;
  if (reason === 'steal') w.stats.carsStolen++;
}

export function spawnParticles(w, x, y, n, color, speed = 120, life = 0.6) {
  for (let i = 0; i < n; i++) {
    const a = w.rng.range(0, Math.PI * 2);
    const s = w.rng.range(speed * 0.3, speed);
    w.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: w.rng.range(life * 0.5, life), maxLife: life, color, size: w.rng.range(2, 5) });
  }
  if (w.particles.length > 400) w.particles.splice(0, w.particles.length - 400);
}

export function spawnPickup(w, kind, x, y) {
  w.pickups.push({ kind, x, y, bob: 0 });
}

function hurtPlayer(w, dmg, fromX, fromY) {
  const p = w.player;
  if (p.hurtCd > 0) return;
  p.health -= dmg;
  p.hurtCd = 0.5;
  spawnParticles(w, p.x, p.y, 8, '#ff4b4b', 140, 0.5);
  if (fromX !== undefined) {
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    p.x += (dx / d) * 14;
    p.y += (dy / d) * 14;
  }
}

/** Drive one car with arcade physics. `ctrl` is {throttle, brake, steer} in -1..1. */
export function driveCar(w, car, ctrl, dt, isPlayer) {
  const prevSpeed = car.speed;
  if (ctrl.throttle > 0) car.speed += CAR.accel * ctrl.throttle * dt;
  else if (ctrl.throttle < 0) car.speed += CAR.reverseAccel * ctrl.throttle * dt;
  if (ctrl.brake) {
    const s = Math.sign(car.speed);
    car.speed -= s * CAR.brake * dt;
    if (Math.sign(car.speed) !== s) car.speed = 0;
  }
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.45 * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed * (car.isPolice ? 1.05 : 1));
  const steer = ctrl.steer * CAR.turn * clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * dt;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  car.x += dx;
  car.y += dy;
  // Skid marks when turning hard at speed.
  if (Math.abs(steer) > 1.4 && Math.abs(car.speed) > 260) {
    car.skid += dt;
    if (car.skid > 0.08) {
      car.skid = 0;
      w.skidMarks.push({ x: car.x, y: car.y, angle: car.angle, life: 6 });
      if (w.skidMarks.length > 220) w.skidMarks.shift();
    }
  }
  // Buildings: bounce back, with damage only on a fresh hard impact (a cooldown
  // stops a car wedged on a corner from taking damage every frame).
  car._hitCd = Math.max(0, (car._hitCd || 0) - dt);
  if (collideCarBuildings(w.city, car, CAR.length / 2, CAR.width / 2)) {
    const impact = Math.abs(prevSpeed);
    car.speed *= -0.25;
    if (impact > 240 && car._hitCd <= 0) {
      car._hitCd = 0.4;
      car.health -= (impact - 220) * 0.05;
      if (isPlayer && impact > 260) {
        spawnParticles(w, car.x, car.y, 10, '#ffb84b', 160, 0.5);
      }
    }
  }
  // Water / world edge: soft wall.
  if (car.x > WORLD.waterX - 10) {
    car.x = WORLD.waterX - 10;
    car.speed *= 0.4;
  }
  car.x = clamp(car.x, 20, WORLD.size - 20);
  car.y = clamp(car.y, 20, WORLD.size - 20);
  if (car.health <= 0) car.health = 0;
}

function stepTrafficCar(w, c, dt) {
  // Steer toward the target intersection, then pick the next leg.
  const dx = c.target.x - c.x;
  const dy = c.target.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d < 26) {
    const from = c.node;
    c.node = c.target;
    c.target = nextNode(w.city, c.node, from, w.rng);
    return;
  }
  const want = Math.atan2(dy, dx);
  const diff = angDiff(c.angle, want);
  const maxTurn = 2.2 * dt;
  c.angle += clamp(diff, -maxTurn, maxTurn);
  // Slow for a sharp turn, and for cars/peds ahead.
  let targetSpeed = TRAFFIC.speed;
  if (Math.abs(diff) > 0.7) targetSpeed *= 0.35;
  for (const o of w.traffic) {
    if (o === c) continue;
    const ahead = (o.x - c.x) * Math.cos(c.angle) + (o.y - c.y) * Math.sin(c.angle);
    const side = Math.abs((o.x - c.x) * -Math.sin(c.angle) + (o.y - c.y) * Math.cos(c.angle));
    if (ahead > 0 && ahead < 70 && side < 30) targetSpeed = 0;
  }
  const p = w.player;
  if (p.inCar === c) return; // driven by the player elsewhere
  if (p.inCar) {
    const ahead = (p.inCar.x - c.x) * Math.cos(c.angle) + (p.inCar.y - c.y) * Math.sin(c.angle);
    const side = Math.abs((p.inCar.x - c.x) * -Math.sin(c.angle) + (p.inCar.y - c.y) * Math.cos(c.angle));
    if (ahead > 0 && ahead < 80 && side < 34) targetSpeed = 0;
  }
  c.speed += clamp(targetSpeed - c.speed, -260 * dt, 180 * dt);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  collideCarBuildings(w.city, c, CAR.length / 2, CAR.width / 2);
}

function stepPed(w, ped, dt) {
  if (ped.fleeT > 0) {
    ped.fleeT -= dt;
    ped.x += Math.cos(ped.angle) * 150 * dt;
    ped.y += Math.sin(ped.angle) * 150 * dt;
  } else {
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    if (w.rng.chance(dt * 0.25)) ped.angle = w.rng.range(0, Math.PI * 2);
  }
  // Stay on sidewalks: steer back onto a road when wandering off.
  if (!onRoad(ped.x, ped.y)) {
    const n = nearestNode(w.city, ped.x, ped.y);
    ped.angle = Math.atan2(n.y - ped.y, n.x - ped.x);
  }
  collideCircleBuildings(w.city, ped, 10);
  ped.x = clamp(ped.x, 20, WORLD.waterX - 20);
  ped.y = clamp(ped.y, 20, WORLD.size - 20);
}

function stepPolice(w, dt, audio) {
  const p = w.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const wantCars = Math.min(4, Math.ceil(w.wanted / 1.5));
  // Spawn police cars at the map edge nearest the player, up to the wanted level.
  const carsOut = w.police.filter((c) => c.isPolice && c.kind === 'car').length;
  if (w.wanted > 0 && carsOut < wantCars && w.rng.chance(dt * 0.5)) {
    const edge = w.rng.pick([
      { x: px - 700, y: py },
      { x: px + 700, y: py },
      { x: px, y: py - 700 },
      { x: px, y: py + 700 },
    ]);
    const node = nearestNode(w.city, clamp(edge.x, 150, 1950), clamp(edge.y, 150, 1950));
    w.police.push({
      id: 500 + w.police.length,
      x: node.x,
      y: node.y,
      angle: Math.atan2(py - node.y, px - node.x),
      speed: 0,
      health: CAR.maxHealth,
      paint: PAINTS.find((q) => q.name === 'Police'),
      parked: false,
      isPolice: true,
      kind: 'car',
      driver: 'police',
      skid: 0,
    });
  }
  // Foot cops when the player is on foot and wanted.
  const footOut = w.police.filter((c) => c.kind === 'foot').length;
  if (w.wanted > 0 && !p.inCar && footOut < Math.min(3, w.wanted) && w.rng.chance(dt * 0.4)) {
    w.police.push({
      kind: 'foot',
      x: px + w.rng.range(-300, 300),
      y: py + w.rng.range(-300, 300),
      angle: 0,
      speed: 0,
      health: 40,
    });
  }
  for (const cop of w.police) {
    if (cop.kind === 'car') {
      const want = Math.atan2(py - cop.y, px - cop.x);
      const diff = angDiff(cop.angle, want);
      const d = Math.hypot(px - cop.x, py - cop.y);
      const steer = clamp(diff * 2.2, -1, 1);
      const ctrl = { throttle: d > 60 ? 1 : 0.4, brake: false, steer };
      driveCar(w, cop, ctrl, dt, false);
      // Ram the player's car.
      if (p.inCar && dist2(cop, p.inCar) < 46 * 46) {
        p.inCar.health -= 8 * dt;
        spawnParticles(w, cop.x, cop.y, 3, '#ffb84b', 120, 0.4);
        if (audio) audio.crash(0.3);
      }
    } else {
      const d = Math.hypot(px - cop.x, py - cop.y);
      cop.angle = Math.atan2(py - cop.y, px - cop.x);
      if (d > 26) {
        cop.x += Math.cos(cop.angle) * WANTED.copFootSpeed * dt;
        cop.y += Math.sin(cop.angle) * WANTED.copFootSpeed * dt;
      }
      // Arrest: standing on the player while wanted.
      if (!p.inCar && d < 30 && w.wanted > 0) {
        w.bustT += dt;
      }
    }
  }
  // Despawn far-away police once the heat is gone.
  if (w.wanted === 0) {
    w.police = w.police.filter((c) => dist2(c, { x: px, y: py }) < 900 * 900);
  }
}

function stepGoons(w, dt, audio) {
  const p = w.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (const g of w.goons) {
    if (g.health <= 0) continue;
    const d = Math.hypot(px - g.x, py - g.y);
    g.angle = Math.atan2(py - g.y, px - g.x);
    if (d > 300) {
      g.x += Math.cos(g.angle) * 130 * dt;
      g.y += Math.sin(g.angle) * 130 * dt;
    } else if (d < 180) {
      g.x -= Math.cos(g.angle) * 60 * dt;
      g.y -= Math.sin(g.angle) * 60 * dt;
    }
    collideCircleBuildings(w.city, g, 12);
    g.shootCd -= dt;
    if (g.shootCd <= 0 && d < 420 && w.rng.chance(0.6)) {
      g.shootCd = w.rng.range(0.9, 1.6);
      const a = g.angle + w.rng.range(-0.12, 0.12);
      w.bullets.push({ x: g.x, y: g.y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 0.8, from: 'goon', dmg: 8 });
      if (audio) audio.shoot();
    }
  }
  w.goons = w.goons.filter((g) => g.health > 0 || g.deathT > 0);
  for (const g of w.goons) if (g.health <= 0) g.deathT = (g.deathT || 0) - dt;
}

function stepBullets(w, dt) {
  for (const b of w.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Hit a building?
    for (const bd of w.city.buildings) {
      if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) {
        b.life = 0;
        spawnParticles(w, b.x, b.y, 4, '#c9c9c9', 90, 0.3);
      }
    }
    if (b.from === 'player') {
      for (const g of w.goons) {
        if (g.health > 0 && dist2(b, g) < 18 * 18) {
          g.health -= b.dmg;
          b.life = 0;
          spawnParticles(w, b.x, b.y, 8, '#ff4b4b', 140, 0.4);
          if (g.health <= 0) spawnParticles(w, g.x, g.y, 16, '#ff4b4b', 200, 0.7);
        }
      }
      for (const cop of w.police) {
        if (cop.kind === 'foot' && dist2(b, cop) < 18 * 18) {
          cop.health -= b.dmg;
          b.life = 0;
          spawnParticles(w, cop.x, cop.y, 8, '#ff4b4b', 140, 0.4);
        }
      }
      for (const ped of w.peds) {
        if (dist2(b, ped) < 14 * 14) {
          ped.health -= b.dmg;
          b.life = 0;
          spawnParticles(w, ped.x, ped.y, 8, '#ff4b4b', 140, 0.4);
          ped.fleeT = 3;
          addWanted(w, 1, 'shoot');
        }
      }
    } else {
      const p = w.player;
      const tx = p.inCar ? p.inCar : p;
      const r = p.inCar ? 26 : 14;
      if (dist2(b, tx) < r * r) {
        b.life = 0;
        if (p.inCar) {
          p.inCar.health -= b.dmg;
        } else {
          hurtPlayer(w, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05);
        }
      }
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
}

export function stepWorld(w, dt, audio) {
  w.time += dt;
  w.clockHour = (w.clockHour + dt * (1 / 75)) % 24;
  const p = w.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);

  for (const c of w.traffic) {
    if (c !== p.inCar) stepTrafficCar(w, c, dt);
  }
  for (const ped of w.peds) stepPed(w, ped, dt);
  if (w.wanted > 0) stepPolice(w, dt, audio);
  stepGoons(w, dt, audio);
  stepBullets(w, dt);

  // Wanted decay: out of every cop's sight for a while.
  if (w.wanted > 0) {
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    const seen = w.police.some((c) => dist2(c, { x: px, y: py }) < 520 * 520);
    if (!seen) {
      w.unseenT += dt;
      if (w.unseenT > WANTED.decayDelay) {
        w.heat = Math.max(0, w.heat - WANTED.decayRate * dt);
        w.wanted = Math.ceil(w.heat);
      }
    } else {
      w.unseenT = 0;
    }
  }
  if (w.bustT > 0 && w.wanted === 0) w.bustT = 0;

  // Particles and skid marks age out.
  for (const pt of w.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2.4 * dt;
    pt.vy *= 1 - 2.4 * dt;
    pt.life -= dt;
  }
  w.particles = w.particles.filter((pt) => pt.life > 0);
  for (const s of w.skidMarks) s.life -= dt;
  w.skidMarks = w.skidMarks.filter((s) => s.life > 0);
  for (const pk of w.pickups) pk.bob += dt;

  // Pickups.
  for (const pk of w.pickups) {
    if (dist2(pk, p) < 26 * 26 && !p.inCar) {
      if (pk.kind === 'health') p.health = Math.min(PLAYER.maxHealth, p.health + 40);
      if (pk.kind === 'ammo') p.ammo += 24;
      if (audio) audio.pickup();
      spawnParticles(w, pk.x, pk.y, 10, '#7cff4f', 120, 0.5);
      pk.taken = true;
    }
  }
  w.pickups = w.pickups.filter((pk) => !pk.taken);

  // Player car destroyed?
  if (p.inCar && p.inCar.health <= 0) {
    spawnParticles(w, p.inCar.x, p.inCar.y, 30, '#ff7a1a', 260, 0.9);
    if (audio) audio.crash(1);
    const car = p.inCar;
    p.inCar = null;
    p.x = car.x + 40;
    p.y = car.y;
    car.parked = true;
    car.speed = 0;
  }
}
