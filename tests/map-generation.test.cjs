"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(landscape = false) {
  let seed = 918273;
  const math = Object.create(Math);
  math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const canvas = { getContext: () => ({ setTransform() {} }) };
  const scope = {
    Math: math,
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: {
      location: { search: "" },
      innerWidth: landscape ? 1280 : 720,
      innerHeight: landscape ? 720 : 1280,
      matchMedia: () => ({ matches: landscape }),
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "player", "enemies"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8");
    vm.runInContext(source, scope, { filename: `${name}.js` });
  }
  return scope;
}

// Independent convex-polygon check: includes ramp bodies and triangle undersides.
function polygonsOverlap(first, second) {
  for (const polygon of [first, second]) {
    for (let edge = 0; edge < polygon.length; edge += 1) {
      const start = polygon[edge];
      const end = polygon[(edge + 1) % polygon.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      const project = (points) => points.map((point) => (point.x * -dy + point.y * dx) / length);
      const a = project(first);
      const b = project(second);
      if (
        Math.max(...a) <= Math.min(...b) + 0.01 ||
        Math.max(...b) <= Math.min(...a) + 0.01
      ) return false;
    }
  }
  return true;
}

function validateMap(game) {
  const data = vm.runInContext(`(() => ({
    seed: mapSeed,
    roads: platforms.map((platform) => {
      const leftY = platformSurfaceY(platform, platform.start);
      const rightY = platformSurfaceY(platform, platform.end);
      const points = isInvertedTrianglePlatform(platform)
        ? [{x:platform.start,y:leftY}, {x:platform.end,y:rightY},
          {x:(platform.start+platform.end)/2,y:platform.y+invertedTrianglePlatformDepth(platform)}]
        : [{x:platform.start,y:leftY}, {x:platform.end,y:rightY},
          {x:platform.end,y:rightY+PLATFORM_DECK_THICKNESS},
          {x:platform.start,y:leftY+PLATFORM_DECK_THICKNESS}];
      return {id:platform.id, group:platform.group, role:platform.routeRole, points,
        start:platform.start, end:platform.end,
        entryY:platformSurfaceY(platform,platform.entryX),
        exitY:platformSurfaceY(platform,platform.exitX)};
    }),
    gate: bossDoor?.platform?.id,
    goal: goalPlatform?.id,
    farthest: farthestBossGatePlacement(110+player.width/2,
      platformSurfaceY(platforms.find(p=>p.startingRoad),110+player.width/2))?.platform?.id,
    unsafeEnemies: enemies.filter(enemy => stageSpawnIsInStartSafeZone(
      enemy.platform, enemy.x, MONSTER_TYPES[enemy.kind])).length,
    unsafeTurrets: turrets.filter(turret => stageSpawnIsInStartSafeZone(
      turret.platform, turret.x, TURRET)).length,
    routeIds: branches.flatMap(b=>b.routes.flatMap(r=>r.platforms??[])),
    reversals: branches.filter(b=>b.flowTransition?.horizontal==='reverse').length,
    connectionLimit: MAIN_PATH_MAX_CONNECTION_HEIGHT,
  }))()`, game);
  const ids = new Set(data.roads.map((road) => road.id));
  assert.ok(ids.has(data.gate), "boss gate must remain on an existing road");
  assert.equal(data.gate, data.goal);
  assert.equal(data.gate, data.farthest);
  assert.equal(data.unsafeEnemies, 0, "the player start must be clear of monsters");
  assert.equal(data.unsafeTurrets, 0, "the player start must be clear of turrets");
  for (const id of data.routeIds) assert.ok(ids.has(id), "route metadata must not contain removed roads");
  for (let first = 0; first < data.roads.length; first += 1) {
    for (let second = first + 1; second < data.roads.length; second += 1) {
      const a = data.roads[first];
      const b = data.roads[second];
      if (a.end <= b.start + 0.01 || b.end <= a.start + 0.01) continue;
      assert.equal(polygonsOverlap(a.points, b.points), false,
        `seed ${data.seed}: road ${a.id} overlaps road ${b.id}`);
    }
  }
  const groups = new Map();
  for (const road of data.roads.filter((road) => road.role !== "sub")) {
    if (!groups.has(road.group)) groups.set(road.group, []);
    groups.get(road.group).push(road);
  }
  let previous = null;
  for (const roads of groups.values()) {
    if (previous) assert.ok(Math.abs(roads[0].entryY - previous.exitY) <= data.connectionLimit + 0.01,
      `seed ${data.seed}: unreachable group connection`);
    previous = roads[roads.length - 1];
  }
  return data;
}

test("road conflict geometry preserves joins and handles crossing slopes and triangles", () => {
  const game = createGame();
  game.assert = assert;
  vm.runInContext(`(() => {
    const flat=(start,end,y)=>({kind:'flat',start,end,entryX:start,exitX:end,y});
    const ramp=(entryX,exitX,entryY,exitY)=>({kind:'ramp',entryX,exitX,entryY,exitY,
      start:Math.min(entryX,exitX),end:Math.max(entryX,exitX),y:Math.min(entryY,exitY)});
    assert.equal(platformBodiesConflict(flat(0,100,0),flat(100,200,0),0,0),false);
    assert.equal(platformBodiesConflict(flat(0,100,0),flat(50,150,8),0,0),true);
    assert.equal(platformBodiesConflict(flat(0,100,0),flat(0,100,60)),false);
    assert.equal(platformBodiesConflict(flat(0,100,0),flat(0,100,24)),true);
    assert.equal(platformBodiesConflict(ramp(0,100,0,100),ramp(0,100,100,0),0,0),true);
    assert.equal(platformBodiesConflict(ramp(0,100,0,100),ramp(0,100,50,150),0,0),false);
    assert.equal(platformBodiesConflict(ramp(100,0,100,0),flat(40,60,50),0,0),true);
    const triangle={...flat(0,100,0),isJumpPad:true,trick:'horizontal-jump',jumpPadTriangleAngle:60};
    assert.equal(platformBodiesConflict(triangle,flat(40,60,60),0,0),true);
    assert.equal(platformBodiesConflict(triangle,flat(0,10,60),0,0),false);
    assert.equal(platformBodiesConflict(flat(0,100,0),flat(0,100,0),-100,0),false);
  })()`, game);
});

const mapCount = Number(process.env.NOVA_MAP_TEST_COUNT ?? 200);
for (const landscape of [false, true]) {
  test(`${mapCount} random ${landscape ? "landscape" : "portrait"} maps have no overlapping roads`, () => {
    const game = createGame(landscape);
    let reversals = 0;
    for (let map = 0; map < mapCount; map += 1) {
      vm.runInContext("resetGame()", game);
      reversals += validateMap(game).reversals;
    }
    assert.ok(reversals > 0, "normal maps must retain random left/right reversals");
  });
}

test("bounded fallback also produces clear roads and valid boss placement", () => {
  const game = createGame();
  for (let map = 0; map < 20; map += 1) {
    assert.equal(vm.runInContext("generateMapCandidate(true)", game), true);
    assert.equal(validateMap(game).reversals, 0);
  }
  vm.runInContext("generateMapCandidate = (() => { const original=generateMapCandidate; return safe => safe ? original(true) : false; })()", game);
  vm.runInContext("resetGame()", game);
  validateMap(game);
});
