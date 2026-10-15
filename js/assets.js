"use strict";

// Sprite and background image loading.

function loadPlayerSprite(source, fps, frames) {
  const image = new Image();
  const sprite = { image, fps, frames, loaded: false };
  image.onload = () => {
    sprite.loaded = true;
  };
  image.src = `${source}?v=${Date.now()}`;
  return sprite;
}

function loadImageAsset(source) {
  const image = new Image();
  const asset = { image, loaded: false };
  image.onload = () => {
    asset.loaded = true;
  };
  image.src = `${source}?v=${Date.now()}`;
  return asset;
}

function loadVideoAsset(source, options = {}) {
  const loop = options.loop ?? true;
  const playbackRate = options.playbackRate ?? 1;
  const video = typeof document !== "undefined"
    ? document.createElement?.("video")
    : null;
  const asset = {
    video,
    loaded: false,
    active: false,
    pendingPlay: false,
  };
  if (!video) return asset;
  video.preload = "auto";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = loop;
  video.playbackRate = playbackRate;
  video.addEventListener("loadeddata", () => {
    asset.loaded = true;
    if (asset.pendingPlay) startVideoAssetPlayback(asset);
  });
  video.addEventListener("ended", () => {
    asset.active = false;
    asset.pendingPlay = false;
    video.currentTime = 0;
  });
  video.addEventListener("error", () => {
    asset.active = false;
    asset.pendingPlay = false;
  });
  video.src = source;
  video.load?.();
  return asset;
}

const playerSprites = {
  run: loadPlayerSprite("./assets/images/main/stage/run.png", 9, PLAYER_RUN_FRAMES),
  jump: loadPlayerSprite("./assets/images/main/stage/jump.png", 13, PLAYER_JUMP_FRAMES),
  getOff: loadPlayerSprite("./assets/images/main/stage/get-off.png", 10, PLAYER_JUMP_FRAMES),
  stand: loadPlayerSprite("./assets/images/main/stage/stand.png", 5, PLAYER_STAND_FRAMES),
  blast: loadPlayerSprite("./assets/images/main/stage/blast.png", 10, PLAYER_BLAST_FRAMES),
  blastRun: loadPlayerSprite("./assets/images/main/stage/blast-run.png", 9, PLAYER_RUN_FRAMES),
  blastHigh: loadPlayerSprite("./assets/images/main/stage/blast-high.png", 10, PLAYER_BLAST_FRAMES),
  blastJump: loadPlayerSprite("./assets/images/main/stage/blast-jump.png", 10, PLAYER_BLAST_FRAMES),
  blastSit: loadPlayerSprite("./assets/images/main/stage/blast-sit.png", 10, PLAYER_BLAST_FRAMES),
  sit: loadPlayerSprite("./assets/images/main/stage/sit.png", 5, PLAYER_SIT_FRAMES),
  down: loadPlayerSprite("./assets/images/main/stage/down.png", PLAYER_DOWN_FPS, PLAYER_DOWN_FRAMES),
};

const enemySprites = {
  monster1: loadImageAsset("./assets/images/monsters/monster_01.png?v=20260919-2"),
  monster2: loadImageAsset("./assets/images/monsters/monster_02.png"),
  monster3: loadImageAsset("./assets/images/monsters/monster_03.png"),
  monster4: loadImageAsset("./assets/images/monsters/monster_04.png?v=20260923-1"),
};

