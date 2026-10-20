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
        lineWidth: target.lineWidth,
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
  assert.equal(read(scope, "player.accelerationShieldHitDirection"), -1);
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

test("a maximum-speed shield hit plays the run voice once per consumed charge", () => {
  const { scope } = createGame();
  read(scope, `
    globalThis.runVoiceCalls=0;
    playFemaleRunVoice=()=>{runVoiceCalls+=1};
    player.vx=PLAYER_RUN_MAX_SPEED;
    player.runSpeed=PLAYER_RUN_MAX_SPEED;
    player.accelerationShieldStage=3;
    player.accelerationShieldCharges=3;
    player.accelerationShieldVisual=3;
  `);

  assert.equal(scope.takePlayerDamage(1, {
    kind: "monster2-fireball", x: 300, y: 450,
  }), true);
  assert.equal(read(scope, "runVoiceCalls"), 1);
  assert.equal(read(scope, "player.accelerationShieldCharges"), 2);

  assert.equal(scope.takePlayerDamage(1, {
    kind: "monster2-fireball", x: 300, y: 450,
  }), false);
  assert.equal(read(scope, "runVoiceCalls"), 1,
    "the grace window for one impact must not repeat the voice");

  read(scope, `
    player.accelerationShieldBlockTimer=0;
    player.vx=PLAYER_RUN_MAX_SPEED-1;
  `);
  assert.equal(scope.takePlayerDamage(1, {
    kind: "monster3-laser", x: 300, y: 450,
  }), true);
  assert.equal(read(scope, "runVoiceCalls"), 1,
    "a shield hit below maximum speed must stay silent");
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

test("third acceleration-shield charge also absorbs one enemy attack", () => {
  const { scope } = createGame();
  read(scope, `
    player.accelerationShieldStage=3;
    player.accelerationShieldCharges=3;
    player.accelerationShieldVisual=3;
  `);
  for (const kind of ["monster1", "monster2-fireball", "monster3-laser"]) {
    assert.equal(scope.takePlayerDamage(1, { kind, x: 300, y: 450 }), true);
    assert.equal(read(scope, "player.hp"), 3);
    read(scope, "player.accelerationShieldBlockTimer=0");
  }
  assert.equal(read(scope, "player.accelerationShieldCharges"), 0);
  assert.equal(scope.takePlayerDamage(1, { kind: "monster4", x: 300, y: 450 }), true);
  assert.equal(read(scope, "player.hp"), 2);
});

test("every spent shield charge breaks its three orbit dots into visible shards", () => {
  const { scope, calls, ctx } = createGame();
  read(scope, `
    player.accelerationShieldStage=3;
    player.accelerationShieldCharges=3;
    player.accelerationShieldVisual=3;
  `);

  for (const expectedTier of [3, 2, 1]) {
    const particleStart = read(scope, "particles.length");
    assert.equal(scope.takePlayerDamage(1, {
      kind: "monster3-laser",
      x: 300,
      y: 450,
    }), true);
    assert.equal(
      read(scope, `particles.slice(${particleStart}).filter(
        (particle)=>particle.shieldBreakFlash
      ).length`),
      1,
    );
    assert.equal(
      read(scope, `particles.slice(${particleStart}).find(
        (particle)=>particle.shieldBreakFlash
      ).shieldTier`),
      expectedTier,
    );
    assert.equal(
      read(scope, `particles.slice(${particleStart}).filter(
        (particle)=>particle.shieldBreakShard
      ).length`),
      3 * read(scope, "PLAYER_ACCELERATION_SHIELD_BREAK_SHARDS_PER_DOT"),
    );
    assert.equal(
      read(scope, `new Set(particles.slice(${particleStart}).filter(
        (particle)=>particle.shieldBreakShard
      ).map((particle)=>particle.x+":"+particle.y)).size`),
      3,
      "each of the disappearing orbit dots shatters at its own position",
    );
    read(scope, "player.accelerationShieldBlockTimer=0");
  }

  calls.length = 0;
  scope.drawParticles();
  assert.ok(calls.filter((call) => call.operation === "ellipse").length >= 18);
  assert.ok(calls.filter((call) => call.operation === "stroke").length >= 18);
  assert.ok(calls.some((call) => call.operation === "closePath"));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});

test("shield smoothly expands from three cached purple dots to six and nine", () => {
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
      dots: calls.filter((call) => ["arc", "drawImage"].includes(call.operation)).length,
      expensiveEffects: calls.filter((call) => [
        "createRadialGradient",
        "createLinearGradient",
        "stroke",
        "setLineDash",
      ].includes(call.operation)).length,
      blends: calls.filter((call) => ["fill", "drawImage"].includes(
        call.operation,
      )).map((call) => call.blend),
    };
  };

  const firstStage = draw(1, 1);
  const secondStage = draw(2, 2);
  const thirdStage = draw(3, 3);
  assert.equal(firstStage.dots, 3);
  assert.equal(secondStage.dots, 6);
  assert.equal(thirdStage.dots, 9);
  assert.equal(firstStage.expensiveEffects, 0);
  assert.equal(secondStage.expensiveEffects, 0);
  assert.equal(thirdStage.expensiveEffects, 0);
  assert.ok(thirdStage.blends.every((blend) => blend === "lighter"));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});

test("a blocked hit briefly ripples through the inside of the shield", () => {
  const { scope, calls, ctx } = createGame();
  read(scope, `
    player.accelerationShieldVisual=2;
    player.accelerationShieldCharges=1;
    player.accelerationShieldHitTimer=PLAYER_ACCELERATION_SHIELD_HIT_DURATION;
    player.accelerationShieldHitDirection=1;
  `);

  calls.length = 0;
  scope.drawPlayerAccelerationShield(false);
  assert.ok(calls.some((call) => call.operation === "createRadialGradient"));
  assert.ok(calls.some((call) => call.operation === "clip"));
  assert.ok(calls.some((call) => call.operation === "fillRect"));

  calls.length = 0;
  scope.drawPlayerAccelerationShield(true);
  assert.ok(calls.filter((call) => call.operation === "ellipse").length >= 4);
  const impactWaves = calls.filter((call) => call.operation === "stroke");
  assert.equal(impactWaves.length, 3);
  assert.ok(impactWaves.every((wave) => wave.lineWidth <= 1.2));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, "source-over");
});
