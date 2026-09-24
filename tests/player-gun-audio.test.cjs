"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("combat sounds preload and use their intended audio segments", async () => {
  const starts = [];
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
    decodeAudioData() { return Promise.resolve({ duration: 0.339592 }); }
    resume() { return Promise.resolve(); }
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        start(...args) { starts.push(args); },
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
        arrayBuffer: async () => new ArrayBuffer(8),
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
    metalHitSound.decode,
    turretLaserSound.decode,
    monsterDie01Sound.decode,
    monsterFire02Sound.decode,
  ])`, scope);
  scope.playPlayerGunSound();
  scope.playPlayerGunImpactSound();
  scope.playGunHitSound();
  scope.playMetalHitSound();
  scope.playTurretLaserSound();
  scope.playMonsterDie01Sound();
  scope.playMonsterFire02Sound();
  const impactOffset = vm.runInContext("PLAYER_GUN_IMPACT_SOUND_OFFSET", scope);

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].latencyHint, 0.01);
  assert.equal(musicInstances.length, 1);
  assert.equal(musicInstances[0].source, "./assets/music/stage_01.mp3?v=20260924-1");
  assert.equal(musicInstances[0].loop, true);
  assert.equal(musicInstances[0].volume, 0.18);
  assert.equal(musicInstances[0].preload, "auto");
  assert.equal(musicInstances[0].playsInline, true);
  assert.equal(musicInstances[0].playCalls, 1);
  scope.setCurrentStageMusicPaused(true);
  assert.equal(musicInstances[0].paused, true);
  assert.equal(musicInstances[0].pauseCalls, 1);
  scope.playCurrentStageMusic();
  assert.equal(musicInstances[0].playCalls, 1, "manual pause blocks automatic restarts");
  scope.setCurrentStageMusicPaused(false);
  assert.equal(musicInstances[0].paused, false);
  assert.equal(musicInstances[0].playCalls, 2);
  assert.ok(fetchedSources.includes("./assets/sound/gun_impact.mp3?v=20260924-1"));
  assert.ok(fetchedSources.includes("./assets/sound/gun_hit.mp3?v=20260924-1"));
  assert.ok(impactOffset >= 0 && impactOffset < 0.339592);
  assert.deepEqual(starts, [
    [10, 0, 0.115],
    [10, impactOffset],
    [10, 0],
    [10, 0],
    [10, 0],
    [10, 0],
    [10, 0],
  ]);
  assert.deepEqual(
    outputGains.slice(0, 6).map((gain) => gain.value),
    [0.3, 0.34, 0.28, 0.55, 0.38, 0.3],
  );
  assert.deepEqual(gainEvents, [
    ["set", 0.42, 10],
    ["set", 0.42, 10.09],
    ["ramp", 0, 10.115],
  ]);
});
