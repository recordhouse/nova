"use strict";

// Procedural path generation, stage population, and resets.

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roadEdgeInsets(platformId, width) {
  const desiredInset = 28 + (platformId * 7) % 9;
  const maximumInsetTotal = Math.max(12, width - 18);
  const scale = Math.min(1, maximumInsetTotal / (desiredInset * 2));
  return {
    start: desiredInset * scale,
    end: desiredInset * scale,
  };
}

function addPlatform(entryX, exitX, level, type = "main", group = 0) {
  const lightColors = ["#65e9ff", "#ffb84d", "#9b8cff"];
  const edgeInsets = roadEdgeInsets(nextPlatformId, Math.abs(exitX - entryX));
  const platform = {
    id: nextPlatformId,
    start: Math.min(entryX, exitX),
    end: Math.max(entryX, exitX),
    entryX,
    exitX,
    direction: exitX >= entryX ? 1 : -1,
    kind: "flat",
    level,
    y: BASE_GROUND_Y + level * LEVEL_GAP,
    type,
    group,
    style: Math.floor(mapRandom() * 3),
    lightColor: lightColors[Math.floor(mapRandom() * lightColors.length)],
    lightSpacing: 120 + mapRandom() * 120,
    lightOffset: 34 + mapRandom() * 72,
    lightPhase: mapRandom() * Math.PI * 2,
    routeRisk: "normal",
    routeRole: "main",
    zone: "transit",
    architecture: "open",
    edgeInsetStart: edgeInsets.start,
    edgeInsetEnd: edgeInsets.end,
  };
  nextPlatformId += 1;
  platforms.push(platform);
  return platform;
}

function addRamp(
  entryX,
  exitX,
  entryLevel,
  exitLevel,
  type,
  group,
) {
  const lightColors = ["#65e9ff", "#ffb84d", "#9b8cff"];
  const edgeInsets = roadEdgeInsets(nextPlatformId, Math.abs(exitX - entryX));
  const entryY = BASE_GROUND_Y + entryLevel * LEVEL_GAP;
  const exitY = BASE_GROUND_Y + exitLevel * LEVEL_GAP;
  const platform = {
    id: nextPlatformId,
    start: Math.min(entryX, exitX),
    end: Math.max(entryX, exitX),
    entryX,
    exitX,
    entryY,
    exitY,
    direction: exitX >= entryX ? 1 : -1,
    kind: "ramp",
    angleDegrees: Math.round(
      Math.atan2(Math.abs(exitY - entryY), Math.abs(exitX - entryX)) * 180 / Math.PI,
    ),
    level: exitLevel,
    y: Math.min(entryY, exitY),
    type,
    group,
    style: Math.floor(mapRandom() * 3),
    lightColor: lightColors[Math.floor(mapRandom() * lightColors.length)],
    lightSpacing: 120 + mapRandom() * 120,
    lightOffset: 34 + mapRandom() * 72,
    lightPhase: mapRandom() * Math.PI * 2,
    routeRisk: "normal",
    routeRole: "main",
    zone: "slope",
    architecture: "open",
    edgeInsetStart: edgeInsets.start,
    edgeInsetEnd: edgeInsets.end,
  };
  nextPlatformId += 1;
  platforms.push(platform);
  return platform;
}

function platformSurfaceY(platform, x) {
  if (platform.kind === "flat") return platform.y;
  const span = platform.exitX - platform.entryX;
  const progress = span === 0
    ? 1
    : Math.max(0, Math.min(1, (x - platform.entryX) / span));
  return platform.entryY + (platform.exitY - platform.entryY) * progress;
}

function platformLowestSurfaceY(platform) {
  return platform.kind === "flat"
    ? platform.y
    : Math.max(platform.entryY, platform.exitY);
}

function isInvertedTrianglePlatform(platform) {
  return Boolean(
    (platform.isJumpPad && platform.trick === "horizontal-jump") ||
    (platform.routeRole === "sub" && platform.floatingTriangleAngle),
  );
}

function invertedTrianglePlatformDepth(platform) {
  const angle = platform.jumpPadTriangleAngle ?? platform.floatingTriangleAngle;
  if (!angle) return 32;
  const halfWidth = (platform.end - platform.start) / 2;
  return halfWidth * Math.tan(angle * Math.PI / 180);
}

function platformVisualBounds(platform, verticalShift = 0) {
  if (platform.kind === "ramp") {
    return {
      left: platform.start,
      right: platform.end,
      top: Math.min(platform.entryY, platform.exitY) + verticalShift,
      bottom: Math.max(platform.entryY, platform.exitY) + 32 + verticalShift,
    };
  }
  return {
    left: platform.start,
    right: platform.end,
    top: platform.y + verticalShift,
    bottom: (
      platform.y +
      (isInvertedTrianglePlatform(platform)
        ? invertedTrianglePlatformDepth(platform)
        : 32) +
      verticalShift
    ),
  };
}

function platformBoundsConflict(
  first,
  second,
  horizontalClearance,
  verticalClearance,
) {
  return (
    first.left < second.right + horizontalClearance &&
    first.right > second.left - horizontalClearance &&
    first.top < second.bottom + verticalClearance &&
    first.bottom > second.top - verticalClearance
  );
}

function resolveFloatingPathClearance() {
  const fixedRoads = platforms.filter((platform) => platform.routeRole !== "sub");
  const floatingRoads = platforms.filter((platform) => platform.routeRole === "sub");
  const acceptedFloatingRoads = [];
  const removedPlatformIds = new Set();

  for (const floating of floatingRoads) {
    let selectedShift = null;
    for (const shift of FLOATING_PATH_CLEARANCE_SHIFTS) {
      const candidateBounds = platformVisualBounds(floating, shift);
      const touchesRoad = fixedRoads.some((road) => platformBoundsConflict(
        candidateBounds,
        platformVisualBounds(road),
        FLOATING_PATH_ROAD_CLEARANCE_X,
        FLOATING_PATH_ROAD_CLEARANCE_Y,
      ));
      if (touchesRoad) continue;

      const touchesFloatingRoad = acceptedFloatingRoads.some((other) => (
        other.group !== floating.group &&
        platformBoundsConflict(
          candidateBounds,
          platformVisualBounds(other),
          FLOATING_PATH_MUTUAL_CLEARANCE_X,
          FLOATING_PATH_MUTUAL_CLEARANCE_Y,
        )
      ));
      if (touchesFloatingRoad) continue;
      selectedShift = shift;
      break;
    }

    if (selectedShift === null) {
      removedPlatformIds.add(floating.id);
      continue;
    }
    floating.y += selectedShift;
    floating.level += selectedShift / LEVEL_GAP;
    floating.floatingClearanceShift = selectedShift;
    acceptedFloatingRoads.push(floating);
  }

  if (removedPlatformIds.size === 0) return;
  for (let index = platforms.length - 1; index >= 0; index -= 1) {
    if (removedPlatformIds.has(platforms[index].id)) platforms.splice(index, 1);
  }
  for (const branch of branches) {
    for (const route of branch.routes) {
      if (!route.platforms) continue;
      route.platforms = route.platforms.filter((id) => !removedPlatformIds.has(id));
    }
    branch.routes = branch.routes.filter((route) => (
      route.role !== "sub" || !route.platforms || route.platforms.length > 0
    ));
  }
}

