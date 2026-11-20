// Neon Bay — the game loop: states (menu / playing / paused / busted / wasted /
// complete), player controls on foot and in a car, the camera, saving, and the
// deterministic ?shot= scenes the screenshots are taken from.

import { WORLD, STEP, PLAYER, CAR, WANTED } from './config.js';
import { generateCity, collideCircleBuildings, isWater, nearestNode } from './world.js';
import { createWorld, nearestCar, addWanted, driveCar, stepWorld, spawnParticles, spawnPickup } from './entities.js';
import { createMissionState, startMission, updateMissions, MISSIONS } from './missions.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { render, renderHUD, renderMenu, daylight } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261120);
const shot = params.get('shot') || '';

const input = createInput(canvas);
const audio = createAudio();
const city = generateCity(seed);
const w = createWorld(city, seed + 7);
const ms = createMissionState();
ms.hasSave = !!localStorage.getItem('neon-bay-save');

let viewW = 1280;
let viewH = 720;
let camera = { x: w.player.x, y: w.player.y };
let screen = 'menu'; // menu | howto | playing | paused | busted | wasted | complete
let menuSelected = 0;
let saveTimer = 0;
let ui = { aiming: false, aimX: 0, aimY: 0, flash: 0 };
let pausedFromShot = false;

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * window.devicePixelRatio);
  canvas.height = Math.floor(viewH * window.devicePixelRatio);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function announce(text) {
  statusEl.textContent = text;
}

function saveGame() {
  const p = w.player;
  const data = {
    cash: p.cash,
    health: p.health,
    ammo: p.ammo,
    missionIndex: ms.index,
    completedIds: ms.completedIds,
    x: p.inCar ? p.inCar.x : p.x,
    y: p.inCar ? p.inCar.y : p.y,
    clockHour: w.clockHour,
    stats: w.stats,
  };
  try {
    localStorage.setItem('neon-bay-save', JSON.stringify(data));
    ms.hasSave = true;
  } catch {
    /* storage unavailable: the game still plays */
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('neon-bay-save');
    if (!raw) return false;
    const d = JSON.parse(raw);
    const p = w.player;
    p.cash = d.cash;
    p.health = d.health;
    p.ammo = d.ammo;
    p.x = d.x;
    p.y = d.y;
    ms.index = Math.min(d.missionIndex, MISSIONS.length - 1);
    ms.completedIds = d.completedIds || [];
    w.clockHour = d.clockHour || 17.2;
    w.stats = { ...w.stats, ...(d.stats || {}) };
    return true;
  } catch {
    return false;
  }
}

function respawn(place, fine) {
  const p = w.player;
  const loss = Math.floor(p.cash * fine);
  p.cash -= loss;
  p.health = PLAYER.maxHealth;
  p.inCar = null;
  p.x = place.x;
  p.y = place.y;
  w.wanted = 0;
  w.heat = 0;
  w.bustT = 0;
  w.police = [];
  w.goons = [];
  w.bullets = [];
  ms.bustedNote = `Fine paid: $${loss}. Heat gone — back to the garage.`;
  return loss;
}

function startPlaying(fresh) {
  if (fresh) {
    w.player.cash = 120;
    w.player.health = PLAYER.maxHealth;
    w.player.ammo = PLAYER.pistolAmmoStart;
    ms.index = 0;
    ms.completedIds = [];
    ms.stage = 'idle';
    ms.target = null;
    w.player.x = city.places.garage.x;
    w.player.y = city.places.garage.y;
    w.clockHour = 17.2;
    w.wanted = 0;
    w.heat = 0;
  }
  screen = 'playing';
  audio.unlock();
  announce('Neon Bay. Drive to the yellow marker, or press N at the garage to start a mission.');
}

