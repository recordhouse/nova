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
  const bossAttackButtons = [
    "beam", "fan", "dash", "jump-slam",
  ].map((pattern) => ({
    attributes: {}, listeners: {}, hidden: true,
    dataset: { testBossAttack: pattern },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  }));
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
      querySelectorAll: (selector) => selector === "[data-test-boss-attack]"
        ? bossAttackButtons : [], addEventListener() {},
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
  return { scope, button, portalButton, bossButton, bossAttackButtons,
    tools, strokes, strokeRects, clips, fills, gradients };
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

test("entering the vortex creates a continuous boss floor with reachable jump routes", () => {
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
    const ground=platforms.filter(platform=>platform.bossSafetyFloor)
      .sort((a,b)=>a.start-b.start);
    const jumpPlatforms=platforms.filter(platform=>platform.bossJumpPlatform);
    const tier1Platforms=jumpPlatforms.filter(platform=>platform.bossVerticalTier===1);
    const tier2Platforms=jumpPlatforms.filter(platform=>platform.bossVerticalTier===2);
    const gaps=ground.slice(1).map((platform,index)=>platform.start-ground[index].end);
    const joinHeightDifferences=ground.slice(1).map((platform,index)=>Math.abs(
      platformSurfaceY(ground[index],ground[index].end)-
      platformSurfaceY(platform,platform.start)
    ));
    const jumpLifts=jumpPlatforms.flatMap(platform=>[
      platform.start+1,
      (platform.start+platform.end)/2,
      platform.end-1,
    ].map(x=>{
      const support=ground.find(candidate=>x>=candidate.start&&x<=candidate.end);
      return support
        ? platformSurfaceY(support,x)-platformSurfaceY(platform,x)
        : Infinity;
    }));
    const groundSurfaceHeights=ground.flatMap(platform=>[
      platformSurfaceY(platform,platform.start),
      platformSurfaceY(platform,platform.end),
    ]);
    const allSurfaceHeights=platforms.flatMap(platform=>[
      platformSurfaceY(platform,platform.start),
      platformSurfaceY(platform,platform.end),
    ]);
    const horizontalGap=(first,second)=>Math.max(
      0,Math.max(first.start,second.start)-Math.min(first.end,second.end),
    );
    const tier2Steps=tier2Platforms.map(platform=>Math.min(
      ...tier1Platforms
        .filter(candidate=>horizontalGap(platform,candidate)===0)
        .map(candidate=>{
          const overlapCenter=(
            Math.max(platform.start,candidate.start)+
            Math.min(platform.end,candidate.end)
          )/2;
          return Math.abs(
            platformSurfaceY(platform,overlapCenter)-
            platformSurfaceY(candidate,overlapCenter)
          );
        }),
    ));
    const tierGaps=(tier)=>tier.slice(1).map((platform,index)=>(
      platform.start-tier[index].end
    ));
    const upperFlatCount=jumpPlatforms.filter(platform=>platform.kind==='flat').length;
    const longCombatDeckCount=jumpPlatforms.filter(platform=>(
      platform.end-platform.start>=850
    )).length;
    const doubleJumpGapCount=[
      ...tierGaps(tier1Platforms.slice().sort((a,b)=>a.start-b.start)),
      ...tierGaps(tier2Platforms.slice().sort((a,b)=>a.start-b.start)),
    ].filter(gap=>gap>=HORIZONTAL_JUMP_DOUBLE_GAP_MIN).length;
    return {
      currentArea,
      hasGate:Boolean(bossDoor),
      platformCount:platforms.length,
      groundCount:ground.length,
      rampCount:ground.filter(platform=>platform.kind==='ramp').length,
      jumpPads:jumpPlatforms.length,
      tier1Count:tier1Platforms.length,
      tier2Count:tier2Platforms.length,
      upperRampCount:jumpPlatforms.filter(platform=>platform.kind==='ramp').length,
      upperFlatCount,
      longCombatDeckCount,
      doubleJumpGapCount,
      worldWidth:maxWorldX-minWorldX,
      groundHeightRange:Math.max(...groundSurfaceHeights)-Math.min(...groundSurfaceHeights),
      verticalSurfaceRange:Math.max(...allSurfaceHeights)-Math.min(...allSurfaceHeights),
      upperLiftRange:Math.max(...jumpLifts)-Math.min(...jumpLifts),
      maximumGap:Math.max(...gaps),
      maximumJoinHeightDifference:Math.max(...joinHeightDifferences),
      maximumJumpLift:Math.max(...jumpLifts),
      maximumTier2Step:Math.max(...tier2Steps),
      bossMaximumPlatformStep:FINAL_BOSS.platformJumpMaxHeightDifference,
      everyTier2PlatformHasAJumpLink:tier2Steps.every(Number.isFinite),
      webRoadCount:jumpPlatforms.filter(platform=>platform.bossWebRoad).length,
      bossCombatCount:platforms.filter(platform=>platform.bossCombatPlatform).length,
      minimumBossCombatWidth:Math.min(...platforms
        .filter(platform=>platform.bossCombatPlatform)
        .map(platform=>platform.end-platform.start)),
      allJumpPlatformsHaveFloor:jumpLifts.every(Number.isFinite),
      allRoadsUseRustBloodStyle:platforms.every(platform=>platform.bossRustBloodRoad),
      startsSafely:Boolean(player.platform?.startingRoad && player.grounded),
      arenaType:goalPlatform?.type,
      hp:player.hp,
      score:player.score,
      ultimateCharges:player.ultimateCharges,
    };
  })()`, scope);
  assert.equal(result.currentArea, "boss");
  assert.equal(result.hasGate, false);
  assert.equal(result.platformCount, 17);
  assert.equal(result.groundCount, 11);
  assert.equal(result.rampCount, 4);
  assert.equal(result.jumpPads, 6);
  assert.equal(result.tier1Count, 3);
  assert.equal(result.tier2Count, 3);
  assert.equal(result.upperRampCount, 3);
  assert.equal(result.upperFlatCount, 3);
  assert.ok(result.longCombatDeckCount >= 3,
    "the upper tier should include long horizontal boss combat decks");
  assert.ok(result.doubleJumpGapCount >= 2,
    "the lower upper-tier route should include deliberate double-jump gaps");
  assert.equal(result.webRoadCount, 6);
  assert.equal(result.bossCombatCount, 7);
  assert.ok(result.minimumBossCombatWidth >= 640,
    "every combat web must be wide enough for the boss");
  assert.ok(result.worldWidth <= 4500,
    "the boss map should stay compact instead of becoming a long corridor");
  assert.ok(result.groundHeightRange >= 100,
    "the safety floor should retain gentle elevation changes");
  assert.ok(result.verticalSurfaceRange >= 320,
    "the stacked boss routes should provide substantial vertical movement");
  assert.ok(result.upperLiftRange >= 180,
    "the two upper tiers should be visually and mechanically distinct");
  assert.ok(result.maximumGap <= 0, "the lower boss floor must never open into a pit");
  assert.ok(result.maximumJoinHeightDifference < 0.01, "ground surfaces join cleanly");
  assert.equal(result.everyTier2PlatformHasAJumpLink, true);
  assert.ok(result.maximumTier2Step > 950 ** 2 / (2 * 2100),
    "at least one high-deck climb should require the player's double jump");
  assert.ok(result.maximumTier2Step <= result.bossMaximumPlatformStep,
    "the boss should also be able to climb every high combat deck");
  assert.ok(result.maximumJumpLift <= 2 * 950 ** 2 / (2 * 2100),
    "every high deck should remain inside the player's double-jump height");
  assert.equal(result.allJumpPlatformsHaveFloor, true);
  assert.equal(result.allRoadsUseRustBloodStyle, true);
  assert.equal(result.startsSafely, true);
  assert.equal(result.arenaType, "boss-arena");
  assert.equal(result.hp, 2);
  assert.equal(result.score, 345);
  assert.equal(result.ultimateCharges, 1);
});

test("the final boss approaches upper roads in bounded jumps without landing on the player", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    enterBossMap();
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const upper=platforms.find(platform=>platform.bossVerticalTier===2);
    const playerCenterX=(upper.start+upper.end)/2;
    player.platform=upper;
    player.x=playerCenterX-player.width/2;
    player.y=platformSurfaceY(upper,playerCenterX)-player.height;
    player.grounded=true;
    boss.attackState='move';
    boss.attackTimer=2;
    boss.platformJumpCooldown=0;
    const startPlatform=boss.platform;
    const startCenterX=boss.x+boss.width/2;
    const startY=boss.y;
    let sawAirborne=false;
    let completedJump=false;
    let minimumY=boss.y;
    for(let frame=0;frame<120&&!completedJump;frame+=1){
      const hit=getPlayerHitbox();
      updateFinalBossAttack(
        boss,1/60,hit,
        hit.x+hit.width/2,
        hit.y+hit.height/2,
        true
      );
      sawAirborne ||= boss.airborne;
      minimumY=Math.min(minimumY,boss.y);
      completedJump=sawAirborne&&!boss.platformJumpActive&&!boss.airborne;
    }
    const endCenterX=boss.x+boss.width/2;
    const firstEndY=boss.y;
    const traversalDistances=[Math.abs(endCenterX-startCenterX)];
    const visitedRoads=[{
      tier:boss.platform?.bossVerticalTier??0,
      start:boss.platform?.start,
      end:boss.platform?.end,
      centerX:endCenterX,
    }];
    let reachedHighDeck=boss.platform?.bossVerticalTier===2;
    let everyJumpMovedTowardPlayer=endCenterX<startCenterX;
    let landedOnPlayerRoadDuringTraversal=boss.platform===upper;
    for(let hop=0;hop<8&&!reachedHighDeck;hop+=1){
      boss.attackState='move';
      boss.attackTimer=2;
      boss.platformJumpCooldown=0;
      const hopStartX=boss.x+boss.width/2;
      let hopStarted=false;
      let hopCompleted=false;
      for(let frame=0;frame<120&&!hopCompleted;frame+=1){
        const hit=getPlayerHitbox();
        updateFinalBossAttack(
          boss,1/60,hit,
          hit.x+hit.width/2,
          hit.y+hit.height/2,
          true
        );
        hopStarted ||= boss.platformJumpActive||boss.airborne;
        hopCompleted=hopStarted&&!boss.platformJumpActive&&!boss.airborne;
      }
      if(!hopCompleted) break;
      const hopEndX=boss.x+boss.width/2;
      traversalDistances.push(Math.abs(hopEndX-hopStartX));
      visitedRoads.push({
        tier:boss.platform?.bossVerticalTier??0,
        start:boss.platform?.start,
        end:boss.platform?.end,
        centerX:hopEndX,
      });
      everyJumpMovedTowardPlayer &&= hopEndX<hopStartX;
      landedOnPlayerRoadDuringTraversal ||= boss.platform===upper;
      reachedHighDeck=boss.platform?.bossVerticalTier===2;
    }
    return {
      sawAirborne,completedJump,startY,endY:firstEndY,minimumY,
      movedTowardPlayer:endCenterX<startCenterX,
      startDistance:Math.abs(playerCenterX-startCenterX),
      endDistance:Math.abs(playerCenterX-endCenterX),
      horizontalTravel:Math.abs(endCenterX-startCenterX),
      landedOnDifferentRoad:boss.platform!==startPlatform,
      landedOnPlayerRoad:boss.platform===upper,
      landingGap:Math.abs(playerCenterX-endCenterX),
      landingRoadWidth:boss.platform.end-boss.platform.start,
      reachedHighDeck,
      everyJumpMovedTowardPlayer,
      landedOnPlayerRoadDuringTraversal,
      maximumTraversalDistance:Math.max(...traversalDistances),
      visitedRoads,
      maximumJumpDistance:FINAL_BOSS.platformJumpMaxDistance,
      minimumPlayerGap:FINAL_BOSS.platformJumpMinimumPlayerGap,
    };
  })()`, scope);
  assert.equal(result.sawAirborne, true);
  assert.equal(result.completedJump, true);
  assert.equal(result.movedTowardPlayer, true);
  assert.equal(result.landedOnDifferentRoad, true);
  assert.equal(result.landedOnPlayerRoad, false);
  assert.ok(result.endDistance < result.startDistance);
  assert.ok(result.landingGap >= result.minimumPlayerGap);
  assert.ok(result.minimumY < Math.min(result.startY,result.endY)-30);
  assert.ok(result.landingRoadWidth >= 420);
  assert.equal(result.reachedHighDeck, true);
  assert.equal(result.everyJumpMovedTowardPlayer, true);
  assert.equal(result.landedOnPlayerRoadDuringTraversal, false);
});

