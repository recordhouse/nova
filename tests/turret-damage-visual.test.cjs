"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => calls.push({ operation: key, args,
        strokeStyle: target.strokeStyle, lineWidth: target.lineWidth });
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    turretSprite: { loaded: true, image: { naturalWidth: 302, naturalHeight: 400 } },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  const turret = { x: 400, y: 344, width: 108, height: 156,
    hp: 15, maxHp: 15, facing: 1, active: false, fireTimer: 4,
    burstShotsRemaining: 0, recoilTimer: 0, hitTimer: 0, animationPhase: 0 };
  return { scope, calls, turret };
}

function crackStrokes(calls) {
  return calls.filter((call) => call.operation === "stroke" &&
    (call.strokeStyle === "#100a19" || call.strokeStyle === "#8650a2" ||
      call.strokeStyle === "#c477e0"));
}

test("each lost turret HP adds a permanent visible crack after the sprite", () => {
  const { scope, calls, turret } = createGame();
  for (const hp of [15, 14, 10, 5, 1]) {
    calls.length = 0;
    turret.hp = hp;
    scope.drawTurret(turret);
    const strokes = crackStrokes(calls);
    assert.equal(strokes.length, (15 - hp) * 2);
    if (hp < 15) {
      const spriteIndex = calls.findIndex((call) => call.operation === "drawImage");
      const firstCrackIndex = calls.findIndex((call) => call.operation === "stroke" &&
        call.strokeStyle === "#100a19");
      assert.ok(firstCrackIndex > spriteIndex, "damage is painted over the turret artwork");
    }
    assert.equal(turret.hp, hp);
  }
});

test("turret artwork sits into the road without moving its physical body", () => {
  const { scope, calls, turret } = createGame();
  const physicalY = turret.y;
  scope.drawTurret(turret);
  const translate = calls.find((call) => call.operation === "translate");
  const visualGroundOffset = vm.runInContext("TURRET.visualGroundOffset", scope);
  assert.equal(visualGroundOffset, 12);
  assert.deepEqual(translate.args, [
    turret.x + turret.width / 2,
    turret.y + turret.height + visualGroundOffset,
  ]);
  assert.equal(turret.y, physicalY, "rendering does not move the collision body");
});

test("cracks mirror with turret facing and stay stable across redraws and hit flashes", () => {
  const { scope, calls, turret } = createGame();
  turret.hp = 6;
  turret.facing = -1;
  scope.drawTurret(turret);
  assert.ok(calls.some((call) => call.operation === "scale" && call.args[0] === -1));
  const first = JSON.stringify(crackStrokes(calls));
  assert.equal(crackStrokes(calls).filter((call) => call.strokeStyle === "#c477e0").length, 9);
  calls.length = 0;
  turret.hitTimer = 0.18;
  scope.drawTurret(turret);
  assert.equal(JSON.stringify(crackStrokes(calls)), first);
  assert.equal(vm.runInContext("particles.length", scope), 0);
});
