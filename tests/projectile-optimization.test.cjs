"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const ctx = { setTransform() {} };
  const scope = {
    impactSoundCalls: 0,
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game"
      ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  scope.playPlayerGunImpactSound = () => { scope.impactSoundCalls += 1; };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "enemies"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return scope;
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("projectile broad phase keeps nearby flat, ramp and triangular roads", () => {
  const scope = createGame();
  read(scope, `platforms.push(
    {id:1,kind:'flat',start:100,end:300,y:500},
    {id:2,kind:'ramp',start:400,end:500,entryX:400,exitX:500,entryY:450,exitY:550},
    {id:3,kind:'flat',start:600,end:700,y:450,routeRole:'sub',floatingTriangleAngle:45},
    {id:4,kind:'flat',start:600,end:700,y:800},
    {id:5,kind:'flat',start:5000,end:5100,y:490}
  )`);
  assert.deepEqual(Array.from(scope.projectilePlatformCandidates(
    { x: 200, y: 475, radius: 5 }, 20), (road) => road.id), [1]);
  assert.deepEqual(Array.from(scope.projectilePlatformCandidates(
    { x: 450, y: 500, radius: 5 }, 10), (road) => road.id), [2]);
  assert.deepEqual(Array.from(scope.projectilePlatformCandidates(
    { x: 650, y: 490, radius: 5 }, 5), (road) => road.id), [3]);

  const bullet = { kind: "player-bullet", x: 200, y: 450, vx: 0, vy: 600, radius: 5 };
  assert.equal(scope.moveRicochetingBullet(bullet, 0.1, "#c9a7ff"), true);
  assert.equal(bullet.ricochets, 1);
  assert.ok(bullet.vy < 0);
  assert.equal(read(scope, "particles.filter(p=>p.lightImpact).length"), 0);
  assert.equal(read(scope, "particles.filter(p=>p.impactRay).length"), 7);
  assert.ok(read(scope, "particles.every(p=>p.coreColor==='#ffffff')"));
  assert.ok(read(scope, "particles.every(p=>p.color==='#f2dcff'||p.color==='#d7a6ff')"));
  assert.equal(scope.impactSoundCalls, 1);
});

test("player ricochet sound plays on screen-wall bounces but not the final collision", () => {
  const scope = createGame();
  const wallBullet = { kind: "player-bullet", x: 714, y: 200,
    vx: 600, vy: 0, radius: 5, ricochetScreenEdges: true };
  assert.equal(scope.moveRicochetingBullet(wallBullet, 0.01, "#c9a7ff"), true);
  assert.equal(wallBullet.ricochets, 1);
  assert.ok(wallBullet.vx < 0);
  assert.equal(scope.impactSoundCalls, 1);

  read(scope, "platforms.push({id:1,kind:'flat',start:100,end:300,y:500})");
  const finalBullet = { kind: "player-bullet", x: 200, y: 450,
    vx: 0, vy: 600, radius: 5, maxRicochets: 0 };
  assert.equal(scope.moveRicochetingBullet(finalBullet, 0.1, "#c9a7ff"), false);
  assert.equal(scope.impactSoundCalls, 1);
});

test("the two bullets in each player fire pair share one ricochet sound per bounce", () => {
  const scope = createGame();
  assert.equal(scope.shootPlayer(), true);
  assert.equal(scope.shootPlayer(), true);
  assert.equal(read(scope, "bullets.length"), 2);
  assert.equal(read(scope, "bullets[0].impactSoundGroup === bullets[1].impactSoundGroup"), true);

  for (const bullet of read(scope, "bullets")) {
    bullet.x = 714;
    bullet.y = 200;
    bullet.vx = 600;
    bullet.vy = 0;
    assert.equal(scope.moveRicochetingBullet(bullet, 0.01, "#c9a7ff"), true);
  }
  assert.equal(scope.impactSoundCalls, 1, "the first paired bounce has one sound");

  for (const bullet of read(scope, "bullets")) {
    bullet.x = 6;
    bullet.vx = -600;
    assert.equal(scope.moveRicochetingBullet(bullet, 0.01, "#c9a7ff"), true);
  }
  assert.equal(scope.impactSoundCalls, 2, "the pair can sound once again on its next bounce");
});

test("a player's bullet computes hitboxes only for enemies at its horizontal position", () => {
  const scope = createGame();
  read(scope, `
    for (let index=0; index<150; index++) {
      enemies.push({alive:true,x:1000+index*100,y:500,width:30,height:50});
    }
    enemies.push({alive:true,x:90,y:500,width:30,height:50});
    bullets.push({x:100,y:100,vx:0,vy:0,radius:4});
    globalThis.hitboxCalls=0;
    getEnemyHitbox=(enemy) => {
      hitboxCalls++;
      return {x:enemy.x,y:enemy.y,width:enemy.width,height:enemy.height};
    };
  `);
  scope.updateBullets(0);
  assert.equal(read(scope, "hitboxCalls"), 1);
  assert.equal(read(scope, "bullets.length"), 1);
});