test("the final boss frequently climbs both upper tiers while the player stays below", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    const arena=enterBossMap();
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const playerCenterX=arena.start+380;
    player.platform=arena;
    player.x=playerCenterX-player.width/2;
    player.y=platformSurfaceY(arena,playerCenterX)-player.height;
    player.grounded=true;
    boss.attackState='move';
    boss.attackTimer=3;
    boss.platformJumpCooldown=0;
    particles.length=0;
    const visitedTiers=[];
    let wasJumping=false;
    for(let frame=0;frame<240&&visitedTiers.length<2;frame+=1){
      const hit=getPlayerHitbox();
      updateFinalBossAttack(
        boss,1/60,hit,
        hit.x+hit.width/2,
        hit.y+hit.height/2,
        true
      );
      if(wasJumping&&!boss.platformJumpActive){
        visitedTiers.push(boss.platform?.bossVerticalTier??0);
      }
      wasJumping=boss.platformJumpActive;
    }
    return {
      visitedTiers,
      playerStayedBelow:player.platform===arena,
      landedOnPlayerRoad:boss.platform===player.platform,
      effectColors:[...new Set(particles.map(particle=>particle.color))],
      maximumJumpDistance:FINAL_BOSS.platformJumpMaxDistance,
      jumpCooldown:FINAL_BOSS.platformJumpCooldown,
      moveDuration:FINAL_BOSS.moveDuration,
    };
  })()`, scope);
  assert.deepEqual(Array.from(result.visitedTiers), [1, 2]);
  assert.equal(result.playerStayedBelow, true);
  assert.equal(result.landedOnPlayerRoad, false);
  assert.ok(result.maximumJumpDistance <= 380);
  assert.ok(Array.from(result.effectColors).includes("#7b2c22"));
  assert.ok(Array.from(result.effectColors).includes("#a9583d"));
  assert.ok(Array.from(result.effectColors).includes("#8f3528"));
  assert.ok(result.jumpCooldown <= 0.35);
  assert.ok(result.moveDuration >= 1.8);
});

test("the final boss keeps one facing while the player crosses its center dead zone", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    enterBossMap();
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const centerX=boss.x+boss.width/2;
    boss.facing=-1;
    const directions=[];
    for(let frame=0;frame<80;frame+=1){
      const targetX=centerX+(frame%2===0?6:-6);
      directions.push(finalBossAimDirection(boss,targetX,boss.y+boss.height));
    }
    const stableFacing=boss.facing;
    finalBossAimDirection(boss,centerX+60,boss.y+boss.height);
    return {
      stableFacing,
      directionSigns:directions.map(direction=>Math.sign(direction.x)),
      facingOutsideDeadZone:boss.facing,
    };
  })()`, scope);
  assert.equal(result.stableFacing, -1);
  assert.ok(Array.from(result.directionSigns).every((direction) => direction === -1));
  assert.equal(result.facingOutsideDeadZone, 1);
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

