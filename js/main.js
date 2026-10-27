"use strict";

// Frame update, draw orchestration, and game startup.

function particleGroundCollision(particle, previousX, previousY) {
  const bottomOffset = particle.debris ? particle.debrisHeight / 2 : 0;
  let nearest = null;
  const preferredPlatform = particle.surfacePlatform;
  const candidates = preferredPlatform &&
      particle.x >= preferredPlatform.start && particle.x < preferredPlatform.end
    ? [preferredPlatform]
    : typeof platformsAt === "function"
      ? platformsAt(particle.x)
      : platforms;
  for (const platform of candidates) {
    if (particle.x < platform.start || particle.x >= platform.end) continue;
    const surfaceY = platformSurfaceY(platform, particle.x);
    if (nearest && surfaceY >= nearest.surfaceY) continue;
    const previousSurfaceY = platformSurfaceY(platform, previousX);
    if (
      previousY + bottomOffset <= previousSurfaceY + 2 &&
      particle.y + bottomOffset >= surfaceY - 2
    ) nearest = { platform, surfaceY, previousSurfaceY };
  }
  return nearest;
}

function particleHasGameplayPriority(particle) {
  return Boolean(
    particle.debris || particle.revivalOrb || particle.impactFlash ||
    particle.shieldRamImpact ||
    particle.heartPickupGlow || particle.heartPickupPop ||
    particle.shieldBreakFlash || particle.crimsonGrenadeBlast ||
    particle.turretMushroomBlast
  );
}

function trimActiveParticles() {
  const baseParticleLimit = typeof ACTIVE_PARTICLE_LIMIT === "number"
    ? ACTIVE_PARTICLE_LIMIT : 520;
  const performanceDensity = typeof adaptiveEffectDensity === "number"
    ? adaptiveEffectDensity : 1;
  const particleLimit = Math.max(320, Math.round(
    baseParticleLimit * performanceDensity,
  ));
  let excess = particles.length - particleLimit;
  if (excess <= 0) return;
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < particles.length; readIndex += 1) {
    const particle = particles[readIndex];
    if (excess > 0 && !particleHasGameplayPriority(particle)) {
      excess -= 1;
      continue;
    }
    particles[writeIndex] = particle;
    writeIndex += 1;
  }
  particles.length = writeIndex;
  if (excess > 0) particles.splice(0, Math.min(excess, particles.length));
}

function updateParticles(dt) {
  trimActiveParticles();
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    if (particle.shieldBreakShard) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.exp(-3.2 * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.angle += particle.angularVelocity * dt;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
      continue;
    }
    if (particle.revivalOrb) {
      particle.angularVelocity *= Math.exp(-0.85 * dt);
      particle.angle += particle.angularVelocity * dt;
      particle.radialVelocity += particle.radialAcceleration * dt;
      particle.radius += particle.radialVelocity * dt;
      particle.x = particle.originX + Math.cos(particle.angle) * particle.radius;
      particle.y = particle.originY + Math.sin(particle.angle) * particle.radius;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
      continue;
    }
    if (particle.groundFlame) {
      particle.flamePhase += dt * particle.flickerSpeed;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
      continue;
    }

    if (particle.groundDebris) {
      if (particle.organicDebris) {
        particle.splatProgress = Math.min(1, particle.splatProgress + dt / 0.24);
      }
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
      continue;
    }

    const previousX = particle.x;
    const previousY = particle.y;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += (particle.gravity ?? 600) * dt;
    particle.life -= dt;
    if (particle.debris) {
      particle.angle += particle.angularVelocity * dt;
      if (particle.vy > 0) {
        const landing = particleGroundCollision(particle, previousX, previousY);
        if (landing) {
          if (!particle.organicDebris && particle.debrisBounces < 1 && particle.vy > 120) {
            particle.y = landing.surfaceY - particle.debrisHeight / 2 - 0.01;
            particle.vy *= -0.2;
            particle.vx *= 0.48;
            particle.angularVelocity *= 0.35;
            particle.debrisBounces += 1;
          } else {
            particle.y = landing.surfaceY;
            particle.vx = 0;
            particle.vy = 0;
            particle.angle = 0;
            particle.groundDebris = true;
            particle.life = particle.groundLife;
            particle.maxLife = particle.groundLife;
            if (particle.organicDebris) {
              particle.splatProgress = 0;
              const platform = landing.platform;
              particle.splatAngle = Math.atan2(
                platformSurfaceY(platform, platform.end) - platformSurfaceY(platform, platform.start),
                platform.end - platform.start,
              );
            }
          }
        }
      }
    }
    if (particle.flameDroplet && particle.vy > 0) {
      const landing = particleGroundCollision(particle, previousX, previousY);
      if (landing) {
        const burnLife = 0.62 + Math.random() * 0.58;
        particle.y = landing.surfaceY;
        particle.vx = 0;
        particle.vy = 0;
        particle.life = burnLife;
        particle.maxLife = burnLife;
        particle.size = Math.max(4, particle.size * 1.15);
        particle.groundFlame = true;
        particle.flameDroplet = false;
        particle.flamePhase = Math.random() * Math.PI * 2;
        particle.flickerSpeed = 13 + Math.random() * 9;
      }
    }
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function update(dt) {
  if (TEST_MODE && showFullMap) return;
  gameTime += dt;
  shake = Math.max(0, shake - dt * 48);
  if (gameOver) {
    if (typeof stopEnemyAttackVideo === "function") {
      stopEnemyAttackVideo();
    }
    if (playerIsDown()) {
      updatePlayer(dt);
      updateParticles(dt);
    } else if (typeof syncPlayerGunVideoPlayback === "function") {
      syncPlayerGunVideoPlayback(false);
      if (typeof syncPlayerRunVideoPlayback === "function") {
        syncPlayerRunVideoPlayback(false);
      }
      if (typeof syncPlayerStandVideoPlayback === "function") {
        syncPlayerStandVideoPlayback(false);
      }
    }
    if (!playerIsDown() && !player.gameOverVoicePlayed) {
      player.gameOverVoicePlayed = true;
      if (typeof playFemaleEndVoice === "function") playFemaleEndVoice();
    }
    return;
  }
  updatePlayer(dt);
  updatePlayerRevivalWave(dt);
  updateHeartItems();
  updateTurrets(dt);
  updateMidBosses(dt);
  updateBullets(dt);
  updateEnemies(dt);
  if (typeof playNextEnemyIntroductionVideo === "function") {
    playNextEnemyIntroductionVideo(gameTime);
  }
  updateElectricWires();
  updateParticles(dt);
  if (gameOver && !playerIsDown() && !player.gameOverVoicePlayed) {
    player.gameOverVoicePlayed = true;
    if (typeof playFemaleEndVoice === "function") playFemaleEndVoice();
  }
}

function updateHeartItems() {
  if (playerIsDown()) return;
  player.maxHp = Math.min(PLAYER_MAX_HEARTS, player.maxHp);
  player.hp = Math.min(player.maxHp, player.hp);
  const hitbox = getPlayerHitbox();
  for (let index = heartItems.length - 1; index >= 0; index -= 1) {
    const heart = heartItems[index];
    if (!overlapsCircleRect(heart, hitbox)) continue;
    if (player.maxHp < PLAYER_MAX_HEARTS) {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    } else if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
    } else {
      continue;
    }
    if (typeof playHeartPickupSound === "function") playHeartPickupSound();
    emitHeartPickupBurst(heart);
    heartItems.splice(index, 1);
  }
}

