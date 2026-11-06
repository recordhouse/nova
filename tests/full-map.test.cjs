"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(testMode = true, landscape = false) {
  const strokes = [];
  const strokeRects = [];
  const clips = [];
  const fills = [];
  const gradients = [];
  let points = [];
  const ctx = {
    setTransform() {}, save() {}, restore() {}, clip() {},
    beginPath() { points = []; },
    moveTo(x, y) { points.push({ x, y }); },
    lineTo(x, y) { points.push({ x, y }); },
    closePath() {},
    arc(x, y, radius) { points.push({ x, y, radius }); },
    rect(...values) { clips.push(values); },
    stroke() { strokes.push({ color: this.strokeStyle, points: [...points] }); },
    fill() { fills.push({ color: this.fillStyle, points: [...points] }); },
    fillRect() {}, strokeRect(...values) { strokeRects.push(values); },
    createRadialGradient(...args) {
      const gradient = { type: "radial", args, stops: [],
        addColorStop(offset, color) { this.stops.push({ offset, color }); } };
      gradients.push(gradient);
      return gradient;
    },
    createLinearGradient(...args) {
      const gradient = { type: "linear", args, stops: [],
        addColorStop(offset, color) { this.stops.push({ offset, color }); } };
      gradients.push(gradient);
      return gradient;
    },
  };
  const button = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const portalButton = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const bossButton = {
    attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const tools = { getBoundingClientRect: () => ({ bottom: landscape ? 148 : 180 }) };
  const canvas = {
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect() { return { top: 0, height: this.height / 2 }; },
  };
  const scope = {
    performance: { now: () => 0 }, requestAnimationFrame() {},
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-map]" ? button
          : selector === "[data-test-portal]" ? portalButton
            : selector === "[data-test-boss]" ? bossButton
          : selector === "[data-test-controls]" ? tools : null,
      querySelectorAll: () => [], addEventListener() {},
    },
    window: { location: { search: testMode ? "?test=1" : "" }, addEventListener() {},
      innerWidth: landscape ? 1280 : 720, innerHeight: landscape ? 720 : 1280,
      matchMedia: () => ({ matches: landscape }) },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "enemies", "renderer", "input", "main"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope, { filename: `${name}.js` });
  }
  return { scope, button, portalButton, bossButton, tools, strokes, strokeRects, clips, fills, gradients };
}

test("MAP button toggles the full map, clears held controls and pauses the game clock", () => {
  const { scope, button } = createGame();
  assert.equal(vm.runInContext("showFullMap", scope), false);
  assert.equal(button.attributes["aria-pressed"], "false");
  vm.runInContext("controls.fire=true; keyboardControls.fire=true", scope);
  button.listeners.click({ preventDefault() {} });
  assert.equal(vm.runInContext("showFullMap", scope), true);
  assert.equal(vm.runInContext("controls.fire", scope), false);
  assert.equal(button.attributes["aria-pressed"], "true");
  const time = vm.runInContext("gameTime", scope);
  scope.update(1 / 60);
  assert.equal(vm.runInContext("gameTime", scope), time);
  button.listeners.click({ preventDefault() {} });
  scope.update(1 / 60);
  assert.ok(vm.runInContext("gameTime", scope) > time);
  scope.toggleTestMap();
  scope.resetGame();
  assert.equal(vm.runInContext("showFullMap", scope), false);
  assert.equal(button.attributes["aria-pressed"], "false");
});

test("normal mode hides MAP tools and cannot open or pause for the full map", () => {
  const { scope, button, tools } = createGame(false);
  assert.equal(tools.hidden, true);
  button.listeners.click({ preventDefault() {} });
  assert.equal(vm.runInContext("showFullMap", scope), false);
  scope.update(1 / 60);
  assert.ok(vm.runInContext("gameTime", scope) > 0);
});

test("the test PORTAL button places the player safely with the entrance in view", () => {
  const { scope, button, portalButton } = createGame();
  button.listeners.click({ preventDefault() {} });
  assert.equal(vm.runInContext("showFullMap", scope), true);
  portalButton.listeners.click({ preventDefault() {} });
  const preview = vm.runInContext(`(() => ({
    samePlatform: player.platform === bossDoor.platform,
    grounded: player.grounded,
    facing: player.facing,
    direction: bossDoor.direction,
    portalScreenX: bossDoor.centerX - cameraX,
    portalScreenY: platformSurfaceY(bossDoor.platform, bossDoor.centerX) - cameraY,
    width: WIDTH,
    height: HEIGHT,
    showFullMap,
  }))()`, scope);
  assert.equal(preview.samePlatform, true);
  assert.equal(preview.grounded, true);
  assert.equal(preview.facing, preview.direction);
  assert.equal(preview.showFullMap, false);
  assert.ok(preview.portalScreenX >= 0 && preview.portalScreenX <= preview.width);
  assert.ok(preview.portalScreenY >= 0 && preview.portalScreenY <= preview.height);
});

