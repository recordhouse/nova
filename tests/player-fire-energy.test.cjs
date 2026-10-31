"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame() {
  const calls = [];
  const soundCalls = [];
  const videoCalls = [];
  const runVideoCalls = [];
  const standVideoCalls = [];
  const startVideoCalls = [];
  const stack = [];
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        for (const name of Object.keys(target)) delete target[name];
        Object.assign(target, stack.pop());
      };
      return (...args) => {
        if (key === "fillRect") assert.ok(args[2] >= 0 && args[3] >= 0);
        calls.push({ operation: key, args, color: target.fillStyle, alpha: target.globalAlpha });
      };
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: { querySelector: (selector) => selector === "#game" ? { getContext: () => ctx } : null },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }) },
    playPlayerGunSound: () => soundCalls.push("gun"),
    playPlayerGunVideo: () => videoCalls.push("play"),
    stopPlayerGunVideo: () => videoCalls.push("stop"),
    playPlayerRunVideo: () => runVideoCalls.push("play"),
    stopPlayerRunVideo: () => runVideoCalls.push("stop"),
    playPlayerStandVideo: () => standVideoCalls.push("play"),
    stopPlayerStandVideo: () => standVideoCalls.push("stop"),
    playPlayerStartVideo: () => startVideoCalls.push("play"),
    stopPlayerStartVideo: () => startVideoCalls.push("stop"),
    playerSprites: {
      stand: { loaded: true, image: { naturalWidth: 400, naturalHeight: 500 }, fps: 1,
        frames: [{ x: 0, y: 0, width: 400, height: 500 }] },
      finishing: { loaded: true, image: { naturalWidth: 2008, naturalHeight: 500 }, fps: 8,
        frames: Array.from({ length: 5 }, (_, frame) => (
          { x: frame * 402, y: 0, width: 400, height: 500 }
        )) },
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "renderer"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    const fixtureRoad={kind:'flat',id:1,start:0,end:2000,y:500};
    platforms.push(fixtureRoad);
    player.x=1000; player.y=500-player.height;
    player.grounded=true; player.platform=fixtureRoad;
    minWorldX=0; maxWorldX=2000;
  `, scope);
  return {
    scope,
    calls,
    soundCalls,
    videoCalls,
    runVideoCalls,
    standVideoCalls,
    startVideoCalls,
  };
}

function read(scope, source) { return vm.runInContext(source, scope); }

test("continuous fire drains about three times slower and still stops when empty", () => {
  const { scope } = createGame();
  assert.equal(read(scope, "player.fireEnergy"), 100);
  assert.equal(read(scope, "PLAYER_FIRE_ENERGY_PER_SHOT"), 3);
  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 1);
  assert.equal(read(scope, "player.fireEnergy"), 97);
  let exhaustedAt = null;
  for (let frame = 1; frame < 8 * 60; frame += 1) {
    scope.updatePlayer(1 / 60);
    if (read(scope, "player.fireEnergy") < read(scope, "PLAYER_FIRE_ENERGY_PER_SHOT")) {
      exhaustedAt = (frame + 1) / 60;
      break;
    }
  }
  assert.ok(exhaustedAt >= 5.5 && exhaustedAt <= 6.8,
    `continuous firing should last about three times longer, got ${exhaustedAt}s`);
  assert.ok(read(scope, "bullets.length") > 45);

  read(scope, "player.fireEnergy=0; player.fireTimer=0; bullets.length=0");
  for (let frame = 0; frame < 14; frame += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 0);
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "bullets.length"), 1, "holding fire resumes only after enough energy regenerates");
  assert.ok(read(scope, "player.fireEnergy") < 1);
});

test("energy recharges while idle and resets full without affecting down protection", () => {
  const { scope } = createGame();
  read(scope, "player.fireEnergy=10");
  scope.updatePlayer(2);
  assert.equal(read(scope, "player.fireEnergy"), 34);
  scope.updatePlayer(10);
  assert.equal(read(scope, "player.fireEnergy"), 100);
  read(scope, "player.fireEnergy=0; controls.fire=true");
  assert.equal(scope.takePlayerDamage(1), true);
  scope.updatePlayer(0.25);
  assert.equal(read(scope, "bullets.length"), 0);
  assert.equal(read(scope, "player.fireEnergy"), 3);
  read(scope, "controls.fire=false");
  scope.resetPlayerPosition();
  assert.equal(read(scope, "player.fireEnergy"), 100);
});

test("the gun video follows held firing instead of individual bullets", () => {
  const { scope, soundCalls, videoCalls } = createGame();
  assert.equal(scope.shootPlayer(), true);
  assert.equal(soundCalls.length, 1);
  assert.deepEqual(videoCalls, [], "an isolated bullet does not leave the cut-in running");

  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, ["play"]);
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, ["play"], "holding fire does not restart the video");

  read(scope, "controls.fire=false");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, ["play", "stop"]);

  read(scope, "player.fireEnergy=0; player.fireTimer=0; controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, ["play", "stop"],
    "an empty weapon does not show the firing video");
});

test("the run video continues through jumps and also starts on a standing jump", () => {
  const { scope, runVideoCalls } = createGame();
  read(scope, "controls.right=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(runVideoCalls, ["play"]);
  scope.updatePlayer(1 / 60);
  assert.deepEqual(runVideoCalls, ["play"], "continuous running does not restart it");

  read(scope, "controls.jump=true; jumpQueued=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.grounded"), false);
  assert.deepEqual(runVideoCalls, ["play"], "jumping does not stop the run video");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(runVideoCalls, ["play"], "air time does not restart the video");

  read(scope, `
    controls.right=false; controls.jump=false; jumpQueued=false;
    player.grounded=true; player.platform=platforms[0]; player.vx=0; player.vy=0;
    player.y=platforms[0].y-player.height;
  `);
  scope.updatePlayer(1 / 60);
  assert.deepEqual(runVideoCalls, ["play", "stop"]);

  read(scope, "controls.jump=true; jumpQueued=true");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.grounded"), false);
  assert.deepEqual(runVideoCalls, ["play", "stop", "play"],
    "a jump from standing also starts the run video");
});

test("crouching starts after a 0.2 second hold and cancels immediately on release", () => {
  const { scope } = createGame();
  const delay = read(scope, "PLAYER_CROUCH_INPUT_DELAY");
  assert.equal(delay, 0.2);
  read(scope, "controls.down=true");

  scope.updatePlayer(delay - 0.01);
  assert.equal(read(scope, "player.crouching"), false,
    "a short down input keeps the standing pose");
  assert.ok(read(scope, "player.crouchInputTime") < delay);

  scope.updatePlayer(0.01);
  assert.equal(read(scope, "player.crouching"), true,
    "holding down for 0.2 seconds starts crouching");

  read(scope, "controls.down=false");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.crouching"), false);
  assert.equal(read(scope, "player.crouchInputTime"), 0,
    "releasing down cancels the crouch timer");
});

test("the stand video plays while the grounded player is idle or crouching", () => {
  const { scope, videoCalls, runVideoCalls, standVideoCalls } = createGame();
  scope.updatePlayer(1 / 60);
  assert.deepEqual(standVideoCalls, ["play"]);
  scope.updatePlayer(1 / 60);
  assert.deepEqual(standVideoCalls, ["play"], "remaining idle does not restart it");

  read(scope, "controls.down=true");
  scope.updatePlayer(0.2);
  assert.equal(read(scope, "player.crouching"), true);
  assert.deepEqual(standVideoCalls, ["play"], "crouching keeps the stand video active");
  read(scope, "controls.down=false");

  read(scope, "controls.right=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(standVideoCalls, ["play", "stop"]);
  assert.deepEqual(runVideoCalls, ["play"]);

  read(scope, `
    controls.right=false; player.vx=0; player.runSpeed=player.speed;
    player.reversalDirection=0; player.reversalGraceTimer=0;
  `);
  scope.updatePlayer(1 / 60);
  assert.deepEqual(runVideoCalls, ["play", "stop"]);
  assert.deepEqual(standVideoCalls, ["play", "stop", "play"]);

  read(scope, "controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(standVideoCalls, ["play", "stop", "play", "stop"]);
  assert.deepEqual(videoCalls, ["play"], "the firing video takes priority over stand");
});

test("holding crouch looks farther down after a short delay and releasing restores the view", () => {
  const { scope } = createGame();
  const baseCameraY = read(scope, "player.y + player.height - BASE_GROUND_Y");
  read(scope, `
    cameraY=${baseCameraY};
    controls.down=true;
  `);

  const delay = read(scope, "PLAYER_CROUCH_CAMERA_LOOK_DELAY");
  for (let elapsed = 0; elapsed + 1 / 60 < delay; elapsed += 1 / 60) {
    scope.updatePlayer(1 / 60);
  }
  assert.ok(Math.abs(read(scope, "cameraY") - baseCameraY) < 1e-6,
    "a quick crouch does not move the camera");

  for (let frame = 0; frame < 90; frame += 1) scope.updatePlayer(1 / 60);
  const lookedDownCameraY = read(scope, "cameraY");
  const expectedDistance = read(scope,
    "Math.min(PLAYER_CROUCH_CAMERA_LOOK_MAX_DISTANCE, HEIGHT * PLAYER_CROUCH_CAMERA_LOOK_DISTANCE_RATIO)");
  assert.ok(lookedDownCameraY > baseCameraY + expectedDistance * 0.9,
    "a held crouch reveals the lower area");

  read(scope, "controls.down=false");
  for (let frame = 0; frame < 90; frame += 1) scope.updatePlayer(1 / 60);
  assert.ok(Math.abs(read(scope, "cameraY") - baseCameraY) < 0.5,
    "releasing crouch smoothly restores the normal view");
  assert.equal(read(scope, "player.crouchCameraLookTime"), 0);
});

test("holding down in the air does not start the crouch camera look", () => {
  const { scope } = createGame();
  read(scope, `
    player.y=100;
    player.grounded=false;
    player.platform=null;
    controls.down=true;
  `);
  for (let frame = 0; frame < 8; frame += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "player.grounded"), false);
  assert.equal(read(scope, "player.crouchCameraLookTime"), 0);
});

test("the first start voice holds its dedicated video over movement and firing footage", () => {
  const { scope, videoCalls, runVideoCalls, standVideoCalls, startVideoCalls } = createGame();
  read(scope, `
    globalThis.startVoiceVideoActive=true;
    globalThis.isFemaleStartVoiceVideoActive=()=>startVoiceVideoActive;
    player.voiceControlStarted=true;
    controls.right=true;
  `);
  scope.playPlayerStartVideo();
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, []);
  assert.deepEqual(runVideoCalls, []);
  assert.deepEqual(standVideoCalls, []);
  assert.deepEqual(startVideoCalls, ["play"]);

  read(scope, "controls.right=false; controls.fire=true");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(videoCalls, [],
    "changing from running to firing cannot replace the held start footage");
  assert.deepEqual(runVideoCalls, []);
  assert.deepEqual(standVideoCalls, []);
  assert.deepEqual(startVideoCalls, ["play"]);

  read(scope, "startVoiceVideoActive=false");
  scope.updatePlayer(1 / 60);
  assert.deepEqual(standVideoCalls, []);
  assert.deepEqual(startVideoCalls, ["play", "stop"]);
  assert.deepEqual(videoCalls, ["play"],
    "the current action footage resumes as soon as the start voice ends");
});

test("purple gauge tracks the drawn sprite and never blinks with temporary immunity", () => {
  const { scope, calls } = createGame();
  scope.drawPlayer();
  const full = calls.find((call) => call.color === "#a653f5");
  const frame = calls.find((call) => call.color === "#7145a2");
  assert.equal(full.args[2], 52);
  assert.ok(frame.args[1] < read(scope, "player.y"));
  calls.length = 0;
  read(scope, "player.fireEnergy=50; player.invincible=1; gameTime=0.15");
  scope.drawPlayer();
  const half = calls.find((call) => call.color === "#a653f5");
  const sprite = calls.find((call) => call.operation === "drawImage");
  assert.equal(half.args[2], 26);
  assert.equal(half.alpha, 1);
  assert.ok(sprite.alpha < 1);
  calls.length = 0;
  read(scope, "player.fireEnergy=0");
  scope.drawPlayer();
  assert.equal(calls.some((call) => call.color === "#a653f5"), false);
  assert.ok(calls.some((call) => call.color === "#7145a2"));
});

test("ultimate floating uses the finishing animation from its first frame", () => {
  const { scope, calls } = createGame();
  const finishingImage = read(scope, "playerSprites.finishing.image");
  read(scope, `
    gameTime=99;
    player.ultimateActive=true;
    player.ultimateTime=0;
    player.grounded=false;
    player.jumpAnimationTime=0.5;
  `);
  scope.drawPlayerSprite(read(scope, "player.x+player.width/2"));
  const spriteDraw = calls.find((call) => call.operation === "drawImage");
  assert.ok(spriteDraw, "the floating character still draws a sprite");
  assert.equal(spriteDraw.args[0], finishingImage);
  assert.equal(spriteDraw.args[1], 0, "the animation starts at the first finishing frame");
  const expectedHeight = read(
    scope,
    "PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_STAND_SPRITE_SCALE * 1.1",
  );
  assert.ok(
    Math.abs(spriteDraw.args[8] - expectedHeight) < 1e-9,
    "the finishing pose is ten percent larger than the standing pose",
  );
});
