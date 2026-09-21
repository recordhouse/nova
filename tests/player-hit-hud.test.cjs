"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1, globalCompositeOperation: "source-over" }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      if (key === "createRadialGradient" || key === "createLinearGradient") {
        return () => ({ addColorStop() {} });
      }
      return (...args) => {
        assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite));
        calls.push({ operation: key, args, color: target.fillStyle, alpha: target.globalAlpha });
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game"
      ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    platforms.push({kind:'flat',id:999,start:-1000,end:2000,y:500,features:[]});
    player.x=400; player.y=420; player.hp=3; player.maxHp=3;
    player.invincible=0; gameOver=false; cameraX=0; cameraY=0;
  `, scope);
  return { scope, calls };
}

function read(scope, expression) { return vm.runInContext(expression, scope); }

test("each real enemy or tower hit creates a large colored burst and stronger shake", () => {
  const accents = new Map([
    ["monster1", "#b0ff73"],
    ["monster2-fireball", "#ffae68"],
    ["monster3-laser", "#ffd58d"],
    ["turret-laser", "#ff83b9"],
    ["boss", "#ff8edb"],
  ]);
  for (const [kind, accent] of accents) {
    const { scope, calls } = createGame();
    assert.equal(scope.takePlayerDamage(1, { kind, x: 300, y: 460 }), true);
    assert.equal(read(scope, "player.hp"), 2);
    assert.equal(read(scope, "particles.filter((particle) => particle.impactFlash).length"), 1);
    assert.equal(read(scope, "particles.filter((particle) => particle.impactRay).length"), 32);
    assert.equal(read(scope, "particles[0].color"), accent);
    assert.ok(read(scope, "shake") >= 22);
    scope.drawParticles();
    assert.ok(calls.some((call) => call.operation === "arc"));
    assert.ok(calls.filter((call) => call.operation === "rotate").length >= 32);
    assert.equal(scope.takePlayerDamage(1, { kind, x: 300, y: 460 }), false);
    assert.equal(read(scope, "particles.length"), 33, "invincibility blocks duplicate bursts");
  }
});

test("monster fireballs and turret/monster3 lasers trigger the shared impact on contact", () => {
  for (const kind of ["monster2-fireball", "monster3-laser", "turret-laser"]) {
    const { scope } = createGame();
    read(scope, `enemyBullets.push({kind:'${kind}',x:422,y:460,vx:0,vy:0,
      radius:8,remainingRange:500,riseAcceleration:0,maxRicochets:3})`);
    scope.updateBullets(0);
    assert.equal(read(scope, "player.hp"), 2);
    assert.equal(read(scope, "particles.filter((particle) => particle.impactFlash).length"), 1);
    assert.ok(read(scope, "shake") >= 22);
  }
});

test("HUD numerals use a distinct nine-row pixel face for every digit", () => {
  const { scope, calls } = createGame();
  const glyphs = read(scope, "HUD_NUMERAL_GLYPHS");
  assert.equal(Object.keys(glyphs).length, 10);
  assert.equal(new Set(Object.values(glyphs).map((glyph) => glyph.join(""))).size, 10);
  assert.ok(Object.values(glyphs).every((glyph) => glyph.length === 9 &&
    glyph.every((row) => row.length === 7)));
  scope.drawHudNumerals("0123456789", 10, 20, 3);
  assert.ok(calls.some((call) => call.operation === "fillRect" && call.color === "#ffffff"));
  assert.ok(calls.some((call) => call.operation === "fillRect" && call.color === "#a6cdd6"));
});

test("score, stage and ten hearts remain aligned without overlapping in both layouts", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.hudLabels=[]; globalThis.hudNumbers=[]; globalThis.hudHearts=[];
    drawPixelText=(text,x,y,scale,color)=>hudLabels.push({text,x,y,scale,color});
    drawHudNumerals=(text,x,y,scale)=>hudNumbers.push({text,x,y,scale});
    drawPixelHeart=(x,y,fill,scale)=>hudHearts.push({x,y,fill,scale});
    drawMinimap=()=>{};
    player.maxHp=10; player.hp=9.5;
  `);
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height};
      hudLabels.length=0; hudNumbers.length=0; hudHearts.length=0;`);
    scope.drawHud();
    const labels = read(scope, "hudLabels");
    const numbers = read(scope, "hudNumbers");
    const hearts = read(scope, "hudHearts");
    assert.equal(hearts.length, 10);
    assert.equal(labels[0].color, labels[1].color);
    assert.equal(labels[0].scale, numbers[0].scale);
    const scoreEnd = numbers[0].x + scope.hudNumeralWidth(numbers[0].text, numbers[0].scale);
    const stageEnd = numbers[1].x + scope.hudNumeralWidth(numbers[1].text, numbers[1].scale);
    assert.ok(scoreEnd + 5 <= labels[1].x, `${width}px score/stage overlap`);
    assert.ok(stageEnd + 5 <= Math.min(...hearts.map((heart) => heart.x)),
      `${width}px stage/hearts overlap`);
    assert.equal(new Set(hearts.map((heart) => heart.y)).size, width < height ? 2 : 1);
  }
});
