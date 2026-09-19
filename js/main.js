"use strict";

// Frame update, draw orchestration, and game startup.

function particleGroundCollision(particle, previousX, previousY) {
  const bottomOffset = particle.debris ? particle.debrisHeight / 2 : 0;
  return platformsAt(particle.x)
    .map((platform) => ({
      platform,
      surfaceY: platformSurfaceY(platform, particle.x),
      previousSurfaceY: platformSurfaceY(platform, previousX),
    }))
    .filter((candidate) => (
      previousY + bottomOffset <= candidate.previousSurfaceY + 2 &&
      particle.y + bottomOffset >= candidate.surfaceY - 2
    ))
    .sort((first, second) => first.surfaceY - second.surfaceY)[0];
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
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
  shake = Math.max(0, shake - dt * 28);
  if (gameOver) {
    if (playerIsDown()) {
      updatePlayer(dt);
      updateParticles(dt);
    }
    return;
  }
  updatePlayer(dt);
  updateTurrets(dt);
  updateMidBosses(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateElectricWires();
  updateParticles(dt);
}

function draw() {
  drawBackground();
  if (!(TEST_MODE && showFullMap)) drawWorld();
  drawHud();
}

function loop(currentTime) {
  const dt = Math.min(0.033, (currentTime - previousTime) / 1000);
  previousTime = currentTime;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

buildStars();
resetGame();
requestAnimationFrame(loop);
