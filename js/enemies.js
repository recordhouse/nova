"use strict";

// Regular enemy and mid-boss behavior.

function enemySpritePose(enemy, x = enemy.x, y = enemy.y) {
  const animationTime = enemy.animationTime ?? 0;
  const animationPhase = enemy.animationPhase ?? 0;
  const movementRate = enemy.moving ? 9 : 5.5;
  const wobble = Math.sin(animationTime * movementRate + animationPhase);
  let scaleX = 1 + wobble * (enemy.moving ? 0.085 : 0.045);
  let scaleY = 1 - wobble * (enemy.moving ? 0.065 : 0.035);
  const hitDuration = enemy.revivalKnockback
    ? PLAYER_REVIVAL_KNOCKBACK_DURATION : enemy.hitDuration;
  const hitPulse = hitDuration > 0
    ? Math.pow(Math.min(1, Math.max(0, (enemy.hitTimer ?? 0) / hitDuration)), 0.55)
    : 0;
  if (hitPulse > 0) {
    scaleX *= 1 - hitPulse * 0.22;
    scaleY *= 1 + hitPulse * 0.11;
  }
  if (enemy.state === "windup") {
    const progress = 1 - Math.max(0, enemy.stateTimer / enemy.jumpWindupDuration);
    scaleX *= 1.12 + progress * 0.12;
    scaleY *= 0.86 - progress * 0.08;
  } else if (enemy.state === "jump") {
    scaleX *= 0.86;
    scaleY *= 1.17;
  } else if (enemy.state === "recover") {
    const progress = Math.max(0, enemy.stateTimer / enemy.jumpRecoveryDuration);
    scaleX *= 1.12 + progress * 0.1;
    scaleY *= 0.88 - progress * 0.06;
  }
  let bob = 0;
  if (enemy.kind === "monster2") {
    const walkStep = enemy.moving
      ? Math.round(Math.sin(animationTime * 10 + animationPhase)) : 0;
    bob = Math.abs(walkStep) * 2;
    if (enemy.moving) {
      scaleX *= 1.1 + Math.abs(walkStep) * 0.025;
      scaleY = Math.max(0.97, scaleY * (1 - Math.abs(walkStep) * 0.01));
    }
    if (enemy.state === "inhale") {
      const progress = 1 - Math.max(0, enemy.stateTimer / enemy.inhaleDuration);
      scaleX *= 1 + progress * 0.2;
      scaleY *= 1 + progress * 0.14;
    } else if (enemy.state === "shoot") {
      const recoil = enemy.fireRecoilTimer / 0.12;
      scaleX *= 1 - recoil * 0.1;
      scaleY *= 1 + recoil * 0.07;
    }
  }
  return {
    centerX: Math.round((x + enemy.width / 2) / 2) * 2,
    feetY: Math.round((y + enemy.height - bob) / 2) * 2,
    hitOffsetX: Math.round((enemy.hitDirection ?? 0) * hitPulse * 4 / 2) * 2,
    scaleX: Math.round(scaleX * 16) / 16,
    scaleY: Math.round(scaleY * 16) / 16,
    hitPulse,
  };
}

function getEnemyHitbox(enemy, x = enemy.x, y = enemy.y) {
  const definition = MONSTER_TYPES[enemy.kind];
  if (!definition) return { x, y, width: enemy.width, height: enemy.height };
  const pose = enemySpritePose(enemy, x, y);
  const spriteHeight = enemy.spriteHeight ?? definition.spriteHeight;
  const bottomOffset = enemy.spriteBottomOffset ?? definition.spriteBottomOffset;
  // Alpha >= 16 body bounds exclude the PNG's transparent/faint outer padding.
  const topInset = enemy.spriteTopInset ?? definition.spriteTopInset;
  const spriteTop = -spriteHeight + bottomOffset + spriteHeight * topInset;
  const top = pose.feetY + spriteTop * pose.scaleY;
  // Keep the original feet and horizontal footprint for walking and platform support.
  return { x, y: top, width: enemy.width, height: y + enemy.height - top };
}

function enemySurfaceY(enemy) {
  return platformSurfaceY(enemy.platform, enemy.x + enemy.width / 2);
}

