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
        assert.ok(target.globalAlpha >= 0 && target.globalAlpha <= 1);
        if (key === "fillRect") assert.ok(args[2] >= 0 && args[3] >= 0);
        calls.push({ operation: key, args, alpha: target.globalAlpha, color: target.fillStyle });
      };
    },
  });
  const canvas = { listeners: {}, getContext: () => ctx,
    addEventListener(key, callback) { this.listeners[key] = callback; } };
  const scope = {
    performance: { now: () => 0 }, requestAnimationFrame() {},
    Image: class {
      naturalWidth = 2008;
      naturalHeight = 500;
      set src(value) { this.source = value; this.onload?.(); }
    },
    document: { querySelector: (selector) => selector === "#game" ? canvas : null,
      querySelectorAll: () => [], addEventListener() {} },
    window: { location: { search: "?test=1" }, addEventListener() {},
      innerWidth: 720, innerHeight: 1280, matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets", "state", "world", "combat", "player", "enemies", "renderer", "input", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    enemies.length=0; turrets.length=0; midBosses.length=0;
    bullets.length=0; enemyBullets.length=0; particles.length=0; platforms.length=0;
    globalThis.fixtureRoad={kind:'flat',id:999,start:-2000,end:5000,y:500,features:[]};
    platforms.push(fixtureRoad);
    minWorldX=-2000; maxWorldX=5000; lowestPlatformY=500;
    resetPlayerPosition(); player.x=1000-player.width/2;
    player.hp=3; player.invincible=0; gameOver=false; gameTime=0;
    cameraX=700; cameraY=0;
  `, scope);
  calls.length = 0;
  return { scope, calls, canvas, ctx };
}

function read(scope, code) { return vm.runInContext(code, scope); }
function body(calls) { return calls.findLast((call) => call.operation === "drawImage"); }
function downDuration(scope) { return read(scope, "PLAYER_DOWN_ANIMATION_DURATION"); }
function recover(scope, advanceWave = true) {
  scope.updatePlayer(downDuration(scope));
  scope.updatePlayer(2);
  if (advanceWave) {
    scope.updatePlayerRevivalWave(read(scope, "PLAYER_REVIVAL_WAVE_DURATION"));
  }
}

test("a successful revival plays resurrection.mp3 exactly once", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.resurrectionSoundCalls=0;
    playResurrectionSound=()=>{resurrectionSoundCalls+=1};
  `);
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(read(scope, "resurrectionSoundCalls"), 1);
  scope.updatePlayer(1);
  assert.equal(read(scope, "resurrectionSoundCalls"), 1);

  read(scope, `
    resetPlayerDownState(); player.invincible=0; player.hp=1; gameOver=false;
  `);
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(read(scope, "resurrectionSoundCalls"), 1,
    "defeat must not play the revival sound");
});

