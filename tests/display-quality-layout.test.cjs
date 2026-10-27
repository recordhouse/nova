"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createDisplay(cssWidth = 390, pixelRatio = 3, mobile = false) {
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
  const shellClasses = new Set();
  const shellStyles = new Map();
  const shell = {
    classList: {
      toggle(name, enabled) {
        if (enabled) shellClasses.add(name);
        else shellClasses.delete(name);
      },
    },
    style: {
      getPropertyValue(name) { return shellStyles.get(name) ?? ""; },
      setProperty(name, value) { shellStyles.set(name, value); },
      removeProperty(name) { shellStyles.delete(name); },
    },
  };
  const scope = {
    performance: { now: () => 0 },
    navigator: { maxTouchPoints: mobile ? 5 : 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas
      : selector === ".game-shell" ? shell : null },
    window: { location: { search: "" }, innerWidth: 390, innerHeight: 693,
      devicePixelRatio: pixelRatio, matchMedia: (query) => ({
        matches: mobile && query === "(pointer: coarse)",
      }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, canvas, calls, gradients, shellClasses, shellStyles,
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

test("reduced performance mode lowers backing resolution and effect density", () => {
  const { scope, canvas } = createDisplay(720, 4);
  assert.equal(scope.setAdaptivePerformanceMode(true), true);
  assert.equal(read(scope, "adaptiveRenderScaleCap"), 1.4);
  assert.equal(read(scope, "adaptiveEffectDensity"), 0.7);
  assert.equal(canvas.width, 1008);
  assert.equal(canvas.height, 1792);
  assert.equal(scope.setAdaptivePerformanceMode(true), false);
  assert.equal(scope.setAdaptivePerformanceMode(false), true);
  assert.equal(canvas.width, 1440);
  assert.equal(canvas.height, 2560);
});

test("touch devices start with a landscape game even in a portrait viewport", () => {
  const { scope, canvas, shellClasses, shellStyles } = createDisplay(390, 3, true);
  assert.equal(read(scope, "MOBILE_LANDSCAPE_MODE"), true);
  assert.equal(read(scope, "WIDTH"), 1280);
  assert.equal(read(scope, "HEIGHT"), 720);
  assert.equal(shellClasses.has("mobile-landscape"), true);
  assert.equal(shellClasses.has("mobile-landscape-portrait"), true);
  assert.equal(shellStyles.get("--mobile-game-width"), "693px");
  assert.equal(shellStyles.get("--mobile-game-height"), "389.81px");
  assert.equal(canvas.width, 2080);
  assert.equal(canvas.height, 1170);
  const transformedDelta = scope.screenDeltaToGameDelta(40, 0);
  assert.equal(transformedDelta.dx, 0);
  assert.equal(transformedDelta.dy, -40);

  scope.window.innerWidth = 888;
  scope.window.innerHeight = 500;
  scope.window.visualViewport = { width: 888, height: 292 };
  assert.equal(scope.syncMobileLandscapeShellSize(), true);
  assert.equal(shellClasses.has("mobile-landscape-portrait"), false);
  assert.equal(shellStyles.has("--mobile-game-width"), false);
  assert.equal(shellStyles.has("--mobile-game-height"), false);
  assert.equal(scope.viewportIsLandscape(), true,
    "a shrunken Samsung visual viewport must not override the layout orientation");
});

test("the looping space video replaces the generated star background", () => {
  const { scope, calls, gradients } = createDisplay();
  const video = {
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 4,
  };
  scope.spaceBackgroundVideoAsset = {
    video,
    loaded: true,
    active: true,
  };
  calls.length = 0;
  gradients.length = 0;

  scope.drawBackground();

  const draw = calls.find((call) =>
    call.operation === "drawImage" && call.args[0] === video)?.args;
  assert.ok(draw, "the space video should render as the game background");
  assert.equal(draw[5], 0);
  assert.equal(draw[6], 0);
  assert.equal(draw[7], 720);
  assert.equal(draw[8], 1280);
  assert.equal(gradients.length, 0,
    "the old generated-space gradient should not cover the video");
  assert.equal(calls.some((call) => call.operation === "arc"), false,
    "the old star layer should not be duplicated over the video");
});

test("the HUD groups hearts and ultimates left and stage and score right of the centered map", () => {
  const { scope } = createDisplay();
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const header = scope.hudHeaderLayout();
    const slots = scope.topVideoSlotLayout();
    assert.equal(header.map.y, header.top);
    assert.equal(header.map.x + header.map.width / 2, width / 2);
    const portrait = height > width;
    assert.equal(header.map.width, Math.round(width * (portrait ? 0.44 : 0.38)));
    assert.equal(header.map.height, Math.round(slots.originalHeight * 1.05),
      "the taller minimap keeps its intended proportion beside the videos");
    assert.ok(header.hearts.x + header.hearts.width < header.ultimate.x);
    assert.ok(header.stage.x + header.stage.width < header.score.x);
    const videoBoundary = portrait ? slots.left[2].x : slots.left[1].x;
    assert.ok(header.hearts.x > videoBoundary,
      "the left HUD group clears the enlarged video");
    assert.ok(header.score.x + header.score.width < width - videoBoundary,
      "the right HUD group clears the enlarged video");
    assert.ok(header.ultimate.x + header.ultimate.width <= width / 2);
    assert.ok(header.stage.x >= width / 2);
    assert.equal(header.hearts.width, header.ultimate.width);
    assert.equal(header.stage.width, header.score.width);
    assert.equal(header.hearts.width, header.stage.width);
    assert.ok(header.hearts.width <= 96);
    assert.equal(header.stage.y, header.score.y);
    assert.equal(header.hearts.y, header.stage.y);
    assert.equal(header.ultimate.y, header.stage.y);
    if (portrait) {
      assert.ok(header.infoY > slots.height,
        "portrait status rows sit below the enlarged video");
    } else {
      assert.equal(header.infoY, 13);
    }
    assert.equal(header.map.y, 7);
    assert.ok(header.map.y > 1,
      "the minimap stays clear of the screen-edge frame");
    assert.ok(header.infoY > 10, "status rows keep clear of the top meter");
    assert.ok(header.map.y < 34, "the minimap moves up");
    assert.ok(header.map.y + header.map.height <= 170);
    assert.ok(header.map.width / header.map.height >= 1.6,
      "the minimap remains horizontally oriented at the taller shared height");
  }
});

test("heart, ultimate, stage and score have no underline or background panel", () => {
  const { scope, calls } = createDisplay();
  calls.length = 0;
  scope.drawHud();

  assert.equal(read(scope, "typeof drawHudStatusPanels"), "undefined");
  assert.equal(calls.filter((call) => call.operation === "fillRect" &&
    call.color === "rgba(177, 104, 225, 0.46)").length, 0);
  assert.equal(read(scope, "HUD_STATUS_CONTENT_GLOW"), "rgba(170, 218, 235, 0.38)");
});

test("two mirrored video slots are enlarged fifty percent and keep wider tops", () => {
  const { scope, calls } = createDisplay();
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const header = scope.hudHeaderLayout();
    const slots = scope.topVideoSlotLayout();
    assert.equal(slots.left[0].x, 0);
    assert.equal(slots.right[0].x, width);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_SCALE"), 1.28);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_SIZE_RATIO"), 2 / 3);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_ENLARGEMENT"), 1.5);
    assert.equal(read(scope, "TOP_VIDEO_SLOT_HUD_CLEARANCE"), 1.5);
    assert.ok(Math.abs(slots.height - slots.originalHeight * 1.5) < 1e-9,
      "the video slot is exactly fifty percent larger");
    assert.ok(slots.left[1].x > slots.height,
      "the top is slightly wider than the slot height");
    assert.ok(slots.left[1].x < slots.height * 1.08,
      "the overall silhouette remains close to a square");
    assert.ok(slots.left[1].x > slots.left[2].x,
      "the top edge is wider than the bottom edge");
    assert.ok(Math.abs(width - slots.right[1].x - slots.left[1].x) < 1e-9);
    assert.ok(Math.abs(width - slots.right[2].x - slots.left[2].x) < 1e-9);
    const videoBoundary = height > width ? slots.left[2].x : slots.left[1].x;
    assert.ok(header.hearts.x > videoBoundary,
      "left status items clear the enlarged video");
    assert.ok(header.score.x + header.score.width < width - videoBoundary,
      "right status items clear the enlarged video");
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
    "the shared top frame has a glow stroke and a bright core");
  assert.equal(slotLines[0].strokeColor, "rgba(154, 70, 220, 0.38)");
  assert.equal(slotLines[1].strokeColor, "rgba(122, 226, 240, 0.88)");
  const frameMoves = calls.filter((call) => call.operation === "moveTo").slice(-2);
  const frameLines = calls.filter((call) => call.operation === "lineTo").slice(-4);
  const layout = scope.topVideoSlotLayout();
  assert.deepEqual(frameMoves.map((call) => call.args), [
    [0, layout.height - 1],
    [layout.right[1].x, 1],
  ]);
  assert.deepEqual(frameLines.map((call) => call.args), [
    [layout.left[2].x, layout.height - 1],
    [layout.left[1].x, 1],
    [layout.right[2].x, layout.height - 1],
    [read(scope, "WIDTH"), layout.height - 1],
  ]);
});

