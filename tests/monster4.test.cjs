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
      return (...args) => calls.push({
        operation: key,
        args,
        filter: target.filter,
      });
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

test("monster4 turns red, charges, then fires one short-range crescent", () => {
  const { scope, calls } = createMonsterGame();
  const monster4 = scope.monster4;
  vm.runInContext(`
    monster1.alive=false;
    cameraX=600;
    monster4.state='chase'; monster4.attackTimer=0;
    player.hp=3; player.invincible=0; player.downPhase='';
    player.accelerationShieldCharges=0;
    enemyBullets.length=0;
    globalThis.attackVideoRequests=[];
    playEnemyAttackVideo=(kind,now,source)=>attackVideoRequests.push({kind,now,source});
  `, scope);

  scope.updateEnemies(0);
  assert.equal(monster4.state, "chase", "the spear must not charge from long range");
  assert.equal(monster4.spearAttackRange, 180);
  vm.runInContext("player.x=880", scope);
  scope.updateEnemies(0);
  assert.equal(monster4.state, "spear-charge");
  assert.equal(vm.runInContext("attackVideoRequests.length", scope), 1);
  assert.equal(vm.runInContext("attackVideoRequests[0].kind", scope), "monster4");
  assert.equal(vm.runInContext("attackVideoRequests[0].source", scope), monster4);
  assert.equal(vm.runInContext("enemyBullets.length", scope), 0);

  monster4.stateTimer = monster4.spearChargeDuration / 2;
  calls.length = 0;
  scope.drawEnemy(monster4);
  const chargedSprite = calls.find((call) => call.operation === "drawImage");
  assert.match(chargedSprite.filter, /sepia\(1\).*hue-rotate/);

  scope.updateEnemies(monster4.spearChargeDuration / 2 - 0.01);
  assert.equal(vm.runInContext("enemyBullets.length", scope), 0);
  scope.updateEnemies(0.02);
  const spear = vm.runInContext("enemyBullets[0]", scope);
  assert.equal(monster4.state, "spear-recover");
  assert.equal(spear.kind, "monster4-crescent");
  assert.equal(spear.maxRicochets, 0);
  assert.equal(spear.radius, 13);
  assert.equal(spear.remainingRange, 220);
  assert.equal(spear.initialRange, 220);
  assert.equal(Math.round(Math.hypot(spear.vx, spear.vy)), monster4.spearSpeed);
  assert.equal(scope.sourceIsEnemyAttack(spear), true);
  calls.length = 0;
  scope.drawProjectiles();
  assert.equal(calls.filter((call) => call.operation === "arc").length, 2,
    "the projectile uses an outer arc and an offset cutout arc");
  assert.ok(calls.some((call) =>
    call.operation === "fill" && call.args[0] === "evenodd"),
  "the offset inner disk is cut out to form a real crescent silhouette");
  assert.ok(calls.filter((call) => call.operation === "fillRect").length >= 6,
    "the crescent keeps bright pixel highlights and a short broken trail");

  for (let frame = 0; frame < 90 && vm.runInContext("player.hp", scope) === 3; frame += 1) {
    scope.updateBullets(1 / 60);
  }
  assert.equal(vm.runInContext("player.hp", scope), 2);
  assert.equal(vm.runInContext("enemyBullets.length", scope), 0);
});

test("monster1 requests its attack video when a visible jump windup starts", () => {
  const { scope } = createMonsterGame();
  const monster1 = scope.monster1;
  vm.runInContext(`
    monster4.alive=false;
    player.x=330; player.y=600-player.height;
    monster1.state='chase'; monster1.jumpCooldown=0;
    globalThis.attackVideoRequests=[];
    playEnemyAttackVideo=(kind,now,source)=>attackVideoRequests.push({kind,now,source});
  `, scope);

  scope.updateEnemies(0);

  assert.equal(monster1.state, "windup");
  assert.equal(vm.runInContext("attackVideoRequests.length", scope), 1);
  assert.equal(vm.runInContext("attackVideoRequests[0].kind", scope), "monster1");
  assert.equal(vm.runInContext("attackVideoRequests[0].source", scope), monster1);
});

test("visible monster types request first-encounter introductions", () => {
  const { scope } = createMonsterGame();
  vm.runInContext(`
    player.x=1200; cameraX=0; cameraY=0;
    globalThis.introductionRequests=[];
    queueEnemyIntroductionVideo=(kind,distance)=>introductionRequests.push({kind,distance});
  `, scope);

  scope.updateEnemies(0);

  const kinds = vm.runInContext(
    "introductionRequests.map(request=>request.kind).sort().join(',')",
    scope,
  );
  assert.equal(kinds, "monster1,monster4");
  assert.ok(vm.runInContext(
    "introductionRequests.every(request=>Number.isFinite(request.distance))",
    scope,
  ));
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