test("taking damage plays the down cut-in once and recovery stops it", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.downVideoPlayCalls=0;
    globalThis.downVideoStopCalls=0;
    playPlayerDownVideo=()=>{downVideoPlayCalls+=1};
    stopPlayerDownVideo=()=>{downVideoStopCalls+=1};
  `);

  scope.takePlayerDamage(1);
  assert.equal(read(scope, "downVideoPlayCalls"), 1);
  scope.updatePlayer(downDuration(scope));
  scope.updatePlayer(2);
  assert.equal(read(scope, "downVideoPlayCalls"), 1,
    "the hold pose must not restart the cut-in");
  assert.equal(read(scope, "downVideoStopCalls"), 1);
});

test("down.png is loaded as five correctly bounded 400x500 frames", () => {
  const { scope } = createGame();
  const png = fs.readFileSync(path.join(__dirname, "..", "assets/images/main/stage/down.png"));
  assert.equal(png.readUInt32BE(16), 2008);
  assert.equal(png.readUInt32BE(20), 500);
  const sprite = read(scope, "playerSprites.down");
  assert.equal(sprite.loaded, true);
  assert.ok(sprite.image.source.includes("/down.png?"));
  assert.equal(sprite.fps, 8);
  assert.equal(downDuration(scope), 0.625);
  assert.deepEqual(Array.from(sprite.frames, (frame) => frame.x), [0, 402, 804, 1206, 1608]);
  assert.ok(sprite.frames.every((frame) => frame.x + frame.width <= 2008 && frame.height === 500));
});

test("blast-run.png is loaded as five correctly bounded running-fire frames", () => {
  const { scope } = createGame();
  const png = fs.readFileSync(path.join(
    __dirname,
    "..",
    "assets/images/main/stage/blast-run.png",
  ));
  assert.equal(png.readUInt32BE(16), 2008);
  assert.equal(png.readUInt32BE(20), 500);
  const sprite = read(scope, "playerSprites.blastRun");
  assert.equal(sprite.loaded, true);
  assert.ok(sprite.image.source.includes("/blast-run.png?"));
  assert.equal(sprite.fps, 9);
  assert.deepEqual(Array.from(sprite.frames, (frame) => frame.x), [0, 402, 804, 1206, 1608]);
  assert.ok(sprite.frames.every((frame) => frame.x + frame.width <= 2008 && frame.height === 500));
});

test("the down artwork sits below standing while its collision box stays put", () => {
  const { scope, calls } = createGame();
  const centerX = read(scope, "player.x + player.width / 2");
  const hitboxBefore = read(scope, "getPlayerHitbox()");
  scope.drawPlayerSprite(centerX);
  const standingAnchor = calls.find((call) => call.operation === "translate").args;
  const physicalFeetY = read(scope, "player.y + player.height");
  assert.equal(standingAnchor[1], physicalFeetY + read(scope, "PLAYER_STAND_SPRITE_Y_OFFSET"));
  calls.length = 0;

  scope.takePlayerDamage(1);
  for (const downTime of [0, 0.25, downDuration(scope)]) {
    read(scope, `player.downTime=${downTime}`);
    calls.length = 0;
    scope.drawPlayerSprite(centerX);
    const downAnchor = calls.find((call) => call.operation === "translate").args;
    assert.equal(downAnchor[0], standingAnchor[0]);
    assert.equal(downAnchor[1], physicalFeetY + read(scope, "PLAYER_DOWN_SPRITE_Y_OFFSET"));
    assert.equal(downAnchor[1] - standingAnchor[1], 8);
  }
  assert.deepEqual(read(scope, "getPlayerHitbox()"), hitboxBefore);

  read(scope, "resetPlayerDownState()");
  calls.length = 0;
  scope.drawPlayerSprite(centerX);
  assert.equal(calls.find((call) => call.operation === "translate").args[1], standingAnchor[1]);
});

test("standing, running, jumping, crouching and firing sprites share a lower anchor", () => {
  const { scope, calls } = createGame();
  const centerX = read(scope, "player.x + player.width / 2");
  const physicalFeetY = read(scope, "player.y + player.height");
  const cases = [
    { setup: "player.vx=player.speed", sprite: "/run.png?", offset: 8 },
    { setup: "player.vx=0", sprite: "/stand.png?", offset: 8 },
    { setup: "controls.fire=true", sprite: "/blast.png?", offset: 8 },
    { setup: "controls.up=true", sprite: "/blast-high.png?", offset: 8 },
    { setup: "controls.up=false; player.crouching=true", sprite: "/blast-sit.png?", offset: 8 },
    { setup: "controls.fire=false", sprite: "/sit.png?", offset: 8 },
    { setup: "controls.fire=true; player.crouching=false; player.grounded=false", sprite: "/blast-jump.png?", offset: 8 },
    { setup: "controls.fire=false", sprite: "/jump.png?", offset: 8 },
  ];
  for (const { setup, sprite, offset } of cases) {
    read(scope, setup);
    calls.length = 0;
    scope.drawPlayerSprite(centerX);
    assert.ok(body(calls).args[0].source.includes(sprite));
    assert.equal(calls.find((call) => call.operation === "translate").args[1], physicalFeetY + offset);
  }
});

test("a brief neutral frame during direction reversal keeps the running pose", () => {
  const { scope, calls } = createGame();
  const centerX = read(scope, "player.x + player.width / 2");

  read(scope, `
    player.vx=0;
    player.reversalDirection=-1;
  `);
  scope.drawPlayerSprite(centerX);
  assert.ok(body(calls).args[0].source.includes("/run.png?"));

  calls.length = 0;
  read(scope, `
    player.reversalDirection=0;
    player.reversalGraceTimer=0.08;
    player.recentRunDirection=1;
    player.recentRunSpeed=player.speed;
  `);
  scope.drawPlayerSprite(centerX);
  assert.ok(body(calls).args[0].source.includes("/run.png?"));

  calls.length = 0;
  read(scope, "player.reversalGraceTimer=0");
  scope.drawPlayerSprite(centerX);
  assert.ok(body(calls).args[0].source.includes("/stand.png?"));
});

test("the running sprite uses its speed-scaled animation clock", () => {
  const { scope, calls } = createGame();
  const centerX = read(scope, "player.x + player.width / 2");
  read(scope, `
    player.vx=player.speed;
    player.runAnimationTime=1.1/playerSprites.run.fps;
    gameTime=99;
  `);
  scope.drawPlayerSprite(centerX);
  assert.ok(body(calls).args[0].source.includes("/run.png?"));
  assert.equal(body(calls).args[1], 402, "the integrated run clock selects frame two");
});

test("pressing fire while running switches immediately to standing fire", () => {
  const { scope, calls } = createGame();
  const startX = read(scope, "player.x");
  read(scope, "controls.right=true");
  for (let frame = 0; frame < 30; frame += 1) scope.updatePlayer(1 / 60);

  assert.equal(read(scope, "PLAYER_RUNNING_FIRE_ENABLED"), false);
  assert.ok(read(scope, "player.x") > startX + 130);
  assert.ok(read(scope, "player.runSpeed") > read(scope, "player.speed"));
  assert.ok(read(scope, "player.runAnimationTime") > 0);
  const fireX = read(scope, "player.x");
  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.x"), fireX);
  assert.equal(read(scope, "player.vx"), 0);
  assert.equal(read(scope, "player.runSpeed"), read(scope, "player.speed"));
  assert.equal(read(scope, "playerIsRunningOnGround()"), false);
  assert.equal(read(scope, "bullets.length"), 1);
  assert.equal(read(scope, "player.fireEnergy"),
    read(scope, "PLAYER_FIRE_ENERGY_MAX - PLAYER_FIRE_ENERGY_PER_SHOT"));

  calls.length = 0;
  scope.drawPlayerSprite(read(scope, "player.x + player.width / 2"));
  assert.ok(body(calls).args[0].source.includes("/blast.png?"));
});

test("pressing high fire while running stops and changes to high attack", () => {
  const { scope, calls } = createGame();
  read(scope, "controls.right=true");
  for (let frame = 0; frame < 20; frame += 1) scope.updatePlayer(1 / 60);
  read(scope, "controls.up=true; controls.fire=true");
  scope.updatePlayer(1 / 60);

  assert.equal(read(scope, "playerIsRunningOnGround()"), false);
  assert.equal(read(scope, "playerIsAimingHigh()"), true);
  assert.equal(read(scope, "bullets.length"), 1);
  assert.ok(read(scope, "bullets[0].vy") < 0);
  calls.length = 0;
  scope.drawPlayerSprite(read(scope, "player.x + player.width / 2"));
  assert.ok(body(calls).args[0].source.includes("/blast-high.png?"));
});

test("the projectile origin follows the lowered firing artwork", () => {
  const { scope } = createGame();
  read(scope, "controls.fire=true; player.fireBarrel=0");
  const oldMuzzleY = read(scope, `
    const drawHeight=PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_BLAST_SPRITE_SCALE;
    player.y + player.height - drawHeight +
      drawHeight * PLAYER_MUZZLE_HEIGHT_RATIO + PLAYER_MUZZLE_VERTICAL_OFFSET -
      PLAYER_MUZZLE_BARREL_OFFSET * PLAYER_BLAST_SPRITE_SCALE
  `);
  assert.equal(scope.shootPlayer(), true);
  const muzzleY = read(scope, "bullets[0].y");
  assert.equal(muzzleY - oldMuzzleY, read(scope, "PLAYER_FIRE_SPRITE_Y_OFFSET"));
});

test("direct fire is blocked while ground-running but remains available in the air", () => {
  const { scope } = createGame();
  read(scope, `
    controls.right=true;
    controls.fire=true;
    player.vx=player.speed;
    player.fireBarrel=0;
  `);
  assert.equal(scope.shootPlayer(), false);
  assert.equal(read(scope, "bullets.length"), 0);
  assert.equal(read(scope, "player.fireEnergy"), read(scope, "PLAYER_FIRE_ENERGY_MAX"));

  read(scope, "player.grounded=false");
  assert.equal(scope.shootPlayer(), true);
  assert.equal(read(scope, "bullets.length"), 1);
});

test("damage starts a protected down animation and cancels crouching, movement and queued fire", () => {
  const { scope } = createGame();
  read(scope, "player.vx=player.speed; player.vy=-400; player.crouching=true; jumpQueued=true; player.fireWasActive=true");
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "player.hp"), 2);
  assert.equal(read(scope, "player.downPhase"), "fall");
  assert.equal(read(scope, "player.invincible"), 2.625);
  assert.equal(read(scope, "player.vx"), 0);
  assert.equal(read(scope, "player.vy"), 0);
  assert.equal(read(scope, "player.crouching || jumpQueued || player.fireWasActive"), false);
  assert.equal(scope.takePlayerDamage(1), false);
  read(scope, "player.invincible=0");
  assert.equal(scope.takePlayerDamage(1), false, "the down state itself also rejects repeat damage");
  assert.equal(read(scope, "player.hp"), 2);
});

test("a hit nudges the player away from its source and quickly comes to rest", () => {
  for (const [sourceX, direction] of [[850, 1], [1150, -1]]) {
    const { scope } = createGame();
    const startX = read(scope, "player.x");
    assert.equal(scope.takePlayerDamage(1, { kind: "monster1", x: sourceX, y: 430 }), true);
    assert.equal(Math.sign(read(scope, "player.vx")), direction);
    for (let frame = 0; frame < 18; frame += 1) scope.updatePlayer(1 / 60);
    const distance = read(scope, "player.x") - startX;
    assert.equal(Math.sign(distance), direction);
    assert.ok(Math.abs(distance) >= 20 && Math.abs(distance) <= 30, `${distance}px knockback`);
    assert.equal(read(scope, "player.hitKnockbackTime"), 0);
    assert.equal(read(scope, "player.hitKnockbackVelocity"), 0);
    assert.equal(read(scope, "player.vx"), 0);
  }
});

test("a centered projectile uses its travel direction for hit knockback", () => {
  const { scope } = createGame();
  const centerX = read(scope, "player.x + player.width / 2");
  scope.takePlayerDamage(1, { kind: "turret-laser", x: centerX, y: 450, vx: -420 });
  assert.equal(read(scope, "player.hitKnockbackVelocity"), -300);
});

test("the down motion plays once in order, stays visible, and never loops on the final pose", () => {
  const { scope, calls } = createGame();
  scope.takePlayerDamage(1);
  read(scope, "gameTime=0.15; controls.fire=true; controls.up=true");
  const frames = [];
  for (let i = 0; i < 5; i += 1) {
    calls.length = 0;
    scope.drawPlayer();
    const draw = body(calls);
    assert.ok(draw.args[0].source.includes("/down.png?"));
    assert.equal(draw.alpha, 1, "invincibility does not hide frames during the fall");
    frames.push(draw.args[1]);
    scope.updatePlayer(1 / read(scope, "PLAYER_DOWN_FPS"));
  }
  assert.deepEqual(frames, [0, 402, 804, 1206, 1608]);
  assert.equal(read(scope, "player.downPhase"), "hold");
  scope.updatePlayer(1.5);
  calls.length = 0;
  scope.drawPlayer();
  assert.equal(body(calls).args[1], 1608);
});

test("the final frame holds for two seconds before a single recovery with three-second immunity", () => {
  const { scope, calls } = createGame();
  scope.takePlayerDamage(1);
  scope.updatePlayer(downDuration(scope));
  scope.updatePlayer(1.99);
  assert.equal(read(scope, "player.downPhase"), "hold");
  assert.equal(read(scope, "particles.length"), 0);
  scope.updatePlayer(0.01);
  assert.equal(read(scope, "player.downPhase"), "");
  assert.ok(Math.abs(read(scope, "player.invincible") - 3) < 1e-9);
  assert.equal(read(scope, "particles.filter(p=>p.revivalOrb).length"), 8);
  assert.equal(read(scope, "particles.length"), 8, "recovery uses only a few glowing orbs");
  calls.length = 0;
  scope.drawPlayer();
  assert.ok(body(calls).args[0].source.includes("/stand.png?"));
  scope.updatePlayer(0.1);
  assert.equal(read(scope, "particles.length"), 8, "recovery effects happen once, not every immune frame");
  assert.equal(read(scope, "player.hp"), 2);
});

test("the final down pose and recovered character blink without completely disappearing", () => {
  const { scope, calls, ctx } = createGame();
  scope.takePlayerDamage(1);
  scope.updatePlayer(downDuration(scope));
  const alphas = [];
  for (const time of [0, 0.15, 0.25]) {
    read(scope, `player.downTime=PLAYER_DOWN_ANIMATION_DURATION+${time}`);
    calls.length = 0;
    scope.drawPlayer();
    assert.equal(body(calls).args[1], 1608);
    alphas.push(body(calls).alpha);
    assert.equal(ctx.globalAlpha, 1);
  }
  assert.deepEqual(alphas, [1, 0.28, 1]);
  read(scope, "player.downTime=PLAYER_DOWN_ANIMATION_DURATION");
  scope.updatePlayer(2);
  for (const [time, alpha] of [[0.15, 0.28], [0.25, 1]]) {
    read(scope, `gameTime=${time}`);
    calls.length = 0;
    scope.drawPlayer();
    assert.ok(body(calls).args[0].source.includes("/stand.png?"));
    assert.equal(body(calls).alpha, alpha);
  }
});

test("movement, jumping and shooting are locked while down, then return after recovery", () => {
  const { scope } = createGame();
  scope.takePlayerDamage(1);
  const x = read(scope, "player.x");
  read(scope, "controls.right=true; controls.up=true; controls.jump=true; controls.down=true; controls.fire=true; jumpQueued=true");
  for (let i = 0; i < 60; i += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.x"), x);
  assert.equal(read(scope, "player.vx || player.vy"), 0);
  assert.equal(read(scope, "bullets.length"), 0);
  assert.equal(read(scope, "player.grounded"), true);
  assert.equal(read(scope, "player.fireAnimationTime"), 0);
  read(scope, "for(const key of Object.keys(controls)) controls[key]=false");
  scope.updatePlayer(downDuration(scope) + 2 - 1);
  read(scope, "controls.right=true");
  scope.updatePlayer(1 / 60);
  assert.ok(read(scope, "player.x") > x);
  read(scope, "controls.right=false");
  for (let i = 0; i < 30; i += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.vx"), 0);
  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 1);
  read(scope, "controls.fire=false; controls.jump=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.grounded"), false);
  assert.ok(read(scope, "player.vy") < 0);
});

for (const kind of ["turret-laser", "boss-laser", "monster2-fireball"]) {
  test(`${kind} starts the same down sequence on contact`, () => {
    const { scope } = createGame();
    read(scope, `const hit=getPlayerHitbox(); enemyBullets.push({kind:'${kind}',
      x:hit.x+hit.width/2,y:hit.y+hit.height/2,vx:520,vy:0,radius:8,remainingRange:490})`);
    scope.updateBullets(1 / 60);
    assert.equal(read(scope, "player.hp"), 2);
    assert.equal(read(scope, "player.downPhase"), "fall");
    assert.equal(read(scope, "enemyBullets.length"), 0);
  });
}

test("monster1 jump contact and boss contact use the common damage sequence", () => {
  for (const attack of ["monster1", "boss"]) {
    const { scope } = createGame();
    if (attack === "monster1") {
      read(scope, `const enemy=addEnemy(fixtureRoad,968,'monster1');
        enemy.state='jump'; enemy.jumpOriginSurfaceY=500; enemy.jumpVy=0; enemy.jumpVx=0`);
      scope.updateEnemies(1 / 60);
    } else {
      read(scope, `midBosses.push({x:980,y:400,width:50,height:70,alive:true,
        phase:0,moveTimer:5,targetY:400,baseY:400,fireTimer:5})`);
      scope.updateMidBosses(1 / 60);
    }
    assert.equal(read(scope, "player.hp"), 2);
    assert.equal(read(scope, "player.downPhase"), "fall");
  }
});

test("every monster body and turret contact removes exactly one heart", () => {
  for (const kind of ["monster1", "monster2", "monster3", "monster4"]) {
    const { scope } = createGame();
    read(scope, `
      globalThis.contactEnemy=addEnemy(fixtureRoad,player.x,'${kind}');
      contactEnemy.x=player.x;
      contactEnemy.y=player.y;
      contactEnemy.hoverBaseY=player.y;
      contactEnemy.hoverAnchorX=player.x;
      contactEnemy.hoverAmplitude=0;
    `);
    scope.updateEnemies(0);
    assert.equal(read(scope, "player.hp"), 2, `${kind} contact damage`);
    assert.equal(read(scope, "player.downPhase"), "fall");
    assert.equal(scope.contactEnemy.contactDamageTimer,
      read(scope, "HOSTILE_CONTACT_COOLDOWN"));
  }

  const { scope } = createGame();
  read(scope, "addTurret(fixtureRoad,player.x); globalThis.contactTurret=turrets[0]");
  scope.updateTurrets(0);
  assert.equal(read(scope, "player.hp"), 2, "turret contact damage");
  assert.equal(read(scope, "player.downPhase"), "fall");
  assert.equal(scope.contactTurret.contactDamageTimer,
    read(scope, "HOSTILE_CONTACT_COOLDOWN"));
});

test("a shielded ground rush damages each monster type once and knocks it backward", () => {
  for (const kind of ["monster1", "monster2", "monster3", "monster4"]) {
    const { scope, calls } = createGame();
    read(scope, `
      player.vx=PLAYER_RUN_MAX_SPEED;
      player.runSpeed=PLAYER_RUN_MAX_SPEED;
      player.accelerationShieldStage=2;
      player.accelerationShieldCharges=2;
      player.accelerationShieldVisual=2;
      globalThis.rammedEnemy=addEnemy(
        fixtureRoad,
        player.x+player.width-12,
        '${kind}'
      );
      rammedEnemy.x=player.x+player.width-12;
      if (rammedEnemy.kind==='monster3') {
        rammedEnemy.y=player.y;
        rammedEnemy.hoverBaseY=player.y;
        rammedEnemy.hoverAnchorX=rammedEnemy.x;
        rammedEnemy.hoverAmplitude=0;
      }
    `);

    scope.updateEnemies(0);
    assert.equal(read(scope, "player.hp"), 3, `${kind} rush keeps player health`);
    assert.equal(read(scope, "player.downPhase"), "");
    assert.equal(read(scope, "player.accelerationShieldCharges"), 1);
    assert.equal(scope.rammedEnemy.hp, scope.rammedEnemy.maxHp - 1, `${kind} takes one damage`);
    assert.equal(scope.rammedEnemy.hitDirection, 1);
    assert.equal(
      scope.rammedEnemy.hitKnockbackVelocity,
      read(scope, "PLAYER_SHIELD_RAM_KNOCKBACK_SPEED"),
    );
    assert.ok(scope.rammedEnemy.hitTimer >= read(scope, "PLAYER_SHIELD_RAM_KNOCKBACK_DURATION"));
    assert.equal(scope.rammedEnemy.contactDamageTimer,
      read(scope, "HOSTILE_CONTACT_COOLDOWN"));
    assert.ok(read(scope, "particles.some((particle)=>particle.shieldBreakFlash)"));
    assert.equal(
      read(scope, "particles.filter((particle)=>particle.shieldRamImpact).length"),
      1,
    );
    const ramImpact = read(scope, "particles.find((particle)=>particle.shieldRamImpact)");
    assert.equal(ramImpact.color, "#b86cff");
    assert.equal(ramImpact.direction, 1);
    calls.length = 0;
    scope.drawPlayerShieldRamImpact(ramImpact);
    assert.equal(calls.filter((call) => call.operation === "ellipse").length, 3);
    assert.equal(calls.filter((call) => call.operation === "stroke").length, 3);
    assert.equal(calls.filter((call) => call.operation === "rotate").length, 8);

    const hpAfterRam = scope.rammedEnemy.hp;
    scope.updateEnemies(0.01);
    assert.equal(scope.rammedEnemy.hp, hpAfterRam, "contact cooldown prevents repeated ram damage");
  }
});

test("shield contact while moving away blocks damage without becoming a ram attack", () => {
  const { scope } = createGame();
  read(scope, `
    player.vx=-PLAYER_RUN_MAX_SPEED;
    player.runSpeed=PLAYER_RUN_MAX_SPEED;
    player.accelerationShieldStage=1;
    player.accelerationShieldCharges=1;
    player.accelerationShieldVisual=1;
    globalThis.behindEnemy=addEnemy(
      fixtureRoad,
      player.x+player.width-12,
      'monster2'
    );
    behindEnemy.x=player.x+player.width-12;
  `);
  scope.updateEnemies(0);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.accelerationShieldCharges"), 0);
  assert.equal(scope.behindEnemy.hp, scope.behindEnemy.maxHp);
  assert.equal(scope.behindEnemy.hitKnockbackVelocity, 0);
});

test("body contact cooldown prevents frame-by-frame repeated damage", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.contactEnemy=addEnemy(fixtureRoad,player.x,'monster2');
    contactEnemy.x=player.x; contactEnemy.y=player.y;
  `);
  scope.updateEnemies(0);
  assert.equal(read(scope, "player.hp"), 2);

  read(scope, "resetPlayerDownState(); player.invincible=0; player.hp=3");
  scope.updateEnemies(0.1);
  assert.equal(read(scope, "player.hp"), 3);
  scope.updateEnemies(read(scope, "HOSTILE_CONTACT_COOLDOWN"));
  assert.equal(read(scope, "player.hp"), 2);
});

