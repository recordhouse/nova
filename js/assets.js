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
};

const turretSprite = loadImageAsset("./assets/images/monsters/turret_01.png");

const fixedBackground = {
  image: new Image(),
  loaded: false,
};
fixedBackground.image.onload = () => {
  fixedBackground.loaded = true;
};
fixedBackground.image.src = `./assets/images/bg/space.png?v=${Date.now()}`;
