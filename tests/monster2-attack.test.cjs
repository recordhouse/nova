"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1, globalCompositeOperation: "source-over" }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => {
        assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite));
        if (key === "fillRect") {
          assert.ok(args[2] >= 0 && args[3] >= 0);
          assert.ok(target.globalAlpha >= 0 && target.globalAlpha <= 1);
        }
        calls.push({ operation: key, args, color: target.fillStyle });
      };
    },
  });
  const canvas = { getContext: () => ctx };
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    enemySprites: { monster2: { loaded: true, image: { naturalWidth: 309, naturalHeight: 338 } } },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500};
    platforms.push(fixtureRoad);
    globalThis.fixtureEnemy=addEnemy(fixtureRoad,400,'monster2');
  `, scope);
  return { scope, calls };
}

test("flame accelerates to 490 pixels in 0.45 seconds without becoming instantaneous", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.state = "flame";
  enemy.stateTimer = enemy.flameDuration;
  assert.equal(scope.monster2CurrentFlameLength(enemy), 0);
  enemy.stateTimer = enemy.flameDuration - 0.225;
  assert.ok(Math.abs(scope.monster2CurrentFlameLength(enemy) - 122.5) < 1e-9);
  enemy.stateTimer = enemy.flameDuration - 0.45;
  assert.ok(Math.abs(scope.monster2CurrentFlameLength(enemy) - 490) < 1e-9);
  enemy.stateTimer = 0;
  assert.equal(scope.monster2CurrentFlameLength(enemy), 0);
});

test("longer flame contact works in both directions and stays inside its range", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.state = "flame";
  enemy.stateTimer = 1;
  for (const direction of [-1, 1]) {
    enemy.attackDirection = direction;
    const origin = scope.monster2FlameOrigin(enemy);
    const rect = (distance) => ({
      x: origin.x + direction * distance - 5,
      y: origin.y + scope.monster2FlameCenterOffset(enemy, distance) - 5,
      width: 10, height: 10,
    });
    assert.equal(scope.monster2FlameHitsRect(enemy, rect(420)), true);
    assert.equal(scope.monster2FlameHitsRect(enemy, rect(510)), false);
    assert.equal(scope.monster2FlameHitsRect(enemy, rect(-100)), false);
    scope.drawMonster2Attack(enemy);
  }
});

test("monster2 starts charging at its longer attack range and still fires for two seconds", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const targetX = enemy.x + enemy.width / 2 + 480;
  const safeRect = { x: 0, y: 0, width: 10, height: 10 };
  enemy.attackTimer = 0;
  scope.updateMonster2(enemy, 1 / 60, safeRect, targetX, 500);
  assert.equal(enemy.state, "inhale");
  assert.equal(enemy.stateTimer, 0.9);
  scope.updateMonster2(enemy, 0.89, safeRect, targetX, 500);
  assert.equal(enemy.state, "inhale");
  scope.updateMonster2(enemy, 0.02, safeRect, targetX, 500);
  assert.equal(enemy.state, "flame");
  assert.equal(enemy.stateTimer, 2);
  scope.updateMonster2(enemy, 2, safeRect, targetX, 500);
  assert.equal(enemy.state, "chase");
  assert.equal(enemy.attackTimer, 2.4);
});

test("charge grows visibly, renders over the body, and creates no persistent particles", () => {
  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.state = "inhale";
  const particlesBefore = vm.runInContext("particles.length", scope);
  const coreWidths = [];
  for (const direction of [-1, 1]) {
    enemy.facing = enemy.attackDirection = direction;
    for (const progress of [0, 0.5, 1]) {
      calls.length = 0;
      enemy.stateTimer = enemy.inhaleDuration * (1 - progress);
      scope.drawEnemy(enemy);
      const bodyIndex = calls.findIndex((call) => call.operation === "drawImage");
      const chargeIndex = calls.findIndex((call) => call.color === "#ff7835");
      assert.ok(chargeIndex > bodyIndex);
      assert.equal(calls.filter((call) => call.color === "#ffac62").length, 12);
      coreWidths.push(calls.find((call) => call.color === "#ffd76c").args[2]);
    }
  }
  assert.ok(coreWidths[2] > coreWidths[0]);
  assert.equal(vm.runInContext("particles.length", scope), particlesBefore);
});