test("recovery immunity lasts three seconds without restoring health", () => {
  const { scope } = createGame();
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(scope.takePlayerDamage(1), false);
  scope.updatePlayer(2.999);
  assert.equal(scope.takePlayerDamage(1), false);
  assert.equal(read(scope, "player.hp"), 2);
  scope.updatePlayer(0.002);
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "player.hp"), 1);
  assert.equal(read(scope, "player.downPhase"), "fall");
});

test("the revival wave deals two damage to nearby hostiles and knocks surviving monsters outward", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.left=addEnemy(fixtureRoad,820,'monster1'); left.state='windup';
    globalThis.right=addEnemy(fixtureRoad,1070,'monster2'); right.state='inhale';
    globalThis.far=addEnemy(fixtureRoad,1400,'monster1');
    globalThis.dead=addEnemy(fixtureRoad,740,'monster1'); dead.alive=false;
    globalThis.above=addEnemy(fixtureRoad,970,'monster1'); above.y=-300; above.state='jump';
    turrets.push({x:950,y:350,width:108,height:156,alive:true,hp:15,hitTimer:0});
    midBosses.push({x:1030,y:370,width:80,height:90,alive:true,hp:8});
  `);
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(scope.left.hp, 0);
  assert.equal(scope.left.alive, false);
  assert.equal(scope.right.hitKnockbackVelocity, 750);
  assert.equal(scope.right.hitTimer, 0.72);
  assert.equal(scope.right.state, "chase");
  for (const enemy of [scope.far, scope.dead, scope.above]) assert.equal(enemy.hitKnockbackVelocity, 0);
  assert.equal(scope.right.hp, 8);
  assert.equal(scope.far.hp, 2);
  assert.equal(scope.dead.hp, 2);
  assert.equal(scope.above.hp, 2);
  assert.equal(read(scope, "turrets[0].hp"), 13);
  assert.equal(read(scope, "turrets[0].hitTimer"), 0.18);
  assert.equal(read(scope, "turrets[0].hitKnockbackVelocity"), undefined);
  assert.equal(read(scope, "midBosses[0].hp"), 6);
  assert.equal(read(scope, "player.score"), scope.left.score);
  const rightX = scope.right.x;
  scope.updateEnemies(0.02);
  assert.ok(scope.right.x > rightX);
});

test("revival damage follows the visible expanding ring instead of filling its radius", () => {
  const { scope } = createGame();
  read(scope, `
    const waveCenterY=getPlayerHitbox().y+getPlayerHitbox().height/2;
    globalThis.nearWaveTurret={
      x:1020,y:waveCenterY-10,width:20,height:20,alive:true,hp:10,hitTimer:0,
    };
    globalThis.outerWaveTurret={
      x:1170,y:waveCenterY-10,width:20,height:20,alive:true,hp:10,hitTimer:0,
    };
    turrets.push(nearWaveTurret,outerWaveTurret);
  `);
  scope.takePlayerDamage(1);
  recover(scope, false);
  assert.equal(scope.nearWaveTurret.hp, 10);
  assert.equal(scope.outerWaveTurret.hp, 10,
    "targets inside the eventual radius are not damaged immediately");

  scope.updatePlayerRevivalWave(0.05);
  assert.equal(scope.nearWaveTurret.hp, 8);
  assert.equal(scope.outerWaveTurret.hp, 10);

  scope.updatePlayerRevivalWave(0.8);
  assert.equal(scope.nearWaveTurret.hp, 8,
    "the passing ring damages each target only once");
  assert.equal(scope.outerWaveTurret.hp, 8,
    "the outer target is damaged when the visible ring reaches it");
});

test("revival damage uses the same organic and metal hit sounds as bullets", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.revivalHitSounds=[];
    playGunHitSound=()=>{revivalHitSounds.push('gun_hit')};
    playMetalHitSound=()=>{revivalHitSounds.push('metal')};
    globalThis.organicLeft=addEnemy(fixtureRoad,840,'monster1');
    globalThis.organicRight=addEnemy(fixtureRoad,1080,'monster2');
    globalThis.metalEnemy=addEnemy(fixtureRoad,980,'monster3');
    metalEnemy.y=player.y;
    turrets.push({x:950,y:350,width:108,height:156,alive:true,hp:15,hitTimer:0});
  `);

  scope.takePlayerDamage(1);
  recover(scope);

  assert.deepEqual(Array.from(read(scope, "revivalHitSounds")), ["gun_hit", "metal"]);
  assert.equal(scope.organicLeft.hp, 0);
  assert.equal(scope.organicRight.hp, 8);
  assert.equal(scope.metalEnemy.hp, 3);
  assert.equal(read(scope, "turrets[0].hp"), 13);
});

