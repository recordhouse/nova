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
    fetch: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
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
  ])`, scope);
  scope.playPlayerGunSound();
  scope.playPlayerGunImpactSound();
  scope.playGunHitSound();
  scope.playMetalHitSound();
  scope.playTurretLaserSound();
  scope.playMonsterDie01Sound();
  const impactOffset = vm.runInContext("PLAYER_GUN_IMPACT_SOUND_OFFSET", scope);

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].latencyHint, 0.01);
  assert.ok(impactOffset >= 0 && impactOffset < 0.339592);
  assert.deepEqual(starts, [
    [10, 0, 0.115],
    [10, impactOffset],
    [10, 0],
    [10, 0],
    [10, 0],
    [10, 0],
  ]);
  assert.deepEqual(
    outputGains.slice(0, 5).map((gain) => gain.value),
    [0.3, 0.34, 0.28, 0.55, 0.38],
  );
  assert.deepEqual(gainEvents, [
    ["set", 0.42, 10],
    ["set", 0.42, 10.09],
    ["ramp", 0, 10.115],
  ]);
});