test("entering the vortex replaces the stage with a harder boss jump map", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    player.hp=2;
    player.score=345;
    player.ultimateCharges=1;
    player.platform=bossDoor.platform;
    player.x=bossDoor.centerX-player.width/2;
    player.y=platformSurfaceY(bossDoor.platform,bossDoor.centerX)-player.height;
    player.grounded=true;
    update(1/60);
    const ordered=[...platforms].sort((a,b)=>a.start-b.start);
    const gaps=ordered.slice(1).map((platform,index)=>platform.start-ordered[index].end);
    return {
      currentArea,
      hasGate:Boolean(bossDoor),
      platformCount:platforms.length,
      jumpPads:platforms.filter(platform=>platform.bossJumpPlatform).length,
      jumpGaps:gaps.filter(gap=>gap>=150).length,
      doubleJumpGaps:gaps.filter(gap=>gap>=250).length,
      maximumGap:Math.max(...gaps),
      startsSafely:Boolean(player.platform?.startingRoad && player.grounded),
      arenaType:goalPlatform?.type,
      hp:player.hp,
      score:player.score,
      ultimateCharges:player.ultimateCharges,
    };
  })()`, scope);
  assert.equal(result.currentArea, "boss");
  assert.equal(result.hasGate, false);
  assert.equal(result.platformCount, 22);
  assert.equal(result.jumpPads, 20);
  assert.ok(result.jumpGaps >= 20);
  assert.ok(result.doubleJumpGaps >= 5);
  assert.ok(result.maximumGap <= 300, "the hard gaps remain inside double-jump range");
  assert.equal(result.startsSafely, true);
  assert.equal(result.arenaType, "boss-arena");
  assert.equal(result.hp, 2);
  assert.equal(result.score, 345);
  assert.equal(result.ultimateCharges, 1);
});

test("falling in the boss map returns to the last platform without death or health loss", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    enterBossMap();
    const checkpointPlatform=platforms.find(platform=>platform.bossJumpPlatform);
    player.platform=checkpointPlatform;
    player.x=(checkpointPlatform.start+checkpointPlatform.end-player.width)/2;
    player.y=checkpointPlatform.y-player.height;
    player.grounded=true;
    player.facing=-1;
    rememberBossMapCheckpoint(checkpointPlatform);
    const checkpointId=checkpointPlatform.id;
    player.hp=2;
    player.platform=null;
    player.grounded=false;
    player.y=lowestPlatformY+BOSS_MAP_FALL_RECOVERY_DEPTH+1;
    player.vy=PLAYER_MAX_FALL_SPEED;
    updatePlayer(1/60);
    return {
      checkpointId,
      platformId:player.platform?.id,
      grounded:player.grounded,
      gameOver,
      hp:player.hp,
      invincible:player.invincible,
      centered:Math.abs(
        player.x+player.width/2-(checkpointPlatform.start+checkpointPlatform.end)/2
      )<0.01,
    };
  })()`, scope);
  assert.equal(result.platformId, result.checkpointId);
  assert.equal(result.grounded, true);
  assert.equal(result.gameOver, false);
  assert.equal(result.hp, 2);
  assert.ok(result.invincible >= 0.89);
  assert.equal(result.centered, true);
});

