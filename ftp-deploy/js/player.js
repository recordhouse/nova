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
  const nearbyPlatforms = typeof platformsBetween === "function"
    ? platformsBetween(
      hitbox.x - ELECTRIC_WIRE_RADIUS,
      hitbox.x + hitbox.width + ELECTRIC_WIRE_RADIUS,
    )
    : platforms;
  for (const platform of nearbyPlatforms) {
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
      const wirePoints = electricWirePoints(platform, feature);
      if (!electricWireHitsRect(wirePoints, hitbox)) continue;
      const playerCenterX = hitbox.x + hitbox.width / 2;
      const contactPoint = wirePoints.reduce((nearest, point) =>
        Math.abs(point.x - playerCenterX) < Math.abs(nearest.x - playerCenterX)
          ? point
          : nearest);
      const damageApplied = takePlayerDamage(ELECTRIC_WIRE_DAMAGE, {
        kind: "electric-wire",
        x: contactPoint.x,
        y: contactPoint.y,
        width: 0,
        height: 0,
      });
      if (damageApplied) {
        shake = Math.max(shake, 8);
        burst(hitbox.x + hitbox.width / 2, hitbox.y + hitbox.height / 2, "#e7fdff", 14, 170);
      }
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
    if (typeof stopPlayerDownVideo === "function") stopPlayerDownVideo();
    return;
  }
  resetPlayerDownState();
  if (typeof stopPlayerDownVideo === "function") stopPlayerDownVideo();
  player.invincible = Math.max(0, PLAYER_REVIVAL_INVINCIBILITY - remainingDt);
  player.jumpAnimationTime = 0;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  if (typeof playResurrectionSound === "function") playResurrectionSound();
  if (typeof playFemaleResurrectionVoice === "function") {
    playFemaleResurrectionVoice();
  }
  emitPlayerRevival();
}

function approachPlayerSpeed(value, target, maximumChange) {
  if (value < target) return Math.min(target, value + maximumChange);
  return Math.max(target, value - maximumChange);
}

function playerFootSupports(centerX) {
  const halfFootWidth = PLAYER_LANDING_FOOT_WIDTH / 2;
  const footLeft = centerX - halfFootWidth;
  const footRight = centerX + halfFootWidth;
  return platformsBetween(footLeft, footRight).flatMap((platform) => {
    const overlapLeft = Math.max(footLeft, platform.start);
    const overlapRight = Math.min(footRight, platform.end);
    if (overlapRight - overlapLeft < PLAYER_LANDING_MIN_SUPPORT_WIDTH) return [];
    const contactX = Math.max(
      platform.start,
      Math.min(platform.end, centerX),
    );
    return [{
      platform,
      contactX,
      surfaceY: platformSurfaceY(platform, contactX),
    }];
  });
}

function playerAccelerationProgress() {
  return Math.max(0, Math.min(1, (
    player.runSpeed - player.speed
  ) / Math.max(1, PLAYER_RUN_MAX_SPEED - player.speed)));
}

function accelerationShieldStageForProgress(progress) {
  if (progress >= PLAYER_ACCELERATION_SHIELD_STAGE_3_PROGRESS) return 3;
  if (progress >= PLAYER_ACCELERATION_SHIELD_STAGE_2_PROGRESS) return 2;
  if (progress >= PLAYER_ACCELERATION_SHIELD_STAGE_1_PROGRESS) return 1;
  return 0;
}

function smoothShieldStep(edgeStart, edgeEnd, value) {
  const progress = Math.max(0, Math.min(1, (
    value - edgeStart
  ) / Math.max(0.0001, edgeEnd - edgeStart)));
  return progress * progress * (3 - 2 * progress);
}

