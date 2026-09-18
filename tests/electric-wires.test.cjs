"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const rectangles = [];
  const strokes = [];
  const connectors = [];
  let line = [];
  const ctx = {
    setTransform() {}, save() {}, restore() {},
    beginPath() { line = []; },
    moveTo(x, y) { line.push({ x, y }); },
    lineTo(x, y) { line.push({ x, y }); },
    stroke() { strokes.push({ color: this.strokeStyle, points: [...line] }); },
    strokeRect(...values) { connectors.push(values); },
    fillRect(...values) {
      assert.ok(values.every(Number.isFinite));
      rectangles.push({ color: this.fillStyle, values });
    },
  };
  const canvas = { getContext: () => ctx };
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    globalThis.fixtureFeature = {type:'electric-hose',width:120,centerX:300,phase:0.4,seed:42};
    globalThis.fixtureRoad = {id:1,kind:'flat',start:0,end:600,y:200,features:[fixtureFeature]};
    platforms.push(fixtureRoad);
  `, scope);
  return { scope, rectangles, strokes, connectors };
}

function touchCable(scope) {
  vm.runInContext(`(() => {
    const point = electricWirePoints(fixtureRoad, fixtureFeature)[8];
    player.x = point.x - player.width / 2;
    player.y = point.y + PLAYER_HITBOX_HEIGHT / 2 - player.height;
    player.grounded = false;
    player.crouching = false;
  })()`, scope);
}

test("the anchor stays fixed while the loose end swings below the road", () => {
  const { scope } = createGame();
  for (const seed of [42, 43]) {
    scope.fixtureFeature.seed = seed;
    const samples = [0, 1, 2, 5].map((time) =>
      scope.electricWirePoints(scope.fixtureRoad, scope.fixtureFeature, time));
    const anchor = samples[0][0];
    assert.ok(Math.abs(samples[0].at(-1).x - samples[1].at(-1).x) > 1);
    for (const points of samples) {
      assert.equal(points.length, 15);
      assert.deepEqual(points[0], anchor);
      for (const point of points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert.ok(point.y >= anchor.y);
        assert.ok(point.y <= scope.fixtureRoad.y + 172);
      }
      for (let index = 1; index < points.length; index += 1) {
        const x = (points[index - 1].x + points[index].x) / 2;
        const y = (points[index - 1].y + points[index].y) / 2;
        assert.equal(scope.electricWireHitsRect(points, { x: x - 1, y: y - 1, width: 2, height: 2 }), true);
      }
    }
  }
});

test("segment contact catches crossings, but not empty space inside a cable's bounding box", () => {
  const { scope } = createGame();
  const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
  assert.equal(scope.electricWireHitsRect(points, { x: 45, y: 45, width: 10, height: 10 }), true);
  assert.equal(scope.electricWireHitsRect(points, { x: 0, y: 90, width: 10, height: 10 }), false);
  assert.equal(scope.electricWireHitsRect([{ x: 0, y: 0 }, { x: 0, y: 100 }],
    { x: -1, y: 40, width: 2, height: 10 }), true);
  assert.equal(scope.electricWireHitsRect([{ x: 0, y: 0 }, { x: 100, y: 0 }],
    { x: 40, y: 10, width: 10, height: 10 }), false);
});

test("contact costs half a heart, grants invincibility, and the last half-heart triggers game over", () => {
  const { scope } = createGame();
  touchCable(scope);
  vm.runInContext("updateElectricWires()", scope);
  assert.equal(vm.runInContext("player.hp", scope), 2.5);
  assert.equal(vm.runInContext("player.invincible", scope), 1.3);
  vm.runInContext("updateElectricWires()", scope);
  assert.equal(vm.runInContext("player.hp", scope), 2.5);
  for (const remaining of [2, 1.5, 1, 0.5, 0]) {
    vm.runInContext("player.invincible=0; updateElectricWires()", scope);
    assert.equal(vm.runInContext("player.hp", scope), remaining);
  }
  assert.equal(vm.runInContext("gameOver", scope), true);
  vm.runInContext("updateElectricWires()", scope);
  assert.equal(vm.runInContext("player.hp", scope), 0);
});

test("walking above a cable or touching a non-wire decoration is safe", () => {
  const { scope } = createGame();
  vm.runInContext(`
    player.x=electricWirePoints(fixtureRoad,fixtureFeature)[0].x-player.width/2;
    player.y=fixtureRoad.y-player.height;
    player.grounded=true;
    updateElectricWires();
  `, scope);
  assert.equal(vm.runInContext("player.hp", scope), 3);
  touchCable(scope);
  scope.fixtureFeature.type = "broken-neon";
  vm.runInContext("updateElectricWires()", scope);
  assert.equal(vm.runInContext("player.hp", scope), 3);
});

test("the visible cable follows the collision centerline and has only one connector", () => {
  const { scope, strokes, connectors } = createGame();
  scope.drawElectricHoseFeature(scope.fixtureRoad, scope.fixtureFeature);
  const cable = strokes.find((stroke) => stroke.color === "#dce5e9");
  assert.equal(JSON.stringify(cable.points),
    JSON.stringify(scope.electricWirePoints(scope.fixtureRoad, scope.fixtureFeature)));
  assert.equal(connectors.length, 1);
});

test("the normal frame update applies cable damage", () => {
  const { scope } = createGame();
  scope.requestAnimationFrame = () => {};
  for (const name of ["enemies", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"), scope);
  }
  vm.runInContext(`
    enemies.length=0; turrets.length=0; midBosses.length=0;
    platforms.length=0; platforms.push(fixtureRoad);
  `, scope);
  touchCable(scope);
  vm.runInContext("update(1/60)", scope);
  assert.equal(vm.runInContext("player.hp", scope), 2.5);
});

test("orientation changes move the cable and its contact area together", () => {
  const { scope } = createGame();
  touchCable(scope);
  const before = scope.electricWirePoints(scope.fixtureRoad, scope.fixtureFeature);
  assert.equal(scope.resizeGameResolution(1280, 720), true);
  const after = scope.electricWirePoints(scope.fixtureRoad, scope.fixtureFeature);
  const shift = after[0].y - before[0].y;
  assert.notEqual(shift, 0);
  for (let index = 0; index < before.length; index += 1) {
    assert.equal(after[index].x, before[index].x);
    assert.ok(Math.abs(after[index].y - before[index].y - shift) < 1e-10);
  }
  vm.runInContext("updateElectricWires()", scope);
  assert.equal(vm.runInContext("player.hp", scope), 2.5);
});

test("half-heart pixels and HUD faithfully display fractional health", () => {
  const { scope, rectangles } = createGame();
  const redArea = (fill) => {
    rectangles.length = 0;
    scope.drawPixelHeart(0, 0, fill);
    return rectangles.filter((rect) => rect.color === "#ff4f5f")
      .reduce((area, rect) => area + rect.values[2] * rect.values[3], 0);
  };
  const full = redArea(1);
  assert.equal(redArea(0.5), full / 2);
  assert.equal(redArea(0), 0);
  const fills = [];
  scope.drawPixelHeart = (x, y, fill) => fills.push(fill);
  scope.drawMinimap = () => {};
  vm.runInContext("player.hp=2.5; drawHud()", scope);
  assert.deepEqual(fills, [1, 1, 0.5]);
});