function chooseRouteLayout(currentLevel, availableLength) {
  // 메인 길은 항상 유지하고, 충분히 긴 구간에만 위쪽 서브 길을 만든다.
  if (availableLength < 440 || mapRandom() < 0.36) {
    return {
      levels: [currentLevel],
      mergeLevel: currentLevel,
    };
  }
  return {
    levels: [currentLevel, currentLevel - SUB_PATH_JUMP_RISE / LEVEL_GAP],
    mergeLevel: currentLevel,
  };
}

function randomLength(ranges) {
  const range = ranges[Math.floor(mapRandom() * ranges.length)];
  return range[0] + mapRandom() * (range[1] - range[0]);
}

function roadGapLevelOffset() {
  return ROAD_GAP_LEVEL_OFFSETS[
    Math.floor(mapRandom() * ROAD_GAP_LEVEL_OFFSETS.length)
  ];
}

function roadRiseCount(length, chance = 0.94, maximumRises = 4) {
  const possibleRises = Math.min(maximumRises, Math.floor(length / 360));
  if (possibleRises <= 0 || mapRandom() > chance) return 0;
  return 1 + Math.floor(mapRandom() * possibleRises);
}

function rampHorizontalRun(angleDegrees, verticalRise = LEVEL_GAP) {
  return verticalRise / Math.tan(angleDegrees * Math.PI / 180);
}

function minimumRampPlanLength() {
  return rampHorizontalRun(40) + RAMP_MIN_LANDING_LENGTH;
}

function chooseRampPlan(maximumLength) {
  const feasibleAngles = RAMP_ANGLE_DEGREES.filter((angleDegrees) => (
    rampHorizontalRun(angleDegrees) + RAMP_MIN_LANDING_LENGTH <= maximumLength
  ));
  if (feasibleAngles.length === 0) return null;

  const angleDegrees = feasibleAngles[Math.floor(mapRandom() * feasibleAngles.length)];
  const slopeRun = rampHorizontalRun(angleDegrees);
  const landingCount = (
    slopeRun + RAMP_MIN_LANDING_LENGTH * 2 <= maximumLength && mapRandom() < 0.58
  ) ? 2 : 1;
  let extraLandingBudget = Math.max(
    0,
    maximumLength - slopeRun - landingCount * RAMP_MIN_LANDING_LENGTH,
  );
  const landingLengths = [];
  for (let landing = 0; landing < landingCount; landing += 1) {
    const remainingLandings = landingCount - landing;
    const maximumExtra = Math.min(
      RAMP_MAX_LANDING_LENGTH - RAMP_MIN_LANDING_LENGTH,
      extraLandingBudget / remainingLandings,
    );
    const extra = mapRandom() * maximumExtra;
    landingLengths.push(RAMP_MIN_LANDING_LENGTH + extra);
    extraLandingBudget -= extra;
  }
  return {
    angleDegrees,
    landingLengths,
    totalLength: slopeRun + landingLengths.reduce((total, value) => total + value, 0),
  };
}

function addRisingPath(
  entryX,
  exitX,
  startLevel,
  riseCount,
  type,
  group,
  minimumFirstTread = 0,
) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const firstFlatMinimum = Math.max(RISING_PATH_MIN_FLAT_LENGTH, minimumFirstTread);
  const minimumPlanLength = minimumRampPlanLength();
  let actualRiseCount = riseCount;
  while (
    actualRiseCount > 0 &&
    length < (
      firstFlatMinimum +
      actualRiseCount * RISING_PATH_MIN_FLAT_LENGTH +
      actualRiseCount * minimumPlanLength
    )
  ) {
    actualRiseCount -= 1;
  }

  if (actualRiseCount <= 0) {
    const endPlatform = addPlatform(entryX, exitX, startLevel, type, group);
    return { endLevel: startLevel, endPlatform };
  }

  const flatMinimums = [
    firstFlatMinimum,
    ...Array(actualRiseCount).fill(RISING_PATH_MIN_FLAT_LENGTH),
  ];
  let planBudget = length - flatMinimums.reduce((total, value) => total + value, 0);
  const rampPlans = [];
  for (let rise = 0; rise < actualRiseCount; rise += 1) {
    const remainingRises = actualRiseCount - rise - 1;
    const maximumPlanLength = planBudget - remainingRises * minimumPlanLength;
    const plan = chooseRampPlan(maximumPlanLength);
    if (!plan) break;
    rampPlans.push(plan);
    planBudget -= plan.totalLength;
  }
  actualRiseCount = rampPlans.length;
  if (actualRiseCount === 0) {
    const endPlatform = addPlatform(entryX, exitX, startLevel, type, group);
    return { endLevel: startLevel, endPlatform };
  }

  const usedPlanLength = rampPlans.reduce((total, plan) => total + plan.totalLength, 0);
  const activeFlatMinimums = flatMinimums.slice(0, actualRiseCount + 1);
  const extraFlatLength = Math.max(
    0,
    length - usedPlanLength - activeFlatMinimums.reduce((total, value) => total + value, 0),
  );
  const flatWeights = activeFlatMinimums.map(() => 0.65 + mapRandom() * 0.75);
  const flatWeightTotal = flatWeights.reduce((total, value) => total + value, 0);
  const flatLengths = activeFlatMinimums.map((minimum, index) => (
    minimum + extraFlatLength * flatWeights[index] / flatWeightTotal
  ));

  const segmentType = `${type}-rise`;
  let endPlatform = null;
  let pathX = entryX;

  for (let rise = 0; rise <= actualRiseCount; rise += 1) {
    const flatExitX = pathX + direction * flatLengths[rise];
    endPlatform = addPlatform(
      pathX,
      flatExitX,
      startLevel - rise,
      segmentType,
      group,
    );
    pathX = flatExitX;
    if (rise >= actualRiseCount) continue;

    const plan = rampPlans[rise];
    const sectionCount = plan.landingLengths.length + 1;
    const sectionLevelRise = 1 / sectionCount;
    const sectionRun = rampHorizontalRun(
      plan.angleDegrees,
      LEVEL_GAP * sectionLevelRise,
    );
    for (let section = 0; section < sectionCount; section += 1) {
      const rampExitX = pathX + direction * sectionRun;
      addRamp(
        pathX,
        rampExitX,
        startLevel - rise - section * sectionLevelRise,
        startLevel - rise - (section + 1) * sectionLevelRise,
        segmentType,
        group,
      );
      pathX = rampExitX;
      if (section < plan.landingLengths.length) {
        const landingExitX = pathX + direction * plan.landingLengths[section];
        addPlatform(
          pathX,
          landingExitX,
          startLevel - rise - (section + 1) * sectionLevelRise,
          segmentType,
          group,
        );
        pathX = landingExitX;
      }
    }
  }
  return { endLevel: startLevel - actualRiseCount, endPlatform };
}

