"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: () => ({ getContext: () => ({ setTransform() {} }) }) },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "combat"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return scope;
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("standing and crouching collision boxes narrow evenly without moving their center or feet", () => {
  const scope = createGame();
  const centerX = read(scope, "player.x + player.width / 2");
  const feetY = read(scope, "player.y + player.height");
  const standing = read(scope, "getPlayerHitbox()");
  assert.equal(standing.width, 64);
  assert.equal(standing.height, 144);
  assert.equal(standing.x + standing.width / 2, centerX);
  assert.equal(standing.y + standing.height, feetY);

  read(scope, "player.crouching=true");
  const crouching = read(scope, "getPlayerHitbox()");
  assert.equal(crouching.width, 66);
  assert.equal(crouching.height, 123);
  assert.equal(crouching.x + crouching.width / 2, centerX);
  assert.equal(crouching.y + crouching.height, feetY);
});

test("a small projectile misses the removed side margin but still hits inside the new box", () => {
  const scope = createGame();
  for (const crouching of [false, true]) {
    read(scope, `player.crouching=${crouching}`);
    const hitbox = read(scope, "getPlayerHitbox()");
    const y = hitbox.y + hitbox.height / 2;
    for (const side of [-1, 1]) {
      const outsideX = side < 0 ? hitbox.x - 2 : hitbox.x + hitbox.width + 2;
      const insideX = side < 0 ? hitbox.x + 1 : hitbox.x + hitbox.width - 1;
      assert.equal(scope.overlapsCircleRect({ x: outsideX, y, radius: 1.5 }, hitbox), false);
      assert.equal(scope.overlapsCircleRect({ x: insideX, y, radius: 1.5 }, hitbox), true);
    }
  }
});
