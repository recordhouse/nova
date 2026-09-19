"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => calls.push({ operation: key, args, color: target.fillStyle });
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    enemySprites: {
      monster1: { loaded: true, image: { naturalWidth: 298, naturalHeight: 316 } },
      monster2: { loaded: true, image: { naturalWidth: 309, naturalHeight: 338 } },
    },
    turretSprite: { loaded: true, image: { naturalWidth: 302, naturalHeight: 400 } },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500};
    platforms.push(fixtureRoad);
    globalThis.monster1=addEnemy(fixtureRoad,200,'monster1');
    globalThis.monster2=addEnemy(fixtureRoad,600,'monster2');
    for(const enemy of enemies) { enemy.animationTime=0; enemy.animationPhase=0; enemy.moving=false; }
  `, scope);
  return { scope, calls };
}

function gaugeRects(scope, calls, enemy) {
  calls.length = 0;
  scope.drawEnemy(enemy);
  const spriteIndex = calls.findIndex((call) => call.operation === "drawImage");
  assert.ok(spriteIndex >= 0);
  return calls.slice(spriteIndex + 1).filter((call) => call.operation === "fillRect");
}

test("both monsters use the player's layered pixel gauge shape, centered over their sprites", () => {
  const { scope, calls } = createGame();
  for (const [enemy, width] of [[scope.monster1, 48], [scope.monster2, 64]]) {
    const rects = gaugeRects(scope, calls, enemy);
    assert.equal(rects.length, 5);
    const [outer, border, track, fill, highlight] = rects;
    const centerX = enemy.x + enemy.width / 2;
    const top = enemy.y + enemy.height - enemy.spriteHeight + enemy.spriteBottomOffset - 13;
    assert.equal(outer.color, "rgba(4, 7, 10, 0.88)");
    assert.equal(border.color, "rgba(220, 231, 239, 0.6)");
    assert.equal(track.color, "rgba(33, 38, 43, 0.94)");
    assert.deepEqual(track.args, [centerX - width / 2, top, width, 8]);
    assert.deepEqual(outer.args, [track.args[0] - 3, top - 3, width + 6, 14]);
    assert.equal(fill.color, "hsl(120, 92%, 52%)");
    assert.deepEqual(fill.args, [track.args[0] + 2, top + 2, width - 4, 4]);
    assert.equal(highlight.color, "hsl(120, 92%, 76%)");
    assert.deepEqual(highlight.args, [fill.args[0], fill.args[1], width - 4, 2]);
  }
});

test("monster HP changes the pixel fill from green to yellow to red without changing the turret bar", () => {
  const { scope, calls } = createGame();
  for (const [hp, hue, width] of [[10, 120, 60], [6, 60, 36], [3, 0, 18]]) {
    scope.monster2.hp = hp;
    const rects = gaugeRects(scope, calls, scope.monster2);
    assert.equal(rects[3].color, `hsl(${hue}, 92%, 52%)`);
    assert.equal(rects[3].args[2], width);
    assert.equal(rects[4].color, `hsl(${hue}, 92%, 76%)`);
    assert.equal(rects[4].args[2], width);
  }
  scope.monster1.hp = 1;
  assert.equal(gaugeRects(scope, calls, scope.monster1)[3].color, "hsl(60, 92%, 52%)");

  calls.length = 0;
  scope.drawTurret({ x: 1000, y: 344, width: 108, height: 156, hp: 15, maxHp: 15,
    facing: 1, active: false, fireTimer: 4, burstShotsRemaining: 0, recoilTimer: 0, hitTimer: 0 });
  assert.ok(calls.some((call) => typeof call.color === "string" && call.color.startsWith("hsl(")));
});

test("monster gauges stay above the animated sprite during jumps and charge-up", () => {
  const { scope, calls } = createGame();
  for (const [enemy, state] of [[scope.monster1, "jump"], [scope.monster2, "inhale"]]) {
    calls.length = 0;
    scope.drawEnemy(enemy);
    const idleTop = calls.find((call) => call.color === "rgba(33, 38, 43, 0.94)").args[1];
    enemy.state = state;
    enemy.stateTimer = 0;
    calls.length = 0;
    scope.drawEnemy(enemy);
    const track = calls.find((call) => call.color === "rgba(33, 38, 43, 0.94)");
    const pose = scope.enemySpritePose(enemy);
    assert.ok(track.args[1] < idleTop - 5);
    assert.equal(track.args[1], Math.round(
      pose.feetY + (-enemy.spriteHeight + enemy.spriteBottomOffset) * pose.scaleY - 13,
    ));
  }
});