function updatePlayerAccelerationShield(dt) {
  player.accelerationShieldHitTimer = Math.max(
    0,
    player.accelerationShieldHitTimer - dt,
  );
  player.accelerationShieldBlockTimer = Math.max(
    0,
    player.accelerationShieldBlockTimer - dt,
  );

  const progress = playerIsDown() ? 0 : playerAccelerationProgress();
  const stage = accelerationShieldStageForProgress(progress);
  if (stage === 0 && progress < 0.04) {
    player.accelerationShieldStage = 0;
    player.accelerationShieldCharges = 0;
  } else if (stage > player.accelerationShieldStage) {
    player.accelerationShieldCharges = Math.min(
      3,
      player.accelerationShieldCharges + stage - player.accelerationShieldStage,
    );
    player.accelerationShieldStage = stage;
  }

  const stageOneVisual = smoothShieldStep(
    PLAYER_ACCELERATION_SHIELD_STAGE_1_PROGRESS * 0.72,
    PLAYER_ACCELERATION_SHIELD_STAGE_1_PROGRESS,
    progress,
  );
  const stageTwoVisual = smoothShieldStep(
    PLAYER_ACCELERATION_SHIELD_STAGE_2_PROGRESS * 0.82,
    PLAYER_ACCELERATION_SHIELD_STAGE_2_PROGRESS,
    progress,
  );
  const stageThreeVisual = smoothShieldStep(
    PLAYER_ACCELERATION_SHIELD_STAGE_3_PROGRESS * 0.86,
    PLAYER_ACCELERATION_SHIELD_STAGE_3_PROGRESS,
    progress,
  );
  const targetVisual = Math.min(
    player.accelerationShieldCharges,
    stageOneVisual + stageTwoVisual + stageThreeVisual,
  );
  const blend = 1 - Math.exp(-PLAYER_ACCELERATION_SHIELD_VISUAL_SPEED * dt);
  player.accelerationShieldVisual += (
    targetVisual - player.accelerationShieldVisual
  ) * blend;
  if (Math.abs(player.accelerationShieldVisual - targetVisual) < 0.002) {
    player.accelerationShieldVisual = targetVisual;
  }
}

function emitPlayerReversalSparks(dt, brakingDirection) {
  if (!brakingDirection || !player.grounded) {
    player.reversalSparkTimer = 0;
    return;
  }
  player.reversalSparkTimer -= dt;
  if (player.reversalSparkTimer > 0) return;
  player.reversalSparkTimer = PLAYER_REVERSAL_SPARK_INTERVAL;

  const footX = player.x + player.width / 2;
  const footY = player.y + player.height - 4;
  for (let spark = 0; spark < 2; spark += 1) {
    const life = 0.14 + Math.random() * 0.11;
    particles.push({
      x: footX + (Math.random() - 0.5) * player.width * 0.9,
      y: footY - Math.random() * 7,
      vx: -brakingDirection * (95 + Math.random() * 95),
      vy: -50 - Math.random() * 80,
      gravity: 420,
      life,
      maxLife: life,
      size: 4.5 + Math.random() * 3,
      color: spark === 0 ? "#b45cff" : "#e7cbff",
      reversalSpark: true,
    });
  }
}

function updatePlayerRunAnimation(dt) {
  const running = (
    !playerIsDown() && player.grounded && !player.crouching &&
    Math.abs(player.vx) > 1
  );
  if (!running) {
    player.runAnimationTime = 0;
    return;
  }
  const speedRatio = Math.min(
    PLAYER_RUN_MAX_SPEED / PLAYER_RUN_SPEED,
    Math.abs(player.vx) / PLAYER_RUN_SPEED,
  );
  player.runAnimationTime = (player.runAnimationTime + dt * speedRatio) % 1000;
}

function syncPlayerGunVideoPlayback(firing) {
  const shouldPlay = Boolean(firing);
  if (player.fireVideoActive === shouldPlay) return;
  player.fireVideoActive = shouldPlay;
  if (shouldPlay) {
    if (typeof playPlayerGunVideo === "function") playPlayerGunVideo();
  } else if (typeof stopPlayerGunVideo === "function") {
    stopPlayerGunVideo();
  }
}

