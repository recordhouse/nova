"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => {
        if (key === "fillRect") assert.ok(args[2] >= 0 && args[3] >= 0);
        calls.push({ operation: key, args, color: target.fillStyle, alpha: target.globalAlpha });
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    playerSprites: {
      stand: { loaded: true, image: { naturalWidth: 400, naturalHeight: 500 }, fps: 1,
        frames: [{ x: 0, y: 0, width: 400, height: 500 }] },
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500};
    platforms.push(fixtureRoad);
    player.x=1000; player.y=500-player.height;
    player.grounded=true; player.platform=fixtureRoad;
    minWorldX=0; maxWorldX=2000;
  `, scope);
  return { scope, calls };
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("continuous fire spends one charge per bullet and stops when empty", () => {
  const { scope } = createGame();
  assert.equal(read(scope, "player.fireEnergy"), 100);
  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 1);
  assert.ok(read(scope, "player.fireEnergy") < 100);
  let reachedEmpty = false;
  for (let frame = 0; frame < 180; frame += 1) {
    scope.updatePlayer(1 / 60);
    if (read(scope, "player.fireEnergy") < read(scope, "PLAYER_FIRE_ENERGY_PER_SHOT")) {
      reachedEmpty = true;
    }
  }
  assert.equal(reachedEmpty, true);
  assert.ok(read(scope, "bullets.length") > 15);

  read(scope, "player.fireEnergy=0; player.fireTimer=0; bullets.length=0");
  for (let frame = 0; frame < 29; frame += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 0);
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 1, "holding fire resumes only after enough energy regenerates");
  assert.ok(read(scope, "player.fireEnergy") < 1);
});

test("energy recharges while idle and resets full without affecting down protection", () => {
  const { scope } = createGame();
  read(scope, "player.fireEnergy=10");
  scope.updatePlayer(2);
  assert.equal(read(scope, "player.fireEnergy"), 34);
  scope.updatePlayer(10);
  assert.equal(read(scope, "player.fireEnergy"), 100);
  read(scope, "player.fireEnergy=0; controls.fire=true");
  assert.equal(scope.takePlayerDamage(1), true);
  scope.updatePlayer(0.25);
  assert.equal(read(scope, "bullets.length"), 0);
  assert.equal(read(scope, "player.fireEnergy"), 3);
  read(scope, "controls.fire=false");
  scope.resetPlayerPosition();
  assert.equal(read(scope, "player.fireEnergy"), 100);
});

test("purple gauge tracks the drawn sprite and never blinks with temporary immunity", () => {
  const { scope, calls } = createGame();
  scope.drawPlayer();
  const full = calls.find((call) => call.color === "#a653f5");
  const frame = calls.find((call) => call.color === "#7145a2");
  assert.equal(full.args[2], 52);
  assert.ok(frame.args[1] < read(scope, "player.y"));
  calls.length = 0;
  read(scope, "player.fireEnergy=50; player.invincible=1; gameTime=0.15");
  scope.drawPlayer();
  const half = calls.find((call) => call.color === "#a653f5");
  const sprite = calls.find((call) => call.operation === "drawImage");
  assert.equal(half.args[2], 26);
  assert.equal(half.alpha, 1);
  assert.ok(sprite.alpha < 1);
  calls.length = 0;
  read(scope, "player.fireEnergy=0");
  scope.drawPlayer();
  assert.equal(calls.some((call) => call.color === "#a653f5"), false);
  assert.ok(calls.some((call) => call.color === "#7145a2"));
});
