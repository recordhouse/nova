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
      return (...args) => calls.push({
        operation: key,
        args,
        color: target.fillStyle,
        filter: target.filter,
        blend: target.globalCompositeOperation,
      });
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game"
        ? { getContext: () => ctx } : null,
    },
    window: {
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
    },
    enemySprites: {
      monster1: { loaded: true, image: { naturalWidth: 298, naturalHeight: 316 } },
      monster2: { loaded: true, image: { naturalWidth: 309, naturalHeight: 338 } },
      monster3: { loaded: true, image: { naturalWidth: 314, naturalHeight: 350 } },
      monster4: { loaded: true, image: { naturalWidth: 314, naturalHeight: 350 } },
    },
    turretSprite: { loaded: true, image: { naturalWidth: 302, naturalHeight: 400 } },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies", "renderer"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  vm.runInContext(`
    globalThis.fixtureRoad={kind:'flat',id:1,start:0,end:2400,y:500,direction:1};
    platforms.push(fixtureRoad);
    player.x=1600; player.y=420; player.platform=fixtureRoad;
    cameraX=0; cameraY=0;
  `, scope);
  return { scope, calls, ctx };
}

function read(scope, source) {
  return vm.runInContext(source, scope);
}

test("one fifth of rolled monster1 spawns use the crimson variant", () => {
  const { scope, calls } = createGame();
  assert.equal(read(scope, "MONSTER1_CRIMSON_CHANCE"), 0.2);
  read(scope, `
    mapRandom=()=>0.199999;
    globalThis.crimson=addEnemy(fixtureRoad,100,'monster1',{rollCrimson:true});
    mapRandom=()=>0.2;
    globalThis.normal=addEnemy(fixtureRoad,400,'monster1',{rollCrimson:true});
    globalThis.unrolled=addEnemy(fixtureRoad,700,'monster1');
    crimson.animationTime=0; crimson.animationPhase=0; crimson.moving=false;
  `);
  assert.equal(scope.crimson.crimsonVariant, true);
  assert.equal(scope.normal.crimsonVariant, false);
  assert.equal(scope.unrolled.crimsonVariant, false);

  calls.length = 0;
  scope.drawEnemy(scope.crimson);
  const sprite = calls.find((call) => call.operation === "drawImage");
  assert.ok(sprite.filter.includes("saturate(7)"));
  assert.ok(sprite.filter.includes("hue-rotate(315deg)"));
});

test("a dying crimson monster1 deals two damage and blasts nearby monsters away", () => {
  const { scope, calls, ctx } = createGame();
  read(scope, `
    globalThis.source=addEnemy(fixtureRoad,200,'monster1',{crimsonVariant:true});
    globalThis.near=addEnemy(fixtureRoad,400,'monster4');
    globalThis.far=addEnemy(fixtureRoad,900,'monster2');
    near.hp=3;
  `);
  const farHp = scope.far.hp;
  assert.equal(scope.resolveEnemyDeath(scope.source), true);
  assert.equal(scope.source.alive, false);
  assert.equal(scope.near.hp, 1);
  assert.equal(scope.near.hitKnockbackVelocity,
    read(scope, "MONSTER1_CRIMSON_KNOCKBACK_SPEED"));
  assert.equal(scope.near.revivalKnockback, true);
  assert.equal(scope.far.hp, farHp);
  assert.equal(read(scope, "player.score"), scope.source.score);
  assert.equal(read(scope, "particles.filter(p=>p.crimsonGrenadeBlast).length"), 1);
  assert.equal(read(scope, "particles.filter(p=>p.debris).length"), 30);
  assert.ok(read(scope, "shake") >= 22);

  calls.length = 0;
  const blast = read(scope, "particles.find(p=>p.crimsonGrenadeBlast)");
  scope.drawCrimsonGrenadeBlast(blast);
  const rectangles = calls.filter((call) => call.operation === "fillRect");
  assert.ok(rectangles.length >= 45);
  assert.equal(calls.filter((call) => call.operation === "arc").length, 0);
  assert.ok(rectangles.some((call) => call.color === "#fff3bd"));
  assert.ok(rectangles.some((call) => call.blend === "source-over"));
  const rotations = calls.filter((call) => call.operation === "rotate")
    .map((call) => call.args[0]);
  assert.equal(rotations.length, 18);
  assert.ok(new Set(rotations.map((angle) => angle.toFixed(3))).size >= 16);

  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});

test("crimson monster deaths can chain without resolving any death twice", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.first=addEnemy(fixtureRoad,100,'monster1',{crimsonVariant:true});
    globalThis.second=addEnemy(fixtureRoad,300,'monster1',{crimsonVariant:true});
    globalThis.third=addEnemy(fixtureRoad,500,'monster1');
  `);
  scope.resolveEnemyDeath(scope.first);
  assert.equal(scope.first.alive, false);
  assert.equal(scope.second.alive, false);
  assert.equal(scope.third.alive, false);
  assert.equal(read(scope, "particles.filter(p=>p.crimsonGrenadeBlast).length"), 2);
  assert.equal(read(scope, "player.score"), 300);
  assert.equal(scope.resolveEnemyDeath(scope.first), false);
  assert.equal(read(scope, "player.score"), 300);
});

test("a destroyed turret raises a mushroom cloud and damages nearby monsters", () => {
  const { scope, calls, ctx } = createGame();
  read(scope, `
    addTurret(fixtureRoad,200);
    globalThis.sourceTurret=turrets[0];
    globalThis.nearTurretTarget=addEnemy(fixtureRoad,400,'monster4');
    globalThis.farTurretTarget=addEnemy(fixtureRoad,900,'monster2');
    nearTurretTarget.hp=3;
  `);
  const farHp = scope.farTurretTarget.hp;

  assert.equal(scope.resolveTurretDeath(scope.sourceTurret), true);
  assert.equal(scope.sourceTurret.alive, false);
  assert.equal(scope.nearTurretTarget.hp, 1);
  assert.equal(scope.nearTurretTarget.hitKnockbackVelocity,
    read(scope, "TURRET_DEATH_KNOCKBACK_SPEED"));
  assert.equal(scope.nearTurretTarget.revivalKnockback, true);
  assert.equal(scope.farTurretTarget.hp, farHp);
  assert.equal(read(scope, "player.score"), read(scope, "TURRET.score"));
  assert.equal(read(scope, "particles.filter(p=>p.turretMushroomBlast).length"), 1);
  assert.equal(read(scope, "particles.filter(p=>p.debris).length"), 24);
  assert.ok(read(scope, "shake") >= 26);

  const particleCount = read(scope, "particles.length");
  assert.equal(scope.resolveTurretDeath(scope.sourceTurret), false);
  assert.equal(read(scope, "particles.length"), particleCount);
  assert.equal(read(scope, "player.score"), read(scope, "TURRET.score"));

  calls.length = 0;
  const blast = read(scope, "particles.find(p=>p.turretMushroomBlast)");
  blast.life = blast.maxLife * 0.62;
  scope.drawTurretMushroomBlast(blast);
  const rectangles = calls.filter((call) => call.operation === "fillRect");
  assert.ok(rectangles.length >= 35);
  assert.ok(rectangles.some((call) => call.color === "#fff2a8"));
  assert.ok(rectangles.some((call) => call.color === "#3f2934"));
  assert.equal(calls.filter((call) => call.operation.includes("Gradient")).length, 0);
  assert.equal(calls.filter((call) => call.operation === "arc").length, 0);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});
