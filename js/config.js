"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const TEST_MODE = /(?:^|[?&])test=1(?:&|$)/.test(window.location?.search ?? "");
const testControlsElement = document.querySelector("[data-test-controls]");
const testJumpPathButton = document.querySelector("[data-test-jump-path]");
const testResolutionButton = document.querySelector("[data-test-resolution]");
if (testControlsElement) testControlsElement.hidden = !TEST_MODE;

const TEST_RESOLUTION_PRESETS = [
  { width: 540, height: 960 },
  { width: 720, height: 1280 },
];
const BASE_GROUND_SCREEN_RATIO = 748 / 960;
let WIDTH = canvas.width;
let HEIGHT = canvas.height;
const RENDER_SCALE = 1;
let BASE_GROUND_Y = HEIGHT * BASE_GROUND_SCREEN_RATIO;
const GRAVITY = 2100;
const JUMP_SPEED = 950;
const PLAYER_MAX_FALL_SPEED = 760;
const JUMP_ANIMATION_DURATION = (JUMP_SPEED * 2) / GRAVITY;
const FIRE_AIM_ANGLE_DIAGONAL = Math.PI / 6;
const WORLD_LENGTH = 52000;
const LEVEL_GAP = 180;
const RAMP_ANGLE_DEGREES = [10, 20, 30, 40];
const RAMP_MIN_LANDING_LENGTH = 54;
const RAMP_MAX_LANDING_LENGTH = 150;
const RISING_PATH_MIN_FLAT_LENGTH = 48;
const SUB_PATH_JUMP_RISE = 200;
const SUB_PATH_MIN_SEGMENT_LENGTH = 210;
const FLOATING_PATH_GAP_MIN = 82;
const FLOATING_PATH_GAP_MAX = 138;
const FLOATING_PATH_WIDE_GAP_MIN = 150;
const FLOATING_PATH_WIDE_GAP_MAX = 204;
const FLOATING_PATH_ROAD_CLEARANCE_X = 42;
const FLOATING_PATH_ROAD_CLEARANCE_Y = 58;
const FLOATING_PATH_MUTUAL_CLEARANCE_X = 68;
const FLOATING_PATH_MUTUAL_CLEARANCE_Y = 58;
const FLOATING_PATH_CLEARANCE_SHIFTS = [0, -42, 42, -72, 72];
const MAIN_PATH_MAX_GAP = 112;
const ROAD_GAP_LEVEL_OFFSETS = [-0.18, -0.14, -0.1, 0.1, 0.14];
const PLATFORM_FEATURE_MIN_LENGTH = 190;
const PLATFORM_FEATURE_SLOT_LENGTH = 200;
const PLATFORM_FEATURE_WIDTH_MIN = 92;
const PLATFORM_FEATURE_WIDTH_MAX = 156;
const PLATFORM_FEATURE_LARGE_WIDTH_MIN = 150;
const PLATFORM_FEATURE_LARGE_WIDTH_MAX = 240;
const TURN_PATH_RISE = 270;
const TURN_DISTANCE_MIN = 1800;
const TURN_DISTANCE_MAX = 4400;
const TURN_PATH_START_OFFSET_MIN = 36;
const TURN_PATH_START_OFFSET_MAX = 78;
const HORIZONTAL_JUMP_PATH_CHANCE = 0.32;
const HORIZONTAL_JUMP_PATH_MIN_LENGTH = 1250;
const HORIZONTAL_JUMP_SINGLE_GAP_MIN = 180;
const HORIZONTAL_JUMP_SINGLE_GAP_MAX = 205;
const HORIZONTAL_JUMP_DOUBLE_GAP_MIN = 330;
const HORIZONTAL_JUMP_DOUBLE_GAP_MAX = 365;
const HORIZONTAL_JUMP_PAD_WIDTHS = [72, 118, 164];
const HORIZONTAL_JUMP_PAD_HEIGHTS = [
  { name: "upper", levelOffset: -0.38 },
  { name: "middle", levelOffset: 0 },
  { name: "lower", levelOffset: 0.38 },
];
const HORIZONTAL_JUMP_PAD_TRIANGLE_ANGLES = [30, 45, 60];
const FLOATING_PATH_TRIANGLE_ANGLES = [10, 20];
const HORIZONTAL_JUMP_MIN_RUNWAY_LENGTH = 360;
const JUMP_RISE_PATH_CHANCE = 0.28;
const DIP_PATH_CHANCE = 0.36;
const DIP_PATH_FORCE_DISTANCE = 1250;
const DIP_PATH_DEPTH_LEVELS = [0.35, 0.5];
const DIP_PATH_ANGLE_DEGREES = [10, 20];
const JUMP_RISE_GAP_MIN = 48;
const JUMP_RISE_GAP_MAX = 68;
const JUMP_RISE_LANDING_MIN = 170;
const JUMP_RISE_LANDING_MAX = 230;
let CAMERA_DEAD_ZONE_LEFT = WIDTH * 0.12;
let CAMERA_DEAD_ZONE_RIGHT = WIDTH * 0.16;
let CAMERA_REVERSE_ZONE_LEFT = WIDTH - CAMERA_DEAD_ZONE_RIGHT;
let CAMERA_REVERSE_ZONE_RIGHT = WIDTH - CAMERA_DEAD_ZONE_LEFT;
const CAMERA_HORIZONTAL_FOLLOW_SPEED = 5;
const PLAYER_SPRITE_DRAW_HEIGHT = 149.6;
const PLAYER_STAND_SPRITE_SCALE = 1.12;
const PLAYER_BLAST_SPRITE_SCALE = 1.1;
const PLAYER_BLAST_HIGH_SPRITE_SCALE = PLAYER_BLAST_SPRITE_SCALE * 1.2;
const PLAYER_SIT_SPRITE_SCALE = 1;
const PLAYER_BLAST_SIT_SPRITE_SCALE = 0.9;
const PLAYER_JUMP_SPRITE_SCALE = 1.12;
const PLAYER_GET_OFF_SPRITE_SCALE = PLAYER_JUMP_SPRITE_SCALE;
const PLAYER_DEEP_FALL_THRESHOLD = 28;
const PLAYER_MUZZLE_HEIGHT_RATIO = 1 / 3;
const PLAYER_MUZZLE_FORWARD_OFFSET = 44;
const PLAYER_MUZZLE_VERTICAL_OFFSET = -10;
const PLAYER_HIGH_MUZZLE_FORWARD_ADJUST = 10;
const PLAYER_HIGH_MUZZLE_VERTICAL_ADJUST = 10;
const PLAYER_AIR_MUZZLE_VERTICAL_ADJUST = 10;
const PLAYER_CROUCH_MUZZLE_LOWER_RATIO = 0.2;
const PLAYER_MUZZLE_BARREL_OFFSET = 7;
const PLAYER_FIRE_STAGGER_DELAY = 0.065;
const PLAYER_FIRE_PAIR_DELAY = 0.14;
const PROJECTILE_SURFACE_HIT_SHAKE = 4;
const PLAYER_HITBOX_WIDTH = 80;
const PLAYER_HITBOX_HEIGHT = 144;
const PLAYER_CROUCH_HITBOX_WIDTH = 82;
const PLAYER_CROUCH_HITBOX_HEIGHT = 123;
const PROJECTILE_MAX_RICOCHETS = 3;
const ENEMY_SPAWN_EDGE_MARGIN = 64;
const ENEMY_SPAWN_MIN_LENGTH = 104;
const ENEMY_SPAWN_SLOT_LENGTH = 235;
const ENEMY_SPAWN_MAX_SLOTS = 6;
const MID_BOSS_ENABLED = false;
const MID_BOSS = {
  width: 118,
  height: 96,
  hp: 28,
  verticalRange: 112,
  verticalSpeed: 118,
  activationRangeX: 760,
  activationRangeY: 620,
  laserSpeed: 520,
  score: 1800,
};
const MONSTER_TYPES = {
  monster1: {
    width: 64,
    height: 72,
    spriteWidth: 104,
    spriteHeight: 112,
    spriteBottomOffset: 14,
    hp: 3,
    speed: 72,
    chaseRange: 620,
    jumpAttackRange: 220,
    jumpLaunchSpeed: 410,
    jumpGravity: 1200,
    jumpMinHorizontalSpeed: 130,
    jumpMaxHorizontalSpeed: 300,
    jumpWindupDuration: 0.24,
    jumpRecoveryDuration: 0.18,
    jumpCooldown: 1.45,
    attackCooldown: 1,
    score: 100,
  },
};
const RUN_FRAME_WIDTH = 400;
const RUN_FRAME_HEIGHT = 500;
const RUN_FRAME_SEPARATOR = 2;
const PLAYER_RUN_FRAMES = Array.from({ length: 5 }, (_, frame) => ({
  x: frame * (RUN_FRAME_WIDTH + RUN_FRAME_SEPARATOR),
  y: 0,
  width: RUN_FRAME_WIDTH,
  height: RUN_FRAME_HEIGHT,
}));
const JUMP_FRAME_WIDTH = 400;
const JUMP_FRAME_HEIGHT = 500;
const JUMP_FRAME_SEPARATOR = 2;
const PLAYER_JUMP_FRAMES = Array.from({ length: 5 }, (_, frame) => ({
  x: frame * (JUMP_FRAME_WIDTH + JUMP_FRAME_SEPARATOR),
  y: 0,
  width: JUMP_FRAME_WIDTH,
  height: JUMP_FRAME_HEIGHT,
}));
const STAND_FRAME_WIDTH = 400;
const STAND_FRAME_HEIGHT = 500;
const STAND_FRAME_SEPARATOR = 2;
const PLAYER_STAND_FRAMES = Array.from({ length: 5 }, (_, frame) => ({
  x: frame * (STAND_FRAME_WIDTH + STAND_FRAME_SEPARATOR),
  y: 0,
  width: STAND_FRAME_WIDTH,
  height: STAND_FRAME_HEIGHT,
}));
const BLAST_FRAME_WIDTH = 400;
const BLAST_FRAME_HEIGHT = 500;
const BLAST_FRAME_SEPARATOR = 2;
const PLAYER_BLAST_FRAMES = Array.from({ length: 5 }, (_, frame) => ({
  x: frame * (BLAST_FRAME_WIDTH + BLAST_FRAME_SEPARATOR),
  y: 0,
  width: BLAST_FRAME_WIDTH,
  height: BLAST_FRAME_HEIGHT,
}));
const SIT_FRAME_WIDTH = 400;
const SIT_FRAME_HEIGHT = 500;
const SIT_FRAME_SEPARATOR = 2;
const PLAYER_SIT_FRAMES = Array.from({ length: 5 }, (_, frame) => ({
  x: frame * (SIT_FRAME_WIDTH + SIT_FRAME_SEPARATOR),
  y: 0,
  width: SIT_FRAME_WIDTH,
  height: SIT_FRAME_HEIGHT,
}));

function configureCanvasResolution(width, height) {
  WIDTH = width;
  HEIGHT = height;
  BASE_GROUND_Y = HEIGHT * BASE_GROUND_SCREEN_RATIO;
  CAMERA_DEAD_ZONE_LEFT = WIDTH * 0.12;
  CAMERA_DEAD_ZONE_RIGHT = WIDTH * 0.16;
  CAMERA_REVERSE_ZONE_LEFT = WIDTH - CAMERA_DEAD_ZONE_RIGHT;
  CAMERA_REVERSE_ZONE_RIGHT = WIDTH - CAMERA_DEAD_ZONE_LEFT;
  canvas.width = Math.round(WIDTH * RENDER_SCALE);
  canvas.height = Math.round(HEIGHT * RENDER_SCALE);
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
}

configureCanvasResolution(WIDTH, HEIGHT);
