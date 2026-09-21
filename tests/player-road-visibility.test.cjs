"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => calls.push({ operation: key, args, alpha: target.globalAlpha });
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    globalThis.support=addPlatform(0,900,0);
    globalThis.overhead=addPlatform(300,600,-1);
    globalThis.distant=addPlatform(300,600,-3);
    player.x=400;
    player.y=support.y-player.height;
    player.platform=support;
    cameraX=0; cameraY=0;
    globalThis.drawPasses=[];
    const originalDrawTerrainPlatform=drawTerrainPlatform;
    drawTerrainPlatform=(platform,palette,railColor,isSubPath)=>{
      drawPasses.push({id:platform.id,alpha:ctx.globalAlpha});
      originalDrawTerrainPlatform(platform,palette,railColor,isSubPath);
    };
  `, scope);
  return { scope, calls, ctx };
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("roads remain solid around the hero without revealing a background-shaped patch", () => {
  const { scope, calls, ctx } = createGame();
  const before = read(scope, "JSON.stringify(platforms)");
  scope.drawTerrain();
  const passes = read(scope, "drawPasses");
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.support.id),
    (pass) => pass.alpha), [1]);
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.overhead.id),
    (pass) => pass.alpha), [1]);
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.distant.id),
    (pass) => pass.alpha), [1]);
  assert.equal(calls.some((call) => call.operation === "clip" && call.args[0] === "evenodd"), false);
  assert.equal(calls.some((call) => call.operation === "ellipse"), false);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(read(scope, "JSON.stringify(platforms)"), before);
});

test("triangular undersides stay solid when they cross the hero's upper-body space", () => {
  const { scope, calls } = createGame();
  read(scope, `
    overhead.isJumpPad=true;
    overhead.trick='horizontal-jump';
    overhead.jumpPadTriangleAngle=45;
    overhead.y=support.y-270;
    platforms.splice(platforms.indexOf(distant),1);
  `);
  scope.drawTerrain();
  assert.deepEqual(Array.from(read(scope, "drawPasses.filter(pass=>pass.id===overhead.id)"),
    (pass) => pass.alpha), [1]);
  assert.equal(calls.some((call) => call.operation === "clip" && call.args[0] === "evenodd"), false);
});

test("sloped roads stay solid without changing their geometry", () => {
  const { scope } = createGame();
  read(scope, `
    overhead.kind='ramp';
    overhead.entryY=support.y-230;
    overhead.exitY=support.y-100;
    overhead.y=overhead.entryY;
  `);
  const before = read(scope, "JSON.stringify(overhead)");
  scope.drawTerrain();
  assert.deepEqual(Array.from(read(scope, "drawPasses.filter(pass=>pass.id===overhead.id)"),
    (pass) => pass.alpha), [1]);
  assert.equal(read(scope, "JSON.stringify(overhead)"), before);
});

test("moving the player does not change road opacity", () => {
  const { scope, calls } = createGame();
  read(scope, "player.x=700");
  scope.drawTerrain();
  assert.deepEqual(Array.from(read(scope, "drawPasses.filter(pass=>pass.id===overhead.id)"),
    (pass) => pass.alpha), [1]);
  assert.equal(calls.some((call) => call.operation === "clip" && call.args[0] === "evenodd"), false);
});

test("the hero is painted after solid terrain so roads cannot cover the sprite", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.layerOrder=[];
    drawTerrain=()=>layerOrder.push('terrain');
    drawHeartItems=()=>{};
    drawBossGate=()=>{};
    drawPlayer=()=>layerOrder.push('player');
    drawPlayerPhysicsDebug=()=>{};
    drawProjectiles=()=>{};
    drawParticles=()=>{};
  `);
  scope.drawWorld();
  assert.deepEqual(Array.from(read(scope, "layerOrder")), ["terrain", "player"]);
});
