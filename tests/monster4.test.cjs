"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function load(scope, names) {
  vm.createContext(scope);
  for (const name of names) {
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  return scope;
}

function createMonsterGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => Object.assign(target, stack.pop());
      return (...args) => calls.push({ operation: key, args });
    },
  });
  const canvas = { getContext: () => ctx, addEventListener() {} };
  const scope = load({
    performance: { now: () => 0 },
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
      naturalWidth = 314;
      naturalHeight = 350;
      set src(source) {
        this.source = source;
        this.onload?.();
      }
    },
  }, ["config", "assets", "state", "world", "combat", "enemies", "renderer"]);
  vm.runInContext(`
    globalThis.fixtureRoad={kind:'flat',id:1,start:0,end:3000,y:600,direction:1};
    platforms.push(fixtureRoad);
    globalThis.monster1=addEnemy(fixtureRoad,200,'monster1');
    globalThis.monster4=addEnemy(fixtureRoad,700,'monster4');
    player.x=1200; player.y=600-player.height; player.platform=fixtureRoad;
    cameraX=0; cameraY=0;
    for(const enemy of enemies) {
      enemy.animationTime=0; enemy.animationPhase=0; enemy.moving=false;
    }
  `, scope);
  calls.length = 0;
  return { scope, calls };
}

function createMapGame() {
  let seed = 7331;
  const math = Object.create(Math);
  math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return load({
    Math: math,
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game"
        ? { getContext: () => ({ setTransform() {} }) } : null,
    },
    window: {
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
    },
  }, ["config", "state", "world", "combat", "player", "enemies"]);
}

test("monster4 uses its new sprite, has three HP and keeps monster1 behavior", () => {
  const png = fs.readFileSync(path.join(root, "assets/images/monsters/monster_04.png"));
  assert.equal(png.readUInt32BE(16), 314);
  assert.equal(png.readUInt32BE(20), 350);

  const { scope, calls } = createMonsterGame();
  const monster1 = scope.monster1;
  const monster4 = scope.monster4;
  assert.equal(monster4.hp, 3);
  assert.equal(monster4.maxHp, 3);
  assert.equal(monster4.spriteWidth, 115);
  assert.equal(monster4.spriteHeight, 129);
  assert.equal(monster4.speed, monster1.speed);
  assert.equal(monster4.jumpGravity, monster1.jumpGravity);
  assert.equal(monster4.jumpLaunchSpeed, monster1.jumpLaunchSpeed);
  assert.equal(monster4.jumpWindupDuration, monster1.jumpWindupDuration);
  assert.ok(monster4.jumpAttackRange > monster1.jumpAttackRange);
  assert.ok(monster4.jumpGapRange > monster1.jumpGapRange);
  assert.ok(monster4.jumpMaxHorizontalSpeed > monster1.jumpMaxHorizontalSpeed);
  assert.equal(vm.runInContext("enemySprites.monster4.loaded", scope), true);
  assert.ok(vm.runInContext(
    "enemySprites.monster4.image.source.includes('/monster_04.png?')",
    scope,
  ));

  scope.drawEnemy(monster4);
  const spriteIndex = calls.findIndex((call) => call.operation === "drawImage");
  assert.ok(spriteIndex >= 0);
  assert.equal(
    calls.slice(0, spriteIndex).some((call) => call.operation === "fillRect"),
    false,
    "monster4 must not draw the old ground-shadow rectangles",
  );
  const hitbox = scope.getEnemyHitbox(monster4);
  assert.equal(hitbox.y + hitbox.height, monster4.y + monster4.height);
});

test("monster4 jumps farther than monster1 and its airborne body damages the player", () => {
  const { scope } = createMonsterGame();
  const monster1 = scope.monster1;
  const monster4 = scope.monster4;
  scope.launchEnemyJump(monster1, monster1.x + monster1.width / 2 + 1000);
  scope.launchEnemyJump(monster4, monster4.x + monster4.width / 2 + 1000);
  assert.equal(Math.abs(monster1.jumpVx), monster1.jumpMaxHorizontalSpeed);
  assert.equal(Math.abs(monster4.jumpVx), monster4.jumpMaxHorizontalSpeed);
  assert.ok(Math.abs(monster4.jumpVx) > Math.abs(monster1.jumpVx));

  vm.runInContext(`
    monster1.alive=false;
    monster4.x=400; monster4.y=500; monster4.state='jump';
    monster4.jumpVx=0; monster4.jumpVy=-10;
    monster4.jumpOriginSurfaceY=600; monster4.jumpHit=false;
    const box=getEnemyHitbox(monster4);
    player.x=box.x+box.width/2-player.width/2;
    player.y=monster4.y+monster4.height-player.height-10;
    player.grounded=false; player.hp=3; player.invincible=0; player.downPhase='';
  `, scope);
  assert.equal(vm.runInContext(
    "overlapsRects(getEnemyHitbox(monster4),getPlayerHitbox())",
    scope,
  ), true);
  scope.updateEnemies(0);
  assert.equal(vm.runInContext("player.hp", scope), 2);
  assert.equal(monster4.jumpHit, true);
});

test("natural ground groups mix monster4 at one third of monster1's frequency", () => {
  const scope = createMapGame();
  assert.equal(vm.runInContext("MONSTER4_TO_MONSTER1_SPAWN_RATIO", scope), 1 / 3);
  assert.equal(vm.runInContext("MONSTER4_GROUP_SLOT_CHANCE", scope), 1 / 4);
  const counts = vm.runInContext(`(() => {
    let monster1Count=0, monster4Count=0;
    for(let map=0;map<100;map+=1) {
      resetGame();
      monster1Count+=enemies.filter(enemy=>enemy.kind==='monster1').length;
      monster4Count+=enemies.filter(enemy=>enemy.kind==='monster4').length;
    }
    return {monster1Count,monster4Count};
  })()`, scope);
  assert.ok(counts.monster1Count > 0 && counts.monster4Count > 0);
  const ratio = counts.monster4Count / counts.monster1Count;
  assert.ok(ratio > 0.28 && ratio < 0.39, `observed monster4:monster1 ratio ${ratio}`);
});
