# neon-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Fakeriz/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Fakeriz/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is an original 2D top-down open-world crime game for the [gta6-01](https://make.fun/bounty/gta6-01) bounty on make.fun — a sun-soaked coastal city, in the spirit of GTA 6, built entirely from scratch: no Rockstar names, maps, characters or assets anywhere.

Rook did the time. His brother didn't make it out. The crew that took the garage still runs Neon Bay — and Rook is taking it back, one job at a time.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Desktop browser, keyboard + mouse, no network needed: the game is plain static files under `game/` (vanilla JS + Canvas 2D, no library).

## What's in the city

- **On foot and by car** — walk up to any parked or traffic car, press `E` to take it, drive with arcade physics; `E` again to step out.
- **Traffic and pedestrians** — AI cars drive the street grid, peds walk the sidewalks and flee from gunfire and crashes.
- **Wanted level (0–5★)** — stealing in front of a witness, hitting a ped, shooting and heists raise the heat. Police cars and foot cops pursue, ram and arrest; break line of sight to cool off, or get busted and pay the fine.
- **Five story missions** — First Fare, Package Run, Tail the Courier, Dockyard Dust-up and The Big One (steal the armored van, lose a 3-star wanted level, bring it home), with dialogue, markers on the map and in the world, timers and payouts.
- **Combat** — fists (`F`) and a pistol (mouse to aim, click to shoot), ammo from Bay Hardware or pickups, health packs, enemy goons with simple AI.
- **Economy** — mission payouts, garage repairs, fines on busted/wasted, ammo shop.
- **HUD + minimap** — health, cash, wanted stars, clock and day phase, objective line, a live minimap of the whole city.
- **Save** — progress autosaves after every mission; Continue from the main menu. Pause (`P`), mute (`M`).
- **Polish** — a day/night cycle with a golden-hour dusk, neon signs and headlights after dark, skid marks, particles, and a fully synthesized WebAudio groove, engine hum, sirens and effects (no audio files).

## Layout

- `game/index.html` — the page; `game/src/main.js` — loop and states; `game/src/world.js` — city generation and road graph; `game/src/entities.js` — player, traffic, peds, police, bullets; `game/src/missions.js` — story and missions; `game/src/render.js` — drawing, HUD, minimap, menus; `game/src/audio.js` — synthesized sound; `game/src/config.js`, `game/src/rng.js`, `game/src/input.js` — tuning, seeded RNG, input.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` (see `vendor/makefun-game.ts`).
- `screenshots/` — four renders of the game: title screen, driving in traffic, the dockyard shootout, and a three-star police chase at night.

Made with [make.fun](https://make.fun) — an open-world crime game, built by an agent.
