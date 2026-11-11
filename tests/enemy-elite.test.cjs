"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function createGame() {
  let seed = 3092026;
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
      innerWidth: 1280,
      innerHeight: 720,
      matchMedia: () => ({ matches: true }),
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "player", "enemies"]) {
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  return scope;
}

test("elite strength is one tier above the regular monster", () => {
  const game = createGame();
  const result = vm.runInContext(`(() => {
    enemies.length = 0;
    platforms.length = 0;
    const road = {
      id: 9001, kind: "flat", start: 0, end: 5000, y: 600,
      direction: 1, group: 20, routeRole: "main", enemyEliteChance: 1,
    };
    platforms.push(road);
    const regular = addEnemy(road, 300, "monster2", { eliteVariant: false });
    const elite = addEnemy(road, 1200, "monster2", { eliteVariant: true });
    const flyer = addEnemy(road, 2200, "monster3", { eliteVariant: true });
    return {
      regular: {
        hp: regular.maxHp,
        speed: regular.speed,
        cooldown: regular.attackCooldown,
        shots: regular.fireballCount,
      },
      elite: {
        hp: elite.maxHp,
        speed: elite.speed,
        cooldown: elite.attackCooldown,
        shots: elite.fireballCount,
        score: elite.score,
      },
      flyer: {
        hp: flyer.maxHp,
        laserSpeed: flyer.laserSpeed,
        cooldownMin: flyer.attackCooldownMin,
      },
    };
  })()`, game);

  assert.equal(result.regular.hp, 10);
  assert.equal(result.regular.speed, 76);
  assert.equal(result.regular.cooldown, 2.4);
  assert.equal(result.regular.shots, 5);
  assert.equal(result.elite.hp, 15);
  assert.ok(result.elite.speed > result.regular.speed);
  assert.ok(result.elite.cooldown < result.regular.cooldown);
  assert.equal(result.elite.shots, 6);
  assert.equal(result.elite.score, 450);
  assert.equal(result.flyer.hp, 8);
  assert.ok(result.flyer.laserSpeed > 700);
  assert.ok(result.flyer.cooldownMin < 2.7);
});

test("elite strength starts at a fixed distance from spawn, independent of the boss door", () => {
  const game = createGame();
  const result = vm.runInContext(`(() => {
    enemies.length=0;
    platforms.length=0;
    const start={
      id:1,kind:'flat',start:-200,end:900,y:600,direction:1,
      group:0,routeRole:'main',startingRoad:true,
    };
    const nearBossDoor={
      id:2,kind:'flat',start:9000,end:9800,y:600,direction:1,
      group:99,routeRole:'main',
    };
    const farFromSpawn={
      id:3,kind:'flat',
      start:ENEMY_ELITE_START_DISTANCE+1200,
      end:ENEMY_ELITE_START_DISTANCE+2000,
      y:600,direction:1,group:1,routeRole:'main',
    };
    platforms.push(start,nearBossDoor,farFromSpawn);
    bossDoor={centerX:9400,width:126,height:184,direction:1,platform:nearBossDoor};
    assignEnemyEliteStrengthByStartDistance();
    const nearEnemy=addEnemy(nearBossDoor,9200,'monster2');
    const farEnemy=addEnemy(farFromSpawn,farFromSpawn.start+100,'monster2');
    return {
      threshold:ENEMY_ELITE_START_DISTANCE,
      nearDistance:nearBossDoor.enemyDistanceFromStart,
      farDistance:farFromSpawn.enemyDistanceFromStart,
      nearChance:nearBossDoor.enemyEliteChance,
      farChance:farFromSpawn.enemyEliteChance,
      bossDoorChance:bossDoor.platform.enemyEliteChance,
      nearElite:nearEnemy.eliteVariant,
      farElite:farEnemy.eliteVariant,
    };
  })()`, game);

  assert.ok(result.nearDistance < result.threshold);
  assert.ok(result.farDistance > result.threshold);
  assert.equal(result.nearChance, 0);
  assert.equal(result.farChance, 1);
  assert.equal(result.bossDoorChance, 0,
    "placing the boss door nearby must not strengthen that area");
  assert.equal(result.nearElite, false);
  assert.equal(result.farElite, true);
});

test("all five optimized elite sprites are present and wired into loading", () => {
  const assetsSource = fs.readFileSync(path.join(root, "js/assets.js"), "utf8");
  for (let number = 1; number <= 5; number += 1) {
    const suffix = String(number).padStart(2, "0");
    const filename = `monster_${suffix}_elite.png`;
    const png = fs.readFileSync(path.join(root, "assets/images/monsters", filename));
    assert.ok(png.readUInt32BE(16) <= 512, `${filename} width should be mobile-friendly`);
    assert.ok(png.readUInt32BE(20) <= 512, `${filename} height should be mobile-friendly`);
    assert.match(assetsSource, new RegExp(filename.replace(".", "\\.")));
  }
});
