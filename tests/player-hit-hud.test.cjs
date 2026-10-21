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

test("enemy, projectile, turret and boss hits keep the directional burst and stronger shake", () => {
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

test("player hit burst keeps its reach while using thin impact lines", () => {
  const { scope, calls } = createGame();
  scope.drawPlayerImpactFlash({
    x: 400,
    y: 460,
    life: 0.3,
    maxLife: 0.44,
    color: "#ff83b9",
  });
  const lines = calls.filter((call) => call.operation === "fillRect");
  assert.equal(lines.length, 32);
  assert.ok(lines.every((line) => line.args[3] <= 2));
  assert.ok(lines.some((line) => line.args[2] >= 30),
    "the thinner hit lines keep their original reach");
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

test("five HUD regions keep score, hearts, map, empty ultimates and stage separated", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.hudLabels=[]; globalThis.hudNumbers=[]; globalThis.hudHearts=[];
    globalThis.hudUltimates=[];
    drawPixelText=(text,x,y,scale,color)=>hudLabels.push({text,x,y,scale,color});
    drawHudNumerals=(text,x,y,scale)=>hudNumbers.push({text,x,y,scale});
    drawPixelHeart=(x,y,fill,scale)=>hudHearts.push({x,y,fill,scale});
    drawPixelUltimateSlot=(x,y,filled,scale)=>hudUltimates.push({x,y,filled,scale});
    drawMinimap=()=>{};
    player.maxHp=3; player.hp=2.5;
  `);
  for (const [width, height] of [[540, 960], [720, 1280], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height};
      hudLabels.length=0; hudNumbers.length=0; hudHearts.length=0;
      hudUltimates.length=0; player.ultimateCharges=0;`);
    scope.drawHud();
    const labels = read(scope, "hudLabels");
    const numbers = read(scope, "hudNumbers");
    const hearts = read(scope, "hudHearts");
    const ultimates = read(scope, "hudUltimates");
    const header = scope.hudHeaderLayout();
    assert.equal(hearts.length, 3);
    assert.equal(ultimates.length, 3);
    assert.ok(ultimates.every((slot) => slot.filled === false));
    assert.equal(labels[0].color, labels[1].color);
    assert.equal(labels[0].scale, 1);
    assert.equal(numbers[0].scale, 7 / 9);
    assert.ok(numbers.every((number) => number.scale === numbers[0].scale));
    assert.equal(labels[0].scale * 7, numbers[0].scale * 9);
    assert.ok(Math.abs(labels[0].y - numbers[0].y) <= 1);
    assert.ok(Math.abs(labels[1].y - numbers[1].y) <= 1);
    assert.ok(numbers[0].x > labels[0].x, "score stays on one line");
    assert.ok(numbers[1].x > labels[1].x, "stage stays on one line");
    assert.equal(read(scope, "HUD_INFO_TEXT_VISUAL_SCALE"), 1.72);
    assert.ok(hearts.every((heart) => heart.scale === hearts[0].scale));
    assert.ok(hearts[0].scale > 1.5 && hearts[0].scale <= 3.2);
    assert.ok(ultimates.every((slot) => slot.scale === ultimates[0].scale));
    assert.ok(ultimates[0].scale > 1.5 && ultimates[0].scale <= 3.2);
    const scoreEnd = numbers[0].x + scope.hudNumeralWidth(numbers[0].text, numbers[0].scale);
    const stageEnd = numbers[1].x + scope.hudNumeralWidth(numbers[1].text, numbers[1].scale);
    const scoreRowWidth = scoreEnd - labels[0].x;
    const stageRowWidth = stageEnd - labels[1].x;
    const infoVisualScale = Math.min(
      read(scope, "HUD_INFO_TEXT_VISUAL_SCALE"),
      header.score.width / scoreRowWidth,
      header.stage.width / stageRowWidth,
    );
    const scoreCenterX = header.score.x + header.score.width / 2;
    const stageCenterX = header.stage.x + header.stage.width / 2;
    const visualScoreStart = scoreCenterX + (labels[0].x - scoreCenterX) * infoVisualScale;
    const visualScoreEnd = scoreCenterX + (scoreEnd - scoreCenterX) * infoVisualScale;
    const visualStageStart = stageCenterX + (labels[1].x - stageCenterX) * infoVisualScale;
    const visualStageEnd = stageCenterX + (stageEnd - stageCenterX) * infoVisualScale;
    assert.ok(visualScoreEnd <= header.score.x + header.score.width,
      `${width}px score leaves its region`);
    assert.ok(visualScoreStart >= header.score.x, `${width}px score leaves its region`);
    assert.ok(header.score.x >= width / 2,
      `${width}px score is not in the right-side group`);
    assert.equal(header.score.y, 13);
    assert.equal(header.map.y, 7);
    assert.ok(visualStageStart >= header.stage.x &&
      visualStageEnd <= header.stage.x + header.stage.width,
    `${width}px stage leaves its region`);
    assert.ok(header.stage.x < header.score.x, `${width}px stage and score overlap`);
    assert.ok(header.hearts.x < header.ultimate.x &&
      header.ultimate.x + header.ultimate.width <= width / 2,
    `${width}px hearts and ultimates are not grouped on the left`);
    assert.ok(header.hearts.width <= 96 && header.ultimate.width <= 96,
      `${width}px side icons stay in the inner safe regions`);
    const layoutTolerance = 1e-9;
    assert.ok(hearts.every((heart) =>
      heart.x >= header.hearts.x - layoutTolerance &&
      heart.x + 7 * heart.scale <=
        header.hearts.x + header.hearts.width + layoutTolerance));
    assert.ok(ultimates.every((slot) =>
      slot.x >= header.ultimate.x - layoutTolerance &&
      slot.x + 7 * slot.scale <=
        header.ultimate.x + header.ultimate.width + layoutTolerance));
    const rowCenterY = header.infoY + header.infoHeight / 2;
    assert.ok(hearts.every((heart) =>
      Math.abs(heart.y + 3 * heart.scale - rowCenterY) < 1e-9));
    assert.ok(ultimates.every((slot) =>
      Math.abs(slot.y + 3.5 * slot.scale - rowCenterY) < 1e-9));
  }
});

test("score fills the top meter and converts every fifteen hundred points into an ultimate", () => {
  const { scope } = createGame();
  for (const [width, height] of [[540, 960], [960, 540], [1280, 720]]) {
    read(scope, `WIDTH=${width}; HEIGHT=${height}`);
    const layout = scope.ultimateMeterLayout();
    assert.equal(layout.x, 0);
    assert.equal(layout.y, 0);
    assert.equal(layout.width, width);
    assert.equal(layout.height, 6);
    assert.equal(layout.inset, 1);
  }
  assert.equal(read(scope, "ULTIMATE_SCORE_PER_CHARGE"), 1500);
  scope.addPlayerScore(1400);
  assert.equal(read(scope, "player.ultimateCharges"), 0);
  assert.equal(read(scope, "player.ultimateMeterScore"), 1400);
  assert.ok(Math.abs(read(scope, "ultimateMeterFillRatio()") - 14 / 15) < 1e-9);

  scope.addPlayerScore(200);
  assert.equal(read(scope, "player.ultimateCharges"), 1);
  assert.equal(read(scope, "player.ultimateMeterScore"), 100);
  assert.ok(Math.abs(read(scope, "ultimateMeterFillRatio()") - 1 / 15) < 1e-9);

  scope.addPlayerScore(4400);
  assert.equal(read(scope, "player.ultimateCharges"), 3);
  assert.equal(read(scope, "player.ultimateMeterScore"), 0);
  assert.equal(read(scope, "ultimateMeterFillRatio()"), 1);
});

test("gaining score changes only the numerals in discrete digital steps", () => {
  const { scope, calls } = createGame();
  read(scope, `
    globalThis.hudNumbers=[];
    drawHudNumerals=(text,x,y,scale)=>hudNumbers.push({text,x,y,scale});
    drawMinimap=()=>{};
    gameTime=2;
  `);
  scope.addPlayerScore(150);
  assert.equal(read(scope, "player.score"), 150);
  assert.equal(read(scope, "player.scoreGainAmount"), 150);
  read(scope, "gameTime+=0.2");
  calls.length = 0;
  scope.drawHud();
  const numbers = read(scope, "hudNumbers");
  assert.equal(numbers.length, 2);
  assert.ok(Number(numbers[0].text) > 0 && Number(numbers[0].text) < 150);
  assert.equal(calls.filter((call) => call.operation === "rotate").length, 0);

  read(scope, `gameTime+=HUD_SCORE_DIGITAL_DURATION; hudNumbers.length=0;`);
  calls.length = 0;
  scope.drawHud();
  assert.equal(read(scope, "hudNumbers.length"), 2);
  assert.equal(read(scope, "hudNumbers[0].text"), "150");
  assert.equal(calls.filter((call) => call.operation === "rotate").length, 0);
});
