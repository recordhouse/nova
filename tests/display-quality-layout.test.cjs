"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createDisplay(cssWidth = 390, pixelRatio = 3) {
  const calls = [];
  const gradients = [];
  const stack = [];
  let measuredWidth = cssWidth;
  const ctx = new Proxy({ globalAlpha: 1, globalCompositeOperation: "source-over" }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      if (key === "createRadialGradient" || key === "createLinearGradient") {
        return (...args) => {
          const gradient = { operation: key, args, stops: [],
            addColorStop(offset, color) { this.stops.push({ offset, color }); } };
          gradients.push(gradient);
          return gradient;
        };
      }
      return (...args) => {
        assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite));
        calls.push({ operation: key, args, alpha: target.globalAlpha,
          color: target.fillStyle, strokeColor: target.strokeStyle,
          shadowColor: target.shadowColor });
      };
    },
  });
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: measuredWidth, height: measuredWidth * 16 / 9 }),
  };
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: { location: { search: "" }, innerWidth: 390, innerHeight: 693,
      devicePixelRatio: pixelRatio, matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, canvas, calls, gradients,
    setCssWidth: (width) => { measuredWidth = width; } };
}

function read(scope, expression) { return vm.runInContext(expression, scope); }

test("a phone's physical pixel density sets the canvas backing size", () => {
  const { scope, canvas, calls, setCssWidth } = createDisplay();
  assert.equal(read(scope, "WIDTH"), 720);
  assert.equal(canvas.width, 1170);
  assert.equal(canvas.height, 2080);
  assert.deepEqual(calls.find((call) => call.operation === "setTransform").args,
    [1.625, 0, 0, 1.625, 0, 0]);
  setCssWidth(360);
  assert.equal(scope.syncCanvasBackingScale(), true);
  assert.equal(canvas.width, 1080);
  assert.equal(scope.syncCanvasBackingScale(), false);
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /#game\s*\{[^}]*image-rendering:\s*auto/s);
  assert.doesNotMatch(css, /#game\s*\{[^}]*image-rendering:\s*pixelated/s);
});

test("backing resolution is capped for memory while remaining sharper than 1x", () => {
  const { scope, canvas } = createDisplay(720, 4);
  assert.equal(read(scope, "MAX_RENDER_SCALE"), 2);
  assert.equal(canvas.width, 1440);
  assert.equal(canvas.height, 2560);
});

test("the HUD groups hearts and ultimates left and stage and score right of the centered map", () => {
  const { scope } = createDisplay();
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const header = scope.hudHeaderLayout();
    const slots = scope.topVideoSlotLayout();
    assert.equal(header.map.y, header.top);
    assert.equal(header.map.x + header.map.width / 2, width / 2);
    assert.ok(header.hearts.x + header.hearts.width < header.ultimate.x);
    assert.ok(header.stage.x + header.stage.width < header.score.x);
    assert.ok(header.hearts.x > slots.left[1].x,
      "the left HUD group sits beside, not over, the video");
    assert.ok(header.score.x + header.score.width < slots.right[1].x,
      "the right HUD group sits beside, not over, the video");
    assert.ok(header.ultimate.x + header.ultimate.width <= width / 2);
    assert.ok(header.stage.x >= width / 2);
    assert.equal(header.hearts.width, header.ultimate.width);
    assert.equal(header.stage.width, header.score.width);
    assert.equal(header.hearts.width, header.stage.width);
    assert.ok(header.hearts.width <= 96);
    assert.equal(header.stage.y, header.score.y);
    assert.equal(header.hearts.y, header.stage.y);
    assert.equal(header.ultimate.y, header.stage.y);
    assert.equal(header.infoY, 14);
    assert.equal(header.map.y, 7);
    assert.equal(header.map.y, scope.ultimateMeterLayout().height + 1,
      "the minimap hugs the ultimate meter without overlapping it");
    assert.ok(header.infoY > 10, "status rows move down");
    assert.ok(header.map.y < 34, "the minimap moves up");
    assert.ok(header.map.y + header.map.height <= 170);
    assert.ok(header.map.width / header.map.height >= 2.25,
      "the minimap uses a wider horizontal aspect ratio");
  }
});