/** Player controls: on foot. Returns nothing; mutates the world. */
function stepPlayerOnFoot(dt) {
  const p = w.player;
  const up = input.down('KeyW', 'ArrowUp');
  const down = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const run = input.down('ShiftLeft', 'ShiftRight');
  let mx = (right ? 1 : 0) - (left ? 1 : 0);
  let my = (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  // World bounds + water + buildings.
  if (isWater(p.x, p.y)) {
    p.x = Math.min(p.x, 2230);
    if (p.x < 20) p.x = 20;
    if (p.y < 20) p.y = 20;
    if (p.y > WORLD.size - 20) p.y = WORLD.size - 20;
  }
  collideCircleBuildings(city, p, PLAYER.radius);

  // Aim with the mouse.
  const aimX = camera.x - viewW / 2 + input.mouse.x;
  const aimY = camera.y - viewH / 2 + input.mouse.y;
  ui.aimX = aimX;
  ui.aimY = aimY;
  ui.aiming = input.mouse.down || input.mouse.clicked;
  if (input.mouse.down || input.mouse.clicked) p.angle = Math.atan2(aimY - p.y, aimX - p.x);

  // Shoot.
  if ((input.mouse.down || input.mouse.clicked) && p.shootCd <= 0 && p.ammo > 0) {
    p.shootCd = PLAYER.pistolCooldown;
    p.ammo--;
    w.stats.shotsFired++;
    const a = p.angle;
    w.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 0.7, from: 'player', dmg: PLAYER.pistolDamage });
    spawnParticles(w, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 4, '#ffe98a', 160, 0.25);
    audio.shoot();
    if (w.wanted < 1 && w.police.length === 0) addWanted(w, 1, 'shoot');
  }
  // Punch.
  if (input.pressed('KeyF') && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    audio.punch();
    const reach = { x: p.x + Math.cos(p.angle) * PLAYER.punchRange, y: p.y + Math.sin(p.angle) * PLAYER.punchRange };
    for (const g of w.goons) {
      if (g.health > 0 && Math.hypot(g.x - reach.x, g.y - reach.y) < 34) {
        g.health -= PLAYER.punchDamage;
        spawnParticles(w, g.x, g.y, 8, '#ff4b4b', 140, 0.4);
      }
    }
    for (const ped of w.peds) {
      if (Math.hypot(ped.x - reach.x, ped.y - reach.y) < 30) {
        ped.fleeT = 3;
        ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
        addWanted(w, 1, 'assault');
      }
    }
  }
  // Enter a car.
  if (input.pressed('KeyE')) {
    const car = nearestCar(w, p.x, p.y, 70);
    if (car) {
      const wasParked = car.parked;
      const wasTraffic = w.traffic.includes(car);
      p.inCar = car;
      car.parked = false;
      car.speed = 0;
      if (car.driver === 'civilian') {
        // The driver bails and runs.
        w.peds.push({ x: car.x + 30, y: car.y, angle: Math.atan2(car.y - p.y, car.x - p.x), speed: 200, color: '#e8b04b', state: 'walk', tx: 0, ty: 0, fleeT: 4, health: 30 });
        car.driver = null;
      }
      // Stealing in front of a witness raises the heat.
      const witness = w.peds.some((pd) => Math.hypot(pd.x - p.x, pd.y - p.y) < 260) || w.police.length > 0;
      if ((!wasParked || wasTraffic) && witness) addWanted(w, 1, 'steal');
      audio.engine(0, true);
      announce(`Driving the ${car.paint.name}.`);
    }
  }
  // Start a mission at the garage.
  if (input.pressed('KeyN') && ms.stage !== 'active') {
    const g = city.places.garage;
    if (Math.hypot(p.x - g.x, p.y - g.y) < 160) {
      startMission(w, ms);
      audio.unlock();
    } else {
      ms.message = 'Missions start at the garage — follow the yellow marker.';
      ms.messageT = 3;
    }
  }
  // Repair at the hardware store (on foot, cheap) or buy ammo.
  if (input.pressed('KeyR')) {
    const h = city.places.hardware;
    if (Math.hypot(p.x - h.x, p.y - h.y) < 120 && p.cash >= 40) {
      p.cash -= 40;
      p.ammo += 24;
      audio.pickup();
      ms.message = 'Bought a box of pistol ammo — $40.';
      ms.messageT = 3;
    }
  }
}

