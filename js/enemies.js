"use strict";

// Regular enemy and mid-boss behavior.

function faceHostileTowardX(hostile, targetCenterX, deadZone = null) {
  const hostileCenterX = hostile.x + hostile.width / 2;
  const distance = targetCenterX - hostileCenterX;
  const stableZone = deadZone ?? Math.max(
    12,
    Math.min(24, hostile.width * 0.08),
  );
  if (Math.abs(distance) <= stableZone) {
    hostile.facing ||= -1;
    return hostile.facing;
  }
  hostile.facing = distance > 0 ? 1 : -1;
  return hostile.facing;
}

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
  if (enemy.kind === "monster4") {
    if (enemy.state === "spear-charge") {
      const progress = 1 - Math.max(0,
        enemy.stateTimer / enemy.spearChargeDuration,
      );
      scaleX *= 1.02 + progress * 0.16;
      scaleY *= 0.98 - progress * 0.14;
    } else if (enemy.state === "spear-recover") {
      const recoil = Math.max(0,
        enemy.stateTimer / enemy.spearRecoveryDuration,
      );
      scaleX *= 1 + recoil * 0.22;
      scaleY *= 1 - recoil * 0.1;
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
    enemy.kind === "monster4" ? "#ff7545" : "#79ff38",
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
    enemy.kind === "monster4" ? "#e95838" : "#61e92f",
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
  if (monster2MouthIsVisible(enemy) && typeof playMonsterFire02Sound === "function") {
    playMonsterFire02Sound();
  }
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
    if (enemy.stateTimer > 0) return false;
    const remainingDt = Math.max(0, -enemy.stateTimer);
    enemy.state = "shoot";
    enemy.stateTimer = (enemy.fireballCount - 1) * enemy.fireballInterval + enemy.fireballRecovery;
    enemy.fireballsFired = 0;
    enemy.fireballTimer = 0;
    updateMonster2Volley(enemy, remainingDt);
    return false;
  }

  if (enemy.state === "shoot") {
    updateMonster2Volley(enemy, dt);
    return false;
  }

  if (knockedBack) return false;

  enemy.ambientFireTimer = Math.max(0, enemy.ambientFireTimer - dt);
  faceHostileTowardX(enemy, playerCenterX);
  // Nearby targets take priority; otherwise each monster follows its own random delay.
  if (enemy.attackTimer <= 0 && (inAttackRange || enemy.ambientFireTimer <= 0)) {
    enemy.state = "inhale";
    enemy.stateTimer = enemy.inhaleDuration;
    enemy.attackDirection = enemy.facing;
    const origin = monster2AttackOrigin(enemy);
    if (monster2MouthIsVisible(enemy)) burst(origin.x, origin.y, "#b348db", 7, 65);
    return true;
  }

  if (
    sameChaseHeight &&
    Math.abs(distance) < enemy.chaseRange &&
    Math.abs(distance) > (enemy.width + playerHitbox.width) / 2 - 4
  ) {
    moveEnemyAlongGround(enemy, Math.sign(distance) || enemy.facing, dt);
  }
  return false;
}

function monster3EyeOrigin(enemy) {
  return {
    x: enemy.x + enemy.width / 2 + enemy.facing * 19,
    y: enemy.y + enemy.height - 98,
  };
}

function monster4SpearOrigin(enemy) {
  const direction = (
    enemy.state === "spear-charge" || enemy.state === "spear-recover"
      ? enemy.attackDirection
      : enemy.facing
  ) || -1;
  return {
    x: enemy.x + enemy.width / 2 + direction * enemy.spearForwardOffset,
    y: enemy.y + enemy.height - enemy.spearHeight,
  };
}

function fireMonster4Spear(enemy, playerHitbox) {
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  const enemyCenterX = enemy.x + enemy.width / 2;
  faceHostileTowardX(enemy, targetX);
  enemy.attackDirection = enemy.facing;
  const origin = monster4SpearOrigin(enemy);
  const distance = Math.max(1, Math.hypot(targetX - origin.x, targetY - origin.y));
  const directionX = (targetX - origin.x) / distance;
  const directionY = (targetY - origin.y) / distance;
  enemyBullets.push({
    kind: "monster4-crescent",
    x: origin.x + directionX * 18,
    y: origin.y + directionY * 18,
    vx: directionX * enemy.spearSpeed,
    vy: directionY * enemy.spearSpeed,
    radius: enemy.spearRadius,
    remainingRange: enemy.spearTravelRange,
    initialRange: enemy.spearTravelRange,
    ricochets: 0,
    maxRicochets: 0,
    ricochetColor: "#ff4e55",
    phase: enemy.animationPhase,
  });
  burst(origin.x, origin.y, "#ff4e55", 9, 145);
  shake = Math.max(shake, 4);
}

function updateMonster4SpearAttack(enemy, dt, playerHitbox, playerCenterX) {
  if (enemy.state === "spear-charge") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer > 0) return true;
    fireMonster4Spear(enemy, playerHitbox);
    enemy.state = "spear-recover";
    enemy.stateTimer = enemy.spearRecoveryDuration;
    enemy.attackTimer = enemy.spearAttackCooldown * (0.88 + Math.random() * 0.24);
    return true;
  }
  if (enemy.state === "spear-recover") {
    enemy.stateTimer -= dt;
    if (enemy.stateTimer <= 0) {
      enemy.state = "chase";
      enemy.stateTimer = 0;
    }
    return true;
  }
  if (enemy.state !== "chase" || enemy.attackTimer > 0) return false;

  const origin = monster4SpearOrigin(enemy);
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  if (
    Math.abs(playerCenterX - origin.x) > enemy.spearAttackRange ||
    Math.abs(playerCenterY - origin.y) > enemy.spearAttackVerticalRange
  ) return false;

  faceHostileTowardX(enemy, playerCenterX);
  enemy.attackDirection = enemy.facing;
  enemy.state = "spear-charge";
  enemy.stateTimer = enemy.spearChargeDuration;
  return true;
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
  const eyeIsNearScreen = (
    eye.x >= cameraX - 80 && eye.x <= cameraX + WIDTH + 80 &&
    eye.y >= cameraY - 80 && eye.y <= cameraY + HEIGHT + 80
  );
  if (eyeIsNearScreen && typeof playTurretLaserSound === "function") {
    playTurretLaserSound();
  }
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
    if (enemy.stateTimer > 0) return false;
    fireMonster3Laser(enemy, playerHitbox);
    enemy.state = "hover";
    enemy.stateTimer = 0;
    enemy.attackTimer = enemy.attackCooldownMin +
      Math.random() * (enemy.attackCooldownMax - enemy.attackCooldownMin);
    return false;
  }

  const eye = monster3EyeOrigin(enemy);
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  const playerNearby = Math.abs(playerCenterX - eye.x) <= enemy.attackRange &&
    Math.abs(playerCenterY - eye.y) <= 640;
  const onScreen = eye.x >= cameraX - 80 && eye.x <= cameraX + WIDTH + 80 &&
    eye.y >= cameraY - 80 && eye.y <= cameraY + HEIGHT + 80;
  if (playerNearby && onScreen && enemy.attackTimer <= 0) {
    faceHostileTowardX(enemy, playerCenterX);
    enemy.state = "charge";
    enemy.stateTimer = enemy.chargeDuration;
    return true;
  }
  return false;
}