function syncPlayerRunVideoPlayback(running) {
  const shouldPlay = Boolean(running);
  if (player.runVideoActive === shouldPlay) return;
  player.runVideoActive = shouldPlay;
  if (shouldPlay) {
    if (typeof playPlayerRunVideo === "function") playPlayerRunVideo();
  } else if (typeof stopPlayerRunVideo === "function") {
    stopPlayerRunVideo();
  }
}

function syncPlayerStandVideoPlayback(standing) {
  const shouldPlay = Boolean(standing);
  if (player.standVideoActive === shouldPlay) return;
  player.standVideoActive = shouldPlay;
  if (shouldPlay) {
    if (typeof playPlayerStandVideo === "function") playPlayerStandVideo();
  } else if (typeof stopPlayerStandVideo === "function") {
    stopPlayerStandVideo();
  }
}

function updatePlayerCamera(dt) {
  const playerCenterX = player.x + player.width / 2;
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
  const crouchLookingDown = (
    controls.down && player.grounded && !playerIsDown() &&
    !player.ultimateActive
  );
  if (crouchLookingDown) {
    player.crouchCameraLookTime = Math.min(
      PLAYER_CROUCH_CAMERA_LOOK_DELAY + PLAYER_CROUCH_CAMERA_LOOK_BLEND_DURATION,
      (player.crouchCameraLookTime ?? 0) + dt,
    );
  } else {
    player.crouchCameraLookTime = 0;
  }
  const lookDownProgress = Math.max(0, Math.min(
    1,
    (player.crouchCameraLookTime - PLAYER_CROUCH_CAMERA_LOOK_DELAY) /
      PLAYER_CROUCH_CAMERA_LOOK_BLEND_DURATION,
  ));
  const easedLookDownProgress = lookDownProgress * lookDownProgress *
    (3 - 2 * lookDownProgress);
  const lookDownDistance = Math.min(
    PLAYER_CROUCH_CAMERA_LOOK_MAX_DISTANCE,
    HEIGHT * PLAYER_CROUCH_CAMERA_LOOK_DISTANCE_RATIO,
  ) * easedLookDownProgress;
  const playerFeetY = player.y + player.height;
  const targetCameraY = playerFeetY - BASE_GROUND_Y + lookDownDistance;
  cameraY += (targetCameraY - cameraY) * Math.min(1, dt * 4.2);
}

function updatePlayerUltimate(dt) {
  player.ultimateTime += dt;
  const liftProgress = Math.min(
    1,
    player.ultimateTime / PLAYER_ULTIMATE_LIFT_DURATION,
  );
  const easedLift = 1 - (1 - liftProgress) ** 3;
  player.y = liftProgress < 1
    ? player.ultimateStartY +
      (player.ultimateTargetY - player.ultimateStartY) * easedLift
    : player.ultimateTargetY + Math.sin(
      (player.ultimateTime - PLAYER_ULTIMATE_LIFT_DURATION) *
      PLAYER_ULTIMATE_FLOAT_SPEED,
    ) * PLAYER_ULTIMATE_FLOAT_AMPLITUDE;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.platform = null;
  player.crouching = false;
  player.crouchInputTime = 0;
  player.deepFalling = false;
  player.jumpAnimationTime += dt;
  player.fireWasActive = false;
  player.fireAnimationTime = 0;
  syncPlayerGunVideoPlayback(false);
  syncPlayerRunVideoPlayback(false);
  syncPlayerStandVideoPlayback(false);

  updatePlayerUltimateLaserSweep();
  if (player.ultimateTime < PLAYER_ULTIMATE_DURATION) return;

  player.ultimateActive = false;
  player.ultimateTime = 0;
  player.ultimateImpactSoundGroup = null;
  player.vy = 0;
  player.jumpCount = 1;
  player.airJumpAvailable = true;
  player.fallReferenceY = player.y + player.height;
}