test("a close monster group is pushed outwards without body overlap", () => {
  const { scope } = createGame();
  const group = read(scope, "[1080,1152,1224].map(x=>addEnemy(fixtureRoad,x,'monster1'))");
  for (const enemy of group) enemy.hp = 4;
  const startingX = Array.from(group, (enemy) => enemy.x);
  scope.takePlayerDamage(1);
  recover(scope);
  for (let frame = 0; frame < 43; frame += 1) {
    scope.updateEnemies(1 / 60);
    for (let i = 1; i < group.length; i += 1) {
      assert.ok(group[i - 1].x + group[i - 1].width + 8 <= group[i].x + 1e-9);
    }
  }
  assert.ok(group.every((enemy, index) => enemy.x > startingX[index]));
});

test("slower down timing keeps the fall visible past the previous half-second limit", () => {
  const { scope, calls } = createGame();
  scope.takePlayerDamage(1);
  scope.updatePlayer(0.5);
  assert.equal(read(scope, "player.downPhase"), "fall");
  scope.drawPlayer();
  assert.equal(body(calls).args[1], 1608);
  assert.equal(body(calls).alpha, 1);
  scope.updatePlayer(0.125);
  assert.equal(read(scope, "player.downPhase"), "hold");
  scope.updatePlayer(1.999);
  assert.equal(read(scope, "player.downPhase"), "hold");
  scope.updatePlayer(0.001);
  assert.equal(read(scope, "player.downPhase"), "");
  assert.ok(Math.abs(read(scope, "player.invincible") - 3) < 1e-9);
});