function monster5OrbOrigin(enemy) {
  return {
    x: enemy.x + enemy.width / 2 + (enemy.facing || -1) * enemy.width * 0.16,
    y: enemy.y + enemy.height * 0.27,
  };
}

function fireMonster5Orb(enemy, playerHitbox) {
  const origin = monster5OrbOrigin(enemy);
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  const distance = Math.max(1, Math.hypot(targetX - origin.x, targetY - origin.y));
  const directionX = (targetX - origin.x) / distance;
  const directionY = (targetY - origin.y) / distance;
  enemyBullets.push({
    kind: "monster5-orb",
    x: origin.x + directionX * (enemy.orbRadius + 3),
    y: origin.y + directionY * (enemy.orbRadius + 3),
    vx: directionX * enemy.orbSpeed,
    vy: directionY * enemy.orbSpeed,
    speed: enemy.orbSpeed,
    radius: enemy.orbRadius,
    life: enemy.orbLifetime,
    maxLife: enemy.orbLifetime,
    turnSpeed: enemy.orbTurnSpeed,
    explosionRadius: enemy.orbExplosionRadius,
    contactDamageTimer: 0,
    ricochets: 0,
    maxRicochets: 999,
    ricochetScreenEdges: true,
    keepOffscreen: true,
    ricochetColor: "#51dfff",
    phase: Math.random() * Math.PI * 2,
  });
  burst(origin.x, origin.y, "#6ee8ff", 13, 145);
  burst(origin.x, origin.y, "#eefcff", 5, 85);
  shake = Math.max(shake, 4.5);
}

function updateMonster5(enemy, dt, playerHitbox, playerCenterX) {
  enemy.y = enemy.hoverBaseY + Math.sin(
    enemy.animationTime * enemy.hoverSpeed + enemy.animationPhase,
  ) * enemy.hoverAmplitude;
  const patrolX = enemy.hoverAnchorX + Math.sin(
    enemy.animationTime * enemy.patrolSpeed + enemy.animationPhase,
  ) * enemy.patrolRadius;
  const minX = enemy.platform.start + 24;
  const maxX = enemy.platform.end - enemy.width - 24;
  const targetX = Math.max(minX, Math.min(maxX, patrolX));
  const knockback = enemy.hitKnockbackVelocity;
  const moveLimit = enemy.hoverMoveSpeed * dt;
  const nextX = Math.max(minX, Math.min(maxX,
    enemy.x + Math.max(-moveLimit, Math.min(moveLimit, targetX - enemy.x)) +
      knockback * dt,
  ));
  if (!enemyRectOverlapsEnemy(nextX, enemy.y, enemy.width, enemy.height, enemy)) {
    enemy.moving = Math.abs(nextX - enemy.x) > 0.5;
    if (enemy.moving) enemy.facing = Math.sign(nextX - enemy.x) || enemy.facing;
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
    fireMonster5Orb(enemy, playerHitbox);
    enemy.state = "hover";
    enemy.stateTimer = 0;
    enemy.attackTimer = enemy.attackCooldownMin +
      Math.random() * (enemy.attackCooldownMax - enemy.attackCooldownMin);
    return;
  }

  const origin = monster5OrbOrigin(enemy);
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  const playerNearby = Math.abs(playerCenterX - origin.x) <= enemy.attackRange &&
    Math.abs(playerCenterY - origin.y) <= 680;
  const onScreen = origin.x >= cameraX - 90 && origin.x <= cameraX + WIDTH + 90 &&
    origin.y >= cameraY - 90 && origin.y <= cameraY + HEIGHT + 90;
  if (playerNearby && onScreen && enemy.attackTimer <= 0) {
    faceHostileTowardX(enemy, playerCenterX);
    enemy.state = "charge";
    enemy.stateTimer = enemy.chargeDuration;
  }
}

function hostileAttackVideoIsVisible(hostile) {
  const margin = 100;
  const centerX = hostile.x + hostile.width / 2;
  const centerY = hostile.y + hostile.height / 2;
  return (
    centerX >= cameraX - margin && centerX <= cameraX + WIDTH + margin &&
    centerY >= cameraY - margin && centerY <= cameraY + HEIGHT + margin
  );
}

function hostileIsWithinSimulationRange(hostile) {
  const centerX = hostile.x + hostile.width / 2;
  const centerY = hostile.y + hostile.height / 2;
  return (
    centerX >= cameraX - HOSTILE_SIMULATION_MARGIN_X &&
    centerX <= cameraX + WIDTH + HOSTILE_SIMULATION_MARGIN_X &&
    centerY >= cameraY - HOSTILE_SIMULATION_MARGIN_Y &&
    centerY <= cameraY + HEIGHT + HOSTILE_SIMULATION_MARGIN_Y
  );
}

function enemyNeedsContinuousSimulation(enemy) {
  return (
    enemy.revivalKnockback || (enemy.hitTimer ?? 0) > 0 ||
    !["chase", "hover"].includes(enemy.state)
  );
}

function hostileAttackVideoDistance(hostile, playerCenterX, playerCenterY) {
  return Math.hypot(
    hostile.x + hostile.width / 2 - playerCenterX,
    hostile.y + hostile.height / 2 - playerCenterY,
  );
}

function damagePlayerOnHostileContact(hostile, playerHitbox, hostileHitbox = hostile) {
  if (
    (hostile.contactDamageTimer ?? 0) > 0 ||
    !overlapsRects(hostileHitbox, playerHitbox)
  ) return false;
  const shieldChargesBeforeContact = player.accelerationShieldCharges;
  const ramDirection = playerShieldRamDirection(hostile);
  if (!takePlayerDamage(HOSTILE_CONTACT_DAMAGE, hostile)) return false;
  hostile.contactDamageTimer = HOSTILE_CONTACT_COOLDOWN;
  if (
    ramDirection !== 0 &&
    player.accelerationShieldCharges === shieldChargesBeforeContact - 1
  ) {
    damageEnemyWithPlayerShieldRam(hostile, ramDirection);
  }
  if (hostile.state === "jump") hostile.jumpHit = true;
  return true;
}

