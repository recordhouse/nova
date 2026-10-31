"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function source(name) {
  return fs.readFileSync(path.join(root, "js", `${name}.js`), "utf8");
}

async function createAudioGame() {
  const fetched = [];
  const started = [];
  const stopped = [];
  class FakeAudioContext {
    constructor() {
      this.currentTime = 10;
      this.destination = {};
      this.state = "running";
    }
    resume() { return Promise.resolve(); }
    decodeAudioData(data) {
      return Promise.resolve({ duration: 2, source: data.source });
    }
    createGain() {
      return { gain: { value: 0 }, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const node = {
        buffer: null,
        connect() {},
        disconnect() {},
        start() { started.push({ source: this.buffer.source, node: this }); },
        stop() { stopped.push(this.buffer.source); },
      };
      return node;
    }
  }
  class FakeImage { set src(value) { this.source = value; } }
  class FakeAudio {
    constructor() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const canvas = { getContext: () => ({ setTransform() {} }) };
  const scope = {
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: {
      AudioContext: FakeAudioContext,
      location: { search: "?test=1" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
    Image: FakeImage,
    Audio: FakeAudio,
    fetch: async (file) => {
      fetched.push(file);
      return {
        ok: true,
        arrayBuffer: async () => ({ source: file }),
      };
    },
  };
  vm.createContext(scope);
  vm.runInContext(source("config"), scope, { filename: "config.js" });
  vm.runInContext(source("assets"), scope, { filename: "assets.js" });
  await vm.runInContext(`Promise.all([
    femaleStartVoice.decode,
    femaleRunVoice.decode,
    ...femaleAttackVoices.map((voice) => voice.decode),
    ...femaleDeathVoices.map((voice) => voice.decode),
    femaleEndVoice.decode,
    ...femaleFinishingVoices.map((voice) => voice.decode),
    femaleResurrectionVoice.decode,
  ])`, scope);
  vm.runInContext("Math.random=()=>0", scope);
  return { scope, fetched, started, stopped };
}

function createGame() {
  const canvas = {
    getContext: () => ({ setTransform() {} }),
    addEventListener() {},
  };
  const scope = {
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    Image: class {
      naturalWidth = 2008;
      naturalHeight = 500;
      set src(value) { this.source = value; this.onload?.(); }
    },
    document: {
      querySelector: (selector) => selector === "#game" ? canvas : null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      location: { search: "?test=1" },
      addEventListener() {},
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
    },
  };
  vm.createContext(scope);
  for (const name of [
    "config", "assets", "state", "world", "combat", "player", "enemies", "main",
  ]) {
    vm.runInContext(source(name), scope, { filename: `${name}.js` });
  }
  vm.runInContext(`
    enemies.length=0; turrets.length=0; midBosses.length=0;
    bullets.length=0; enemyBullets.length=0; particles.length=0;
    heartItems.length=0; platforms.length=0;
    globalThis.fixtureRoad={kind:'flat',id:999,start:-2000,end:20000,y:500,features:[]};
    platforms.push(fixtureRoad);
    minWorldX=-2000; maxWorldX=20000; lowestPlatformY=500;
    resetPlayerPosition(); player.x=1000-player.width/2;
    player.hp=3; player.maxHp=3; player.invincible=0; gameOver=false; gameTime=0;
    cameraX=700; cameraY=0;
  `, scope);
  return scope;
}

function read(scope, code) {
  return vm.runInContext(code, scope);
}

test("female voice files preload and share one non-overlapping priority channel", async () => {
  const { scope, fetched, started, stopped } = await createAudioGame();
  const expectedFiles = [
    "voice_female_start.mp3",
    "voice_female_run.mp3",
    ...[1, 2, 3, 4, 5].map((index) => `voice_female_attack_0${index}.mp3`),
    "voice_female_die_01.mp3",
    "voice_female_die_02.mp3",
    "voice_female_end.mp3",
    "voice_female_finishing_01.mp3",
    "voice_female_finishing_02.mp3",
    "voice_female_resurrection.mp3",
  ].map((file) => `./assets/sound/${file}`);
  for (const file of expectedFiles) assert.ok(fetched.includes(file), `${file} was not fetched`);
  assert.equal(read(scope, "femaleDeathVoices[0].output.gain.value"), 0.72,
    "the damage voice uses the same volume as the regular character voices");

  read(scope, `
    globalThis.startVideoCalls=0;
    playPlayerStartVideo=()=>{startVideoCalls+=1;return true};
  `);
  const finishLatest = () => started.at(-1).node.onended();
  assert.equal(scope.playFemaleStartVoice(), true);
  assert.equal(read(scope, "startVideoCalls"), 1,
    "the dedicated start footage begins with the start voice");
  assert.equal(scope.isFemaleStartVoiceVideoActive(), true,
    "the stand cut-in overrides action footage while the start line plays");
  assert.equal(scope.playFemaleAttackVoice(), false,
    "rapid fire must not layer speech over the start line");
  finishLatest();
  assert.equal(scope.isFemaleStartVoiceVideoActive(), true,
    "the stand cut-in remains held for one second after the start line");
  read(scope, "gameAudioContext.currentTime += 0.99");
  assert.equal(scope.isFemaleStartVoiceVideoActive(), true);
  read(scope, "gameAudioContext.currentTime += 0.02");
  assert.equal(scope.isFemaleStartVoiceVideoActive(), false,
    "the stand cut-in override ends after its one-second tail");
  assert.equal(scope.playFemaleRunVoice(), true);
  finishLatest();
  assert.equal(scope.playFemaleAttackVoice(), true);
  finishLatest();
  assert.equal(scope.playFemaleAttackVoice(), true);
  assert.equal(scope.playFemaleDeathVoice(), true,
    "death speech interrupts a lower-priority attack line");
  assert.equal(scope.playFemaleDeathVoice(), true);
  assert.equal(scope.playFemaleEndVoice(), true);
  assert.equal(started.at(-1).source, "./assets/sound/voice_female_end.mp3",
    "the higher regular cue replaces the damage voice without a special wait");
  finishLatest();
  assert.equal(scope.playFemaleResurrectionVoice(), true);
  finishLatest();
  assert.equal(scope.playFemaleFinishingVoice(), true);
  assert.equal(scope.playFemaleFinishingVoice(), true);
  assert.equal(scope.playFemaleDeathVoice(), false,
    "the damage voice does not override a higher-priority finishing voice");
  finishLatest();
  assert.equal(scope.playFemaleDeathVoice(), true);
  assert.equal(started.at(-1).source, "./assets/sound/voice_female_die_01.mp3");
  assert.equal(read(scope, "gameSfxOutput.gain.value"), 2,
    "the damage voice does not lower boosted gameplay effects");
  assert.equal(read(scope, "femaleVoiceOutput.gain.value"), 2,
    "character speech keeps its boosted master level");
  assert.equal(read(scope, "stage01Music.volume"), 0.03,
    "the damage voice does not lower background music");
  assert.equal(scope.playFemaleEndVoice(), true);
  assert.equal(started.at(-1).source, "./assets/sound/voice_female_end.mp3");
  assert.equal(read(scope, "gameSfxOutput.gain.value"), 2,
    "effects remain at their boosted volume when the damage voice ends");
  assert.equal(read(scope, "femaleVoiceOutput.gain.value"), 2,
    "character speech master remains boosted when the damage voice ends");
  assert.equal(read(scope, "stage01Music.volume"), 0.03,
    "background music remains unchanged when the damage voice ends");
  finishLatest();

  assert.deepEqual(started.map(({ source: file }) => file), [
    "./assets/sound/voice_female_start.mp3",
    "./assets/sound/voice_female_run.mp3",
    "./assets/sound/voice_female_attack_01.mp3",
    "./assets/sound/voice_female_attack_02.mp3",
    "./assets/sound/voice_female_die_01.mp3",
    "./assets/sound/voice_female_die_02.mp3",
    "./assets/sound/voice_female_end.mp3",
    "./assets/sound/voice_female_resurrection.mp3",
    "./assets/sound/voice_female_finishing_01.mp3",
    "./assets/sound/voice_female_finishing_02.mp3",
    "./assets/sound/voice_female_die_01.mp3",
    "./assets/sound/voice_female_end.mp3",
  ]);
  assert.equal(stopped.length, 5);
});

test("control start, maximum-speed collision and new firing holds emit their voice cues", () => {
  const scope = createGame();
  read(scope, `
    globalThis.startVoiceCalls=0;
    globalThis.runVoiceCalls=0;
    globalThis.attackVoiceCalls=0;
    playFemaleStartVoice=()=>{startVoiceCalls+=1};
    playFemaleRunVoice=()=>{runVoiceCalls+=1};
    playFemaleAttackVoice=()=>{attackVoiceCalls+=1};
    controls.right=true;
  `);
  scope.updatePlayer(1 / 60);
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "startVoiceCalls"), 1);

  for (let index = 0; index < 220; index += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "runVoiceCalls"), 0,
    "maximum speed alone must not play the run voice");
  for (let index = 0; index < 60; index += 1) scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "runVoiceCalls"), 0);

  read(scope, `
    player.vx=PLAYER_RUN_MAX_SPEED;
    player.runSpeed=PLAYER_RUN_MAX_SPEED;
    player.accelerationShieldStage=3;
    player.accelerationShieldCharges=3;
    player.accelerationShieldVisual=3;
    globalThis.rammedEnemy=addEnemy(
      fixtureRoad,
      player.x+player.width-12,
      'monster2'
    );
    rammedEnemy.x=player.x+player.width-12;
    rammedEnemy.y=player.y;
  `);
  scope.updateEnemies(0);
  assert.equal(read(scope, "runVoiceCalls"), 1,
    "the run voice plays when a maximum-speed ram actually hits a monster");
  scope.updateEnemies(0.01);
  assert.equal(read(scope, "runVoiceCalls"), 1,
    "contact cooldown prevents duplicate run voices for one collision");

  read(scope, `
    controls.right=false; player.vx=0; player.runSpeed=player.speed;
    player.reversalDirection=0; player.reversalGraceTimer=0;
    player.recentRunDirection=0; player.recentRunSpeed=0;
    player.fireEnergy=PLAYER_FIRE_ENERGY_MAX; player.fireBarrel=0; player.fireTimer=0;
    player.fireWasActive=false; player.fireVoicePlayedForHold=false;
    controls.fire=true;
  `);
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "attackVoiceCalls"), 1);
  for (let index = 0; index < 60; index += 1) scope.updatePlayer(1 / 60);
  assert.ok(read(scope, "bullets.length") > 2, "holding fire still launches repeated bullets");
  assert.equal(read(scope, "attackVoiceCalls"), 1,
    "continuous fire must keep the first attack voice only");

  read(scope, "controls.fire=false");
  scope.updatePlayer(1 / 60);
  read(scope, `
    controls.fire=true;
    player.fireTimer=0;
    player.fireEnergy=PLAYER_FIRE_ENERGY_MAX;
  `);
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "attackVoiceCalls"), 2,
    "releasing and starting a new firing hold may choose a new attack voice");

  read(scope, "controls.fire=false");
  scope.updatePlayer(1 / 60);
  read(scope, "controls.fire=true; player.fireTimer=0; player.fireEnergy=0");
  scope.updatePlayer(1 / 60);
  assert.equal(read(scope, "attackVoiceCalls"), 2,
    "pressing fire with no shot available must not request an attack line");
});

