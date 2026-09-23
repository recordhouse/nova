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

const playerSprites = {
  run: loadPlayerSprite("./assets/images/main/stage/run.png", 9, PLAYER_RUN_FRAMES),
  jump: loadPlayerSprite("./assets/images/main/stage/jump.png", 13, PLAYER_JUMP_FRAMES),
  getOff: loadPlayerSprite("./assets/images/main/stage/get-off.png", 10, PLAYER_JUMP_FRAMES),
  stand: loadPlayerSprite("./assets/images/main/stage/stand.png", 5, PLAYER_STAND_FRAMES),
  blast: loadPlayerSprite("./assets/images/main/stage/blast.png", 10, PLAYER_BLAST_FRAMES),
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
};

const turretSprite = loadImageAsset("./assets/images/monsters/turret_01.png");

const GameAudioContext = window.AudioContext ?? window.webkitAudioContext;
function fetchSoundData(source) {
  return typeof fetch === "function"
    ? fetch(source)
    .then((response) => response.ok ? response.arrayBuffer() : null)
    .catch(() => null)
    : Promise.resolve(null);
}

const playerGunSoundData = fetchSoundData("./assets/sound/gun.mp3");
const playerGunImpactSoundData = fetchSoundData("./assets/sound/gun_impact.mp3");
const gunHitSoundData = fetchSoundData("./assets/sound/gun_hit.mp3");
const metalHitSoundData = fetchSoundData("./assets/sound/metal.mp3");
const turretLaserSoundData = fetchSoundData("./assets/sound/laser.mp3?v=20260922-2");
const monsterDie01SoundData = fetchSoundData("./assets/sound/monster_die_01.mp3");
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

function prepareGameAudio() {
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
