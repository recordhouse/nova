"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createButton() {
  return {
    attributes: {},
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
  };
}

function createGame({ testMode = false, loadInput = false } = {}) {
  const testUltimateButton = createButton();
  const testControls = { hidden: false };
  const canvas = {
    getContext: () => ({ setTransform() {} }),
    addEventListener() {},
  };
  const scope = {
    finishingVoiceCalls: 0,
    ultimateRicochetSoundCalls: 0,
    ultimateHitSoundKinds: [],
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-ultimate]" ? testUltimateButton
          : selector === "[data-test-controls]" ? testControls : null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      location: { search: testMode ? "?test=1" : "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
  };
  scope.playFemaleFinishingVoice = () => { scope.finishingVoiceCalls += 1; };
  scope.playPlayerUltimateRicochetSound = () => {
    scope.ultimateRicochetSoundCalls += 1;
  };
  scope.playPlayerUltimateHitSound = (kind) => {
    scope.ultimateHitSoundKinds.push(kind);
  };
  vm.createContext(scope);
  const scripts = ["config", "state", "world", "combat", "player"];
  if (loadInput) scripts.push("input");
  for (const name of scripts) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  vm.runInContext(`
    const ultimateTestRoad={kind:'flat',id:901,start:0,end:2000,y:800,features:[]};
    platforms.push(ultimateTestRoad);
    player.x=800; player.y=720; player.grounded=true; player.platform=ultimateTestRoad;
    player.hp=3; player.maxHp=3; player.invincible=0;
    minWorldX=0; maxWorldX=2000; cameraX=500; cameraY=0; gameOver=false;
  `, scope);
  return { scope, testUltimateButton, testControls };
}

function read(scope, source) {
  return vm.runInContext(source, scope);
}

test("a charged ultimate floats the player and sweeps dense radial lasers from top to bottom", () => {
  const { scope } = createGame();
  read(scope, "player.ultimateCharges=1; controls.ultimate=true");
  const startY = read(scope, "player.y");

  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.ultimateActive"), true);
  assert.equal(read(scope, "player.ultimateCharges"), 0);
  assert.equal(read(scope, "player.ultimateTargetY"), startY - 70);
  assert.ok(read(scope, "player.y") < startY);
  assert.equal(read(scope, "player.vy"), 0);
  assert.equal(scope.finishingVoiceCalls, 1);
  assert.equal(scope.takePlayerDamage(1), false, "the floating attack cannot be interrupted");

  for (let frame = 0; frame < 84; frame += 1) scope.updatePlayer(1 / 60);
  const lasers = read(scope, "bullets.filter(b=>b.kind==='player-ultimate-laser')");
  assert.equal(lasers.length, 36);
  assert.ok(lasers[0].vy < 0 && Math.abs(lasers[0].vx) < 1,
    "the sweep starts at twelve o'clock");
  assert.ok(lasers[1].vx > 0 && lasers[2].vx < 0,
    "each intermediate step splits symmetrically to both sides");
  assert.ok(lasers.at(-1).vy > 0 && Math.abs(lasers.at(-1).vx) < 1,
    "the sweep finishes at six o'clock");
  assert.ok(lasers.some((laser) => laser.vx < 0));
  assert.ok(lasers.some((laser) => laser.vx > 0));
  assert.ok(lasers.every((laser) => laser.damage === 1));
  assert.ok(lasers.every((laser) => (
    Math.abs(Math.hypot(laser.vx, laser.vy) - 1100) < 1e-9
  )));
  assert.ok(lasers.every((laser) => laser.maxRicochets === 3));
  assert.ok(lasers.every((laser) => laser.beamLength === 64));
  assert.deepEqual(
    Array.from(new Set(lasers.map((laser) => laser.ultimateLane))).sort((a, b) => a - b),
    Array.from({ length: 19 }, (_, index) => index),
  );

  for (let frame = 0; frame < 40; frame += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 36, "holding ULT does not fire another sweep");
  assert.equal(scope.finishingVoiceCalls, 1);
});