function launchEnemyJump(
  enemy,
  targetCenterX,
  targetSurfaceY = null,
  minimumHorizontalSpeed = enemy.jumpMinHorizontalSpeed,
  verticalLaunchSpeed = enemy.jumpLaunchSpeed,
) {
  const enemyCenterX = enemy.x + enemy.width / 2;
  const distance = targetCenterX - enemyCenterX;
  const direction = distance === 0 ? enemy.facing : Math.sign(distance);
  let flightTime = Math.max(
    0.35,
    (verticalLaunchSpeed * 2) / enemy.jumpGravity,
  );
  if (Number.isFinite(targetSurfaceY)) {
    const verticalDistance = targetSurfaceY - (enemy.y + enemy.height);
    const discriminant = (
      verticalLaunchSpeed ** 2 +
      2 * enemy.jumpGravity * verticalDistance
    );
    if (discriminant >= 0) {
      flightTime = Math.max(
        0.28,
        (verticalLaunchSpeed + Math.sqrt(discriminant)) / enemy.jumpGravity,
      );
    }
  }
  const targetSpeed = Math.abs(distance) / flightTime;

  enemy.facing = direction;
  enemy.jumpVx = direction * Math.max(
    minimumHorizontalSpeed,
    Math.min(enemy.jumpMaxHorizontalSpeed, targetSpeed),
  );
  enemy.jumpVy = -verticalLaunchSpeed;
  enemy.jumpOriginSurfaceY = enemy.y + enemy.height;
  enemy.jumpTargetSurfaceY = Number.isFinite(targetSurfaceY)
    ? targetSurfaceY
    : null;
  enemy.jumpHit = false;
  enemy.state = "jump";
  enemy.stateTimer = 0;
  burst(
    enemyCenterX,
    enemy.y + enemy.height,
    "#79ff38",
    7,
    95,
  );
}

function enemyGroundAt(x, currentSurfaceY, maxStepHeight) {
  return platformsAt(x)
    .map((platform) => ({
      platform,
      surfaceY: platformSurfaceY(platform, x),
    }))
    .filter((candidate) => (
      Math.abs(candidate.surfaceY - currentSurfaceY) <= maxStepHeight
    ))
    .sort((a, b) => (
      Math.abs(a.surfaceY - currentSurfaceY) -
      Math.abs(b.surfaceY - currentSurfaceY)
    ))[0] ?? null;
}

function moveEnemyAlongGround(enemy, direction, dt, speed = enemy.speed) {
  const currentCenterX = enemy.x + enemy.width / 2;
  const currentSurfaceY = enemy.y + enemy.height;
  const nextCenterX = Math.max(
    minWorldX + enemy.width / 2,
    Math.min(
      maxWorldX - enemy.width / 2,
      currentCenterX + direction * speed * dt,
    ),
  );
  const ground = enemyGroundAt(
    nextCenterX,
    currentSurfaceY,
    enemy.walkableStepHeight,
  );
  if (!ground) return false;

  const nextX = nextCenterX - enemy.width / 2;
  const nextY = ground.surfaceY - enemy.height;
  if (enemyRectOverlapsEnemy(
    nextX,
    nextY,
    enemy.width,
    enemy.height,
    enemy,
  )) return false;

  enemy.x = nextX;
  enemy.y = nextY;
  enemy.platform = ground.platform;
  enemy.moving = Math.abs(nextCenterX - currentCenterX) > 0.01;
  return true;
}

function resolveJumpingEnemyBodyCollisions(enemy) {
  for (let pass = 0; pass < 4; pass += 1) {
    const hitbox = getEnemyHitbox(enemy);
    const blocker = enemies.find((other) => {
      if (
        other === enemy || !other.alive ||
        enemy.x >= other.x + other.width + ENEMY_BODY_SEPARATION ||
        enemy.x + enemy.width + ENEMY_BODY_SEPARATION <= other.x
      ) return false;
      const otherHitbox = getEnemyHitbox(other);
      return hitbox.y < otherHitbox.y + otherHitbox.height + ENEMY_BODY_SEPARATION &&
        hitbox.y + hitbox.height + ENEMY_BODY_SEPARATION > otherHitbox.y;
    });
    if (!blocker) return;
    const blockerHitbox = getEnemyHitbox(blocker);

    const pushLeft = (
      enemy.x + enemy.width + ENEMY_BODY_SEPARATION - blocker.x
    );
    const pushRight = (
      blocker.x + blocker.width + ENEMY_BODY_SEPARATION - enemy.x
    );
    const pushUp = (
      hitbox.y + hitbox.height + ENEMY_BODY_SEPARATION - blockerHitbox.y
    );
    const pushDown = (
      blockerHitbox.y + blockerHitbox.height + ENEMY_BODY_SEPARATION - hitbox.y
    );
    const horizontalPush = Math.min(pushLeft, pushRight);
    const verticalPush = Math.min(pushUp, pushDown);

    if (horizontalPush <= verticalPush) {
      enemy.x += pushLeft <= pushRight ? -pushLeft : pushRight;
      enemy.x = Math.max(minWorldX, Math.min(maxWorldX - enemy.width, enemy.x));
      enemy.jumpVx = 0;
    } else if (pushUp <= pushDown) {
      enemy.y -= pushUp;
      if (enemy.jumpVy > 0) enemy.jumpVy = 0;
    } else {
      enemy.y += pushDown;
      if (enemy.jumpVy < 0) enemy.jumpVy = 0;
    }
  }
}

