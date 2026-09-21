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
        if (key === "fillRect") {
          assert.ok(args.every(Number.isFinite));
          assert.ok(args[2] >= 0 && args[3] >= 0);
        }
        calls.push({ operation: key, args, color: target.fillStyle, alpha: target.globalAlpha });
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, calls };
}

function read(scope, source) { return vm.runInContext(source, scope); }
function rects(calls) { return calls.filter((call) => call.operation === "fillRect"); }

test("straight road panels use fine one-pixel accents instead of chunky blocks", () => {
  const { scope, calls } = createGame();
  vm.runInContext("globalThis.road=addPlatform(0,200,0); road.style=0; cameraX=0", scope);
  scope.drawStationPanels(scope.road);
  const panels = rects(calls);
  assert.ok(panels.length > 12);
  assert.ok(panels.some((call) => call.color === "rgba(67, 96, 112, 0.62)"));
  assert.equal(calls.some((call) => call.operation === "strokeRect"), false);
  assert.ok(panels.filter((call) => call.args[3] === 1).length >= 8);
  assert.ok(panels.every((call) => Number.isInteger(call.args[0]) && Number.isInteger(call.args[1])));
});

test("pixel texture is deterministic and only draws tiles near the camera", () => {
  const { scope, calls } = createGame();
  vm.runInContext("globalThis.road=addPlatform(0,52000,0); road.style=2; cameraX=20000", scope);
  const palette = ["#214049", "#172c32", "#0c181c"];
  scope.drawRoadPixelTexture(scope.road, palette);
  const first = rects(calls).map(({ args, color }) => ({ args, color }));
  assert.ok(first.length > 20 && first.length < 150);
  assert.ok(first.every((call) => call.args[0] >= 19900 && call.args[0] < 20800));
  calls.length = 0;
  scope.drawRoadPixelTexture(scope.road, palette);
  assert.deepEqual(rects(calls).map(({ args, color }) => ({ args, color })), first);
});

test("flat, sloped and triangular roads get pixel rails without changing their geometry", () => {
  const { scope, calls } = createGame();
  vm.runInContext(`
    globalThis.flat=addPlatform(0,240,0); flat.style=0;
    globalThis.ramp=addRamp(260,500,0,-1,'main',0); ramp.style=1;
    globalThis.triangle=addPlatform(520,760,0); triangle.style=2;
    triangle.routeRole='sub'; triangle.floatingTriangleAngle=20;
    cameraX=0; cameraY=BASE_GROUND_Y-300;
  `, scope);
  const before = read(scope, "JSON.stringify(platforms)");
  scope.drawTerrain();
  const all = rects(calls);
  const mainRail = all.filter((call) => call.color === "rgba(105, 226, 238, 0.74)");
  const subRail = all.filter((call) => call.color === "rgba(201, 174, 255, 0.72)");
  assert.ok(mainRail.some((call) => call.args[2] >= 200), "flat road keeps a pixel cap");
  assert.ok(mainRail.every((call) => call.args[3] === 1), "rail highlights stay thin");
  const rampSteps = mainRail.filter((call) => call.args[2] === 6);
  assert.ok(rampSteps.length >= 20, "ramp rail is built from finer pixel steps");
  assert.ok(new Set(rampSteps.map((call) => call.args[1])).size > 5);
  assert.ok(subRail.some((call) => call.args[2] >= 200), "triangle keeps the sub-path palette");
  assert.ok(all.some((call) => call.color === "#a286d0"), "sub-path tiles keep purple highlights");
  assert.equal(read(scope, "JSON.stringify(platforms)"), before);
});
