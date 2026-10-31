"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("combat sounds preload and use their intended audio segments", async () => {
  const starts = [];
  const startedSources = [];
  const gainEvents = [];
  const outputGains = [];
  const contexts = [];
  const fetchedSources = [];
  const musicInstances = [];
  class FakeAudioContext {
    constructor(options) {
      contexts.push(options);
      this.currentTime = 10;
      this.destination = {};
      this.state = "running";
    }
    decodeAudioData(data) {
      return Promise.resolve({ duration: 0.339592, source: data.source });
    }
    resume() { return Promise.resolve(); }
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        start(...args) {
          starts.push(args);
          startedSources.push(this.buffer?.source);
        },
      };
    }
    createGain() {
      const node = {
        gain: {
          setValueAtTime: (...args) => gainEvents.push(["set", ...args]),
          linearRampToValueAtTime: (...args) => gainEvents.push(["ramp", ...args]),
        },
        connect() {},
        disconnect() {},
      };
      outputGains.push(node.gain);
      return node;
    }
  }
  class FakeImage {
    set src(value) { this.currentSrc = value; }
  }
  class FakeAudio {
    constructor(source) {
      this.source = source;
      this.paused = true;
      this.playCalls = 0;
      this.pauseCalls = 0;
      musicInstances.push(this);
    }
    play() {
      this.paused = false;
      this.playCalls += 1;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.pauseCalls += 1;
    }
  }
  const canvas = { getContext: () => ({ setTransform() {} }) };
  const scope = {
    document: { querySelector: (selector) => selector === "#game" ? canvas : null },
    window: {
      AudioContext: FakeAudioContext,
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
    Image: FakeImage,
    Audio: FakeAudio,
    fetch: async (source) => {
      fetchedSources.push(source);
      return {
        ok: true,
        arrayBuffer: async () => ({ source }),
      };
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  await vm.runInContext("playerGunSoundDecode", scope);
  await vm.runInContext("playerGunImpactSoundDecode", scope);
  await vm.runInContext(`Promise.all([
    gunHitSound.decode,
    ...metalHitSounds.map((sound)=>sound.decode),
    turretLaserSound.decode,
    monsterDie01Sound.decode,
    monsterDie03Sound.decode,
    monsterDie0101Sound.decode,
    turretDie01Sound.decode,
    monsterFire02Sound.decode,
    resurrectionSound.decode,
    heartPickupSound.decode,
    shieldSound.decode,
    ...Object.values(enemyVideoVoiceSounds).map((sound)=>sound.decode),
  ])`, scope);
  vm.runInContext(`
    const randomValues=[0,0.99,0.99];
    Math.random=()=>randomValues.shift()??0;
  `, scope);
  scope.playPlayerGunSound();
  scope.playPlayerGunImpactSound();
  scope.playGunHitSound();
  scope.playMetalHitSound();
  scope.playTurretLaserSound();
  scope.playMonsterDie01Sound();
  scope.playMonsterDie03Sound();
  scope.playMonsterDie0101Sound();
  scope.playTurretDie01Sound();
  scope.playMonsterFire02Sound();
  scope.playResurrectionSound();
  scope.playHeartPickupSound();
  scope.playShieldSound();
  scope.playPlayerUltimateRicochetSound();
  scope.playPlayerUltimateHitSound("monster2");
  scope.playPlayerUltimateHitSound("turret");
  scope.playTurretMetalHitSound();
  scope.playEnemyVideoVoice("monster2");
  scope.playEnemyVideoVoice("monster3");
  scope.playEnemyVideoVoice("turret");
  const impactOffset = vm.runInContext("PLAYER_GUN_IMPACT_SOUND_OFFSET", scope);

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].latencyHint, 0.01);
  assert.equal(musicInstances.length, 1);
  assert.equal(musicInstances[0].source, "./assets/music/stage_01.mp3?v=20260924-1");
  assert.equal(musicInstances[0].loop, true);
  assert.equal(musicInstances[0].volume, 0.03);
  assert.equal(vm.runInContext("gameSfxOutput.gain.value", scope), 2);
  assert.equal(vm.runInContext("femaleVoiceOutput.gain.value", scope), 2);
  assert.equal(musicInstances[0].preload, "auto");
  assert.equal(musicInstances[0].playsInline, true);
  assert.equal(vm.runInContext("stageMusicPaused", scope), false);
  assert.equal(musicInstances[0].playCalls, 1,
    "normal mode starts background music without the test-mode pause");
  scope.playCurrentStageMusic();
  assert.equal(musicInstances[0].playCalls, 1);
  scope.setCurrentStageMusicPaused(false);
  assert.equal(musicInstances[0].paused, false);
  assert.equal(musicInstances[0].playCalls, 1);
  scope.setCurrentStageMusicPaused(true);
  assert.equal(musicInstances[0].paused, true);
  assert.equal(musicInstances[0].pauseCalls, 1);
  scope.playCurrentStageMusic();
  assert.equal(musicInstances[0].playCalls, 1, "manual pause blocks automatic restarts");
  scope.setCurrentStageMusicPaused(false);
  assert.equal(musicInstances[0].paused, false);
  assert.equal(musicInstances[0].playCalls, 2);
  assert.ok(fetchedSources.includes("./assets/sound/gun_impact.mp3?v=20261019-1"));
  assert.ok(fetchedSources.includes("./assets/sound/gun_hit.mp3?v=20261019-1"));
  assert.ok(fetchedSources.includes("./assets/sound/heart.mp3"));
  for (const index of [1, 2, 3]) {
    assert.ok(fetchedSources.includes(
      `./assets/sound/metal_0${index}.mp3?v=20261021-1`,
    ));
  }
  assert.ok(fetchedSources.includes(
    "./assets/sound/voice_monster_02.mp3?v=20261021-1",
  ));
  assert.ok(fetchedSources.includes(
    "./assets/sound/voice_monster_03.mp3?v=20261021-1",
  ));
  assert.ok(fetchedSources.includes(
    "./assets/sound/voice_turret_01.mp3?v=20261021-1",
  ));
  assert.ok(fetchedSources.includes("./assets/sound/monster_die_03.mp3"));
  assert.ok(fetchedSources.includes("./assets/sound/monster_die_01_01.mp3"));
  assert.ok(fetchedSources.includes("./assets/sound/turret_die_01.mp3"));
  assert.ok(fetchedSources.includes("./assets/sound/resurrection.mp3"));
  assert.ok(fetchedSources.includes("./assets/sound/shield.mp3"));
  assert.ok(impactOffset >= 0 && impactOffset < 0.339592);
  assert.deepEqual(starts[0], [10, 0, 0.115]);
  assert.deepEqual(starts[1], [10, impactOffset]);
  assert.deepEqual(starts[13], [10, impactOffset]);
  assert.ok(starts.slice(2).every((args, index) => (
    index === 11 || args.length === 2 && args[0] === 10 && args[1] === 0
  )));
  assert.deepEqual(
    startedSources.filter((source) => source?.includes("/metal_")),
    [
      "./assets/sound/metal_01.mp3?v=20261021-1",
      "./assets/sound/metal_03.mp3?v=20261021-1",
      "./assets/sound/metal_02.mp3?v=20261021-1",
    ],
    "metal hits rotate randomly without immediately repeating a variant",
  );
  assert.deepEqual(
    startedSources.filter((source) => source?.includes("/voice_")),
    [
      "./assets/sound/voice_monster_02.mp3?v=20261021-1",
      "./assets/sound/voice_monster_03.mp3?v=20261021-1",
      "./assets/sound/voice_turret_01.mp3?v=20261021-1",
    ],
  );
  assert.deepEqual(
    Array.from(vm.runInContext(
      "metalHitSounds.map((sound)=>sound.output.gain.value)",
      scope,
    )),
    [0.4, 0.4, 0.4],
  );
  assert.deepEqual(
    Array.from(vm.runInContext(
      "Object.values(enemyVideoVoiceSounds).map((sound)=>sound.output.gain.value)", scope,
    )),
    [0.68, 0.68, 0.68],
  );
  assert.equal(vm.runInContext("playerUltimateRicochetChannel.output.gain.value", scope), 0.52);
  assert.equal(vm.runInContext("playerUltimateOrganicHitChannel.output.gain.value", scope), 0.5);
  assert.equal(vm.runInContext("playerUltimateMetalHitChannel.output.gain.value", scope), 0.56);
  assert.equal(vm.runInContext("turretMetalHitChannel.output.gain.value", scope), 0.68);
  assert.deepEqual(gainEvents, [
    ["set", 0.42, 10],
    ["set", 0.42, 10.09],
    ["ramp", 0, 10.115],
  ]);
});