function upwardRampEndpoints(platform) {
  if (platform.kind !== "ramp" || platform.entryY === platform.exitY) return null;
  const entryIsLower = platform.entryY > platform.exitY;
  return {
    platform,
    lowerX: entryIsLower ? platform.entryX : platform.exitX,
    lowerY: entryIsLower ? platform.entryY : platform.exitY,
    upperX: entryIsLower ? platform.exitX : platform.entryX,
    upperY: entryIsLower ? platform.exitY : platform.entryY,
  };
}

function enemyUpwardRoute(enemy, playerCenterX, playerFeetY) {
  if (!player.grounded || !player.platform) return null;
  const enemyCenterX = enemy.x + enemy.width / 2;
  if (Math.abs(playerCenterX - enemyCenterX) > enemy.climbSearchRange) return null;
  const currentSurfaceY = enemy.y + enemy.height;
  const climbHeight = currentSurfaceY - playerFeetY;
  if (climbHeight <= 1 || climbHeight > enemy.climbVerticalRange) return null;

  const currentRamp = upwardRampEndpoints(enemy.platform);
  if (
    currentRamp &&
    currentRamp.upperY < currentSurfaceY - 1 &&
    currentRamp.upperY >= playerFeetY - enemy.walkableStepHeight * 2
  ) {
    return {
      targetX: currentRamp.upperX,
      direction: (
        Math.sign(currentRamp.upperX - enemyCenterX) ||
        Math.sign(currentRamp.upperX - currentRamp.lowerX)
      ),
    };
  }
  if (climbHeight < enemy.climbMinimumHeight) return null;

  const route = platforms
    .map(upwardRampEndpoints)
    .filter(Boolean)
    .filter((ramp) => (
      Math.abs(ramp.lowerY - currentSurfaceY) <= enemy.walkableStepHeight + 8 &&
      ramp.upperY < currentSurfaceY - enemy.climbMinimumHeight &&
      ramp.upperY >= playerFeetY - enemy.walkableStepHeight * 2 &&
      Math.abs(ramp.lowerX - enemyCenterX) <= enemy.climbSearchRange
    ))
    .sort((a, b) => (
      Math.abs(a.lowerX - enemyCenterX) + Math.abs(a.upperY - playerFeetY) * 0.3 -
      (Math.abs(b.lowerX - enemyCenterX) + Math.abs(b.upperY - playerFeetY) * 0.3)
    ))[0];
  if (!route) return null;

  return {
    targetX: route.lowerX,
    direction: (
      Math.sign(route.lowerX - enemyCenterX) ||
      Math.sign(route.upperX - route.lowerX)
    ),
  };
}

function updateEnemyHitReaction(enemy, dt) {
  const speed = Math.abs(enemy.hitKnockbackVelocity);
  if (speed < 1) {
    enemy.hitKnockbackVelocity = 0;
    return;
  }

  const direction = Math.sign(enemy.hitKnockbackVelocity);
  const damping = enemy.revivalKnockback
    ? PLAYER_REVIVAL_KNOCKBACK_DAMPING : enemy.hitKnockbackDamping;
  if (!moveEnemyAlongGround(enemy, direction, dt, speed)) {
    // A recovery wave pushes a group: blocked rear monsters get another chance
    // as the front monsters move, without ever overlapping their bodies.
    enemy.hitKnockbackVelocity = enemy.revivalKnockback
      ? enemy.hitKnockbackVelocity * Math.exp(-damping * dt)
      : 0;
    return;
  }
  enemy.hitKnockbackVelocity *= Math.exp(-damping * dt);
}

function enemyGapLanding(enemy, direction) {
  const currentCenterX = enemy.x + enemy.width / 2;
  const currentSurfaceY = enemy.y + enemy.height;
  const currentPlatform = enemy.platform;

  return platforms
    .filter((platform) => platform !== currentPlatform)
    .map((platform) => {
      const platformWidth = platform.end - platform.start;
      const landingInset = Math.min(22, platformWidth / 2);
      const landingX = direction > 0
        ? platform.start + landingInset
        : platform.end - landingInset;
      const gap = direction > 0
        ? platform.start - currentPlatform.end
        : currentPlatform.start - platform.end;
      const forwardDistance = direction * (landingX - currentCenterX);
      const surfaceY = platformSurfaceY(platform, landingX);
      return {
        platform,
        landingX,
        surfaceY,
        gap,
        forwardDistance,
        rise: currentSurfaceY - surfaceY,
        drop: surfaceY - currentSurfaceY,
      };
    })
    .filter((candidate) => (
      candidate.gap >= -10 &&
      candidate.gap <= enemy.jumpGapRange &&
      candidate.forwardDistance > 0 &&
      candidate.rise <= enemy.jumpGapMaxRise &&
      candidate.drop <= enemy.jumpGapMaxDrop
    ))
    .sort((a, b) => (
      a.forwardDistance + Math.abs(a.surfaceY - currentSurfaceY) * 0.35 -
      (b.forwardDistance + Math.abs(b.surfaceY - currentSurfaceY) * 0.35)
    ))[0] ?? null;
}

