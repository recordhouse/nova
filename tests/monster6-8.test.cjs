"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("monster 6, 7 and 8 sprites are transparent PNG assets", () => {
  for (const number of [6, 7, 8]) {
    const file = path.join(
      root,
      "assets",
      "images",
      "monsters",
      `monster_0${number}.png`,
    );
    const image = fs.readFileSync(file);
    assert.equal(image.toString("ascii", 1, 4), "PNG");
    assert.equal(image[25], 6, "PNG must use RGBA color type");
  }
});

test("three new monsters have distinct bounded attacks", () => {
  const config = read("js/config.js");
  const enemies = read("js/enemies.js");
  const combat = read("js/combat.js");
  const renderer = read("js/renderer.js");
  const world = read("js/world.js");
  const assets = read("js/assets.js");

  for (const number of [6, 7, 8]) {
    assert.match(config, new RegExp(`monster${number}:\\s*\\{`));
    assert.match(assets, new RegExp(`monster${number}: loadImageAsset\\("\\./assets/images/monsters/monster_0${number}\\.png`));
    assert.match(world, new RegExp(`"monster${number}"`));
  }
  assert.match(enemies, /kind: "monster6-disc"/);
  assert.match(enemies, /kind: "monster7-lance"/);
  assert.match(enemies, /kind: "monster8-mine"/);
  assert.match(enemies, /activeMines\.length >= definition\.mineLimit/);
  assert.match(combat, /function burstMonster8MineExplosion/);
  assert.match(renderer, /bullet\.kind === "monster6-disc"/);
  assert.match(renderer, /bullet\.kind === "monster7-lance"/);
  assert.match(renderer, /bullet\.kind === "monster8-mine"/);
});
