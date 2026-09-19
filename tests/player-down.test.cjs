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
function recover(scope) {
  scope.updatePlayer(downDuration(scope));
  scope.updatePlayer(2);
}

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

test("damage starts a protected down animation and cancels crouching, movement and queued fire", () => {
  const { scope } = createGame();
  read(scope, "player.vx=245; player.vy=-400; player.crouching=true; jumpQueued=true; player.fireWasActive=true");
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
  assert.equal(read(scope, "particles.filter(p=>p.revivalFlame).length"), 72);
  assert.equal(read(scope, "particles.length"), 72, "recovery has no circular wave particle");
  calls.length = 0;
  scope.drawPlayer();
  assert.ok(body(calls).args[0].source.includes("/stand.png?"));
  scope.updatePlayer(0.1);
  assert.equal(read(scope, "particles.length"), 72, "recovery effects happen once, not every immune frame");
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

test("the revival wave knocks nearby living monsters left/right without damaging them or turrets", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.left=addEnemy(fixtureRoad,820,'monster1'); left.state='windup';
    globalThis.right=addEnemy(fixtureRoad,1070,'monster2'); right.state='inhale';
    globalThis.far=addEnemy(fixtureRoad,1400,'monster1');
    globalThis.dead=addEnemy(fixtureRoad,740,'monster1'); dead.alive=false;
    globalThis.above=addEnemy(fixtureRoad,970,'monster1'); above.y=-300; above.state='jump';
    turrets.push({x:950,y:350,width:108,height:156,alive:true,hp:15});
  `);
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(scope.left.hitKnockbackVelocity, -1500);
  assert.equal(scope.right.hitKnockbackVelocity, 1500);
  assert.equal(scope.left.hitTimer, 0.72);
  assert.equal(scope.right.hitTimer, 0.72);
  assert.equal(scope.left.state, "chase");
  assert.equal(scope.right.state, "chase");
  for (const enemy of [scope.far, scope.dead, scope.above]) assert.equal(enemy.hitKnockbackVelocity, 0);
  assert.equal(scope.left.hp, 2);
  assert.equal(scope.right.hp, 10);
  assert.equal(read(scope, "turrets[0].hp"), 15);
  assert.equal(read(scope, "turrets[0].hitKnockbackVelocity"), undefined);
  assert.equal(read(scope, "player.score"), 0);
  const leftX = scope.left.x;
  const rightX = scope.right.x;
  scope.updateEnemies(0.02);
  assert.ok(scope.left.x < leftX);
  assert.ok(scope.right.x > rightX);
});

test("a close monster group is pushed outwards without body overlap", () => {
  const { scope } = createGame();
  const group = read(scope, "[1080,1152,1224].map(x=>addEnemy(fixtureRoad,x,'monster1'))");
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
  scope.takePlayerDamage(1);
  recover(scope);
  const startX = enemy.x;
  while (enemy.hitTimer > dt + 1e-9) scope.updateEnemies(dt);
  return Math.abs(enemy.x - startX);
}

function previousKnockbackDistance(dt) {
  let velocity = 1000;
  let timer = 0.5;
  let distance = 0;
  while (timer > dt + 1e-9) {
    timer -= dt;
    distance += velocity * dt;
    velocity *= Math.exp(-4 * dt);
  }
  return distance;
}

test("revival pushes both monster types at least 70% farther than the prior knockback", () => {
  for (const kind of ["monster1", "monster2"]) for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const previousDistance = previousKnockbackDistance(dt);
    const strongerDistance = knockbackDistance(kind, dt);
    assert.ok(strongerDistance > 350, `${kind} moved ${strongerDistance}px`);
    assert.ok(strongerDistance > previousDistance * 1.7,
      `${kind}: ${previousDistance}px -> ${strongerDistance}px`);
  }
});

test("normal bullets do not truncate the stronger revival push, and normal impact returns afterwards", () => {
  const { scope } = createGame();
  const enemy = read(scope, "addEnemy(fixtureRoad,1070,'monster2')");
  scope.takePlayerDamage(1);
  recover(scope);
  const box = scope.getEnemyHitbox(enemy);
  read(scope, `bullets.push({x:${enemy.x + enemy.width / 2},y:${box.y + 30},vx:1520,vy:0,radius:3})`);
  scope.updateBullets(0);
  assert.equal(enemy.hp, 9);
  assert.equal(enemy.hitKnockbackVelocity, 1500);
  assert.equal(enemy.hitTimer, 0.72);
  assert.equal(enemy.revivalKnockback, true);
  for (let frame = 0; frame < 45; frame += 1) scope.updateEnemies(1 / 60);
  assert.equal(enemy.revivalKnockback, false);
  assert.equal(enemy.hitKnockbackVelocity, 0);
  scope.applyEnemyBulletImpact(enemy, { vx: 1520 });
  assert.equal(enemy.hitTimer, enemy.hitDuration);
  assert.equal(enemy.hitKnockbackVelocity, enemy.hitKnockbackSpeed);
});

test("extended revival knockback still respects platform edges and does not teleport across gaps", () => {
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
  scope.takePlayerDamage(1);
  recover(scope);
  assert.equal(enemy.jumpVx, 1500);
  assert.equal(enemy.jumpHit, true);
  const x = enemy.x;
  scope.updateEnemies(1 / 60);
  assert.ok(enemy.x > x);
  assert.ok(enemy.y + enemy.height < 500);
});

test("denser, thinner revival rays travel outward and fade gradually", () => {
  const { scope, calls, ctx } = createGame();
  scope.takePlayerDamage(1);
  recover(scope);
  const flames = read(scope, "particles.filter(p=>p.revivalFlame)");
  assert.equal(flames.length, 72);
  assert.ok(flames.every((flame) => flame.size <= 3.2 && flame.maxLife >= 0.85));
  assert.ok(flames.some((flame) => flame.vx < -400));
  assert.ok(flames.some((flame) => flame.vx > 400));
  assert.ok(flames.some((flame) => flame.vy < -400));
  assert.ok(flames.some((flame) => flame.vy > 400));
  const initialX = flames[0].x;
  const initialY = flames[0].y;
  scope.drawParticles();
  assert.ok(calls.some((call) => call.color === "#cb8aff"));
  assert.ok(calls.some((call) => call.color === "#fff1ff"));
  assert.equal(calls.some((call) => call.operation === "arc"), false, "no circular revival ring is drawn");
  assert.equal(read(scope, "particles.length"), 72, "rendering does not allocate more particles");
  const rays = calls.filter((call) => call.operation === "fillRect");
  assert.equal(rays.length, 72 * 2);
  assert.ok(rays.every((call) => call.args[3] <= 1.6));
  const initialAlpha = rays[0].alpha;
  calls.length = 0;
  scope.updateParticles(0.4);
  scope.drawParticles();
  const middleAlpha = calls.find((call) => call.operation === "fillRect").alpha;
  calls.length = 0;
  scope.updateParticles(0.4);
  scope.drawParticles();
  const lateAlpha = calls.find((call) => call.operation === "fillRect").alpha;
  assert.ok(initialAlpha > middleAlpha && middleAlpha > lateAlpha && lateAlpha > 0);
  assert.ok(Math.hypot(flames[0].x - initialX, flames[0].y - initialY) > 300);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(read(scope, "particles.length"), 72, "the thin rays continue fading after 0.8 seconds");
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
  assert.equal(read(scope, "particles.filter(p=>p.revivalFlame).length"), 0);
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