test("the matching neon line also frames the full game screen", () => {
  const { scope, calls } = createDisplay();
  calls.length = 0;
  scope.drawGameScreenFrame();

  assert.deepEqual(calls.find((call) => call.operation === "moveTo").args,
    [0.75, 0.75]);
  assert.deepEqual(calls.filter((call) => call.operation === "lineTo")
    .map((call) => call.args), [
      [719.25, 0.75],
      [719.25, 1279.25],
      [0.75, 1279.25],
    ]);
  assert.equal(calls.filter((call) => call.operation === "closePath").length, 1);
  const strokes = calls.filter((call) => call.operation === "stroke");
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].strokeColor, "rgba(154, 70, 220, 0.38)");
  assert.equal(strokes[1].strokeColor, "rgba(122, 226, 240, 0.88)");
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

test("the start voice forces its dedicated footage over every active action video", () => {
  const { scope, calls } = createDisplay();
  const gunVideo = { videoWidth: 480, videoHeight: 480 };
  const runVideo = { videoWidth: 480, videoHeight: 480 };
  const standVideo = { videoWidth: 480, videoHeight: 480 };
  const downVideo = { videoWidth: 480, videoHeight: 480 };
  const startVideo = { videoWidth: 480, videoHeight: 480 };
  scope.playerGunVideoAsset = { video: gunVideo, loaded: true, active: true };
  scope.playerRunVideoAsset = { video: runVideo, loaded: true, active: true };
  scope.playerStandVideoAsset = { video: standVideo, loaded: true, active: true };
  scope.playerDownVideoAsset = { video: downVideo, loaded: true, active: true };
  scope.playerStartVideoAsset = { video: startVideo, loaded: true, active: true };
  scope.isFemaleStartVoiceVideoActive = () => true;

  scope.drawTopVideoSlots();

  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === startVideo).length, 1);
  assert.equal(calls.some((call) => call.operation === "drawImage" &&
    [gunVideo, runVideo, standVideo, downVideo].includes(call.args[0])), false);
});