function addJumpRisePath(
  entryX,
  exitX,
  startLevel,
  riseCount,
  type,
  group,
  minimumFirstTread = 0,
) {
  if (riseCount <= 0) return null;
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const entryRunwayMinimum = Math.max(120, minimumFirstTread);
  const exitRunwayMinimum = 180;
  const baseGapLength = riseCount * JUMP_RISE_GAP_MIN;
  const baseLandingLength = Math.max(0, riseCount - 1) * JUMP_RISE_LANDING_MIN;
  const minimumLength = (
    entryRunwayMinimum +
    exitRunwayMinimum +
    baseGapLength +
    baseLandingLength
  );
  if (length < minimumLength) return null;

  let extraBudget = length - minimumLength;
  const desiredGapExtras = Array.from(
    { length: riseCount },
    () => mapRandom() * (JUMP_RISE_GAP_MAX - JUMP_RISE_GAP_MIN),
  );
  const desiredLandingExtras = Array.from(
    { length: Math.max(0, riseCount - 1) },
    () => mapRandom() * (JUMP_RISE_LANDING_MAX - JUMP_RISE_LANDING_MIN),
  );
  const desiredObstacleExtra = (
    desiredGapExtras.reduce((total, value) => total + value, 0) +
    desiredLandingExtras.reduce((total, value) => total + value, 0)
  );
  const obstacleExtraScale = desiredObstacleExtra > 0
    ? Math.min(1, extraBudget * 0.62 / desiredObstacleExtra)
    : 0;
  const gapLengths = desiredGapExtras.map(
    (extra) => JUMP_RISE_GAP_MIN + extra * obstacleExtraScale,
  );
  const landingLengths = desiredLandingExtras.map(
    (extra) => JUMP_RISE_LANDING_MIN + extra * obstacleExtraScale,
  );
  const usedObstacleExtra = desiredObstacleExtra * obstacleExtraScale;
  extraBudget -= usedObstacleExtra;
  const entryRunwayLength = entryRunwayMinimum + extraBudget * (0.38 + mapRandom() * 0.18);
  const exitRunwayLength = (
    length -
    entryRunwayLength -
    gapLengths.reduce((total, value) => total + value, 0) -
    landingLengths.reduce((total, value) => total + value, 0)
  );

  const routePlatforms = [];
  const addJumpRisePlatform = (startX, endX, level, step = 0) => {
    const platform = addPlatform(
      startX,
      endX,
      level,
      `${type}-jump-rise`,
      group,
    );
    platform.elevationPattern = "jump-rise";
    platform.jumpRiseStep = step;
    routePlatforms.push(platform);
    return platform;
  };

  let pathX = entryX;
  const entryRunwayEndX = pathX + direction * entryRunwayLength;
  addJumpRisePlatform(pathX, entryRunwayEndX, startLevel, 0);
  pathX = entryRunwayEndX;

  let endPlatform = null;
  for (let rise = 0; rise < riseCount; rise += 1) {
    pathX += direction * gapLengths[rise];
    const stepLevel = startLevel - rise - 1;
    const stepLength = rise < landingLengths.length
      ? landingLengths[rise]
      : exitRunwayLength;
    const stepEndX = pathX + direction * stepLength;
    endPlatform = addJumpRisePlatform(pathX, stepEndX, stepLevel, rise + 1);
    pathX = stepEndX;
  }

  return {
    endLevel: startLevel - riseCount,
    endPlatform,
    platforms: routePlatforms,
    pattern: "jump-rise",
  };
}

function addDipThenRisePath(
  entryX,
  exitX,
  startLevel,
  riseCount,
  type,
  group,
  minimumFirstTread = 0,
) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const entryRunwayMinimum = Math.max(80, minimumFirstTread);
  const bottomRunwayMinimum = 80;
  const recoveryRunwayMinimum = 100;
  const recoveryMinimumLength = riseCount > 0
    ? (
      recoveryRunwayMinimum +
      riseCount * RISING_PATH_MIN_FLAT_LENGTH +
      riseCount * minimumRampPlanLength()
    )
    : recoveryRunwayMinimum;
  const possiblePlans = DIP_PATH_DEPTH_LEVELS.flatMap((depthLevels) => (
    DIP_PATH_ANGLE_DEGREES.map((angleDegrees) => {
      const slopeRun = rampHorizontalRun(angleDegrees, LEVEL_GAP * depthLevels);
      return {
        depthLevels,
        angleDegrees,
        slopeRun,
        minimumLength: (
          entryRunwayMinimum +
          slopeRun * 2 +
          bottomRunwayMinimum +
          recoveryMinimumLength
        ),
      };
    })
  )).filter((plan) => plan.minimumLength <= length);
  if (possiblePlans.length === 0) return null;

  const plan = possiblePlans[Math.floor(mapRandom() * possiblePlans.length)];

  const startPlatformIndex = platforms.length;
  const extraLength = Math.max(0, length - plan.minimumLength);
  const entryRunwayLength = entryRunwayMinimum + extraLength * (0.36 + mapRandom() * 0.18);
  const bottomRunwayLength = bottomRunwayMinimum + extraLength * (0.1 + mapRandom() * 0.08);
  const entryRunwayEndX = entryX + direction * entryRunwayLength;
  const entryPlatform = addPlatform(
    entryX,
    entryRunwayEndX,
    startLevel,
    `${type}-dip`,
    group,
  );
  entryPlatform.elevationPattern = "dip";

  const downhillEndX = entryRunwayEndX + direction * plan.slopeRun;
  const downhillRamp = addRamp(
    entryRunwayEndX,
    downhillEndX,
    startLevel,
    startLevel + plan.depthLevels,
    `${type}-dip`,
    group,
  );
  downhillRamp.elevationPattern = "dip";
  downhillRamp.isDownhill = true;
  downhillRamp.dipDepthLevels = plan.depthLevels;

  const bottomRunwayEndX = downhillEndX + direction * bottomRunwayLength;
  const bottomPlatform = addPlatform(
    downhillEndX,
    bottomRunwayEndX,
    startLevel + plan.depthLevels,
    `${type}-dip`,
    group,
  );
  bottomPlatform.elevationPattern = "dip";

  const recoveryRampEndX = bottomRunwayEndX + direction * plan.slopeRun;
  const recoveryRamp = addRamp(
    bottomRunwayEndX,
    recoveryRampEndX,
    startLevel + plan.depthLevels,
    startLevel,
    `${type}-dip`,
    group,
  );
  recoveryRamp.elevationPattern = "dip";
  recoveryRamp.isDipRecovery = true;

  const recoveryPath = addRisingPath(
    recoveryRampEndX,
    exitX,
    startLevel,
    riseCount,
    type,
    group,
    recoveryRunwayMinimum,
  );
  for (const platform of platforms.slice(startPlatformIndex)) {
    platform.elevationPattern = "dip";
  }
  return {
    ...recoveryPath,
    pattern: "dip",
  };
}

function addVariedElevationPath(
  entryX,
  exitX,
  startLevel,
  riseCount,
  type,
  group,
  minimumFirstTread = 0,
  forceDip = false,
) {
  if (group > 0) {
    if (forceDip) {
      const forcedDipPath = addDipThenRisePath(
        entryX,
        exitX,
        startLevel,
        riseCount,
        type,
        group,
        minimumFirstTread,
      );
      if (forcedDipPath) return forcedDipPath;
    }

    const patternRoll = mapRandom();
    if (patternRoll < JUMP_RISE_PATH_CHANCE) {
      const jumpRisePath = addJumpRisePath(
        entryX,
        exitX,
        startLevel,
        riseCount,
        type,
        group,
        minimumFirstTread,
      );
      if (jumpRisePath) return jumpRisePath;
    }
    if (patternRoll < JUMP_RISE_PATH_CHANCE + DIP_PATH_CHANCE) {
      const dipPath = addDipThenRisePath(
        entryX,
        exitX,
        startLevel,
        riseCount,
        type,
        group,
        minimumFirstTread,
      );
      if (dipPath) return dipPath;
    }
  }

  const risingPath = addRisingPath(
    entryX,
    exitX,
    startLevel,
    riseCount,
    type,
    group,
    minimumFirstTread,
  );
  risingPath.pattern = "rising";
  return risingPath;
}

function approachLengthFor(group) {
  if (group === 0) return randomLength([[880, 1280]]);
  return randomLength([
    [130, 260],
    [300, 540],
    [620, 1050],
    [1150, 1650],
    [1750, 2300],
  ]);
}

