"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(testMode = true) {
  const boxes = [];
  const layers = [];
  const stack = [];
  const ctx = {
    globalAlpha: 1, dash: [],
    setTransform() {}, translate() {}, scale() {}, beginPath() {},
    moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    setLineDash(values) { this.dash = values; },
    save() {
      stack.push({ globalAlpha: this.globalAlpha, dash: this.dash,
        fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
    },
    restore() { Object.assign(this, stack.pop()); },
    fillRect() {},
    strokeRect(...values) {
      assert.ok(values.every(Number.isFinite));
      boxes.push({ values, color: this.strokeStyle, dash: this.dash, lineWidth: this.lineWidth });
      if (this.lineWidth === 1.5) layers.push("physics");
    },
  };
  const button = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const canvas = { getContext: () => ctx, addEventListener() {} };
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-monster-area]" ? button : null,
      querySelectorAll: () => [], addEventListener() {},
    },
    window: { location: { search: testMode ? "?test=1" : "" }, addEventListener() {},
      innerWidth: 720, innerHeight: 1280, matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "combat", "enemies", "renderer", "input"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    enemies.push(Object.freeze({...MONSTER_TYPES.monster1,x:50.5,y:300.25,
      alive:true,kind:'monster1',state:'chase',facing:1}));
    enemies.push(Object.freeze({...MONSTER_TYPES.monster2,x:250.75,y:310.5,
      alive:true,kind:'monster2',state:'chase',facing:1,attackDirection:1}));
    turrets.push(Object.freeze({...TURRET,x:500.5,y:290.75,alive:true}));
  `, scope);
  for (const name of ["drawTerrain", "drawBossGate", "drawTurret", "drawEnemy", "drawMidBoss",
    "drawPlayer", "drawPlayerPhysicsDebug", "drawProjectiles"]) scope[name] = () => {};
  scope.drawParticles = () => layers.push("particles");
  return { scope, button, boxes, layers, ctx };
}

test("M AREA defaults off and toggles exact monster/turret collision rectangles over the effects", () => {
  const { scope, button, boxes, layers } = createGame();
  assert.equal(button.attributes["aria-pressed"], "false");
  scope.drawWorld();
  assert.equal(boxes.length, 0);
  button.listeners.click({ preventDefault() {} });
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.ok(button.attributes["aria-label"].includes("포탑"));
  layers.length = 0;
  scope.drawWorld();
  const physics = boxes.filter((box) => box.lineWidth === 1.5);
  assert.deepEqual(physics.map((box) => box.values), [
    [50.5, 288.6518987341772, 64, 83.59810126582278],
    [250.75, 230.15384615384616, 132, 218.34615384615384],
    [500.5, 290.75, 108, 156],
  ]);
  assert.ok(physics.every((box) => box.dash.length === 0));
  assert.ok(boxes.some((box) => box.dash.length > 0), "awareness ranges remain visible");
  assert.deepEqual(layers, ["particles", "physics", "physics", "physics"]);
  button.listeners.click({ preventDefault() {} });
  boxes.length = 0;
  scope.drawWorld();
  assert.equal(boxes.length, 0);
});

test("normal gameplay never renders the test collision rectangles", () => {
  const { scope, boxes } = createGame(false);
  vm.runInContext("showMonsterArea=true", scope);
  scope.drawWorld();
  assert.equal(boxes.length, 0);
});

test("dead/offscreen targets are hidden, partially visible targets are included and canvas state is restored", () => {
  const { scope, boxes, ctx } = createGame();
  vm.runInContext("showMonsterArea=true", scope);
  const target = Object.freeze({ x: -70, y: 200, width: 100, height: 80, alive: true });
  scope.drawCombatantPhysicsDebug({ ...target, alive: false }, "#ffd278");
  scope.drawCombatantPhysicsDebug({ ...target, x: 50000 }, "#ffd278");
  assert.equal(boxes.length, 0);
  ctx.globalAlpha = 0.6;
  ctx.dash = [8, 6];
  scope.drawCombatantPhysicsDebug(target, "#ffd278");
  assert.deepEqual(boxes[0].values, [-70, 200, 100, 80]);
  assert.equal(ctx.globalAlpha, 0.6);
  assert.deepEqual(ctx.dash, [8, 6]);
});