test("the final boss waits, runs toward the player, then fires a ricocheting angled beam", () => {
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
    const beam=enemyBullets.find((bullet)=>bullet.kind==='final-boss-beam');
    const launchX=beam?.x;
    const launchY=beam?.y;
    testInvincibility=false;
    player.invincible=0;
    const beforeFireHp=player.hp;
    updateMidBosses(1/60);
    updateBullets(1/60);
    const immediateHp=player.hp;
    const firstFrameDistance=beam?Math.hypot(beam.x-launchX,beam.y-launchY):0;
    let beamTravelFrames=1;
    while(player.hp===beforeFireHp&&beamTravelFrames<420) {
      updateMidBosses(1/60);
      updateBullets(1/60);
      beamTravelFrames+=1;
    }
    return {
      currentArea,
      bossCount:midBosses.filter(candidate=>candidate.finalBoss&&candidate.alive).length,
      idleOnly:boss.idleOnly,
      ran,
      movedTowardPlayer,
      charged,
      fired,
      direction,
      beforeFireHp,
      immediateHp,
      firstFrameDistance,
      beamSpeed:beam?Math.hypot(beam.vx,beam.vy):0,
      beamLength:beam?.beamLength,
      beamRadius:beam?.radius,
      beamMaxRicochets:beam?.maxRicochets,
      beamTravelFrames,
      playerHp:player.hp,
      playerDownPhase:player.downPhase,
      samePlatform:player.platform===boss.platform,
      playerFacesBoss:player.facing===1 && player.x<boss.x,
      bossScreenX:boss.x+boss.width/2-cameraX,
      bossScreenY:boss.y+boss.height/2-cameraY,
      width:WIDTH,
      height:HEIGHT,
      stayedOnRoad:boss.y===before.y,
      bossTier:boss.platform?.bossVerticalTier??0,
      didFire:Boolean(beam),
    };
  })()`, scope);
  assert.equal(result.currentArea, "boss");
  assert.equal(result.bossCount, 1);
  assert.equal(result.idleOnly, false);
  assert.equal(result.ran, true);
  assert.equal(result.movedTowardPlayer, true);
  assert.equal(result.charged, true);
  assert.equal(result.fired, true);
  assert.ok(Math.abs(result.direction.x) >= 0.49, JSON.stringify(result));
  assert.ok(result.direction.y > 0.1);
  assert.equal(result.didFire, true);
  assert.equal(result.immediateHp, result.beforeFireHp);
  assert.ok(result.firstFrameDistance > 0 && result.firstFrameDistance <= 31);
  assert.ok(Math.abs(result.beamSpeed - 1800) < 0.01);
  assert.equal(result.beamLength, 280 / 3);
  assert.equal(result.beamRadius, 11);
  assert.equal(result.beamMaxRicochets, 10);
  assert.ok(result.beamTravelFrames > 1);
  assert.equal(result.playerHp, result.beforeFireHp - 1);
  assert.equal(result.playerDownPhase, "fall");
  assert.ok(result.bossScreenX >= 0 && result.bossScreenX <= result.width);
  assert.ok(result.bossScreenY >= 0 && result.bossScreenY <= result.height);
});

test("a visible final boss queues its video and voice cut-in", () => {
  const { scope, bossButton } = createGame();
  vm.runInContext(`
    globalThis.bossIntroductionRequests=[];
    queueEnemyIntroductionVideo=(kind,distance)=>{
      bossIntroductionRequests.push({kind,distance});
      return true;
    };
  `, scope);
  bossButton.listeners.click({ preventDefault() {} });
  const request = vm.runInContext(`(() => {
    updateMidBosses(1/60);
    return bossIntroductionRequests[0]??null;
  })()`, scope);
  assert.equal(request.kind, "boss");
  assert.ok(Number.isFinite(request.distance));
  assert.ok(request.distance > 0);
});

test("the final boss keeps attacking offscreen and sends projectiles into view", () => {
  const { scope } = createGame();
  const result = vm.runInContext(`(() => {
    enterBossMap();
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    boss.nextAttackIndex=0;
    const offscreenAtStart=!hostileAttackVideoIsVisible(boss);
    let previousState=boss.attackState;
    let offscreenAttacks=0;
    for(let frame=0;frame<900;frame+=1) {
      updateMidBosses(1/60);
      if(boss.attackState==='charge'&&previousState!=='charge'&&
          !hostileAttackVideoIsVisible(boss)) offscreenAttacks+=1;
      previousState=boss.attackState;
    }
    const projectile=enemyBullets.find(bullet=>bullet.kind==='final-boss-beam')??
      enemyBullets.find(bullet=>bullet.kind==='final-boss-fan');
    const spawnedBeyondView=Boolean(projectile&&(
      projectile.x<cameraX||projectile.x>cameraX+WIDTH
    ));
    if(projectile) {
      enemyBullets.splice(0,enemyBullets.length,projectile);
      updateBullets(1/60);
    }
    return {
      offscreenAtStart,
      offscreenAttacks,
      spawnedBeyondView,
      enteredView:Boolean(projectile&&projectile.x>=cameraX&&
        projectile.x<=cameraX+WIDTH&&projectile.y>=cameraY&&
        projectile.y<=cameraY+HEIGHT),
      keepsOffscreen:Boolean(projectile?.keepOffscreen),
    };
  })()`, scope);
  assert.equal(result.offscreenAtStart, true);
  assert.ok(result.offscreenAttacks >= 2);
  assert.equal(result.spawnedBeyondView, true);
  assert.equal(result.enteredView, true);
  assert.equal(result.keepsOffscreen, true);
});

test("final boss attack voice plays occasionally with a cooldown", () => {
  const { scope, bossButton } = createGame();
  vm.runInContext(`
    globalThis.bossAttackVoiceCalls=[];
    playEnemyVideoVoice=(kind)=>{bossAttackVoiceCalls.push(kind);return true;};
  `, scope);
  bossButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    boss.attackVoiceCooldown=0;
    Math.random=()=>0.1;
    prepareFinalBossAttack(boss,targetX,targetY);
    const cooldownAfterVoice=boss.attackVoiceCooldown;
    prepareFinalBossAttack(boss,targetX,targetY);
    boss.attackVoiceCooldown=0;
    Math.random=()=>0.99;
    prepareFinalBossAttack(boss,targetX,targetY);
    return {
      calls:bossAttackVoiceCalls,
      cooldownAfterVoice,
      chance:FINAL_BOSS.attackVoiceChance,
    };
  })()`, scope);
  assert.deepEqual(Array.from(result.calls), ["boss"]);
  assert.equal(result.cooldownAfterVoice, 8);
  assert.equal(result.chance, 0.3);
});