function branchLengthFor() {
  return randomLength([
    [440, 620],
    [660, 940],
    [960, 1420],
    [1500, 2050],
    [2150, 2700],
  ]);
}

function turnDistanceFor() {
  return TURN_DISTANCE_MIN + mapRandom() * (TURN_DISTANCE_MAX - TURN_DISTANCE_MIN);
}

function addSegmentedMainPath(entryX, exitX, level, type, group) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const possibleGaps = Math.min(2, Math.floor((length - 220) / 300));
  const gapCount = possibleGaps > 0 && mapRandom() < 0.68
    ? 1 + Math.floor(mapRandom() * possibleGaps)
    : 0;
  const gapLengths = Array.from({ length: gapCount }, () => (
    38 + mapRandom() * (MAIN_PATH_MAX_GAP - 38)
  ));
  const flatBudget = length - gapLengths.reduce((total, gap) => total + gap, 0);
  const sectionCount = gapCount + 1;
  const minimumSectionLength = 210;
  const extraFlatLength = Math.max(0, flatBudget - sectionCount * minimumSectionLength);
  const sectionWeights = Array.from({ length: sectionCount }, () => 0.65 + mapRandom());
  const totalWeight = sectionWeights.reduce((total, weight) => total + weight, 0);
  const sectionLengths = sectionWeights.map((weight) => (
    minimumSectionLength + extraFlatLength * weight / totalWeight
  ));

  let pathX = entryX;
  let sectionLevel = level;
  const routePlatforms = [];
  for (let section = 0; section < sectionCount; section += 1) {
    const sectionExitX = pathX + direction * sectionLengths[section];
    const platform = addPlatform(pathX, sectionExitX, sectionLevel, type, group);
    platform.routeRole = "main";
    platform.segmentedPathSection = section;
    platform.segmentedPathStartLevel = level;
    routePlatforms.push(platform);
    pathX = sectionExitX;
    if (section < gapLengths.length) {
      pathX += direction * gapLengths[section];
      sectionLevel = Math.max(
        level - 0.3,
        Math.min(level + 0.3, sectionLevel + roadGapLevelOffset()),
      );
    }
  }
  return {
    platforms: routePlatforms,
    endLevel: sectionLevel,
  };
}

function addHorizontalJumpPath(entryX, exitX, level, group) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const minimumPadWidth = HORIZONTAL_JUMP_PAD_WIDTHS[0];
  const feasiblePadCounts = [2, 3, 4, 5].filter((count) => (
    HORIZONTAL_JUMP_MIN_RUNWAY_LENGTH +
    HORIZONTAL_JUMP_DOUBLE_GAP_MIN +
    count * (HORIZONTAL_JUMP_SINGLE_GAP_MIN + minimumPadWidth) <= length
  ));
  const padCount = feasiblePadCounts.length > 0
    ? feasiblePadCounts[Math.floor(mapRandom() * feasiblePadCounts.length)]
    : 2;
  const jumpCount = padCount + 1;
  const doubleJumpGap = Math.floor(mapRandom() * jumpCount);
  const padWidthTiers = Array.from(
    { length: padCount },
    () => Math.floor(mapRandom() * HORIZONTAL_JUMP_PAD_WIDTHS.length),
  );
  const minimumGapLength = (
    HORIZONTAL_JUMP_DOUBLE_GAP_MIN +
    padCount * HORIZONTAL_JUMP_SINGLE_GAP_MIN
  );
  const maximumPadBudget = length - HORIZONTAL_JUMP_MIN_RUNWAY_LENGTH - minimumGapLength;
  const padWidthTotal = () => padWidthTiers.reduce(
    (total, tier) => total + HORIZONTAL_JUMP_PAD_WIDTHS[tier],
    0,
  );
  while (padWidthTotal() > maximumPadBudget) {
    const reduciblePads = padWidthTiers
      .map((tier, index) => ({ tier, index }))
      .filter((pad) => pad.tier > 0);
    if (reduciblePads.length === 0) break;
    const selectedPad = reduciblePads[Math.floor(mapRandom() * reduciblePads.length)];
    padWidthTiers[selectedPad.index] -= 1;
  }
  const padLengths = padWidthTiers.map((tier) => HORIZONTAL_JUMP_PAD_WIDTHS[tier]);
  const padTriangleAngles = Array.from(
    { length: padCount },
    () => HORIZONTAL_JUMP_PAD_TRIANGLE_ANGLES[
      Math.floor(mapRandom() * HORIZONTAL_JUMP_PAD_TRIANGLE_ANGLES.length)
    ],
  );

  const padHeights = [];
  let previousHeightIndex = 1;
  for (let pad = 0; pad < padCount; pad += 1) {
    const heightOptions = [0, 1, 2].filter(
      (heightIndex) => Math.abs(heightIndex - previousHeightIndex) <= 1,
    );
    const heightIndex = heightOptions[Math.floor(mapRandom() * heightOptions.length)];
    padHeights.push(HORIZONTAL_JUMP_PAD_HEIGHTS[heightIndex]);
    previousHeightIndex = heightIndex;
  }

  const heightSequence = [
    HORIZONTAL_JUMP_PAD_HEIGHTS[1],
    ...padHeights,
    HORIZONTAL_JUMP_PAD_HEIGHTS[1],
  ];
  const baseGapLengths = Array.from({ length: jumpCount }, (_, jump) => (
    jump === doubleJumpGap
      ? HORIZONTAL_JUMP_DOUBLE_GAP_MIN
      : HORIZONTAL_JUMP_SINGLE_GAP_MIN
  ));
  const desiredGapExtras = baseGapLengths.map((_, jump) => {
    if (jump === doubleJumpGap) {
      return mapRandom() * (
        HORIZONTAL_JUMP_DOUBLE_GAP_MAX - HORIZONTAL_JUMP_DOUBLE_GAP_MIN
      );
    }
    const climbsUp = (
      heightSequence[jump + 1].levelOffset < heightSequence[jump].levelOffset
    );
    const maximumSingleGap = climbsUp ? 194 : HORIZONTAL_JUMP_SINGLE_GAP_MAX;
    return mapRandom() * (maximumSingleGap - HORIZONTAL_JUMP_SINGLE_GAP_MIN);
  });
  const availableGapExtra = Math.max(
    0,
    length - HORIZONTAL_JUMP_MIN_RUNWAY_LENGTH -
      padLengths.reduce((total, padLength) => total + padLength, 0) -
      baseGapLengths.reduce((total, gapLength) => total + gapLength, 0),
  );
  const desiredGapExtraTotal = desiredGapExtras.reduce((total, extra) => total + extra, 0);
  const gapExtraScale = desiredGapExtraTotal > 0
    ? Math.min(1, availableGapExtra / desiredGapExtraTotal)
    : 0;
  const gapLengths = baseGapLengths.map(
    (baseGap, jump) => baseGap + desiredGapExtras[jump] * gapExtraScale,
  );
  const obstacleLength = (
    gapLengths.reduce((total, gap) => total + gap, 0) +
    padLengths.reduce((total, pad) => total + pad, 0)
  );
  const runwayLength = length - obstacleLength;
  const entryRunwayLength = runwayLength * (0.44 + mapRandom() * 0.12);
  const exitRunwayLength = length - obstacleLength - entryRunwayLength;
  const routePlatforms = [];

  const addJumpPlatform = (startX, endX, platformLevel, padData = null) => {
    const platform = addPlatform(
      startX,
      endX,
      platformLevel,
      "horizontal-jump-path",
      group,
    );
    platform.routeRole = "main";
    platform.routeRisk = "safe";
    platform.trick = "horizontal-jump";
    platform.isJumpPad = Boolean(padData);
    platform.jumpPadWidthTier = padData?.widthTier ?? null;
    platform.jumpPadHeight = padData?.height?.name ?? null;
    platform.jumpPadTriangleAngle = padData?.triangleAngle ?? null;
    routePlatforms.push(platform);
    return platform;
  };

  let pathX = entryX;
  const entryRunwayEndX = pathX + direction * entryRunwayLength;
  addJumpPlatform(pathX, entryRunwayEndX, level);
  pathX = entryRunwayEndX;

  for (let jump = 0; jump < jumpCount; jump += 1) {
    pathX += direction * gapLengths[jump];
    if (jump >= padLengths.length) continue;
    const padEndX = pathX + direction * padLengths[jump];
    addJumpPlatform(
      pathX,
      padEndX,
      level + padHeights[jump].levelOffset,
      {
        widthTier: padWidthTiers[jump],
        height: padHeights[jump],
        triangleAngle: padTriangleAngles[jump],
      },
    );
    pathX = padEndX;
  }

  addJumpPlatform(pathX, pathX + direction * exitRunwayLength, level);
  return {
    platforms: routePlatforms,
    padCount,
    jumpCount,
    gapLengths,
    doubleJumpGap,
    padLengths,
    padHeights: padHeights.map((height) => height.name),
    padTriangleAngles,
  };
}

