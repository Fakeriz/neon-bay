// Neon Bay's story and missions. Rook is a driver fresh out of a stint, trying to
// buy back his late brother's garage. Five missions, each a small state machine:
// objectives, a target point, dialogue lines and a payout. The main loop calls
// updateMissions every frame with the player's input context.

import { spawnParticles, spawnPickup, addWanted } from './entities.js';

export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    brief: "Mara needs a driver. Get in the yellow cab by the garage and take her to the Marina Pier. Don't keep her waiting.",
    payout: 150,
    dialogue: [
      "MARA: You Rook? Your brother used to drive me everywhere. Don't scratch his cab.",
      "ROOK: I won't. Marina Pier, right? Hold on.",
    ],
  },
  {
    id: 'package-run',
    title: 'Package Run',
    brief: 'A sealed crate for the Docks, and the buyer pays double if you beat the clock. 90 seconds. Drive like the tide is coming in.',
    payout: 250,
    dialogue: [
      "DISPATCH: Crate's in the trunk. Docks, warehouse 4. Ninety seconds or the price drops.",
      'ROOK: Ninety seconds across town? Fine. Tell the buyer to keep the engine running.',
    ],
  },
  {
    id: 'tail-the-courier',
    title: 'Tail the Courier',
    brief: "Follow the black sedan from the Sunset Motel to its drop. Stay close enough to see it, far enough that he never sees you.",
    payout: 300,
    dialogue: [
      'MARA: That courier carries the ledger for the crew that took your brother’s garage.',
      'ROOK: Then I follow him. Quiet. No sirens, no shortcuts through the crowd.',
    ],
  },
  {
    id: 'dockyard-dustup',
    title: 'Dockyard Dust-up',
    brief: 'The crew guards the ledger at the Docks. Take them down — fists or the pistol, your call — and grab the ledger.',
    payout: 400,
    dialogue: [
      'GOON: Hey! This dock is closed, pal. Walk away.',
      'ROOK: I’m not walking anywhere. That ledger is mine.',
    ],
  },
  {
    id: 'the-big-one',
    title: 'The Big One',
    brief: 'The armored van carries the crew’s cash to the bank at dawn. Lift it, lose the cops, and bring it home to the garage.',
    payout: 900,
    dialogue: [
      'MARA: The van leaves the Docks at first light. Take it and the garage is yours again.',
      'ROOK: For my brother. And when the sirens come — we outrun them.',
    ],
  },
];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Fresh mission state for a new game. */
export function createMissionState() {
  return {
    index: 0,
    stage: 'idle', // idle | active | done
    timer: 0,
    target: null,
    targetLabel: '',
    message: '',
    messageT: 0,
    dialogueIdx: 0,
    dialogueT: 0,
    tailCar: null,
    tailSeen: 0,
    tailLost: 0,
    goonsSpawned: false,
    van: null,
    vanStolen: false,
    completedIds: [],
  };
}

export function currentMission(ms) {
  return MISSIONS[Math.min(ms.index, MISSIONS.length - 1)];
}

export function startMission(w, ms) {
  const m = currentMission(ms);
  const places = w.city.places;
  ms.stage = 'active';
  ms.dialogueIdx = 0;
  ms.dialogueT = 0;
  ms.timer = 0;
  ms.goonsSpawned = false;
  ms.van = null;
  ms.vanStolen = false;
  ms.tailCar = null;
  ms.tailSeen = 0;
  ms.tailLost = 0;
  ms.message = m.title + ' — ' + m.brief;
  ms.messageT = 6;
  if (m.id === 'first-fare') {
    // A yellow cab waits by the garage.
    const cab = w.cars.find((c) => c.paint.name === 'Mustard' && c.parked);
    if (cab) {
      cab.x = places.garage.x + 60;
      cab.y = places.garage.y;
    }
    ms.target = { x: places.marina.x, y: places.marina.y };
    ms.targetLabel = 'Marina Pier';
  } else if (m.id === 'package-run') {
    ms.timer = 90;
    ms.target = { x: places.docks.x, y: places.docks.y };
    ms.targetLabel = 'Neon Docks — Warehouse 4';
  } else if (m.id === 'tail-the-courier') {
    const sedan = w.traffic[0];
    ms.tailCar = sedan;
    sedan.x = places.motel.x;
    sedan.y = places.motel.y;
    sedan.paint = { name: 'Midnight', body: '#14161c', roof: '#14161c' };
    ms.target = { x: sedan.x, y: sedan.y };
    ms.targetLabel = 'Tail the black sedan';
    ms.tailSeen = 0;
    ms.tailLost = 0;
  } else if (m.id === 'dockyard-dustup') {
    ms.target = { x: places.docks.x, y: places.docks.y };
    ms.targetLabel = 'Neon Docks';
  } else if (m.id === 'the-big-one') {
    const van = {
      id: 900,
      x: places.docks.x + 40,
      y: places.docks.y - 60,
      angle: 0,
      speed: 0,
      health: 200,
      paint: { name: 'Armored', body: '#3a3f46', roof: '#2a2e33' },
      parked: true,
      isPolice: false,
      driver: null,
      skid: 0,
      isVan: true,
    };
    w.cars.push(van);
    ms.van = van;
    ms.target = { x: van.x, y: van.y };
    ms.targetLabel = 'Steal the armored van';
  }
}