test("ultimate lasers originate from the standing character's chest", () => {
  const { scope } = createGame();
  read(scope, `
    player.ultimateCharges=1;
    startPlayerUltimate();
    player.y=650;
    bullets.length=0;
    firePlayerUltimateLaserStep(0);
    const drawHeight=PLAYER_SPRITE_DRAW_HEIGHT*PLAYER_STAND_SPRITE_SCALE;
    const spriteTop=player.y+player.height+PLAYER_STAND_SPRITE_Y_OFFSET-drawHeight;
    globalThis.expectedUltimateChestY=
      spriteTop+drawHeight*PLAYER_ULTIMATE_CHEST_HEIGHT_RATIO;
  `);
  const laser = read(scope, "bullets[0]");
  assert.ok(Math.abs(laser.x - read(scope, "player.x+player.width/2")) < 1e-9);
  assert.ok(Math.abs(laser.y - (read(scope, "expectedUltimateChestY") - 10)) < 1e-9);
  assert.ok(read(scope, "expectedUltimateChestY") < read(scope, "player.y"),
    "the visual chest sits above the much shorter physics body");
});

test("each ultimate laser ricochets three times and expires on the next collision", () => {
  const { scope } = createGame();
  read(scope, "cameraX=0; player.ultimateCharges=1; startPlayerUltimate(); firePlayerUltimateLaserStep(0)");
  const laser = read(scope, "bullets[0]");

  for (let bounce = 1; bounce <= 3; bounce += 1) {
    read(scope, "gameTime+=PLAYER_ULTIMATE_RICOCHET_SOUND_INTERVAL");
    laser.x = 711;
    laser.y = 260;
    laser.vx = 900;
    laser.vy = 0;
    assert.equal(scope.moveRicochetingBullet(laser, 0.01, "#ba58ff"), true);
    assert.equal(laser.ricochets, bounce);
    assert.equal(scope.ultimateRicochetSoundCalls, bounce);
  }
  laser.x = 711;
  laser.y = 260;
  laser.vx = 900;
  laser.vy = 0;
  assert.equal(scope.moveRicochetingBullet(laser, 0.01, "#ba58ff"), false);
  assert.equal(laser.ricochets, 3);
  assert.equal(scope.ultimateRicochetSoundCalls, 3,
    "the terminal collision does not duplicate the third ricochet sound");
});

test("a dense volley shares one particle burst for each ricochet stage", () => {
  const { scope } = createGame();
  read(scope, `
    cameraX=0;
    player.ultimateCharges=1;
    startPlayerUltimate();
    firePlayerUltimateLaserStep(0);
    firePlayerUltimateLaserStep(1);
    particles.length=0;
  `);
  const lasers = read(scope, "bullets");
  for (const laser of lasers.slice(0, 2)) {
    laser.x = 713;
    laser.y = 260;
    laser.vx = 900;
    laser.vy = 0;
    assert.equal(scope.moveRicochetingBullet(laser, 0.01, "#d66cff"), true);
  }
  assert.equal(read(scope, "particles.filter(p=>p.impactRay).length"), 7);
  assert.equal(scope.ultimateRicochetSoundCalls, 1,
    "simultaneous lasers share one audible ricochet for the same bounce stage");

  read(scope, "gameTime+=PLAYER_ULTIMATE_RICOCHET_SOUND_INTERVAL");
  const laterLaser = lasers[2];
  laterLaser.x = 713;
  laterLaser.y = 260;
  laterLaser.vx = 900;
  laterLaser.vy = 0;
  assert.equal(scope.moveRicochetingBullet(laterLaser, 0.01, "#d66cff"), true);
  assert.equal(scope.ultimateRicochetSoundCalls, 2,
    "a later reflection sounds again even when it is the same ricochet stage");
});

test("all ultimate lasers reuse one target hitbox snapshot per frame", () => {
  const { scope } = createGame();
  read(scope, `
    player.ultimateCharges=1;
    startPlayerUltimate();
    for(let step=0;step<PLAYER_ULTIMATE_LASER_STEPS;step++) {
      firePlayerUltimateLaserStep(step);
    }
    enemies.push({alive:true,x:520,y:80,width:40,height:50});
    globalThis.ultimateHitboxCalls=0;
    getEnemyHitbox=(enemy)=>{
      ultimateHitboxCalls++;
      return {x:enemy.x,y:enemy.y,width:enemy.width,height:enemy.height};
    };
  `);
  scope.updateBullets(0);
  assert.equal(read(scope, "ultimateHitboxCalls"), 1);
});