test("the final boss waits, runs toward the player, then charges an angled beam", () => {
  const { scope, bossButton } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const before={x:boss.x,y:boss.y,bullets:enemyBullets.length};
    let ran=false;
    let movedTowardPlayer=false;
    let charged=false;
    for(let frame=0;frame<360&&boss.attackState!=='fire';frame+=1) {
      updateMidBosses(1/60);
      ran ||= boss.attackState==='move' && boss.moving;
      movedTowardPlayer ||= boss.x<before.x;
      charged ||= boss.attackState==='charge';
    }
    const fired=boss.attackState==='fire';
    const direction={x:boss.beamDirectionX,y:boss.beamDirectionY};
    testInvincibility=false;
    player.invincible=0;
    updateMidBosses(1/60);
    return {
      currentArea,
      bossCount:midBosses.filter(candidate=>candidate.finalBoss&&candidate.alive).length,
      idleOnly:boss.idleOnly,
      ran,
      movedTowardPlayer,
      charged,
      fired,
      direction,
      playerHp:player.hp,
      playerDownPhase:player.downPhase,
      samePlatform:player.platform===boss.platform,
      playerFacesBoss:player.facing===1 && player.x<boss.x,
      bossScreenX:boss.x+boss.width/2-cameraX,
      bossScreenY:boss.y+boss.height/2-cameraY,
      width:WIDTH,
      height:HEIGHT,
      stayedOnRoad:boss.y===before.y,
      didNotFire:enemyBullets.length===before.bullets,
    };
  })()`, scope);
  assert.equal(result.currentArea, "boss");
  assert.equal(result.bossCount, 1);
  assert.equal(result.idleOnly, false);
  assert.equal(result.ran, true);
  assert.equal(result.movedTowardPlayer, true);
  assert.equal(result.charged, true);
  assert.equal(result.fired, true);
  assert.ok(result.direction.x < -0.65);
  assert.ok(result.direction.y > 0.1);
  assert.equal(result.playerHp, 2);
  assert.equal(result.playerDownPhase, "fall");
  assert.equal(result.samePlatform, true);
  assert.equal(result.playerFacesBoss, true);
  assert.ok(result.bossScreenX >= 0 && result.bossScreenX <= result.width);
  assert.ok(result.bossScreenY >= 0 && result.bossScreenY <= result.height);
  assert.equal(result.stayedOnRoad, true);
  assert.equal(result.didNotFire, true);
});

test("the final boss cycles through five distinct attack patterns", () => {
  const { scope, bossButton } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    const patterns=[];
    const shotCounts={};
    let rainTargetCount=0;
    let dashMoved=false;
    let groundWaveTravel=0;
    let groundWavePersistsOffscreen=false;
    for(let index=0;index<FINAL_BOSS.attackPatterns.length;index+=1) {
      enemyBullets.length=0;
      prepareFinalBossAttack(boss,targetX,targetY);
      patterns.push(boss.attackPattern);
      rainTargetCount=Math.max(rainTargetCount,boss.rainTargets.length);
      boss.attackTimer=0;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
      const beforeX=boss.x;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
      shotCounts[boss.attackPattern]=enemyBullets.length;
      if(boss.attackPattern==='dash') dashMoved=boss.x!==beforeX;
      if(boss.attackPattern==='ground-wave') {
        const wave=enemyBullets.find(bullet=>bullet.kind==='final-boss-wave');
        groundWaveTravel=Math.abs(wave.vx)*wave.life;
        groundWavePersistsOffscreen=wave.keepOffscreen;
      }
      boss.attackState='recovery';
      boss.attackTimer=0;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
    }
    return {
      patterns,shotCounts,rainTargetCount,dashMoved,
      groundWaveTravel,groundWavePersistsOffscreen,
      speedProfile:{
        beamCharge:FINAL_BOSS.chargeDuration,
        fanCharge:FINAL_BOSS.fanChargeDuration,
        rainCharge:FINAL_BOSS.rainChargeDuration,
        waveCharge:FINAL_BOSS.groundWaveChargeDuration,
        dashCharge:FINAL_BOSS.dashChargeDuration,
        fanSpeed:FINAL_BOSS.fanProjectileSpeed,
        rainSpeed:FINAL_BOSS.rainProjectileSpeed,
        dashSpeed:FINAL_BOSS.dashSpeed,
      },
    };
  })()`, scope);
  assert.deepEqual(
    Array.from(result.patterns),
    ["beam", "fan", "rain", "ground-wave", "dash"],
  );
  assert.equal(result.shotCounts.beam, 0);
  assert.equal(result.shotCounts.fan, 5);
  assert.equal(result.shotCounts.rain, 1);
  assert.equal(result.shotCounts["ground-wave"], 1);
  assert.equal(result.rainTargetCount, 7);
  assert.equal(result.dashMoved, true);
  assert.ok(result.groundWaveTravel >= 1800);
  assert.equal(result.groundWavePersistsOffscreen, true);
  assert.ok(Object.values(result.speedProfile).every(Number.isFinite));
  assert.ok(Math.max(
    result.speedProfile.beamCharge,
    result.speedProfile.fanCharge,
    result.speedProfile.rainCharge,
    result.speedProfile.waveCharge,
    result.speedProfile.dashCharge,
  ) < 0.9);
  assert.ok(result.speedProfile.fanSpeed >= 700);
  assert.ok(result.speedProfile.rainSpeed >= 900);
  assert.ok(result.speedProfile.dashSpeed >= 900);
});

