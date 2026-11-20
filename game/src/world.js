// Neon Bay's city: a street grid, four districts, a beach and the sea on the east
// edge. Generated once from a seed, then read-only. Also owns the road graph that
// traffic and police drive on, and the collision helpers for buildings and water.

import { WORLD, ROADS, COLORS, DISTRICTS } from './config.js';
import { makeRng } from './rng.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function onRoad(x, y) {
  const half = ROADS.width / 2;
  for (const rx of ROADS.vertical) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROADS.horizontal) if (Math.abs(y - ry) <= half) return true;
  return false;
}

function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  return DISTRICTS[1];
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const signs = [];
  const parkedSpots = [];

  const v = ROADS.vertical;
  const h = ROADS.horizontal;
  // Blocks are the cells between neighbouring road centre lines. The beach strip
  // (east of the last road) holds sand, a boardwalk and no buildings.
  for (let bi = 0; bi < v.length - 1; bi++) {
    for (let bj = 0; bj < h.length - 1; bj++) {
      const x0 = v[bi] + ROADS.width / 2 + ROADS.sidewalk + 8;
      const x1 = v[bi + 1] - ROADS.width / 2 - ROADS.sidewalk - 8;
      const y0 = h[bj] + ROADS.width / 2 + ROADS.sidewalk + 8;
      const y1 = h[bj + 1] - ROADS.width / 2 - ROADS.sidewalk - 8;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (rng.chance(0.16)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: rng.int(4, 9) });
        continue;
      }
      const split = rng.chance(0.55);
      const lots = split
        ? [
            { x: x0, y: y0, w: (x1 - x0) / 2 - 6, h: y1 - y0 },
            { x: x0 + (x1 - x0) / 2 + 6, y: y0, w: (x1 - x0) / 2 - 6, h: y1 - y0 },
          ]
        : [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
      for (const lot of lots) {
        const pad = rng.range(6, 18);
        const b = {
          x: lot.x + pad,
          y: lot.y + pad,
          w: lot.w - pad * 2,
          h: lot.h - pad * 2,
          color: rng.pick(COLORS.buildingRoof),
          floors: rng.int(1, 5),
          district: district.name,
          neon: rng.chance(0.3) ? rng.pick(COLORS.neon) : null,
        };
        if (b.w > 40 && b.h > 40) {
          buildings.push(b);
          if (b.neon) signs.push({ x: b.x + b.w / 2, y: b.y + 4, color: b.neon, text: rng.pick(['BAR', '24H', 'HOTEL', 'PIER', 'CLUB', 'CAFE', 'MOTEL', 'TACO']) });
        }
      }
    }
  }

  // Parked cars: spots along the roads, on the asphalt edge.
  for (let i = 0; i < 26; i++) {
    const vertical = rng.chance(0.5);
    const road = rng.pick(vertical ? v : h);
    const along = rng.range(220, WORLD.size - 220);
    const side = rng.chance(0.5) ? -1 : 1;
    const x = vertical ? road + side * (ROADS.width / 2 - 12) : along;
    const y = vertical ? along : road + side * (ROADS.width / 2 - 12);
    if (x > WORLD.beachX - 40 || onRoad(x, y) === false) continue;
    parkedSpots.push({ x, y, angle: vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI });
  }

  // Named places the missions and the HUD point at.
  const places = {
    garage: { x: 1050, y: 1350, name: "Rook's Garage" },
    hospital: { x: 450, y: 450, name: 'St. Marina Hospital' },
    docks: { x: 1650, y: 1950, name: 'Neon Docks' },
    marina: { x: 1950, y: 450, name: 'Marina Pier' },
    hardware: { x: 750, y: 1050, name: 'Bay Hardware' },
    motel: { x: 1350, y: 750, name: 'Sunset Motel' },
  };

  return {
    seed,
    buildings,
    parks,
    signs,
    parkedSpots,
    places,
    roads: ROADS,
    /** Road graph nodes: every intersection, with the roads it joins. */
    nodes: (() => {
      const nodes = [];
      for (const x of v) for (const y of h) nodes.push({ x, y });
      return nodes;
    })(),
  };
}

/** The nearest intersection to a point. */
export function nearestNode(city, x, y) {
  let best = city.nodes[0];
  let bd = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Pick a neighbouring intersection of `node` (never the one we came from). */
export function nextNode(city, node, from, rng) {
  const opts = city.nodes.filter(
    (n) =>
      n !== node &&
      ((n.x === node.x && Math.abs(n.y - node.y) === 300) || (n.y === node.y && Math.abs(n.x - node.x) === 300)) &&
      n !== from,
  );
  if (!opts.length) return from;
  return rng.pick(opts);
}

export function isWater(x, y) {
  return x >= WORLD.waterX || x < 0 || y < 0 || x > WORLD.size || y > WORLD.size;
}

export function isSand(x, y) {
  return x >= WORLD.beachX && x < WORLD.waterX;
}

/** Push a circle out of every building it overlaps. Returns true if it hit. */
export function collideCircleBuildings(city, p, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        p.y = b.y - r;
      }
    }
  }
  return hit;
}

/** Push an oriented rectangle (a car) out of buildings. Returns true if it hit. */
export function collideCarBuildings(city, car, halfLen, halfWid) {
  // Test the car's four corners as small circles; good enough for arcade driving.
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let hit = false;
  for (const [lx, ly] of [
    [halfLen, halfWid],
    [halfLen, -halfWid],
    [-halfLen, halfWid],
    [-halfLen, -halfWid],
  ]) {
    const p = { x: car.x + lx * cos - ly * sin, y: car.y + lx * sin + ly * cos };
    if (collideCircleBuildings(city, p, 10)) hit = true;
  }
  return hit;
}

export { onRoad, districtAt };
