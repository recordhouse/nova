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

test("test controls include an immediate ultimate button", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-test-ultimate/);
  assert.match(html, /aria-label="필살기 즉시 발동"/);
  assert.match(css, /\.test-ultimate-button\s*\{/);
});

test("touch controls place ultimate above jump to the right of fire", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-control="fire"/);
  assert.match(html, /data-control="ultimate"/);
  assert.match(html, /class="control-button action jump"[\s\S]*data-control="jump"/);
  assert.match(html, /aria-label="이동, 위쪽 사격 조준, 앉기 조이스틱"/);
  assert.match(css, /\.action-controls\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.control-button\.fire\s*\{[^}]*grid-row:\s*1\s*\/\s*3/s);
  assert.match(css, /\.control-button\.ultimate\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/s);
  assert.match(css, /\.control-button\.jump\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2/s);
});

test("mobile portrait view rotates the landscape game and declares landscape install mode", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "manifest.webmanifest"), "utf8",
  ));
  assert.match(html, /rel="manifest"/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)[\s\S]*\.game-shell\.mobile-landscape\s*\{[^}]*transform:\s*rotate\(90deg\)/);
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.display, "fullscreen");
});
