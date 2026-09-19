"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const ctx = new Proxy({}, { get: () => () => {} });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500,direction:1};
    platforms.push(fixtureRoad);
    addTurret(fixtureRoad,400);
    globalThis.fixtureTurret=turrets[0];
    player.x=10000;
  `, scope);
  return scope;
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("turrets fire a timed five-shot burst without a nearby player, then repeat", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(read(scope, "enemyBullets.length"), 1);
  assert.equal(read(scope, "enemyBullets[0].kind"), "turret-laser");
  assert.ok(read(scope, "enemyBullets[0].vx") < 0, "distant shots follow the turret's facing");
  assert.equal(turret.active, true);
  assert.equal(turret.burstShotsRemaining, 4);
  for (let shot = 2; shot <= 5; shot += 1) {
    scope.updateTurrets(read(scope, "TURRET.burstShotInterval"));
    assert.equal(read(scope, "enemyBullets.length"), shot);
  }
  assert.equal(turret.burstShotsRemaining, 0);
  assert.equal(turret.fireTimer, read(scope, "TURRET.fireInterval"));
  scope.updateTurrets(read(scope, "TURRET.fireInterval"));
  assert.equal(read(scope, "enemyBullets.length"), 6);
  assert.equal(turret.burstShotsRemaining, 4);
});

test("turrets still aim at a nearby player and skip distant firing particles", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  vm.runInContext("player.x=650; player.y=420", scope);
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(turret.facing, 1);
  assert.ok(read(scope, "enemyBullets[0].vx") > 0);
  vm.runInContext("player.x=10000; cameraX=10000; particles.length=0; shake=0", scope);
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(read(scope, "enemyBullets.length"), 2);
  assert.equal(read(scope, "particles.length"), 0);
  assert.equal(read(scope, "shake"), 0);
});
