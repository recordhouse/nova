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

test("a running reversal briefly slides, brakes, then accelerates to full speed the other way", () => {
  const { scope } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  const reversalX = read(scope, "player.x");
  assert.equal(read(scope, "player.vx"), 245);

  read(scope, "controls.right=false; controls.left=true");
  scope.updatePlayer(frame);
  assert.ok(read(scope, "player.vx") > 0 && read(scope, "player.vx") < 245);
  assert.ok(read(scope, "player.x") > reversalX, "momentum carries the player briefly forward");
  assert.equal(read(scope, "player.facing"), -1);

  let farthestX = read(scope, "player.x");
  for (let i = 0; i < 30; i += 1) {
    scope.updatePlayer(frame);
    farthestX = Math.max(farthestX, read(scope, "player.x"));
  }
  assert.ok(farthestX - reversalX > 10 && farthestX - reversalX < 30);
  assert.equal(read(scope, "player.vx"), -245);
  assert.ok(read(scope, "player.x") < farthestX);
  assert.equal(read(scope, "player.reversalDirection"), 0);
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

test("normal starting, stopping, and airborne reverse remain immediate and spark-free", () => {
  const { scope } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  read(scope, "controls.right=false");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 0);
  read(scope, "controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), -245);
  assert.equal(read(scope, "particles.length"), 0);

  read(scope, "player.grounded=false; player.platform=null; player.y=300; controls.left=false; controls.right=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.vx"), 245);
  assert.equal(read(scope, "particles.length"), 0);
});

test("jumping, taking damage and resetting cancel an in-progress skid", () => {
  const { scope } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(frame);
  read(scope, "controls.right=false; controls.left=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.reversalDirection"), -1);

  read(scope, "controls.jump=true");
  scope.updatePlayer(frame);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.reversalDirection"), 0);
  assert.equal(read(scope, "player.vx"), -245);

  read(scope, "controls.jump=false; controls.left=false; player.grounded=true; player.platform=fixtureRoad; player.y=420; player.vx=245; controls.left=true");
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
