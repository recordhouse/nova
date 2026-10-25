"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("optimized action videos randomize and keep their playback lifecycles", async () => {
  const videos = [];
  const createVideo = () => ({
    listeners: {}, readyState: 0, videoWidth: 480, videoHeight: 480,
    currentTime: 4, paused: true, ended: false,
    loadCalls: 0, playCalls: 0, pauseCalls: 0,
    addEventListener(name, callback) { this.listeners[name] = callback; },
    load() { this.loadCalls += 1; },
    play() {
      this.playCalls += 1;
      this.paused = false;
      this.ended = false;
      return Promise.resolve();
    },
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    },
  });
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game"
        ? { getContext: () => ({ setTransform() {} }) }
        : null,
      createElement: (name) => {
        if (name !== "video") return null;
        const video = createVideo();
        videos.push(video);
        return video;
      },
    },
    window: {
      location: { search: "" },
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
    },
    Image: class { set src(value) { this.currentSrc = value; } },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  vm.runInContext("Math.random=()=>0", scope);

  const [
    gunVideo1,
    gunVideo2,
    runVideo1,
    runVideo2,
    standVideo,
    downVideo,
    startVideo,
    finishingVideo,
    basicVideo,
    monster1Video,
    monster2Video,
    monster3Video,
    monster4Video,
    turretVideo,
    spaceVideo,
  ] = videos;
  assert.equal(gunVideo1.src, "./assets/video/main/gun-optimized.mp4?v=20261015-1");
  assert.equal(gunVideo2.src, "./assets/video/main/gun_02-optimized.mp4?v=20261021-2");
  assert.equal(runVideo1.src, "./assets/video/main/run-optimized.mp4?v=20261015-1");
  assert.equal(runVideo2.src, "./assets/video/main/run_02-optimized.mp4?v=20261021-1");
  assert.equal(standVideo.src, "./assets/video/main/stand-optimized.mp4?v=20261015-1");
  assert.equal(downVideo.src, "./assets/video/main/down-optimized.mp4?v=20261015-1");
  assert.equal(startVideo.src, "./assets/video/main/start-optimized.mp4?v=20261021-1");
  assert.equal(finishingVideo.src,
    "./assets/video/main/finishing-optimized.mp4?v=20261021-1");
  assert.equal(basicVideo.src,
    "./assets/video/monsters/basic-optimized.mp4?v=20261015-1");
  assert.equal(monster1Video.src,
    "./assets/video/monsters/monster1-attack-optimized.mp4?v=20261015-1");
  assert.equal(monster2Video.src,
    "./assets/video/monsters/monster2-attack-optimized.mp4?v=20261015-1");
  assert.equal(monster3Video.src,
    "./assets/video/monsters/monster3-attack-optimized.mp4?v=20261015-1");
  assert.equal(monster4Video.src,
    "./assets/video/monsters/monster4-attack-optimized.mp4?v=20261015-1");
  assert.equal(turretVideo.src,
    "./assets/video/monsters/turret-attack-optimized.mp4?v=20261015-1");
  assert.equal(spaceVideo.src,
    "./assets/video/bg/space-optimized.mp4?v=20261019-2");
  assert.equal(spaceVideo.muted, true);
  assert.equal(spaceVideo.loop, true);
  assert.equal(spaceVideo.loadCalls, 2,
    "the space background is queued for autoplay immediately");
  spaceVideo.readyState = 4;
  spaceVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(spaceVideo.playCalls, 1);
  assert.equal(vm.runInContext("spaceBackgroundVideoAsset.active", scope), true);
  assert.ok([runVideo1, runVideo2].every((video) => video.muted && video.loop));
  assert.equal(standVideo.muted, true);
  assert.equal(standVideo.loop, true);
  assert.equal(downVideo.muted, true);
  assert.equal(downVideo.loop, false);
  assert.equal(startVideo.loop, false);
  assert.equal(finishingVideo.loop, false);
  assert.equal(basicVideo.muted, true);
  assert.equal(basicVideo.loop, true);
  assert.equal(basicVideo.playbackRate, 1);
  assert.equal(basicVideo.loadCalls, 2,
    "the default monster loop is queued for autoplay immediately");
  basicVideo.readyState = 4;
  basicVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(basicVideo.playCalls, 1);
  assert.equal(vm.runInContext("monsterBasicVideoAsset.active", scope), true);
  assert.equal(gunVideo1.preload, "auto");
  assert.ok([gunVideo1, gunVideo2].every((video) => (
    video.muted && video.defaultMuted && video.playsInline && video.loop
  )));
  assert.equal(monster2Video.muted, true);
  assert.equal(monster2Video.loop, false);
  assert.equal(monster2Video.playbackRate, 2.9);
  assert.equal(monster1Video.playbackRate, 2.4);
  assert.equal(monster3Video.playbackRate, 3.1);
  assert.equal(monster4Video.playbackRate, 3.2);
  assert.equal(turretVideo.playbackRate, 3.4);
  assert.ok([monster1Video, monster3Video, monster4Video, turretVideo].every(
    (enemyVideo) => enemyVideo.muted && !enemyVideo.loop,
  ));
  assert.equal(scope.playPlayerGunVideo(), false, "an early shot waits for video data");
  assert.equal(scope.playPlayerGunVideo(), false, "pending playback is not reloaded each frame");
  assert.equal(gunVideo1.loadCalls, 2);
  gunVideo1.readyState = 4;
  gunVideo1.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(gunVideo1.playCalls, 1);
  assert.equal(gunVideo1.currentTime, 0);
  assert.equal(vm.runInContext("playerGunVideoAsset.active", scope), true);

  assert.equal(scope.playPlayerGunVideo(), false);
  assert.equal(gunVideo1.playCalls, 1, "rapid follow-up bullets do not rewind the cut-in");

  assert.equal(scope.stopPlayerGunVideo(), true);
  assert.equal(gunVideo1.pauseCalls, 1);
  assert.equal(gunVideo1.currentTime, 0);
  assert.equal(vm.runInContext("playerGunVideoAsset.active", scope), false);
  assert.equal(scope.stopPlayerGunVideo(), false);
  assert.equal(gunVideo1.pauseCalls, 1, "an inactive video is not paused every frame");

  vm.runInContext("Math.random=()=>0.99", scope);
  assert.equal(scope.playPlayerGunVideo(), false,
    "the randomly selected second gun video waits for its own data");
  assert.equal(vm.runInContext("playerGunVideoAsset===playerGunVideoAssets[1]", scope), true);
  gunVideo2.readyState = 4;
  gunVideo2.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(gunVideo2.playCalls, 1,
    "a later firing hold can randomly use the second gun video");
  assert.equal(scope.stopPlayerGunVideo(), true);

  assert.equal(scope.playPlayerDownVideo(), false,
    "the down cut-in waits for its video data");
  downVideo.readyState = 4;
  downVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(downVideo.playCalls, 1);
  assert.equal(vm.runInContext("playerDownVideoAsset.active", scope), true);
  downVideo.listeners.ended();
  assert.equal(vm.runInContext("playerDownVideoAsset.active", scope), false);
  assert.equal(downVideo.currentTime, 0);

  assert.equal(scope.playPlayerStartVideo(), false);
  startVideo.readyState = 4;
  startVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(startVideo.playCalls, 1);
  startVideo.listeners.ended();
  assert.equal(vm.runInContext("playerStartVideoAsset.active", scope), false);

  assert.equal(scope.playPlayerFinishingVideo(), false);
  finishingVideo.readyState = 4;
  finishingVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(finishingVideo.playCalls, 1);
  assert.equal(scope.playPlayerFinishingVideo(), true,
    "a new ultimate restarts finishing footage even if the previous clip is active");
  assert.equal(finishingVideo.pauseCalls, 1);
  assert.equal(finishingVideo.playCalls, 2);

  vm.runInContext(`
    globalThis.enemyVideoVoiceCalls=[];
    playEnemyVideoVoice=(kind)=>{enemyVideoVoiceCalls.push(kind);return true};
  `, scope);
  assert.equal(scope.playMonster2AttackVideo(10), true);
  assert.equal(scope.playMonster2AttackVideo(10.2), false,
    "a pending monster cut-in cannot restart");
  monster2Video.readyState = 4;
  monster2Video.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(monster2Video.playCalls, 1);
  assert.deepEqual(Array.from(scope.enemyVideoVoiceCalls), ["monster2"]);
  assert.equal(vm.runInContext("monster2AttackVideoAsset.active", scope), true);
  monster2Video.listeners.ended();
  assert.equal(vm.runInContext("monster2AttackVideoAsset.active", scope), false);
  assert.equal(scope.playMonster2AttackVideo(12.9), false,
    "the global three-second cut-in cooldown prevents flicker");
  assert.equal(scope.playMonster2AttackVideo(13), true);
  assert.equal(monster2Video.playCalls, 2);
  assert.deepEqual(Array.from(scope.enemyVideoVoiceCalls), ["monster2", "monster2"]);
  assert.equal(scope.resetMonster2AttackVideo(), undefined);
  assert.equal(monster2Video.pauseCalls, 1);

  assert.equal(scope.playEnemyAttackVideo("turret", 20), true);
  turretVideo.readyState = 4;
  turretVideo.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(turretVideo.playCalls, 1);
  assert.deepEqual(
    Array.from(scope.enemyVideoVoiceCalls),
    ["monster2", "monster2", "turret"],
  );
  assert.equal(vm.runInContext("enemyAttackVideoAssets.turret.active", scope), true);
  assert.equal(scope.playEnemyAttackVideo("monster3", 21), false,
    "one enemy cut-in cannot interrupt another");
  assert.equal(scope.stopEnemyAttackVideo(), true);
  assert.equal(turretVideo.pauseCalls, 1);

  scope.resetEnemyAttackVideo();
  assert.equal(scope.queueEnemyIntroductionVideo("monster1", 300), true);
  assert.equal(scope.queueEnemyIntroductionVideo("monster3", 100), true);
  assert.equal(scope.queueEnemyIntroductionVideo("monster1", 50), false,
    "repeated sightings update one queued introduction instead of duplicating it");
  assert.equal(scope.playNextEnemyIntroductionVideo(30), true);
  assert.equal(vm.runInContext(
    "pendingEnemyIntroductionVideos.map(entry=>entry.kind).join(',')",
    scope,
  ), "monster3", "the nearest visible monster introduction plays first");
  monster1Video.readyState = 4;
  monster1Video.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(monster1Video.playCalls, 1);
  assert.equal(scope.queueEnemyIntroductionVideo("monster1", 10), false,
    "a monster type is introduced only once per stage");
  scope.stopEnemyAttackVideo();
  assert.equal(scope.playNextEnemyIntroductionVideo(31), false,
    "the shared cooldown prevents queued introductions from flickering");
  assert.equal(scope.playNextEnemyIntroductionVideo(33), true);
  monster3Video.readyState = 4;
  monster3Video.listeners.loadeddata();
  await Promise.resolve();
  assert.equal(monster3Video.playCalls, 1);
  assert.deepEqual(
    Array.from(scope.enemyVideoVoiceCalls),
    ["monster2", "monster2", "turret", "monster3"],
  );
  scope.resetEnemyAttackVideo();
  assert.equal(scope.queueEnemyIntroductionVideo("monster1", 10), true,
    "a new stage resets first-encounter introductions");
});

