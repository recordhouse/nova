"use strict";

// Shared mutable runtime state.

const controls = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
};
const keyboardControls = { ...controls };
const joystickControls = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
};
const activeControlPointers = new Map();
let movementJoystickElement = null;
let movementJoystickKnob = null;
let movementJoystickPointerId = null;
let movementJoystickOriginX = 0;
let movementJoystickOriginY = 0;

const player = {
  x: 110,
  y: BASE_GROUND_Y - 80,
  width: 44,
  height: 80,
  vx: 0,
  vy: 0,
  speed: 245,
  reversalDirection: 0,
  reversalSparkTimer: 0,
  facing: 1,
  grounded: true,
  fireTimer: 0,
  fireAnimationTime: 0,
  fireBarrel: 0,
  fireWasActive: false,
  fireEnergy: PLAYER_FIRE_ENERGY_MAX,
  invincible: 0,
  downPhase: "",
  downTime: 0,
  hp: 3,
  score: 0,
  crouching: false,
  platform: null,
  jumpLatch: false,
  jumpCount: 0,
  airJumpAvailable: true,
  jumpAnimationTime: 0,
  fallReferenceY: BASE_GROUND_Y,
  deepFalling: false,
  fallAnimationTime: 0,
};

function playerIsDown() {
  return player.downPhase === "fall" || player.downPhase === "hold";
}

function resetPlayerDownState() {
  player.downPhase = "";
  player.downTime = 0;
}

const bullets = [];
const enemyBullets = [];
const particles = [];
const enemies = [];
const turrets = [];
const midBosses = [];
const stars = [];
const platforms = [];
const branches = [];

let cameraX = 0;
let cameraY = 0;
let cameraLookDirection = 1;
let cameraPendingDirection = 0;
let cameraDirectionHoldTime = 0;
let previousTime = performance.now();
let gameTime = 0;
let shake = 0;
let gameOver = false;
let mapSeed = 0;
let mapRandom = Math.random;
let nextPlatformId = 1;
let lowestPlatformY = BASE_GROUND_Y;
let minWorldX = -200;
let maxWorldX = WIDTH;
let goalPlatform = null;
let goalX = 0;
let bossDoor = null;
let jumpQueued = false;
let showPlayerArea = false;
let showMonsterArea = false;
let showFullMap = false;
let testInvincibility = false;
let testOrientationOverride = null;
let testJumpRouteIndex = -1;
let testResolutionPresetIndex = TEST_RESOLUTION_SHORT_SIDES.indexOf(
  Math.min(WIDTH, HEIGHT),
);
if (testResolutionPresetIndex < 0) testResolutionPresetIndex = 0;