function addSubPath(entryX, exitX, mainLevel, group) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const startMargin = 76 + mapRandom() * Math.min(130, length * 0.13);
  const endMargin = 72 + mapRandom() * Math.min(150, length * 0.14);
  const usableLength = length - startMargin - endMargin;
  if (usableLength < SUB_PATH_MIN_SEGMENT_LENGTH) return [];

  let segmentCount = Math.min(6, 1 + Math.floor(usableLength / 285));
  let gapLengths = [];
  while (segmentCount > 1) {
    gapLengths = Array.from({ length: segmentCount - 1 }, () => (
      mapRandom() < 0.22
        ? FLOATING_PATH_WIDE_GAP_MIN +
          mapRandom() * (FLOATING_PATH_WIDE_GAP_MAX - FLOATING_PATH_WIDE_GAP_MIN)
        : FLOATING_PATH_GAP_MIN +
          mapRandom() * (FLOATING_PATH_GAP_MAX - FLOATING_PATH_GAP_MIN)
    ));
    const totalGapLength = gapLengths.reduce((total, gap) => total + gap, 0);
    if (usableLength - totalGapLength >= segmentCount * SUB_PATH_MIN_SEGMENT_LENGTH) break;
    segmentCount -= 1;
  }
  if (segmentCount === 1) gapLengths = [];

  const totalGapLength = gapLengths.reduce((total, gap) => total + gap, 0);
  const flatBudget = usableLength - totalGapLength;
  const extraFlatLength = Math.max(
    0,
    flatBudget - segmentCount * SUB_PATH_MIN_SEGMENT_LENGTH,
  );
  const segmentWeights = Array.from({ length: segmentCount }, () => 0.6 + mapRandom());
  const totalWeight = segmentWeights.reduce((total, weight) => total + weight, 0);
  const segmentLengths = segmentWeights.map((weight) => (
    SUB_PATH_MIN_SEGMENT_LENGTH + extraFlatLength * weight / totalWeight
  ));
  const peakJumpCount = 1 + Math.floor(mapRandom() * Math.min(3, segmentCount));
  const levelPerJump = SUB_PATH_JUMP_RISE / LEVEL_GAP;
  const subPathRisk = mapRandom() < 0.68 ? "danger" : "safe";

  let jumpHeight = 1;
  let pathX = entryX + direction * startMargin;
  const routePlatforms = [];
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if (segment < peakJumpCount) {
      jumpHeight = segment + 1;
    } else if (gapLengths[segment - 1] >= 120) {
      jumpHeight = 1;
    } else {
      const heightChange = mapRandom();
      if (heightChange < 0.3) jumpHeight = Math.max(1, jumpHeight - 1);
      if (heightChange > 0.72) jumpHeight = Math.min(3, jumpHeight + 1);
    }

    const segmentExitX = pathX + direction * segmentLengths[segment];
    const platform = addPlatform(
      pathX,
      segmentExitX,
      mainLevel - jumpHeight * levelPerJump,
      "sub-route",
      group,
    );
    platform.routeRole = "sub";
    platform.routeRisk = subPathRisk;
    platform.jumpHeight = jumpHeight;
      platform.floatingTriangleAngle = FLOATING_PATH_TRIANGLE_ANGLES[
        Math.floor(mapRandom() * FLOATING_PATH_TRIANGLE_ANGLES.length)
      ];
    routePlatforms.push(platform);
    pathX = segmentExitX;
    if (segment < gapLengths.length) {
      pathX += direction * gapLengths[segment];
    }
  }
  return routePlatforms;
}

function finalizePlatformVariety() {
  for (const platform of platforms) {
    if (platform.kind !== "flat") continue;
    const length = platform.end - platform.start;

    if (platform.trick === "horizontal-jump") {
      platform.zone = platform.isJumpPad ? "jump-pad" : "jump-runway";
      platform.architecture = "open";
      platform.lightColor = platform.isJumpPad ? "#ffe27a" : "#72f3ff";
      platform.lightSpacing = platform.isJumpPad ? 54 : 96;
      continue;
    }

    if (platform.elevationPattern === "jump-rise") {
      platform.zone = "jump-rise";
      platform.architecture = "open";
      platform.lightColor = "#ffd36a";
      platform.lightSpacing = 68;
      continue;
    }

    if (platform.routeRole === "sub") {
      platform.zone = "sub";
      platform.architecture = mapRandom() < 0.52 ? "conduit" : "open";
      platform.lightColor = "#bd9cff";
      platform.lightSpacing = 76 + mapRandom() * 58;
      continue;
    }

    if (platform.type === "merge") {
      platform.zone = "connector";
    } else if (length >= 760 && mapRandom() < 0.58) {
      platform.zone = "combat";
    } else if (length <= 220) {
      platform.zone = "narrow";
    } else {
      platform.zone = mapRandom() < 0.22 ? "rest" : "transit";
    }

    if (mapRandom() < 0.36) {
      platform.architecture = "conduit";
    }

    if (platform.zone === "combat") {
      platform.lightColor = "#ffad54";
      platform.lightSpacing = 88 + mapRandom() * 58;
    } else if (platform.zone === "connector") {
      platform.lightColor = "#69f5ff";
      platform.lightSpacing = 70 + mapRandom() * 38;
    } else if (platform.zone === "rest") {
      platform.lightColor = "#8dffbd";
    }

    if (
      platform.group > 0 &&
      length >= PLATFORM_FEATURE_MIN_LENGTH
    ) {
      const featureTypes = [
        "broken-neon",
        "electric-hose",
        "damaged-road",
        "damaged-road-large",
      ];
      const featureCount = Math.max(
        1,
        Math.floor(length / PLATFORM_FEATURE_SLOT_LENGTH),
      );
      const featureSlotWidth = length / featureCount;
      platform.features = [];

      for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
        const featureType = featureTypes[
          Math.floor(mapRandom() * featureTypes.length)
        ];
        const isLargeDamage = featureType === "damaged-road-large";
        const configuredMinimum = isLargeDamage
          ? PLATFORM_FEATURE_LARGE_WIDTH_MIN
          : PLATFORM_FEATURE_WIDTH_MIN;
        const configuredMaximum = isLargeDamage
          ? PLATFORM_FEATURE_LARGE_WIDTH_MAX
          : PLATFORM_FEATURE_WIDTH_MAX;
        const maximumFeatureWidth = Math.max(
          72,
          Math.min(configuredMaximum, featureSlotWidth - (isLargeDamage ? 28 : 40)),
        );
        const minimumFeatureWidth = Math.min(
          configuredMinimum,
          maximumFeatureWidth,
        );
        const featureWidth = (
          minimumFeatureWidth +
          mapRandom() * (maximumFeatureWidth - minimumFeatureWidth)
        );
        const slotStart = platform.start + featureIndex * featureSlotWidth;
        const slotCenter = slotStart + featureSlotWidth / 2;
        const centerJitter = Math.max(
          0,
          (featureSlotWidth - featureWidth) / 2 - 14,
        );
        platform.features.push({
          type: featureType,
          width: featureWidth,
          centerX: slotCenter + (mapRandom() - 0.5) * centerJitter * 2,
          phase: mapRandom() * Math.PI * 2,
          seed: Math.floor(mapRandom() * 100000),
        });
      }
    }
  }
}