test("the active particle budget preserves critical effects during effect spikes", () => {
  const { scope } = createGame(false);
  vm.runInContext(`
    particles.length=0;
    particles.push({x:0,y:0,vx:0,vy:0,life:1,maxLife:1,
      gravity:0,impactFlash:true,color:'#fff',size:1});
    for(let index=0;index<700;index++) {
      particles.push({x:index,y:0,vx:0,vy:0,life:1,maxLife:1,
        gravity:0,color:'#fff',size:1});
    }
    updateParticles(0);
  `, scope);
  assert.ok(vm.runInContext("particles.length <= ACTIVE_PARTICLE_LIMIT", scope));
  assert.equal(vm.runInContext(
    "particles.some((particle)=>particle.impactFlash)", scope), true);
});

test("sustained slow frames reduce quality and stable recovery restores it", () => {
  const { scope } = createGame(false);
  for (let index = 0; index < 120; index += 1) {
    scope.updateAdaptivePerformance(1 / 40);
  }
  assert.equal(vm.runInContext("adaptivePerformanceReduced", scope), true);
  assert.equal(vm.runInContext("adaptiveEffectDensity", scope), 0.7);

  for (let index = 0; index < 120; index += 1) {
    scope.updateAdaptivePerformance(1 / 60);
  }
  assert.equal(vm.runInContext("adaptivePerformanceReduced", scope), true,
    "a brief recovery must not make quality oscillate");

  for (let index = 0; index < 360; index += 1) {
    scope.updateAdaptivePerformance(1 / 60);
  }
  assert.equal(vm.runInContext("adaptivePerformanceReduced", scope), false);
  assert.equal(vm.runInContext("adaptiveEffectDensity", scope), 1);
});

test("reduced quality trims cosmetic particles before critical effects", () => {
  const { scope } = createGame(false);
  vm.runInContext(`
    setAdaptivePerformanceMode(true);
    particles.length=0;
    particles.push({x:0,y:0,vx:0,vy:0,life:1,maxLife:1,
      gravity:0,impactFlash:true,color:'#fff',size:1});
    for(let index=0;index<700;index++) {
      particles.push({x:index,y:0,vx:0,vy:0,life:1,maxLife:1,
        gravity:0,color:'#fff',size:1});
    }
    updateParticles(0);
  `, scope);
  assert.equal(vm.runInContext("particles.length", scope), 364);
  assert.equal(vm.runInContext(
    "particles.some((particle)=>particle.impactFlash)", scope), true);
});

for (const [landscape, shortSide] of [[false, 540], [false, 720], [true, 540], [true, 720]]) {
  test(`full ${shortSide}px ${landscape ? "landscape" : "portrait"} map fits every road and shows player and portal`, () => {
    const { scope, strokes, clips, fills } = createGame(true, landscape);
    scope.resizeGameResolution(landscape ? shortSide * 16 / 9 : shortSide,
      landscape ? shortSide : shortSide * 16 / 9);
    scope.drawMinimap(true);
    const [x, y, width, height] = clips.at(-1);
    assert.ok(width > 0 && height > 0);
    const roads = strokes.filter((stroke) => typeof stroke.color === "string" &&
      ["rgba(83, 221, 242, 0.62)", "rgba(190, 143, 255, 0.34)"].includes(stroke.color));
    assert.equal(roads.length, vm.runInContext("platforms.length", scope));
    for (const road of roads) {
      for (const point of road.points) {
        assert.ok(point.x >= x && point.x <= x + width);
        assert.ok(point.y >= y && point.y <= y + height);
      }
    }
    for (const color of ["#fff0f2", "#ffe071"]) {
      const marker = fills.find((fill) => fill.color === color);
      assert.ok(marker, `${color} map marker must exist`);
      assert.ok(marker.points[0].x >= x && marker.points[0].x <= x + width);
      assert.ok(marker.points[0].y >= y && marker.points[0].y <= y + height);
    }
    const previousRoads = JSON.stringify(roads);
    strokes.length = 0;
    vm.runInContext("player.x+=150; cameraX+=150", scope);
    scope.drawMinimap(true);
    assert.equal(JSON.stringify(strokes.filter((stroke) => typeof stroke.color === "string" &&
      ["rgba(83, 221, 242, 0.62)", "rgba(190, 143, 255, 0.34)"].includes(stroke.color))), previousRoads,
    "full map remains fixed rather than following the player");
  });
}

