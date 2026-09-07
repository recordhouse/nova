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
  const horizontalInput = Number(controls.right) - Number(controls.left);
  return (
    controls.fire &&
    controls.up &&
    horizontalInput !== 0 &&
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
    const thickness = 32 / normalLength;
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

  for (const prop of props) {
    const collision = collisionForRect({
      x: prop.x,
      y: prop.platform.y - prop.height,
      width: prop.width,
      height: prop.height,
    });
    if (collision) return collision;
  }

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
      y: platform.y - 5,
      width: platform.end - platform.start,
      height: 37,
    });
    if (collision) return collision;
  }
  return null;
}

function moveRicochetingBullet(bullet, dt, ricochetColor) {
  bullet.ricochets ??= 0;
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

    if (bullet.ricochets >= PROJECTILE_MAX_RICOCHETS) {
      burst(bullet.x, bullet.y, ricochetColor, 6, 115);
      return false;
    }

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
    burst(bullet.x, bullet.y, ricochetColor, 5, 105);
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
      burst(bullet.x, bullet.y, "#ffce49", 7, 160);

      if (enemy.hp <= 0) {
        enemy.alive = false;
        player.score += enemy.score;
        burst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#ff542e", 22, 330);
        shake = 9;
      }
      break;
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
    if (!moveRicochetingBullet(bullet, dt, "#ff6b42")) {
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