function jumpEnemyAcrossGap(enemy, direction) {
  const landing = enemyGapLanding(enemy, direction);
  if (!landing) return false;
  const climbsUp = landing.rise > enemy.jumpLandingVerticalRange;
  enemy.jumpMode = climbsUp ? "climb-gap" : "gap";
  launchEnemyJump(
    enemy,
    landing.landingX,
    landing.surfaceY,
    enemy.jumpGapMinHorizontalSpeed,
    climbsUp ? enemy.climbJumpLaunchSpeed : enemy.jumpLaunchSpeed,
  );
  return true;
}

function enemyDropEdgeTargetX(enemy) {
  const enemyCenterX = enemy.x + enemy.width / 2;
  return (
    enemyCenterX +
    enemy.dropEdgeDirection * enemy.dropAttackHorizontalDistance
  );
}

function enemyDropTargetSurfaceY(enemy, targetX, playerFeetY) {
  const currentSurfaceY = enemy.y + enemy.height;
  return platformsAt(targetX)
    .map((platform) => platformSurfaceY(platform, targetX))
    .filter((surfaceY) => (
      surfaceY > currentSurfaceY + enemy.dropLandingClearance
    ))
    .sort((a, b) => (
      Math.abs(a - playerFeetY) - Math.abs(b - playerFeetY)
    ))[0] ?? playerFeetY;
}

function enemyAttackTargetX(enemy, playerCenterX) {
  const currentSurfaceY = enemy.y + enemy.height;
  const supportedAtPlayer = platformsAt(playerCenterX).some((platform) => (
    Math.abs(platformSurfaceY(platform, playerCenterX) - currentSurfaceY) <=
    enemy.jumpLandingVerticalRange
  ));
  if (supportedAtPlayer) return playerCenterX;

  const minimumX = enemy.platform.start + enemy.width / 2;
  const maximumX = enemy.platform.end - enemy.width / 2;
  return Math.max(minimumX, Math.min(maximumX, playerCenterX));
}

function prepareEnemyEdgeDrop(enemy) {
  enemy.state = "windup";
  enemy.stateTimer = enemy.jumpWindupDuration;
  enemy.jumpMode = "drop-edge";
}

function updateJumpingEnemy(enemy, dt) {
  const previousBottom = enemy.y + enemy.height;
  enemy.x = Math.max(
    minWorldX,
    Math.min(maxWorldX - enemy.width, enemy.x + enemy.jumpVx * dt),
  );
  enemy.jumpVy = Math.min(760, enemy.jumpVy + enemy.jumpGravity * dt);
  enemy.y += enemy.jumpVy * dt;
  resolveJumpingEnemyBodyCollisions(enemy);
  const currentBottom = enemy.y + enemy.height;
  if (enemy.jumpVy < 0) return;

  const centerX = enemy.x + enemy.width / 2;
  const landing = platformsAt(centerX)
    .map((platform) => ({
      platform,
      surfaceY: platformSurfaceY(platform, centerX),
    }))
    .filter((candidate) => (
      enemy.jumpMode === "drop-edge"
        ? candidate.surfaceY > (
          enemy.jumpOriginSurfaceY + enemy.dropLandingClearance
        )
        : enemy.jumpMode === "climb-gap"
          ? Math.abs(candidate.surfaceY - enemy.jumpTargetSurfaceY) <= 8
          : Math.abs(candidate.surfaceY - enemy.jumpOriginSurfaceY) <=
            enemy.jumpLandingVerticalRange
    ))
    .sort((a, b) => a.surfaceY - b.surfaceY)
    .find((candidate) => (
      previousBottom <= candidate.surfaceY + 7 &&
      currentBottom >= candidate.surfaceY
    ));
  if (!landing) {
    if (currentBottom > lowestPlatformY + HEIGHT) enemy.alive = false;
    return;
  }

  enemy.platform = landing.platform;
  enemy.y = landing.surfaceY - enemy.height;
  enemy.jumpVx = 0;
  enemy.jumpVy = 0;
  enemy.state = "recover";
  enemy.jumpMode = "attack";
  enemy.dropEdgeDirection = 0;
  enemy.jumpOriginSurfaceY = null;
  enemy.jumpTargetSurfaceY = null;
  enemy.stateTimer = enemy.jumpRecoveryDuration;
  enemy.jumpCooldown = enemy.jumpCooldownDuration * (0.82 + Math.random() * 0.36);
  shake = Math.max(shake, 2.4);
  burst(
    enemy.x + enemy.width / 2,
    landing.surfaceY,
    "#61e92f",
    6,
    80,
  );
}

function monster2AttackOrigin(enemy) {
  const direction = (
    enemy.state === "inhale" || enemy.state === "shoot"
      ? enemy.attackDirection
      : enemy.facing
  ) || -1;
  return {
    x: (
      enemy.x + enemy.width / 2 +
      direction * enemy.mouthForwardOffset
    ),
    y: enemy.y + enemy.height - enemy.mouthHeight,
  };
}