test("the two run videos randomize independently from stand footage", async () => {
  const videos = [];
  const scope = {
    performance: { now: () => 0 },
    document: {
      querySelector: (selector) => selector === "#game"
        ? { getContext: () => ({ setTransform() {} }) } : null,
      createElement: (name) => {
        if (name !== "video") return null;
        const video = {
          listeners: {}, readyState: 4, currentTime: 3,
          playCalls: 0, pauseCalls: 0,
          addEventListener(event, callback) { this.listeners[event] = callback; },
          load() {},
          play() { this.playCalls += 1; return Promise.resolve(); },
          pause() { this.pauseCalls += 1; },
        };
        videos.push(video);
        return video;
      },
    },
    window: { location: { search: "" }, innerWidth: 720, innerHeight: 1280,
      matchMedia: () => ({ matches: false }), addEventListener() {} },
    Image: class { set src(value) { this.currentSrc = value; } },
  };
  vm.createContext(scope);
  for (const name of ["config", "assets"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }

  const [gunVideo1, gunVideo2, runVideo1, runVideo2, standVideo] = videos;
  vm.runInContext("Math.random=()=>0", scope);
  assert.equal(scope.playPlayerRunVideo(), true);
  assert.equal(runVideo1.playCalls, 1);
  assert.equal(runVideo2.playCalls, 0);
  assert.equal(gunVideo1.playCalls + gunVideo2.playCalls, 0);
  assert.equal(scope.stopPlayerRunVideo(), true);
  assert.equal(runVideo1.pauseCalls, 1);
  assert.equal(runVideo1.currentTime, 0);
  assert.equal(gunVideo1.pauseCalls + gunVideo2.pauseCalls, 0);

  vm.runInContext("Math.random=()=>0.99", scope);
  assert.equal(scope.playPlayerRunVideo(), true);
  assert.equal(runVideo2.playCalls, 1);
  assert.equal(vm.runInContext("playerRunVideoAsset===playerRunVideoAssets[1]", scope), true);
  assert.equal(scope.stopPlayerRunVideo(), true);
  assert.equal(runVideo2.pauseCalls, 1);
  assert.equal(standVideo.playCalls, 0);
  assert.equal(scope.playPlayerStandVideo(), true);
  assert.equal(standVideo.playCalls, 1);
  assert.equal(runVideo1.playCalls + runVideo2.playCalls, 2);
  assert.equal(scope.stopPlayerStandVideo(), true);
  assert.equal(standVideo.pauseCalls, 1);
  assert.equal(standVideo.currentTime, 0);
  await Promise.resolve();
});