test("the final boss cycles through four attacks without the sky-rain pattern", () => {
  const { scope, bossButton } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    const patterns=[];
    const shotCounts={};
    let dashMoved=false;
    let jumpStarted=false;
    for(let index=0;index<FINAL_BOSS.attackPatterns.length;index+=1) {
      enemyBullets.length=0;
      prepareFinalBossAttack(boss,targetX,targetY);
      patterns.push(boss.attackPattern);
      boss.attackTimer=0;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
      const beforeX=boss.x;
      const beforeY=boss.y;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
      shotCounts[boss.attackPattern]=enemyBullets.length;
      if(boss.attackPattern==='dash') dashMoved=boss.x!==beforeX;
      if(boss.attackPattern==='jump-slam') {
        jumpStarted=boss.airborne&&boss.y<beforeY;
        boss.attackTimer=0;
        updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
      }
      boss.attackState='recovery';
      boss.attackTimer=0;
      updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
    }
    return {
      patterns,shotCounts,dashMoved,jumpStarted,
      speedProfile:{
        beamCharge:FINAL_BOSS.chargeDuration,
        fanCharge:FINAL_BOSS.fanChargeDuration,
        dashCharge:FINAL_BOSS.dashChargeDuration,
        jumpCharge:FINAL_BOSS.jumpChargeDuration,
        beamSpeed:FINAL_BOSS.beamSpeed,
        beamRadius:FINAL_BOSS.beamRadius,
        fanSpeed:FINAL_BOSS.fanProjectileSpeed,
        dashSpeed:FINAL_BOSS.dashSpeed,
      },
    };
  })()`, scope);
  assert.deepEqual(
    Array.from(result.patterns),
    ["beam", "fan", "dash", "jump-slam"],
  );
  assert.equal(result.shotCounts.beam, 1);
  assert.equal(result.shotCounts.fan, 1);
  assert.equal(result.shotCounts["jump-slam"], 0);
  assert.equal(result.dashMoved, true);
  assert.equal(result.jumpStarted, true);
  assert.ok(Object.values(result.speedProfile).every(Number.isFinite));
  assert.ok(Math.max(
    result.speedProfile.beamCharge,
    result.speedProfile.fanCharge,
    result.speedProfile.dashCharge,
    result.speedProfile.jumpCharge,
  ) < 0.9);
  assert.equal(result.speedProfile.fanSpeed, 920);
  assert.equal(result.speedProfile.beamSpeed, 1800);
  assert.equal(result.speedProfile.beamRadius, 11);
  assert.ok(result.speedProfile.dashSpeed >= 900);
});

test("test boss controls expose every attack only while the boss is alive", () => {
  const { scope, bossButton, bossAttackButtons } = createGame();
  assert.ok(bossAttackButtons.every((button) => button.hidden));
  bossButton.listeners.click({ preventDefault() {} });
  assert.ok(bossAttackButtons.every((button) => !button.hidden));

  const selectedPatterns = [];
  for (const button of bossAttackButtons) {
    button.listeners.click({ preventDefault() {} });
    selectedPatterns.push(vm.runInContext(
      "midBosses.find((candidate)=>candidate.finalBoss&&candidate.alive).attackPattern",
      scope,
    ));
  }
  assert.deepEqual(selectedPatterns, [
    "beam", "fan", "dash", "jump-slam",
  ]);

  vm.runInContext(`
    midBosses.find((candidate)=>candidate.finalBoss).alive=false;
    updateTestBossAttackButtons();
  `, scope);
  assert.ok(bossAttackButtons.every((button) => button.hidden));
});

test("the shorter first boss beam survives ten wall bounces and ends on the next hit", () => {
  const { scope, bossButton, bossAttackButtons } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const beamButton = bossAttackButtons.find(
    (button) => button.dataset.testBossAttack === "beam",
  );
  beamButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find((candidate)=>candidate.finalBoss&&candidate.alive);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    boss.attackTimer=0;
    updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
    const beam=enemyBullets.find((bullet)=>bullet.kind==='final-boss-beam');
    const bounceResults=[];
    for(let bounce=0;bounce<10;bounce+=1) {
      const movingRight=bounce%2===0;
      beam.x=cameraX+(movingRight?WIDTH-beam.radius-0.01:beam.radius+0.01);
      beam.y=cameraY+72;
      beam.vx=(movingRight?1:-1)*FINAL_BOSS.beamSpeed;
      beam.vy=0;
      bounceResults.push(moveRicochetingBullet(beam,1/60,beam.ricochetColor));
    }
    const ricochetsAfterTen=beam.ricochets;
    beam.x=cameraX+WIDTH-beam.radius-0.01;
    beam.y=cameraY+72;
    beam.vx=FINAL_BOSS.beamSpeed;
    beam.vy=0;
    const survivesEleventh=moveRicochetingBullet(beam,1/60,beam.ricochetColor);
    return {
      exists:Boolean(beam),
      speed:Math.hypot(beam.vx,beam.vy),
      length:beam.beamLength,
      radius:beam.radius,
      maxRicochets:beam.maxRicochets,
      bounceResults,ricochetsAfterTen,survivesEleventh,
    };
  })()`, scope);
  assert.equal(result.exists, true);
  assert.equal(result.speed, 1800);
  assert.equal(result.length, 280 / 3);
  assert.equal(result.radius, 11);
  assert.equal(result.maxRicochets, 10);
  assert.ok(result.bounceResults.every(Boolean));
  assert.equal(result.ricochetsAfterTen, 10);
  assert.equal(result.survivesEleventh, false);
});