test("damage, game over and resurrection cues fire once at their exact state changes", () => {
  const scope = createGame();
  read(scope, `
    globalThis.deathVoiceCalls=0;
    globalThis.endVoiceCalls=0;
    globalThis.revivalVoiceCalls=0;
    playFemaleDeathVoice=()=>{deathVoiceCalls+=1};
    playFemaleEndVoice=()=>{endVoiceCalls+=1};
    playFemaleResurrectionVoice=()=>{revivalVoiceCalls+=1};
  `);

  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "deathVoiceCalls"), 1,
    "losing a heart immediately plays the damage voice");
  assert.equal(scope.takePlayerDamage(1), false,
    "the protected down state rejects repeated damage");
  assert.equal(read(scope, "deathVoiceCalls"), 1,
    "rejected damage cannot replay the voice");
  scope.updatePlayer(read(scope,
    "PLAYER_DOWN_ANIMATION_DURATION + PLAYER_DOWN_HOLD_DURATION + 0.01"));
  assert.equal(read(scope, "revivalVoiceCalls"), 1);

  read(scope, "player.invincible=0; player.hp=1; gameOver=false");
  assert.equal(scope.takePlayerDamage(1), true);
  assert.equal(read(scope, "deathVoiceCalls"), 2);
  assert.equal(read(scope, "endVoiceCalls"), 0,
    "game-over speech waits for the down animation to finish");

  scope.update(read(scope,
    "PLAYER_DOWN_ANIMATION_DURATION + PLAYER_DOWN_HOLD_DURATION + 0.01"));
  assert.equal(read(scope, "endVoiceCalls"), 1);
  scope.update(1 / 60);
  assert.equal(read(scope, "endVoiceCalls"), 1);
  assert.equal(read(scope, "revivalVoiceCalls"), 1,
    "lethal damage must not invoke the resurrection line");
});

test("falling out of the map emits death before the game-over cue", () => {
  const scope = createGame();
  read(scope, `
    globalThis.fallVoiceCalls=[];
    playFemaleDeathVoice=()=>{fallVoiceCalls.push('death')};
    playFemaleEndVoice=()=>{fallVoiceCalls.push('end')};
    player.grounded=false;
    player.platform=null;
    player.y=lowestPlatformY+431;
    player.vy=0;
  `);

  scope.update(1 / 60);
  assert.deepEqual(Array.from(read(scope, "fallVoiceCalls")), ["death", "end"]);
  assert.equal(read(scope, "gameOver"), true);
  scope.update(1 / 60);
  assert.deepEqual(Array.from(read(scope, "fallVoiceCalls")), ["death", "end"]);
});