const turretSprite = loadImageAsset("./assets/images/monsters/turret_01.png");
const playerGunVideoAsset = loadVideoAsset("./assets/video/main/gun-optimized.mp4?v=20261015-1");
const playerRunVideoAsset = loadVideoAsset("./assets/video/main/run-optimized.mp4?v=20261015-1");
const playerStandVideoAsset = loadVideoAsset("./assets/video/main/stand-optimized.mp4?v=20261015-1");
const playerDownVideoAsset = loadVideoAsset(
  "./assets/video/main/down-optimized.mp4?v=20261015-1",
  { loop: false },
);
const ENEMY_ATTACK_VIDEO_COOLDOWN = 3;
const ENEMY_ATTACK_VIDEO_PLAYBACK_RATES = Object.freeze({
  monster1: 2.4,
  monster2: 2.9,
  monster3: 3.1,
  monster4: 3.2,
  turret: 3.4,
});
const enemyAttackVideoAssets = Object.freeze({
  monster1: loadVideoAsset(
    "./assets/video/monsters/monster1-attack-optimized.mp4?v=20261015-1",
    { loop: false, playbackRate: ENEMY_ATTACK_VIDEO_PLAYBACK_RATES.monster1 },
  ),
  monster2: loadVideoAsset(
    "./assets/video/monsters/monster2-attack-optimized.mp4?v=20261015-1",
    { loop: false, playbackRate: ENEMY_ATTACK_VIDEO_PLAYBACK_RATES.monster2 },
  ),
  monster3: loadVideoAsset(
    "./assets/video/monsters/monster3-attack-optimized.mp4?v=20261015-1",
    { loop: false, playbackRate: ENEMY_ATTACK_VIDEO_PLAYBACK_RATES.monster3 },
  ),
  monster4: loadVideoAsset(
    "./assets/video/monsters/monster4-attack-optimized.mp4?v=20261015-1",
    { loop: false, playbackRate: ENEMY_ATTACK_VIDEO_PLAYBACK_RATES.monster4 },
  ),
  turret: loadVideoAsset(
    "./assets/video/monsters/turret-attack-optimized.mp4?v=20261015-1",
    { loop: false, playbackRate: ENEMY_ATTACK_VIDEO_PLAYBACK_RATES.turret },
  ),
});
const monster2AttackVideoAsset = enemyAttackVideoAssets.monster2;
let enemyAttackVideoCooldownUntil = -Infinity;
const introducedEnemyVideoKinds = new Set();
const pendingEnemyIntroductionVideos = [];
let enemyIntroductionSequence = 0;

function startVideoAssetPlayback(asset) {
  const video = asset.video;
  if (!video || (!asset.loaded && video.readyState < 2)) return false;
  if (asset.active) return false;
  asset.loaded = true;
  asset.pendingPlay = false;
  asset.active = true;
  video.currentTime = 0;
  try {
    const playback = video.play();
    if (playback?.catch) {
      playback.catch(() => {
        asset.active = false;
      });
    }
  } catch {
    asset.active = false;
    return false;
  }
  return true;
}

function playVideoAsset(asset) {
  if (!asset.video || asset.active || asset.pendingPlay) return false;
  asset.pendingPlay = true;
  if (!asset.loaded && asset.video.readyState < 2) {
    asset.video.load?.();
    return false;
  }
  return startVideoAssetPlayback(asset);
}

function stopVideoAsset(asset) {
  if (!asset.video || (!asset.active && !asset.pendingPlay)) return false;
  asset.video.pause?.();
  asset.video.currentTime = 0;
  asset.active = false;
  asset.pendingPlay = false;
  return true;
}

function playPlayerGunVideo() {
  return playVideoAsset(playerGunVideoAsset);
}

function stopPlayerGunVideo() {
  return stopVideoAsset(playerGunVideoAsset);
}

function playPlayerRunVideo() {
  return playVideoAsset(playerRunVideoAsset);
}

function stopPlayerRunVideo() {
  return stopVideoAsset(playerRunVideoAsset);
}

function playPlayerStandVideo() {
  return playVideoAsset(playerStandVideoAsset);
}

function stopPlayerStandVideo() {
  return stopVideoAsset(playerStandVideoAsset);
}

function playPlayerDownVideo() {
  return playVideoAsset(playerDownVideoAsset);
}

function stopPlayerDownVideo() {
  return stopVideoAsset(playerDownVideoAsset);
}

function activeEnemyAttackVideoAsset() {
  return Object.values(enemyAttackVideoAssets).find((asset) => (
    asset.active || asset.pendingPlay
  )) ?? null;
}

function removePendingEnemyIntroduction(kind) {
  const index = pendingEnemyIntroductionVideos.findIndex((entry) => (
    entry.kind === kind
  ));
  if (index >= 0) pendingEnemyIntroductionVideos.splice(index, 1);
}

function markEnemyVideoIntroduced(kind) {
  introducedEnemyVideoKinds.add(kind);
  removePendingEnemyIntroduction(kind);
}