function monster2MouthIsVisible(enemy) {
  const origin = monster2AttackOrigin(enemy);
  const margin = 100;
  return (
    origin.x >= cameraX - margin && origin.x <= cameraX + WIDTH + margin &&
    origin.y >= cameraY - margin && origin.y <= cameraY + HEIGHT + margin
  );
}

function fireMonster2Fireball(enemy) {
  const origin = monster2AttackOrigin(enemy);
  const direction = enemy.attackDirection || enemy.facing || -1;
  // Spread the five shots slightly without losing the forward-first arc.
  const angle = (((enemy.fireballsFired * 2) % enemy.fireballCount) -
    (enemy.fireballCount - 1) / 2) * 0.025 +
    (Math.random() - 0.5) * 0.012;
  enemyBullets.push({
    kind: "monster2-fireball",
    x: origin.x,
    y: origin.y,
    vx: direction * enemy.fireballSpeed * Math.cos(angle),
    vy: enemy.fireballSpeed * Math.sin(angle),
    radius: enemy.fireballRadius,
    remainingRange: enemy.fireballRange,
    riseAcceleration: enemy.fireballRiseAcceleration,
    phase: enemy.animationPhase + enemy.fireballsFired * 1.7,
  });
  enemy.fireballsFired += 1;
  enemy.fireRecoilTimer = Math.max(0, Math.min(0.12, 0.12 + enemy.fireballTimer));
}

function updateMonster2Volley(enemy, dt) {
  enemy.stateTimer -= dt;
  enemy.fireballTimer -= dt;
  // Catch up scheduled shots without exceeding the five-shot volley.
  while (enemy.fireballsFired < enemy.fireballCount && enemy.fireballTimer <= 1e-9) {
    fireMonster2Fireball(enemy);
    enemy.fireballTimer += enemy.fireballInterval;
  }
  if (enemy.stateTimer > 0) return;
  enemy.state = "chase";
  enemy.stateTimer = 0;
  enemy.attackTimer = enemy.attackCooldown * (0.85 + Math.random() * 0.3);
  enemy.ambientFireTimer = enemy.ambientFireDelayMin +
    Math.random() * (enemy.ambientFireDelayMax - enemy.ambientFireDelayMin);
}

function updateMonster2(enemy, dt, playerHitbox, playerCenterX, playerFeetY) {
  const enemyCenterX = enemy.x + enemy.width / 2;
  const distance = playerCenterX - enemyCenterX;
  const verticalDistance = playerFeetY - enemySurfaceY(enemy);
  const inAttackRange = (
    Math.abs(verticalDistance) <= enemy.attackVerticalRange &&
    Math.abs(distance) <= enemy.attackRange
  );
  const sameChaseHeight = Math.abs(verticalDistance) <= enemy.chaseVerticalRange;
  const knockedBack = enemy.hitTimer > 0;

  if (knockedBack) updateEnemyHitReaction(enemy, dt);
  enemy.fireRecoilTimer = Math.max(0, enemy.fireRecoilTimer - dt);

  if (enemy.state === "inhale") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer > 0) return;
    const remainingDt = Math.max(0, -enemy.stateTimer);
    enemy.state = "shoot";
    enemy.stateTimer = (enemy.fireballCount - 1) * enemy.fireballInterval + enemy.fireballRecovery;
    enemy.fireballsFired = 0;
    enemy.fireballTimer = 0;
    updateMonster2Volley(enemy, remainingDt);
    return;
  }

  if (enemy.state === "shoot") {
    updateMonster2Volley(enemy, dt);
    return;
  }

  if (knockedBack) return;

  enemy.ambientFireTimer = Math.max(0, enemy.ambientFireTimer - dt);
  if (Math.abs(distance) > 1) enemy.facing = Math.sign(distance);
  // Nearby targets take priority; otherwise each monster follows its own random delay.
  if (enemy.attackTimer <= 0 && (inAttackRange || enemy.ambientFireTimer <= 0)) {
    enemy.state = "inhale";
    enemy.stateTimer = enemy.inhaleDuration;
    enemy.attackDirection = enemy.facing;
    const origin = monster2AttackOrigin(enemy);
    if (monster2MouthIsVisible(enemy)) burst(origin.x, origin.y, "#b348db", 7, 65);
    return;
  }

  if (
    sameChaseHeight &&
    Math.abs(distance) < enemy.chaseRange
  ) {
    moveEnemyAlongGround(enemy, Math.sign(distance) || enemy.facing, dt);
  }
}

function monster3EyeOrigin(enemy) {
  return {
    x: enemy.x + enemy.width / 2 + enemy.facing * 19,
    y: enemy.y + enemy.height - 98,
  };
}

