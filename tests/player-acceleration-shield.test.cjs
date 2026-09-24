"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1, globalCompositeOperation: "source-over" }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        const snapshot = stack.pop();
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, snapshot);
      };
      if (["createRadialGradient", "createLinearGradient"].includes(key)) {
        return (...args) => {
          calls.push({ operation: key, args });
          return {
            addColorStop(offset, color) {
              calls.push({ operation: "colorStop", args: [offset, color] });
            },
          };
        };
      }
      return (...args) => calls.push({
        operation: key,
        args,
        alpha: target.globalAlpha,
        blend: target.globalCompositeOperation,
      });
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game"
        ? { getContext: () => ctx } : null,
    },
    window: {
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "renderer"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  vm.runInContext(`
    platforms.push({kind:'flat',id:1,start:0,end:2000,y:500,features:[]});
    player.x=400; player.y=420; player.hp=3; player.maxHp=3;
    player.grounded=true; player.invincible=0; gameOver=false;
    cameraX=0; cameraY=0;
  `, scope);
  return { scope, calls, ctx };
}

function read(scope, source) {
  return vm.runInContext(source, scope);
}

test("two acceleration-shield charges each absorb one enemy attack", () => {
  const { scope } = createGame();
  read(scope, `
    player.runSpeed=PLAYER_RUN_MAX_SPEED;
    player.accelerationShieldStage=2;
    player.accelerationShieldCharges=2;
    player.accelerationShieldVisual=2;
  `);

  assert.equal(scope.takePlayerDamage(1, { kind: "monster1", x: 300, y: 450 }), true);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.downPhase"), "");
  assert.equal(read(scope, "player.accelerationShieldCharges"), 1);
  assert.ok(read(scope, "player.accelerationShieldHitTimer") > 0);
  assert.ok(read(scope, "particles.length") >= 18);
  assert.equal(read(scope, "particles[0].color"), "#aa63ff");

  assert.equal(scope.takePlayerDamage(1, { kind: "turret-laser", x: 300, y: 450 }), false);
  assert.equal(read(scope, "player.accelerationShieldCharges"), 1,
    "the short block grace does not spend two charges on one contact");
  read(scope, "player.accelerationShieldBlockTimer=0");
  assert.equal(scope.takePlayerDamage(1, { kind: "monster2-fireball", x: 300, y: 450 }), true);
  assert.equal(read(scope, "player.hp"), 3);
  assert.equal(read(scope, "player.accelerationShieldCharges"), 0);

  read(scope, "player.accelerationShieldBlockTimer=0");
  assert.equal(scope.takePlayerDamage(1, { kind: "monster4", x: 300, y: 450 }), true);
  assert.equal(read(scope, "player.hp"), 2);
  assert.equal(read(scope, "player.downPhase"), "fall");
});

test("acceleration shield ignores environmental damage", () => {
  const { scope } = createGame();
  read(scope, `
    player.accelerationShieldStage=2;
    player.accelerationShieldCharges=2;
    player.accelerationShieldVisual=2;
  `);
  assert.equal(scope.takePlayerDamage(0.5), true);
  assert.equal(read(scope, "player.hp"), 2.5);
  assert.equal(read(scope, "player.downPhase"), "fall");
});

test("shield draws a dense purple X inside concentric circular gradients", () => {
  const { scope, calls, ctx } = createGame();
  const draw = (level, charges) => {
    calls.length = 0;
    read(scope, `
      player.accelerationShieldVisual=${level};
      player.accelerationShieldCharges=${charges};
      player.accelerationShieldHitTimer=0;
    `);
    scope.drawPlayerAccelerationShield(false);
    scope.drawPlayerAccelerationShield(true);
    return {
      circles: calls.filter((call) => call.operation === "arc").map((call) => call.args),
      crossLines: calls.filter((call) => call.operation === "lineTo").length,
      nodes: calls.filter((call) => call.operation === "fillRect").length,
      colors: calls.filter((call) => call.operation === "colorStop")
        .map((call) => call.args[1]),
      blends: calls.filter((call) => ["fill", "stroke", "fillRect"].includes(
        call.operation,
      )).map((call) => call.blend),
    };
  };

  const firstStage = draw(1, 1);
  const secondStage = draw(2, 2);
  assert.equal(firstStage.circles.length, 4, "one field and three close rings");
  assert.equal(secondStage.circles.length, 6, "one field and five close rings");
  assert.ok(secondStage.crossLines > firstStage.crossLines);
  assert.ok(secondStage.nodes > firstStage.nodes);
  assert.ok(secondStage.colors.every((color) => !/255, 255, 255|100, 225, 255|68, 218, 255/.test(color)));
  assert.ok(secondStage.blends.every((blend) => blend === "lighter"));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});