function queueEnemyIntroductionVideo(kind, distance = Infinity) {
  if (!enemyAttackVideoAssets[kind] || introducedEnemyVideoKinds.has(kind)) {
    return false;
  }
  const existing = pendingEnemyIntroductionVideos.find((entry) => (
    entry.kind === kind
  ));
  if (existing) {
    existing.distance = Math.min(existing.distance, distance);
    return false;
  }
  pendingEnemyIntroductionVideos.push({
    kind,
    distance,
    sequence: enemyIntroductionSequence,
  });
  enemyIntroductionSequence += 1;
  return true;
}

function playEnemyAttackVideo(kind, now = gameTime) {
  const asset = enemyAttackVideoAssets[kind];
  if (
    !asset?.video ||
    activeEnemyAttackVideoAsset() ||
    now < enemyAttackVideoCooldownUntil
  ) return false;
  enemyAttackVideoCooldownUntil = now + ENEMY_ATTACK_VIDEO_COOLDOWN;
  playVideoAsset(asset);
  markEnemyVideoIntroduced(kind);
  return true;
}

function playNextEnemyIntroductionVideo(now = gameTime) {
  if (
    pendingEnemyIntroductionVideos.length === 0 ||
    activeEnemyAttackVideoAsset() ||
    now < enemyAttackVideoCooldownUntil
  ) return false;
  pendingEnemyIntroductionVideos.sort((a, b) => (
    a.distance - b.distance || a.sequence - b.sequence
  ));
  return playEnemyAttackVideo(pendingEnemyIntroductionVideos[0].kind, now);
}

function stopEnemyAttackVideo() {
  let stopped = false;
  for (const asset of Object.values(enemyAttackVideoAssets)) {
    stopped = stopVideoAsset(asset) || stopped;
  }
  return stopped;
}

function resetEnemyAttackVideo() {
  stopEnemyAttackVideo();
  enemyAttackVideoCooldownUntil = -Infinity;
  introducedEnemyVideoKinds.clear();
  pendingEnemyIntroductionVideos.length = 0;
  enemyIntroductionSequence = 0;
}

function playMonster2AttackVideo(now = gameTime) {
  return playEnemyAttackVideo("monster2", now);
}

function stopMonster2AttackVideo() {
  return stopEnemyAttackVideo();
}

function resetMonster2AttackVideo() {
  resetEnemyAttackVideo();
}

const GameAudioContext = window.AudioContext ?? window.webkitAudioContext;
const stage01Music = typeof Audio === "function"
  ? new Audio("./assets/music/stage_01.mp3?v=20260924-1") : null;
let stageMusicPaused = TEST_MODE;
if (stage01Music) {
  stage01Music.loop = true;
  stage01Music.volume = 0.18;
  stage01Music.preload = "auto";
  stage01Music.playsInline = true;
}

function playCurrentStageMusic() {
  if (
    stageMusicPaused || CURRENT_STAGE !== 1 ||
    !stage01Music || !stage01Music.paused
  ) return;
  const playback = stage01Music.play();
  if (playback?.catch) playback.catch(() => {});
}

function setCurrentStageMusicPaused(paused) {
  stageMusicPaused = Boolean(paused);
  if (stageMusicPaused) {
    stage01Music?.pause();
    return;
  }
  playCurrentStageMusic();
}

// Normal play starts immediately when autoplay is available. If a browser
// blocks it, the existing pointer/key audio unlock retries on the first input.
if (!stageMusicPaused) playCurrentStageMusic();

function fetchSoundData(source) {
  return typeof fetch === "function"
    ? fetch(source)
    .then((response) => response.ok ? response.arrayBuffer() : null)
    .catch(() => null)
    : Promise.resolve(null);
}