function generateMap() {
  platforms.length = 0;
  branches.length = 0;
  midBosses.length = 0;
  nextPlatformId = 1;
  mapSeed = Math.floor(Math.random() * 4294967295) >>> 0;
  mapRandom = createSeededRandom(mapSeed);

  let cursor = -200;
  let direction = 1;
  let currentLevel = 0;
  let group = 0;
  let traveledDistance = 0;
  let distanceSinceTurn = 0;
  let distanceSinceDip = 0;
  let nextTurnDistance = turnDistanceFor();
  let lastHorizontalJumpGroup = -4;

  const addTrackedElevationPath = (
    entryX,
    exitX,
    startLevel,
    riseCount,
    type,
    pathGroup,
    minimumFirstTread = 0,
  ) => {
    const pathLength = Math.abs(exitX - entryX);
    const forceDip = (
      pathGroup > 0 &&
      distanceSinceDip + pathLength >= DIP_PATH_FORCE_DISTANCE
    );
    const path = addVariedElevationPath(
      entryX,
      exitX,
      startLevel,
      riseCount,
      type,
      pathGroup,
      minimumFirstTread,
      forceDip,
    );
    distanceSinceDip = path.pattern === "dip"
      ? 0
      : distanceSinceDip + pathLength;
    return path;
  };

  while (traveledDistance < WORLD_LENGTH - 900) {
    const maximumApproach = WORLD_LENGTH - traveledDistance - 620;
    if (maximumApproach < 150) break;
    const approachLength = Math.min(approachLengthFor(group), maximumApproach);
    const splitEnd = cursor + direction * approachLength;
    const approachRises = group === 0
      ? 1
      : roadRiseCount(approachLength);
    const approachPath = addTrackedElevationPath(
      cursor,
      splitEnd,
      currentLevel,
      approachRises,
      "main",
      group,
      group === 0 ? 420 : 0,
    );
    currentLevel = approachPath.endLevel;
    traveledDistance += approachLength;
    distanceSinceTurn += approachLength;

    const entryGaps = [0, 0, 20, 38, 58, 82, 110];
    const entryGap = entryGaps[Math.floor(mapRandom() * entryGaps.length)];
    const branchStart = splitEnd + direction * entryGap;
    const maximumBranch = WORLD_LENGTH - traveledDistance - entryGap - 320;
    if (maximumBranch < 420) {
      cursor = splitEnd;
      break;
    }
    const branchLength = Math.min(branchLengthFor(), maximumBranch);
    const branchEnd = branchStart + direction * branchLength;
    const entryLevelOffset = entryGap > 0 ? roadGapLevelOffset() : 0;
    currentLevel += entryLevelOffset;
    const useHorizontalJumpPath = (
      traveledDistance >= 2600 &&
      branchLength >= HORIZONTAL_JUMP_PATH_MIN_LENGTH &&
      group - lastHorizontalJumpGroup >= 3 &&
      mapRandom() < HORIZONTAL_JUMP_PATH_CHANCE
    );
    const layout = useHorizontalJumpPath
      ? { levels: [currentLevel], mergeLevel: currentLevel }
      : chooseRouteLayout(currentLevel, branchLength);
    const hasSubPath = !useHorizontalJumpPath && layout.levels.length === 2;
    const routeData = [];
    let branchExitLevel = layout.mergeLevel;
    if (useHorizontalJumpPath) {
      const jumpPath = addHorizontalJumpPath(
        branchStart,
        branchEnd,
        currentLevel,
        group,
      );
      lastHorizontalJumpGroup = group;
      routeData.push({
        role: "main",
        trick: "horizontal-jump",
        level: currentLevel,
        padCount: jumpPath.padCount,
        jumpCount: jumpPath.jumpCount,
        gapLengths: jumpPath.gapLengths,
        doubleJumpGap: jumpPath.doubleJumpGap,
        padLengths: jumpPath.padLengths,
        padHeights: jumpPath.padHeights,
        padTriangleAngles: jumpPath.padTriangleAngles,
        platforms: jumpPath.platforms.map((platform) => platform.id),
      });
      distanceSinceDip += branchLength;
    } else if (hasSubPath) {
      const mainStartIndex = platforms.length;
      const mainRiseCount = branchLength >= 700
        ? roadRiseCount(branchLength, 0.92, 2)
        : 0;
      let mainPlatforms;
      if (mainRiseCount > 0) {
        const mainPath = addTrackedElevationPath(
          branchStart,
          branchEnd,
          currentLevel,
          mainRiseCount,
          "main-route",
          group,
        );
        branchExitLevel = mainPath.endLevel;
        mainPlatforms = platforms.slice(mainStartIndex);
      } else {
        const segmentedPath = addSegmentedMainPath(
          branchStart,
          branchEnd,
          currentLevel,
          "main-route",
          group,
        );
        mainPlatforms = segmentedPath.platforms;
        branchExitLevel = segmentedPath.endLevel;
        distanceSinceDip += branchLength;
      }

      const subRunsBackward = mainRiseCount > 0 || mapRandom() < 0.58;
      const subEntryX = subRunsBackward ? branchEnd : branchStart;
      const subExitX = subRunsBackward ? branchStart : branchEnd;
      const subReferenceLevel = branchExitLevel;
      const subPlatforms = addSubPath(
        subEntryX,
        subExitX,
        subReferenceLevel,
        group,
      );
      routeData.push({
        role: "main",
        level: currentLevel,
        endLevel: branchExitLevel,
        platforms: mainPlatforms.map((platform) => platform.id),
      });
      routeData.push({
        role: "sub",
        direction: subRunsBackward ? -direction : direction,
        platforms: subPlatforms.map((platform) => platform.id),
      });
    } else {
      const branchRises = roadRiseCount(branchLength, 0.96);
      const branchPath = addTrackedElevationPath(
        branchStart,
        branchEnd,
        currentLevel,
        branchRises,
        "branch",
        group,
      );
      branchExitLevel = branchPath.endLevel;
      routeData.push({
        role: "main",
        level: currentLevel,
        endLevel: branchExitLevel,
      });
    }
    branches.push({
      entryX: branchStart,
      exitX: branchEnd,
      routes: routeData,
      group,
      direction,
      entryGap,
      entryLevelOffset,
    });
    traveledDistance += entryGap + branchLength;
    distanceSinceTurn += entryGap + branchLength;

    const shouldTurn = distanceSinceTurn >= nextTurnDistance && traveledDistance < WORLD_LENGTH - 1400;
    if (shouldTurn && MID_BOSS_ENABLED) {
      addMidBoss(branchEnd, branchExitLevel, direction, group);
    }
    const exitGaps = [0, 0, 22, 42, 68, 96, 122];
    const exitGap = shouldTurn ? 0 : exitGaps[Math.floor(mapRandom() * exitGaps.length)];
    const exitLevelOffset = exitGap > 0 ? roadGapLevelOffset() : 0;
    currentLevel = shouldTurn
      ? branchExitLevel - TURN_PATH_RISE / LEVEL_GAP
      : branchExitLevel + exitLevelOffset;
    branches[branches.length - 1].exitGap = exitGap;
    branches[branches.length - 1].exitLevelOffset = exitLevelOffset;
    traveledDistance += exitGap;
    distanceSinceTurn += exitGap;

    if (shouldTurn) {
      const turnStartOffset = (
        TURN_PATH_START_OFFSET_MIN +
        mapRandom() * (TURN_PATH_START_OFFSET_MAX - TURN_PATH_START_OFFSET_MIN)
      );
      cursor = branchEnd + direction * turnStartOffset;
      branches[branches.length - 1].turnStartOffset = turnStartOffset;
      branches[branches.length - 1].nextRouteStartX = cursor;
      direction *= -1;
      distanceSinceTurn = 0;
      distanceSinceDip = 0;
      nextTurnDistance = turnDistanceFor();
    } else {
      cursor = branchEnd + direction * exitGap;
    }
    group += 1;
  }

  const remainingDistance = Math.max(300, WORLD_LENGTH - traveledDistance);
  goalX = cursor + direction * remainingDistance;
  const goalRises = roadRiseCount(remainingDistance, 1, 3);
  const goalPath = addTrackedElevationPath(
    cursor,
    goalX,
    currentLevel,
    goalRises,
    "main",
    group,
  );
  goalPlatform = goalPath.endPlatform;
  resolveFloatingPathClearance();
  finalizePlatformVariety();
  minWorldX = Math.min(...platforms.map((platform) => platform.start)) - 120;
  maxWorldX = Math.max(...platforms.map((platform) => platform.end)) + 120;
  lowestPlatformY = Math.max(...platforms.map(platformLowestSurfaceY));
}

