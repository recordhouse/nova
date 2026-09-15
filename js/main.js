"use strict";

// Frame update, draw orchestration, and game startup.

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    if (particle.groundFlame) {
      particle.flamePhase += dt * particle.flickerSpeed;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(i, 1);
      continue;
    }

    const previousY = particle.y;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += (particle.gravity ?? 600) * dt;
    particle.life -= dt;
    if (particle.flameDroplet && particle.vy > 0) {
      const landing = platformsAt(particle.x)
        .map((platform) => ({
          platform,
          surfaceY: platformSurfaceY(platform, particle.x),
        }))
        .filter((candidate) => (
          previousY <= candidate.surfaceY + 2 &&
          particle.y >= candidate.surfaceY - 2
        ))
        .sort((first, second) => first.surfaceY - second.surfaceY)[0];
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
  gameTime += dt;
  shake = Math.max(0, shake - dt * 28);
  if (gameOver) return;
  updatePlayer(dt);
  updateTurrets(dt);
  updateMidBosses(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateParticles(dt);
}

function draw() {
  drawBackground();
  drawWorld();
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
