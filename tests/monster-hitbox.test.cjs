"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => {
        assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite));
        calls.push({ operation: key, args });
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "?test=1" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    enemySprites: {
      monster1: { loaded: true, image: { naturalWidth: 298, naturalHeight: 316 } },
      monster2: { loaded: true, image: { naturalWidth: 309, naturalHeight: 338 } },
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    globalThis.fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:600};
    platforms.push(fixtureRoad);
    globalThis.monster1=addEnemy(fixtureRoad,200,'monster1');
    globalThis.monster2=addEnemy(fixtureRoad,600,'monster2');
    for(const enemy of enemies) {
      enemy.animationTime=0; enemy.animationPhase=0; enemy.hitTimer=0; enemy.moving=false;
    }
    player.x=1000; cameraX=0; cameraY=0;
  `, scope);
  return { scope, calls };
}

function read(scope, code) { return vm.runInContext(code, scope); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test("updated monster1 image keeps its visible feet on the road and its old gameplay footprint", () => {
  const png = fs.readFileSync(path.join(__dirname, "..", "assets", "images", "monsters", "monster_01.png"));
  assert.equal(png.readUInt32BE(16), 298);
  assert.equal(png.readUInt32BE(20), 316);
  const { scope } = createGame();
  const enemy = scope.monster1;
  // Alpha >= 16 occupies x=10..294 and y=19..298 in the replacement PNG.
  const visibleWidth = enemy.spriteWidth * (294 - 10 + 1) / 298;
  const visibleBottom = enemy.spriteBottomOffset - enemy.spriteHeight * (316 - 299) / 316;
  assert.ok(visibleWidth >= 84 && visibleWidth <= 88);
  assert.ok(Math.abs(visibleBottom) < 1);
  assert.ok(Math.abs(scope.getEnemyHitbox(enemy).height - 83.34) < 1);
  assert.equal(enemy.width, 64);
  assert.equal(enemy.height, 72);
});

test("monster upper hitbox boundaries match visible bodies, excluding PNG padding", () => {
  const { scope } = createGame();
  const expectedHeights = { monster1: 83.34810126582278, monster2: 217.84615384615384 };
  for (const kind of ["monster1", "monster2"]) {
    const enemy = scope[kind];
    const box = scope.getEnemyHitbox(enemy);
    near(box.height, expectedHeights[kind]);
    near(box.y, 600 - expectedHeights[kind]);
    assert.equal(box.x, enemy.x);
    assert.equal(box.width, enemy.width);
    near(box.y + box.height, 600);
    near(enemy.y + enemy.height, 600);
    assert.ok(box.y < enemy.y, "the old upper boundary missed part of the visible body");
  }
});

test("hitbox tops follow the actual rendered sprite transforms in every animation state", () => {
  const { scope, calls } = createGame();
  for (const kind of ["monster1", "monster2"]) {
    const enemy = scope[kind];
    const states = kind === "monster1" ? ["chase", "windup", "jump", "recover"] : ["chase", "inhale", "shoot"];
    for (const state of states) for (const facing of [-1, 1]) for (let step = 0; step <= 10; step += 1) {
      enemy.state = state;
      enemy.stateTimer = (kind === "monster2" ? enemy.inhaleDuration : enemy.jumpWindupDuration) * step / 10;
      enemy.animationTime = step * 0.17;
      enemy.animationPhase = 0.3;
      enemy.moving = step % 2 === 0;
      enemy.facing = enemy.attackDirection = facing;
      enemy.hitTimer = enemy.hitDuration * step / 10;
      enemy.hitDirection = facing;
      enemy.fireRecoilTimer = 0.12 * step / 10;
      calls.length = 0;
      scope.drawEnemy(enemy);
      const bodyIndex = calls.findIndex((call) => call.operation === "drawImage");
      const body = calls[bodyIndex];
      const bodyCalls = calls.slice(0, bodyIndex);
      const anchor = bodyCalls.find((call) => call.operation === "translate");
      const transform = bodyCalls.find((call) => call.operation === "transform");
      const visibleTop = anchor.args[1] +
        (body.args[2] + body.args[4] * enemy.spriteTopInset) * transform.args[3];
      const hitbox = scope.getEnemyHitbox(enemy);
      near(hitbox.y, visibleTop);
      near(hitbox.y + hitbox.height, enemy.y + enemy.height);
      assert.ok(hitbox.width > 0 && hitbox.height > 0);
    }
  }
});

for (const kind of ["monster1", "monster2"]) {
  test(`${kind} takes damage from a bullet in its formerly missing upper-body area`, () => {
    const { scope } = createGame();
    const enemy = scope[kind];
    const box = scope.getEnemyHitbox(enemy);
    const hp = enemy.hp;
    assert.ok(box.y + 4 < enemy.y - 3);
    read(scope, `bullets.push({x:${enemy.x + enemy.width / 2},y:${box.y + 4},vx:1520,vy:0,radius:3})`);
    scope.updateBullets(0);
    assert.equal(enemy.hp, hp - 1);
    assert.equal(read(scope, "bullets.length"), 0);
  });

  test(`${kind} does not take damage from bullets above its visible head`, () => {
    const { scope } = createGame();
    const enemy = scope[kind];
    const box = scope.getEnemyHitbox(enemy);
    const hp = enemy.hp;
    read(scope, `bullets.push({x:${enemy.x + enemy.width / 2},y:${box.y - 10},vx:1520,vy:0,radius:3})`);
    scope.updateBullets(0);
    assert.equal(enemy.hp, hp);
    assert.equal(read(scope, "bullets.length"), 1);
  });
}

test("prospective hitbox checks preserve the enemy and shift with its predicted position", () => {
  const { scope } = createGame();
  const enemy = scope.monster2;
  const before = { ...enemy };
  const original = scope.getEnemyHitbox(enemy);
  const moved = scope.getEnemyHitbox(enemy, enemy.x + 15, enemy.y - 70);
  assert.equal(moved.x, original.x + 15);
  near(moved.y, original.y - 70);
  near(moved.height, original.height);
  assert.deepEqual({ ...enemy }, before);
});

test("monster1 jump attacks use the visible upper-body region for player contact", () => {
  const { scope } = createGame();
  const enemy = scope.monster1;
  enemy.y = 500;
  enemy.state = "jump";
  enemy.jumpVy = -10;
  enemy.jumpVx = 0;
  enemy.jumpOriginSurfaceY = 600;
  const box = scope.getEnemyHitbox(enemy);
  read(scope, `player.x=${enemy.x + enemy.width / 2}-player.width/2;
    player.y=${box.y + 5}-player.height; player.grounded=false`);
  assert.equal(scope.overlapsRects(enemy, read(scope, "getPlayerHitbox()")), false);
  scope.updateEnemies(0);
  assert.equal(read(scope, "player.hp"), 2);
  assert.equal(read(scope, "player.downPhase"), "fall");
});

test("spawning blocks upper/lower monsters whose visible bodies overlap despite separate old rectangles", () => {
  const { scope } = createGame();
  const upperRoad = { kind: "flat", id: 2, start: 0, end: 2000, y: 405 };
  const enemy = scope.addEnemy(upperRoad, 620, "monster1");
  assert.equal(enemy, null);
});

test("ground movement respects upper-body collision regions without changing feet or jumping rules", () => {
  const { scope } = createGame();
  const upperRoad = { kind: "flat", id: 2, start: 0, end: 2000, y: 405 };
  read(scope, "platforms.push({kind:'flat',id:2,start:0,end:2000,y:405})");
  const upper = scope.addEnemy(upperRoad, 100, "monster1");
  upper.animationTime = upper.animationPhase = 0;
  assert.equal(scope.enemyRectOverlapsEnemy(620, upper.y, upper.width, upper.height, upper), true);
  assert.equal(scope.moveEnemyAlongGround(upper, 1, 1.04, 500), false);
  assert.equal(upper.x, 100);
  assert.equal(upper.y + upper.height, 405);
});

test("airborne body overlap resolution also separates corrected upper regions", () => {
  const { scope } = createGame();
  const upper = scope.monster1;
  upper.x = 625;
  upper.y = 333;
  upper.state = "jump";
  upper.jumpVy = 20;
  upper.jumpOriginSurfaceY = 405;
  const lower = scope.monster2;
  assert.equal(scope.overlapsRects(upper, lower), false);
  assert.equal(scope.overlapsRects(scope.getEnemyHitbox(upper), scope.getEnemyHitbox(lower)), true);
  scope.resolveJumpingEnemyBodyCollisions(upper);
  const a = scope.getEnemyHitbox(upper);
  const b = scope.getEnemyHitbox(lower);
  assert.ok(a.y + a.height + 8 <= b.y + 1e-8);
  assert.equal(upper.jumpVy, 0);
});

test("the player revival wave can contact the corrected upper-body region", () => {
  const { scope } = createGame();
  const enemy = scope.monster2;
  read(scope, `player.x=${enemy.x + enemy.width / 2}-player.width/2; player.y=252-player.height`);
  const wave = { x: enemy.x + enemy.width / 2, y: 180, radius: 240 };
  assert.equal(scope.overlapsCircleRect(wave, enemy), false);
  assert.equal(scope.overlapsCircleRect(wave, scope.getEnemyHitbox(enemy)), true);
  scope.emitPlayerRevival();
  assert.equal(Math.abs(enemy.hitKnockbackVelocity), 1500);
});

test("M AREA includes a visible head even when its old collision rectangle was offscreen", () => {
  const { scope, calls } = createGame();
  const enemy = scope.monster2;
  read(scope, "showMonsterArea=true");
  enemy.y = 1320;
  const box = scope.getEnemyHitbox(enemy);
  assert.ok(box.y < 1280);
  calls.length = 0;
  scope.drawCombatantPhysicsDebug(enemy, "#ff96ec");
  const rectangle = calls.find((call) => call.operation === "strokeRect");
  assert.ok(rectangle);
  assert.deepEqual(rectangle.args, [box.x, box.y, box.width, box.height]);
});

test("normal rendering does not cull a stretched head that is still visible", () => {
  const { scope, calls } = createGame();
  read(scope, "enemies.splice(0,1)");
  const enemy = scope.monster2;
  enemy.y = 1384;
  enemy.state = "inhale";
  enemy.stateTimer = 0;
  enemy.hitTimer = enemy.hitDuration;
  enemy.hitDirection = 1;
  assert.ok(enemy.y > 1280 + 100);
  assert.ok(scope.getEnemyHitbox(enemy).y < 1280);
  for (const name of ["drawTerrain", "drawBossGate", "drawTurret", "drawMidBoss", "drawPlayer",
    "drawPlayerPhysicsDebug", "drawProjectiles", "drawParticles"]) scope[name] = () => {};
  calls.length = 0;
  scope.drawWorld();
  assert.ok(calls.some((call) => call.operation === "drawImage"));
});
