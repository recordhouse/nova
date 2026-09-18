"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const TEST_MODE = /(?:^|[?&])test=1(?:&|$)/.test(window.location?.search ?? "");
const testControlsElement = document.querySelector("[data-test-controls]");
const testJumpPathButton = document.querySelector("[data-test-jump-path]");
const testResolutionButton = document.querySelector("[data-test-resolution]");
const testOrientationButton = document.querySelector("[data-test-orientation]");
const testPlayerAreaButton = document.querySelector("[data-test-player-area]");
const testMonsterAreaButton = document.querySelector("[data-test-monster-area]");
const testSpawnMonster1Button = document.querySelector("[data-test-spawn-monster1]");
const testSpawnMonster2Button = document.querySelector("[data-test-spawn-monster2]");
const gameShellElement = document.querySelector(".game-shell");
if (testControlsElement) testControlsElement.hidden = !TEST_MODE;

const TEST_RESOLUTION_SHORT_SIDES = [540, 720];
const DEFAULT_CANVAS_SHORT_SIDE = 720;

function viewportIsLandscape() {
  return window.matchMedia?.("(orientation: landscape)").matches ?? (
    window.innerWidth > window.innerHeight
  );
}

function canvasResolutionForOrientation(
  shortSide = DEFAULT_CANVAS_SHORT_SIDE,
  landscape = viewportIsLandscape(),
) {
  const longSide = Math.round(shortSide * 16 / 9);
  return landscape
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

const initialCanvasResolution = canvasResolutionForOrientation();
const BASE_GROUND_SCREEN_RATIO = 748 / 960;
let WIDTH = initialCanvasResolution.width;
let HEIGHT = initialCanvasResolution.height;
const RENDER_SCALE = 1;
let BASE_GROUND_Y = HEIGHT * BASE_GROUND_SCREEN_RATIO;
const GRAVITY = 2100;
const JUMP_SPEED = 950;
const PLAYER_MAX_FALL_SPEED = 760;
const JUMP_ANIMATION_DURATION = (JUMP_SPEED * 2) / GRAVITY;
const FIRE_AIM_ANGLE_DIAGONAL = Math.PI / 6;
const CURRENT_STAGE = 1;
const WORLD_LENGTH = 52000;
const LEVEL_GAP = 180;
const PLATFORM_DECK_THICKNESS = 16;
const RAMP_ANGLE_DEGREES = [20];
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
const MAIN_PATH_ROAD_CLEARANCE_Y = 32;
const MAIN_PATH_MAX_CONNECTION_HEIGHT = 380;
const MAP_LAYOUT_MAX_ATTEMPTS = 12;
const MAIN_PATH_MAX_GAP = 112;
const ROAD_BREAK_CHANCE = 0.94;
const ROAD_BREAK_MIN_GAP = 48;
const ROAD_BREAK_MIN_SECTION_LENGTH = 60;
const ROAD_BREAK_MAX_GAPS = 4;
const ROAD_GAP_LEVEL_OFFSETS = [-0.18, -0.14, -0.1, 0.1, 0.14];
const PLATFORM_FEATURE_MIN_LENGTH = 190;
const PLATFORM_FEATURE_SLOT_LENGTH = 200;
const PLATFORM_FEATURE_WIDTH_MIN = 92;
const PLATFORM_FEATURE_WIDTH_MAX = 156;
const PLATFORM_FEATURE_LARGE_WIDTH_MIN = 150;
const PLATFORM_FEATURE_LARGE_WIDTH_MAX = 240;
const ELECTRIC_WIRE_SEGMENTS = 14;
const ELECTRIC_WIRE_RADIUS = 3;
const ELECTRIC_WIRE_MAX_DROP = PLATFORM_FEATURE_WIDTH_MAX + PLATFORM_DECK_THICKNESS;
const ELECTRIC_WIRE_DAMAGE = 0.5;
const ELECTRIC_WIRE_INVINCIBILITY = 1.3;
const MAP_FLOW_DISTANCE_MIN = 1200;
const MAP_FLOW_DISTANCE_MAX = 3000;
const MAP_FLOW_REVERSE_CHANCE = 0.34;
const MAP_FLOW_VERTICAL_STREAK_CHANCE = 0.56;
const MAP_FLOW_VERTICAL_STREAK_MAX = 3;
const MAP_FLOW_VERTICAL_SOFT_LIMIT = 10;
const MAP_FLOW_TRANSITION_LEVEL_MIN = 1.15;
const MAP_FLOW_TRANSITION_LEVEL_MAX = 1.9;
const MAP_FLOW_TRANSITION_GAP_MIN = 42;
const MAP_FLOW_TRANSITION_GAP_MAX = 86;
const BOSS_GATE_WIDTH = 126;
const BOSS_GATE_HEIGHT = 184;
const BOSS_GATE_EDGE_INSET = 88;
const BOSS_GATE_TRIGGER_DISTANCE = 92;
const HORIZONTAL_JUMP_PATH_CHANCE = 0.42;
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
const FLOATING_PATH_TRIANGLE_ANGLES = [10];
const HORIZONTAL_JUMP_MIN_RUNWAY_LENGTH = 360;
const JUMP_RISE_PATH_CHANCE = 0.4;
const JUMP_DROP_PATH_CHANCE = 0.7;
const DIP_PATH_CHANCE = 0.36;
const DIP_PATH_FORCE_DISTANCE = 1250;
const DIP_PATH_DEPTH_LEVELS = [0.35, 0.5];
const DIP_PATH_ANGLE_DEGREES = [20];
const JUMP_RISE_GAP_MIN = 48;
const JUMP_RISE_GAP_MAX = 68;
const JUMP_RISE_LANDING_MIN = 170;
const JUMP_RISE_LANDING_MAX = 230;
const CAMERA_LOOK_RIGHT_ANCHOR_RATIO = 0.3;
const CAMERA_LOOK_LEFT_ANCHOR_RATIO = 0.7;
const CAMERA_LOOK_SWITCH_DELAY = 0.25;
const CAMERA_LOOK_MOVEMENT_SPEED_THRESHOLD = 32;
const CAMERA_HORIZONTAL_FOLLOW_SPEED = 10;
const CAMERA_MAX_PAN_SPEED_RATIO = 0.75;
const PLAYER_SPRITE_DRAW_HEIGHT = 149.6;
const PLAYER_STAND_SPRITE_SCALE = 1.12;
const PLAYER_BLAST_SPRITE_SCALE = 1.1;
const PLAYER_BLAST_HIGH_SPRITE_SCALE = PLAYER_BLAST_SPRITE_SCALE * 1.2;
const PLAYER_SIT_SPRITE_SCALE = 1;
const PLAYER_BLAST_SIT_SPRITE_SCALE = 0.972;
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
const PLAYER_BULLET_SPEED = 1520;
const PROJECTILE_SURFACE_HIT_SHAKE = 4;
const PLAYER_HITBOX_WIDTH = 70;
const PLAYER_HITBOX_HEIGHT = 144;
const PLAYER_CROUCH_HITBOX_WIDTH = 72;
const PLAYER_CROUCH_HITBOX_HEIGHT = 123;
const PROJECTILE_MAX_RICOCHETS = 5;
const COMBAT_DEBRIS_LIMIT = 180;
const ENEMY_SPAWN_EDGE_MARGIN = 64;
const ENEMY_SPAWN_MIN_PLATFORM_LENGTH = 132;
const ENEMY_SPAWN_MIN_LENGTH = 92;
const ENEMY_SPAWN_SLOT_LENGTH = 420;
const ENEMY_SPAWN_MAX_SLOTS = 5;
const ENEMY_SPAWN_DENSITY = 1;
const MONSTER1_SPAWN_COUNT_RATIO = 2 / 3;
const ENEMY_BODY_SEPARATION = 8;
const ENEMY_GROUP_MIN_SIZE = 2;
const ENEMY_GROUP_MAX_SIZE = 5;
const ENEMY_GROUP_EXTRA_MEMBER_CHANCE = 0.4;
const ENEMY_GROUP_MIN_SPACING = 76;
const ENEMY_GROUP_MAX_SPACING = 94;
const TURRET = {
  width: 108,
  height: 156,
  spriteWidth: 132,
  spriteHeight: 174,
  spriteBottomOffset: 3,
  hp: 15,
  activationRangeX: 980,
  activationRangeY: 660,
  fireInterval: 6.6,
  chargeDuration: 0.95,
  laserSpeed: 420,
  laserRadius: 10,
  laserRicochets: 5,
  spawnMinPlatformLength: 320,
  spawnEdgeMargin: 90,
  spawnChance: 0.48,
  minimumSeparation: 520,
  score: 350,
};
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
    displayName: "몹1",
    width: 64,
    height: 72,
    spriteWidth: 104,
    spriteHeight: 112,
    spriteBottomOffset: 14,
    hp: 2,
    speed: 128,
    chaseRange: 900,
    chaseVerticalRange: 300,
    climbSearchRange: 1400,
    climbVerticalRange: 720,
    climbMinimumHeight: 34,
    jumpAttackRange: 180,
    jumpAttackVerticalRange: 72,
    jumpLandingVerticalRange: 72,
    dropAttackRange: 720,
    dropAttackMinHeight: 90,
    dropAttackMaxHeight: 720,
    dropAttackHorizontalDistance: 72,
    dropAttackLaunchSpeed: 150,
    dropLandingClearance: 30,
    walkableStepHeight: 20,
    jumpGapRange: 140,
    jumpGapMaxRise: LEVEL_GAP + 12,
    jumpGapMaxDrop: 72,
    jumpGapMinHorizontalSpeed: 90,
    climbJumpLaunchSpeed: 680,
    jumpLaunchSpeed: 440,
    jumpGravity: 1150,
    jumpMinHorizontalSpeed: 70,
    jumpMaxHorizontalSpeed: 290,
    jumpWindupDuration: 0.12,
    jumpRecoveryDuration: 0.1,
    jumpCooldown: 0.7,
    attackCooldown: 0.65,
    hitDuration: 0.2,
    hitKnockbackSpeed: 360,
    hitKnockbackMaxSpeed: 600,
    hitKnockbackDamping: 9.5,
    hitAirImpulse: 90,
    score: 100,
  },
  monster2: {
    displayName: "몹2",
    width: 132,
    height: 138,
    spriteWidth: 174,
    spriteHeight: 234,
    spriteBottomOffset: 12,
    spriteFacing: -1,
    hp: 10,
    speed: 76,
    chaseRange: 760,
    chaseVerticalRange: 100,
    walkableStepHeight: 18,
    attackRange: 500,
    attackVerticalRange: 105,
    inhaleDuration: 0.9,
    flameDuration: 2,
    flameLength: 490,
    flameRampDuration: 0.45,
    flameRise: 42,
    flameNearHalfHeight: 18,
    flameFarHalfHeight: 52,
    flameMouthForwardOffset: 51,
    flameMouthHeight: 87,
    attackCooldown: 2.4,
    hitDuration: 0.24,
    hitKnockbackSpeed: 230,
    hitKnockbackMaxSpeed: 360,
    hitKnockbackDamping: 11,
    hitAirImpulse: 0,
    spawnChance: 0.45,
    spawnMinPlatformLength: 420,
    score: 300,
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
  canvas.width = Math.round(WIDTH * RENDER_SCALE);
  canvas.height = Math.round(HEIGHT * RENDER_SCALE);
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
}

configureCanvasResolution(WIDTH, HEIGHT);