function knockbackDistance(kind, dt) {
  const { scope } = createGame();
  const enemy = read(scope, `addEnemy(fixtureRoad,${kind === "monster1" ? 820 : 1070},'${kind}')`);
  enemy.hp = Math.max(enemy.hp, 4);
  scope.takePlayerDamage(1);
  recover(scope);
  const startX = enemy.x;
  while (enemy.hitTimer > dt + 1e-9) scope.updateEnemies(dt);
  return Math.abs(enemy.x - startX);
}

function formerRevivalKnockbackDistance(dt) {
  let velocity = 1500;
  let timer = 0.72;
  let distance = 0;
  while (timer > dt + 1e-9) {
    timer -= dt;
    distance += velocity * dt;
    velocity *= Math.exp(-3 * dt);
  }
  return distance;
}

test("revival pushes both monster types half the former distance", () => {
  for (const kind of ["monster1", "monster2"]) for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const formerDistance = formerRevivalKnockbackDistance(dt);
    const reducedDistance = knockbackDistance(kind, dt);
    assert.ok(Math.abs(reducedDistance / formerDistance - 0.5) < 0.03,
      `${kind}: ${formerDistance}px -> ${reducedDistance}px`);
  }
});

test("normal bullets do not truncate the reduced revival push, and normal impact returns afterwards", () => {
  const { scope } = createGame();
  const enemy = read(scope, "addEnemy(fixtureRoad,1070,'monster2')");
  scope.takePlayerDamage(1);
  recover(scope);
  const box = scope.getEnemyHitbox(enemy);
  read(scope, `bullets.push({x:${enemy.x + enemy.width / 2},y:${box.y + 30},vx:1520,vy:0,radius:3})`);
  scope.updateBullets(0);
  assert.equal(enemy.hp, 7);
  assert.equal(enemy.hitKnockbackVelocity, 750);
  assert.equal(enemy.hitTimer, 0.72);
  assert.equal(enemy.revivalKnockback, true);
  for (let frame = 0; frame < 45; frame += 1) scope.updateEnemies(1 / 60);
  assert.equal(enemy.revivalKnockback, false);
  assert.equal(enemy.hitKnockbackVelocity, 0);
  scope.applyEnemyBulletImpact(enemy, { vx: 1520 });
  assert.equal(enemy.hitTimer, enemy.hitDuration);
  assert.equal(enemy.hitKnockbackVelocity, enemy.hitKnockbackSpeed);
});