test("two mirrored video slots are reduced near-square trapezoids with wider tops", () => {
  const { scope, calls } = createDisplay();
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const header = scope.hudHeaderLayout();
    const slots = scope.topVideoSlotLayout();
    assert.equal(slots.left[0].x, 0);
    assert.equal(slots.right[0].x, width);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_SCALE"), 1.28);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_SIZE_RATIO"), 2 / 3);
    assert.ok(slots.left[1].x > slots.height,
      "the top is slightly wider than the slot height");
    assert.ok(slots.left[1].x < slots.height * 1.08,
      "the overall silhouette remains close to a square");
    assert.ok(slots.left[1].x > slots.left[2].x,
      "the top edge is wider than the bottom edge");
    assert.ok(Math.abs(width - slots.right[1].x - slots.left[1].x) < 1e-9);
    assert.ok(Math.abs(width - slots.right[2].x - slots.left[2].x) < 1e-9);
    assert.ok(slots.left[1].x <= header.map.x - (width < 650 ? 8 : 12));
    assert.equal(slots.left.length, 4);
    assert.equal(slots.right.length, 4);
    assert.equal(slots.left[0].x, slots.left[3].x);
    assert.equal(slots.right[0].x, slots.right[3].x);
    assert.equal(slots.left[0].y, slots.left[1].y);
    assert.equal(slots.left[2].y, slots.left[3].y);
    for (let point = 0; point < 4; point += 1) {
      assert.equal(slots.right[point].x, width - slots.left[point].x);
      assert.equal(slots.right[point].y, slots.left[point].y);
    }
  }

  calls.length = 0;
  scope.drawTopVideoSlots();
  assert.equal(calls.filter((call) => call.operation === "clip").length, 2);
  const slotLines = calls.filter((call) => call.operation === "stroke");
  assert.equal(slotLines.length, 2,
    "each video slot has one subtle frame line");
  assert.ok(slotLines.every((call) =>
    call.strokeColor === "rgba(132, 92, 157, 0.42)"),
  "the video frame visually continues the ultimate meter frame");
});

test("the active gun video fills only the clipped left trapezoid", () => {
  const { scope, calls } = createDisplay();
  const video = { videoWidth: 1080, videoHeight: 1080 };
  scope.playerGunVideoAsset = { video, loaded: true, active: true };
  const layout = scope.topVideoSlotLayout();

  scope.drawTopVideoSlots();

  const videoDraws = calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === video);
  assert.equal(videoDraws.length, 1);
  const draw = videoDraws[0].args;
  assert.equal(draw.length, 9);
  assert.equal(draw[5], 0);
  assert.equal(draw[6], 0);
  assert.equal(draw[7], Math.max(layout.left[1].x, layout.left[2].x));
  assert.equal(draw[8], layout.height);
  assert.ok(draw[1] >= 0);
  assert.ok(draw[2] > 0, "the square source is cover-cropped for the wide slot");
  assert.equal(draw[3], video.videoWidth);
  assert.ok(draw[4] < video.videoHeight);
  assert.equal(calls.filter((call) => call.operation === "clip").length, 2);
});

test("the active run video shares the left protagonist slot", () => {
  const { scope, calls } = createDisplay();
  const video = { videoWidth: 480, videoHeight: 480 };
  scope.playerRunVideoAsset = { video, loaded: true, active: true };
  const layout = scope.topVideoSlotLayout();

  scope.drawTopVideoSlots();

  const videoDraws = calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === video);
  assert.equal(videoDraws.length, 1);
  const draw = videoDraws[0].args;
  const slotWidth = Math.max(layout.left[1].x, layout.left[2].x);
  assert.equal(draw[5], 0);
  assert.equal(draw[6], 0);
  assert.equal(draw[7], slotWidth);
  assert.equal(draw[8], layout.height);
});

test("the active stand video shares the left protagonist slot", () => {
  const { scope, calls } = createDisplay();
  const video = { videoWidth: 480, videoHeight: 480 };
  scope.playerStandVideoAsset = { video, loaded: true, active: true };
  const layout = scope.topVideoSlotLayout();

  scope.drawTopVideoSlots();

  const videoDraws = calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === video);
  assert.equal(videoDraws.length, 1);
  const draw = videoDraws[0].args;
  assert.equal(draw[5], 0);
  assert.equal(draw[6], 0);
  assert.equal(draw[7], Math.max(layout.left[1].x, layout.left[2].x));
  assert.equal(draw[8], layout.height);
});

test("the one-shot down video takes priority in the left protagonist slot", () => {
  const { scope, calls } = createDisplay();
  const downVideo = { videoWidth: 480, videoHeight: 480 };
  const standVideo = { videoWidth: 480, videoHeight: 480 };
  scope.playerDownVideoAsset = { video: downVideo, loaded: true, active: true };
  scope.playerStandVideoAsset = { video: standVideo, loaded: true, active: true };

  scope.drawTopVideoSlots();

  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === downVideo).length, 1);
  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === standVideo).length, 0);
});

