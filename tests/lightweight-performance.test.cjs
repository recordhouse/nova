"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

test("mobile play uses a lighter 50 FPS budget and pauses while the page is hidden", () => {
  const listeners = new Map();
  const frames = [];
  const scope = {
    MOBILE_LANDSCAPE_MODE: true,
    document: {
      hidden: false,
      addEventListener(name, callback) { listeners.set(name, callback); },
    },
    performance: { now: () => 1234 },
    previousTime: 0,
    requestAnimationFrame(callback) { frames.push(callback); },
    buildStars() {},
    resetGame() {},
    resetAllInputs() { scope.inputResets += 1; },
    setGameMediaVisibility(hidden) { scope.mediaVisibility.push(hidden); },
    gameAssetsAreReady: () => true,
    inputResets: 0,
    mediaVisibility: [],
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(path.join(root, "js", "main.js"), "utf8"),
    scope,
    { filename: "main.js" },
  );
  assert.equal(vm.runInContext("MAX_RENDER_FPS", scope), 50);
  assert.equal(vm.runInContext("IDLE_RENDER_FPS", scope), 20);
  assert.equal(frames.length, 1);

  scope.document.hidden = true;
  listeners.get("visibilitychange")();
  assert.equal(vm.runInContext("pageVisibilityPaused", scope), true);
  assert.equal(scope.inputResets, 1);
  assert.deepEqual(scope.mediaVisibility, [true]);

  frames.shift()(1300);
  assert.equal(frames.length, 1, "hidden pages schedule no game update or drawing work");
  scope.document.hidden = false;
  listeners.get("visibilitychange")();
  assert.deepEqual(scope.mediaVisibility, [true, false]);
});

test("active game videos and music are suspended and resumed with page visibility", () => {
  const assets = fs.readFileSync(path.join(root, "js", "assets.js"), "utf8");
  assert.match(assets, /function setGameMediaVisibility\(hidden\)/);
  assert.match(assets, /asset\.visibilityPaused = Boolean\(asset\.active && !video\.paused\)/);
  assert.match(assets, /if \(asset\.visibilityPaused\) video\.pause\?\.\(\)/);
  assert.match(assets, /playCurrentStageMusic\(\)/);
});