const playerGunSoundData = fetchSoundData("./assets/sound/gun.mp3");
const playerGunImpactSoundData = fetchSoundData("./assets/sound/gun_impact.mp3?v=20260924-1");
const gunHitSoundData = fetchSoundData("./assets/sound/gun_hit.mp3?v=20260924-1");
const heartPickupSoundData = fetchSoundData("./assets/sound/heart.mp3");
const metalHitSoundData = fetchSoundData("./assets/sound/metal.mp3");
const turretLaserSoundData = fetchSoundData("./assets/sound/laser.mp3?v=20260922-2");
const monsterDie01SoundData = fetchSoundData("./assets/sound/monster_die_01.mp3");
const monsterDie04SoundData = fetchSoundData("./assets/sound/monster_die_04.mp3");
const monsterFire02SoundData = fetchSoundData("./assets/sound/monster_fire_02.mp3?v=20260923-1");
const resurrectionSoundData = fetchSoundData("./assets/sound/resurrection.mp3");
const shieldSoundData = fetchSoundData("./assets/sound/shield.mp3");
function createGameAudioContext() {
  if (!GameAudioContext) return null;
  try {
    return new GameAudioContext({ latencyHint: 0.01 });
  } catch {
    return new GameAudioContext();
  }
}

// Decode during page loading; the first input only has to resume the context.
const gameAudioContext = createGameAudioContext();
let playerGunSoundBuffer = null;
const playerGunSoundDecode = gameAudioContext
  ? playerGunSoundData
    .then((data) => data ? gameAudioContext.decodeAudioData(data) : null)
    .then((buffer) => {
      playerGunSoundBuffer = buffer;
      return buffer;
    })
    .catch(() => null)
  : Promise.resolve(null);
let playerGunImpactSoundBuffer = null;
const playerGunImpactSoundDecode = gameAudioContext
  ? playerGunImpactSoundData
    .then((data) => data ? gameAudioContext.decodeAudioData(data) : null)
    .then((buffer) => {
      playerGunImpactSoundBuffer = buffer;
      return buffer;
    })
    .catch(() => null)
  : Promise.resolve(null);
const playerGunImpactOutput = gameAudioContext ? gameAudioContext.createGain() : null;
if (playerGunImpactOutput) {
  playerGunImpactOutput.gain.value = 0.3;
  playerGunImpactOutput.connect(gameAudioContext.destination);
}
let playerGunSoundQueued = false;
let playerGunImpactSoundQueued = false;
const PLAYER_GUN_SOUND_SLICE_DURATION = 0.115;
const PLAYER_GUN_SOUND_FADE_DURATION = 0.025;
const PLAYER_GUN_IMPACT_SOUND_OFFSET = 0.035;

function createPreparedGameSound(dataPromise, volume, offset = 0) {
  const sound = {
    buffer: null,
    decode: Promise.resolve(null),
    offset,
    output: null,
    queued: false,
  };
  if (!gameAudioContext) return sound;
  sound.output = gameAudioContext.createGain();
  sound.output.gain.value = volume;
  sound.output.connect(gameAudioContext.destination);
  sound.decode = dataPromise
    .then((data) => data ? gameAudioContext.decodeAudioData(data) : null)
    .then((buffer) => {
      sound.buffer = buffer;
      return buffer;
    })
    .catch(() => null);
  return sound;
}

const gunHitSound = createPreparedGameSound(gunHitSoundData, 0.34);
const metalHitSound = createPreparedGameSound(metalHitSoundData, 0.28);
const turretLaserSound = createPreparedGameSound(turretLaserSoundData, 0.55);
const monsterDie01Sound = createPreparedGameSound(monsterDie01SoundData, 0.38);
const monsterDie04Sound = createPreparedGameSound(monsterDie04SoundData, 0.38);
const monsterFire02Sound = createPreparedGameSound(monsterFire02SoundData, 0.3);
const resurrectionSound = createPreparedGameSound(resurrectionSoundData, 0.5);
const heartPickupSound = createPreparedGameSound(heartPickupSoundData, 0.44);
const shieldSound = createPreparedGameSound(shieldSoundData, 0.42);

function prepareGameAudio() {
  playCurrentStageMusic();
  if (!gameAudioContext) return null;
  if (gameAudioContext.state === "suspended") {
    gameAudioContext.resume().catch(() => {});
  }
  return playerGunSoundDecode;
}