test("an active enemy attack cut-in fills only the clipped right trapezoid", () => {
  const { scope, calls } = createDisplay();
  const video = {
    videoWidth: 480,
    videoHeight: 480,
    currentTime: 1,
    duration: 3.4,
    playbackRate: 2.9,
  };
  const asset = { video, loaded: true, active: true };
  scope.activeEnemyAttackVideoAsset = () => asset;
  const layout = scope.topVideoSlotLayout();

  scope.drawTopVideoSlots();

  const videoDraws = calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === video);
  assert.equal(videoDraws.length, 1);
  const draw = videoDraws[0].args;
  const width = read(scope, "WIDTH");
  const slotWidth = width - Math.min(
    layout.right[1].x,
    layout.right[2].x,
  );
  assert.equal(draw[5], width - slotWidth);
  assert.equal(draw[6], 0);
  assert.equal(draw[7], slotWidth);
  assert.equal(draw[8], layout.height);
});

test("the monster cut-in fades at its start and end without affecting player videos", () => {
  const { scope } = createDisplay();
  const asset = {
    active: true,
    video: { currentTime: 0.116, duration: 3.4, playbackRate: 2.9 },
  };
  const entering = scope.monsterVideoCutInOpacity(asset);
  asset.video.currentTime = 1;
  const settled = scope.monsterVideoCutInOpacity(asset);
  asset.video.currentTime = 3.168;
  const leaving = scope.monsterVideoCutInOpacity(asset);
  assert.ok(entering > 0 && entering < 1);
  assert.equal(settled, 1);
  assert.ok(leaving > 0 && leaving < 1);
});

test("video slot layers render sharply without gradients or tint and add a subtle HUD line", () => {
  const { scope, canvas, calls } = createDisplay();
  const layerCalls = [];
  const layerStack = [];
  const layerSurfaces = [];
  const layerContext = new Proxy({
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => layerStack.push({ ...target });
      if (key === "restore") return () => Object.assign(target, layerStack.pop());
      if (key === "createLinearGradient") return (...args) => {
        const gradient = { args, stops: [],
          addColorStop(offset, color) { this.stops.push({ offset, color }); } };
        layerCalls.push({ operation: key, args, gradient });
        return gradient;
      };
      return (...args) => layerCalls.push({
        operation: key,
        args,
        composite: target.globalCompositeOperation,
      });
    },
  });
  scope.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      layerSurfaces.push(this);
    }
    getContext() { return layerContext; }
  };
  scope.playerGunVideoAsset = {
    video: { videoWidth: 480, videoHeight: 480, currentTime: 0.5 },
    loaded: true,
    active: true,
  };

  scope.drawTopVideoSlots();

  const layout = scope.topVideoSlotLayout();
  const renderScale = canvas.width / read(scope, "WIDTH");
  assert.equal(layerSurfaces.length, 2);
  assert.equal(layerSurfaces[0].width,
    Math.ceil(Math.max(layout.left[1].x, layout.left[2].x) * renderScale));
  assert.equal(layerSurfaces[0].height, Math.ceil(layout.height * renderScale));
  assert.equal(layerContext.imageSmoothingEnabled, true);
  assert.equal(layerContext.imageSmoothingQuality, "high");
  assert.equal(calls.filter((call) => call.operation === "stroke").length, 0);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 2);
  assert.equal(layerCalls.filter((call) =>
    call.operation === "createLinearGradient").length, 0);
  assert.equal(layerCalls.filter((call) =>
    call.composite === "destination-in").length, 0);
  assert.equal(layerCalls.filter((call) =>
    call.operation === "fillRect").length, 2,
  "each slot has only its flat idle background and no video tint overlay");
  assert.equal(layerCalls.filter((call) =>
    call.operation === "stroke").length, 2,
  "each cached slot layer gets one subtle ultimate-meter border");
});