function completeMission(w, ms, audio) {
  const m = currentMission(ms);
  w.player.cash += m.payout;
  w.stats.missionsDone++;
  ms.completedIds.push(m.id);
  ms.stage = 'done';
  ms.message = `Mission complete: ${m.title} — +$${m.payout}`;
  ms.messageT = 5;
  ms.target = null;
  if (audio) audio.mission();
  spawnParticles(w, w.player.x, w.player.y, 24, '#ffd23e', 200, 0.8);
  spawnPickup(w, 'health', w.player.x + 30, w.player.y);
  ms.index++;
  if (ms.index >= MISSIONS.length) {
    ms.message = 'All missions complete — Neon Bay is yours, Rook. Free roam: keep the city, keep the cash.';
    ms.messageT = 8;
  }
}

export function updateMissions(w, ms, dt, audio) {
  if (ms.messageT > 0) ms.messageT -= dt;
  if (ms.stage !== 'active') return;
  const m = currentMission(ms);
  const p = w.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;

  // Dialogue lines roll across the bottom, one at a time.
  if (ms.dialogueIdx < m.dialogue.length) {
    ms.dialogueT += dt;
    if (ms.dialogueT > 4.2) {
      ms.dialogueIdx++;
      ms.dialogueT = 0;
    }
  }

  if (m.id === 'first-fare') {
    if (p.inCar && dist({ x: px, y: py }, ms.target) < 70) completeMission(w, ms, audio);
  } else if (m.id === 'package-run') {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      ms.stage = 'idle';
      ms.message = 'Too slow — the buyer walked. Talk to Mara at the garage to try again.';
      ms.messageT = 6;
      ms.target = null;
      return;
    }
    if (p.inCar && dist({ x: px, y: py }, ms.target) < 70) completeMission(w, ms, audio);
  } else if (m.id === 'tail-the-courier') {
    const car = ms.tailCar;
    if (!car) return;
    ms.target = { x: car.x, y: car.y };
    const d = dist({ x: px, y: py }, car);
    if (d < 420) {
      ms.tailSeen += dt;
      ms.tailLost = 0;
    } else {
      ms.tailLost += dt;
      ms.tailSeen = Math.max(0, ms.tailSeen - dt);
    }
    if (d < 60) {
      ms.stage = 'idle';
      ms.message = 'Spotted! The courier burned rubber and vanished. Try again from the garage.';
      ms.messageT = 6;
      ms.target = null;
      return;
    }
    if (ms.tailLost > 8) {
      ms.stage = 'idle';
      ms.message = 'Lost him. The sedan slipped away in the traffic. Try again from the garage.';
      ms.messageT = 6;
      ms.target = null;
      return;
    }
    if (ms.tailSeen > 25) completeMission(w, ms, audio);
  } else if (m.id === 'dockyard-dustup') {
    if (!ms.goonsSpawned && dist({ x: px, y: py }, ms.target) < 420) {
      ms.goonsSpawned = true;
      for (let i = 0; i < 5; i++) {
        w.goons.push({
          x: ms.target.x + w.rng.range(-120, 120),
          y: ms.target.y + w.rng.range(-120, 120),
          angle: 0,
          health: 60,
          shootCd: w.rng.range(0.5, 1.5),
          deathT: 0,
        });
      }
      ms.message = 'Five of them, guarding the ledger. Take them all down.';
      ms.messageT = 5;
    }
    if (ms.goonsSpawned && w.goons.filter((g) => g.health > 0).length === 0) {
      // The ledger drops at the dock.
      completeMission(w, ms, audio);
    }
  } else if (m.id === 'the-big-one') {
    const van = ms.van;
    if (!van) return;
    if (!ms.vanStolen && p.inCar === van) {
      ms.vanStolen = true;
      addWanted(w, 3, 'heist');
      ms.target = { x: w.city.places.garage.x, y: w.city.places.garage.y };
      ms.targetLabel = 'Lose the cops — reach the garage';
      ms.message = 'The van is yours. Three stars and counting — lose them and bring it home.';
      ms.messageT = 6;
    }
    if (ms.vanStolen && p.inCar === van && dist({ x: px, y: py }, w.city.places.garage) < 80 && w.wanted === 0) {
      completeMission(w, ms, audio);
    }
    if (ms.vanStolen && p.inCar === van && w.wanted > 0) {
      ms.targetLabel = `Lose the cops (${w.wanted}★) — then reach the garage`;
    }
  }
}
