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
