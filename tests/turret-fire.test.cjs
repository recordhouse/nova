"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const ctx = new Proxy({}, { get: () => () => {} });
  const scope = {
    turretLaserSoundCalls: 0,
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  scope.playTurretLaserSound = () => { scope.turretLaserSoundCalls += 1; };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500,direction:1};
    platforms.push(fixtureRoad);
    addTurret(fixtureRoad,400);
    globalThis.fixtureTurret=turrets[0];
    player.x=10000;
  `, scope);
  return scope;
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("turrets independently choose one, two or three shots for each timed burst", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  vm.runInContext(`
    cameraX=-1000;
    globalThis.burstDraws=[0,0.5,0.999];
    Math.random=()=>burstDraws.shift();
  `, scope);
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(read(scope, "enemyBullets.length"), 1);
  assert.equal(read(scope, "enemyBullets[0].kind"), "turret-laser");
  assert.equal(read(scope, "enemyBullets[0].ricochetColor"), "#dc347f");
  assert.ok(read(scope, "enemyBullets[0].vx") < 0, "distant shots follow the turret's facing");
  assert.equal(turret.active, true);
  assert.equal(turret.burstShotsRemaining, 0);
  assert.equal(turret.fireTimer, read(scope, "TURRET.fireInterval"));

  scope.updateTurrets(read(scope, "TURRET.fireInterval"));
  assert.equal(read(scope, "enemyBullets.length"), 2);
  assert.equal(turret.burstShotsRemaining, 1);
  assert.equal(turret.fireTimer, read(scope, "TURRET.burstShotInterval"));
  scope.updateTurrets(read(scope, "TURRET.burstShotInterval"));
  assert.equal(read(scope, "enemyBullets.length"), 3);
  assert.equal(turret.burstShotsRemaining, 0);
  assert.equal(turret.fireTimer, read(scope, "TURRET.fireInterval"));

  scope.updateTurrets(read(scope, "TURRET.fireInterval"));
  assert.equal(read(scope, "enemyBullets.length"), 4);
  assert.equal(turret.burstShotsRemaining, 2);
  for (let shot = 5; shot <= 6; shot += 1) {
    scope.updateTurrets(read(scope, "TURRET.burstShotInterval"));
    assert.equal(read(scope, "enemyBullets.length"), shot);
  }
  assert.equal(turret.burstShotsRemaining, 0);
  assert.equal(turret.fireTimer, read(scope, "TURRET.fireInterval"));
  assert.equal(read(scope, "burstDraws.length"), 0);
});

test("turret 2 fires two parallel gold lasers and each ricochets three times", () => {
  const scope = createGame();
  const result = read(scope, `(() => {
    const road=platforms[0];
    addTurret(road,800,2);
    const turret=turrets.at(-1);
    player.x=1080; player.y=420;
    const before=enemyBullets.length;
    fireTurretLaser(turret,true);
    const shots=enemyBullets.slice(before);
    return {variant:turret.turretVariant,shots:shots.map(shot=>({
      variant:shot.turretVariant,x:shot.x,y:shot.y,vx:shot.vx,vy:shot.vy,
      maxRicochets:shot.maxRicochets,color:shot.ricochetColor
    }))};
  })()`);
  assert.equal(result.variant, 2);
  assert.equal(result.shots.length, 2);
  assert.ok(result.shots.every((shot) => shot.variant === 2));
  assert.ok(result.shots.every((shot) => shot.maxRicochets === 3));
  assert.ok(result.shots.every((shot) => shot.color === "#ffd24f"));
  assert.equal(result.shots[0].vx, result.shots[1].vx);
  assert.equal(result.shots[0].vy, result.shots[1].vy);
  assert.ok(Math.hypot(
    result.shots[0].x - result.shots[1].x,
    result.shots[0].y - result.shots[1].y,
  ) > 20);
});

test("turret 3 fires one to three cyan lasers at random", () => {
  for (const [randomValue, expectedShots] of [[0, 1], [0.5, 2], [0.999, 3]]) {
    const scope = createGame();
    const result = read(scope, `(() => {
      turrets.length=0; enemyBullets.length=0;
      addTurret(platforms[0],400,3);
      const turret=turrets[0];
      player.x=650; player.y=420; cameraX=0;
      turret.fireTimer=0;
      Math.random=()=>${randomValue};
      updateTurrets(0);
      if(turret.burstShotsRemaining>0) {
        while(turret.burstShotsRemaining>0) updateTurrets(turret.fireTimer);
      }
      return {variant:turret.turretVariant,shots:enemyBullets.map(shot=>({
        variant:shot.turretVariant,color:shot.ricochetColor,
        maxRicochets:shot.maxRicochets
      }))};
    })()`);
    assert.equal(result.variant, 3);
    assert.equal(result.shots.length, expectedShots);
    assert.ok(result.shots.every((shot) => shot.variant === 3));
    assert.ok(result.shots.every((shot) => shot.color === "#3fffe4"));
    assert.ok(result.shots.every((shot) => shot.maxRicochets === 0));
  }
});

test("turrets still aim nearby and fully sleep when far outside the camera", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  vm.runInContext("player.x=650; player.y=420", scope);
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(turret.facing, 1);
  assert.ok(read(scope, "enemyBullets[0].vx") > 0);
  assert.equal(scope.turretLaserSoundCalls, 1);
  vm.runInContext("player.x=10000; cameraX=10000; particles.length=0; shake=0", scope);
  turret.fireTimer = 0.05;
  scope.updateTurrets(0.1);
  assert.equal(read(scope, "enemyBullets.length"), 1);
  assert.equal(turret.fireTimer, 0.05);
  assert.equal(turret.active, false);
  assert.equal(turret.simulationSleeping, true);
  assert.equal(read(scope, "particles.length"), 0);
  assert.equal(read(scope, "shake"), 0);
  assert.equal(scope.turretLaserSoundCalls, 1, "offscreen turret fire stays silent");
});

test("turret muzzle follows the lowered visual artwork", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  const muzzle = read(scope, "turretMuzzlePosition(fixtureTurret)");
  assert.equal(muzzle.y, (
    turret.y + turret.height +
    read(scope, "TURRET.visualGroundOffset") -
    read(scope, "TURRET.spriteHeight") +
    read(scope, "TURRET.spriteBottomOffset") +
    read(scope, "TURRET.spriteHeight") * 0.2
  ));
});

test("a visible turret requests one attack cut-in at the start of each burst", () => {
  const scope = createGame();
  const turret = scope.fixtureTurret;
  read(scope, `
    player.x=650; player.y=420; cameraX=0; cameraY=0;
    globalThis.attackVideoRequests=[];
    playEnemyAttackVideo=(kind,now,source)=>attackVideoRequests.push({kind,now,source});
  `);
  turret.fireTimer = read(scope, "TURRET.chargeDuration + 0.1");

  scope.updateTurrets(0.11);
  scope.updateTurrets(0.1);

  assert.equal(read(scope, "attackVideoRequests.length"), 1);
  assert.equal(read(scope, "attackVideoRequests[0].kind"), "turret");
  assert.equal(read(scope, "attackVideoRequests[0].source"), turret);
});

test("a turret requests its first-encounter introduction when it enters view", () => {
  const scope = createGame();
  read(scope, `
    player.x=650; player.y=420; cameraX=0; cameraY=0;
    globalThis.introductionRequests=[];
    queueEnemyIntroductionVideo=(kind,distance)=>introductionRequests.push({kind,distance});
  `);

  scope.updateTurrets(0);

  assert.equal(read(scope, "introductionRequests.length"), 1);
  assert.equal(read(scope, "introductionRequests[0].kind"), "turret");
  assert.equal(read(scope, "Number.isFinite(introductionRequests[0].distance)"), true);
});