test("player projectile glow is painted once and reused for every shot", () => {
  const { scope, calls } = createDisplay();
  const spriteCalls = [];
  const spriteContext = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => spriteCalls.push({ operation: key, args });
    },
  });
  let created = 0;
  scope.document.createElement = () => {
    created += 1;
    return { getContext: () => spriteContext };
  };
  read(scope, `bullets.push(
    {x:100,y:100,vx:1520,vy:0,radius:5},
    {x:140,y:100,vx:1520,vy:0,radius:5}
  )`);

  scope.drawProjectiles();
  const paintedCalls = spriteCalls.length;
  assert.equal(created, 1);
  assert.ok(spriteCalls.some((call) => call.operation === "stroke"));
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 2);
  scope.drawProjectiles();
  assert.equal(created, 1);
  assert.equal(spriteCalls.length, paintedCalls);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 4);
});

test("HUD pixel glyphs and hearts reuse their small prerendered sprites", () => {
  const { scope, calls } = createDisplay();
  let created = 0;
  let painted = 0;
  scope.document.createElement = () => {
    created += 1;
    return { getContext: () => ({ scale() {}, fillRect() { painted += 1; } }) };
  };
  const draw = () => {
    scope.drawHudNumerals("000", 10, 20, 2);
    scope.drawPixelText("SCORE", 90, 20, 2, "#99dce5");
    scope.drawPixelHeart(220, 20, 0.5, 2);
  };
  draw();
  const initialCreated = created;
  const initialPainted = painted;
  assert.equal(initialCreated, 7);
  assert.ok(initialPainted > 0);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 9);
  draw();
  assert.equal(created, initialCreated);
  assert.equal(painted, initialPainted);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 18);
});

test("revival orbs and impact rays reuse glow sprites and skip offscreen particles", () => {
  const { scope, calls } = createDisplay();
  let created = 0;
  scope.document.createElement = () => {
    created += 1;
    return { getContext: () => ({
      scale() {}, translate() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
      createRadialGradient: () => ({ addColorStop() {} }),
    }) };
  };
  read(scope, `particles.push(
    {x:100,y:100,angle:0,life:0.9,maxLife:1,size:12,
      color:'#b86cff',coreColor:'#dca9ff',revivalOrb:true},
    {x:130,y:100,vx:400,vy:0,life:0.3,maxLife:0.5,size:3,
      color:'#d99bff',coreColor:'#fff8ff',impactRay:true},
    {x:10000,y:100,angle:0,life:0.9,maxLife:1,size:12,
      color:'#b86cff',coreColor:'#dca9ff',revivalOrb:true}
  )`);
  scope.drawParticles();
  assert.equal(created, 2);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 2);
  scope.drawParticles();
  assert.equal(created, 2);
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 4);
});

test("running shield and revival circles use crisp layers without blurred gradients", () => {
  const { scope } = createDisplay();
  const spriteCalls = [];
  scope.document.createElement = () => ({
    getContext: () => new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => spriteCalls.push({ operation: key, args });
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }),
  });
  scope.getPlayerShieldDotSprite();
  scope.getPlayerRevivalOrbSprite();
  assert.equal(
    spriteCalls.filter((call) => call.operation === "createRadialGradient").length,
    0,
  );
  assert.equal(spriteCalls.filter((call) => call.operation === "arc").length, 6);
  assert.equal(spriteCalls.filter((call) => call.operation === "fill").length, 6);
});

test("non-fireball enemy shots are drawn only near the camera", () => {
  const { scope, calls } = createDisplay();
  read(scope, `enemyBullets.push({kind:'turret-laser',x:10000,y:100,vx:-500,vy:0,radius:8})`);
  calls.length = 0;
  scope.drawProjectiles();
  assert.equal(calls.length, 0);
  read(scope, `enemyBullets.push({kind:'turret-laser',x:100,y:100,vx:-500,vy:0,radius:8})`);
  scope.drawProjectiles();
  assert.ok(calls.some((call) => call.operation === "arc"));
});

test("turret bombs use a red-purple glow from core through outline", () => {
  const { scope, calls, gradients } = createDisplay();
  read(scope, `enemyBullets.push({kind:'turret-laser',x:100,y:100,vx:-500,vy:0,radius:8})`);
  scope.drawProjectiles();
  assert.ok(calls.some((call) => call.operation === "fill" &&
    call.color === "rgba(91, 8, 56, 0.94)" && call.shadowColor === "#dc216f"));
  assert.ok(calls.some((call) => call.operation === "stroke" &&
    call.strokeColor === "rgba(255, 160, 204, 0.92)"));
  const orb = gradients.find((gradient) => gradient.stops.some((stop) =>
    stop.color === "#d93482"));
  assert.deepEqual(orb.stops.map((stop) => stop.color),
    ["#fff3f8", "#ff8abd", "#d93482", "#5b103c"]);
});