/** Player controls: driving. */
function stepPlayerInCar(dt) {
  const p = w.player;
  const car = p.inCar;
  const up = input.down('KeyW', 'ArrowUp');
  const down = input.down('KeyS', 'ArrowDown');
  const left = input.down('KeyA', 'ArrowLeft');
  const right = input.down('KeyD', 'ArrowRight');
  const ctrl = {
    throttle: up ? 1 : down ? -1 : 0,
    brake: input.down('Space'),
    steer: (left ? -1 : 0) + (right ? 1 : 0),
  };
  const prevSpeed = car.speed;
  driveCar(w, car, ctrl, dt, true);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  audio.engine(Math.abs(car.speed) / CAR.maxSpeed, true);
  // Crash into a ped (once per ped per second, so a shove doesn't retrigger).
  for (const ped of w.peds) {
    ped.hitCd = Math.max(0, (ped.hitCd || 0) - dt);
    if (Math.abs(car.speed) > 120 && Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && ped.hitCd <= 0) {
      ped.hitCd = 1;
      ped.fleeT = 4;
      ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
      ped.x += Math.cos(ped.angle) * 30;
      ped.y += Math.sin(ped.angle) * 30;
      addWanted(w, 1, 'hit-ped');
      audio.crash(0.6);
      car.speed *= 0.6;
    }
  }
  // Crash into another car (once per 0.4s per car).
  car._crashCd = Math.max(0, (car._crashCd || 0) - dt);
  for (const o of [...w.cars, ...w.traffic, ...w.police.filter((c) => c.kind === 'car')]) {
    if (o === car || o === p.inCar) continue;
    const d = Math.hypot(o.x - car.x, o.y - car.y);
    if (d < 48 && Math.abs(car.speed) > 60 && car._crashCd <= 0) {
      car._crashCd = 0.4;
      o.speed = (o.speed || 0) * 0.5;
      car.speed *= 0.55;
      car.health -= 6;
      if (o.health !== undefined) o.health = Math.max(0, o.health - 6);
      spawnParticles(w, car.x, car.y, 8, '#ffb84b', 140, 0.4);
      audio.crash(0.5);
    }
  }
  if (Math.abs(prevSpeed - car.speed) > 200) audio.crash(0.4);
  // Exit the car.
  if (input.pressed('KeyE')) {
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    car.speed = 0;
    car.parked = true;
    p.inCar = null;
    audio.engine(0, false);
  }
  // Repair at the garage while driving (costs by damage).
  if (input.pressed('KeyR')) {
    const g = city.places.garage;
    if (Math.hypot(car.x - g.x, car.y - g.y) < 120 && car.health < CAR.maxHealth) {
      const cost = Math.ceil((CAR.maxHealth - car.health) * 0.8);
      if (p.cash >= cost) {
        p.cash -= cost;
        car.health = CAR.maxHealth;
        audio.pickup();
        ms.message = `Garage patched the ${car.paint.name} — $${cost}.`;
        ms.messageT = 3;
      }
    }
  }
}

function stepPlaying(dt) {
  const p = w.player;
  if (p.inCar) stepPlayerInCar(dt);
  else stepPlayerOnFoot(dt);
  stepWorld(w, dt, audio);
  updateMissions(w, ms, dt, audio);
  audio.siren(w.wanted > 0);

  // Busted / wasted.
  if (w.bustT >= WANTED.bustTime && w.wanted > 0) {
    respawn(city.places.garage, WANTED.fineFraction);
    audio.busted();
    screen = 'busted';
    return;
  }
  if (p.health <= 0) {
    respawn(city.places.hospital, WANTED.fineFraction);
    audio.busted();
    screen = 'wasted';
    return;
  }
  if (ms.stage === 'done' && ms.index >= MISSIONS.length && screen === 'playing') {
    screen = 'complete';
    saveGame();
    return;
  }
  // Autosave after a mission completes.
  if (ms.stage === 'done') {
    saveGame();
    ms.stage = 'idle';
    ms.target = null;
  }
  saveTimer += dt;
  if (saveTimer > 20) {
    saveTimer = 0;
    saveGame();
  }
  // Camera follows the player (or the car).
  const tx = p.inCar ? p.inCar.x : p.x;
  const ty = p.inCar ? p.inCar.y : p.y;
  camera.x += (tx - camera.x) * Math.min(1, dt * 5);
  camera.y += (ty - camera.y) * Math.min(1, dt * 5);
  camera.x = Math.max(viewW / 2 - 100, Math.min(WORLD.size - viewW / 2 + 100, camera.x));
  camera.y = Math.max(viewH / 2 - 100, Math.min(WORLD.size - viewH / 2 + 100, camera.y));
  if (ui.flash > 0) ui.flash -= dt;
  if (p.hurtCd > 0.4) ui.flash = 0.5;
}

function stepMenu(dt) {
  if (input.pressed('ArrowUp', 'KeyW')) menuSelected = (menuSelected + 2) % 3;
  if (input.pressed('ArrowDown', 'KeyS')) menuSelected = (menuSelected + 1) % 3;
  if (input.pressed('Enter', 'Space')) {
    audio.unlock();
    if (menuSelected === 0) startPlaying(true);
    else if (menuSelected === 1 && ms.hasSave) {
      loadGame();
      startPlaying(false);
    } else if (menuSelected === 2) screen = 'howto';
  }
  if (input.mouse.clicked) {
    // Click a menu row.
    const y = input.mouse.y;
    const idx = Math.floor((y - viewH * 0.74 + 20) / 40);
    if (idx >= 0 && idx < 3) {
      menuSelected = idx;
      audio.unlock();
      if (idx === 0) startPlaying(true);
      else if (idx === 1 && ms.hasSave) {
        loadGame();
        startPlaying(false);
      } else if (idx === 2) screen = 'howto';
    }
  }
}