function startPlayerGunSound() {
  if (!gameAudioContext || !playerGunSoundBuffer) return;
  const source = gameAudioContext.createBufferSource();
  const gain = gameAudioContext.createGain();
  const startTime = gameAudioContext.currentTime;
  const duration = Math.min(
    PLAYER_GUN_SOUND_SLICE_DURATION,
    playerGunSoundBuffer.duration,
  );
  const fadeStart = Math.max(startTime, startTime + duration - PLAYER_GUN_SOUND_FADE_DURATION);
  source.buffer = playerGunSoundBuffer;
  gain.gain.setValueAtTime(0.42, startTime);
  gain.gain.setValueAtTime(0.42, fadeStart);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  source.connect(gain);
  gain.connect(gameAudioContext.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  // The supplied file contains two shots; use only its first shot per bullet.
  source.start(startTime, 0, duration);
}

function playPlayerGunSound() {
  const ready = prepareGameAudio();
  if (playerGunSoundBuffer) {
    startPlayerGunSound();
    return;
  }
  // Keep only the first pending shot while the short sound finishes decoding.
  if (!ready || playerGunSoundQueued) return;
  playerGunSoundQueued = true;
  ready.then((buffer) => {
    playerGunSoundQueued = false;
    if (buffer) startPlayerGunSound();
  });
}

function startPlayerGunImpactSound() {
  if (!gameAudioContext || !playerGunImpactSoundBuffer || !playerGunImpactOutput) return;
  const source = gameAudioContext.createBufferSource();
  const offset = Math.min(
    PLAYER_GUN_IMPACT_SOUND_OFFSET,
    Math.max(0, playerGunImpactSoundBuffer.duration - 0.01),
  );
  source.buffer = playerGunImpactSoundBuffer;
  source.connect(playerGunImpactOutput);
  source.onended = () => {
    source.disconnect();
  };
  source.start(gameAudioContext.currentTime, offset);
}

function playPlayerGunImpactSound() {
  prepareGameAudio();
  if (playerGunImpactSoundBuffer) {
    startPlayerGunImpactSound();
    return;
  }
  if (playerGunImpactSoundQueued) return;
  playerGunImpactSoundQueued = true;
  playerGunImpactSoundDecode.then((buffer) => {
    playerGunImpactSoundQueued = false;
    if (buffer) startPlayerGunImpactSound();
  });
}

function startPreparedGameSound(sound) {
  if (!gameAudioContext || !sound.buffer || !sound.output) return;
  const source = gameAudioContext.createBufferSource();
  const offset = Math.min(sound.offset, Math.max(0, sound.buffer.duration - 0.01));
  source.buffer = sound.buffer;
  source.connect(sound.output);
  source.onended = () => source.disconnect();
  source.start(gameAudioContext.currentTime, offset);
}

function playPreparedGameSound(sound) {
  prepareGameAudio();
  if (sound.buffer) {
    startPreparedGameSound(sound);
    return;
  }
  if (sound.queued) return;
  sound.queued = true;
  sound.decode.then((buffer) => {
    sound.queued = false;
    if (buffer) startPreparedGameSound(sound);
  });
}

function playGunHitSound() {
  playPreparedGameSound(gunHitSound);
}

function playMetalHitSound() {
  playPreparedGameSound(metalHitSound);
}

function playTurretLaserSound() {
  playPreparedGameSound(turretLaserSound);
}

function playMonsterDie01Sound() {
  playPreparedGameSound(monsterDie01Sound);
}

function playMonsterDie04Sound() {
  playPreparedGameSound(monsterDie04Sound);
}

function playMonsterFire02Sound() {
  playPreparedGameSound(monsterFire02Sound);
}

function playResurrectionSound() {
  playPreparedGameSound(resurrectionSound);
}

function playHeartPickupSound() {
  playPreparedGameSound(heartPickupSound);
}

function playShieldSound() {
  playPreparedGameSound(shieldSound);
}

// Mobile browsers require audio to be unlocked by a direct user gesture.
window.addEventListener("pointerdown", prepareGameAudio, {
  capture: true,
  once: true,
  passive: true,
});
window.addEventListener("keydown", prepareGameAudio, {
  capture: true,
  once: true,
});

const fixedBackground = {
  image: new Image(),
  loaded: false,
};
fixedBackground.image.onload = () => {
  fixedBackground.loaded = true;
};
fixedBackground.image.src = `./assets/images/bg/space.png?v=${Date.now()}`;
