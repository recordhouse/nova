"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("test controls are centered at the very bottom of the screen", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const rule = css.match(/\.test-controls\s*\{([^}]+)\}/s)?.[1] ?? "";
  assert.match(rule, /bottom:\s*max\(8px,\s*var\(--game-safe-bottom\)\)/);
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

test("touch controls place ultimate above jump to the left of fire with uppercase labels", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(html, /data-control="fire"/);
  assert.match(html, /data-control="ultimate"/);
  assert.match(html, /class="control-button action jump"[\s\S]*data-control="jump"/);
  assert.match(html, /aria-label="이동, 위쪽 사격 조준, 앉기 조이스틱"/);
  assert.match(css, /\.action-controls\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.control-button\.fire\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1\s*\/\s*3/s);
  assert.match(css, /\.control-button\.ultimate\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1/s);
  assert.match(css, /\.control-button\.jump\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2/s);
  assert.match(html, /data-control="fire"[^>]*>FIRE<\/button>/);
  assert.match(html, /data-control="ultimate"[\s\S]*?>ULT<\/button>/);
  assert.match(html, /data-control="jump"[\s\S]*?>JUMP<\/button>/);
  assert.match(css, /\.control-button\.action\s*\{[^}]*width:\s*clamp\(54px,\s*15vw,\s*74px\)/s);
  assert.match(css, /\.control-button\.ultimate::before\s*\{[^}]*conic-gradient\([^}]*--ultimate-progress/s);
  assert.match(css, /\.control-button\.ultimate::before\s*\{[^}]*#fff4ff[^}]*#c9a7ff/s);
  assert.match(css, /\.control-button\.ultimate\.ready::before\s*\{[^}]*#fffaff[^}]*#c9a7ff[^}]*drop-shadow/s);
  assert.doesNotMatch(css, /\.touch-controls\s*\{[^}]*opacity:/s);
});

test("rapid taps on touch controls cannot trigger browser zoom", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const input = fs.readFileSync(path.join(__dirname, "..", "js", "input.js"), "utf8");
  assert.match(css, /\.touch-controls\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.control-button\s*\{[^}]*touch-action:\s*none/s);
  assert.match(input, /addEventListener\("dblclick",[\s\S]*?\.closest\?\.\("\.touch-controls"\)[\s\S]*?preventDefault\(\)/);
});

test("the smaller two-circle joystick uses a larger screen-relative touch zone", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const input = fs.readFileSync(path.join(__dirname, "..", "js", "input.js"), "utf8");
  assert.match(html, /class="move-controls"\s+data-movement-zone/);
  assert.doesNotMatch(html, /joystick-arrow/);
  assert.doesNotMatch(css, /\.movement-joystick::(?:before|after)/);
  assert.match(css, /\.movement-joystick\s*\{[^}]*width:\s*clamp\(92px,\s*24vw,\s*118px\)/s);
  assert.match(css, /\.move-controls\s*\{[^}]*width:\s*clamp\(124px,\s*31vw,\s*154px\)/s);
  assert.match(input, /event\.clientX\s*-\s*\(rect\.left\s*\+\s*rect\.width\s*\/\s*2\)/);
  assert.match(input, /movementJoystickTouchZone\.addEventListener\("pointerdown"/);
});

test("mobile portrait view rotates the landscape game and declares landscape install mode", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "manifest.webmanifest"), "utf8",
  ));
  assert.match(html, /rel="manifest"/);
  assert.match(css, /\.game-shell\.mobile-landscape\.mobile-landscape-portrait\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(90deg\)/s);
  assert.match(css, /\.game-shell\.mobile-landscape\.mobile-landscape-portrait\s*\{[^}]*width:\s*var\(--mobile-game-width/s);
  assert.match(css, /\.game-shell\.mobile-landscape\.mobile-landscape-portrait\s*\{[^}]*height:\s*var\(--mobile-game-height/s);
  assert.match(css, /\.game-shell\.mobile-landscape\.mobile-landscape-portrait\s*\{[^}]*--game-safe-bottom:\s*env\(safe-area-inset-left,\s*0px\)/s);
  assert.match(css, /\.game-shell\.mobile-landscape\s*\{[^}]*position:\s*fixed[^}]*height:\s*min\(100dvh/s);
  assert.match(css, /\.touch-controls\s*\{[^}]*padding:\s*0\s+1\.8%\s+max\(8px,\s*var\(--game-safe-bottom\)\)/s);
  assert.doesNotMatch(css, /\.touch-controls\s*\{[^}]*max\(3\.2%,/s);
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.display, "fullscreen");
});