test("the final boss fires six faster round fan lasers in sequence and each bounces five times", () => {
  const { scope, bossButton, bossAttackButtons } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const fanButton = bossAttackButtons.find(
    (button) => button.dataset.testBossAttack === "fan",
  );
  fanButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find((candidate)=>candidate.finalBoss&&candidate.alive);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    boss.attackTimer=0;
    updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
    updateFinalBossAttack(boss,1/60,hit,targetX,targetY,true);
    const sequentialCounts=[enemyBullets.length];
    updateFinalBossAttack(boss,FINAL_BOSS.fanProjectileInterval*0.49,hit,targetX,targetY,true);
    const beforeSecond=enemyBullets.length;
    updateFinalBossAttack(boss,FINAL_BOSS.fanProjectileInterval*0.52,hit,targetX,targetY,true);
    sequentialCounts.push(enemyBullets.length);
    for(let shot=2;shot<FINAL_BOSS.fanProjectileCount;shot+=1) {
      updateFinalBossAttack(boss,FINAL_BOSS.fanProjectileInterval,hit,targetX,targetY,true);
      sequentialCounts.push(enemyBullets.length);
    }
    const fanBullets=enemyBullets.filter((bullet)=>bullet.kind==='final-boss-fan');
    const directions=fanBullets.map((bullet)=>bullet.vy);
    const bullet=fanBullets[0];
    const bounceResults=[];
    for(let bounce=0;bounce<5;bounce+=1) {
      const movingRight=bounce%2===0;
      bullet.x=cameraX+(movingRight?WIDTH-bullet.radius-0.01:bullet.radius+0.01);
      bullet.y=cameraY+72;
      bullet.vx=(movingRight?1:-1)*FINAL_BOSS.fanProjectileSpeed;
      bullet.vy=0;
      bounceResults.push(moveRicochetingBullet(bullet,1/60,bullet.ricochetColor));
    }
    const ricochetsAfterFive=bullet.ricochets;
    bullet.x=cameraX+WIDTH-bullet.radius-0.01;
    bullet.y=cameraY+72;
    bullet.vx=FINAL_BOSS.fanProjectileSpeed;
    bullet.vy=0;
    const survivesSixth=moveRicochetingBullet(bullet,1/60,bullet.ricochetColor);
    return {
      sequentialCounts,beforeSecond,directions,
      allRound:fanBullets.every((candidate)=>(
        candidate.radius===FINAL_BOSS.fanProjectileRadius &&
        candidate.maxRicochets===5 && candidate.ricochetScreenEdges===true
      )),
      bounceResults,ricochetsAfterFive,survivesSixth,
    };
  })()`, scope);
  assert.deepEqual(Array.from(result.sequentialCounts), [1, 2, 3, 4, 5, 6]);
  assert.equal(result.beforeSecond, 1);
  assert.equal(result.directions.length, 6);
  assert.ok(result.directions.every((direction, index, directions) =>
    index === 0 || directions[index - 1] < direction));
  assert.equal(result.allRound, true);
  assert.ok(result.bounceResults.every(Boolean));
  assert.equal(result.ricochetsAfterFive, 5);
  assert.equal(result.survivesSixth, false);
});

test("the final boss jumps in an arc to the player and damages the landing area", () => {
  const { scope, bossButton } = createGame();
  bossButton.listeners.click({ preventDefault() {} });
  const result = vm.runInContext(`(() => {
    const boss=midBosses.find(candidate=>candidate.finalBoss);
    const hit=getPlayerHitbox();
    const targetX=hit.x+hit.width/2;
    const targetY=hit.y+hit.height/2;
    boss.nextAttackIndex=FINAL_BOSS.attackPatterns.indexOf('jump-slam');
    prepareFinalBossAttack(boss,targetX,targetY);
    const lockedTargetX=boss.jumpTargetX;
    const startY=boss.y;
    testInvincibility=false;
    player.invincible=0;
    boss.attackTimer=0;
    updateFinalBossAttack(boss,1/60,getPlayerHitbox(),targetX,targetY,true);
    const takeoffParticleCount=particles.length;
    let highestY=boss.y;
    let sawAirborne=boss.airborne;
    for(let frame=0;frame<90&&boss.attackState==='fire';frame+=1) {
      const currentHit=getPlayerHitbox();
      updateFinalBossAttack(
        boss,1/60,currentHit,
        currentHit.x+currentHit.width/2,
        currentHit.y+currentHit.height/2,
        true
      );
      highestY=Math.min(highestY,boss.y);
      sawAirborne ||= boss.airborne;
    }
    return {
      lockedTargetX,startY,highestY,
      finalX:boss.x,finalY:boss.y,targetY:boss.jumpTargetY,
      sawAirborne,airborne:boss.airborne,
      impactTimer:boss.jumpImpactTimer,
      attackState:boss.attackState,
      playerHp:player.hp,
      playerDownPhase:player.downPhase,
      takeoffParticleCount,
    };
  })()`, scope);
  assert.equal(result.sawAirborne, true);
  assert.ok(result.highestY < result.startY - 250);
  assert.equal(result.finalX, result.lockedTargetX);
  assert.equal(result.finalY, result.targetY);
  assert.equal(result.airborne, false);
  assert.ok(result.impactTimer > 0);
  assert.equal(result.attackState, "recovery");
  assert.equal(result.playerHp, 2);
  assert.equal(result.playerDownPhase, "fall");
  assert.equal(result.takeoffParticleCount, 0);
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
  assert.equal(vm.runInContext("MINIMAP_LOCAL_SCREEN_WIDTHS", scope), 4);
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
