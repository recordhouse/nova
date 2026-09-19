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

test("only a road crossing the hero is faded locally; the supporting and distant roads stay solid", () => {
  const { scope, calls, ctx } = createGame();
  const before = read(scope, "JSON.stringify(platforms)");
  scope.drawTerrain();
  const passes = read(scope, "drawPasses");
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.support.id),
    (pass) => pass.alpha), [1]);
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.overhead.id),
    (pass) => pass.alpha), [1, 0.22]);
  assert.deepEqual(Array.from(passes.filter((pass) => pass.id === scope.distant.id),
    (pass) => pass.alpha), [1]);
  assert.equal(calls.filter((call) => call.operation === "clip" && call.args[0] === "evenodd").length, 1);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(read(scope, "JSON.stringify(platforms)"), before);
});

test("triangular undersides fade when they intrude into the hero's upper-body space", () => {
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
    (pass) => pass.alpha), [1, 0.22]);
  assert.ok(calls.some((call) => call.operation === "clip" && call.args[0] === "evenodd"));
});

test("sloped roads use the same local fade without changing their geometry", () => {
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
    (pass) => pass.alpha), [1, 0.22]);
  assert.equal(read(scope, "JSON.stringify(overhead)"), before);
});

test("roads stop fading once the player leaves their visual overlap", () => {
  const { scope, calls } = createGame();
  read(scope, "player.x=700");
  scope.drawTerrain();
  assert.deepEqual(Array.from(read(scope, "drawPasses.filter(pass=>pass.id===overhead.id)"),
    (pass) => pass.alpha), [1]);
  assert.equal(calls.some((call) => call.operation === "clip" && call.args[0] === "evenodd"), false);
});