function platformsAt(x) {
  return platforms.filter((platform) => x >= platform.start && x < platform.end);
}

function buildStars() {
  let seed = 72831;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 150; i += 1) {
    stars.push({
      x: random() * (WIDTH + 160),
      y: 90 + random() * (HEIGHT - 180),
      size: 0.7 + random() * 2.2,
      depth: 0.08 + random() * 0.2,
      glow: random() > 0.82,
      phase: random() * Math.PI * 2,
    });
  }
}

function addEnemy(platform, x, kind = "monster1") {
  const definition = MONSTER_TYPES[kind] ?? MONSTER_TYPES.monster1;
  enemies.push({
    x,
    y: platform.y - definition.height,
    width: definition.width,
    height: definition.height,
    spriteWidth: definition.spriteWidth,
    spriteHeight: definition.spriteHeight,
    spriteBottomOffset: definition.spriteBottomOffset,
    kind,
    platform,
    hp: definition.hp,
    speed: definition.speed,
    chaseRange: definition.chaseRange,
    jumpAttackRange: definition.jumpAttackRange,
    jumpLaunchSpeed: definition.jumpLaunchSpeed,
    jumpGravity: definition.jumpGravity,
    jumpMinHorizontalSpeed: definition.jumpMinHorizontalSpeed,
    jumpMaxHorizontalSpeed: definition.jumpMaxHorizontalSpeed,
    jumpWindupDuration: definition.jumpWindupDuration,
    jumpRecoveryDuration: definition.jumpRecoveryDuration,
    jumpCooldownDuration: definition.jumpCooldown,
    jumpCooldown: 0.35 + mapRandom() * definition.jumpCooldown,
    jumpVx: 0,
    jumpVy: 0,
    jumpHit: false,
    state: "chase",
    stateTimer: 0,
    animationTime: mapRandom() * Math.PI * 2,
    animationPhase: mapRandom() * Math.PI * 2,
    moving: false,
    attackCooldown: definition.attackCooldown,
    attackTimer: 0,
    score: definition.score,
    alive: true,
    facing: -1,
  });
}

function addMidBoss(turnX, surfaceLevel, incomingDirection, group) {
  const surfaceY = BASE_GROUND_Y + surfaceLevel * LEVEL_GAP;
  const centerX = turnX - incomingDirection * 190;
  const baseY = surfaceY - 450;
  midBosses.push({
    x: centerX - MID_BOSS.width / 2,
    y: baseY,
    baseY,
    targetY: baseY,
    width: MID_BOSS.width,
    height: MID_BOSS.height,
    hp: MID_BOSS.hp,
    maxHp: MID_BOSS.hp,
    group,
    incomingDirection,
    facing: -incomingDirection,
    moveTimer: 0.35 + mapRandom() * 0.65,
    fireTimer: 1.1 + mapRandom() * 1.1,
    phase: mapRandom() * Math.PI * 2,
    active: false,
    alive: true,
  });
}

function buildStage() {
  for (const platform of platforms) {
    if (platform.kind !== "flat") continue;
    if (platform.trick === "horizontal-jump") continue;
    const visibleStart = platform.group === 0
      ? Math.max(460, platform.start + ENEMY_SPAWN_EDGE_MARGIN)
      : platform.start + ENEMY_SPAWN_EDGE_MARGIN;
    const visibleEnd = platform.end - ENEMY_SPAWN_EDGE_MARGIN;
    const spawnLength = visibleEnd - visibleStart;
    if (spawnLength < ENEMY_SPAWN_MIN_LENGTH) continue;

    const rising = platform.type.endsWith("-rise");
    let enemyChance = rising
      ? 0.74
      : platform.type === "branch" ? 0.9 : 0.97;
    if (platform.routeRisk === "safe") enemyChance *= 0.68;
    if (platform.routeRisk === "danger") enemyChance = Math.min(0.99, enemyChance * 1.2);
    if (platform.zone === "combat") enemyChance = Math.min(0.99, enemyChance * 1.12);
    if (platform.zone === "rest" || platform.zone === "connector") enemyChance *= 0.72;

    const enemySlots = Math.min(
      ENEMY_SPAWN_MAX_SLOTS,
      Math.max(1, Math.ceil(spawnLength / ENEMY_SPAWN_SLOT_LENGTH)),
    );
    for (let slot = 0; slot < enemySlots; slot += 1) {
      const slotChance = slot === 0
        ? enemyChance
        : Math.min(0.97, enemyChance * (platform.zone === "combat" ? 1 : 0.88));
      if (mapRandom() >= slotChance) continue;
      const slotLength = spawnLength / enemySlots;
      const x = visibleStart + slotLength * slot + mapRandom() * Math.max(1, slotLength - 60);
      addEnemy(platform, x, "monster1");
    }

    let propChance = rising ? 0.38 : 0.62;
    if (platform.routeRisk === "safe") propChance *= 0.72;
    if (platform.zone === "connector") propChance *= 0.28;
    if (mapRandom() < propChance) {
      props.push({
        platform,
        x: visibleStart + mapRandom() * (visibleEnd - visibleStart),
        width: 34 + mapRandom() * 46,
        height: 25 + mapRandom() * 28,
      });
    }
  }
}