test("a laser damages on contact, not while held, then damages again after returning", () => {
  const { scope } = createGame();
  read(scope, `
    enemies.length=0;
    getEnemyHitbox=(enemy)=>({
      x:enemy.x,
      y:enemy.y,
      width:enemy.width,
      height:enemy.height,
    });
    const target={
      alive:true,
      deathResolved:false,
      kind:'monster2',
      hp:10,
      score:100,
      x:820,
      y:400,
      width:50,
      height:60,
      facing:1,
      hitDuration:0.2,
      hitKnockbackMaxSpeed:400,
      hitKnockbackVelocity:0,
      hitKnockbackSpeed:100,
      state:'chase',
      platform:null,
    };
    enemies.push(target);
    const laser={
      kind:'player-ultimate-laser',
      x:900,
      y:430,
      vx:900,
      vy:0,
      radius:PLAYER_ULTIMATE_LASER_RADIUS,
      visibleLength:PLAYER_ULTIMATE_LASER_LENGTH,
      damage:PLAYER_ULTIMATE_LASER_DAMAGE,
      ricochets:0,
      contactTargets:new Set(),
      impactSoundGroup:{playedHitSoundGroups:new Set()},
    };
    updatePlayerUltimateLaserHits(laser);
    globalThis.hpAfterDirectHit=target.hp;
    updatePlayerUltimateLaserHits(laser);
    globalThis.hpAfterDuplicateDirectHit=target.hp;
    laser.x=1200;
    updatePlayerUltimateLaserHits(laser);
    laser.x=900;
    laser.ricochets=3;
    updatePlayerUltimateLaserHits(laser);
    globalThis.hpAfterThirdRicochetHit=target.hp;
  `);
  assert.equal(read(scope, "hpAfterDirectHit"), 9);
  assert.equal(read(scope, "hpAfterDuplicateDirectHit"), 9,
    "continuous overlap damages a target only once");
  assert.equal(read(scope, "hpAfterThirdRicochetHit"), 8,
    "leaving and returning after the third reflection damages it again");
});

test("separate ultimate lasers each deal contact damage but share hit feedback", () => {
  const { scope } = createGame();
  read(scope, `
    enemies.length=0;
    getEnemyHitbox=(enemy)=>({
      x:enemy.x,
      y:enemy.y,
      width:enemy.width,
      height:enemy.height,
    });
    const target={
      alive:true,
      deathResolved:false,
      kind:'monster2',
      hp:10,
      score:100,
      x:820,
      y:400,
      width:50,
      height:60,
      facing:1,
      hitDuration:0.2,
      hitKnockbackMaxSpeed:400,
      hitKnockbackVelocity:0,
      hitKnockbackSpeed:100,
      state:'chase',
      platform:null,
    };
    enemies.push(target);
    const feedback={playedRicochetMask:0};
    const makeLaser=()=>({
      kind:'player-ultimate-laser',
      x:900,
      y:430,
      vx:1100,
      vy:0,
      radius:PLAYER_ULTIMATE_LASER_RADIUS,
      visibleLength:PLAYER_ULTIMATE_LASER_LENGTH,
      damage:PLAYER_ULTIMATE_LASER_DAMAGE,
      ricochets:0,
      contactTargets:new Set(),
      impactSoundGroup:feedback,
    });
    particles.length=0;
    updatePlayerUltimateLaserHits(makeLaser());
    updatePlayerUltimateLaserHits(makeLaser());
    globalThis.hpAfterTwoLasers=target.hp;
    globalThis.particlesAfterTwoLasers=particles.length;
  `);
  assert.equal(read(scope, "hpAfterTwoLasers"), 8,
    "each laser applies its own one-point contact damage");
  assert.equal(read(scope, "particlesAfterTwoLasers"), 12,
    "simultaneous contacts share one visual hit effect");
  assert.deepEqual(scope.ultimateHitSoundKinds, ["monster2"],
    "simultaneous organic hits share one audible impact");
});

test("ultimate hit sounds cover organic, metal and boss targets without same-group spam", () => {
  const { scope } = createGame();
  const playedGroups = new Set();
  scope.playGroupedPlayerUltimateHitSound("monster1", playedGroups);
  scope.playGroupedPlayerUltimateHitSound("monster2", playedGroups);
  scope.playGroupedPlayerUltimateHitSound("turret", playedGroups);
  scope.playGroupedPlayerUltimateHitSound("monster3", playedGroups);
  scope.playGroupedPlayerUltimateHitSound("boss", playedGroups);
  scope.playGroupedPlayerUltimateHitSound("boss", playedGroups);
  assert.deepEqual(scope.ultimateHitSoundKinds, ["monster1", "turret", "boss"]);
});

