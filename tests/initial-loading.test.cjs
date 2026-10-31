"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("the initial screen contains a visual-asset loading bar", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-game-loading/);
  assert.match(html, /data-game-loading-progress/);
  assert.match(html, /data-game-loading-percent>0%/);
  assert.match(html, /role="progressbar"/);
  assert.match(css, /\.game-loading\s*\{[^}]*z-index:\s*12/s);
  assert.match(css, /\.game-loading-fill\s*\{[^}]*width:\s*var\(--loading-progress\)/s);
  assert.match(css, /\.game-loading\.complete\s*\{[^}]*visibility:\s*hidden/s);
});

test("all registered images and videos advance one shared loading progress", async () => {
  const images = [];
  const videos = [];
  const styleValues = new Map();
  const attributes = {};
  const progress = {
    style: { setProperty(name, value) { styleValues.set(name, value); } },
    setAttribute(name, value) { attributes[name] = value; },
  };
  const percent = { textContent: "0%" };
  const loading = {};
  const canvas = { getContext: () => ({ setTransform() {} }) };

  class FakeImage {
    constructor() { images.push(this); }
    set src(value) { this.currentSrc = value; }
  }
  class FakeVideo {
    constructor() {
      this.listeners = new Map();
      this.readyState = 0;
      this.currentTime = 0;
      this.paused = true;
      videos.push(this);
    }
    addEventListener(name, listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(listener);
    }
    load() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    emit(name) {
      if (name === "loadeddata") this.readyState = 2;
      for (const listener of this.listeners.get(name) ?? []) listener();
    }
  }

  const scope = {
    performance: { now: () => 0 },
    Image: FakeImage,
    document: {
      querySelector(selector) {
        if (selector === "#game") return canvas;
        if (selector === "[data-game-loading]") return loading;
        if (selector === "[data-game-loading-progress]") return progress;
        if (selector === "[data-game-loading-percent]") return percent;
        return null;
      },
      createElement: (name) => name === "video" ? new FakeVideo() : null,
    },
    window: {
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }

  assert.equal(vm.runInContext("visualAssetLoadTasks.length", scope), 33);
  assert.equal(images.length, 18);
  assert.equal(videos.length, 15);
  assert.equal(scope.visualAssetsAreReady(), false);
  assert.equal(percent.textContent, "0%");
  const ready = scope.waitForVisualAssets();

  for (const image of images) image.onload();
  for (let index = 0; index < videos.length; index += 1) {
    videos[index].emit(index === videos.length - 1 ? "error" : "loadeddata");
  }
  const snapshot = await ready;
  assert.deepEqual(
    { total: snapshot.total, loaded: snapshot.loaded, failed: snapshot.failed },
    { total: 33, loaded: 33, failed: 1 },
  );
  assert.equal(scope.visualAssetsAreReady(), true);
  assert.equal(styleValues.get("--loading-progress"), "100%");
  assert.equal(attributes["aria-valuenow"], "100");
  assert.equal(percent.textContent, "100%");
});

test("the game runtime waits for visual assets and hides loading after its first frame", async () => {
  let releaseAssets;
  const assetsReady = new Promise((resolve) => { releaseAssets = resolve; });
  const frames = [];
  const loadingClasses = new Set();
  const loadingAttributes = {};
  const scope = {
    performance: { now: () => 100 },
    previousTime: 0,
    requestAnimationFrame(callback) { frames.push(callback); },
    buildStars() { scope.buildCalls += 1; },
    resetGame() { scope.resetCalls += 1; },
    visualAssetsAreReady: () => false,
    waitForVisualAssets: () => assetsReady,
    gameLoadingElement: {
      classList: { add(name) { loadingClasses.add(name); } },
      setAttribute(name, value) { loadingAttributes[name] = value; },
    },
    buildCalls: 0,
    resetCalls: 0,
    drawCalls: 0,
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8"),
    scope,
    { filename: "main.js" },
  );

  assert.equal(scope.resetCalls, 0);
  assert.equal(frames.length, 0);
  releaseAssets();
  await assetsReady;
  await Promise.resolve();
  assert.equal(scope.buildCalls, 1);
  assert.equal(scope.resetCalls, 1);
  assert.equal(frames.length, 1);
  assert.equal(loadingClasses.has("complete"), false);

  vm.runInContext("update=()=>{}; draw=()=>{drawCalls+=1}", scope);
  frames.shift()(116);
  assert.equal(scope.drawCalls, 1);
  assert.equal(loadingClasses.has("complete"), true);
  assert.equal(loadingAttributes["aria-hidden"], "true");
});
