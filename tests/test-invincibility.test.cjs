"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(testMode = true) {
  const button = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const tools = { hidden: false };
  const canvas = { getContext: () => ({ setTransform() {} }), addEventListener() {} };
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-invincibility]" ? button
          : selector === "[data-test-controls]" ? tools : null,
      querySelectorAll: () => [], addEventListener() {},
    },
    window: { location: { search: testMode ? "?test=1" : "" }, addEventListener() {},
      innerWidth: 720, innerHeight: 1280, matchMedia: () => ({ matches: false }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "input"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, button, tools };
}

function read(scope, source) { return vm.runInContext(source, scope); }
function click(button) { button.listeners.click({ preventDefault() {} }); }

test("GOD toggles test-only damage immunity without changing the timed blink", () => {
  const { scope, button } = createGame();
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.equal(read(scope, "testInvincibility"), false);
  click(button);
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.ok(button.attributes["aria-label"].includes("켜짐"));
  assert.equal(read(scope, "player.invincible"), 0);
  assert.equal(scope.takePlayerDamage(1), false);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.downPhase"), "");
  click(button);
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "player.hp"), 2);
  assert.equal(read(scope, "player.downPhase"), "fall");
});

test("GOD prevents electric wire damage and its hit reaction", () => {
  const { scope, button } = createGame();
  vm.runInContext(`
    const feature={type:'electric-hose',width:120,centerX:300,phase:0.4,seed:42};
    const road={id:1,kind:'flat',start:0,end:600,y:200,features:[feature]};
    platforms.push(road);
    const point=electricWirePoints(road,feature)[8];
    player.x=point.x-player.width/2;
    player.y=point.y+PLAYER_HITBOX_HEIGHT/2-player.height;
    player.grounded=false;
  `, scope);
  click(button);
  scope.updateElectricWires();
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.downPhase"), "");
  assert.equal(read(scope, "particles.length"), 0);
  assert.equal(read(scope, "shake"), 0);
  click(button);
  scope.updateElectricWires();
  assert.equal(read(scope, "player.hp"), 2.5);
});

test("GOD protects against moving enemy projectiles", () => {
  const { scope, button } = createGame();
  click(button);
  vm.runInContext(`
    const hitbox=getPlayerHitbox();
    enemyBullets.push({kind:'monster2-fireball',x:hitbox.x+hitbox.width/2,
      y:hitbox.y+hitbox.height/2,vx:520,vy:0,radius:22,remainingRange:100,
      riseAcceleration:170});
  `, scope);
  scope.updateBullets(1 / 60);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.downPhase"), "");
  click(button);
  vm.runInContext(`
    const hitbox2=getPlayerHitbox();
    enemyBullets.push({kind:'turret-laser',x:hitbox2.x+hitbox2.width/2,
      y:hitbox2.y+hitbox2.height/2,vx:0,vy:0,radius:10});
  `, scope);
  scope.updateBullets(1 / 60);
  assert.equal(read(scope, "player.hp"), 2);
});

test("normal play cannot activate GOD even if the hidden button is clicked", () => {
  const { scope, button, tools } = createGame(false);
  assert.equal(tools.hidden, true);
  click(button);
  assert.equal(read(scope, "testInvincibility"), false);
  vm.runInContext("testInvincibility=true", scope);
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "player.hp"), 2);
});
