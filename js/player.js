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

function updatePlayer(dt) {
  const jumpInputActive = controls.jump || controls.up;
  const jumpPressed = jumpQueued || (jumpInputActive && !player.jumpLatch);
  jumpQueued = false;
  player.jumpLatch = jumpInputActive;
  player.crouching = controls.down && player.grounded;
  const canStartJump = (
    jumpPressed &&
    !controls.fire &&
    !player.crouching &&
    (player.grounded || player.airJumpAvailable)
  );
  const horizontalInput = Number(controls.right) - Number(controls.left);
  const preserveAirMomentum = controls.fire && !player.grounded;
  const move = player.crouching || controls.fire
    ? 0
    : horizontalInput;
  if (!preserveAirMomentum) {
    player.vx = move * player.speed;
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

  const startedFiring = controls.fire && !player.fireWasActive;
  if (startedFiring) {
    player.fireBarrel = 0;
    player.fireTimer = 0;
  }
  player.fireWasActive = controls.fire;
  player.fireTimer -= dt;
  player.fireAnimationTime = controls.fire ? player.fireAnimationTime + dt : 0;
  player.invincible = Math.max(0, player.invincible - dt);
  if (controls.fire && player.fireTimer <= 0) shootPlayer();

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
