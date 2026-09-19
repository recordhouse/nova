"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(testMode = true, landscape = false) {
  const strokes = [];
  const clips = [];
  const fills = [];
  let points = [];
  const ctx = {
    setTransform() {}, save() {}, restore() {}, clip() {},
    beginPath() { points = []; },
    moveTo(x, y) { points.push({ x, y }); },
    lineTo(x, y) { points.push({ x, y }); },
    closePath() {},
    arc(x, y, radius) { points.push({ x, y, radius }); },
    rect(...values) { clips.push(values); },
    stroke() { strokes.push({ color: this.strokeStyle, points: [...points] }); },
    fill() { fills.push({ color: this.fillStyle, points: [...points] }); },
    fillRect() {}, strokeRect() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const button = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const tools = { getBoundingClientRect: () => ({ bottom: landscape ? 148 : 180 }) };
  const canvas = {
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect() { return { top: 0, height: this.height / 2 }; },
  };
  const scope = {
    performance: { now: () => 0 }, requestAnimationFrame() {},
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-map]" ? button
          : selector === "[data-test-controls]" ? tools : null,
      querySelectorAll: () => [], addEventListener() {},
    },
    window: { location: { search: testMode ? "?test=1" : "" }, addEventListener() {},
      innerWidth: landscape ? 1280 : 720, innerHeight: landscape ? 720 : 1280,
      matchMedia: () => ({ matches: landscape }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "enemies", "renderer", "input", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, button, tools, strokes, clips, fills };
}

test("MAP button toggles the full map, clears held controls and pauses the game clock", () => {
  const { scope, button } = createGame();
  assert.equal(vm.runInContext("showFullMap", scope), false);
  assert.equal(button.attributes["aria-pressed"], "false");
  vm.runInContext("controls.fire=true; keyboardControls.fire=true", scope);
  button.listeners.click({ preventDefault() {} });
  assert.equal(vm.runInContext("showFullMap", scope), true);
  assert.equal(vm.runInContext("controls.fire", scope), false);
  assert.equal(button.attributes["aria-pressed"], "true");
  const time = vm.runInContext("gameTime", scope);
  scope.update(1 / 60);
  assert.equal(vm.runInContext("gameTime", scope), time);
  button.listeners.click({ preventDefault() {} });
  scope.update(1 / 60);
  assert.ok(vm.runInContext("gameTime", scope) > time);
  scope.toggleTestMap();
  scope.resetGame();
  assert.equal(vm.runInContext("showFullMap", scope), false);
  assert.equal(button.attributes["aria-pressed"], "false");
});

test("normal mode hides MAP tools and cannot open or pause for the full map", () => {
  const { scope, button, tools } = createGame(false);
  assert.equal(tools.hidden, true);
  button.listeners.click({ preventDefault() {} });
  assert.equal(vm.runInContext("showFullMap", scope), false);
  scope.update(1 / 60);
  assert.ok(vm.runInContext("gameTime", scope) > 0);
});

for (const [landscape, shortSide] of [[false, 540], [false, 720], [true, 540], [true, 720]]) {
  test(`full ${shortSide}px ${landscape ? "landscape" : "portrait"} map fits every road and shows player and boss gate`, () => {
    const { scope, strokes, clips, fills } = createGame(true, landscape);
    scope.resizeGameResolution(landscape ? shortSide * 16 / 9 : shortSide,
      landscape ? shortSide : shortSide * 16 / 9);
    scope.drawMinimap(true);
    const [x, y, width, height] = clips.at(-1);
    assert.ok(width > 0 && height > 0);
    const roads = strokes.filter((stroke) => typeof stroke.color === "string" &&
      ["rgba(83, 221, 242, 0.62)", "rgba(190, 143, 255, 0.34)"].includes(stroke.color));
    assert.equal(roads.length, vm.runInContext("platforms.length", scope));
    for (const road of roads) {
      for (const point of road.points) {
        assert.ok(point.x >= x && point.x <= x + width);
        assert.ok(point.y >= y && point.y <= y + height);
      }
    }
    for (const color of ["#ff6940", "#ffe071"]) {
      const marker = fills.find((fill) => fill.color === color);
      assert.ok(marker, `${color} map marker must exist`);
      assert.ok(marker.points[0].x >= x && marker.points[0].x <= x + width);
      assert.ok(marker.points[0].y >= y && marker.points[0].y <= y + height);
    }
    const previousRoads = JSON.stringify(roads);
    strokes.length = 0;
    vm.runInContext("player.x+=150; cameraX+=150", scope);
    scope.drawMinimap(true);
    assert.equal(JSON.stringify(strokes.filter((stroke) => typeof stroke.color === "string" &&
      ["rgba(83, 221, 242, 0.62)", "rgba(190, 143, 255, 0.34)"].includes(stroke.color))), previousRoads,
    "full map remains fixed rather than following the player");
  });
}

test("full map skips world effects and is not hidden by the game-over overlay", () => {
  const { scope } = createGame();
  const layers = [];
  scope.drawBackground = () => layers.push("background");
  scope.drawWorld = () => layers.push("world");
  scope.drawOverlay = () => { throw new Error("game-over overlay must not hide the full map"); };
  vm.runInContext("gameOver=true", scope);
  scope.toggleTestMap();
  scope.draw();
  assert.deepEqual(layers, ["background"]);
});

test("closed map keeps the small, cropped minimap", () => {
  const { scope, strokes, clips } = createGame();
  scope.drawMinimap();
  const [x, y, width, height] = clips.at(-1);
  assert.ok(width < 282 && height <= 148);
  const roads = strokes.filter((stroke) => stroke.color === "rgba(83, 221, 242, 0.62)");
  assert.ok(roads.some((road) => road.points.some((point) =>
    point.x < x || point.x > x + width || point.y < y || point.y > y + height)));
});