function fireMonster3Laser(enemy, playerHitbox) {
  const eye = monster3EyeOrigin(enemy);
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  const distance = Math.max(1, Math.hypot(targetX - eye.x, targetY - eye.y));
  const directionX = (targetX - eye.x) / distance;
  const directionY = (targetY - eye.y) / distance;
  enemyBullets.push({
    kind: "monster3-laser",
    x: eye.x + directionX * 14,
    y: eye.y + directionY * 14,
    vx: directionX * enemy.laserSpeed,
    vy: directionY * enemy.laserSpeed,
    radius: enemy.laserRadius,
    maxRicochets: enemy.laserRicochets,
    ricochetColor: "#ffad68",
  });
  burst(eye.x, eye.y, "#ffe5a0", 10, 125);
}

function updateMonster3(enemy, dt, playerHitbox, playerCenterX) {
  enemy.y = enemy.hoverBaseY + Math.sin(
    enemy.animationTime * enemy.hoverSpeed + enemy.animationPhase,
  ) * enemy.hoverAmplitude;
  const patrolX = enemy.hoverAnchorX + Math.sin(
    enemy.animationTime * 0.68 + enemy.animationPhase,
  ) * enemy.patrolRadius;
  const minX = enemy.platform.start + 20;
  const maxX = enemy.platform.end - enemy.width - 20;
  const targetX = Math.max(minX, Math.min(maxX, patrolX));
  const knockback = enemy.hitKnockbackVelocity;
  const nextX = Math.max(minX, Math.min(maxX,
    enemy.x + Math.max(-75 * dt, Math.min(75 * dt, targetX - enemy.x)) + knockback * dt,
  ));
  if (!enemyRectOverlapsEnemy(nextX, enemy.y, enemy.width, enemy.height, enemy)) {
    enemy.moving = Math.abs(nextX - enemy.x) > 0.5;
    enemy.x = nextX;
  }
  if (Math.abs(knockback) > 1) {
    enemy.hitKnockbackVelocity *= Math.exp(-enemy.hitKnockbackDamping * dt);
    enemy.hoverAnchorX = Math.max(minX, Math.min(maxX,
      enemy.hoverAnchorX + knockback * dt,
    ));
  }

  if (enemy.state === "charge") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer > 0) return;
    fireMonster3Laser(enemy, playerHitbox);
    enemy.state = "hover";
    enemy.stateTimer = 0;
    enemy.attackTimer = enemy.attackCooldownMin +
      Math.random() * (enemy.attackCooldownMax - enemy.attackCooldownMin);
    return;
  }

  const eye = monster3EyeOrigin(enemy);
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  const playerNearby = Math.abs(playerCenterX - eye.x) <= enemy.attackRange &&
    Math.abs(playerCenterY - eye.y) <= 640;
  const onScreen = eye.x >= cameraX - 80 && eye.x <= cameraX + WIDTH + 80 &&
    eye.y >= cameraY - 80 && eye.y <= cameraY + HEIGHT + 80;
  if (playerNearby && onScreen && enemy.attackTimer <= 0) {
    enemy.facing = Math.sign(playerCenterX - enemy.x - enemy.width / 2) || enemy.facing;
    enemy.state = "charge";
    enemy.stateTimer = enemy.chargeDuration;
  }
}