test("reduced revival knockback still respects platform edges and does not teleport across gaps", () => {
  const { scope } = createGame();
  const enemy = read(scope, "addEnemy(fixtureRoad,1070,'monster2')");
  const initialCenterX = enemy.x + enemy.width / 2;
  scope.fixtureRoad.end = initialCenterX + 50;
  scope.takePlayerDamage(1);
  recover(scope);
  for (let frame = 0; frame < 43; frame += 1) scope.updateEnemies(1 / 60);
  assert.ok(enemy.x + enemy.width / 2 <= scope.fixtureRoad.end);
  assert.ok(enemy.x + enemy.width / 2 > initialCenterX);
  assert.equal(enemy.y + enemy.height, 500);
  assert.equal(enemy.platform, scope.fixtureRoad);
});

test("airborne monsters are also knocked away instead of being snapped to the ground", () => {
  const { scope } = createGame();
  const enemy = read(scope, "addEnemy(fixtureRoad,1010,'monster1')");
  enemy.y = 350;
  enemy.state = "jump";
  enemy.jumpVy = -80;
  enemy.jumpOriginSurfaceY = 500;
  enemy.hp = 4;
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(enemy.jumpVx, 750);
  assert.equal(enemy.jumpHit, true);
  const x = enemy.x;
  scope.updateEnemies(1 / 60);
  assert.ok(enemy.x > x);
  assert.ok(enemy.y + enemy.height < 500);
});