function updatePlayer(dt) {
  const downForThisFrame = playerIsDown();
  const playerControlActive = (
    controls.left || controls.right || controls.up || controls.down ||
    controls.jump || controls.fire || controls.ultimate
  );
  if (!downForThisFrame && !gameOver && !player.voiceControlStarted &&
      playerControlActive) {
    player.voiceControlStarted = true;
    if (typeof playFemaleStartVoice === "function") playFemaleStartVoice();
  }
  const knockbackDt = downForThisFrame
    ? Math.min(dt, player.hitKnockbackTime)
    : 0;
  let hitKnockbackDistance = 0;
  if (knockbackDt > 0) {
    const decay = Math.exp(-PLAYER_HIT_KNOCKBACK_DAMPING * knockbackDt);
    hitKnockbackDistance = player.hitKnockbackVelocity *
      (1 - decay) / PLAYER_HIT_KNOCKBACK_DAMPING;
    player.hitKnockbackVelocity *= decay;
    player.hitKnockbackTime = Math.max(0, player.hitKnockbackTime - dt);
    if (player.hitKnockbackTime === 0) player.hitKnockbackVelocity = 0;
  }
  player.invincible = Math.max(0, player.invincible - dt);
  player.fireEnergy = Math.min(
    PLAYER_FIRE_ENERGY_MAX,
    player.fireEnergy + PLAYER_FIRE_ENERGY_REGEN_PER_SECOND * dt,
  );
  updatePlayerDown(dt);
  const ultimateInputStarted = controls.ultimate && !player.ultimateWasActive;
  player.ultimateWasActive = controls.ultimate;
  if (ultimateInputStarted) startPlayerUltimate();
  if (player.ultimateActive) {
    updatePlayerUltimate(dt);
    updatePlayerCamera(dt);
    return;
  }
  const jumpInputActive = controls.jump;
  const jumpInputStarted = jumpQueued || (jumpInputActive && !player.jumpLatch);
  jumpQueued = false;
  player.jumpLatch = jumpInputActive;
  if (downForThisFrame) {
    player.jumpBufferTimer = 0;
  } else if (jumpInputStarted) {
    // Up is reserved for high aim; only the dedicated jump input buffers a jump.
    player.jumpBufferTimer = PLAYER_JUMP_BUFFER_TIME;
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  }
  if (player.grounded) {
    player.coyoteTime = PLAYER_COYOTE_TIME;
  } else {
    player.coyoteTime = Math.max(0, player.coyoteTime - dt);
  }
  const horizontalInput = downForThisFrame
    ? 0
    : Number(controls.right) - Number(controls.left);
  const continuingRunWithDown = (
    !downForThisFrame && controls.down && player.grounded &&
    Math.abs(player.vx) > 1
  );
  const crouchInputEligible = (
    !downForThisFrame && controls.down && player.grounded &&
    !continuingRunWithDown
  );
  player.crouchInputTime = crouchInputEligible
    ? Math.min(
      PLAYER_CROUCH_INPUT_DELAY,
      (player.crouchInputTime ?? 0) + dt,
    )
    : 0;
  player.crouching = (
    crouchInputEligible &&
    player.crouchInputTime >= PLAYER_CROUCH_INPUT_DELAY - 1e-9
  );
  const canUseCoyoteJump = (
    !player.grounded &&
    player.jumpCount === 0 &&
    player.coyoteTime > 0
  );
  const canStartJump = (
    player.jumpBufferTimer > 0 &&
    !controls.fire &&
    !player.crouching &&
    (player.grounded || canUseCoyoteJump || player.airJumpAvailable)
  );
  const preservedDownRunDirection = continuingRunWithDown && horizontalInput === 0
    ? Math.sign(player.vx)
    : horizontalInput;
  const groundFireAction = (
    !downForThisFrame && controls.fire && player.grounded &&
    !PLAYER_RUNNING_FIRE_ENABLED
  );
  const move = player.crouching || groundFireAction
    ? 0
    : preservedDownRunDirection;
  const canReverseOnGround = player.grounded && !canStartJump && move !== 0;
  const canStopSkid = (
    player.grounded && !canStartJump && !downForThisFrame &&
    !player.crouching && !groundFireAction && horizontalInput === 0
  );
  player.reversalGraceTimer = Math.max(0, player.reversalGraceTimer - dt);
  if (groundFireAction) {
    player.reversalDirection = 0;
    player.recentRunDirection = 0;
    player.recentRunSpeed = 0;
    player.reversalGraceTimer = 0;
  }
  if (player.reversalGraceTimer === 0) {
    player.recentRunDirection = 0;
    player.recentRunSpeed = 0;
  }
  if (!canReverseOnGround ||
      (player.reversalDirection !== 0 && player.reversalDirection !== move)) {
    player.reversalDirection = 0;
  }
  const reversingCurrentVelocity = (
    Math.sign(player.vx) === -move &&
    Math.abs(player.vx) >= PLAYER_REVERSAL_MIN_SPEED
  );
  const reversingRecentRun = (
    player.reversalGraceTimer > 0 &&
    player.recentRunDirection === -move &&
    player.recentRunSpeed >= PLAYER_REVERSAL_MIN_SPEED
  );
  if (canReverseOnGround && player.reversalDirection === 0 &&
      (reversingCurrentVelocity || reversingRecentRun)) {
    if (!reversingCurrentVelocity) {
      player.vx = player.recentRunDirection * player.recentRunSpeed;
    }
    player.reversalDirection = move;
    player.reversalSparkTimer = 0;
    player.runSpeed = player.speed;
    player.recentRunDirection = 0;
    player.recentRunSpeed = 0;
    player.reversalGraceTimer = 0;
  }
  let brakingDirection = 0;
  if (knockbackDt > 0) {
    player.vx = dt > 0 ? hitKnockbackDistance / dt : 0;
  } else if (player.grounded) {
    if (groundFireAction) {
      player.vx = 0;
      player.runSpeed = player.speed;
    } else if (player.reversalDirection === move && canReverseOnGround) {
      const previousVx = player.vx;
      const braking = Math.sign(previousVx) === -move;
      const acceleration = braking ? PLAYER_REVERSAL_BRAKE : PLAYER_REVERSAL_ACCELERATION;
      player.vx = approachPlayerSpeed(previousVx, move * player.speed, acceleration * dt);
      if (braking) brakingDirection = Math.sign(previousVx);
      if (player.vx === move * player.speed) {
        player.reversalDirection = 0;
      }
    } else if (move !== 0) {
      const currentRunSpeed = Math.max(
        player.speed,
        Math.min(PLAYER_RUN_MAX_SPEED, player.runSpeed),
      );
      player.vx = move * currentRunSpeed;
      if (!canStartJump) {
        player.runSpeed = Math.min(
          PLAYER_RUN_MAX_SPEED,
          currentRunSpeed + PLAYER_RUN_ACCELERATION * dt,
        );
      }
    } else if (canStopSkid && Math.abs(player.vx) > 1) {
      const previousVx = player.vx;
      player.vx = approachPlayerSpeed(previousVx, 0, PLAYER_STOP_BRAKE * dt);
      brakingDirection = Math.sign(previousVx);
      player.runSpeed = player.speed;
    } else {
      player.vx = 0;
      player.runSpeed = player.speed;
    }
  } else if (move !== 0 && Math.sign(player.vx) !== move) {
    // Keep accumulated takeoff speed in the air; only an intentional turn replaces it.
    player.runSpeed = player.speed;
    player.vx = move * player.speed;
  }

  updatePlayerAccelerationShield(dt);

  if (canReverseOnGround && player.reversalDirection === 0 &&
      Math.sign(player.vx) === move && Math.abs(player.vx) >= PLAYER_REVERSAL_MIN_SPEED) {
    player.recentRunDirection = move;
    player.recentRunSpeed = Math.abs(player.vx);
    player.reversalGraceTimer = PLAYER_REVERSAL_INPUT_GRACE;
  } else if (
    downForThisFrame || canStartJump || player.crouching || !player.grounded
  ) {
    player.recentRunDirection = 0;
    player.recentRunSpeed = 0;
    player.reversalGraceTimer = 0;
  }

  const stationaryTurn = player.crouching || controls.fire
    ? horizontalInput
    : 0;
  const turnDirection = move || stationaryTurn;
  if (turnDirection !== 0) {
    player.facing = Math.sign(turnDirection);
  }

  if (canStartJump) {
    const isAirJump = !player.grounded && !canUseCoyoteJump;
    if (!isAirJump || !Number.isFinite(player.fallReferenceY)) {
      player.fallReferenceY = player.y + player.height;
    }
    player.vy = -JUMP_SPEED;
    player.grounded = false;
    player.platform = null;
    player.jumpBufferTimer = 0;
    player.coyoteTime = 0;
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
      const centeredSupports = platformsAt(playerCenterX).map((platform) => ({
        platform,
        contactX: playerCenterX,
        surfaceY: platformSurfaceY(platform, playerCenterX),
      }));
      const connectedPlatform = (
        centeredSupports.length > 0
          ? centeredSupports
          : playerFootSupports(playerCenterX)
      )
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
        // Do not spend the first jump merely by stepping a few pixels off an edge.
        player.airJumpAvailable = true;
      }
    }
  }

  if (!player.grounded) {
    player.crouching = false;
    player.crouchInputTime = 0;
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
      const landing = playerFootSupports(playerCenterX)
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
        if (horizontalInput === 0) {
          player.vx = 0;
          player.runSpeed = player.speed;
          player.reversalDirection = 0;
          player.reversalSparkTimer = 0;
          player.recentRunDirection = 0;
          player.recentRunSpeed = 0;
          player.reversalGraceTimer = 0;
        }
      }
    }
  }

  updatePlayerRunAnimation(dt);
  emitPlayerReversalSparks(dt, brakingDirection);

  const firing = !downForThisFrame && controls.fire && playerCanFire();
  const startedFiring = firing && !player.fireWasActive;
  if (startedFiring) {
    player.fireBarrel = 0;
    player.fireTimer = 0;
    player.fireVoicePlayedForHold = false;
  }
  if (!firing) player.fireVoicePlayedForHold = false;
  player.fireWasActive = firing;
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  const firingPose = firing && (
    player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT || player.fireTimer > 0
  );
  const startVoiceVideoActive = !downForThisFrame &&
    typeof isFemaleStartVoiceVideoActive === "function" &&
    isFemaleStartVoiceVideoActive();
  if (!startVoiceVideoActive && typeof stopPlayerStartVideo === "function") {
    stopPlayerStartVideo();
  }
  const runVideoPose = !startVoiceVideoActive && !firingPose && !downForThisFrame && (
    playerIsRunningOnGround() || !player.grounded
  );
  syncPlayerGunVideoPlayback(firingPose && !startVoiceVideoActive);
  syncPlayerRunVideoPlayback(runVideoPose);
  syncPlayerStandVideoPlayback(
    !startVoiceVideoActive &&
    !firingPose && !runVideoPose && !downForThisFrame && player.grounded,
  );
  player.fireAnimationTime = firingPose ? player.fireAnimationTime + dt : 0;
  if (firing && player.fireTimer <= 0 && player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT) {
    const fired = shootPlayer();
    if (fired && !player.fireVoicePlayedForHold) {
      player.fireVoicePlayedForHold = true;
      if (typeof playFemaleAttackVoice === "function") playFemaleAttackVoice();
    }
  }

  updatePlayerCamera(dt);

  if (player.y > lowestPlatformY + 430) {
    if (!gameOver && typeof playFemaleDeathVoice === "function") {
      playFemaleDeathVoice();
    }
    gameOver = true;
    syncPlayerGunVideoPlayback(false);
    syncPlayerRunVideoPlayback(false);
    syncPlayerStandVideoPlayback(false);
  }
}
