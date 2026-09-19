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
      return (...args) => {
        assert.ok(args.filter((arg) => typeof arg === "number").every(Number.isFinite));
        if (key === "fillRect") {
          assert.ok(args[2] >= 0 && args[3] >= 0);
          assert.ok(target.globalAlpha >= 0 && target.globalAlpha <= 1);
        }
        calls.push({ operation: key, args, color: target.fillStyle, alpha: target.globalAlpha });
      };
    },
  });
  const canvas = { getContext: () => ctx };
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    enemySprites: { monster2: { loaded: true, image: { naturalWidth: 309, naturalHeight: 338 } } },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500};
    platforms.push(fixtureRoad);
    globalThis.fixtureEnemy=addEnemy(fixtureRoad,400,'monster2');
  `, scope);
  return { scope, calls };
}

function startVolley(scope, direction = 1) {
  const enemy = scope.fixtureEnemy;
  enemy.state = "inhale";
  enemy.stateTimer = 0;
  enemy.facing = enemy.attackDirection = direction;
  scope.updateMonster2(enemy, 0, { x: 0, y: 0, width: 10, height: 10 }, 10000, 500);
  return enemy;
}

function shots(scope) {
  return vm.runInContext("enemyBullets", scope);
}

test("a volley fires five enlarged fireballs at varied forward angles", () => {
  const { scope } = createGame();
  const enemy = startVolley(scope);
  assert.equal(shots(scope).length, 1);
  for (let count = 2; count <= 5; count += 1) {
    scope.updateMonster2Volley(enemy, 0.199);
    assert.equal(shots(scope).length, count - 1);
    scope.updateMonster2Volley(enemy, 0.001);
    assert.equal(shots(scope).length, count);
  }
  scope.updateMonster2Volley(enemy, enemy.fireballRecovery + 0.001);
  assert.equal(enemy.state, "chase");
  assert.equal(shots(scope).length, 5);
  assert.ok(shots(scope).every((shot) => shot.kind === "monster2-fireball" && shot.radius === 22));
  const angles = shots(scope).map((shot) => Math.atan2(shot.vy, Math.abs(shot.vx)));
  assert.equal(new Set(angles.map((angle) => angle.toFixed(3))).size, 5);
  assert.ok(angles.every((angle) => Math.abs(angle) < 0.06));
});

test("fireballs travel forward in both directions and expire at the configured range", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  vm.runInContext("player.x=10000", scope);
  for (const direction of [-1, 1]) {
    vm.runInContext("enemyBullets.length=0", scope);
    startVolley(scope, direction);
    const bullet = shots(scope)[0];
    const origin = scope.monster2AttackOrigin(enemy);
    scope.updateBullets(0.2);
    assert.ok(Math.abs(bullet.x - origin.x - bullet.vx * 0.2) < 1e-9);
    assert.ok(bullet.y < origin.y, "the fireball starts rising after moving forward");
    assert.ok(Math.abs(bullet.remainingRange - (490 - Math.abs(bullet.vx) * 0.2)) < 1e-9);
    const firstRise = origin.y - bullet.y;
    scope.updateBullets(0.2);
    assert.ok(origin.y - bullet.y > firstRise * 2, "upward speed increases during flight");
    scope.updateBullets(1);
    assert.equal(shots(scope).length, 0);
    assert.ok(Math.abs(bullet.x - origin.x - direction * 490) < 1e-9);
  }
});

test("monster2 visibly charges before launching its five-shot volley", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const targetX = enemy.x + enemy.width / 2 + 480;
  const safeRect = { x: 0, y: 0, width: 10, height: 10 };
  enemy.attackTimer = 0;
  scope.updateMonster2(enemy, 1 / 60, safeRect, targetX, 500);
  assert.equal(enemy.state, "inhale");
  assert.equal(enemy.stateTimer, 0.9);
  scope.updateMonster2(enemy, 0.89, safeRect, targetX, 500);
  assert.equal(enemy.state, "inhale");
  assert.equal(shots(scope).length, 0);
  scope.updateMonster2(enemy, 0.02, safeRect, targetX, 500);
  assert.equal(enemy.state, "shoot");
  assert.equal(shots(scope).length, 1);
  scope.updateMonster2(enemy, 2, safeRect, targetX, 500);
  assert.equal(enemy.state, "chase");
  assert.equal(shots(scope).length, 5);
  assert.ok(enemy.attackTimer >= 2.4 * 0.85 && enemy.attackTimer <= 2.4 * 1.15);
  assert.ok(enemy.ambientFireTimer >= 2.8 && enemy.ambientFireTimer <= 6.5);
});

test("charge grows visibly, renders over the body, and creates no persistent particles", () => {
  const { scope, calls } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.state = "inhale";
  const particlesBefore = vm.runInContext("particles.length", scope);
  const coreWidths = [];
  for (const direction of [-1, 1]) {
    enemy.facing = enemy.attackDirection = direction;
    for (const progress of [0, 0.5, 1]) {
      calls.length = 0;
      enemy.stateTimer = enemy.inhaleDuration * (1 - progress);
      scope.drawEnemy(enemy);
      const bodyIndex = calls.findIndex((call) => call.operation === "drawImage");
      const chargeIndex = calls.findIndex((call) => call.color === "#ff7835");
      assert.ok(chargeIndex > bodyIndex);
      assert.equal(calls.filter((call) => call.color === "#ffac62").length, 12);
      coreWidths.push(calls.find((call) => call.color === "#ffd76c").args[2]);
    }
  }
  assert.ok(coreWidths[2] > coreWidths[0]);
  assert.equal(vm.runInContext("particles.length", scope), particlesBefore);
});

test("monster2's walking sprite widens without a vertically squashed step", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.animationTime = 0;
  enemy.animationPhase = 0;
  enemy.moving = false;
  const idle = scope.enemySpritePose(enemy);
  enemy.moving = true;
  const walking = scope.enemySpritePose(enemy);
  assert.ok(walking.scaleX > idle.scaleX);
  assert.ok(walking.scaleY >= idle.scaleY);
  enemy.animationTime = Math.PI / 18;
  assert.ok(scope.enemySpritePose(enemy).scaleY >= 1);
});

test("pixel fireballs have an attached tapered tail and fade without particle allocation", () => {
  const { scope, calls } = createGame();
  const particlesBefore = vm.runInContext("particles.length", scope);
  for (const direction of [-1, 1]) {
    vm.runInContext("enemyBullets.length=0", scope);
    startVolley(scope, direction);
    calls.length = 0;
    const bullet = shots(scope)[0];
    const before = { ...bullet };
    scope.drawProjectiles();
    const tail = calls.filter((call) => call.operation === "fillRect" &&
      (call.color === "#d83b1f" || call.color === "#e64b21") && call.args[2] === 8);
    assert.equal(tail.length, 9);
    assert.ok(tail[0].args[0] < -bullet.radius * 2);
    assert.ok(tail[0].args[3] < tail.at(-1).args[3], "tail widens toward the head");
    assert.ok(calls.some((call) => call.color === "#ffd45a"));
    assert.ok(calls.some((call) => call.color === "#fff5c6"));
    assert.ok(calls.filter((call) => call.operation === "fillRect").every((call) => call.args[2] <= 44));
    assert.deepEqual({ ...bullet }, before);
    bullet.remainingRange = 80;
    calls.length = 0;
    scope.drawProjectiles();
    assert.ok(calls.some((call) => call.operation === "fillRect" && call.alpha < 0.5));
    Object.assign(bullet, before);
  }
  assert.equal(vm.runInContext("particles.length", scope), particlesBefore);
});

test("monster2 can fire outside range when its random ambient timer expires", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const safeRect = { x: 0, y: 0, width: 10, height: 10 };
  for (const [distance, height] of [[200, 500], [900, 500], [-900, 500], [1500, 1200]]) {
    enemy.state = "chase";
    enemy.attackTimer = 0;
    enemy.ambientFireTimer = 0;
    scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + distance, height);
    assert.equal(enemy.state, "inhale");
    assert.equal(enemy.attackDirection, Math.sign(distance));
    assert.equal(enemy.stateTimer, enemy.inhaleDuration);
  }
});

test("autonomous attacks repeat offscreen without generating invisible particles", () => {
  const { scope } = createGame();
  vm.runInContext("player.x=10000; player.y=500-player.height; cameraX=10000", scope);
  const enemy = scope.fixtureEnemy;
  let charges = 0;
  for (let frame = 0; frame < 2160; frame += 1) {
    const previousState = enemy.state;
    scope.updateBullets(1 / 60);
    scope.updateEnemies(1 / 60);
    if (enemy.state === "inhale" && previousState !== "inhale") charges += 1;
    assert.ok(shots(scope).length <= 5, "offscreen projectiles must not accumulate");
  }
  assert.ok(charges >= 3, "fire cycles must continue even when no player is in range");
  assert.equal(vm.runInContext("particles.length", scope), 0);
  assert.equal(vm.runInContext("player.hp", scope), 3);
});

test("a fireball fired offscreen survives the camera edge and flies into view", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  enemy.x = 1000;
  vm.runInContext("player.x=10000", scope);
  startVolley(scope, -1);
  const bullet = shots(scope)[0];
  scope.updateBullets(0.01);
  assert.equal(shots(scope).length, 1);
  assert.ok(bullet.x > 820);
  scope.updateBullets(0.6);
  assert.equal(shots(scope).length, 1);
  assert.ok(bullet.x < 720 && bullet.x > 0);
  assert.equal(vm.runInContext("particles.length", scope), 0);
});

test("entering range does not bypass cooldown or turn a charging attack around", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const safeRect = { x: 0, y: 0, width: 10, height: 10 };
  enemy.attackTimer = 1;
  scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + 200, 500);
  assert.equal(enemy.state, "chase");
  enemy.attackTimer = 0;
  scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + 200, 500);
  assert.equal(enemy.state, "inhale");
  scope.updateMonster2(enemy, 0.1, safeRect, enemy.x + enemy.width / 2 - 200, 500);
  assert.equal(enemy.state, "inhale");
  assert.equal(enemy.attackDirection, 1);
});

test("outside range waits for the random timer, but entering range starts charging immediately when ready", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const safeRect = { x: 0, y: 0, width: 10, height: 10 };
  enemy.attackTimer = 0;
  enemy.ambientFireTimer = 5;
  scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + 900, 500);
  assert.equal(enemy.state, "chase");
  scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + 200, 900);
  assert.equal(enemy.state, "chase", "another floor does not count as entering attack range");
  scope.updateMonster2(enemy, 1 / 60, safeRect, enemy.x + enemy.width / 2 + 200, 500);
  assert.equal(enemy.state, "inhale");
  assert.ok(enemy.ambientFireTimer > 4, "targeted attacks do not wait for the ambient timer");
});

test("new monsters have distinct random first-fire delays while monster1 is unchanged", () => {
  const { scope } = createGame();
  const timers = vm.runInContext(`(() => {
    mapRandom=createSeededRandom(918273);
    const monsters=[0,800,1100,1400,1700].map(x=>addEnemy(fixtureRoad,x,'monster2'));
    const monster1=addEnemy(fixtureRoad,200,'monster1');
    return {delays:monsters.map(e=>e.ambientFireTimer),
      monster1Delay:monster1.ambientFireTimer,monster1Cooldown:monster1.attackTimer};
  })()`, scope);
  assert.equal(new Set(timers.delays).size, 5);
  assert.ok(timers.delays.every((delay) => delay >= 2.8 && delay <= 6.5));
  assert.equal(timers.monster1Delay, 0);
  assert.equal(timers.monster1Cooldown, 0);
});

test("each completed attack rerolls ambient and targeted cooldowns", () => {
  const { scope } = createGame();
  const enemy = scope.fixtureEnemy;
  const randomValues = [0.1, 0.8, 0.9, 0.2];
  scope.Math = Object.create(Math);
  scope.Math.random = () => randomValues.shift();
  const delays = [];
  for (let attack = 0; attack < 2; attack += 1) {
    enemy.state = "shoot";
    enemy.stateTimer = 0.01;
    enemy.fireballsFired = enemy.fireballCount;
    scope.updateMonster2(enemy, 0.02, { x: 0, y: 0, width: 10, height: 10 }, 10000, 500);
    delays.push({ ambient: enemy.ambientFireTimer, targeted: enemy.attackTimer });
  }
  assert.notEqual(delays[0].ambient, delays[1].ambient);
  assert.notEqual(delays[0].targeted, delays[1].targeted);
  for (const delay of delays) {
    assert.ok(delay.ambient >= 2.8 && delay.ambient <= 6.5);
    assert.ok(delay.targeted >= 2.4 * 0.85 && delay.targeted <= 2.4 * 1.15);
  }
});

test("fine and coarse frame steps never skip or add shots", () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.25, 2]) {
    const { scope } = createGame();
    const enemy = startVolley(scope);
    while (enemy.state === "shoot") scope.updateMonster2Volley(enemy, dt);
    assert.equal(shots(scope).length, 5);
    assert.equal(enemy.fireballsFired, 5);
  }
});

test("firing itself does not damage the player; only a moving fireball makes contact", () => {
  const { scope } = createGame();
  const enemy = startVolley(scope);
  const origin = scope.monster2AttackOrigin(enemy);
  vm.runInContext(`player.x=${origin.x + 200}-player.width/2; player.y=500-player.height`, scope);
  scope.updateMonster2Volley(enemy, 0.8);
  assert.equal(vm.runInContext("player.hp", scope), 3);
  assert.equal(shots(scope).length, 5);
  scope.updateBullets(0.5);
  assert.equal(vm.runInContext("player.hp", scope), 2);
  assert.equal(shots(scope).length, 0, "each projectile is consumed on contact, even during invincibility");
  scope.updateBullets(0.5);
  assert.equal(vm.runInContext("player.hp", scope), 2);
});

test("fireball movement detects player contact without tunneling on large frame steps", () => {
  const { scope } = createGame();
  const enemy = startVolley(scope);
  const origin = scope.monster2AttackOrigin(enemy);
  vm.runInContext(`player.x=${origin.x + 200}-player.width/2; player.y=500-player.height`, scope);
  scope.updateBullets(2);
  assert.equal(vm.runInContext("player.hp", scope), 2);
  assert.equal(shots(scope).length, 0);
});

test("fireballs burst on terrain rather than bouncing and leave falling embers", () => {
  const { scope } = createGame();
  vm.runInContext("player.x=10000", scope);
  startVolley(scope);
  const bullet = shots(scope)[0];
  vm.runInContext(`platforms.push({kind:'flat',id:2,start:${bullet.x + 100},end:${bullet.x + 300},y:${bullet.y}})`, scope);
  scope.updateBullets(0.5);
  assert.equal(shots(scope).length, 0);
  assert.ok(bullet.vx > 0, "the projectile never reverses direction");
  assert.equal(vm.runInContext("particles.filter(p=>p.flameDroplet).length", scope), 4);
  assert.equal(vm.runInContext("player.hp", scope), 3);
});

test("five fireballs stay separated in flight and continue after their monster dies", () => {
  const { scope } = createGame();
  vm.runInContext("player.x=10000", scope);
  const enemy = startVolley(scope);
  for (let i = 1; i < 5; i += 1) {
    scope.updateBullets(enemy.fireballInterval);
    scope.updateMonster2Volley(enemy, enemy.fireballInterval);
  }
  assert.equal(shots(scope).length, 5);
  for (let i = 1; i < 5; i += 1) {
    assert.ok(Math.abs(shots(scope)[i - 1].x - shots(scope)[i].x - 104) < 1);
    assert.ok(shots(scope)[i - 1].x - shots(scope)[i].x > enemy.fireballRadius * 4);
  }
  enemy.alive = false;
  const x = shots(scope)[4].x;
  scope.updateBullets(0.05);
  assert.ok(shots(scope)[4].x > x);
  scope.updateBullets(2);
  assert.equal(shots(scope).length, 0);
});

test("an expired muzzle flash renders nothing and never leaves a long attack beam", () => {
  const { scope, calls } = createGame();
  const enemy = startVolley(scope);
  scope.drawMonster2Attack(enemy);
  assert.ok(calls.filter((call) => call.operation === "fillRect").every((call) => call.args[2] <= 24));
  enemy.fireRecoilTimer = 0;
  calls.length = 0;
  scope.drawMonster2Attack(enemy);
  assert.equal(calls.length, 0);
});