test("a small set of revival orbs spirals outward and fades gradually", () => {
  const { scope, calls, ctx } = createGame();
  scope.takePlayerDamage(1);
  recover(scope);
  const orbs = read(scope, "particles.filter(p=>p.revivalOrb)");
  assert.equal(orbs.length, 8);
  assert.ok(orbs.every((orb) => orb.size >= 14 && orb.size <= 17 && orb.maxLife >= 0.92));
  assert.ok(orbs.every((orb) => orb.color === "#d996ff" && orb.coreColor === "#f6ddff"));
  assert.ok(orbs.every((orb) => orb.angularVelocity > 5 && orb.radialVelocity > 90));
  const initialX = orbs[0].x;
  const initialY = orbs[0].y;
  const initialAngle = orbs[0].angle;
  const initialRadius = orbs[0].radius;
  scope.drawParticles();
  const circles = calls.filter((call) => call.operation === "arc");
  assert.equal(circles.length, 8);
  assert.equal(read(scope, "particles.length"), 8, "rendering does not allocate more particles");
  const initialAlpha = calls.find((call) => call.operation === "fill").alpha;
  assert.ok(initialAlpha >= 0.94, "the compact orbs start crisp and nearly opaque");
  calls.length = 0;
  scope.updateParticles(0.4);
  scope.drawParticles();
  const middleAlpha = calls.find((call) => call.operation === "fill").alpha;
  assert.ok(orbs[0].angle > initialAngle, "the points rotate around the player");
  assert.ok(orbs[0].radius > initialRadius, "the spiral expands outwards");
  calls.length = 0;
  scope.updateParticles(0.4);
  scope.drawParticles();
  const lateAlpha = calls.find((call) => call.operation === "fill").alpha;
  assert.ok(initialAlpha > middleAlpha && middleAlpha > lateAlpha && lateAlpha > 0);
  assert.ok(Math.hypot(orbs[0].x - initialX, orbs[0].y - initialY) > 150);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(read(scope, "particles.length"), 8, "the spiral remains visible after 0.8 seconds");
  scope.updateParticles(0.31);
  assert.equal(read(scope, "particles.length"), 0);
});

