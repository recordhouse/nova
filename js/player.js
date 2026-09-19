"use strict";

// Player movement, jumping, crouching, and camera tracking.

function cameraAnchorScreenX(direction = cameraLookDirection) {
  const anchorRatio = direction > 0
    ? CAMERA_LOOK_RIGHT_ANCHOR_RATIO
    : CAMERA_LOOK_LEFT_ANCHOR_RATIO;
  return WIDTH * anchorRatio;
}

function updateCameraLookDirection(dt) {
  const movementDirection = Math.abs(player.vx) >= CAMERA_LOOK_MOVEMENT_SPEED_THRESHOLD
    ? Math.sign(player.vx)
    : 0;

  if (movementDirection === 0 || movementDirection === cameraLookDirection) {
    cameraPendingDirection = 0;
    cameraDirectionHoldTime = 0;
    return;
  }

  if (movementDirection !== cameraPendingDirection) {
    cameraPendingDirection = movementDirection;
    cameraDirectionHoldTime = dt;
  } else {
    cameraDirectionHoldTime += dt;
  }

  if (cameraDirectionHoldTime < CAMERA_LOOK_SWITCH_DELAY) return;
  cameraLookDirection = cameraPendingDirection;
  cameraPendingDirection = 0;
  cameraDirectionHoldTime = 0;
}

function updateElectricWires() {
  if (gameOver || player.hp <= 0 || player.invincible > 0 || playerIsDown() ||
      (TEST_MODE && testInvincibility)) return;
  const hitbox = getPlayerHitbox();
  for (const platform of platforms) {
    if (
      !platform.features?.length ||
      platform.y + PLATFORM_DECK_THICKNESS - 3 > hitbox.y + hitbox.height + ELECTRIC_WIRE_RADIUS ||
      platform.y + ELECTRIC_WIRE_MAX_DROP < hitbox.y - ELECTRIC_WIRE_RADIUS
    ) continue;
    for (const feature of platform.features) {
      if (
        feature.type !== "electric-hose" ||
        feature.centerX + feature.width < hitbox.x - ELECTRIC_WIRE_RADIUS ||
        feature.centerX - feature.width > hitbox.x + hitbox.width + ELECTRIC_WIRE_RADIUS
      ) continue;
      if (!electricWireHitsRect(electricWirePoints(platform, feature), hitbox)) continue;
      takePlayerDamage(ELECTRIC_WIRE_DAMAGE);
      shake = Math.max(shake, 8);
      burst(hitbox.x + hitbox.width / 2, hitbox.y + hitbox.height / 2, "#e7fdff", 14, 170);
      return;
    }
  }
}

function updatePlayerDown(dt) {
  if (!playerIsDown()) return;
  const totalDuration = PLAYER_DOWN_ANIMATION_DURATION + PLAYER_DOWN_HOLD_DURATION;
  player.downTime += dt;
  if (player.downTime < PLAYER_DOWN_ANIMATION_DURATION) return;
  player.downPhase = "hold";
  if (player.downTime < totalDuration - 1e-9) return;
  const remainingDt = Math.max(0, player.downTime - totalDuration);
  player.downTime = totalDuration;
  if (player.hp <= 0 || gameOver) {
    player.downPhase = "defeated";
    return;
  }
  resetPlayerDownState();
  player.invincible = Math.max(0, PLAYER_REVIVAL_INVINCIBILITY - remainingDt);
  player.jumpAnimationTime = 0;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  emitPlayerRevival();
}

function approachPlayerSpeed(value, target, maximumChange) {
  if (value < target) return Math.min(target, value + maximumChange);
  return Math.max(target, value - maximumChange);
}

function emitPlayerReversalSparks(dt, brakingDirection) {
  if (!brakingDirection || !player.grounded) return;
  player.reversalSparkTimer -= dt;
  if (player.reversalSparkTimer > 0) return;
  player.reversalSparkTimer = PLAYER_REVERSAL_SPARK_INTERVAL;

  const footX = player.x + player.width / 2;
  const footY = player.y + player.height - 4;
  for (let spark = 0; spark < 2; spark += 1) {
    const life = 0.1 + Math.random() * 0.11;
    particles.push({
      x: footX + (Math.random() - 0.5) * player.width * 0.75,
      y: footY - Math.random() * 4,
      vx: -brakingDirection * (65 + Math.random() * 80),
      vy: -35 - Math.random() * 65,
      gravity: 420,
      life,
      maxLife: life,
      size: 2 + Math.random() * 2,
      color: spark === 0 ? "#b45cff" : "#e7cbff",
      reversalSpark: true,
    });
  }
}

