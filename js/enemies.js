"use strict";

// Regular enemy and mid-boss behavior.

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

  enemy.x = nextCenterX - enemy.width / 2;
  enemy.y = ground.surfaceY - enemy.height;
  enemy.platform = ground.platform;
  enemy.moving = Math.abs(nextCenterX - currentCenterX) > 0.01;
  return true;
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
  if (!moveEnemyAlongGround(enemy, direction, dt, speed)) {
    enemy.hitKnockbackVelocity = 0;
    return;
  }
  enemy.hitKnockbackVelocity *= Math.exp(-enemy.hitKnockbackDamping * dt);
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
  enemy.jumpMode = "gap";
  launchEnemyJump(
    enemy,
    landing.landingX,
    landing.surfaceY,
    enemy.jumpGapMinHorizontalSpeed,
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
    enemy.moving = false;

    if (enemy.state !== "jump") {
      enemy.y = enemySurfaceY(enemy) - enemy.height;
    }

    const enemyCenterX = enemy.x + enemy.width / 2;
    const distance = playerCenterX - enemyCenterX;
    const surfaceY = enemySurfaceY(enemy);
    const playerVerticalDistance = playerFeetY - surfaceY;
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
      overlapsRects(enemy, playerHitbox)
    ) {
      player.hp -= 1;
      player.invincible = 1.3;
      enemy.attackTimer = enemy.attackCooldown;
      enemy.jumpHit = true;
      shake = 12;
      burst(
        playerHitbox.x + playerHitbox.width / 2,
        playerHitbox.y + playerHitbox.height / 2,
        "#ff704f",
        16,
        250,
      );
      if (player.hp <= 0) gameOver = true;
    }
  }
}

function turretMuzzlePosition(turret) {
  const bottomY = turret.y + turret.height;
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

function fireTurretLaser(turret) {
  const muzzle = turretMuzzlePosition(turret);
  const playerHitbox = getPlayerHitbox();
  const targetX = playerHitbox.x + playerHitbox.width / 2;
  const targetY = playerHitbox.y + playerHitbox.height / 2;
  const distance = Math.max(1, Math.hypot(targetX - muzzle.x, targetY - muzzle.y));
  const directionX = (targetX - muzzle.x) / distance;
  const directionY = (targetY - muzzle.y) / distance;

  enemyBullets.push({
    kind: "turret-laser",
    x: muzzle.x,
    y: muzzle.y,
    vx: directionX * TURRET.laserSpeed,
    vy: directionY * TURRET.laserSpeed,
    radius: TURRET.laserRadius,
    ricochets: 0,
    maxRicochets: TURRET.laserRicochets,
    ricochetColor: "#8a24d6",
  });
  turret.recoilTimer = 0.2;
  burst(muzzle.x, muzzle.y, "#bd4fff", 16, 185);
  burst(muzzle.x, muzzle.y, "#421063", 9, 115);
  shake = Math.max(shake, 7);
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
    if (Math.abs(playerCenterX - turretCenterX) > 1) {
      turret.facing = Math.sign(playerCenterX - turretCenterX);
    }

    turret.active = (
      Math.abs(playerCenterX - turretCenterX) <= TURRET.activationRangeX &&
      Math.abs(playerCenterY - turretCenterY) <= TURRET.activationRangeY
    );
    if (!turret.active) continue;

    turret.fireTimer -= dt;
    if (turret.fireTimer <= TURRET.chargeDuration) {
      turret.chargeParticleTimer -= dt;
      if (turret.chargeParticleTimer <= 0) {
        const muzzle = turretMuzzlePosition(turret);
        const chargeProgress = Math.max(
          0,
          1 - turret.fireTimer / TURRET.chargeDuration,
        );
        burst(
          muzzle.x,
          muzzle.y,
          chargeProgress > 0.68 ? "#d45cff" : "#7117aa",
          1,
          35 + chargeProgress * 35,
        );
        turret.chargeParticleTimer = 0.12 - chargeProgress * 0.065;
      }
    }

    if (turret.fireTimer > 0) continue;
    fireTurretLaser(turret);
    turret.fireTimer = TURRET.fireInterval;
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
      player.hp -= 1;
      player.invincible = 1.3;
      shake = 14;
      burst(playerCenterX, playerCenterY, "#ff65d9", 18, 275);
      if (player.hp <= 0) gameOver = true;
    }
  }
}