function updateEnemies(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerFeetY = player.y + player.height;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.animationTime += dt;
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - dt);
    enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
    if (enemy.hitTimer <= 0) {
      if (enemy.revivalKnockback) enemy.hitKnockbackVelocity = 0;
      enemy.revivalKnockback = false;
    }
    enemy.moving = false;

    if (enemy.kind === "monster3") {
      updateMonster3(enemy, dt, playerHitbox, playerCenterX);
      continue;
    }

    if (enemy.state !== "jump") {
      enemy.y = enemySurfaceY(enemy) - enemy.height;
    }

    const enemyCenterX = enemy.x + enemy.width / 2;
    const distance = playerCenterX - enemyCenterX;
    const surfaceY = enemySurfaceY(enemy);
    const playerVerticalDistance = playerFeetY - surfaceY;
    if (enemy.kind === "monster2") {
      updateMonster2(enemy, dt, playerHitbox, playerCenterX, playerFeetY);
      continue;
    }
    const withinJumpHeight = (
      Math.abs(playerVerticalDistance) <
      enemy.jumpAttackVerticalRange
    );
    const withinChaseHeight = (
      Math.abs(playerVerticalDistance) <
      enemy.chaseVerticalRange
    );
    const upwardRoute = enemyUpwardRoute(enemy, playerCenterX, playerFeetY);
    if (Math.abs(distance) > 1) enemy.facing = Math.sign(distance);

    const contactDistance = (enemy.width + playerHitbox.width) / 2 - 4;
    const wasJumping = enemy.state === "jump";

    if (enemy.hitTimer > 0 && enemy.state !== "jump") {
      updateEnemyHitReaction(enemy, dt);
      continue;
    }

    if (enemy.state === "windup") {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        if (enemy.jumpMode === "drop-edge") {
          const targetX = enemyDropEdgeTargetX(enemy);
          launchEnemyJump(
            enemy,
            targetX,
            enemyDropTargetSurfaceY(enemy, targetX, playerFeetY),
            0,
            enemy.dropAttackLaunchSpeed,
          );
        } else {
          launchEnemyJump(
            enemy,
            enemyAttackTargetX(enemy, playerCenterX),
          );
        }
      }
    } else if (enemy.state === "jump") {
      updateJumpingEnemy(enemy, dt);
    } else if (enemy.state === "recover") {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) enemy.state = "chase";
    } else if (enemy.state === "seek-drop-edge") {
      const moved = moveEnemyAlongGround(
        enemy,
        enemy.dropEdgeDirection,
        dt,
      );
      if (!moved || !enemy.moving) prepareEnemyEdgeDrop(enemy);
    } else if (
      enemy.platform.routeRole === "sub" &&
      playerVerticalDistance >= enemy.dropAttackMinHeight &&
      playerVerticalDistance <= enemy.dropAttackMaxHeight &&
      Math.abs(distance) <= enemy.dropAttackRange &&
      enemy.jumpCooldown <= 0
    ) {
      enemy.state = "seek-drop-edge";
      enemy.dropEdgeDirection = Math.sign(distance) || enemy.facing || 1;
    } else if (upwardRoute) {
      enemy.facing = upwardRoute.direction;
      if (!moveEnemyAlongGround(enemy, upwardRoute.direction, dt)) {
        jumpEnemyAcrossGap(enemy, upwardRoute.direction);
      }
    } else if (
      withinJumpHeight &&
      Math.abs(distance) <= enemy.jumpAttackRange &&
      enemy.jumpCooldown <= 0
    ) {
      enemy.state = "windup";
      enemy.stateTimer = enemy.jumpWindupDuration;
      enemy.jumpMode = "attack";
    } else if (
      withinChaseHeight &&
      Math.abs(distance) < enemy.chaseRange &&
      Math.abs(distance) > contactDistance
    ) {
      const direction = Math.sign(distance);
      if (!moveEnemyAlongGround(enemy, direction, dt)) {
        jumpEnemyAcrossGap(enemy, direction);
      }
    }

    if (
      enemy.kind === "monster1" &&
      (wasJumping || enemy.state === "jump") &&
      !enemy.jumpHit &&
      player.invincible <= 0 &&
      enemy.attackTimer <= 0 &&
      overlapsRects(getEnemyHitbox(enemy), playerHitbox) &&
      takePlayerDamage(1, enemy)
    ) {
      enemy.attackTimer = enemy.attackCooldown;
      enemy.jumpHit = true;
    }
  }
}

function turretMuzzlePosition(turret) {
  const bottomY = turret.y + turret.height + TURRET.visualGroundOffset;
  return {
    x: turret.x + turret.width / 2 + turret.facing * TURRET.spriteWidth * 0.37,
    y: (
      bottomY -
      TURRET.spriteHeight +
      TURRET.spriteBottomOffset +
      TURRET.spriteHeight * 0.2
    ),
  };
}

function fireTurretLaser(turret, aimedAtPlayer) {
  const muzzle = turretMuzzlePosition(turret);
  let directionX = turret.facing / Math.hypot(1, 0.08);
  let directionY = -0.08 / Math.hypot(1, 0.08);
  if (aimedAtPlayer) {
    const playerHitbox = getPlayerHitbox();
    const targetX = playerHitbox.x + playerHitbox.width / 2;
    const targetY = playerHitbox.y + playerHitbox.height / 2;
    const distance = Math.max(1, Math.hypot(targetX - muzzle.x, targetY - muzzle.y));
    directionX = (targetX - muzzle.x) / distance;
    directionY = (targetY - muzzle.y) / distance;
  }

  enemyBullets.push({
    kind: "turret-laser",
    x: muzzle.x,
    y: muzzle.y,
    vx: directionX * TURRET.laserSpeed,
    vy: directionY * TURRET.laserSpeed,
    radius: TURRET.laserRadius,
    ricochets: 0,
    maxRicochets: TURRET.laserRicochets,
    ricochetColor: "#dc347f",
  });
  turret.recoilTimer = 0.2;
  if (
    muzzle.x >= cameraX - 80 && muzzle.x <= cameraX + WIDTH + 80 &&
    muzzle.y >= cameraY - 80 && muzzle.y <= cameraY + HEIGHT + 80
  ) {
    burst(muzzle.x, muzzle.y, "#f04b96", 16, 185);
    burst(muzzle.x, muzzle.y, "#6d153f", 9, 115);
    shake = Math.max(shake, 7);
  }
}

