"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("the initial screen uses a neon pixel-art all-resource loading bar", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-game-loading/);
  assert.match(html, /data-game-loading-progress/);
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /data-game-loading-percent/);
  assert.doesNotMatch(html, /SYSTEM \/\/ NEON BOOT|LOADING RESOURCES|NOVA<\/div>/);
  assert.doesNotMatch(html, /IMAGE \/\/ VIDEO \/\/ AUDIO|MEMORY LINK/);
  assert.match(css, /\.game-loading\s*\{[^}]*z-index:\s*12/s);
  assert.match(css, /\.game-loading-fill\s*\{[^}]*width:\s*var\(--loading-progress\)/s);
  assert.match(css, /\.game-loading\.complete\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(css, /game-loading-logo|game-loading-kicker|game-loading-caption/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /steps\(10, end\)/);
});

test("both boss sheets contain five high-resolution frames", () => {
  for (const file of ["stand.png", "run.png"]) {
    const image = fs.readFileSync(path.join(
      __dirname,
      "..",
      "ftp-deploy",
      "assets",
      "images",
      "boss",
      file,
    ));
    assert.equal(image.toString("ascii", 1, 4), "PNG");
    assert.equal(image.readUInt32BE(16), 4400);
    assert.equal(image.readUInt32BE(20), 800);
    assert.equal(image.readUInt32BE(16) / 5, 880);
  }
});

test("images, videos and audio must all settle before shared loading reaches 100%", async () => {
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
  const pendingAudioFetches = [];

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
    fetch(source) {
      return new Promise((resolve) => {
        pendingAudioFetches.push(() => resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve({ source }),
        }));
      });
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

  assert.equal(vm.runInContext("visualAssetLoadTasks.length", scope), 35);
  assert.equal(vm.runInContext("audioAssetLoadTasks.length", scope), 32);
  assert.equal(pendingAudioFetches.length, 32);
  assert.equal(images.length, 20);
  assert.equal(videos.length, 15);
  assert.equal(scope.visualAssetsAreReady(), false);
  assert.equal(scope.gameAssetsAreReady(), false);
  assert.equal(percent.textContent, "0%");
  let gameReady = false;
  const ready = scope.waitForGameAssets().then((snapshot) => {
    gameReady = true;
    return snapshot;
  });

  const bossImage = images.find((image) => image.currentSrc.includes("images/boss/stand.png"));
  const bossRunImage = images.find((image) => image.currentSrc.includes("images/boss/run.png"));
  assert.ok(bossImage);
  assert.ok(bossRunImage);
  assert.match(bossImage.currentSrc, /^\.\/assets\/images\/boss\/stand\.png/);
  assert.match(bossRunImage.currentSrc, /^\.\/assets\/images\/boss\/run\.png/);
  for (const image of images) {
    if (image !== bossImage && image !== bossRunImage) image.onload();
  }
  bossImage.onerror();
  assert.match(bossImage.currentSrc, /^\.\/ftp-deploy\/assets\/images\/boss\/stand\.png/);
  bossImage.onload();
  bossRunImage.onerror();
  assert.match(bossRunImage.currentSrc, /^\.\/ftp-deploy\/assets\/images\/boss\/run\.png/);
  bossRunImage.onload();
  for (let index = 0; index < videos.length; index += 1) {
    videos[index].emit(index === videos.length - 1 ? "error" : "loadeddata");
  }
  await Promise.resolve();
  assert.equal(scope.visualAssetsAreReady(), true);
  assert.equal(scope.gameAssetsAreReady(), false);
  assert.equal(gameReady, false);
  assert.equal(styleValues.get("--loading-progress"), "52%");

  for (const releaseFetch of pendingAudioFetches) releaseFetch();
  const snapshot = await ready;
  assert.deepEqual(
    { total: snapshot.total, loaded: snapshot.loaded, failed: snapshot.failed },
    { total: 67, loaded: 67, failed: 1 },
  );
  assert.equal(scope.gameAssetsAreReady(), true);
  assert.equal(gameReady, true);
  assert.equal(styleValues.get("--loading-progress"), "100%");
  assert.equal(attributes["aria-valuenow"], "100");
  assert.equal(percent.textContent, "100%");
});

test("the game runtime waits for every registered resource and hides loading after its first frame", async () => {
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
    gameAssetsAreReady: () => false,
    waitForGameAssets: () => assetsReady,
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

test("test mode can replay the loading screen with an animated progress bar", () => {
  const loadingClasses = new Set(["complete"]);
  const loadingAttributes = { "aria-hidden": "true" };
  const progressValues = new Map();
  const progressAttributes = {};
  const percent = { textContent: "100%" };
  const scope = {
    TEST_MODE: true,
    performance: { now: () => 100 },
    requestAnimationFrame() {},
    buildStars() {},
    resetGame() {},
    resetAllInputs() { scope.resetInputs += 1; },
    visualAssetsAreReady: () => true,
    gameLoadingElement: {
      classList: {
        add(name) { loadingClasses.add(name); },
        remove(name) { loadingClasses.delete(name); },
      },
      setAttribute(name, value) { loadingAttributes[name] = value; },
    },
    gameLoadingProgressElement: {
      style: { setProperty(name, value) { progressValues.set(name, value); } },
      setAttribute(name, value) { progressAttributes[name] = value; },
    },
    gameLoadingPercentElement: percent,
    resetInputs: 0,
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8"),
    scope,
    { filename: "main.js" },
  );

  assert.equal(scope.previewTestLoadingScreen(), true);
  assert.equal(scope.resetInputs, 1);
  assert.equal(loadingClasses.has("complete"), false);
  assert.equal(loadingAttributes["aria-hidden"], "false");
  assert.equal(progressValues.get("--loading-progress"), "0%");

  assert.equal(scope.updateTestLoadingPreview(1700), true);
  assert.equal(progressValues.get("--loading-progress"), "50%");
  assert.equal(percent.textContent, "50%");
  assert.equal(progressAttributes["aria-valuenow"], "50");

  assert.equal(scope.updateTestLoadingPreview(4001), false);
  assert.equal(progressValues.get("--loading-progress"), "100%");
  assert.equal(loadingClasses.has("complete"), true);
  assert.equal(loadingAttributes["aria-hidden"], "true");
});
