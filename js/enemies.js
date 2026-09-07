"use strict";

// Regular enemy and mid-boss behavior.

function enemySurfaceY(enemy) {
  return platformSurfaceY(enemy.platform, enemy.x + enemy.width / 2);
}

function clampEnemyXToPlatform(enemy, x) {
  return Math.max(
    enemy.platform.start + 8,
    Math.min(enemy.platform.end - enemy.width - 8, x),
  );
}

function launchEnemyJump(enemy, playerCenterX) {
  const enemyCenterX = enemy.x + enemy.width / 2;
  const distance = playerCenterX - enemyCenterX;
  const direction = distance === 0 ? enemy.facing : Math.sign(distance);
  const flightTime = Math.max(
    0.35,
    (enemy.jumpLaunchSpeed * 2) / enemy.jumpGravity,
  );
  const targetSpeed = Math.abs(distance) / flightTime;

  enemy.facing = direction;
  enemy.jumpVx = direction * Math.max(
    enemy.jumpMinHorizontalSpeed,
    Math.min(enemy.jumpMaxHorizontalSpeed, targetSpeed),
  );
  enemy.jumpVy = -enemy.jumpLaunchSpeed;
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

function updateJumpingEnemy(enemy, dt) {
  const nextX = enemy.x + enemy.jumpVx * dt;
  const clampedX = clampEnemyXToPlatform(enemy, nextX);
  enemy.x = clampedX;
  if (clampedX !== nextX) enemy.jumpVx = 0;

  enemy.jumpVy = Math.min(760, enemy.jumpVy + enemy.jumpGravity * dt);
  enemy.y += enemy.jumpVy * dt;
  const surfaceY = enemySurfaceY(enemy);
  if (enemy.jumpVy < 0 || enemy.y + enemy.height < surfaceY) return;

  enemy.y = surfaceY - enemy.height;
  enemy.jumpVx = 0;
  enemy.jumpVy = 0;
  enemy.state = "recover";
  enemy.stateTimer = enemy.jumpRecoveryDuration;
  enemy.jumpCooldown = enemy.jumpCooldownDuration * (0.82 + Math.random() * 0.36);
  shake = Math.max(shake, 2.4);
  burst(
    enemy.x + enemy.width / 2,
    surfaceY,
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
    enemy.moving = false;

    if (enemy.state !== "jump") {
      enemy.y = enemySurfaceY(enemy) - enemy.height;
    }

    const enemyCenterX = enemy.x + enemy.width / 2;
    const distance = playerCenterX - enemyCenterX;
    const sameHeight = Math.abs(enemySurfaceY(enemy) - playerFeetY) < 72;
    if (Math.abs(distance) > 1) enemy.facing = Math.sign(distance);

    const contactDistance = (enemy.width + playerHitbox.width) / 2 - 4;
    const wasJumping = enemy.state === "jump";

    if (enemy.state === "windup") {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) launchEnemyJump(enemy, playerCenterX);
    } else if (enemy.state === "jump") {
      updateJumpingEnemy(enemy, dt);
    } else if (enemy.state === "recover") {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) enemy.state = "chase";
    } else if (
      sameHeight &&
      Math.abs(distance) <= enemy.jumpAttackRange &&
      enemy.jumpCooldown <= 0
    ) {
      enemy.state = "windup";
      enemy.stateTimer = enemy.jumpWindupDuration;
    } else if (
      sameHeight &&
      Math.abs(distance) < enemy.chaseRange &&
      Math.abs(distance) > contactDistance
    ) {
      const nextX = clampEnemyXToPlatform(
        enemy,
        enemy.x + Math.sign(distance) * enemy.speed * dt,
      );
      enemy.moving = Math.abs(nextX - enemy.x) > 0.01;
      enemy.x = nextX;
      enemy.y = enemySurfaceY(enemy) - enemy.height;
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
