"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => Object.assign(target, stack.pop());
      if (key === "createRadialGradient" || key === "createLinearGradient") {
        return () => ({ addColorStop() {} });
      }
      return (...args) => calls.push({ operation: key, args });
    },
  });
  const canvas = { getContext: () => ctx, addEventListener() {} };
  const scope = {
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    document: {
      querySelector: (selector) => selector === "#game" ? canvas : null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      location: { search: "?test=1" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
    Image: class {
      naturalWidth = 1055;
      naturalHeight = 1491;
      set src(source) { this.source = source; this.onload?.(); }
    },
  };
  vm.createContext(scope);
  for (const name of [
    "config", "assets", "state", "world", "combat", "player", "enemies", "renderer",
  ]) {
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  vm.runInContext(`
    enemies.length=0; turrets.length=0; midBosses.length=0;
    bullets.length=0; enemyBullets.length=0; particles.length=0;
    platforms.length=0; heartItems.length=0;
    globalThis.fixtureRoad={kind:'flat',id:999,start:0,end:3000,y:600,features:[],direction:1};
    platforms.push(fixtureRoad);
    globalThis.fixtureEnemy=addEnemy(fixtureRoad,500,'monster5');
    player.x=1050; player.y=600-player.height; player.platform=fixtureRoad;
    player.hp=3; player.maxHp=3; player.invincible=0; player.downPhase=''; gameOver=false;
    cameraX=0; cameraY=0; minWorldX=0; maxWorldX=3000; lowestPlatformY=600;
  `, scope);
  calls.length = 0;
  return { scope, calls };
}

function read(scope, expression) {
  return vm.runInContext(expression, scope);
}

test("monster5 uses the new tall sprite and patrols while floating above the road", () => {
  const png = fs.readFileSync(path.join(root, "assets/images/monsters/monster_05.png"));
  assert.equal(png.readUInt32BE(16), 1055);
  assert.equal(png.readUInt32BE(20), 1491);

  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  assert.equal(enemy.hp, 6);
  assert.equal(enemy.spriteWidth, 106);
  assert.equal(enemy.spriteHeight, 150);
  assert.ok(enemy.y + enemy.height < 600 - 180);
  assert.equal(read(scope, "enemySprites.monster5.loaded"), true);
  assert.match(read(scope, "enemySprites.monster5.image.source"), /monster_05\.png/);
  const startX = enemy.x;
  const startY = enemy.y;
  enemy.attackTimer = 10;
  scope.updateEnemies(0.5);
  assert.notEqual(enemy.x, startX);
  assert.notEqual(enemy.y, startY);
  scope.drawEnemy(enemy);
  assert.ok(calls.some((call) => call.operation === "drawImage"));
});

test("monster5 charges and fires one sparkling blue homing orb with a five-second fuse", () => {
  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.attackTimer = 0;
  scope.updateEnemies(0);
  assert.equal(enemy.state, "charge");
  scope.drawEnemy(enemy);
  assert.ok(calls.some((call) => call.operation === "arc"), "charge rings are visible");

  scope.updateEnemies(enemy.chargeDuration);
  const orb = read(scope, "enemyBullets[0]");
  assert.equal(orb.kind, "monster5-orb");
  assert.equal(orb.life, 5);
  assert.equal(orb.maxLife, 5);
  assert.equal(orb.maxRicochets, 999);
  assert.equal(orb.ricochetScreenEdges, true);
  assert.equal(orb.keepOffscreen, true);
  assert.equal(scope.sourceIsEnemyAttack(orb), true);
  calls.length = 0;
  scope.drawProjectiles();
  assert.ok(calls.filter((call) => call.operation === "arc").length >= 4);
  assert.ok(calls.some((call) => call.operation === "fillRect"));
});

test("the blue orb bounces, steers toward the player and explodes after five seconds", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.attackTimer = 0;
  scope.updateEnemies(0);
  scope.updateEnemies(enemy.chargeDuration);
  const orb = read(scope, "enemyBullets[0]");

  orb.x = 900;
  orb.y = 570;
  orb.vx = -orb.speed;
  orb.vy = 120;
  const initialTargetAngle = Math.atan2(
    read(scope, "player.y+player.height/2") - orb.y,
    read(scope, "player.x+player.width/2") - orb.x,
  );
  const initialDifference = Math.abs(Math.atan2(
    Math.sin(initialTargetAngle - Math.atan2(orb.vy, orb.vx)),
    Math.cos(initialTargetAngle - Math.atan2(orb.vy, orb.vx)),
  ));
  scope.updateBullets(1 / 60);
  const nextTargetAngle = Math.atan2(
    read(scope, "player.y+player.height/2") - orb.y,
    read(scope, "player.x+player.width/2") - orb.x,
  );
  const nextDifference = Math.abs(Math.atan2(
    Math.sin(nextTargetAngle - Math.atan2(orb.vy, orb.vx)),
    Math.cos(nextTargetAngle - Math.atan2(orb.vy, orb.vx)),
  ));
  assert.ok(nextDifference < initialDifference, "the orb turns toward the player");

  orb.x = 700;
  orb.y = 570;
  orb.vx = 0;
  orb.vy = orb.speed;
  scope.updateBullets(0.08);
  assert.ok(orb.ricochets >= 1);
  assert.ok(orb.vy < 0, "the road reflects the orb upward");

  const playerCenterX = read(scope, "player.x+player.width/2");
  const playerCenterY = read(scope, "player.y+player.height/2");
  orb.x = playerCenterX;
  orb.y = playerCenterY;
  orb.life = 0.01;
  read(scope, "player.invincible=0; player.downPhase=''; player.hp=3");
  scope.updateBullets(0.02);
  assert.equal(read(scope, "enemyBullets.length"), 0);
  assert.equal(read(scope, "player.hp"), 2);
  assert.equal(read(scope, "particles.some(particle=>particle.monster5OrbBlast)"), true);
});

test("generated stages and test controls expose monster5", () => {
  const { scope } = createGame();
  scope.resetGame();
  assert.ok(read(scope, "enemies.some(enemy=>enemy.kind==='monster5')"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /data-test-spawn-monster5/);
  assert.match(fs.readFileSync(path.join(root, "js/input.js"), "utf8"),
    /spawnTestMonster\("monster5"\)/);
});