test("only test mode starts with stage music paused", () => {
  for (const [search, expectedPaused, expectedPlayCalls] of [
    ["", false, 1],
    ["?test=1", true, 0],
  ]) {
    const musicInstances = [];
    class FakeAudio {
      constructor(source) {
        this.source = source;
        this.paused = true;
        this.playCalls = 0;
        musicInstances.push(this);
      }
      play() {
        this.paused = false;
        this.playCalls += 1;
        return Promise.resolve();
      }
      pause() { this.paused = true; }
    }
    class FakeImage { set src(value) { this.currentSrc = value; } }
    const canvas = { getContext: () => ({ setTransform() {} }) };
    const scope = {
      document: {
        querySelector: (selector) => selector === "#game" ? canvas : null,
      },
      window: {
        location: { search },
        innerWidth: 720,
        innerHeight: 1280,
        matchMedia: () => ({ matches: false }),
        addEventListener() {},
      },
      Image: FakeImage,
      Audio: FakeAudio,
      fetch: async () => ({ ok: false }),
    };
    vm.createContext(scope);
    for (const name of ["config", "assets"]) {
      vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
        scope,
        { filename: `${name}.js` },
      );
    }
    assert.equal(vm.runInContext("stageMusicPaused", scope), expectedPaused);
    assert.equal(musicInstances[0].playCalls, expectedPlayCalls);
  }
});