test("full map skips world effects and is not hidden by the game-over overlay", () => {
  const { scope } = createGame();
  const layers = [];
  scope.drawBackground = () => layers.push("background");
  scope.drawWorld = () => layers.push("world");
  scope.drawOverlay = () => { throw new Error("game-over overlay must not hide the full map"); };
  vm.runInContext("gameOver=true", scope);
  scope.toggleTestMap();
  scope.draw();
  assert.deepEqual(layers, ["background"]);
});

test("closed map keeps the small, cropped minimap", () => {
  const { scope, strokes, strokeRects, clips } = createGame();
  assert.equal(vm.runInContext("MINIMAP_LOCAL_WORLD_RATIO", scope), 0.25);
  scope.drawMinimap();
  const [x, y, width, height] = clips.at(-1);
  const header = scope.hudHeaderLayout();
  assert.equal(header.map.width, Math.round(720 * 0.44));
  assert.equal(header.map.height,
    Math.round(scope.topVideoSlotLayout().originalHeight * 1.2));
  assert.ok(width < header.map.width && height < header.map.height);
  const roads = strokes.filter((stroke) => stroke.color === "rgba(83, 221, 242, 0.62)");
  assert.ok(roads.length > 0);
  assert.ok(roads.length < vm.runInContext("platforms.length", scope),
    "the small map should still skip roads outside its wider local window");
  const gridLines = strokes.filter((stroke) =>
    stroke.color === "rgba(108, 153, 170, 0.13)");
  const verticalLines = gridLines.filter((line) => line.points[0].x === line.points[1].x);
  const horizontalLines = gridLines.filter((line) => line.points[0].y === line.points[1].y);
  const columnGap = verticalLines[0].points[0].x - verticalLines[1].points[0].x;
  const rowGap = horizontalLines[1].points[0].y - horizontalLines[0].points[0].y;
  assert.ok(Math.abs(Math.abs(columnGap) - Math.abs(rowGap)) < 1e-9,
    "the minimap grid cells should be square");
  assert.equal(strokeRects.length, 0, "the minimap should not draw a rectangular border");
});

test("the local minimap preserves the terrain's real horizontal and vertical scale", () => {
  const { scope, strokes } = createGame();
  vm.runInContext(`
    platforms.length=0;
    platforms.push({
      id:999, kind:'ramp', start:0, end:100,
      entryX:0, exitX:100, entryY:200, exitY:300,
      y:200, routeRole:'main'
    });
    player.x=40; player.y=210; bossDoor=null; mapSeed+=1;
    invalidateMinimapCache();
  `, scope);
  strokes.length = 0;
  scope.drawMinimap();
  const road = strokes.find((stroke) => (
    stroke.color === "rgba(83, 221, 242, 0.62)"
  ));
  assert.ok(road);
  const horizontal = Math.abs(road.points[1].x - road.points[0].x);
  const vertical = Math.abs(road.points[1].y - road.points[0].y);
  assert.ok(Math.abs(horizontal - vertical) < 1e-9,
    "a 45-degree world ramp remains 45 degrees on the minimap");
});

test("the local minimap fades its left, right and bottom edges but not its top", () => {
  const { scope, gradients } = createGame();
  vm.runInContext(
    "applyMinimapSideAndBottomFade(ctx, 10, 20, 200, 120)",
    scope,
  );
  assert.equal(gradients.length, 2);
  const [horizontalMask, bottomMask] = gradients;
  assert.equal(horizontalMask.type, "linear");
  assert.deepEqual(horizontalMask.stops.map((stop) => stop.color), [
    "rgba(0, 0, 0, 0)",
    "rgba(0, 0, 0, 1)",
    "rgba(0, 0, 0, 1)",
    "rgba(0, 0, 0, 0)",
  ]);
  assert.equal(bottomMask.type, "linear");
  assert.equal(bottomMask.stops[0].color, "rgba(0, 0, 0, 1)");
  assert.equal(bottomMask.stops.at(-1).color, "rgba(0, 0, 0, 0)");
});

test("test mode full map also stays clear without gradients", () => {
  const { scope, gradients } = createGame();
  scope.drawMinimap(true);
  assert.equal(gradients.length, 0);
});