function updateEnemies(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  const playerFeetY = player.y + player.height;
  let attackVideoCandidate = null;
  let attackVideoDistance = Infinity;
  const considerAttackVideo = (enemy) => {
    if (!hostileAttackVideoIsVisible(enemy)) return;
    const distance = hostileAttackVideoDistance(
      enemy,
      playerCenterX,
      playerCenterY,
    );
    if (distance >= attackVideoDistance) return;
    attackVideoCandidate = enemy;
    attackVideoDistance = distance;
  };

  const nearbyEnemies = typeof hostilesBetween === "function"
    ? hostilesBetween(
      enemies,
      cameraX - HOSTILE_SIMULATION_MARGIN_X,
      cameraX + WIDTH + HOSTILE_SIMULATION_MARGIN_X,
    )
    : enemies;
  const simulationEnemies = new Set(nearbyEnemies);
  if (typeof continuousSimulationEnemies !== "undefined") {
    for (const enemy of continuousSimulationEnemies) {
      if (enemy.alive) simulationEnemies.add(enemy);
      else continuousSimulationEnemies.delete(enemy);
    }
  }

  for (const enemy of simulationEnemies) {
    if (!enemy.alive) continue;
    if (
      !hostileIsWithinSimulationRange(enemy) &&
      !enemyNeedsContinuousSimulation(enemy)
    ) {
      enemy.moving = false;
      enemy.simulationSleeping = true;
      continue;
    }
    enemy.simulationSleeping = false;
    enemy.animationTime += dt;
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - dt);
    enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
    enemy.contactDamageTimer = Math.max(0, (enemy.contactDamageTimer ?? 0) - dt);
    if (enemy.hitTimer <= 0) {
      if (enemy.revivalKnockback) enemy.hitKnockbackVelocity = 0;
      enemy.revivalKnockback = false;
    }
    enemy.moving = false;
    if (
      hostileAttackVideoIsVisible(enemy) &&
      typeof queueEnemyIntroductionVideo === "function"
    ) {
      queueEnemyIntroductionVideo(
        enemy.kind,
        hostileAttackVideoDistance(enemy, playerCenterX, playerCenterY),
      );
    }

    if (enemy.kind === "monster5") {
      updateMonster5(enemy, dt, playerHitbox, playerCenterX);
      damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
      continue;
    }

    if (enemy.kind === "monster3") {
      if (updateMonster3(enemy, dt, playerHitbox, playerCenterX)) {
        considerAttackVideo(enemy);
      }
      damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
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
      const attackStarted = updateMonster2(
        enemy,
        dt,
        playerHitbox,
        playerCenterX,
        playerFeetY,
      );
      if (attackStarted && monster2MouthIsVisible(enemy)) considerAttackVideo(enemy);
      damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
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
    faceHostileTowardX(enemy, playerCenterX);

    const contactDistance = (enemy.width + playerHitbox.width) / 2 - 4;
    if (enemy.hitTimer > 0 && enemy.state !== "jump") {
      updateEnemyHitReaction(enemy, dt);
      damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
      continue;
    }

    const attackStateBeforeUpdate = enemy.state;
    if (enemy.kind === "monster4" &&
        updateMonster4SpearAttack(enemy, dt, playerHitbox, playerCenterX)) {
      if (
        attackStateBeforeUpdate !== "spear-charge" &&
        enemy.state === "spear-charge"
      ) considerAttackVideo(enemy);
      damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
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
      attackStateBeforeUpdate !== "windup" &&
      enemy.state === "windup" &&
      (enemy.kind === "monster1" || enemy.kind === "monster4")
    ) considerAttackVideo(enemy);

    damagePlayerOnHostileContact(enemy, playerHitbox, getEnemyHitbox(enemy));
  }
  for (const enemy of simulationEnemies) {
    if (typeof syncHostileSpatialEntry === "function") {
      syncHostileSpatialEntry(enemies, enemy);
    }
    if (typeof continuousSimulationEnemies === "undefined") continue;
    if (
      enemy.alive &&
      (hostileIsWithinSimulationRange(enemy) || enemyNeedsContinuousSimulation(enemy))
    ) {
      continuousSimulationEnemies.add(enemy);
    } else {
      continuousSimulationEnemies.delete(enemy);
    }
  }
  if (
    attackVideoCandidate &&
    typeof playEnemyAttackVideo === "function"
  ) {
    playEnemyAttackVideo(attackVideoCandidate.kind, gameTime, attackVideoCandidate);
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
  const muzzleIsNearScreen = (
    muzzle.x >= cameraX - 80 && muzzle.x <= cameraX + WIDTH + 80 &&
    muzzle.y >= cameraY - 80 && muzzle.y <= cameraY + HEIGHT + 80
  );
  if (muzzleIsNearScreen) {
    if (typeof playTurretLaserSound === "function") playTurretLaserSound();
    burst(muzzle.x, muzzle.y, "#f04b96", 16, 185);
    burst(muzzle.x, muzzle.y, "#6d153f", 9, 115);
    shake = Math.max(shake, 7);
  }
}

function updateTurrets(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;
  let attackVideoCandidate = null;
  let attackVideoDistance = Infinity;
  const nearbyTurrets = typeof hostilesBetween === "function"
    ? hostilesBetween(
      turrets,
      cameraX - HOSTILE_SIMULATION_MARGIN_X,
      cameraX + WIDTH + HOSTILE_SIMULATION_MARGIN_X,
    )
    : turrets;
  const simulationTurrets = new Set(nearbyTurrets);
  if (typeof activeSimulationTurrets !== "undefined") {
    for (const turret of activeSimulationTurrets) {
      if (turret.alive) simulationTurrets.add(turret);
      else activeSimulationTurrets.delete(turret);
    }
  }

  for (const turret of simulationTurrets) {
    if (!turret.alive) continue;
    if (!hostileIsWithinSimulationRange(turret)) {
      turret.active = false;
      turret.simulationSleeping = true;
      continue;
    }
    turret.simulationSleeping = false;
    const turretCenterX = turret.x + turret.width / 2;
    const turretCenterY = turret.y + turret.height / 2;
    turret.y = (
      platformSurfaceY(turret.platform, turretCenterX) - turret.height
    );
    turret.hitTimer = Math.max(0, turret.hitTimer - dt);
    turret.recoilTimer = Math.max(0, turret.recoilTimer - dt);
    turret.contactDamageTimer = Math.max(
      0,
      (turret.contactDamageTimer ?? 0) - dt,
    );
    if (
      hostileAttackVideoIsVisible(turret) &&
      typeof queueEnemyIntroductionVideo === "function"
    ) {
      queueEnemyIntroductionVideo(
        "turret",
        hostileAttackVideoDistance(turret, playerCenterX, playerCenterY),
      );
    }
    damagePlayerOnHostileContact(turret, playerHitbox);
    const playerInRange = (
      Math.abs(playerCenterX - turretCenterX) <= TURRET.activationRangeX &&
      Math.abs(playerCenterY - turretCenterY) <= TURRET.activationRangeY
    );
    if (playerInRange) faceHostileTowardX(turret, playerCenterX);
    turret.active = true;

    turret.fireTimer -= dt;
    if (turret.burstShotsRemaining === 0 && turret.fireTimer <= TURRET.chargeDuration) {
      if (!turret.attackVideoPrimed) {
        turret.attackVideoPrimed = true;
        if (hostileAttackVideoIsVisible(turret)) {
          const distance = hostileAttackVideoDistance(
            turret,
            playerCenterX,
            playerCenterY,
          );
          if (distance < attackVideoDistance) {
            attackVideoCandidate = turret;
            attackVideoDistance = distance;
          }
        }
      }
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
    if (turret.burstShotsRemaining === 0) turret.attackVideoPrimed = false;
    turret.chargeParticleTimer = 0;
  }
  if (typeof syncHostileSpatialEntry === "function") {
    for (const turret of simulationTurrets) {
      syncHostileSpatialEntry(turrets, turret);
    }
  }
  if (typeof activeSimulationTurrets !== "undefined") {
    for (const turret of simulationTurrets) {
      if (turret.alive && hostileIsWithinSimulationRange(turret)) {
        activeSimulationTurrets.add(turret);
      } else {
        activeSimulationTurrets.delete(turret);
      }
    }
  }
  if (
    attackVideoCandidate &&
    typeof playEnemyAttackVideo === "function"
  ) {
    playEnemyAttackVideo("turret", gameTime, attackVideoCandidate);
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

function finalBossMouthPosition(boss) {
  return {
    x: boss.x + boss.width / 2 + boss.facing * FINAL_BOSS.mouthForwardOffset,
    y: (
      boss.y + boss.height - FINAL_BOSS.mouthBottomOffset +
      FINAL_BOSS.standGroundOffset
    ),
  };
}

function finalBossAimDirection(boss, targetX, targetY) {
  faceHostileTowardX(boss, targetX);
  const mouth = finalBossMouthPosition(boss);
  const forwardDistance = Math.max(1, Math.abs(targetX - mouth.x));
  const rawAngle = Math.atan2(targetY - mouth.y, forwardDistance);
  const angle = Math.max(
    -FINAL_BOSS.beamMaxAngle,
    Math.min(FINAL_BOSS.beamMaxAngle, rawAngle),
  );
  return {
    x: boss.facing * Math.cos(angle),
    y: Math.sin(angle),
  };
}

function finalBossPatternDurations(pattern) {
  if (pattern === "fan") {
    return {
      charge: FINAL_BOSS.fanChargeDuration,
      fire: FINAL_BOSS.fanFireDuration,
    };
  }
  if (pattern === "rain") {
    return {
      charge: FINAL_BOSS.rainChargeDuration,
      fire: FINAL_BOSS.rainFireDuration,
    };
  }
  if (pattern === "dash") {
    return {
      charge: FINAL_BOSS.dashChargeDuration,
      fire: FINAL_BOSS.dashFireDuration,
    };
  }
  if (pattern === "jump-slam") {
    return {
      charge: FINAL_BOSS.jumpChargeDuration,
      fire: FINAL_BOSS.jumpFireDuration,
    };
  }
  return {
    charge: FINAL_BOSS.chargeDuration,
    fire: FINAL_BOSS.fireDuration,
  };
}

function finalBossRainTargets(boss, targetX) {
  const count = FINAL_BOSS.rainProjectileCount;
  const halfSpan = (count - 1) * FINAL_BOSS.rainSpacing / 2;
  const platform = boss.platform;
  const minimumX = platform
    ? Math.min(platform.start, platform.end) + 34
    : targetX - halfSpan;
  const maximumX = platform
    ? Math.max(platform.start, platform.end) - 34
    : targetX + halfSpan;
  const centerX = Math.max(
    minimumX + halfSpan,
    Math.min(maximumX - halfSpan, targetX),
  );
  return Array.from({ length: count }, (_, index) => ({
    x: centerX + (index - (count - 1) / 2) * FINAL_BOSS.rainSpacing,
    fired: false,
  }));
}

function finalBossCanStandOnPlatform(platform, boss) {
  return Boolean(
    platform?.bossCombatPlatform &&
    platform.end - platform.start >= boss.width + 48
  );
}

function finalBossIntendedPlatform(boss) {
  if (finalBossCanStandOnPlatform(player.platform, boss)) return player.platform;
  if (player.platform?.bossSafetyFloor) {
    const arena = platforms.find((platform) => platform.type === "boss-arena");
    if (finalBossCanStandOnPlatform(arena, boss)) return arena;
  }
  return boss.platform;
}

function finalBossPlatformLandingCenter(boss, platform, targetX) {
  const minimumCenterX = Math.min(platform.start, platform.end) +
    boss.width / 2 + 24;
  const maximumCenterX = Math.max(platform.start, platform.end) -
    boss.width / 2 - 24;
  const bossCenterX = boss.x + boss.width / 2;
  const direction = Math.sign(targetX - bossCenterX) || boss.facing || 1;
  const approachX = targetX -
    direction * FINAL_BOSS.platformJumpMinimumPlayerGap;
  const limitedX = bossCenterX + Math.max(
    -FINAL_BOSS.platformJumpMaxDistance,
    Math.min(
      FINAL_BOSS.platformJumpMaxDistance,
      approachX - bossCenterX,
    ),
  );
  return Math.max(minimumCenterX, Math.min(maximumCenterX, limitedX));
}

function finalBossPlatformTier(platform) {
  if (!platform || platform.type === "boss-arena") return 0;
  return platform.bossVerticalTier ?? 0;
}

function finalBossPreferredUpperPlatform(boss, playerCenterX) {
  const currentTier = finalBossPlatformTier(boss.platform);
  if (currentTier >= 2) return null;
  const desiredTier = currentTier + 1;
  const bossCenterX = boss.x + boss.width / 2;
  const bossFootY = boss.y + boss.height;
  let best = null;

  for (const platform of platforms) {
    if (
      platform === boss.platform ||
      finalBossPlatformTier(platform) !== desiredTier ||
      !finalBossCanStandOnPlatform(platform, boss)
    ) continue;
    const landingCenterX = finalBossPlatformLandingCenter(
      boss,
      platform,
      playerCenterX,
    );
    const horizontalTravel = Math.abs(landingCenterX - bossCenterX);
    const landingSurfaceY = platformSurfaceY(platform, landingCenterX);
    const verticalTravel = Math.abs(landingSurfaceY - bossFootY);
    if (
      horizontalTravel > FINAL_BOSS.platformJumpMaxDistance + 0.01 ||
      verticalTravel > FINAL_BOSS.platformJumpMaxHeightDifference
    ) continue;
    if (
      platform === player.platform &&
      Math.abs(landingCenterX - playerCenterX) <
        FINAL_BOSS.platformJumpMinimumPlayerGap
    ) continue;

    // Prefer a nearby upper deck, then the landing point that keeps pressure
    // on the player. This lets the boss climb without making an oversized leap.
    const score = horizontalTravel +
      Math.abs(playerCenterX - landingCenterX) * 0.18;
    if (!best || score < best.score) best = { platform, score };
  }
  return best?.platform ?? null;
}

function finalBossPlayerTargetPlatform(boss, playerCenterX) {
  const intendedPlatform = finalBossIntendedPlatform(boss);
  const currentTier = finalBossPlatformTier(boss.platform);
  const intendedTier = finalBossPlatformTier(intendedPlatform);
  if (
    currentTier < 2 && intendedTier <= currentTier &&
    (boss.upperRouteIntent || intendedPlatform === boss.platform)
  ) {
    const upperPlatform = finalBossPreferredUpperPlatform(boss, playerCenterX);
    if (upperPlatform) {
      boss.upperRouteIntent = finalBossPlatformTier(upperPlatform) < 2;
      return upperPlatform;
    }
    boss.upperRouteIntent = false;
  }
  if (intendedPlatform === boss.platform) return boss.platform;
  const bossCenterX = boss.x + boss.width / 2;
  const bossFootY = boss.y + boss.height;
  const targetCenterX = Math.max(
    Math.min(intendedPlatform.start, intendedPlatform.end),
    Math.min(Math.max(intendedPlatform.start, intendedPlatform.end), playerCenterX),
  );
  const targetSurfaceY = platformSurfaceY(intendedPlatform, targetCenterX);
  const currentDistance = Math.hypot(
    playerCenterX - bossCenterX,
    (targetSurfaceY - bossFootY) * 1.25,
  );
  const direction = Math.sign(playerCenterX - bossCenterX) || boss.facing || 1;
  const currentTierDistance = Math.abs(
    intendedTier - finalBossPlatformTier(boss.platform),
  );
  let best = null;

  for (const platform of platforms) {
    if (platform === boss.platform || !finalBossCanStandOnPlatform(platform, boss)) {
      continue;
    }
    if (
      Math.abs(intendedTier - finalBossPlatformTier(platform)) >
      currentTierDistance
    ) continue;
    const landingCenterX = finalBossPlatformLandingCenter(
      boss,
      platform,
      playerCenterX,
    );
    const horizontalTravel = landingCenterX - bossCenterX;
    if (
      Math.abs(horizontalTravel) > FINAL_BOSS.platformJumpMaxDistance + 0.01 ||
      horizontalTravel * direction < -0.01
    ) continue;
    const landingSurfaceY = platformSurfaceY(platform, landingCenterX);
    const verticalTravel = Math.abs(landingSurfaceY - bossFootY);
    if (verticalTravel > FINAL_BOSS.platformJumpMaxHeightDifference) continue;
    if (
      platform === intendedPlatform &&
      Math.abs(landingCenterX - playerCenterX) <
        FINAL_BOSS.platformJumpMinimumPlayerGap
    ) continue;
    const remainingDistance = Math.hypot(
      playerCenterX - landingCenterX,
      (targetSurfaceY - landingSurfaceY) * 1.25,
    );
    if (remainingDistance >= currentDistance - 4) continue;
    if (!best || remainingDistance < best.remainingDistance) {
      best = { platform, remainingDistance };
    }
  }
  return best?.platform ?? boss.platform;
}

function setFinalBossJumpTarget(boss, targetX, targetPlatform = boss.platform) {
  const platform = finalBossCanStandOnPlatform(targetPlatform, boss)
    ? targetPlatform : boss.platform;
  const minimumCenterX = platform
    ? Math.min(platform.start, platform.end) + boss.width / 2 + 24
    : targetX;
  const maximumCenterX = platform
    ? Math.max(platform.start, platform.end) - boss.width / 2 - 24
    : targetX;
  const targetCenterX = Math.max(
    minimumCenterX,
    Math.min(maximumCenterX, targetX),
  );
  const surfaceY = platform
    ? platformSurfaceY(platform, targetCenterX)
    : boss.y + boss.height;
  boss.jumpTargetX = targetCenterX - boss.width / 2;
  boss.jumpTargetY = surfaceY - boss.height;
  boss.jumpTargetPlatform = platform;
}

function tryPlayFinalBossAttackVoice(boss) {
  if (
    (boss.attackVoiceCooldown ?? 0) > 0 ||
    typeof playEnemyVideoVoice !== "function" ||
    Math.random() >= FINAL_BOSS.attackVoiceChance
  ) return false;
  playEnemyVideoVoice("boss");
  boss.attackVoiceCooldown = FINAL_BOSS.attackVoiceCooldown;
  return true;
}

function prepareFinalBossAttack(boss, playerCenterX, playerCenterY) {
  const patterns = FINAL_BOSS.attackPatterns;
  const patternIndex = (boss.nextAttackIndex ?? 0) % patterns.length;
  const pattern = patterns[patternIndex];
  const durations = finalBossPatternDurations(pattern);
  boss.nextAttackIndex = (patternIndex + 1) % patterns.length;
  boss.attackPattern = pattern;
  boss.patternChargeDuration = durations.charge;
  boss.patternFireDuration = durations.fire;
  boss.attackState = "charge";
  boss.attackTimer = durations.charge;
  boss.patternShotsFired = 0;
  boss.patternShotTimer = 0;
  boss.chargeProgress = 0;
  boss.fireProgress = 0;
  boss.beamTravelDistance = 0;
  boss.rainTargets = pattern === "rain"
    ? finalBossRainTargets(boss, playerCenterX) : [];
  faceHostileTowardX(boss, playerCenterX);
  boss.patternTargetX = playerCenterX;
  boss.patternTargetY = playerCenterY;
  if (pattern === "jump-slam") {
    setFinalBossJumpTarget(
      boss,
      playerCenterX,
      finalBossIntendedPlatform(boss),
    );
  }
  if (pattern === "beam" || pattern === "fan") {
    const direction = finalBossAimDirection(boss, playerCenterX, playerCenterY);
    boss.beamDirectionX = direction.x;
    boss.beamDirectionY = direction.y;
  }
  tryPlayFinalBossAttackVoice(boss);
}

function spawnFinalBossBeamProjectile(boss) {
  const mouth = finalBossMouthPosition(boss);
  const directionX = boss.beamDirectionX || boss.facing || 1;
  const directionY = boss.beamDirectionY || 0;
  enemyBullets.push({
    kind: "final-boss-beam",
    x: mouth.x,
    y: mouth.y,
    vx: directionX * FINAL_BOSS.beamSpeed,
    vy: directionY * FINAL_BOSS.beamSpeed,
    radius: FINAL_BOSS.beamRadius,
    beamLength: FINAL_BOSS.beamRange,
    damage: FINAL_BOSS.beamDamage,
    ricochets: 0,
    maxRicochets: FINAL_BOSS.beamMaxRicochets,
    ricochetScreenEdges: true,
    keepOffscreen: true,
    life: FINAL_BOSS.beamProjectileLife,
    ricochetColor: "#ff5ba8",
  });
}

function spawnFinalBossFanProjectile(boss, projectileIndex) {
  const mouth = finalBossMouthPosition(boss);
  const count = FINAL_BOSS.fanProjectileCount;
  const center = (count - 1) / 2;
  const baseAngle = Math.atan2(
    boss.beamDirectionY,
    Math.max(0.001, Math.abs(boss.beamDirectionX)),
  );
  const index = Math.max(0, Math.min(count - 1, projectileIndex));
  const spreadRatio = center > 0 ? (index - center) / center : 0;
  const angle = Math.max(
    -Math.PI * 0.44,
    Math.min(Math.PI * 0.44, baseAngle + spreadRatio * FINAL_BOSS.fanSpread / 2),
  );
  enemyBullets.push({
    kind: "final-boss-fan",
    x: mouth.x,
    y: mouth.y,
    vx: boss.facing * Math.cos(angle) * FINAL_BOSS.fanProjectileSpeed,
    vy: Math.sin(angle) * FINAL_BOSS.fanProjectileSpeed,
    radius: FINAL_BOSS.fanProjectileRadius,
    ricochets: 0,
    maxRicochets: FINAL_BOSS.fanMaxRicochets,
    ricochetScreenEdges: true,
    keepOffscreen: true,
    life: FINAL_BOSS.fanProjectileLife,
    ricochetColor: "#d9a8ff",
  });
  burst(mouth.x, mouth.y, "#d9a8ff", 9, 165);
  burst(mouth.x, mouth.y, "#fff7ff", 4, 105);
  shake = Math.max(shake, 6.5);
}

function triggerTestFinalBossAttack(pattern) {
  if (!TEST_MODE || !FINAL_BOSS.attackPatterns.includes(pattern)) return false;
  const boss = midBosses.find((candidate) => candidate.finalBoss && candidate.alive);
  if (!boss) return false;

  if (boss.platform) {
    const minimumCenterX = Math.min(boss.platform.start, boss.platform.end) +
      boss.width / 2 + 20;
    const maximumCenterX = Math.max(boss.platform.start, boss.platform.end) -
      boss.width / 2 - 20;
    const centerX = Math.max(
      minimumCenterX,
      Math.min(maximumCenterX, boss.x + boss.width / 2),
    );
    boss.x = centerX - boss.width / 2;
    boss.y = platformSurfaceY(boss.platform, centerX) - boss.height;
    boss.baseY = boss.y;
    boss.targetY = boss.y;
  }
  boss.airborne = false;
  boss.platformJumpActive = false;
  boss.platformJumpTarget = null;
  boss.jumpLanded = false;
  boss.jumpImpactTimer = 0;
  boss.moving = false;
  const playerHitbox = getPlayerHitbox();
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  for (let index = enemyBullets.length - 1; index >= 0; index -= 1) {
    if (enemyBullets[index].kind?.startsWith("final-boss-")) {
      enemyBullets.splice(index, 1);
    }
  }
  boss.nextAttackIndex = FINAL_BOSS.attackPatterns.indexOf(pattern);
  prepareFinalBossAttack(boss, targetX, targetY);
  boss.active = true;
  return true;
}

function spawnFinalBossRainLaser(boss) {
  const target = boss.rainTargets?.[boss.patternShotsFired];
  if (!target) return;
  target.fired = true;
  enemyBullets.push({
    kind: "final-boss-rain",
    x: target.x,
    y: cameraY + 18,
    vx: 0,
    vy: FINAL_BOSS.rainProjectileSpeed,
    radius: 11,
    ricochets: 0,
    maxRicochets: 0,
    life: 2.2,
    ricochetColor: "#ff4f9f",
  });
  burst(target.x, cameraY + 22, "#ff8bdc", 8, 135);
  burst(target.x, cameraY + 22, "#fff2ff", 3, 85);
  shake = Math.max(shake, 6);
}

function beginFinalBossAttack(boss) {
  boss.moving = false;
  boss.attackState = "fire";
  boss.attackTimer = boss.patternFireDuration ?? FINAL_BOSS.fireDuration;
  boss.chargeProgress = 1;
  boss.fireProgress = 0;
  boss.patternShotsFired = 0;
  boss.patternShotTimer = 0;
  boss.beamTravelDistance = 0;
  const mouth = finalBossMouthPosition(boss);
  if (boss.attackPattern === "jump-slam") {
    if (!Number.isFinite(boss.jumpTargetX) || !Number.isFinite(boss.jumpTargetY)) {
      setFinalBossJumpTarget(boss, boss.patternTargetX);
    }
    boss.jumpStartX = boss.x;
    boss.jumpStartY = boss.y;
    boss.jumpLanded = false;
    boss.airborne = true;
    boss.facing = boss.jumpTargetX >= boss.x ? 1 : -1;
    return;
  }
  if (typeof playTurretLaserSound === "function") playTurretLaserSound();
  if (boss.attackPattern === "dash") {
    const platform = boss.platform;
    const minimumX = platform
      ? Math.min(platform.start, platform.end) + 20
      : -Infinity;
    const maximumX = platform
      ? Math.max(platform.start, platform.end) - boss.width - 20
      : Infinity;
    boss.dashDirection = boss.facing || 1;
    boss.dashTargetX = Math.max(
      minimumX,
      Math.min(
        maximumX,
        boss.patternTargetX + boss.dashDirection * FINAL_BOSS.dashPassDistance -
          boss.width / 2,
      ),
    );
    boss.moving = true;
    burst(
      boss.x + boss.width / 2,
      boss.y + boss.height * 0.66,
      "#ff326c",
      26,
      340,
    );
    shake = Math.max(shake, 10);
    return;
  }
  if (boss.attackPattern === "beam") {
    spawnFinalBossBeamProjectile(boss);
  }
  burst(mouth.x, mouth.y, "#ff4f9f", 28, 290);
  burst(mouth.x, mouth.y, "#ffe6ff", 14, 185);
  shake = Math.max(shake, boss.attackPattern === "beam" ? 13 : 8);
}

function moveFinalBossTowardPlayer(boss, dt, playerCenterX) {
  const bossCenterX = boss.x + boss.width / 2;
  const horizontalDistance = playerCenterX - bossCenterX;
  faceHostileTowardX(boss, playerCenterX);
  if (Math.abs(horizontalDistance) <= FINAL_BOSS.chaseStopDistance) return false;

  const platform = boss.platform;
  const minimumX = platform
    ? Math.min(platform.start, platform.end) + 20
    : -Infinity;
  const maximumX = platform
    ? Math.max(platform.start, platform.end) - boss.width - 20
    : Infinity;
  const requestedMovement = Math.sign(horizontalDistance) * FINAL_BOSS.moveSpeed * dt;
  const nextX = Math.max(minimumX, Math.min(maximumX, boss.x + requestedMovement));
  const moved = Math.abs(nextX - boss.x) > 0.001;
  boss.x = nextX;
  if (moved && platform) {
    const updatedCenterX = boss.x + boss.width / 2;
    const surfaceY = platformSurfaceY(platform, updatedCenterX);
    boss.y = surfaceY - boss.height;
    boss.baseY = boss.y;
    boss.targetY = boss.y;
  }
  return moved;
}

function beginFinalBossPlatformJump(boss, targetPlatform, targetX) {
  if (
    boss.platformJumpActive || targetPlatform === boss.platform ||
    !finalBossCanStandOnPlatform(targetPlatform, boss)
  ) return false;
  const bossCenterX = boss.x + boss.width / 2;
  const startSurfaceY = boss.y + boss.height;
  const targetCenterX = finalBossPlatformLandingCenter(
    boss,
    targetPlatform,
    targetX,
  );
  const targetSurfaceY = platformSurfaceY(targetPlatform, targetCenterX);
  const horizontalTravel = Math.abs(targetCenterX - bossCenterX);
  const verticalTravel = Math.abs(targetSurfaceY - startSurfaceY);
  if (
    horizontalTravel > FINAL_BOSS.platformJumpMaxDistance + 0.01 ||
    verticalTravel > FINAL_BOSS.platformJumpMaxHeightDifference ||
    (
      targetPlatform === player.platform &&
      Math.abs(targetCenterX - targetX) <
        FINAL_BOSS.platformJumpMinimumPlayerGap
    )
  ) return false;
  boss.platformJumpActive = true;
  boss.platformJumpProgress = 0;
  boss.platformJumpTarget = targetPlatform;
  boss.platformJumpStartX = boss.x;
  boss.platformJumpStartY = boss.y;
  boss.platformJumpTargetX = targetCenterX - boss.width / 2;
  boss.platformJumpTargetY = targetSurfaceY - boss.height;
  boss.platformJumpArcHeight = Math.min(
    FINAL_BOSS.platformJumpHeight,
    Math.max(72, horizontalTravel * 0.2 + verticalTravel * 0.32),
  );
  boss.platformJumpEffectTimer = 0;
  boss.facing = boss.platformJumpTargetX >= boss.x ? 1 : -1;
  boss.airborne = true;
  boss.moving = true;
  const takeoffX = boss.x + boss.width / 2;
  const takeoffY = boss.y + boss.height;
  burst(takeoffX, takeoffY, "#7b2c22", 11, 145);
  burst(takeoffX, takeoffY - 4, "#dc8a54", 6, 205);
  shake = Math.max(shake, 3.5);
  return true;
}

function updateFinalBossPlatformJump(boss, dt) {
  if (!boss.platformJumpActive) return false;
  const duration = Math.max(0.01, FINAL_BOSS.platformJumpDuration);
  boss.platformJumpProgress = Math.min(
    1,
    (boss.platformJumpProgress ?? 0) + dt / duration,
  );
  const progress = boss.platformJumpProgress;
  const easedProgress = progress * progress * (3 - 2 * progress);
  boss.x = boss.platformJumpStartX +
    (boss.platformJumpTargetX - boss.platformJumpStartX) * easedProgress;
  const groundY = boss.platformJumpStartY +
    (boss.platformJumpTargetY - boss.platformJumpStartY) * easedProgress;
  boss.y = groundY - Math.sin(progress * Math.PI) * boss.platformJumpArcHeight;
  boss.platformJumpEffectTimer = (boss.platformJumpEffectTimer ?? 0) - dt;
  if (
    progress > 0.08 && progress < 0.9 &&
    boss.platformJumpEffectTimer <= 0
  ) {
    const trailX = boss.x + boss.width / 2 - boss.facing * boss.width * 0.2;
    const trailY = boss.y + boss.height * 0.72;
    burst(trailX, trailY, "#a9583d", 2, 58);
    boss.platformJumpEffectTimer += 0.11;
  }
  boss.moving = true;
  boss.airborne = progress < 1;
  if (progress < 1) return true;

  boss.x = boss.platformJumpTargetX;
  boss.y = boss.platformJumpTargetY;
  boss.baseY = boss.y;
  boss.targetY = boss.y;
  boss.platform = boss.platformJumpTarget;
  boss.group = boss.platform?.group ?? boss.group;
  boss.platformJumpActive = false;
  boss.platformJumpTarget = null;
  boss.platformJumpCooldown = FINAL_BOSS.platformJumpCooldown;
  boss.airborne = false;
  boss.moving = false;
  if (typeof playMetalHitSound === "function") playMetalHitSound();
  burst(
    boss.x + boss.width / 2,
    boss.y + boss.height,
    "#d7d0c7",
    12,
    155,
  );
  burst(
    boss.x + boss.width / 2,
    boss.y + boss.height - 3,
    "#8f3528",
    10,
    190,
  );
  shake = Math.max(shake, 7);
  return true;
}

function moveFinalBossDash(boss, dt) {
  const direction = boss.dashDirection || boss.facing || 1;
  const targetX = boss.dashTargetX ?? boss.x;
  const requestedX = boss.x + direction * FINAL_BOSS.dashSpeed * dt;
  const nextX = direction > 0
    ? Math.min(requestedX, targetX)
    : Math.max(requestedX, targetX);
  const moved = Math.abs(nextX - boss.x) > 0.001;
  boss.x = nextX;
  boss.facing = direction;
  if (moved && boss.platform) {
    const centerX = boss.x + boss.width / 2;
    const surfaceY = platformSurfaceY(boss.platform, centerX);
    boss.y = surfaceY - boss.height;
    boss.baseY = boss.y;
    boss.targetY = boss.y;
  }
  return moved;
}

function resolveFinalBossJumpImpact(boss, playerHitbox) {
  if (boss.jumpLanded) return;
  boss.jumpLanded = true;
  boss.airborne = false;
  boss.x = boss.jumpTargetX;
  boss.y = boss.jumpTargetY;
  if (boss.jumpTargetPlatform) {
    boss.platform = boss.jumpTargetPlatform;
    boss.group = boss.platform.group ?? boss.group;
  }
  boss.jumpTargetPlatform = null;
  boss.baseY = boss.y;
  boss.targetY = boss.y;
  boss.jumpImpactTimer = FINAL_BOSS.jumpImpactDuration;
  const impactX = boss.x + boss.width / 2;
  const impactY = boss.y + boss.height;
  if (typeof playMetalHitSound === "function") playMetalHitSound();
  shake = Math.max(shake, 17);
  if (overlapsCircleRect({
    x: impactX,
    y: impactY - 10,
    radius: FINAL_BOSS.jumpImpactRadius,
  }, playerHitbox)) {
    takePlayerDamage(1, {
      kind: "final-boss-jump",
      x: impactX,
      y: impactY,
      vx: boss.facing,
    });
  }
}

function updateFinalBossJumpSlam(boss, playerHitbox) {
  const progress = Math.max(0, Math.min(1, boss.fireProgress ?? 0));
  const easedProgress = progress * progress * (3 - 2 * progress);
  boss.x = boss.jumpStartX + (boss.jumpTargetX - boss.jumpStartX) * easedProgress;
  const groundY = boss.jumpStartY +
    (boss.jumpTargetY - boss.jumpStartY) * easedProgress;
  boss.y = groundY - Math.sin(progress * Math.PI) * FINAL_BOSS.jumpHeight;
  boss.moving = false;
  boss.airborne = progress < 1;
  if (progress >= 1) resolveFinalBossJumpImpact(boss, playerHitbox);
}

function updateFinalBossAttack(
  boss,
  dt,
  playerHitbox,
  playerCenterX,
  playerCenterY,
  withinActivationRange,
) {
  boss.phase += dt;
  boss.animationTime = (boss.animationTime ?? 0) + dt;
  boss.attackVoiceCooldown = Math.max(
    0,
    (boss.attackVoiceCooldown ?? FINAL_BOSS.attackVoiceInitialDelay) - dt,
  );
  boss.jumpImpactTimer = Math.max(0, (boss.jumpImpactTimer ?? 0) - dt);
  boss.platformJumpCooldown = Math.max(
    0,
    (boss.platformJumpCooldown ?? 0) - dt,
  );
  const state = boss.attackState ?? "idle";

  if (state === "idle" && !withinActivationRange) {
    boss.active = false;
    boss.attackTimer = FINAL_BOSS.idleDuration;
    boss.chargeProgress = 0;
    boss.fireProgress = 0;
    boss.moving = false;
    boss.airborne = false;
    faceHostileTowardX(boss, playerCenterX);
    return;
  }

  boss.active = true;
  boss.attackTimer = Math.max(0, (boss.attackTimer ?? 0) - dt);

  if (state === "idle") {
    boss.moving = false;
    faceHostileTowardX(boss, playerCenterX);
    boss.chargeProgress = 0;
    boss.fireProgress = 0;
    if (boss.attackTimer <= 0) {
      boss.attackState = "move";
      boss.attackTimer = FINAL_BOSS.moveDuration;
    }
    return;
  }

  if (state === "move") {
    boss.chargeProgress = 0;
    boss.fireProgress = 0;
    if (boss.platformJumpActive) {
      updateFinalBossPlatformJump(boss, dt);
      return;
    }
    const targetPlatform = finalBossPlayerTargetPlatform(boss, playerCenterX);
    if (
      boss.platformJumpCooldown <= 0 && targetPlatform !== boss.platform &&
      beginFinalBossPlatformJump(boss, targetPlatform, playerCenterX)
    ) {
      updateFinalBossPlatformJump(boss, dt);
      return;
    }
    boss.moving = moveFinalBossTowardPlayer(boss, dt, playerCenterX);
    if (boss.attackTimer <= 0) {
      boss.moving = false;
      prepareFinalBossAttack(boss, playerCenterX, playerCenterY);
    }
    return;
  }

  if (state === "charge") {
    boss.moving = false;
    if (boss.attackPattern === "beam" || boss.attackPattern === "fan") {
      const direction = finalBossAimDirection(boss, playerCenterX, playerCenterY);
      boss.beamDirectionX = direction.x;
      boss.beamDirectionY = direction.y;
    } else if (boss.attackPattern === "jump-slam") {
      boss.facing = boss.jumpTargetX >= boss.x ? 1 : -1;
    } else {
      faceHostileTowardX(boss, playerCenterX);
    }
    boss.patternTargetX = playerCenterX;
    boss.patternTargetY = playerCenterY;
    const chargeDuration = boss.patternChargeDuration ?? FINAL_BOSS.chargeDuration;
    boss.chargeProgress = 1 - boss.attackTimer / chargeDuration;
    boss.fireProgress = 0;
    if (boss.attackTimer <= 0) beginFinalBossAttack(boss);
    return;
  }

  if (state === "fire") {
    const fireDuration = boss.patternFireDuration ?? FINAL_BOSS.fireDuration;
    boss.chargeProgress = 1;
    boss.fireProgress = 1 - boss.attackTimer / fireDuration;
    if (boss.attackPattern === "beam") {
      boss.moving = false;
    } else if (boss.attackPattern === "fan") {
      boss.moving = false;
      boss.patternShotTimer -= dt;
      while (
        boss.patternShotsFired < FINAL_BOSS.fanProjectileCount &&
        boss.patternShotTimer <= 0
      ) {
        spawnFinalBossFanProjectile(boss, boss.patternShotsFired);
        boss.patternShotsFired += 1;
        boss.patternShotTimer += FINAL_BOSS.fanProjectileInterval;
      }
    } else if (boss.attackPattern === "rain") {
      boss.moving = false;
      boss.patternShotTimer -= dt;
      while (
        boss.patternShotsFired < FINAL_BOSS.rainProjectileCount &&
        boss.patternShotTimer <= 0
      ) {
        spawnFinalBossRainLaser(boss);
        boss.patternShotsFired += 1;
        boss.patternShotTimer += FINAL_BOSS.rainProjectileInterval;
      }
    } else if (boss.attackPattern === "dash") {
      boss.moving = moveFinalBossDash(boss, dt);
      shake = Math.max(shake, boss.moving ? 4.5 : 2);
    } else if (boss.attackPattern === "jump-slam") {
      updateFinalBossJumpSlam(boss, playerHitbox);
    } else {
      boss.moving = false;
    }
    if (boss.attackTimer <= 0) {
      boss.attackState = "recovery";
      boss.attackTimer = FINAL_BOSS.recoveryDuration;
      boss.chargeProgress = 0;
      boss.fireProgress = 0;
      boss.patternShotTimer = 0;
      boss.airborne = false;
    }
    return;
  }

  boss.chargeProgress = 0;
  boss.fireProgress = 0;
  boss.moving = false;
  if (boss.attackTimer <= 0) {
    boss.attackState = "idle";
    boss.attackTimer = FINAL_BOSS.idleDuration;
  }
}

function updateMidBosses(dt) {
  const playerHitbox = getPlayerHitbox();
  const playerCenterX = playerHitbox.x + playerHitbox.width / 2;
  const playerCenterY = playerHitbox.y + playerHitbox.height / 2;

  for (const boss of midBosses) {
    if (!boss.alive) continue;
    const bossCenterX = boss.x + boss.width / 2;
    const bossCenterY = boss.y + boss.height / 2;
    const activationRangeX = boss.finalBoss
      ? FINAL_BOSS.activationRangeX : MID_BOSS.activationRangeX;
    const activationRangeY = boss.finalBoss
      ? FINAL_BOSS.activationRangeY : MID_BOSS.activationRangeY;
    const withinActivationRange = (
      Math.abs(playerCenterX - bossCenterX) <= activationRangeX &&
      Math.abs(playerCenterY - bossCenterY) <= activationRangeY
    );
    if (boss.finalBoss) {
      if (
        withinActivationRange && hostileAttackVideoIsVisible(boss) &&
        typeof queueEnemyIntroductionVideo === "function"
      ) {
        const introductionQueued = queueEnemyIntroductionVideo(
          "boss",
          hostileAttackVideoDistance(boss, playerCenterX, playerCenterY),
        );
        if (introductionQueued) {
          boss.attackVoiceCooldown = Math.max(
            boss.attackVoiceCooldown ?? 0,
            FINAL_BOSS.attackVoiceCooldown,
          );
        }
      }
      updateFinalBossAttack(
        boss,
        dt,
        playerHitbox,
        playerCenterX,
        playerCenterY,
        currentArea === "boss" || withinActivationRange,
      );
      if (player.invincible <= 0 && overlapsRects(boss, playerHitbox)) {
        takePlayerDamage(1, {
          x: boss.x + boss.width / 2,
          y: boss.y + boss.height / 2,
          kind: "boss",
        });
      }
      continue;
    }
    if (boss.idleOnly) {
      boss.active = withinActivationRange;
      boss.phase += dt;
      boss.animationTime = (boss.animationTime ?? 0) + dt;
      faceHostileTowardX(boss, playerCenterX);
      continue;
    }
    if (!withinActivationRange) {
      boss.active = false;
      continue;
    }

    boss.active = true;
    boss.phase += dt;
    faceHostileTowardX(boss, playerCenterX);
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
