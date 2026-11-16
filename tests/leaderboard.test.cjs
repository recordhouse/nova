"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function leaderboardScope(saved = null) {
  const values = new Map();
  if (saved !== null) values.set("nova.leaderboard.v1", saved);
  const scope = {
    document: { querySelector: () => null },
    window: {
      localStorage: {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); },
      },
      addEventListener() {},
    },
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(path.join(root, "js", "leaderboard.js"), "utf8"),
    scope,
    { filename: "leaderboard.js" },
  );
  return { scope, values };
}

test("game over uses an English neon pixel-art registration panel", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const panel = html.match(/<section class="game-over-panel"[\s\S]*?<\/section>\s*<\/div>\s*<\/section>/)?.[0] ?? "";
  assert.match(panel, />GAME OVER</);
  assert.match(panel, />FINAL SCORE</);
  assert.match(panel, />ENTER NAME</);
  assert.match(panel, /placeholder="NAME"/);
  assert.match(panel, />\s*OK\s*</);
  assert.match(panel, />\s*RESTART\s*</);
  assert.doesNotMatch(panel, /[가-힣]/);
  assert.match(css, /\.game-over-title\s*\{[^}]*text-shadow:/s);
  assert.match(css, /game-over-neon-pulse/);
  assert.match(css, /\.game-over-panel\s*\{[^}]*repeating-linear-gradient/s);
  assert.match(css, /\.game-over-layout\s*\{[^}]*height:\s*min\(84%,\s*620px\)/s);
  assert.match(css, /\.game-over-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/s);
  assert.match(css, /\.game-over-name-label\s*\{[^}]*clip-path:\s*inset\(50%\)/s);
});

test("leaderboard keeps only the best 100 scores and resolves ties by registration time", () => {
  const { scope, values } = leaderboardScope();
  const entries = Array.from({ length: 105 }, (_, index) => ({
    id: `id-${index}`,
    name: `P${index}`,
    score: index,
    createdAt: 1000 + index,
  }));
  entries.push(
    { id: "tie-first", name: "FIRST", score: 999, createdAt: 1 },
    { id: "tie-second", name: "SECOND", score: 999, createdAt: 2 },
  );
  const result = vm.runInContext(
    `saveLeaderboardEntries(${JSON.stringify(entries)})`,
    scope,
  );
  assert.equal(result.length, 100);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.slice(0, 2).map((entry) => entry.name))),
    ["FIRST", "SECOND"],
  );
  assert.ok(result.at(-1).score > 0);
  assert.equal(JSON.parse(values.get("nova.leaderboard.v1")).length, 100);
});

test("score registration sanitizes and limits the player name", () => {
  const { scope } = leaderboardScope();
  const result = vm.runInContext(
    `registerLeaderboardScore("  NOVA\\n  PILOT-LONG-NAME  ", 4321)`,
    scope,
  );
  assert.equal(result.rank, 1);
  assert.equal(Array.from(result.entry.name).length, 12);
  assert.equal(result.entry.score, 4321);
  assert.equal(result.entries[0].id, result.entry.id);
});

test("game over input blocks canvas-tap restart and renders ranks 1 through 100", () => {
  const input = fs.readFileSync(path.join(root, "js", "input.js"), "utf8");
  const leaderboard = fs.readFileSync(path.join(root, "js", "leaderboard.js"), "utf8");
  assert.doesNotMatch(input, /if \(gameOver && !playerIsDown\(\)\) resetGame\(\)/);
  assert.match(leaderboard, /index < LEADERBOARD_LIMIT/);
  assert.match(leaderboard, /String\(index \+ 1\)\.padStart\(3, "0"\)/);
  assert.match(leaderboard, /gameOverRestartElement\?\.addEventListener\("click"/);
});