function startingPlatform() {
  return platformsAt(player.x + player.width / 2)[0] ?? platforms[0];
}

function resetPlayerPosition() {
  player.x = 110;
  player.platform = startingPlatform();
  player.y = platformSurfaceY(
    player.platform,
    player.x + player.width / 2,
  ) - player.height;
  player.vx = 0;
  player.vy = 0;
  player.fireTimer = 0;
  player.fireAnimationTime = 0;
  player.fireBarrel = 0;
  player.fireWasActive = false;
  player.grounded = true;
  player.crouching = false;
  player.jumpLatch = false;
  player.jumpCount = 0;
  player.airJumpAvailable = true;
  player.jumpAnimationTime = 0;
  player.fallReferenceY = player.y + player.height;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  jumpQueued = false;
}

function horizontalJumpTestRoutes() {
  return branches
    .flatMap((branch) => branch.routes)
    .filter((route) => route.trick === "horizontal-jump")
    .map((route) => ({
      route,
      firstPlatform: platforms.find((platform) => platform.id === route.platforms[0]),
    }))
    .filter((entry) => entry.firstPlatform);
}

function updateTestJumpPathButton(routeNumber = 0, routeCount = horizontalJumpTestRoutes().length) {
  if (!testJumpPathButton || !TEST_MODE) return;
  testJumpPathButton.textContent = routeNumber > 0
    ? `JUMP ${routeNumber}/${routeCount}`
    : `JUMP ${routeCount}`;
  testJumpPathButton.setAttribute(
    "aria-label",
    routeNumber > 0
      ? `가로형 점프길 ${routeNumber}/${routeCount}, 다음 점프길 보기`
      : `가로형 점프길 바로 보기, 생성된 구간 ${routeCount}개`,
  );
}

function movePlayerToHorizontalJumpPath() {
  if (!TEST_MODE) return;
  let testRoutes = horizontalJumpTestRoutes();

  if (testRoutes.length === 0) {
    for (let attempt = 0; attempt < 10 && testRoutes.length === 0; attempt += 1) {
      resetGame();
      testRoutes = horizontalJumpTestRoutes();
    }
  }

  if (testRoutes.length === 0) {
    if (testJumpPathButton) {
      testJumpPathButton.textContent = "JUMP 0";
      testJumpPathButton.setAttribute("aria-label", "점프길을 찾지 못했습니다. 다시 시도");
    }
    return;
  }

  testJumpRouteIndex = (testJumpRouteIndex + 1) % testRoutes.length;
  const { firstPlatform } = testRoutes[testJumpRouteIndex];
  const direction = firstPlatform.direction;
  const runwayLength = firstPlatform.end - firstPlatform.start;
  const previewOffset = Math.min(150, Math.max(64, runwayLength * 0.34));
  const playerCenterX = firstPlatform.entryX + direction * previewOffset;

  resetAllInputs();
  bullets.length = 0;
  enemyBullets.length = 0;
  particles.length = 0;
  player.x = Math.max(
    firstPlatform.start,
    Math.min(firstPlatform.end - player.width, playerCenterX - player.width / 2),
  );
  player.y = platformSurfaceY(firstPlatform, player.x + player.width / 2) - player.height;
  player.vx = 0;
  player.vy = 0;
  player.facing = direction;
  player.platform = firstPlatform;
  player.grounded = true;
  player.crouching = false;
  player.jumpLatch = false;
  player.jumpCount = 0;
  player.airJumpAvailable = true;
  player.jumpAnimationTime = 0;
  player.fallReferenceY = player.y + player.height;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  player.fireTimer = 0;
  player.fireAnimationTime = 0;
  player.fireWasActive = false;
  player.invincible = 1;
  gameOver = false;

  cameraLookDirection = direction;
  const screenPosition = direction > 0 ? WIDTH * 0.14 : WIDTH * 0.86;
  cameraX = Math.max(
    minWorldX,
    Math.min(maxWorldX - WIDTH, player.x + player.width / 2 - screenPosition),
  );
  cameraY = player.y + player.height - BASE_GROUND_Y;
  updateTestJumpPathButton(testJumpRouteIndex + 1, testRoutes.length);
}

function updateTestResolutionButton() {
  if (!testResolutionButton || !TEST_MODE) return;
  const currentPreset = TEST_RESOLUTION_PRESETS[testResolutionPresetIndex];
  const nextPreset = TEST_RESOLUTION_PRESETS[
    (testResolutionPresetIndex + 1) % TEST_RESOLUTION_PRESETS.length
  ];
  testResolutionButton.textContent = `RES ${currentPreset.width}`;
  testResolutionButton.setAttribute(
    "aria-label",
    `현재 해상도 ${currentPreset.width} 곱하기 ${currentPreset.height}, ` +
      `${nextPreset.width} 곱하기 ${nextPreset.height}로 전환`,
  );
}

function cycleTestResolution() {
  if (!TEST_MODE) return;
  resetAllInputs();

  const previousWidth = WIDTH;
  const previousHeight = HEIGHT;
  const previousGroundY = BASE_GROUND_Y;
  const playerCenterX = player.x + player.width / 2;
  const playerScreenRatio = previousWidth > 0
    ? (playerCenterX - cameraX) / previousWidth
    : 0.5;

  testResolutionPresetIndex = (
    testResolutionPresetIndex + 1
  ) % TEST_RESOLUTION_PRESETS.length;
  const nextPreset = TEST_RESOLUTION_PRESETS[testResolutionPresetIndex];
  configureCanvasResolution(nextPreset.width, nextPreset.height);

  const verticalShift = BASE_GROUND_Y - previousGroundY;
  for (const platform of platforms) {
    platform.y += verticalShift;
    if (platform.kind === "ramp") {
      platform.entryY += verticalShift;
      platform.exitY += verticalShift;
    }
  }
  player.y += verticalShift;
  player.fallReferenceY += verticalShift;
  for (const enemy of enemies) enemy.y += verticalShift;
  for (const boss of midBosses) {
    boss.y += verticalShift;
    boss.baseY += verticalShift;
    boss.targetY += verticalShift;
  }
  for (const bullet of bullets) bullet.y += verticalShift;
  for (const bullet of enemyBullets) bullet.y += verticalShift;
  for (const particle of particles) particle.y += verticalShift;
  for (const star of stars) star.y *= HEIGHT / previousHeight;
  lowestPlatformY += verticalShift;

  const preservedScreenX = Math.max(0, Math.min(1, playerScreenRatio)) * WIDTH;
  cameraX = Math.max(
    minWorldX,
    Math.min(maxWorldX - WIDTH, playerCenterX - preservedScreenX),
  );
  shake = 0;
  updateTestResolutionButton();
}

function resetGame() {
  bullets.length = 0;
  enemyBullets.length = 0;
  particles.length = 0;
  enemies.length = 0;
  props.length = 0;
  generateMap();
  resetPlayerPosition();

  player.hp = 3;
  player.score = 0;
  player.invincible = 0;
  cameraLookDirection = 1;
  cameraX = Math.max(
    minWorldX,
    Math.min(
      maxWorldX - WIDTH,
      player.x + player.width / 2 - CAMERA_DEAD_ZONE_LEFT,
    ),
  );
  cameraY = 0;
  gameOver = false;
  buildStage();
  testJumpRouteIndex = -1;
  updateTestJumpPathButton();
  updateTestResolutionButton();
}
