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
        if (key === "fillRect") {
          assert.ok(args[2] >= 0 && args[3] >= 0);
          calls.push({ args, alpha: target.globalAlpha, color: target.fillStyle,
            blend: target.globalCompositeOperation });
        }
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500,features:[]};
    platforms.push(fixtureRoad);
    player.x=1000; player.y=500-player.height;
    player.grounded=true; player.platform=fixtureRoad;
    minWorldX=0; maxWorldX=2000;
    cameraX=700;
  `, scope);
  return { scope, calls, ctx };
}

function read(scope, source) { return vm.runInContext(source, scope); }
const frame = 1 / 60;

test("a running reversal briefly slides, brakes, then starts building speed the other way", () => {
  const { scope } = createGame();
  const runSpeed = read(scope, "player.speed");
  assert.equal(runSpeed, 275);
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  const reversalX = read(scope, "player.x");
  assert.equal(read(scope, "player.vx"), runSpeed);

  read(scope, "controls.right=false; controls.left=true");
  scope.updatePlayer(frame);
  assert.ok(read(scope, "player.vx") > 0 && read(scope, "player.vx") < runSpeed);
  assert.ok(read(scope, "player.x") > reversalX, "momentum carries the player briefly forward");
  assert.equal(read(scope, "player.facing"), -1);

  let farthestX = read(scope, "player.x");
  for (let i = 0; i < 30; i += 1) {
    scope.updatePlayer(frame);
    farthestX = Math.max(farthestX, read(scope, "player.x"));
  }
  assert.ok(farthestX - reversalX > 25 && farthestX - reversalX < 42);
  assert.ok(read(scope, "player.vx") < -runSpeed);
  assert.ok(Math.abs(read(scope, "player.vx")) <= read(scope, "PLAYER_RUN_MAX_SPEED"));
  assert.ok(read(scope, "player.x") < farthestX);
  assert.equal(read(scope, "player.reversalDirection"), 0);
});

test("a sustained run builds speed to a cap and stopping resets the buildup", () => {
  const { scope } = createGame();
  read(scope, "fixtureRoad.end=10000; maxWorldX=10000; controls.right=true");
  scope.updatePlayer(frame);
  const startingSpeed = read(scope, "player.vx");
  assert.equal(startingSpeed, 275);

  for (let i = 0; i < 180; i += 1) scope.updatePlayer(frame);
  const maximumSpeed = read(scope, "PLAYER_RUN_MAX_SPEED");
  assert.equal(read(scope, "player.vx"), maximumSpeed);
  assert.ok(maximumSpeed > startingSpeed);

  read(scope, "controls.right=false");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 0);
  assert.equal(read(scope, "player.runSpeed"), startingSpeed);
});

test("a faster takeoff keeps its momentum and travels farther through the jump", () => {
  const { scope } = createGame();
  read(scope, "fixtureRoad.end=10000; maxWorldX=10000; controls.right=true");
  for (let i = 0; i < 180; i += 1) scope.updatePlayer(frame);
  const maximumSpeed = read(scope, "PLAYER_RUN_MAX_SPEED");
  assert.equal(read(scope, "player.vx"), maximumSpeed);

  read(scope, "controls.jump=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.vx"), maximumSpeed);
  const takeoffX = read(scope, "player.x");

  read(scope, "controls.jump=false");
  for (let i = 0; i < 30; i += 1) scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), maximumSpeed);
  assert.ok(read(scope, "player.x") - takeoffX > 200);
});

test("stepping off an edge briefly preserves both the ground jump and double jump", () => {
  const { scope } = createGame();
  read(scope, `
    maxWorldX=3000;
    player.x=1977;
    controls.right=true;
  `);
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.jumpCount"), 0);
  assert.ok(read(scope, "player.coyoteTime") > 0);

  read(scope, "controls.jump=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.jumpCount"), 1);
  assert.equal(read(scope, "player.airJumpAvailable"), true);

  read(scope, "controls.jump=false");
  scope.updatePlayer(frame);
  read(scope, "controls.jump=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.jumpCount"), 2);
  assert.equal(read(scope, "player.airJumpAvailable"), false);
  assert.ok(read(scope, "player.vy") < 0);
});

test("a jump pressed just before landing is buffered into the next grounded frame", () => {
  const { scope } = createGame();
  read(scope, `
    player.y=413;
    player.vy=500;
    player.grounded=false;
    player.platform=null;
    player.jumpCount=2;
    player.airJumpAvailable=false;
    player.coyoteTime=0;
    controls.jump=true;
  `);
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), true);
  assert.ok(read(scope, "player.jumpBufferTimer") > 0);

  read(scope, "controls.jump=false");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.jumpCount"), 1);
  assert.equal(read(scope, "player.airJumpAvailable"), true);
  assert.ok(read(scope, "player.vy") < 0);
});

test("short electric sparks appear at the feet only while braking, with bounded count", () => {
  const { scope, calls, ctx } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "particles.length"), 0);

  read(scope, "controls.right=false; controls.left=true");
  scope.updatePlayer(frame);
  const sparks = read(scope, "particles.filter(p=>p.reversalSpark)");
  assert.equal(sparks.length, 2);
  assert.ok(sparks.every((spark) => spark.y >= 490 && spark.y <= 496));
  assert.ok(sparks.every((spark) => spark.vx < 0 && spark.life <= 0.21));

  scope.drawParticles();
  assert.equal(calls.length, 8, "each spark is a short pixel zigzag with a bright tip");
  assert.ok(calls.every((call) => call.blend === "lighter"));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");

  for (let i = 0; i < 30; i += 1) scope.updatePlayer(frame);
  const finalCount = read(scope, "particles.filter(p=>p.reversalSpark).length");
  assert.ok(finalCount <= 16, "one short skid cannot create unbounded particles");
  assert.equal(read(scope, "player.reversalDirection"), 0);
});

test("a brief joystick dead-zone still becomes a running reversal", () => {
  const { scope } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  const releaseX = read(scope, "player.x");

  read(scope, "controls.right=false");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 0);
  read(scope, "controls.left=true");
  scope.updatePlayer(frame);

  assert.equal(read(scope, "player.reversalDirection"), -1);
  assert.ok(read(scope, "player.vx") > 0, "recent momentum is restored for the skid");
  assert.ok(read(scope, "player.x") > releaseX);
  assert.equal(read(scope, "particles.filter(p=>p.reversalSpark).length"), 2);
});

test("overlapping opposite keys also pass through neutral into a reversal", () => {
  const { scope } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  read(scope, "controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 0);
  read(scope, "controls.right=false");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.reversalDirection"), -1);
  assert.ok(read(scope, "player.vx") > 0);
});

test("normal starting, a deliberate stop, and airborne reverse remain immediate and spark-free", () => {
  const { scope } = createGame();
  const runSpeed = read(scope, "player.speed");
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  read(scope, "controls.right=false");
  for (let i = 0; i < 10; i += 1) scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 0);
  assert.equal(read(scope, "player.reversalGraceTimer"), 0);
  read(scope, "controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), -runSpeed);
  assert.equal(read(scope, "particles.length"), 0);

  read(scope, "player.grounded=false; player.platform=null; player.y=300; controls.left=false; controls.right=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), runSpeed);
  assert.equal(read(scope, "particles.length"), 0);
});

test("jumping, taking damage and resetting cancel an in-progress skid", () => {
  const { scope } = createGame();
  const runSpeed = read(scope, "player.speed");
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  read(scope, "controls.right=false; controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.reversalDirection"), -1);

  read(scope, "controls.jump=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.reversalDirection"), 0);
  assert.equal(read(scope, "player.vx"), -runSpeed);

  read(scope, "controls.jump=false; controls.left=false; player.grounded=true; player.platform=fixtureRoad; player.y=420; player.vx=player.speed; controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.reversalDirection"), -1);
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "player.vx"), 0);
  assert.equal(read(scope, "player.reversalDirection"), 0);
  assert.equal(read(scope, "player.reversalSparkTimer"), 0);

  read(scope, "player.reversalDirection=-1; player.reversalSparkTimer=0.02");
  scope.resetPlayerPosition();
  assert.equal(read(scope, "player.reversalDirection"), 0);
  assert.equal(read(scope, "player.reversalSparkTimer"), 0);
});
