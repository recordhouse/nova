"use strict";

// Player fire, projectile collision, ricochets, and bullet updates.

function burst(x, y, color, count = 10, force = 220) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = force * (0.25 + Math.random() * 0.75);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.25 + Math.random() * 0.35,
      maxLife: 0.6,
      color,
      size: 2 + Math.random() * 5,
    });
  }
}

function burstMonsterFragments(bullet, enemy, lethal = false) {
  const bulletSpeed = Math.max(1, Math.hypot(bullet.vx, bullet.vy));
  const baseAngle = Math.atan2(bullet.vy, bullet.vx);
  const colors = ["#70ff37", "#c9ff55", "#34ba32", "#713aa0", "#2b1647"];
  const count = lethal ? 30 : 16;
  const spread = lethal ? Math.PI * 0.9 : Math.PI * 0.58;

  for (let i = 0; i < count; i += 1) {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const force = (lethal ? 390 : 275) * (0.38 + Math.random() * 0.62);
    const life = 0.3 + Math.random() * (lethal ? 0.42 : 0.28);
    particles.push({
      x: bullet.x + bullet.vx / bulletSpeed * 4,
      y: bullet.y + bullet.vy / bulletSpeed * 4,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 35 - Math.random() * 55,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2.5 + Math.random() * (lethal ? 6 : 4.5),
      shard: true,
    });
  }
}

function applyEnemyBulletImpact(enemy, bullet) {
  const direction = Math.sign(bullet.vx) || enemy.facing;
  enemy.hitDirection = direction;
  enemy.hitTimer = enemy.hitDuration;
  enemy.hitKnockbackVelocity = Math.max(
    -enemy.hitKnockbackMaxSpeed,
    Math.min(
      enemy.hitKnockbackMaxSpeed,
      enemy.hitKnockbackVelocity + direction * enemy.hitKnockbackSpeed,
    ),
  );
  if (enemy.state === "jump") {
    enemy.jumpVx = Math.max(
      -enemy.jumpMaxHorizontalSpeed,
      Math.min(
        enemy.jumpMaxHorizontalSpeed,
        enemy.jumpVx + direction * enemy.hitAirImpulse,
      ),
    );
  }
}

function shootPlayer() {
  const direction = playerFireDirection();
  const isHighAim = playerIsAimingHigh();
  const isCrouchFiring = player.crouching && player.grounded;
  const isAirFiring = !player.grounded;
  const firingSpriteScale = isCrouchFiring
    ? PLAYER_BLAST_SIT_SPRITE_SCALE
    : isAirFiring
      ? PLAYER_JUMP_SPRITE_SCALE
      : PLAYER_BLAST_SPRITE_SCALE;
  const firedUpperBarrel = player.fireBarrel === 0;
  const barrelOffsetY = firedUpperBarrel
    ? -PLAYER_MUZZLE_BARREL_OFFSET * firingSpriteScale
    : PLAYER_MUZZLE_BARREL_OFFSET * firingSpriteScale;
  const originX = player.x + player.width / 2;
  const blastDrawHeight = PLAYER_SPRITE_DRAW_HEIGHT * firingSpriteScale;
  const spriteTopY = player.y + player.height - blastDrawHeight;
  const originY = (
    spriteTopY +
    blastDrawHeight * PLAYER_MUZZLE_HEIGHT_RATIO +
    PLAYER_MUZZLE_VERTICAL_OFFSET +
    (isCrouchFiring ? blastDrawHeight * PLAYER_CROUCH_MUZZLE_LOWER_RATIO : 0)
  );
  const muzzleForwardOffset = PLAYER_MUZZLE_FORWARD_OFFSET * firingSpriteScale;
  const muzzleX = (
    originX +
    direction.x * muzzleForwardOffset +
    (isHighAim ? player.facing * PLAYER_HIGH_MUZZLE_FORWARD_ADJUST : 0)
  );
  const muzzleY = (
    originY +
    direction.y * muzzleForwardOffset +
    barrelOffsetY +
    (isHighAim ? PLAYER_HIGH_MUZZLE_VERTICAL_ADJUST : 0) +
    (isAirFiring ? PLAYER_AIR_MUZZLE_VERTICAL_ADJUST : 0)
  );
  bullets.push({
    x: muzzleX,
    y: muzzleY,
    vx: direction.x * 760,
    vy: direction.y * 760,
    radius: 5,
    ricochets: 0,
  });
  burst(muzzleX, muzzleY, "#c9a7ff", 4, 90);
  player.fireBarrel = firedUpperBarrel ? 1 : 0;
  player.fireTimer = firedUpperBarrel
    ? PLAYER_FIRE_STAGGER_DELAY
    : PLAYER_FIRE_PAIR_DELAY;
  shake = Math.max(shake, 2.5);
}

