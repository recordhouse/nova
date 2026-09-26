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

test("the four header regions and minimap stay separate in portrait and landscape", () => {
  const { scope } = createDisplay();
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const header = scope.hudHeaderLayout();
    assert.equal(header.map.y, header.top);
    assert.equal(header.map.x + header.map.width, width - (width < 650 ? 18 : 22));
    assert.ok(header.score.x + header.score.width <= header.stage.x);
    assert.ok(header.stage.x + header.stage.width <= header.hearts.x);
    assert.ok(header.hearts.x + header.hearts.width + 8 <= header.map.x);
    assert.ok(header.map.y + header.map.height <= 150);
  }
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
