"use strict";

// Frame update, draw orchestration, and game startup.

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 600 * dt;
    particle.life -= dt;
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function update(dt) {
  gameTime += dt;
  shake = Math.max(0, shake - dt * 28);
  if (gameOver) return;
  updatePlayer(dt);
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