test("ultimate lasers query only nearby spatial target buckets", () => {
  const { scope } = createGame();
  read(scope, `
    enemies.length=0;
    for(let row=0;row<10;row++) {
      for(let column=0;column<10;column++) {
        enemies.push({
          alive:true,
          x:530+column*65,
          y:90+row*110,
          width:20,
          height:24,
        });
      }
    }
    getEnemyHitbox=(enemy)=>({
      x:enemy.x,
      y:enemy.y,
      width:enemy.width,
      height:enemy.height,
    });
    globalThis.ultimateSpatialSnapshot=playerUltimateLaserTargetSnapshot();
    globalThis.ultimateSpatialLaser={
      x:850,
      y:650,
      vx:900,
      vy:0,
      radius:PLAYER_ULTIMATE_LASER_RADIUS,
      visibleLength:PLAYER_ULTIMATE_LASER_LENGTH,
    };
    globalThis.ultimateSpatialCandidates=playerUltimateLaserTargetCandidates(
      ultimateSpatialLaser,
      ultimateSpatialSnapshot,
      playerUltimateLaserSegment(ultimateSpatialLaser),
    );
  `);
  assert.equal(read(scope, `
    [...ultimateSpatialSnapshot.enemies.buckets.values()]
      .reduce((total,bucket)=>total+bucket.length,0)
  `), 100);
  const nearbyCount = read(scope, "ultimateSpatialCandidates.enemies.length");
  assert.ok(nearbyCount > 0);
  assert.ok(nearbyCount <= 12, `only ${nearbyCount} nearby targets should be checked`);
});

test("ultimate kills retain their flash while limiting simultaneous death particles", () => {
  const { scope } = createGame();
  read(scope, `
    enemies.length=0;
    getEnemyHitbox=(enemy)=>({
      x:enemy.x,
      y:enemy.y,
      width:enemy.width,
      height:enemy.height,
    });
    const target={
      alive:true,
      deathResolved:false,
      kind:'monster2',
      hp:1,
      score:100,
      x:820,
      y:400,
      width:50,
      height:60,
      facing:1,
      hitDuration:0.2,
      hitKnockbackMaxSpeed:400,
      hitKnockbackVelocity:0,
      hitKnockbackSpeed:100,
      state:'chase',
      platform:null,
    };
    enemies.push(target);
    particles.length=0;
    updatePlayerUltimateLaserHits({
      kind:'player-ultimate-laser',
      x:900,
      y:430,
      vx:900,
      vy:0,
      radius:PLAYER_ULTIMATE_LASER_RADIUS,
      visibleLength:PLAYER_ULTIMATE_LASER_LENGTH,
      damage:PLAYER_ULTIMATE_LASER_DAMAGE,
      contactTargets:new Set(),
      impactSoundGroup:{playedHitSoundGroups:new Set()},
    });
    globalThis.ultimateKilledTarget=target;
  `);
  assert.equal(read(scope, "ultimateKilledTarget.alive"), false);
  assert.equal(read(scope, "particles.some(p=>p.explosionFlash)"), true);
  assert.ok(read(scope, "particles.length") <= 50,
    "the ultimate-specific death effect stays below the old 80+ particles");
});

test("the test ULT button starts the same attack without spending a charge", () => {
  const { scope, testUltimateButton, testControls } = createGame({
    testMode: true,
    loadInput: true,
  });
  testUltimateButton.listeners.click({ preventDefault() {} });
  assert.equal(testControls.hidden, false);
  assert.equal(read(scope, "player.ultimateActive"), true);
  assert.equal(read(scope, "player.ultimateCharges"), 0);
});

test("the hidden test ULT button cannot activate in normal play", () => {
  const { scope, testUltimateButton, testControls } = createGame({
    testMode: false,
    loadInput: true,
  });
  testUltimateButton.listeners.click({ preventDefault() {} });
  assert.equal(testControls.hidden, true);
  assert.equal(read(scope, "player.ultimateActive"), false);
});