// Deterministic scenes for the screenshots: ?shot=start|drive|mission|wanted
function applyShot() {
  if (!shot) return;
  if (shot === 'start') {
    screen = 'menu';
    return;
  }
  startPlaying(true);
  if (shot === 'drive') {
    const car = nearestCar(w, 1050, 750, 400) || w.cars[0];
    w.player.inCar = car;
    car.parked = false;
    car.x = 1050;
    car.y = 750;
    car.angle = 0;
    car.speed = 300;
    w.clockHour = 17.6;
    camera.x = car.x;
    camera.y = car.y;
  } else if (shot === 'mission') {
    ms.index = 3;
    startMission(w, ms);
    w.player.x = city.places.docks.x - 200;
    w.player.y = city.places.docks.y;
    w.clockHour = 18.4;
    // Walk into the dockyard so the goons spawn, then freeze the frame.
    for (let i = 0; i < 60; i++) {
      w.player.x += 3;
      updateMissions(w, ms, STEP, null);
      stepWorld(w, STEP, null);
    }
    camera.x = w.player.x;
    camera.y = w.player.y;
  } else if (shot === 'wanted') {
    const car = nearestCar(w, 1350, 1050, 400) || w.cars[0];
    w.player.inCar = car;
    car.parked = false;
    car.x = 1350;
    car.y = 1050;
    car.angle = -Math.PI / 2;
    car.speed = 380;
    addWanted(w, 3, 'shot');
    w.clockHour = 21.0;
    for (let i = 0; i < 240; i++) stepWorld(w, STEP, null);
    camera.x = car.x;
    camera.y = car.y;
  }
  if (shot !== 'start') pausedFromShot = true;
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === 'playing') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepPlaying(STEP);
      acc -= STEP;
      n++;
      if (screen !== 'playing') break;
    }
    if (input.pressed('KeyP', 'Escape')) screen = 'paused';
    if (input.pressed('KeyM')) audio.setMuted(!audio.isMuted());
  } else if (screen === 'menu') {
    stepMenu(dt);
  } else if (screen === 'howto') {
    if (input.pressed('Enter', 'Space', 'Escape') || input.mouse.clicked) screen = 'menu';
  } else if (screen === 'paused') {
    if (input.pressed('KeyP', 'Escape')) screen = 'playing';
    if (input.pressed('KeyM')) audio.setMuted(!audio.isMuted());
  } else if (screen === 'busted' || screen === 'wasted' || screen === 'complete') {
    if (input.pressed('Enter', 'Space')) {
      screen = 'playing';
      saveGame();
    }
  }

  if (screen === 'menu') renderMenu(ctx, 'menu', w, ms, viewW, viewH, menuSelected);
  else if (screen === 'howto') renderMenu(ctx, 'howto', w, ms, viewW, viewH, menuSelected);
  else if (screen === 'paused') {
    render(ctx, w, ms, camera, viewW, viewH, ui);
    renderHUD(ctx, w, ms, viewW, viewH, ui);
    renderMenu(ctx, 'paused', w, ms, viewW, viewH, menuSelected);
  } else if (screen === 'busted') renderMenu(ctx, 'busted', w, ms, viewW, viewH, menuSelected);
  else if (screen === 'wasted') renderMenu(ctx, 'wasted', w, ms, viewW, viewH, menuSelected);
  else if (screen === 'complete') renderMenu(ctx, 'complete', w, ms, viewW, viewH, menuSelected);
  else {
    render(ctx, w, ms, camera, viewW, viewH, ui);
    renderHUD(ctx, w, ms, viewW, viewH, ui);
  }
  input.endFrame();
}

applyShot();
requestAnimationFrame(frame);

// Driver hooks for the screenshot/play-test script.
window.__nb = {
  get screen() {
    return screen;
  },
  get wanted() {
    return w.wanted;
  },
  get cash() {
    return w.player.cash;
  },
  get mission() {
    return ms.stage === 'active' ? MISSIONS[ms.index].id : ms.stage;
  },
  get goons() {
    return w.goons.filter((g) => g.health > 0).length;
  },
  get cars() {
    return w.cars.length + w.traffic.length;
  },
  get peds() {
    return w.peds.length;
  },
  get police() {
    return w.police.length;
  },
  get clockHour() {
    return w.clockHour;
  },
  get player() {
    return { x: w.player.x, y: w.player.y, inCar: !!w.player.inCar, health: w.player.health, ammo: w.player.ammo };
  },
  input,
  startPlaying,
  world: w,
  missions: ms,
};
