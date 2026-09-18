"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createEffects(slope = 0) {
  const math = Object.create(Math);
  math.random = () => 0.5;
  const rectangles = [];
  const stack = [];
  const ctx = {
    globalAlpha: 1,
    save() { stack.push(this.globalAlpha); },
    restore() { this.globalAlpha = stack.pop(); },
    translate(x, y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); },
    rotate(angle) { assert.ok(Number.isFinite(angle)); },
    fillRect(...values) {
      assert.ok(values.every(Number.isFinite));
      assert.ok(values[2] >= 0 && values[3] >= 0);
      assert.ok(this.globalAlpha >= 0 && this.globalAlpha <= 1);
      rectangles.push(values);
    },
  };
  const platform = { start: 0, end: 1000, y: 500 };
  const scope = {
    Math: math,
    particles: [],
    COMBAT_DEBRIS_LIMIT: 180,
    shake: 0,
    ctx,
    platformsAt: () => [platform],
    platformSurfaceY: (road, x) => road.y + x * slope,
    buildStars() {},
    resetGame() {},
    requestAnimationFrame() {},
  };
  vm.createContext(scope);
  for (const name of ["combat", "renderer", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, rectangles };
}

function explode(scope, kind) {
  const large = kind !== "monster1";
  const height = large ? 138 : 72;
  scope.burstCombatantExplosion({ x: 300, y: 500 - height, width: large ? 132 : 64, height }, kind);
  return scope.particles.filter((particle) => particle.debris);
}

test("turret debris retains its enlarged metal chunks and one ground bounce", () => {
  const { scope, rectangles } = createEffects();
  const debris = explode(scope, "turret");
  assert.equal(debris.length, 24);
  for (const particle of debris) {
    assert.equal(particle.organicDebris, undefined);
    assert.equal(particle.size, 12.75);
    assert.equal(particle.color, "#673677");
    assert.equal(particle.highlightColor, "#bbc4d2");
  }
  for (let frame = 0; frame < 150; frame += 1) scope.updateParticles(1 / 60);
  for (const particle of debris) {
    assert.equal(particle.debrisBounces, 1);
    assert.equal(particle.groundDebris, true);
    assert.equal(particle.splatProgress, undefined);
  }
  scope.drawCombatDebris(debris[0]);
  assert.equal(rectangles.length, 3, "metal rendering stays rectangular");
});

for (const kind of ["monster1", "monster2"]) {
  test(`${kind} organic debris sticks, spreads, fades and expires`, () => {
    const { scope, rectangles } = createEffects();
    const debris = explode(scope, kind);
    assert.equal(debris.length, kind === "monster1" ? 12 : 20);
    for (const particle of debris) {
      assert.equal(particle.organicDebris, true);
      scope.drawCombatDebris(particle);
    }
    for (let frame = 0; frame < 150; frame += 1) scope.updateParticles(1 / 60);
    for (const particle of debris) {
      assert.equal(particle.debrisBounces, 0);
      assert.equal(particle.groundDebris, true);
      assert.equal(particle.splatProgress, 1);
      assert.equal(particle.vx, 0);
      assert.equal(particle.vy, 0);
      assert.equal(particle.splatAngle, 0);
      scope.drawCombatDebris(particle);
    }
    const particle = debris[0];
    particle.splatProgress = 0;
    rectangles.length = 0;
    scope.drawCombatDebris(particle);
    const initialWidth = Math.max(...rectangles.map((rect) => rect[2]));
    const position = { x: particle.x, y: particle.y };
    scope.updateParticles(0.25);
    assert.equal(particle.splatProgress, 1);
    assert.deepEqual({ x: particle.x, y: particle.y }, position);
    rectangles.length = 0;
    scope.drawCombatDebris(particle);
    assert.ok(Math.max(...rectangles.map((rect) => rect[2])) > initialWidth);
    for (let frame = 0; frame < 300; frame += 1) scope.updateParticles(1 / 60);
    assert.equal(scope.particles.length, 0);
  });
}

test("organic puddles follow a ramp's surface angle", () => {
  const { scope } = createEffects(0.2);
  const debris = explode(scope, "monster2");
  for (let frame = 0; frame < 150; frame += 1) scope.updateParticles(1 / 60);
  for (const particle of debris) {
    assert.equal(particle.groundDebris, true);
    assert.ok(Math.abs(particle.splatAngle - Math.atan(0.2)) < 1e-12);
    assert.equal(particle.y, 500 + particle.x * 0.2);
    scope.drawCombatDebris(particle);
  }
});

test("organic and metal debris share the existing particle budget", () => {
  const { scope } = createEffects();
  for (let death = 0; death < 20; death += 1) {
    explode(scope, death % 2 ? "monster2" : "turret");
    assert.ok(scope.particles.filter((particle) => particle.debris).length <= 180);
  }
  assert.equal(scope.particles.filter((particle) => particle.debris).length, 180);
});