function updatePlayer(dt) {
  const downForThisFrame = playerIsDown();
  player.invincible = Math.max(0, player.invincible - dt);
  player.fireEnergy = Math.min(
    PLAYER_FIRE_ENERGY_MAX,
    player.fireEnergy + PLAYER_FIRE_ENERGY_REGEN_PER_SECOND * dt,
  );
  updatePlayerDown(dt);
  const jumpInputActive = controls.jump || controls.up;
  const jumpPressed = !downForThisFrame && (jumpQueued || (jumpInputActive && !player.jumpLatch));
  jumpQueued = false;
  player.jumpLatch = jumpInputActive;
  player.crouching = !downForThisFrame && controls.down && player.grounded;
  const canStartJump = (
    jumpPressed &&
    !controls.fire &&
    !player.crouching &&
    (player.grounded || player.airJumpAvailable)
  );
  const horizontalInput = downForThisFrame ? 0 : Number(controls.right) - Number(controls.left);
  const preserveAirMomentum = !downForThisFrame && controls.fire && !player.grounded;
  const move = player.crouching || controls.fire
    ? 0
    : horizontalInput;
  const canReverseOnGround = player.grounded && !canStartJump && move !== 0;
  if (!canReverseOnGround ||
      (player.reversalDirection !== 0 && player.reversalDirection !== move)) {
    player.reversalDirection = 0;
    player.reversalSparkTimer = 0;
  }
  if (canReverseOnGround && player.reversalDirection === 0 &&
      Math.sign(player.vx) === -move && Math.abs(player.vx) >= PLAYER_REVERSAL_MIN_SPEED) {
    player.reversalDirection = move;
    player.reversalSparkTimer = 0;
  }
  let brakingDirection = 0;
  if (!preserveAirMomentum) {
    if (player.reversalDirection === move && canReverseOnGround) {
      const previousVx = player.vx;
      const braking = Math.sign(previousVx) === -move;
      const acceleration = braking ? PLAYER_REVERSAL_BRAKE : PLAYER_REVERSAL_ACCELERATION;
      player.vx = approachPlayerSpeed(previousVx, move * player.speed, acceleration * dt);
      if (braking) brakingDirection = Math.sign(previousVx);
      if (player.vx === move * player.speed) {
        player.reversalDirection = 0;
      }
    } else {
      player.vx = move * player.speed;
    }
  }

  const stationaryTurn = player.crouching || controls.fire
    ? horizontalInput
    : 0;
  const turnDirection = move || stationaryTurn;
  if (turnDirection !== 0) {
    player.facing = Math.sign(turnDirection);
  }

  if (canStartJump) {
    const isAirJump = !player.grounded;
    if (!isAirJump || !Number.isFinite(player.fallReferenceY)) {
      player.fallReferenceY = player.y + player.height;
    }
    player.vy = -JUMP_SPEED;
    player.grounded = false;
    player.platform = null;
    player.jumpCount = isAirJump ? 2 : 1;
    player.airJumpAvailable = !isAirJump;
    player.jumpAnimationTime = 0;
    player.deepFalling = false;
    player.fallAnimationTime = 0;
    if (isAirJump) {
      burst(player.x + player.width / 2, player.y + player.height, "#77e7ff", 9, 125);
    }
  }

  const previousBottom = player.y + player.height;
  player.x = Math.max(
    minWorldX,
    Math.min(maxWorldX - player.width, player.x + player.vx * dt),
  );
  const playerCenterX = player.x + player.width / 2;

  if (player.grounded) {
    if (
      player.platform &&
      playerCenterX >= player.platform.start &&
      playerCenterX <= player.platform.end
    ) {
      player.y = platformSurfaceY(player.platform, playerCenterX) - player.height;
      player.fallReferenceY = player.y + player.height;
    } else {
      const currentFeetY = player.y + player.height;
      const connectedPlatform = platformsAt(playerCenterX)
        .map((platform) => ({
          platform,
          surfaceY: platformSurfaceY(platform, playerCenterX),
        }))
        .sort(
          (a, b) => Math.abs(a.surfaceY - currentFeetY) - Math.abs(b.surfaceY - currentFeetY),
        )
        .find((candidate) => Math.abs(candidate.surfaceY - currentFeetY) <= 14);
      if (connectedPlatform) {
        player.platform = connectedPlatform.platform;
        player.y = connectedPlatform.surfaceY - player.height;
        player.fallReferenceY = connectedPlatform.surfaceY;
      } else {
        player.fallReferenceY = currentFeetY;
        player.deepFalling = false;
        player.fallAnimationTime = 0;
        player.platform = null;
        player.grounded = false;
        player.jumpCount = Math.max(1, player.jumpCount);
        player.airJumpAvailable = true;
      }
    }
  }

  if (!player.grounded) {
    player.crouching = false;
    player.jumpAnimationTime += dt;
    player.vy = Math.min(PLAYER_MAX_FALL_SPEED, player.vy + GRAVITY * dt);
    player.y += player.vy * dt;
    if (!Number.isFinite(player.fallReferenceY)) {
      player.fallReferenceY = previousBottom;
    }
    const currentBottom = player.y + player.height;
    const deepFalling = (
      player.vy > 0 &&
      currentBottom > player.fallReferenceY + PLAYER_DEEP_FALL_THRESHOLD
    );
    if (deepFalling) {
      player.fallAnimationTime = player.deepFalling
        ? player.fallAnimationTime + dt
        : 0;
    } else {
      player.fallAnimationTime = 0;
    }
    player.deepFalling = deepFalling;

    if (player.vy >= 0) {
      const landing = platformsAt(playerCenterX)
        .map((platform) => ({
          platform,
          surfaceY: platformSurfaceY(platform, playerCenterX),
        }))
        .sort((a, b) => a.surfaceY - b.surfaceY)
        .find((candidate) => (
          previousBottom <= candidate.surfaceY + 7 &&
          currentBottom >= candidate.surfaceY
        ));
      if (landing) {
        player.y = landing.surfaceY - player.height;
        player.vy = 0;
        player.grounded = true;
        player.platform = landing.platform;
        player.jumpCount = 0;
        player.airJumpAvailable = true;
        player.fallReferenceY = landing.surfaceY;
        player.deepFalling = false;
        player.fallAnimationTime = 0;
      }
    }
  }

  emitPlayerReversalSparks(dt, brakingDirection);

  const firing = !downForThisFrame && controls.fire;
  const startedFiring = firing && !player.fireWasActive;
  if (startedFiring) {
    player.fireBarrel = 0;
    player.fireTimer = 0;
  }
  player.fireWasActive = firing;
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  const firingPose = firing && (
    player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT || player.fireTimer > 0
  );
  player.fireAnimationTime = firingPose ? player.fireAnimationTime + dt : 0;
  if (firing && player.fireTimer <= 0 && player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT) {
    shootPlayer();
  }

  updateCameraLookDirection(dt);
  let targetCameraX = playerCenterX - cameraAnchorScreenX();
  targetCameraX = Math.max(minWorldX, Math.min(maxWorldX - WIDTH, targetCameraX));
  const cameraDistance = targetCameraX - cameraX;
  const easedCameraStep = cameraDistance * (
    1 - Math.exp(-dt * CAMERA_HORIZONTAL_FOLLOW_SPEED)
  );
  const maximumCameraStep = WIDTH * CAMERA_MAX_PAN_SPEED_RATIO * dt;
  cameraX += Math.max(
    -maximumCameraStep,
    Math.min(maximumCameraStep, easedCameraStep),
  );
  const playerFeetY = player.y + player.height;
  const targetCameraY = playerFeetY - BASE_GROUND_Y;
  cameraY += (targetCameraY - cameraY) * Math.min(1, dt * 4.2);

  if (player.y > lowestPlatformY + 430) gameOver = true;
}
