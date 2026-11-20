// Neon Bay's renderer: the city, the cars, the people, the HUD and the menus —
// all drawn on one canvas. Day and night are a warm tint over everything plus
// headlights and neon once the sun is down.

import { WORLD, ROADS, CAR, PLAYER, COLORS, DISTRICTS } from './config.js';
import { isSand, isWater, onRoad } from './world.js';
import { MISSIONS, currentMission } from './missions.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Daylight: 0 at night, 1 at noon. Sunrise 06:00, sunset 19:30; the curve stays
 *  bright through the afternoon so golden hour is golden, not black. */
export function daylight(hour) {
  const t = (hour - 6) / 13.5; // 0 at 06:00, 1 at 19:30
  if (t <= 0 || t >= 1) return 0;
  return Math.pow(Math.sin(t * Math.PI), 0.5);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCar(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width, 8);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#101214';
  for (const [wx, wy] of [
    [-16, -CAR.width / 2 + 2],
    [16, -CAR.width / 2 + 2],
    [-16, CAR.width / 2 - 8],
    [16, CAR.width / 2 - 8],
  ]) {
    rr(ctx, wx, wy, 10, 6, 2);
    ctx.fill();
  }
  // Body.
  ctx.fillStyle = car.paint.body;
  rr(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
  ctx.fill();
  // Roof + windows.
  ctx.fillStyle = car.paint.roof;
  rr(ctx, -8, -CAR.width / 2 + 4, 18, CAR.width - 8, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  rr(ctx, 10, -CAR.width / 2 + 5, 8, CAR.width - 10, 3);
  ctx.fill();
  rr(ctx, -12, -CAR.width / 2 + 5, 5, CAR.width - 10, 3);
  ctx.fill();
  // Police livery + light bar.
  if (car.isPolice) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-6, -CAR.width / 2, 12, CAR.width);
    ctx.fillStyle = '#1e4fd8';
    ctx.fillRect(-2, -CAR.width / 2 + 2, 5, 7);
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(-2, CAR.width / 2 - 9, 5, 7);
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2;
    rr(ctx, -CAR.length / 2 - 2, -CAR.width / 2 - 2, CAR.length + 4, CAR.width + 4, 10);
    ctx.stroke();
  }
  // Damage smoke.
  if (car.health < 45 && car.health > 0) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(-CAR.length / 2 + 4, 0, 6 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, isPlayer, isCop) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  // Head + facing.
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 4 + Math.cos(angle + Math.PI / 2) * 2, Math.sin(angle) * 4 + Math.sin(angle + Math.PI / 2) * 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (isCop) {
    ctx.fillStyle = '#1e2a3a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e2a3a';
    ctx.fillRect(-6, -3, 12, 4);
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function render(ctx, w, ms, camera, viewW, viewH, ui) {
  const city = w.city;
  const p = w.player;
  const hour = w.clockHour;
  const day = daylight(hour);
  const night = 1 - day;
  const dusk = clamp(1 - Math.abs(hour - 18.5) / 1.6, 0, 1);

  ctx.save();
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.translate(viewW / 2 - camera.x, viewH / 2 - camera.y);

  const vx0 = camera.x - viewW / 2 - 60;
  const vy0 = camera.y - viewH / 2 - 60;
  const vx1 = camera.x + viewW / 2 + 60;
  const vy1 = camera.y + viewH / 2 + 60;
  const vis = (x, y, r = 0) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

  // Ground: grass, sand, sea.
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(Math.max(vx0, WORLD.beachX), vy0, Math.min(vx1, WORLD.waterX) - Math.max(vx0, WORLD.beachX), vy1 - vy0);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(Math.max(vx0, WORLD.waterX), vy0, vx1 - Math.max(vx0, WORLD.waterX), vy1 - vy0);
  // Animated wave line on the shore.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = Math.max(vy0, 0); y < Math.min(vy1, WORLD.size); y += 26) {
    const x = WORLD.waterX + Math.sin(y * 0.02 + w.time * 1.4) * 6;
    if (y === Math.max(vy0, 0)) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Parks.
  for (const park of city.parks) {
    if (!vis(park.x + park.w / 2, park.y + park.h / 2, park.w)) continue;
    ctx.fillStyle = '#4a7a3a';
    rr(ctx, park.x, park.y, park.w, park.h, 12);
    ctx.fill();
    ctx.fillStyle = '#3a6a2e';
    for (let i = 0; i < park.trees; i++) {
      const tx = park.x + 20 + ((i * 53) % Math.max(40, park.w - 40));
      const ty = park.y + 20 + ((i * 37) % Math.max(40, park.h - 40));
      ctx.beginPath();
      ctx.arc(tx, ty, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads: asphalt, sidewalks, lane dashes.
  ctx.fillStyle = COLORS.sidewalk;
  for (const rx of ROADS.vertical) ctx.fillRect(rx - ROADS.width / 2 - ROADS.sidewalk, vy0, ROADS.width + ROADS.sidewalk * 2, vy1 - vy0);
  for (const ry of ROADS.horizontal) ctx.fillRect(vx0, ry - ROADS.width / 2 - ROADS.sidewalk, vx1 - vx0, ROADS.width + ROADS.sidewalk * 2);
  ctx.fillStyle = COLORS.asphalt;
  for (const rx of ROADS.vertical) ctx.fillRect(rx - ROADS.width / 2, vy0, ROADS.width, vy1 - vy0);
  for (const ry of ROADS.horizontal) ctx.fillRect(vx0, ry - ROADS.width / 2, vx1 - vx0, ROADS.width);
  ctx.strokeStyle = COLORS.lane;
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const rx of ROADS.vertical) {
    ctx.beginPath();
    ctx.moveTo(rx, vy0);
    ctx.lineTo(rx, vy1);
    ctx.stroke();
  }
  for (const ry of ROADS.horizontal) {
    ctx.beginPath();
    ctx.moveTo(vx0, ry);
    ctx.lineTo(vx1, ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings.
  for (const b of city.buildings) {
    if (!vis(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, b.x + 4, b.y + 5, b.w, b.h, 6);
    ctx.fill();
    ctx.fillStyle = b.color;
    rr(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    rr(ctx, b.x + 5, b.y + 5, b.w - 10, Math.min(14, b.h - 10), 4);
    ctx.fill();
    // Roof details: vents / AC boxes.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const n = Math.min(3, b.floors);
    for (let i = 0; i < n; i++) {
      ctx.fillRect(b.x + 10 + i * 22, b.y + b.h / 2 - 6, 12, 12);
    }
    if (b.neon && night > 0.35) {
      ctx.save();
      ctx.shadowColor = b.neon;
      ctx.shadowBlur = 14;
      ctx.fillStyle = b.neon;
      ctx.fillRect(b.x + b.w / 2 - 14, b.y - 2, 28, 5);
      ctx.restore();
    }
  }
  // Neon signs.
  if (night > 0.35) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px sans-serif';
    for (const s of city.signs) {
      if (!vis(s.x, s.y, 40)) continue;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * night;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
    }
  }

  // District labels (faint, on the ground).
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  for (const d of DISTRICTS) {
    if (!vis(d.x + 40, d.y + 40, 100)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillText(d.name, d.x + 24, d.y + 44);
  }

  // Skid marks.
  ctx.strokeStyle = 'rgba(10,10,10,0.4)';
  ctx.lineWidth = 4;
  for (const s of w.skidMarks) {
    if (!vis(s.x, s.y, 30)) continue;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 14, s.y - Math.sin(s.angle) * 14);
    ctx.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14);
    ctx.stroke();
  }

  // Pickups.
  for (const pk of w.pickups) {
    if (!vis(pk.x, pk.y, 30)) continue;
    const bob = Math.sin(pk.bob * 4) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = pk.kind === 'health' ? '#ff5b5b' : '#ffd23e';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', 0, 5);
    ctx.restore();
  }

  // Mission target beacon.
  if (ms.target) {
    const t = ms.target;
    if (vis(t.x, t.y, 80)) {
      const pulse = 1 + Math.sin(w.time * 4) * 0.15;
      ctx.save();
      ctx.translate(t.x, t.y);
      const grad = ctx.createLinearGradient(0, -90, 0, 0);
      grad.addColorStop(0, 'rgba(255,210,62,0)');
      grad.addColorStop(1, 'rgba(255,210,62,0.55)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.lineTo(8, -90 * pulse);
      ctx.lineTo(-8, -90 * pulse);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(0, 0, 10 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Cars: parked, traffic, police, the van.
  for (const c of [...w.cars, ...w.traffic, ...w.police.filter((c) => c.kind === 'car')]) {
    if (!vis(c.x, c.y, 60)) continue;
    drawCar(ctx, c, p.inCar === c);
  }
  // Goons.
  for (const g of w.goons) {
    if (g.health <= 0 || !vis(g.x, g.y, 30)) continue;
    drawPerson(ctx, g.x, g.y, g.angle, '#c93a3a', false, false);
    ctx.fillStyle = '#222';
    ctx.fillRect(g.x - 14, g.y - 24, 28, 5);
    ctx.fillStyle = '#ff4b4b';
    ctx.fillRect(g.x - 14, g.y - 24, 28 * Math.max(0, g.health / 60), 5);
  }
  // Foot police.
  for (const cop of w.police.filter((c) => c.kind === 'foot')) {
    if (!vis(cop.x, cop.y, 30)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1e2a3a', false, true);
  }
  // Pedestrians.
  for (const ped of w.peds) {
    if (!vis(ped.x, ped.y, 20)) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, false, false);
  }
  // Player.
  if (p.inCar) {
    // Headlight cones at night.
    if (night > 0.4) {
      const car = p.inCar;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const grad = ctx.createRadialGradient(30, 0, 10, 30, 0, 260);
      grad.addColorStop(0, `rgba(255,240,180,${0.28 * night})`);
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(26, -8);
      ctx.lineTo(260, -70);
      ctx.lineTo(260, 70);
      ctx.lineTo(26, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    drawPerson(ctx, p.x, p.y, p.angle, '#2e8a4f', true, false);
    // Aim line when the pistol is out.
    if (ui.aiming) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ui.aimX, ui.aimY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // Bullets.
  ctx.fillStyle = '#ffe98a';
  for (const b of w.bullets) {
    ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
  }
  // Particles.
  for (const pt of w.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // Day/night + dusk tint.
  if (night > 0.05) {
    ctx.fillStyle = `rgba(8,12,40,${(night * 0.42).toFixed(3)})`;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }
  if (dusk > 0.05) {
    ctx.fillStyle = `rgba(255,110,40,${(dusk * 0.16).toFixed(3)})`;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  }
  ctx.restore();
}

/** HUD + minimap + banners, drawn in screen space. */
export function renderHUD(ctx, w, ms, viewW, viewH, ui) {
  const p = w.player;
  const hour = w.clockHour;
  const day = daylight(hour);
  const night = 1 - day;

  // Top-left: cash + health.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rr(ctx, 14, 12, 210, 84, 10);
  ctx.fill();
  ctx.fillStyle = '#7cff4f';
  ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 26, 44);
  ctx.fillStyle = '#222';
  rr(ctx, 26, 56, 150, 12, 6);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#7cff4f' : '#ff4b4b';
  rr(ctx, 26, 56, 150 * Math.max(0, p.health / PLAYER.maxHealth), 12, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HEALTH', 26, 84);

  // Top-right: wanted stars + clock.
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < w.wanted ? '★' : '☆';
  ctx.fillStyle = w.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.55)';
  ctx.fillText(stars, viewW - 16, 42);
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  const label = hour < 5.5 || hour >= 21 ? 'NIGHT' : hour < 11 ? 'MORNING' : hour < 16 ? 'DAY' : hour < 19 ? 'DUSK' : 'EVENING';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${label}`, viewW - 16, 66);
  if (p.inCar) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${p.inCar.paint.name}  •  ${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h`, viewW - 16, 88);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`PISTOL ${p.ammo}  •  F punch`, viewW - 16, 88);
  }

  // Minimap (top-right, below the clock): the whole city, scaled.
  const mmSize = 168;
  const mmX = viewW - mmSize - 16;
  const mmY = 100;
  const scale = mmSize / WORLD.size;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, mmX - 4, mmY - 4, mmSize + 8, mmSize + 8, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mmX, mmY, mmSize, mmSize);
  ctx.clip();
  ctx.fillStyle = '#1d3a24';
  ctx.fillRect(mmX, mmY, mmSize, mmSize);
  ctx.fillStyle = '#3a6a8a';
  ctx.fillRect(mmX + WORLD.beachX * scale, mmY, (WORLD.size - WORLD.beachX) * scale, mmSize);
  ctx.fillStyle = '#5a5f66';
  for (const rx of ROADS.vertical) ctx.fillRect(mmX + rx * scale - 1, mmY, 2, mmSize);
  for (const ry of ROADS.horizontal) ctx.fillRect(mmX, mmY + ry * scale - 1, mmSize, 2);
  if (ms.target) {
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(mmX + ms.target.x * scale, mmY + ms.target.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of w.police) {
    ctx.fillStyle = '#4b8aff';
    ctx.beginPath();
    ctx.arc(mmX + cop.x * scale, mmY + cop.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  ctx.fillStyle = '#7cff4f';
  ctx.beginPath();
  ctx.arc(mmX + px * scale, mmY + py * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(mmX + px * scale, mmY + py * scale, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Bottom-left: current objective.
  const m = ms.stage === 'active' ? currentMission(ms) : null;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px sans-serif';
  let objText = '';
  if (ms.stage === 'active' && m) {
    objText = `${m.title} — ${ms.targetLabel || m.brief}`;
    if (m.id === 'package-run') objText += `  •  ${Math.max(0, Math.ceil(ms.timer))}s`;
    if (m.id === 'tail-the-courier') objText += `  •  seen ${Math.floor(ms.tailSeen)}s / 25s`;
    if (m.id === 'the-big-one' && ms.vanStolen) objText += `  •  wanted ${w.wanted}★`;
  } else if (ms.index < MISSIONS.length) {
    objText = 'Next mission: press N near the garage to start — ' + MISSIONS[ms.index].title;
  } else {
    objText = 'Free roam — Neon Bay is yours.';
  }
  const tw = ctx.measureText(objText).width;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, 14, viewH - 52, Math.min(tw + 24, viewW - 28), 36, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(objText, 26, viewH - 29);

  // Message banner.
  if (ms.messageT > 0 && ms.message) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px sans-serif';
    const mw = Math.min(ctx.measureText(ms.message).width + 32, viewW - 40);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    rr(ctx, (viewW - mw) / 2, 96, mw, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(ms.message, viewW / 2, 122);
  }

  // Dialogue subtitle.
  const cur =
    ms.stage === 'active' && ms.dialogueIdx < currentMission(ms).dialogue.length
      ? currentMission(ms).dialogue[ms.dialogueIdx]
      : null;
  if (cur) {
    ctx.textAlign = 'center';
    ctx.font = '16px sans-serif';
    const dw = Math.min(ctx.measureText(cur).width + 32, viewW - 60);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    rr(ctx, (viewW - dw) / 2, viewH - 118, dw, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(cur, viewW / 2, viewH - 95);
  }

  // Controls hint.
  ctx.textAlign = 'right';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('WASD move/drive • E enter car • Click shoot • F punch • P pause • M mute', viewW - 16, viewH - 14);

  // Busted / wasted flash.
  if (ui.flash > 0) {
    ctx.fillStyle = `rgba(180,0,0,${(ui.flash * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  // Low health vignette.
  if (p.health < 30 && !p.inCar) {
    ctx.fillStyle = `rgba(180,0,0,${(0.14 + 0.1 * Math.sin(w.time * 5)).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/** Full-screen menu / pause / busted screens. `kind` selects the layout. */
export function renderMenu(ctx, kind, w, ms, viewW, viewH, selected) {
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, 0, viewW, viewH);
  // Sunset gradient band.
  const grad = ctx.createLinearGradient(0, 0, 0, viewH);
  grad.addColorStop(0, '#1b2a4a');
  grad.addColorStop(0.55, '#c94f2e');
  grad.addColorStop(0.8, '#ff9a3e');
  grad.addColorStop(1, '#1b2a4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, viewH * 0.32, viewW, viewH * 0.36);
  // Sun.
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(viewW / 2, viewH * 0.5, 54, 0, Math.PI * 2);
  ctx.fill();
  // Palm-ish silhouettes.
  ctx.fillStyle = '#0d1526';
  for (const x of [viewW * 0.12, viewW * 0.88]) {
    ctx.fillRect(x - 4, viewH * 0.5, 8, viewH * 0.2);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, viewH * 0.5);
      ctx.lineTo(x + Math.cos(a) * 46, viewH * 0.5 + Math.sin(a) * 30);
      ctx.lineTo(x + Math.cos(a) * 40, viewH * 0.5 + Math.sin(a) * 30 + 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = 24;
  ctx.fillText('NEON BAY', viewW / 2, viewH * 0.3);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('A SUN-SOAKED OPEN-WORLD CRIME STORY', viewW / 2, viewH * 0.3 + 34);

  if (kind === 'menu') {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const story =
      'Rook did the time. His brother didn’t make it out. The crew that took the garage\nstill runs Neon Bay — and Rook is taking it back, one job at a time.';
    for (const [i, line] of story.split('\n').entries()) ctx.fillText(line, viewW / 2, viewH * 0.62 + i * 22);
    const items = [
      { label: 'NEW GAME', enabled: true },
      { label: 'CONTINUE', enabled: !!ms.hasSave },
      { label: 'HOW TO PLAY', enabled: true },
    ];
    ctx.font = 'bold 22px sans-serif';
    items.forEach((it, i) => {
      const y = viewH * 0.74 + i * 40;
      ctx.fillStyle = i === selected ? '#ffd23e' : it.enabled ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.fillText((i === selected ? '▸ ' : '   ') + it.label, viewW / 2, y);
    });
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('WASD / arrows to move and drive • E to enter a car • mouse to aim, click to shoot • F to punch • P to pause', viewW / 2, viewH - 24);
  } else if (kind === 'howto') {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#fff';
    const lines = [
      'WASD / arrows — move on foot, drive in a car',
      'E — enter or exit the nearest car (stealing one in front of a cop raises your wanted level)',
      'Mouse + click — aim and fire the pistol (ammo from Bay Hardware or pickups)',
      'F — punch. N — start the next mission at the garage. P — pause. M — mute.',
      'Wanted stars bring the police: break line of sight to cool off, or get busted and pay the fine.',
      'Save: your progress autosaves after every mission. Continue from the main menu.',
    ];
    lines.forEach((l, i) => ctx.fillText(l, viewW / 2, viewH * 0.6 + i * 26));
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('▸ BACK', viewW / 2, viewH * 0.6 + lines.length * 26 + 30);
  } else if (kind === 'paused') {
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', viewW / 2, viewH * 0.45);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('P / Esc to resume • M to mute • progress autosaves after each mission', viewW / 2, viewH * 0.45 + 40);
  } else if (kind === 'busted') {
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = '#4b8aff';
    ctx.fillText('BUSTED', viewW / 2, viewH * 0.45);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(ms.bustedNote || 'The Neon Bay PD has you. Fine paid, heat gone — back to the garage.', viewW / 2, viewH * 0.45 + 40);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press ENTER to keep playing', viewW / 2, viewH * 0.45 + 90);
  } else if (kind === 'wasted') {
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = '#ff4b4b';
    ctx.fillText('WASTED', viewW / 2, viewH * 0.45);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('St. Marina patched you up. The hospital bill stings — back to the garage.', viewW / 2, viewH * 0.45 + 40);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press ENTER to keep playing', viewW / 2, viewH * 0.45 + 90);
  } else if (kind === 'complete') {
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText('NEON BAY IS YOURS', viewW / 2, viewH * 0.42);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`All five jobs done. Missions: ${w.stats.missionsDone} • Cars stolen: ${w.stats.carsStolen} • Cash: $${w.player.cash}`, viewW / 2, viewH * 0.42 + 40);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Press ENTER to keep cruising in free roam', viewW / 2, viewH * 0.42 + 90);
  }
}