function playerFireDirection() {
  const angle = playerIsAimingHigh() ? FIRE_AIM_ANGLE_DIAGONAL : 0;
  return {
    x: player.facing * Math.cos(angle),
    y: -Math.sin(angle),
  };
}

function playerIsAimingHigh() {
  return (
    controls.fire &&
    controls.up &&
    !(player.crouching && player.grounded)
  );
}

function overlapsCircleRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.radius;
}

function overlapsRects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function getPlayerHitbox() {
  const crouching = player.crouching && player.grounded;
  const width = crouching ? PLAYER_CROUCH_HITBOX_WIDTH : PLAYER_HITBOX_WIDTH;
  const height = crouching ? PLAYER_CROUCH_HITBOX_HEIGHT : PLAYER_HITBOX_HEIGHT;
  const centerX = player.x + player.width / 2;
  const feetY = player.y + player.height;
  return {
    x: centerX - width / 2,
    y: feetY - height,
    width,
    height,
  };
}

function projectileSurfaceCollision(bullet, previousX, previousY) {
  const collisionForRect = (rect) => {
    if (!overlapsCircleRect(bullet, rect)) return null;

    const left = rect.x - bullet.radius;
    const right = rect.x + rect.width + bullet.radius;
    const top = rect.y - bullet.radius;
    const bottom = rect.y + rect.height + bullet.radius;
    if (previousX <= left) return { rect, normalX: -1, normalY: 0 };
    if (previousX >= right) return { rect, normalX: 1, normalY: 0 };
    if (previousY <= top) return { rect, normalX: 0, normalY: -1 };
    if (previousY >= bottom) return { rect, normalX: 0, normalY: 1 };

    const nearestEdge = [
      { distance: Math.abs(bullet.x - left), normalX: -1, normalY: 0 },
      { distance: Math.abs(right - bullet.x), normalX: 1, normalY: 0 },
      { distance: Math.abs(bullet.y - top), normalX: 0, normalY: -1 },
      { distance: Math.abs(bottom - bullet.y), normalX: 0, normalY: 1 },
    ].sort((a, b) => a.distance - b.distance)[0];
    return { rect, ...nearestEdge };
  };

  const collisionForRamp = (ramp) => {
    if (
      bullet.x < ramp.start - bullet.radius ||
      bullet.x > ramp.end + bullet.radius
    ) return null;

    const span = ramp.exitX - ramp.entryX;
    if (span === 0) return null;
    const slope = (ramp.exitY - ramp.entryY) / span;
    const normalLength = Math.hypot(slope, 1);
    const surfaceY = platformSurfaceY(ramp, bullet.x);
    const previousSurfaceY = platformSurfaceY(ramp, previousX);
    const signedDistance = (bullet.y - surfaceY) / normalLength;
    const previousSignedDistance = (previousY - previousSurfaceY) / normalLength;
    const thickness = PLATFORM_DECK_THICKNESS / normalLength;
    if (
      signedDistance <= -bullet.radius ||
      signedDistance >= thickness + bullet.radius
    ) return null;

    const hitTop = previousSignedDistance <= 0 || (
      previousSignedDistance < thickness &&
      Math.abs(signedDistance) <= Math.abs(thickness - signedDistance)
    );
    const normalX = hitTop ? slope / normalLength : -slope / normalLength;
    const normalY = hitTop ? -1 / normalLength : 1 / normalLength;
    const correction = hitTop
      ? signedDistance + bullet.radius + 0.01
      : thickness + bullet.radius - signedDistance + 0.01;
    return {
      normalX,
      normalY,
      resolveX: bullet.x + normalX * correction,
      resolveY: bullet.y + normalY * correction,
    };
  };

  const collisionForInvertedTrianglePlatform = (platform) => {
    const centerX = (platform.start + platform.end) / 2;
    const apexY = platform.y + invertedTrianglePlatformDepth(platform);
    const vertices = [
      { x: platform.start, y: platform.y - 5 },
      { x: platform.end, y: platform.y - 5 },
      { x: centerX, y: apexY },
    ];
    let nearestCollision = null;

    for (let edge = 0; edge < vertices.length; edge += 1) {
      const start = vertices[edge];
      const end = vertices[(edge + 1) % vertices.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const edgeLengthSquared = dx * dx + dy * dy;
      const progress = Math.max(0, Math.min(1, (
        (bullet.x - start.x) * dx + (bullet.y - start.y) * dy
      ) / edgeLengthSquared));
      const closestX = start.x + dx * progress;
      const closestY = start.y + dy * progress;
      const distance = Math.hypot(bullet.x - closestX, bullet.y - closestY);
      if (distance > bullet.radius) continue;

      const edgeLength = Math.sqrt(edgeLengthSquared);
      const outwardNormalX = dy / edgeLength;
      const outwardNormalY = -dx / edgeLength;
      const previousSide = (
        (previousX - start.x) * outwardNormalX +
        (previousY - start.y) * outwardNormalY
      );
      const normalX = previousSide >= 0 ? outwardNormalX : -outwardNormalX;
      const normalY = previousSide >= 0 ? outwardNormalY : -outwardNormalY;
      const collision = {
        distance,
        normalX,
        normalY,
        resolveX: closestX + normalX * (bullet.radius + 0.01),
        resolveY: closestY + normalY * (bullet.radius + 0.01),
      };
      if (!nearestCollision || collision.distance < nearestCollision.distance) {
        nearestCollision = collision;
      }
    }

    return nearestCollision;
  };

  for (const platform of platforms) {
    if (platform.kind === "ramp") {
      const collision = collisionForRamp(platform);
      if (collision) return collision;
      continue;
    }
    if (isInvertedTrianglePlatform(platform)) {
      const collision = collisionForInvertedTrianglePlatform(platform);
      if (collision) return collision;
      continue;
    }
    const collision = collisionForRect({
      x: platform.start,
      y: platform.y - 3,
      width: platform.end - platform.start,
      height: PLATFORM_DECK_THICKNESS + 3,
    });
    if (collision) return collision;
  }
  return null;
}

function burstTurretLaserImpact(bullet, collision, finalImpact = false) {
  const normalX = collision.normalX ?? 0;
  const normalY = collision.normalY ?? -1;
  const tangentX = -normalY;
  const tangentY = normalX;
  const sparkCount = finalImpact ? 18 : 12;
  const colors = ["#f2c8ff", "#dc79ff", "#9c2de0", "#511074"];

  for (let spark = 0; spark < sparkCount; spark += 1) {
    const outwardSpeed = 95 + Math.random() * (finalImpact ? 250 : 190);
    const tangentSpeed = (Math.random() - 0.5) * (finalImpact ? 320 : 235);
    const life = 0.16 + Math.random() * 0.25;
    particles.push({
      x: bullet.x + normalX * bullet.radius,
      y: bullet.y + normalY * bullet.radius,
      vx: normalX * outwardSpeed + tangentX * tangentSpeed,
      vy: normalY * outwardSpeed + tangentY * tangentSpeed,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 4.5,
      shard: true,
    });
  }

  const flashLife = finalImpact ? 0.3 : 0.22;
  particles.push({
    x: bullet.x,
    y: bullet.y,
    vx: 0,
    vy: 0,
    life: flashLife,
    maxLife: flashLife,
    color: "#e8a2ff",
    size: finalImpact ? 34 : 27,
    lightImpact: true,
  });
  shake = Math.max(shake, finalImpact ? 8 : 5.5);
}

function moveRicochetingBullet(bullet, dt, ricochetColor) {
  bullet.ricochets ??= 0;
  const maxRicochets = bullet.maxRicochets ?? PROJECTILE_MAX_RICOCHETS;
  const travelDistance = Math.hypot(bullet.vx, bullet.vy) * dt;
  const steps = Math.max(1, Math.ceil(travelDistance / Math.max(3, bullet.radius * 0.8)));
  const stepTime = dt / steps;

  for (let step = 0; step < steps; step += 1) {
    const previousX = bullet.x;
    const previousY = bullet.y;
    bullet.x += bullet.vx * stepTime;
    bullet.y += bullet.vy * stepTime;
    const collision = projectileSurfaceCollision(bullet, previousX, previousY);
    if (!collision) continue;

    shake = Math.max(shake, PROJECTILE_SURFACE_HIT_SHAKE);
    const finalImpact = bullet.ricochets >= maxRicochets;
    if (bullet.kind === "turret-laser") {
      burstTurretLaserImpact(bullet, collision, finalImpact);
    } else {
      burst(bullet.x, bullet.y, ricochetColor, finalImpact ? 6 : 5, 115);
    }

    if (finalImpact) return false;

    if (collision.resolveX !== undefined) {
      bullet.x = collision.resolveX;
      bullet.y = collision.resolveY;
    } else if (collision.normalX < 0) {
      bullet.x = collision.rect.x - bullet.radius - 0.01;
    } else if (collision.normalX > 0) {
      bullet.x = collision.rect.x + collision.rect.width + bullet.radius + 0.01;
    } else if (collision.normalY < 0) {
      bullet.y = collision.rect.y - bullet.radius - 0.01;
    } else {
      bullet.y = collision.rect.y + collision.rect.height + bullet.radius + 0.01;
    }

    const velocityAlongNormal = (
      bullet.vx * collision.normalX + bullet.vy * collision.normalY
    );
    bullet.vx -= 2 * velocityAlongNormal * collision.normalX;
    bullet.vy -= 2 * velocityAlongNormal * collision.normalY;
    bullet.ricochets += 1;
  }
  return true;
}


function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    if (!moveRicochetingBullet(bullet, dt, "#c9a7ff")) {
      bullets.splice(i, 1);
      continue;
    }
    let hit = false;

    for (const enemy of enemies) {
      if (!enemy.alive || !overlapsCircleRect(bullet, enemy)) continue;
      enemy.hp -= 1;
      hit = true;
      applyEnemyBulletImpact(enemy, bullet);
      burstMonsterFragments(bullet, enemy, enemy.hp <= 0);
      burst(bullet.x, bullet.y, "#baff63", 5, 125);
      shake = Math.max(shake, enemy.hp <= 0 ? 9 : 4.5);

      if (enemy.hp <= 0) {
        enemy.alive = false;
        player.score += enemy.score;
        burst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#62ed38", 16, 330);
        burst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#5d2f82", 12, 290);
        shake = 9;
      }
      break;
    }

    if (!hit) {
      for (const turret of turrets) {
        if (!turret.alive || !overlapsCircleRect(bullet, turret)) continue;
        turret.hp -= 1;
        turret.hitTimer = 0.18;
        hit = true;
        burst(bullet.x, bullet.y, "#d75cff", 11, 205);
        shake = Math.max(shake, turret.hp <= 0 ? 11 : 5);
        if (turret.hp <= 0) {
          turret.alive = false;
          player.score += TURRET.score;
          burst(
            turret.x + turret.width / 2,
            turret.y + turret.height * 0.48,
            "#8d25d0",
            28,
            350,
          );
          burst(
            turret.x + turret.width / 2,
            turret.y + turret.height * 0.48,
            "#ff76f1",
            16,
            280,
          );
        }
        break;
      }
    }

    if (!hit) {
      for (const boss of midBosses) {
        if (!boss.alive || !overlapsCircleRect(bullet, boss)) continue;
        boss.hp -= 1;
        hit = true;
        burst(bullet.x, bullet.y, "#ff8bf2", 9, 185);
        if (boss.hp <= 0) {
          boss.alive = false;
          player.score += MID_BOSS.score;
          shake = 16;
          burst(
            boss.x + boss.width / 2,
            boss.y + boss.height / 2,
            "#ff4fd8",
            42,
            390,
          );
        }
        break;
      }
    }

    if (
      hit ||
      bullet.x < cameraX - 100 ||
      bullet.x > cameraX + WIDTH + 100 ||
      bullet.y < cameraY - 100 ||
      bullet.y > cameraY + HEIGHT + 100
    ) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];
    if (!moveRicochetingBullet(bullet, dt, bullet.ricochetColor ?? "#ff6b42")) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (player.invincible <= 0 && overlapsCircleRect(bullet, getPlayerHitbox())) {
      player.hp -= 1;
      player.invincible = 1.3;
      shake = 12;
      burst(player.x + player.width / 2, player.y + 35, "#ffdf75", 18, 280);
      enemyBullets.splice(i, 1);
      if (player.hp <= 0) gameOver = true;
      continue;
    }

    if (
      bullet.x < cameraX - 100 ||
      bullet.x > cameraX + WIDTH + 100 ||
      bullet.y < cameraY - 100 ||
      bullet.y > cameraY + HEIGHT + 100
    ) {
      enemyBullets.splice(i, 1);
    }
  }
}
