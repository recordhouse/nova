"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const soundCalls = [];
  const ctx = { setTransform() {} };
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game"
      ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    playGunHitSound: () => soundCalls.push("gun_hit"),
    playMetalHitSound: () => soundCalls.push("metal"),
    playMonsterDie01Sound: () => soundCalls.push("monster_die_01"),
    playMonsterDie04Sound: () => soundCalls.push("monster_die_04"),
    playShieldSound: () => soundCalls.push("shield"),
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    globalThis.fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:600,direction:1};
    platforms.push(fixtureRoad);
    cameraX=0; cameraY=0;
  `, scope);
  return { scope, soundCalls };
}

function hitEnemy(scope, kind, x, lethal = false) {
  vm.runInContext(`
    enemies.length=0; turrets.length=0; bullets.length=0;
    globalThis.target=addEnemy(fixtureRoad,${x},'${kind}');
    if (${lethal}) target.hp=1;
    globalThis.targetBox=getEnemyHitbox(target);
    bullets.push({kind:'player-bullet',x:targetBox.x+targetBox.width/2,
      y:targetBox.y+targetBox.height/2,vx:0,vy:0,radius:4,ricochets:0});
  `, scope);
  scope.updateBullets(0);
}

test("organic and metal targets play their matching bullet-hit sounds", () => {
  const { scope, soundCalls } = createGame();
  hitEnemy(scope, "monster1", 200);
  hitEnemy(scope, "monster2", 500);
  hitEnemy(scope, "monster3", 800);
  hitEnemy(scope, "monster4", 950);

  vm.runInContext(`
    enemies.length=0; turrets.length=0; bullets.length=0;
    addTurret(fixtureRoad,1100);
    const turret=turrets[0];
    bullets.push({kind:'player-bullet',x:turret.x+turret.width/2,
      y:turret.y+turret.height/2,vx:0,vy:0,radius:4,ricochets:0});
  `, scope);
  scope.updateBullets(0);

  assert.deepEqual(soundCalls, ["gun_hit", "gun_hit", "metal", "gun_hit", "metal"]);
});

test("monster death sound plays only for lethal hits on organic monsters", () => {
  const { scope, soundCalls } = createGame();
  hitEnemy(scope, "monster1", 200, true);
  hitEnemy(scope, "monster2", 500, true);
  hitEnemy(scope, "monster3", 800, true);
  hitEnemy(scope, "monster4", 950, true);

  assert.deepEqual(soundCalls, [
    "gun_hit", "monster_die_01",
    "gun_hit", "monster_die_01",
    "metal",
    "gun_hit", "monster_die_01",
  ]);
});

test("crimson monster1 explosions use monster_die_04 once per death, including chains", () => {
  const { scope, soundCalls } = createGame();
  vm.runInContext(`
    globalThis.first=addEnemy(fixtureRoad,200,'monster1',{crimsonVariant:true});
    globalThis.second=addEnemy(fixtureRoad,400,'monster1',{crimsonVariant:true});
    first.hp=1; second.hp=1;
  `, scope);

  assert.equal(scope.resolveEnemyDeath(scope.first, true), true);
  assert.equal(scope.first.alive, false);
  assert.equal(scope.second.alive, false);
  assert.deepEqual(soundCalls, ["monster_die_04", "monster_die_04"]);
  assert.equal(scope.resolveEnemyDeath(scope.first, true), false);
  assert.deepEqual(soundCalls, ["monster_die_04", "monster_die_04"]);
});

test("each broken shield stage uses the dedicated sound, independent of ram damage", () => {
  const { scope, soundCalls } = createGame();
  vm.runInContext(`
    player.accelerationShieldStage=2;
    player.accelerationShieldCharges=2;
    player.accelerationShieldVisual=2;
    globalThis.organic=addEnemy(fixtureRoad,200,'monster1');
    globalThis.metallic=addEnemy(fixtureRoad,500,'monster3');
  `, scope);

  assert.equal(scope.takePlayerDamage(1, { kind: "monster1", x: 50, y: 500 }), true);
  vm.runInContext("player.accelerationShieldBlockTimer=0", scope);
  assert.equal(scope.takePlayerDamage(1, { kind: "monster3-laser", x: 50, y: 500 }), true);
  assert.deepEqual(soundCalls, ["shield", "shield"]);

  assert.equal(scope.damageEnemyWithPlayerShieldRam(scope.organic, 1), true);
  assert.equal(scope.damageEnemyWithPlayerShieldRam(scope.metallic, -1), true);
  assert.deepEqual(soundCalls, ["shield", "shield"]);
});