test("the player continues falling and lands normally while the down motion takes priority", () => {
  const { scope } = createGame();
  read(scope, "player.y=200; player.grounded=false; player.platform=null");
  scope.takePlayerDamage(1);
  for (let frame = 0; frame < 60; frame += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.grounded"), true);
  assert.equal(read(scope, "player.y+player.height"), 500);
  assert.equal(read(scope, "player.downPhase"), "hold");
});

test("orientation changes preserve down timing and ground alignment", () => {
  const { scope } = createGame();
  scope.takePlayerDamage(1);
  scope.updatePlayer(0.35);
  const time = read(scope, "player.downTime");
  scope.resizeGameResolution(1280, 720);
  assert.equal(read(scope, "player.downTime"), time);
  assert.equal(read(scope, "player.y+player.height"), scope.fixtureRoad.y);
  scope.updatePlayer(downDuration(scope) - 0.35);
  scope.updatePlayer(2);
  assert.equal(read(scope, "player.downPhase"), "");
  assert.equal(read(scope, "player.invincible"), 3);
});

test("MAP pauses down and invincibility timers alongside the game clock", () => {
  const { scope } = createGame();
  scope.takePlayerDamage(1);
  scope.update(downDuration(scope));
  scope.toggleTestMap();
  const before = read(scope, "[player.downTime,player.invincible,gameTime]");
  scope.update(2);
  assert.deepEqual(read(scope, "[player.downTime,player.invincible,gameTime]"), before);
  scope.toggleTestMap();
  scope.update(0.1);
  assert.ok(read(scope, "player.downTime") > before[0]);
});

test("lethal damage finishes the down motion, then shows game over without revival", () => {
  const { scope, canvas, calls } = createGame();
  const overlays = [];
  scope.drawOverlay = (title) => overlays.push(title);
  scope.drawMinimap = () => {};
  read(scope, "player.hp=0.5");
  scope.takePlayerDamage(1);
  assert.equal(read(scope, "player.hp"), 0);
  assert.equal(read(scope, "gameOver"), true);
  scope.drawHud();
  assert.deepEqual(overlays, []);
  canvas.listeners.pointerdown();
  assert.equal(read(scope, "player.hp"), 0, "held mobile input cannot skip the lethal motion");
  scope.update(downDuration(scope));
  assert.equal(read(scope, "player.downPhase"), "hold");
  scope.update(2);
  assert.equal(read(scope, "player.downPhase"), "defeated");
  assert.equal(read(scope, "particles.filter(p=>p.revivalOrb).length"), 0);
  scope.drawPlayer();
  assert.equal(body(calls).args[1], 1608);
  scope.drawHud();
  assert.deepEqual(overlays, ["GAME OVER"]);
  canvas.listeners.pointerdown();
  assert.equal(read(scope, "gameOver"), false);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.downPhase"), "");
});

test("resetting the game clears a down state, recovery particles and immunity", () => {
  const { scope } = createGame();
  scope.takePlayerDamage(1);
  recover(scope);
  scope.resetGame();
  assert.equal(read(scope, "player.downPhase"), "");
  assert.equal(read(scope, "player.downTime"), 0);
  assert.equal(read(scope, "player.invincible"), 0);
  assert.equal(read(scope, "particles.length"), 0);
  assert.equal(read(scope, "player.hp"), 3);
});