test("the one-shot down video takes priority in the left protagonist slot", () => {
  const { scope, calls } = createDisplay();
  const downVideo = { videoWidth: 480, videoHeight: 480 };
  const finishingVideo = { videoWidth: 480, videoHeight: 480 };
  const standVideo = { videoWidth: 480, videoHeight: 480 };
  scope.playerDownVideoAsset = { video: downVideo, loaded: true, active: true };
  scope.playerFinishingVideoAsset = { video: finishingVideo, loaded: true, active: true };
  scope.playerStandVideoAsset = { video: standVideo, loaded: true, active: true };

  scope.drawTopVideoSlots();

  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === downVideo).length, 1);
  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === standVideo).length, 0);
  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === finishingVideo).length, 0);
});

test("the finishing video replaces regular action footage during an ultimate", () => {
  const { scope, calls } = createDisplay();
  const finishingVideo = { videoWidth: 480, videoHeight: 480 };
  const gunVideo = { videoWidth: 480, videoHeight: 480 };
  scope.playerFinishingVideoAsset = {
    video: finishingVideo,
    loaded: true,
    active: true,
  };
  scope.playerGunVideoAsset = { video: gunVideo, loaded: true, active: true };

  scope.drawTopVideoSlots();

  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === finishingVideo).length, 1);
  assert.equal(calls.filter((call) =>
    call.operation === "drawImage" && call.args[0] === gunVideo).length, 0);
});

