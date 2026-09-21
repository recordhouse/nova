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
        calls.push({ operation: key, args, color: target.fillStyle });
      };
    },
  });
  const canvas = { getContext: () => ctx, addEventListener() {} };
  const scope = {
    performance: { now: () => 0 }, requestAnimationFrame() {},
    document: { querySelector: (selector) => selector === "#game" ? canvas : null,
      querySelectorAll: () => [], addEventListener() {} },
    window: { location: { search: "?test=1" }, addEventListener() {},
      innerWidth: 720, innerHeight: 1280, matchMedia: () => ({ matches: false }) },
    Image: class {
      naturalWidth = 310;
      naturalHeight = 372;
      set src(source) { this.source = source; this.onload?.(); }
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets", "state", "world", "combat", "player", "enemies", "renderer", "input", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  const generated = vm.runInContext(`({
    monster3: enemies.filter((enemy) => enemy.kind === "monster3").length,
    hearts: heartItems.length,
    eligibleRoads: platforms.filter((platform) =>
      platform.kind === "flat" && platform.routeRole === "main" &&
      !platform.startingRoad && platform.end - platform.start >= 132
    ).length,
    eligibleFlyerRoads: platforms.filter((platform) =>
      platform.kind === "flat" && platform.routeRole === "main" &&
      !platform.startingRoad && platform.end - platform.start >= MONSTER_TYPES.monster3.spawnMinPlatformLength
    ).length,
  })`, scope);
  vm.runInContext(`
    enemies.length=0; turrets.length=0; midBosses.length=0;
    bullets.length=0; enemyBullets.length=0; particles.length=0;
    platforms.length=0; heartItems.length=0;
    globalThis.fixtureRoad={kind:'flat',id:999,start:0,end:2000,y:500,features:[]};
    platforms.push(fixtureRoad);
    globalThis.fixtureEnemy=addEnemy(fixtureRoad,400,'monster3');
    player.x=700; player.y=420; player.platform=fixtureRoad;
    player.hp=3; player.maxHp=3; player.invincible=0; gameOver=false;
    cameraX=0; cameraY=0;
  `, scope);
  calls.length = 0;
  return { scope, calls, generated };
}

function read(scope, expression) { return vm.runInContext(expression, scope); }

test("generated stages place flying monsters and collectible hearts along the route", () => {
  const { generated } = createGame();
  assert.ok(generated.hearts >= 7, `heart count: ${generated.hearts}, roads: ${generated.eligibleRoads}`);
  assert.ok(generated.monster3 > 0, `monster3 count: ${generated.monster3}, roads: ${generated.eligibleFlyerRoads}`);
});

test("monster3 has a modestly higher spawn chance", () => {
  const { scope } = createGame();
  assert.equal(read(scope, "MONSTER_TYPES.monster3.spawnChance"), 0.28);
});

test("monster3 floats above the road, uses its sprite and has five HP", () => {
  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  assert.equal(enemy.hp, 5);
  assert.equal(enemy.maxHp, 5);
  assert.equal(read(scope, "enemySprites.monster3.loaded"), true);
  assert.ok(read(scope, "enemySprites.monster3.image.source").includes("/monster_03.png?"));
  assert.ok(enemy.y + enemy.height < 500 - 140);
  const firstY = enemy.y;
  enemy.attackTimer = 10;
  scope.updateEnemies(0.35);
  assert.notEqual(enemy.y, firstY);
  scope.drawEnemy(enemy);
  assert.ok(calls.some((call) => call.operation === "drawImage"));
});

test("M3 test spawning and collision-area drawing work for the flying body", () => {
  const { scope, calls } = createGame();
  const spawned = scope.spawnTestMonster("monster3");
  assert.ok(spawned);
  assert.equal(spawned.kind, "monster3");
  read(scope, "showMonsterArea=true");
  calls.length = 0;
  scope.drawEnemyAwarenessDebug(spawned);
  scope.drawCombatantPhysicsDebug(spawned, "#ffbd78");
  const hitbox = scope.getEnemyHitbox(spawned);
  assert.ok(calls.some((call) => call.operation === "strokeRect" &&
    call.args[0] === hitbox.x && call.args[1] === hitbox.y));
});

test("monster3 charges its eye and fires exactly one aimed laser", () => {
  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.attackTimer = 0;
  scope.updateEnemies(0.016);
  assert.equal(enemy.state, "charge");
  assert.equal(read(scope, "enemyBullets.length"), 0);
  scope.drawEnemy(enemy);
  assert.ok(calls.some((call) => call.operation === "arc"), "eye charge is visible");
  scope.updateEnemies(enemy.chargeDuration);
  const shots = read(scope, "enemyBullets");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].kind, "monster3-laser");
  assert.equal(shots[0].maxRicochets, 3);
  assert.ok(Math.abs(Math.hypot(shots[0].vx, shots[0].vy) - enemy.laserSpeed) < 1e-7);
  scope.updateEnemies(0.1);
  assert.equal(shots.length, 1);
});

test("monster3 laser bounces off a road three times and expires on the next hit", () => {
  const { scope } = createGame();
  const bullet = { kind: "monster3-laser", x: 1000, y: 450,
    vx: 0, vy: 600, radius: 5, maxRicochets: 3 };
  for (let ricochets = 1; ricochets <= 3; ricochets += 1) {
    assert.equal(scope.moveRicochetingBullet(bullet, 0.1, "#ffad68"), true);
    assert.equal(bullet.ricochets, ricochets);
    assert.ok(bullet.vy < 0);
    bullet.y = 450;
    bullet.vy = 600;
  }
  assert.equal(scope.moveRicochetingBullet(bullet, 0.1, "#ffad68"), false);
});

test("five player hits destroy monster3 and grant its score", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const hitbox = scope.getEnemyHitbox(enemy);
  const x = hitbox.x + hitbox.width / 2;
  const y = hitbox.y + hitbox.height / 2;
  for (let hit = 1; hit <= 5; hit += 1) {
    read(scope, `bullets.push({x:${x},y:${y},vx:0,vy:0,radius:4})`);
    scope.updateBullets(0);
    assert.equal(enemy.hp, 5 - hit);
  }
  assert.equal(enemy.alive, false);
  assert.equal(read(scope, "player.score"), enemy.score);
});

test("heart pickups add capacity up to ten, then heal without exceeding it", () => {
  const { scope } = createGame();
  for (let pickup = 0; pickup < 7; pickup += 1) {
    read(scope, "heartItems.push({x:722,y:460,radius:14,phase:0})");
    scope.updateHeartItems();
  }
  assert.equal(read(scope, "player.maxHp"), 10);
  assert.equal(read(scope, "player.hp"), 10);
  read(scope, "heartItems.push({x:722,y:460,radius:14,phase:0})");
  scope.updateHeartItems();
  assert.equal(read(scope, "heartItems.length"), 1, "a full player leaves the pickup on the road");
  read(scope, "player.hp=9.5");
  scope.updateHeartItems();
  assert.equal(read(scope, "player.hp"), 10);
  assert.equal(read(scope, "heartItems.length"), 0);
  scope.resetGame();
  assert.equal(read(scope, "player.maxHp"), 3);
});

test("orientation changes carry floating monsters and heart pickups with the road", () => {
  const { scope } = createGame();
  read(scope, "heartItems.push({x:900,y:458,radius:14,phase:0,platform:fixtureRoad})");
  const originalGround = read(scope, "BASE_GROUND_Y");
  const originalHover = scope.fixtureEnemy.hoverBaseY;
  const originalHeart = read(scope, "heartItems[0].y");
  scope.resizeGameResolution(1280, 720);
  const shift = read(scope, "BASE_GROUND_Y") - originalGround;
  assert.equal(scope.fixtureEnemy.hoverBaseY, originalHover + shift);
  assert.equal(read(scope, "heartItems[0].y"), originalHeart + shift);
});

test("larger heart pickups float visibly and cast a bright halo", () => {
  const { scope, calls } = createGame();
  scope.resetGame();
  assert.equal(read(scope, "heartItems[0].radius"), 26);
  assert.equal(read(scope, "heartItems[0].y"),
    read(scope, "platformSurfaceY(heartItems[0].platform, heartItems[0].x) - 54"));
  read(scope, `heartItems.length=0;
    heartItems.push({x:350,y:450,radius:26,phase:0});
    globalThis.itemHeartDraws=[];
    drawPixelHeart=(x,y,fill,scale)=>itemHeartDraws.push({x,y,fill,scale});
    gameTime=0; cameraX=0; cameraY=0;
  `);
  scope.drawHeartItems();
  const firstY = read(scope, "itemHeartDraws[0].y");
  assert.equal(read(scope, "itemHeartDraws[0].scale"), 6);
  assert.ok(calls.some((call) => call.operation === "arc" && call.args[2] >= 60));
  read(scope, "gameTime=Math.PI / (2 * 2.1)");
  scope.drawHeartItems();
  assert.equal(read(scope, "itemHeartDraws[1].y") - firstY, 9);
});

test("collecting a heart bursts into a bright core, heart shards and rays", () => {
  const { scope, calls } = createGame();
  read(scope, `
    player.hp=2; player.maxHp=3;
    heartItems.push({x:722,y:460,radius:26,phase:0});
  `);
  scope.updateHeartItems();
  assert.equal(read(scope, "heartItems.length"), 0);
  assert.equal(read(scope, "particles.filter(p=>p.heartPickupFlash).length"), 1);
  assert.equal(read(scope, "particles.filter(p=>p.heartPickupShard).length"), 10);
  assert.equal(read(scope, "particles.filter(p=>p.impactRay).length"), 16);
  assert.ok(read(scope, "shake") >= 4);
  const particleCount = read(scope, "particles.length");
  calls.length = 0;
  scope.drawParticles();
  assert.ok(calls.some((call) => call.operation === "arc" && call.args[2] >= 25));
  assert.ok(calls.some((call) => call.operation === "fillRect" && call.color === "#ff4f5f"));
  assert.equal(read(scope, "particles.length"), particleCount,
    "rendering the pickup burst should not allocate more particles");
});

test("the portrait HUD arranges ten pixel hearts in two rows", () => {
  const { scope } = createGame();
  read(scope, `player.maxHp=10; player.hp=9.5;
    globalThis.heartDraws=[];
    drawPixelHeart=(x,y,fill,scale)=>heartDraws.push({x,y,fill,scale});
    drawMinimap=()=>{};
  `);
  scope.drawHud();
  const draws = read(scope, "heartDraws");
  assert.equal(draws.length, 10);
  assert.equal(new Set(Array.from(draws, (draw) => draw.y)).size, 2);
  assert.equal(draws.at(-1).fill, 0.5);
});