function draw() {
  drawBackground();
  if (!(TEST_MODE && showFullMap)) drawWorld();
  drawHud();
}

const PERFORMANCE_REDUCE_FRAME_SECONDS = 1 / 50;
const PERFORMANCE_RESTORE_FRAME_SECONDS = 1 / 57;
const PERFORMANCE_REDUCE_HOLD_SECONDS = 1.5;
const PERFORMANCE_RESTORE_HOLD_SECONDS = 5;
let adaptivePerformanceReduced = false;
let adaptiveAverageFrameSeconds = 1 / 60;
let adaptiveSlowFrameTime = 0;
let adaptiveRecoveryFrameTime = 0;

function updateAdaptivePerformance(frameSeconds) {
  if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return false;
  if (frameSeconds > 0.12) {
    adaptiveAverageFrameSeconds = 1 / 60;
    adaptiveSlowFrameTime = 0;
    adaptiveRecoveryFrameTime = 0;
    return false;
  }
  const sampleSeconds = Math.min(0.05, frameSeconds);
  const blend = 1 - Math.exp(-sampleSeconds * 2);
  adaptiveAverageFrameSeconds += (
    sampleSeconds - adaptiveAverageFrameSeconds
  ) * blend;

  if (!adaptivePerformanceReduced) {
    adaptiveRecoveryFrameTime = 0;
    adaptiveSlowFrameTime = adaptiveAverageFrameSeconds >=
      PERFORMANCE_REDUCE_FRAME_SECONDS
      ? adaptiveSlowFrameTime + sampleSeconds
      : Math.max(0, adaptiveSlowFrameTime - sampleSeconds * 2);
    if (adaptiveSlowFrameTime < PERFORMANCE_REDUCE_HOLD_SECONDS) return false;
    adaptivePerformanceReduced = true;
    adaptiveSlowFrameTime = 0;
    if (typeof setAdaptivePerformanceMode === "function") {
      setAdaptivePerformanceMode(true);
    }
    return true;
  }

  adaptiveSlowFrameTime = 0;
  adaptiveRecoveryFrameTime = adaptiveAverageFrameSeconds <=
    PERFORMANCE_RESTORE_FRAME_SECONDS
    ? adaptiveRecoveryFrameTime + sampleSeconds
    : 0;
  if (adaptiveRecoveryFrameTime < PERFORMANCE_RESTORE_HOLD_SECONDS) return false;
  adaptivePerformanceReduced = false;
  adaptiveRecoveryFrameTime = 0;
  if (typeof setAdaptivePerformanceMode === "function") {
    setAdaptivePerformanceMode(false);
  }
  return true;
}

function loop(currentTime) {
  const frameSeconds = (currentTime - previousTime) / 1000;
  previousTime = currentTime;
  updateAdaptivePerformance(frameSeconds);
  const dt = Math.min(0.033, frameSeconds);
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

buildStars();
resetGame();
if (
  typeof getPlayerUltimateLaserSprite === "function" &&
  typeof PLAYER_ULTIMATE_LASER_LENGTH === "number"
) {
  getPlayerUltimateLaserSprite();
}
requestAnimationFrame(loop);