test("the looping basic video fills the idle monster slot", () => {
  const { scope, calls } = createDisplay();
  const video = { videoWidth: 480, videoHeight: 480 };
  scope.monsterBasicVideoAsset = { video, loaded: true, active: true };
  const layout = scope.topVideoSlotLayout();

  scope.drawTopVideoSlots();

  const draw = calls.find((call) =>
    call.operation === "drawImage" && call.args[0] === video)?.args;
  const width = read(scope, "WIDTH");
  const slotWidth = width - Math.min(layout.right[1].x, layout.right[2].x);
  assert.ok(draw);
  assert.equal(draw[5], width - slotWidth);
  assert.equal(draw[7], slotWidth);
  assert.equal(draw[8], layout.height);
});

test("enemy attacks crossfade over the looping basic video", () => {
  const { scope, calls } = createDisplay();
  const basicVideo = { videoWidth: 480, videoHeight: 480 };
  const attackVideo = {
    videoWidth: 480,
    videoHeight: 480,
    currentTime: 0.116,
    duration: 3.4,
    playbackRate: 2.9,
  };
  scope.monsterBasicVideoAsset = {
    video: basicVideo,
    loaded: true,
    active: true,
  };
  const attackAsset = { video: attackVideo, loaded: true, active: true };
  scope.activeEnemyAttackVideoAsset = () => attackAsset;

  scope.drawTopVideoSlots();

  const basicDraw = calls.find((call) =>
    call.operation === "drawImage" && call.args[0] === basicVideo);
  const attackDraw = calls.find((call) =>
    call.operation === "drawImage" && call.args[0] === attackVideo);
  assert.ok(basicDraw, "the idle loop remains behind the cut-in");
  assert.ok(attackDraw.alpha > 0 && attackDraw.alpha < 1,
    "the attack fades in over the idle loop");
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
  assert.equal(calls.filter((call) => call.operation === "stroke").length, 2,
    "the shared highlighted frame is drawn once on the main canvas");
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 2);
  assert.equal(layerCalls.filter((call) =>
    call.operation === "createLinearGradient").length, 0);
  assert.equal(layerCalls.filter((call) =>
    call.composite === "destination-in").length, 0);
  assert.equal(layerCalls.filter((call) =>
    call.operation === "fillRect").length, 2,
  "each slot has only its flat idle background and no video tint overlay");
  assert.equal(layerCalls.filter((call) =>
    call.operation === "stroke").length, 0,
  "cached video layers do not duplicate the shared frame");
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

test("dense ultimate lasers reuse prerendered glow instead of rebuilding blur per ray", () => {
  const { scope, calls } = createDisplay();
  const laserLength = read(scope, "PLAYER_ULTIMATE_LASER_LENGTH");
  let created = 0;
  let painted = 0;
  scope.document.createElement = () => {
    created += 1;
    return { getContext: () => ({
      scale() {}, translate() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() { painted += 1; }, fillRect() {},
    }) };
  };
  const laser = {
    x: 200, y: 300, vx: 900, vy: 0,
    beamLength: laserLength, visibleLength: laserLength, ultimateLane: 4,
  };
  scope.drawPlayerUltimateLaser(laser);
  scope.drawPlayerUltimateLaser(laser);
  assert.equal(created, 1);
  assert.equal(painted, 4,
    "the gun laser's three core layers and trailing glow are painted only into the cache");
  assert.equal(calls.filter((call) => call.operation === "drawImage").length, 2);
  assert.equal(calls.filter((call) => call.operation === "stroke").length, 0);
});

test("the ultimate aura centers on the finishing sprite and fades at its edge", () => {
  const { scope, calls, gradients } = createDisplay();
  read(scope, `
    player.ultimateActive = true;
    player.ultimateTime = PLAYER_ULTIMATE_LIFT_DURATION;
    gameTime = 1;
  `);
  calls.length = 0;

  scope.drawPlayerUltimateAura(false);
  scope.drawPlayerUltimateAura(true);

  const expectedCenterY = read(scope, `player.y + player.height +
    PLAYER_FINISHING_SPRITE_Y_OFFSET -
    PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_FINISHING_SPRITE_SCALE / 2`);
  const translate = calls.find((call) => call.operation === "translate");
  assert.equal(translate.args[1], expectedCenterY);
  assert.equal(gradients.length, 1);
  assert.equal(gradients[0].operation, "createRadialGradient");
  assert.equal(gradients[0].stops.at(-1).offset, 1);
  assert.match(gradients[0].stops.at(-1).color, /, 0\)$/);
  assert.equal(calls.filter((call) => call.operation === "arc").length, 1);
  assert.equal(calls.filter((call) => call.operation === "fill").length, 1);
  assert.equal(calls.filter((call) => call.operation === "stroke").length, 0);
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