function updateTurrets(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;

  for (const turret of turrets) {
    if (!turret.alive) continue;
    const turretCenterX = turret.x + turret.width / 2;
    const turretCenterY = turret.y + turret.height / 2;
    turret.y = (
      platformSurfaceY(turret.platform, turretCenterX) - turret.height
    );
    turret.hitTimer = Math.max(0, turret.hitTimer - dt);
    turret.recoilTimer = Math.max(0, turret.recoilTimer - dt);
    const playerInRange = (
      Math.abs(playerCenterX - turretCenterX) <= TURRET.activationRangeX &&
      Math.abs(playerCenterY - turretCenterY) <= TURRET.activationRangeY
    );
    if (playerInRange && Math.abs(playerCenterX - turretCenterX) > 1) {
      turret.facing = Math.sign(playerCenterX - turretCenterX);
    }
    turret.active = true;

    turret.fireTimer -= dt;
    if (turret.burstShotsRemaining === 0 && turret.fireTimer <= TURRET.chargeDuration) {
      turret.chargeParticleTimer -= dt;
      if (turret.chargeParticleTimer <= 0) {
        const muzzle = turretMuzzlePosition(turret);
        const chargeProgress = Math.max(
          0,
          1 - turret.fireTimer / TURRET.chargeDuration,
        );
        if (
          muzzle.x >= cameraX - 80 && muzzle.x <= cameraX + WIDTH + 80 &&
          muzzle.y >= cameraY - 80 && muzzle.y <= cameraY + HEIGHT + 80
        ) {
          burst(
            muzzle.x,
            muzzle.y,
            chargeProgress > 0.68 ? "#ff609f" : "#9a245f",
            1,
            35 + chargeProgress * 35,
          );
        }
        turret.chargeParticleTimer = 0.12 - chargeProgress * 0.065;
      }
    }

    if (turret.fireTimer > 0) continue;
    fireTurretLaser(turret, playerInRange);
    if (turret.burstShotsRemaining > 0) {
      turret.burstShotsRemaining -= 1;
    } else {
      const burstShots = TURRET.burstMinShots + Math.floor(
        Math.random() * (TURRET.burstMaxShots - TURRET.burstMinShots + 1),
      );
      turret.burstShotsRemaining = burstShots - 1;
    }
    turret.fireTimer = turret.burstShotsRemaining > 0
      ? TURRET.burstShotInterval : TURRET.fireInterval;
    turret.chargeParticleTimer = 0;
  }
}

function midBossMouthPosition(boss) {
  return {
    x: boss.x + boss.width / 2 + boss.facing * boss.width * 0.36,
    y: boss.y + boss.height * 0.58,
  };
}

function fireMidBossLaser(boss) {
  const mouth = midBossMouthPosition(boss);
  const playerHitbox = getPlayerHitbox();
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  const distance = Math.max(1, Math.hypot(targetX - mouth.x, targetY - mouth.y));
  const directionX = (targetX - mouth.x) / distance;
  const directionY = (targetY - mouth.y) / distance;
  enemyBullets.push({
    kind: "boss-laser",
    x: mouth.x,
    y: mouth.y,
    vx: directionX * MID_BOSS.laserSpeed,
    vy: directionY * MID_BOSS.laserSpeed,
    radius: 8,
    ricochets: 0,
  });
  burst(mouth.x, mouth.y, "#ff69e6", 12, 165);
  shake = Math.max(shake, 5);
}

function updateMidBosses(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;

  for (const boss of midBosses) {
    if (!boss.alive) continue;
    const bossCenterX = boss.x + boss.width / 2;
    const bossCenterY = boss.y + boss.height / 2;
    const withinActivationRange = (
      Math.abs(playerCenterX - bossCenterX) <= MID_BOSS.activationRangeX &&
      Math.abs(playerCenterY - bossCenterY) <= MID_BOSS.activationRangeY
    );
    if (!withinActivationRange) {
      boss.active = false;
      continue;
    }

    boss.active = true;
    boss.phase += dt;
    boss.facing = playerCenterX >= bossCenterX ? 1 : -1;
    boss.moveTimer -= dt;
    if (boss.moveTimer <= 0) {
      const movementBias = Math.sin(boss.phase * 1.37) * 0.22;
      boss.targetY = boss.baseY + (
        Math.max(-1, Math.min(1, (Math.random() * 2 - 1) + movementBias)) *
        MID_BOSS.verticalRange
      );
      boss.moveTimer = 0.38 + Math.random() * 1.05;
    }

    const verticalDistance = boss.targetY - boss.y;
    const maximumMovement = MID_BOSS.verticalSpeed * dt;
    boss.y += Math.max(-maximumMovement, Math.min(maximumMovement, verticalDistance));

    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      fireMidBossLaser(boss);
      boss.fireTimer = 1.35 + Math.random() * 1.25;
    }

    if (
      player.invincible <= 0 &&
      overlapsRects(boss, playerHitbox)
    ) {
      takePlayerDamage(1, { x: bossCenterX, y: bossCenterY, kind: "boss" });
    }
  }
}
