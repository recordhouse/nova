"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("test controls are centered at the very bottom of the screen", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const rule = css.match(/\.test-controls\s*\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(rule, /bottom:\s*max\(8px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(rule, /clamp\(112px,\s*30vw,\s*148px\)/);
  assert.match(rule, /left:\s*50%/);
  assert.match(rule, /transform:\s*translateX\(-50%\)/);
  assert.match(rule, /justify-content:\s*center/);
  assert.doesNotMatch(rule, /(?:^|;)\s*top\s*:/);
});

test("test controls include the dedicated turret spawn button", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-test-spawn-turret/);
  assert.match(html, /aria-label="포탑 한 기 생성"/);
  assert.match(css, /\.test-monster-spawn-button\.turret\s*\{/);
});
