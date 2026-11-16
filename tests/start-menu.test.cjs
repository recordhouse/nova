"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("the first screen presents NOVA with exactly the three requested actions", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<section class="start-screen" data-start-screen/);
  assert.match(html, /class="start-screen-title">NOVA<\/h1>/);
  assert.equal((html.match(/data-start-game/g) ?? []).length, 1);
  assert.equal((html.match(/data-start-ranking(?!-)/g) ?? []).length, 1);
  assert.equal((html.match(/data-start-share(?!-)/g) ?? []).length, 1);
  assert.match(html, /data-start-game[^>]*>START<\/button>/);
  assert.match(html, /data-start-ranking[^>]*>RANKING<\/button>/);
  assert.match(html, /data-start-share[^>]*>SHARE<\/button>/);
});

test("the NOVA menu uses the neon pixel-art treatment", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /\.start-screen-title\s*\{[^}]*text-shadow:/s);
  assert.match(css, /\.start-screen-button\s*\{[^}]*clip-path:/s);
  assert.match(css, /start-screen-title-pulse/);
  assert.match(css, /\.start-screen-grid\s*\{[^}]*perspective/s);
  assert.doesNotMatch(css, /nova-title-screen-v1/);
});

test("START pauses gameplay and music until the player chooses it", () => {
  const menu = fs.readFileSync(path.join(root, "js", "menu.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const assets = fs.readFileSync(path.join(root, "js", "assets.js"), "utf8");
  assert.match(menu, /let mainMenuActive = Boolean\(startScreenElement\)/);
  assert.match(menu, /setCurrentStageMusicPaused\(false\)/);
  assert.match(main, /mainMenuActive[^\n]*&& mainMenuActive\) return;/);
  assert.match(assets, /stageMusicPaused = TEST_MODE \|\| mainMenuStartsVisible/);
});

test("RANKING reuses TOP 100 and SHARE uses native sharing with copy fallback", () => {
  const menu = fs.readFileSync(path.join(root, "js", "menu.js"), "utf8");
  assert.match(menu, /renderLeaderboardInto\(/);
  assert.match(menu, /loadLeaderboardEntries\(\)/);
  assert.match(menu, /navigator\.share\(shareData\)/);
  assert.match(menu, /navigator\.clipboard\?\.writeText/);
});
