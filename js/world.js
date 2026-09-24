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
      bottom: (
        Math.max(platform.entryY, platform.exitY) +
        PLATFORM_DECK_THICKNESS +
        verticalShift
      ),
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
        : PLATFORM_DECK_THICKNESS) +
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

function platformBodySpanAt(platform, x, verticalShift = 0) {
  const top = platformSurfaceY(platform, x) + verticalShift;
  let depth = PLATFORM_DECK_THICKNESS;
  if (isInvertedTrianglePlatform(platform)) {
    const halfWidth = (platform.end - platform.start) / 2;
    const centerX = (platform.start + platform.end) / 2;
    depth = invertedTrianglePlatformDepth(platform) * Math.max(
      0,
      1 - Math.abs(x - centerX) / Math.max(1, halfWidth),
    );
  }
  return { top, bottom: top + depth };
}

function platformBodiesConflict(
  first,
  second,
  firstShift = 0,
  verticalClearance = MAIN_PATH_ROAD_CLEARANCE_Y,
) {
  const left = Math.max(first.start, second.start);
  const right = Math.min(first.end, second.end);
  // Roads joined at a single endpoint are not overlapping road bodies.
  if (right - left <= 0.01) return false;
  const firstBounds = platformVisualBounds(first, firstShift);
  const secondBounds = platformVisualBounds(second);
  if (
    firstBounds.top >= secondBounds.bottom + verticalClearance ||
    firstBounds.bottom + verticalClearance <= secondBounds.top
  ) return false;

  const knots = [left, right];
  for (const platform of [first, second]) {
    if (!isInvertedTrianglePlatform(platform)) continue;
    const centerX = (platform.start + platform.end) / 2;
    if (centerX > left && centerX < right) knots.push(centerX);
  }
  knots.sort((a, b) => a - b);

  for (let interval = 0; interval < knots.length - 1; interval += 1) {
    const startX = knots[interval];
    const endX = knots[interval + 1];
    const firstStart = platformBodySpanAt(first, startX, firstShift);
    const firstEnd = platformBodySpanAt(first, endX, firstShift);
    const secondStart = platformBodySpanAt(second, startX);
    const secondEnd = platformBodySpanAt(second, endX);
    let minimum = 0;
    let maximum = 1;
    const gaps = [
      [firstStart.bottom + verticalClearance - secondStart.top,
        firstEnd.bottom + verticalClearance - secondEnd.top],
      [secondStart.bottom + verticalClearance - firstStart.top,
        secondEnd.bottom + verticalClearance - firstEnd.top],
    ];
    for (const [startGap, endGap] of gaps) {
      const change = endGap - startGap;
      if (Math.abs(change) < 0.000001) {
        if (startGap <= 0.01) maximum = -1;
      } else {
        const crossing = (0.01 - startGap) / change;
        if (change > 0) minimum = Math.max(minimum, crossing);
        else maximum = Math.min(maximum, crossing);
      }
    }
    if (maximum > minimum + 0.000001) return true;
  }
  return false;
}

function shiftPlatformVertically(platform, shift) {
  platform.y += shift;
  platform.level += shift / LEVEL_GAP;
  if (platform.kind === "ramp") {
    platform.entryY += shift;
    platform.exitY += shift;
  }
}

function resolveMainPathClearance() {
  const groups = new Map();
  for (const platform of platforms) {
    if (!groups.has(platform.group)) groups.set(platform.group, []);
    groups.get(platform.group).push(platform);
  }

  const acceptedRoads = [];
  const groupShifts = new Map();
  let previousShift = 0;
  let previousExitY = null;
  for (const [group, groupPlatforms] of groups) {
    const roads = groupPlatforms.filter((platform) => platform.routeRole !== "sub");
    if (roads.length === 0) continue;
    for (let first = 0; first < roads.length; first += 1) {
      for (let second = first + 1; second < roads.length; second += 1) {
        if (platformBodiesConflict(roads[first], roads[second], 0, 0)) return false;
      }
    }
    const firstRoad = roads[0];
    const entryY = platformSurfaceY(firstRoad, firstRoad.entryX);
    const minimumShift = previousExitY === null ? 0 : (
      previousExitY - entryY - MAIN_PATH_MAX_CONNECTION_HEIGHT
    );
    const maximumShift = previousExitY === null ? 0 : (
      previousExitY - entryY + MAIN_PATH_MAX_CONNECTION_HEIGHT
    );
    const preferredShift = Math.max(minimumShift, Math.min(maximumShift, previousShift));
    const shifts = [preferredShift, minimumShift, maximumShift];
    for (let step = 24; step <= MAIN_PATH_MAX_CONNECTION_HEIGHT * 2; step += 24) {
      for (const shift of [preferredShift - step, preferredShift + step]) {
        if (shift >= minimumShift && shift <= maximumShift) shifts.push(shift);
      }
    }
    shifts.sort((a, b) => Math.abs(a - preferredShift) - Math.abs(b - preferredShift));
    const selectedShift = shifts.find((shift) => roads.every((road) => (
      acceptedRoads.every((other) => !platformBodiesConflict(road, other, shift))
    )));
    if (selectedShift === undefined) return false;

    for (const platform of groupPlatforms) {
      shiftPlatformVertically(platform, selectedShift);
      platform.roadClearanceShift = selectedShift;
    }
    acceptedRoads.push(...roads);
    groupShifts.set(group, selectedShift);
    previousShift = selectedShift;
    const lastRoad = roads[roads.length - 1];
    previousExitY = platformSurfaceY(lastRoad, lastRoad.exitX);
  }

  for (const branch of branches) {
    const shift = groupShifts.get(branch.group) ?? 0;
    for (const route of branch.routes) {
      if (typeof route.level === "number") route.level += shift / LEVEL_GAP;
      if (typeof route.endLevel === "number") route.endLevel += shift / LEVEL_GAP;
    }
    const nextShift = groupShifts.get(branch.group + 1) ?? shift;
    const connectionAdjustment = (nextShift - shift) / LEVEL_GAP;
    branch.exitLevelOffset = (branch.exitLevelOffset ?? 0) + connectionAdjustment;
    if (branch.flowTransition) {
      const transition = branch.flowTransition;
      transition.levelOffset += connectionAdjustment;
      transition.verticalTrend = -Math.sign(transition.levelOffset);
      transition.vertical = transition.verticalTrend > 0
        ? "up" : transition.verticalTrend < 0 ? "down" : "level";
    }
  }
  return true;
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

function roadElevationChange(
  length,
  currentLevel,
  chance = 0.82,
  maximumSteps = 3,
  preferredTrend = 0,
) {
  const magnitude = roadRiseCount(length, chance, maximumSteps);
  if (magnitude <= 0) return 0;

  let trend = preferredTrend !== 0 && mapRandom() < 0.5
    ? preferredTrend
    : (mapRandom() < 0.5 ? 1 : -1);
  if (currentLevel - magnitude < -MAP_FLOW_VERTICAL_SOFT_LIMIT) trend = -1;
  if (currentLevel + magnitude > MAP_FLOW_VERTICAL_SOFT_LIMIT) trend = 1;
  return trend * magnitude;
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
    const flatRun = addBrokenFlatRun(
      entryX,
      exitX,
      startLevel,
      type,
      group,
      minimumFirstTread,
      80,
    );
    const endPlatform = flatRun.platforms[flatRun.platforms.length - 1];
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
    const flatRun = addBrokenFlatRun(
      entryX,
      exitX,
      startLevel,
      type,
      group,
      minimumFirstTread,
      80,
    );
    const endPlatform = flatRun.platforms[flatRun.platforms.length - 1];
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
    const flatRun = addBrokenFlatRun(
      pathX,
      flatExitX,
      startLevel - rise,
      segmentType,
      group,
      rise === 0 ? minimumFirstTread : 0,
      65,
    );
    endPlatform = flatRun.platforms[flatRun.platforms.length - 1];
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

function mirrorGeneratedElevationPath(
  startLevel,
  startPlatformIndex,
  path,
  pattern,
) {
  const pivotY = BASE_GROUND_Y + startLevel * LEVEL_GAP;
  for (const platform of platforms.slice(startPlatformIndex)) {
    platform.level = startLevel + (startLevel - platform.level);
    platform.elevationPattern = pattern;
    platform.type = platform.type
      .replace("jump-rise", "jump-drop")
      .replace(/-rise$/, "-drop");

    if (platform.kind === "ramp") {
      platform.entryY = pivotY * 2 - platform.entryY;
      platform.exitY = pivotY * 2 - platform.exitY;
      platform.y = Math.min(platform.entryY, platform.exitY);
    } else {
      platform.y = pivotY * 2 - platform.y;
    }

    if (platform.jumpRiseStep !== undefined) {
      platform.jumpDropStep = platform.jumpRiseStep;
      delete platform.jumpRiseStep;
    }
  }

  return {
    ...path,
    endLevel: startLevel + (startLevel - path.endLevel),
    pattern,
  };
}

function addJumpDropPath(
  entryX,
  exitX,
  startLevel,
  dropCount,
  type,
  group,
  minimumFirstTread = 0,
) {
  const startPlatformIndex = platforms.length;
  const risingPath = addJumpRisePath(
    entryX,
    exitX,
    startLevel,
    dropCount,
    type,
    group,
    minimumFirstTread,
  );
  if (!risingPath) return null;
  return mirrorGeneratedElevationPath(
    startLevel,
    startPlatformIndex,
    risingPath,
    "jump-drop",
  );
}

function addDescendingPath(
  entryX,
  exitX,
  startLevel,
  dropCount,
  type,
  group,
  minimumFirstTread = 0,
) {
  const startPlatformIndex = platforms.length;
  const risingPath = addRisingPath(
    entryX,
    exitX,
    startLevel,
    dropCount,
    type,
    group,
    minimumFirstTread,
  );
  return mirrorGeneratedElevationPath(
    startLevel,
    startPlatformIndex,
    risingPath,
    "descending",
  );
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
  if (riseCount < 0) {
    const dropCount = Math.abs(riseCount);
    if (group > 0 && mapRandom() < JUMP_DROP_PATH_CHANCE) {
      const jumpDropPath = addJumpDropPath(
        entryX,
        exitX,
        startLevel,
        dropCount,
        type,
        group,
        minimumFirstTread,
      );
      if (jumpDropPath) return jumpDropPath;
    }
    return addDescendingPath(
      entryX,
      exitX,
      startLevel,
      dropCount,
      type,
      group,
      minimumFirstTread,
    );
  }

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

function flowDistanceFor() {
  return (
    MAP_FLOW_DISTANCE_MIN +
    mapRandom() * (MAP_FLOW_DISTANCE_MAX - MAP_FLOW_DISTANCE_MIN)
  );
}

function chooseMapFlowTransition(
  direction,
  currentLevel,
  previousVerticalTrend,
  verticalStreak,
) {
  const reversesDirection = mapRandom() < MAP_FLOW_REVERSE_CHANCE;
  const continuesVerticalFlow = (
    previousVerticalTrend !== 0 &&
    verticalStreak < MAP_FLOW_VERTICAL_STREAK_MAX &&
    mapRandom() < MAP_FLOW_VERTICAL_STREAK_CHANCE
  );
  let verticalTrend;

  if (continuesVerticalFlow) {
    verticalTrend = previousVerticalTrend;
  } else {
    const verticalRoll = mapRandom();
    verticalTrend = verticalRoll < 0.34
      ? 1
      : verticalRoll < 0.68
        ? -1
        : 0;
  }

  if (reversesDirection && verticalTrend === 0) {
    verticalTrend = mapRandom() < 0.5 ? 1 : -1;
  }
  if (
    currentLevel <= -MAP_FLOW_VERTICAL_SOFT_LIMIT &&
    verticalTrend > 0
  ) verticalTrend = -1;
  if (
    currentLevel >= MAP_FLOW_VERTICAL_SOFT_LIMIT &&
    verticalTrend < 0
  ) verticalTrend = 1;

  const transitionLevels = verticalTrend === 0
    ? 0
    : (
      MAP_FLOW_TRANSITION_LEVEL_MIN +
      mapRandom() * (
        MAP_FLOW_TRANSITION_LEVEL_MAX - MAP_FLOW_TRANSITION_LEVEL_MIN
      )
    );
  const levelOffset = -verticalTrend * transitionLevels;
  const gap = (
    MAP_FLOW_TRANSITION_GAP_MIN +
    mapRandom() * (MAP_FLOW_TRANSITION_GAP_MAX - MAP_FLOW_TRANSITION_GAP_MIN)
  );

  return {
    direction: reversesDirection ? -direction : direction,
    horizontal: reversesDirection ? "reverse" : "forward",
    vertical: verticalTrend > 0 ? "up" : verticalTrend < 0 ? "down" : "level",
    verticalTrend,
    levelOffset,
    gap,
  };
}

function farthestBossGatePlacement(originX, originY) {
  let farthestPlacement = null;

  for (const platform of platforms) {
    const platformLength = platform.end - platform.start;
    if (
      platform.kind !== "flat" ||
      platform.routeRole === "sub" ||
      platform.trick === "horizontal-jump" ||
      platformLength < BOSS_GATE_WIDTH + 28
    ) continue;

    const edgeInset = Math.max(
      BOSS_GATE_WIDTH / 2,
      Math.min(BOSS_GATE_EDGE_INSET, platformLength / 2),
    );
    const candidateXs = [
      platform.start + edgeInset,
      platform.end - edgeInset,
    ];

    for (const centerX of candidateXs) {
      const surfaceY = platformSurfaceY(platform, centerX);
      const distanceSquared = (
        (centerX - originX) ** 2 +
        (surfaceY - originY) ** 2
      );
      if (
        farthestPlacement &&
        farthestPlacement.distanceSquared >= distanceSquared
      ) continue;

      farthestPlacement = {
        centerX,
        direction: centerX < (platform.start + platform.end) / 2 ? -1 : 1,
        distanceSquared,
        platform,
      };
    }
  }

  return farthestPlacement;
}

function addBrokenFlatRun(
  entryX,
  exitX,
  level,
  type,
  group,
  protectedStartLength = 0,
  protectedEndLength = 0,
) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const possibleGapCounts = [];

  for (let gapCount = 1; gapCount <= ROAD_BREAK_MAX_GAPS; gapCount += 1) {
    const sectionCount = gapCount + 1;
    const minimumFlatLength = (
      Math.max(ROAD_BREAK_MIN_SECTION_LENGTH, protectedStartLength) +
      Math.max(ROAD_BREAK_MIN_SECTION_LENGTH, protectedEndLength) +
      Math.max(0, sectionCount - 2) * ROAD_BREAK_MIN_SECTION_LENGTH
    );
    const minimumLength = minimumFlatLength + gapCount * ROAD_BREAK_MIN_GAP;
    if (minimumLength <= length) possibleGapCounts.push(gapCount);
  }

  if (possibleGapCounts.length === 0 || mapRandom() >= ROAD_BREAK_CHANCE) {
    return {
      platforms: [addPlatform(entryX, exitX, level, type, group)],
      gapLengths: [],
    };
  }

  const maximumGapCount = possibleGapCounts[possibleGapCounts.length - 1];
  const gapCount = Math.max(
    1,
    maximumGapCount - (mapRandom() < 0.7 ? 0 : 1),
  );
  const sectionMinimums = Array.from(
    { length: gapCount + 1 },
    (_, section) => {
      if (section === 0) {
        return Math.max(ROAD_BREAK_MIN_SECTION_LENGTH, protectedStartLength);
      }
      if (section === gapCount) {
        return Math.max(ROAD_BREAK_MIN_SECTION_LENGTH, protectedEndLength);
      }
      return ROAD_BREAK_MIN_SECTION_LENGTH;
    },
  );
  const baseGapTotal = gapCount * ROAD_BREAK_MIN_GAP;
  const baseFlatTotal = sectionMinimums.reduce((total, value) => total + value, 0);
  const extraBudget = Math.max(0, length - baseGapTotal - baseFlatTotal);
  const desiredGapExtras = Array.from(
    { length: gapCount },
    () => mapRandom() * (MAIN_PATH_MAX_GAP - ROAD_BREAK_MIN_GAP),
  );
  const desiredGapExtraTotal = desiredGapExtras.reduce((total, value) => total + value, 0);
  const gapExtraScale = desiredGapExtraTotal > 0
    ? Math.min(1, extraBudget * 0.34 / desiredGapExtraTotal)
    : 0;
  const gapLengths = desiredGapExtras.map(
    (extra) => ROAD_BREAK_MIN_GAP + extra * gapExtraScale,
  );
  const remainingFlatExtra = (
    length -
    gapLengths.reduce((total, value) => total + value, 0) -
    baseFlatTotal
  );
  const sectionWeights = sectionMinimums.map(() => 0.7 + mapRandom() * 0.8);
  const totalWeight = sectionWeights.reduce((total, value) => total + value, 0);
  const sectionLengths = sectionMinimums.map((minimum, section) => (
    minimum + remainingFlatExtra * sectionWeights[section] / totalWeight
  ));

  const routePlatforms = [];
  let pathX = entryX;
  for (let section = 0; section < sectionLengths.length; section += 1) {
    const sectionExitX = pathX + direction * sectionLengths[section];
    const platform = addPlatform(pathX, sectionExitX, level, type, group);
    platform.roadBreakSection = section;
    platform.roadBreakGapAfter = gapLengths[section] ?? 0;
    routePlatforms.push(platform);
    pathX = sectionExitX;
    if (section < gapLengths.length) pathX += direction * gapLengths[section];
  }

  return { platforms: routePlatforms, gapLengths };
}

function addSegmentedMainPath(entryX, exitX, level, type, group) {
  const direction = exitX >= entryX ? 1 : -1;
  const length = Math.abs(exitX - entryX);
  const possibleGaps = Math.min(ROAD_BREAK_MAX_GAPS, Math.floor((length - 220) / 260));
  const gapCount = possibleGaps > 0 && mapRandom() < ROAD_BREAK_CHANCE
    ? 1 + Math.floor(mapRandom() * possibleGaps)
    : 0;
  const gapLengths = Array.from({ length: gapCount }, () => (
    ROAD_BREAK_MIN_GAP + mapRandom() * (MAIN_PATH_MAX_GAP - ROAD_BREAK_MIN_GAP)
  ));
  const flatBudget = length - gapLengths.reduce((total, gap) => total + gap, 0);
  const sectionCount = gapCount + 1;
  const minimumSectionLength = ROAD_BREAK_MIN_SECTION_LENGTH;
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

// Shared cable centerline: rendering and contact damage use the same moving shape.
function electricWirePoints(platform, feature, time = gameTime) {
  const direction = feature.seed % 2 === 0 ? 1 : -1;
  const length = feature.width * 0.95;
  const angle = direction * (
    0.32 + Math.sin(time * 1.8 + feature.phase) * 0.25 +
    Math.sin(time * 2.65 + feature.phase * 0.6) * 0.045
  );
  const anchorX = feature.centerX - direction * feature.width * 0.42;
  const anchorY = platformSurfaceY(platform, anchorX) + PLATFORM_DECK_THICKNESS - 3;
  const endX = anchorX + Math.sin(angle) * length;
  const endY = anchorY + Math.cos(angle) * length;
  const control1X = anchorX + direction * length * 0.15;
  const control1Y = anchorY + length * 0.28;
  const control2X = endX - Math.sin(angle) * length * 0.22;
  const control2Y = endY - length * 0.2;
  const points = [];
  for (let step = 0; step <= ELECTRIC_WIRE_SEGMENTS; step += 1) {
    const t = step / ELECTRIC_WIRE_SEGMENTS;
    const u = 1 - t;
    const ripple = Math.sin(t * Math.PI) * Math.sin(time * 3 - feature.phase + t * 4) * 2.5 * t;
    points.push({
      x: u ** 3 * anchorX + 3 * u * u * t * control1X +
        3 * u * t * t * control2X + t ** 3 * endX + ripple,
      y: u ** 3 * anchorY + 3 * u * u * t * control1Y +
        3 * u * t * t * control2Y + t ** 3 * endY,
    });
  }
  return points;
}

function electricWireHitsRect(points, rect) {
  const limits = [
    [rect.x - ELECTRIC_WIRE_RADIUS, rect.x + rect.width + ELECTRIC_WIRE_RADIUS],
    [rect.y - ELECTRIC_WIRE_RADIUS, rect.y + rect.height + ELECTRIC_WIRE_RADIUS],
  ];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    let enter = 0;
    let exit = 1;
    for (const [axis, key] of ["x", "y"].entries()) {
      const delta = end[key] - start[key];
      const [minimum, maximum] = limits[axis];
      if (Math.abs(delta) < 0.000001) {
        if (start[key] < minimum || start[key] > maximum) exit = -1;
      } else {
        const first = (minimum - start[key]) / delta;
        const second = (maximum - start[key]) / delta;
        enter = Math.max(enter, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
      }
      if (enter > exit) break;
    }
    if (enter <= exit) return true;
  }
  return false;
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

    if (platform.elevationPattern === "jump-drop") {
      platform.zone = "jump-drop";
      platform.architecture = "open";
      platform.lightColor = "#ff9f73";
      platform.lightSpacing = 74;
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
  for (let attempt = 0; attempt < MAP_LAYOUT_MAX_ATTEMPTS; attempt += 1) {
    if (generateMapCandidate()) return;
  }
  // A bounded, monotonic fallback always has room for the primary route.
  if (!generateMapCandidate(true)) throw new Error("Unable to generate a clear main route");
}

function generateMapCandidate(safeForwardFlow = false) {
  platforms.length = 0;
  branches.length = 0;
  midBosses.length = 0;
  bossDoor = null;
  nextPlatformId = 1;
  mapSeed = Math.floor(Math.random() * 4294967295) >>> 0;
  mapRandom = createSeededRandom(mapSeed);

  let cursor = -200;
  let direction = 1;
  let currentLevel = 0;
  let group = 0;
  let traveledDistance = 0;
  let distanceSinceFlowChange = 0;
  let distanceSinceDip = 0;
  let nextFlowDistance = flowDistanceFor();
  let verticalFlowTrend = 0;
  let verticalFlowStreak = 0;
  let lastHorizontalJumpGroup = -4;

  const addTrackedElevationPath = (
    entryX,
    exitX,
    startLevel,
    elevationChange,
    type,
    pathGroup,
    minimumFirstTread = 0,
  ) => {
    const pathLength = Math.abs(exitX - entryX);
    const forceDip = (
      pathGroup > 0 &&
      elevationChange >= 0 &&
      distanceSinceDip + pathLength >= DIP_PATH_FORCE_DISTANCE
    );
    const path = addVariedElevationPath(
      entryX,
      exitX,
      startLevel,
      elevationChange,
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
    let approachPath;
    if (group === 0) {
      const startingRoad = addPlatform(
        cursor,
        splitEnd,
        currentLevel,
        "main",
        group,
      );
      startingRoad.startingRoad = true;
      approachPath = {
        endLevel: currentLevel,
        endPlatform: startingRoad,
        pattern: "starting-road",
      };
      distanceSinceDip += approachLength;
    } else {
      approachPath = addTrackedElevationPath(
        cursor,
        splitEnd,
        currentLevel,
        roadElevationChange(
          approachLength,
          currentLevel,
          0.76,
          2,
          verticalFlowTrend,
        ),
        "main",
        group,
      );
    }
    currentLevel = approachPath.endLevel;
    traveledDistance += approachLength;
    distanceSinceFlowChange += approachLength;

    const entryGaps = [0, 24, 40, 58, 76, 94, 112];
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
      const mainElevationChange = branchLength >= 700
        ? roadElevationChange(
          branchLength,
          currentLevel,
          0.82,
          2,
          verticalFlowTrend,
        )
        : 0;
      let mainPlatforms;
      if (mainElevationChange !== 0) {
        const mainPath = addTrackedElevationPath(
          branchStart,
          branchEnd,
          currentLevel,
          mainElevationChange,
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

      const subRunsBackward = mainElevationChange !== 0 || mapRandom() < 0.58;
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
      const branchElevationChange = roadElevationChange(
        branchLength,
        currentLevel,
        0.88,
        3,
        verticalFlowTrend,
      );
      const branchPath = addTrackedElevationPath(
        branchStart,
        branchEnd,
        currentLevel,
        branchElevationChange,
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
    distanceSinceFlowChange += entryGap + branchLength;

    const shouldChangeFlow = (
      distanceSinceFlowChange >= nextFlowDistance &&
      traveledDistance < WORLD_LENGTH - 1400
    );
    if (shouldChangeFlow) {
      const transition = chooseMapFlowTransition(
        direction,
        branchExitLevel,
        verticalFlowTrend,
        verticalFlowStreak,
      );
      if (safeForwardFlow && transition.horizontal === "reverse") {
        transition.direction = direction;
        transition.horizontal = "forward";
      }
      if (
        transition.horizontal === "reverse" &&
        MID_BOSS_ENABLED
      ) addMidBoss(branchEnd, branchExitLevel, direction, group);

      currentLevel = branchExitLevel + transition.levelOffset;
      cursor = branchEnd + direction * transition.gap;
      branches[branches.length - 1].exitGap = transition.gap;
      branches[branches.length - 1].exitLevelOffset = transition.levelOffset;
      branches[branches.length - 1].flowTransition = transition;
      branches[branches.length - 1].nextRouteStartX = cursor;
      traveledDistance += transition.gap;
      direction = transition.direction;

      if (transition.verticalTrend === verticalFlowTrend) {
        verticalFlowStreak += transition.verticalTrend === 0 ? 0 : 1;
      } else {
        verticalFlowTrend = transition.verticalTrend;
        verticalFlowStreak = transition.verticalTrend === 0 ? 0 : 1;
      }
      distanceSinceFlowChange = 0;
      distanceSinceDip = 0;
      nextFlowDistance = flowDistanceFor();
    } else {
      const exitGaps = [0, 24, 42, 62, 82, 102, 122];
      const exitGap = exitGaps[Math.floor(mapRandom() * exitGaps.length)];
      const exitLevelOffset = exitGap > 0 ? roadGapLevelOffset() : 0;
      currentLevel = branchExitLevel + exitLevelOffset;
      cursor = branchEnd + direction * exitGap;
      branches[branches.length - 1].exitGap = exitGap;
      branches[branches.length - 1].exitLevelOffset = exitLevelOffset;
      traveledDistance += exitGap;
      distanceSinceFlowChange += exitGap;
    }
    group += 1;
  }

  const remainingDistance = Math.max(300, WORLD_LENGTH - traveledDistance);
  const goalEndpointX = cursor + direction * remainingDistance;
  const goalElevationChange = roadElevationChange(
    remainingDistance,
    currentLevel,
    1,
    3,
    verticalFlowTrend,
  );
  const goalPath = addTrackedElevationPath(
    cursor,
    goalEndpointX,
    currentLevel,
    goalElevationChange,
    "main",
    group,
  );
  if (!resolveMainPathClearance()) return false;
  resolveFloatingPathClearance();
  const startingRoad = platforms.find((platform) => platform.startingRoad) ?? platforms[0];
  const playerStartX = 110 + player.width / 2;
  const playerStartY = platformSurfaceY(startingRoad, playerStartX);
  const farthestGate = farthestBossGatePlacement(playerStartX, playerStartY);
  goalPlatform = farthestGate?.platform ?? goalPath.endPlatform;
  goalX = farthestGate?.centerX ?? (
    goalPlatform.start + goalPlatform.end
  ) / 2;
  bossDoor = {
    centerX: goalX,
    width: BOSS_GATE_WIDTH,
    height: BOSS_GATE_HEIGHT,
    direction: farthestGate?.direction ?? goalPlatform.direction,
    platform: goalPlatform,
  };
  finalizePlatformVariety();
  minWorldX = Math.min(...platforms.map((platform) => platform.start)) - 120;
  maxWorldX = Math.max(...platforms.map((platform) => platform.end)) + 120;
  lowestPlatformY = Math.max(...platforms.map(platformLowestSurfaceY));
  return true;
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

function enemyRectOverlapsEnemy(
  x,
  y,
  width,
  height,
  ignoredEnemy = null,
  separation = ENEMY_BODY_SEPARATION,
) {
  const hitbox = ignoredEnemy
    ? getEnemyHitbox(ignoredEnemy, x, y) : { x, y, width, height };
  return enemies.some((enemy) => {
    if (
      enemy === ignoredEnemy || !enemy.alive ||
      x >= enemy.x + enemy.width + separation || x + width + separation <= enemy.x
    ) return false;
    const otherHitbox = getEnemyHitbox(enemy);
    return hitbox.y < otherHitbox.y + otherHitbox.height + separation &&
      hitbox.y + hitbox.height + separation > otherHitbox.y;
  });
}

function addEnemy(platform, x, kind = "monster1") {
  const definition = MONSTER_TYPES[kind] ?? MONSTER_TYPES.monster1;
  const y = (
    platformSurfaceY(platform, x + definition.width / 2) - definition.height -
    (definition.hoverHeight ?? 0)
  );
  const enemy = {
    x,
    y,
    width: definition.width,
    height: definition.height,
    spriteWidth: definition.spriteWidth,
    spriteHeight: definition.spriteHeight,
    spriteBottomOffset: definition.spriteBottomOffset,
    spriteTopInset: definition.spriteTopInset,
    spriteFacing: definition.spriteFacing ?? 1,
    kind,
    platform,
    hp: definition.hp,
    maxHp: definition.hp,
    speed: definition.speed,
    chaseRange: definition.chaseRange,
    chaseVerticalRange: definition.chaseVerticalRange,
    climbSearchRange: definition.climbSearchRange,
    climbVerticalRange: definition.climbVerticalRange,
    climbMinimumHeight: definition.climbMinimumHeight,
    jumpAttackRange: definition.jumpAttackRange,
    jumpAttackVerticalRange: definition.jumpAttackVerticalRange,
    jumpLandingVerticalRange: definition.jumpLandingVerticalRange,
    dropAttackRange: definition.dropAttackRange,
    dropAttackMinHeight: definition.dropAttackMinHeight,
    dropAttackMaxHeight: definition.dropAttackMaxHeight,
    dropAttackHorizontalDistance: definition.dropAttackHorizontalDistance,
    dropAttackLaunchSpeed: definition.dropAttackLaunchSpeed,
    dropLandingClearance: definition.dropLandingClearance,
    walkableStepHeight: definition.walkableStepHeight,
    jumpGapRange: definition.jumpGapRange,
    jumpGapMaxRise: definition.jumpGapMaxRise,
    jumpGapMaxDrop: definition.jumpGapMaxDrop,
    jumpGapMinHorizontalSpeed: definition.jumpGapMinHorizontalSpeed,
    climbJumpLaunchSpeed: definition.climbJumpLaunchSpeed,
    jumpLaunchSpeed: definition.jumpLaunchSpeed,
    jumpGravity: definition.jumpGravity,
    jumpMinHorizontalSpeed: definition.jumpMinHorizontalSpeed,
    jumpMaxHorizontalSpeed: definition.jumpMaxHorizontalSpeed,
    jumpWindupDuration: definition.jumpWindupDuration,
    jumpRecoveryDuration: definition.jumpRecoveryDuration,
    jumpCooldownDuration: definition.jumpCooldown,
    jumpCooldown: 0.05 + mapRandom() * 0.2,
    jumpVx: 0,
    jumpVy: 0,
    jumpHit: false,
    jumpMode: "attack",
    jumpOriginSurfaceY: null,
    jumpTargetSurfaceY: null,
    dropEdgeDirection: 0,
    state: "chase",
    stateTimer: 0,
    animationTime: mapRandom() * Math.PI * 2,
    animationPhase: mapRandom() * Math.PI * 2,
    hoverBaseY: y,
    hoverAnchorX: x,
    hoverAmplitude: definition.hoverAmplitude,
    hoverSpeed: definition.hoverSpeed,
    patrolRadius: definition.patrolRadius,
    chargeDuration: definition.chargeDuration,
    laserSpeed: definition.laserSpeed,
    laserRadius: definition.laserRadius,
    laserRicochets: definition.laserRicochets,
    attackCooldownMin: definition.attackCooldownMin,
    attackCooldownMax: definition.attackCooldownMax,
    moving: false,
    attackCooldown: definition.attackCooldown,
    attackTimer: kind === "monster3"
      ? 0.8 + mapRandom() * 2.2 : 0,
    ambientFireDelayMin: definition.ambientFireDelayMin,
    ambientFireDelayMax: definition.ambientFireDelayMax,
    ambientFireTimer: kind === "monster2"
      ? definition.ambientFireDelayMin + mapRandom() * (definition.ambientFireDelayMax - definition.ambientFireDelayMin)
      : 0,
    attackRange: definition.attackRange,
    attackVerticalRange: definition.attackVerticalRange,
    inhaleDuration: definition.inhaleDuration,
    fireballCount: definition.fireballCount,
    fireballInterval: definition.fireballInterval,
    fireballRecovery: definition.fireballRecovery,
    fireballSpeed: definition.fireballSpeed,
    fireballRadius: definition.fireballRadius,
    fireballRange: definition.fireballRange,
    fireballRiseAcceleration: definition.fireballRiseAcceleration,
    mouthForwardOffset: definition.mouthForwardOffset,
    mouthHeight: definition.mouthHeight,
    fireballsFired: 0,
    fireballTimer: 0,
    fireRecoilTimer: 0,
    attackDirection: -1,
    hitDuration: definition.hitDuration,
    hitTimer: 0,
    hitDirection: 0,
    hitKnockbackSpeed: definition.hitKnockbackSpeed,
    hitKnockbackMaxSpeed: definition.hitKnockbackMaxSpeed,
    hitKnockbackDamping: definition.hitKnockbackDamping,
    hitKnockbackVelocity: 0,
    revivalKnockback: false,
    hitAirImpulse: definition.hitAirImpulse,
    score: definition.score,
    alive: true,
    facing: -1,
  };
  if (enemyRectOverlapsEnemy(x, y, enemy.width, enemy.height, enemy)) return null;
  enemies.push(enemy);
  return enemy;
}

function addTurret(platform, x) {
  const surfaceY = platformSurfaceY(platform, x + TURRET.width / 2);
  turrets.push({
    x,
    y: surfaceY - TURRET.height,
    width: TURRET.width,
    height: TURRET.height,
    platform,
    hp: TURRET.hp,
    maxHp: TURRET.hp,
    facing: -platform.direction,
    fireTimer: TURRET.fireInterval * (0.55 + mapRandom() * 0.45),
    burstShotsRemaining: 0,
    chargeParticleTimer: 0,
    recoilTimer: 0,
    hitTimer: 0,
    animationPhase: mapRandom() * Math.PI * 2,
    active: false,
    alive: true,
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

function stageSpawnIsInStartSafeZone(platform, x, definition) {
  const centerX = x + definition.width / 2;
  const centerY = (
    platformSurfaceY(platform, centerX) -
    (definition.hoverHeight ?? 0) -
    definition.height / 2
  );
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  return (
    Math.abs(centerX - playerCenterX) < PLAYER_START_SAFE_HORIZONTAL_RADIUS &&
    Math.abs(centerY - playerCenterY) < PLAYER_START_SAFE_VERTICAL_RADIUS
  );
}

function tryAddMonster3(
  platform,
  startX,
  endX,
  attempts = 6,
  avoidStartSafeZone = false,
) {
  const flyer = MONSTER_TYPES.monster3;
  if (endX - startX < flyer.width) return null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const x = startX + mapRandom() * (endX - startX - flyer.width);
    if (avoidStartSafeZone && stageSpawnIsInStartSafeZone(platform, x, flyer)) continue;
    const y = platformSurfaceY(platform, x + flyer.width / 2) -
      flyer.height - flyer.hoverHeight;
    const spriteTop = y + flyer.height - flyer.spriteHeight;
    const obstructed = platforms.some((other) => {
      if (other === platform || other.end <= x || other.start >= x + flyer.width) return false;
      const bounds = platformVisualBounds(other);
      return bounds.top < y + flyer.height + 20 && bounds.bottom > spriteTop - 12;
    });
    if (!obstructed) {
      const enemy = addEnemy(platform, x, "monster3");
      if (enemy) return enemy;
    }
  }
  return null;
}

function tryAddHeartItem(platform, startX, endX, avoidEnemies = true) {
  if (endX - startX < 52) return false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x = startX + 26 + mapRandom() * (endX - startX - 52);
    const occupied = turrets.some((turret) =>
      turret.platform === platform && Math.abs(x - turret.x - turret.width / 2) < 95
    ) || enemies.some((enemy) =>
      avoidEnemies && enemy.platform === platform && enemy.kind !== "monster3" &&
      Math.abs(x - enemy.x - enemy.width / 2) < 70
    ) || heartItems.some((heart) =>
      heart.platform === platform && Math.abs(x - heart.x) < 150
    ) || (
      bossDoor?.platform === platform && Math.abs(x - bossDoor.centerX) < 110
    );
    if (occupied) continue;
    heartItems.push({
      x,
      y: platformSurfaceY(platform, x) - 54,
      radius: HEART_ITEM_RADIUS,
      phase: mapRandom() * Math.PI * 2,
      platform,
    });
    return true;
  }
  return false;
}

function buildStage() {
  let eligibleHeartPlatforms = 0;
  for (const platform of platforms) {
    if (platform.kind !== "flat") continue;
    if (platform.trick === "horizontal-jump") continue;
    const platformLength = platform.end - platform.start;
    if (platformLength < ENEMY_SPAWN_MIN_PLATFORM_LENGTH) continue;
    const edgeMargin = Math.min(
      ENEMY_SPAWN_EDGE_MARGIN,
      Math.max(16, platformLength * 0.12),
    );
    const visibleStart = platform.group === 0
      ? Math.max(460, platform.start + edgeMargin)
      : platform.start + edgeMargin;
    const visibleEnd = platform.end - edgeMargin;
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
    if (platform.routeRole === "main") enemyChance = Math.max(0.9, enemyChance);
    enemyChance *= ENEMY_SPAWN_DENSITY;

    let turretX = null;
    if (
      !platform.startingRoad &&
      platformLength >= TURRET.spawnMinPlatformLength &&
      mapRandom() < TURRET.spawnChance
    ) {
      const turretStart = Math.max(
        visibleStart,
        platform.start + TURRET.spawnEdgeMargin,
      );
      const turretEnd = Math.min(
        visibleEnd - TURRET.width,
        platform.end - TURRET.spawnEdgeMargin - TURRET.width,
      );

      for (let attempt = 0; attempt < 8 && turretEnd > turretStart; attempt += 1) {
        const candidateX = turretStart + mapRandom() * (turretEnd - turretStart);
        const centerX = candidateX + TURRET.width / 2;
        const surfaceY = platformSurfaceY(platform, centerX);
        const tooCloseToTurret = turrets.some((turret) => (
          Math.abs(centerX - (turret.x + turret.width / 2)) < TURRET.minimumSeparation &&
          Math.abs(surfaceY - (turret.y + turret.height)) < LEVEL_GAP * 0.8
        ));
        if (
          !tooCloseToTurret &&
          !stageSpawnIsInStartSafeZone(platform, candidateX, TURRET)
        ) {
          turretX = candidateX;
          break;
        }
      }
    }

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
      const slotStart = visibleStart + slotLength * slot;
      const slotEnd = Math.min(visibleEnd, slotStart + slotLength);
      const monster2 = MONSTER_TYPES.monster2;
      const canSpawnMonster2 = (
        platform.routeRole === "main" &&
        !platform.startingRoad &&
        platformLength >= monster2.spawnMinPlatformLength &&
        slotEnd - slotStart >= monster2.width + 28 &&
        mapRandom() < monster2.spawnChance
      );
      if (canSpawnMonster2) {
        const monster2X = (
          slotStart +
          mapRandom() * Math.max(0, slotEnd - slotStart - monster2.width)
        );
        const overlapsTurret = (
          turretX !== null &&
          monster2X < turretX + TURRET.width + 34 &&
          monster2X + monster2.width + 34 > turretX
        );
        if (
          !overlapsTurret &&
          !stageSpawnIsInStartSafeZone(platform, monster2X, monster2) &&
          addEnemy(platform, monster2X, "monster2")
        ) continue;
      }
      const groundMeleeWidth = Math.max(
        MONSTER_TYPES.monster1.width,
        MONSTER_TYPES.monster4.width,
      );
      const groundMeleeMinSpacing = Math.max(
        ENEMY_GROUP_MIN_SPACING,
        groundMeleeWidth + ENEMY_BODY_SEPARATION,
      );
      const availableWidth = Math.max(
        0,
        slotEnd - slotStart - groundMeleeWidth,
      );
      const fittingGroupSize = Math.max(
        ENEMY_GROUP_MIN_SIZE,
        Math.min(
          ENEMY_GROUP_MAX_SIZE,
          Math.floor(availableWidth / groundMeleeMinSpacing) + 1,
        ),
      );
      const requestedGroupSize = ENEMY_GROUP_MIN_SIZE + Math.floor(
        mapRandom() * (fittingGroupSize - ENEMY_GROUP_MIN_SIZE + 1),
      );
      const baseGroupSize = Math.max(
        1,
        Math.round(requestedGroupSize * MONSTER1_SPAWN_COUNT_RATIO),
      );
      const groupSize = Math.min(
        fittingGroupSize,
        baseGroupSize + (mapRandom() < ENEMY_GROUP_EXTRA_MEMBER_CHANCE ? 1 : 0),
      );
      const desiredSpacing = groundMeleeMinSpacing + mapRandom() * (
        ENEMY_GROUP_MAX_SPACING - groundMeleeMinSpacing
      );
      const groupSpacing = groupSize > 1
        ? Math.min(desiredSpacing, availableWidth / (groupSize - 1))
        : 0;
      const groupWidth = groupSpacing * (groupSize - 1);
      const groupStart = slotStart + mapRandom() * Math.max(0, availableWidth - groupWidth);
      const groupEnd = groupStart + groupWidth + groundMeleeWidth;
      if (
        turretX !== null &&
        groupStart < turretX + TURRET.width + 28 &&
        groupEnd + 28 > turretX
      ) continue;

      for (let member = 0; member < groupSize; member += 1) {
        const monsterX = groupStart + groupSpacing * member;
        const monsterKind = mapRandom() < MONSTER4_GROUP_SLOT_CHANCE
          ? "monster4" : "monster1";
        const monsterDefinition = MONSTER_TYPES[monsterKind];
        if (!stageSpawnIsInStartSafeZone(
          platform,
          monsterX,
          monsterDefinition,
        )) {
          addEnemy(platform, monsterX, monsterKind);
        }
      }
    }
    if (turretX !== null) addTurret(platform, turretX);

    if (
      platform.routeRole === "main" && !platform.startingRoad &&
      platformLength >= MONSTER_TYPES.monster3.spawnMinPlatformLength &&
      mapRandom() < MONSTER_TYPES.monster3.spawnChance
    ) {
      tryAddMonster3(platform, visibleStart, visibleEnd, 6, true);
    }

    if (platform.routeRole === "main" && !platform.startingRoad) {
      eligibleHeartPlatforms += 1;
      if (eligibleHeartPlatforms % 2 === 0) {
        tryAddHeartItem(platform, visibleStart, visibleEnd);
      }
    }
  }

  const routeRoads = platforms.filter((platform) =>
    platform.kind === "flat" && platform.routeRole === "main" &&
    !platform.startingRoad && platform.end - platform.start >= 170
  );
  if (!enemies.some((enemy) => enemy.kind === "monster3")) {
    const offset = Math.floor(mapRandom() * Math.max(1, routeRoads.length));
    for (let index = 0; index < routeRoads.length; index += 1) {
      const platform = routeRoads[(offset + index) % routeRoads.length];
      if (platform.end - platform.start < MONSTER_TYPES.monster3.spawnMinPlatformLength) continue;
      if (tryAddMonster3(
        platform,
        platform.start + 24,
        platform.end - 24,
        12,
        true,
      )) break;
    }
  }
  if (heartItems.length < 7) {
    const offset = Math.floor(mapRandom() * Math.max(1, routeRoads.length));
    for (let index = 0; index < routeRoads.length && heartItems.length < 7; index += 1) {
      const platform = routeRoads[(offset + index) % routeRoads.length];
      if (heartItems.some((heart) => heart.platform === platform)) continue;
      tryAddHeartItem(platform, platform.start + 16, platform.end - 16, false);
    }
  }
}

function startingPlatform() {
  return platformsAt(player.x + player.width / 2)[0] ?? platforms[0];
}

function resetPlayerPosition() {
  resetPlayerDownState();
  player.x = 110;
  player.platform = startingPlatform();
  player.y = platformSurfaceY(
    player.platform,
    player.x + player.width / 2,
  ) - player.height;
  player.vx = 0;
  player.vy = 0;
  player.reversalDirection = 0;
  player.reversalSparkTimer = 0;
  player.recentRunDirection = 0;
  player.recentRunSpeed = 0;
  player.reversalGraceTimer = 0;
  player.fireTimer = 0;
  player.fireAnimationTime = 0;
  player.fireBarrel = 0;
  player.fireWasActive = false;
  player.fireEnergy = PLAYER_FIRE_ENERGY_MAX;
  player.grounded = true;
  player.crouching = false;
  player.jumpLatch = false;
  player.jumpBufferTimer = 0;
  player.coyoteTime = PLAYER_COYOTE_TIME;
  player.jumpCount = 0;
  player.airJumpAvailable = true;
  player.jumpAnimationTime = 0;
  player.fallReferenceY = player.y + player.height;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  jumpQueued = false;
}

function spawnTestMonster(kind) {
  if (!TEST_MODE || !MONSTER_TYPES[kind]) return null;

  const definition = MONSTER_TYPES[kind];
  const playerCenterX = player.x + player.width / 2;
  const playerFeetY = player.y + player.height;
  const facing = player.facing || 1;
  const desiredCenterX = (
    playerCenterX + facing * Math.min(240, WIDTH * 0.22)
  );
  const candidates = platforms
    .filter((platform) => (
      platform.kind === "flat" &&
      platform.end - platform.start >= definition.width + 40
    ))
    .flatMap((platform) => {
      const minimumX = platform.start + 16;
      const maximumX = platform.end - definition.width - 16;
      const preferredX = Math.max(
        minimumX,
        Math.min(maximumX, desiredCenterX - definition.width / 2),
      );
      const step = definition.width + 56;
      const testPositions = [
        preferredX,
        preferredX + facing * step,
        preferredX - facing * step,
        preferredX + facing * step * 2,
        preferredX - facing * step * 2,
      ];
      return [...new Set(testPositions.map((x) => (
        Math.max(minimumX, Math.min(maximumX, x))
      )))].map((x) => {
        const centerX = x + definition.width / 2;
        const surfaceY = platformSurfaceY(platform, centerX);
        const spawnCenterY = surfaceY - (definition.hoverHeight ?? 0) - definition.height / 2;
        const isCurrentPlatform = platform === player.platform;
        const onScreenY = kind === "monster3" ? spawnCenterY : surfaceY;
        const onScreen = (
          centerX >= cameraX &&
          centerX <= cameraX + WIDTH &&
          onScreenY >= cameraY &&
          onScreenY <= cameraY + HEIGHT
        );
        const separation = Math.abs(centerX - playerCenterX);
        const minimumSeparation = (definition.width + player.width) / 2 + 34;
        const occupiedByEnemy = enemies.some((enemy) => (
          enemy.alive &&
          enemy.platform === platform &&
          x < enemy.x + enemy.width + 26 &&
          x + definition.width + 26 > enemy.x
        ));
        const occupiedByTurret = turrets.some((turret) => (
          turret.alive &&
          turret.platform === platform &&
          x < turret.x + turret.width + 30 &&
          x + definition.width + 30 > turret.x
        ));
        const occupiedByGate = (
          bossDoor?.platform === platform &&
          x < bossDoor.centerX + bossDoor.width / 2 + 34 &&
          x + definition.width + 34 > bossDoor.centerX - bossDoor.width / 2
        );
        return {
          platform,
          x,
          centerX,
          valid: (
            separation >= minimumSeparation &&
            !occupiedByEnemy &&
            !occupiedByTurret &&
            !occupiedByGate
          ),
          score: (
            (isCurrentPlatform ? -100000 : 0) +
            (onScreen ? -10000 : 0) +
            Math.abs(centerX - desiredCenterX) +
            (kind === "monster3"
              ? Math.abs(spawnCenterY - (playerFeetY - player.height / 2))
              : Math.abs(surfaceY - playerFeetY)) * 1.5
          ),
        };
      });
    })
    .filter((candidate) => candidate.valid)
    .sort((first, second) => first.score - second.score);
  const spawn = candidates[0];
  if (!spawn) return null;

  const enemy = addEnemy(spawn.platform, spawn.x, kind);
  if (!enemy) return null;
  enemy.facing = Math.sign(playerCenterX - spawn.centerX) || -facing;
  enemy.attackDirection = enemy.facing;
  burst(
    enemy.x + enemy.width / 2,
    enemy.y + enemy.height / 2,
    kind === "monster3" ? "#ff9c59"
      : kind === "monster2" ? "#dc55e9"
        : kind === "monster4" ? "#ff794f" : "#7cff48",
    15,
    145,
  );
  return enemy;
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
  player.reversalDirection = 0;
  player.reversalSparkTimer = 0;
  player.recentRunDirection = 0;
  player.recentRunSpeed = 0;
  player.reversalGraceTimer = 0;
  player.facing = direction;
  player.platform = firstPlatform;
  player.grounded = true;
  player.crouching = false;
  player.jumpLatch = false;
  player.jumpBufferTimer = 0;
  player.coyoteTime = PLAYER_COYOTE_TIME;
  player.jumpCount = 0;
  player.airJumpAvailable = true;
  player.jumpAnimationTime = 0;
  player.fallReferenceY = player.y + player.height;
  player.deepFalling = false;
  player.fallAnimationTime = 0;
  player.fireTimer = 0;
  player.fireAnimationTime = 0;
  player.fireWasActive = false;
  player.fireEnergy = PLAYER_FIRE_ENERGY_MAX;
  player.invincible = 1;
  resetPlayerDownState();
  gameOver = false;

  cameraLookDirection = direction;
  cameraPendingDirection = 0;
  cameraDirectionHoldTime = 0;
  const screenPosition = cameraAnchorScreenX(direction);
  cameraX = Math.max(
    minWorldX,
    Math.min(maxWorldX - WIDTH, player.x + player.width / 2 - screenPosition),
  );
  cameraY = player.y + player.height - BASE_GROUND_Y;
  updateTestJumpPathButton(testJumpRouteIndex + 1, testRoutes.length);
}

function updateTestResolutionButton() {
  if (!testResolutionButton || !TEST_MODE) return;
  const landscape = WIDTH > HEIGHT;
  const currentPreset = canvasResolutionForOrientation(
    TEST_RESOLUTION_SHORT_SIDES[testResolutionPresetIndex],
    landscape,
  );
  const nextPreset = canvasResolutionForOrientation(
    TEST_RESOLUTION_SHORT_SIDES[
      (testResolutionPresetIndex + 1) % TEST_RESOLUTION_SHORT_SIDES.length
    ],
    landscape,
  );
  testResolutionButton.textContent = `RES ${currentPreset.width}×${currentPreset.height}`;
  testResolutionButton.setAttribute(
    "aria-label",
    `현재 해상도 ${currentPreset.width} 곱하기 ${currentPreset.height}, ` +
      `${nextPreset.width} 곱하기 ${nextPreset.height}로 전환`,
  );
}

function updateTestOrientationButton() {
  if (!testOrientationButton || !TEST_MODE) return;
  const landscape = WIDTH > HEIGHT;
  const currentLabel = landscape ? "가로" : "세로";
  const nextLabel = landscape ? "세로" : "가로";
  testOrientationButton.textContent = `VIEW ${currentLabel}`;
  testOrientationButton.setAttribute(
    "aria-label",
    `현재 ${currentLabel} 화면, ${nextLabel} 화면으로 전환`,
  );
}

function applyTestOrientationLayout() {
  if (!gameShellElement) return;
  if (!TEST_MODE || testOrientationOverride === null) {
    gameShellElement.removeAttribute("data-test-layout");
    return;
  }
  gameShellElement.dataset.testLayout = (
    testOrientationOverride ? "landscape" : "portrait"
  );
}

function resizeGameResolution(width, height) {
  if (width === WIDTH && height === HEIGHT) return false;
  const previousWidth = WIDTH;
  const previousGroundY = BASE_GROUND_Y;
  const playerCenterX = player.x + player.width / 2;
  const playerScreenRatio = previousWidth > 0
    ? (playerCenterX - cameraX) / previousWidth
    : 0.5;

  configureCanvasResolution(width, height);

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
  for (const enemy of enemies) {
    if (enemy.kind === "monster3") enemy.hoverBaseY += verticalShift;
  }
  for (const heart of heartItems) heart.y += verticalShift;
  for (const turret of turrets) turret.y += verticalShift;
  for (const boss of midBosses) {
    boss.y += verticalShift;
    boss.baseY += verticalShift;
    boss.targetY += verticalShift;
  }
  for (const bullet of bullets) bullet.y += verticalShift;
  for (const bullet of enemyBullets) bullet.y += verticalShift;
  for (const particle of particles) particle.y += verticalShift;
  stars.length = 0;
  buildStars();
  lowestPlatformY += verticalShift;

  const preservedScreenX = Math.max(0, Math.min(1, playerScreenRatio)) * WIDTH;
  cameraX = Math.max(
    minWorldX,
    Math.min(maxWorldX - WIDTH, playerCenterX - preservedScreenX),
  );
  shake = 0;
  updateTestResolutionButton();
  updateTestOrientationButton();
  return true;
}

function syncCanvasOrientation() {
  const shortSide = Math.min(WIDTH, HEIGHT);
  const landscape = TEST_MODE && testOrientationOverride !== null
    ? testOrientationOverride
    : viewportIsLandscape();
  const nextResolution = canvasResolutionForOrientation(shortSide, landscape);
  if (
    nextResolution.width === WIDTH &&
    nextResolution.height === HEIGHT
  ) {
    syncCanvasBackingScale();
    return;
  }

  resetAllInputs();
  resizeGameResolution(nextResolution.width, nextResolution.height);
}

function toggleTestOrientation() {
  if (!TEST_MODE) return;
  testOrientationOverride = !(WIDTH > HEIGHT);
  applyTestOrientationLayout();
  resetAllInputs();

  const shortSide = Math.min(WIDTH, HEIGHT);
  const nextResolution = canvasResolutionForOrientation(
    shortSide,
    testOrientationOverride,
  );
  resizeGameResolution(nextResolution.width, nextResolution.height);
}

function cycleTestResolution() {
  if (!TEST_MODE) return;
  resetAllInputs();

  testResolutionPresetIndex = (
    testResolutionPresetIndex + 1
  ) % TEST_RESOLUTION_SHORT_SIDES.length;
  const nextResolution = canvasResolutionForOrientation(
    TEST_RESOLUTION_SHORT_SIDES[testResolutionPresetIndex],
    WIDTH > HEIGHT,
  );
  resizeGameResolution(nextResolution.width, nextResolution.height);
}

function updateTestMapButton() {
  if (!TEST_MODE || !testMapButton) return;
  testMapButton.setAttribute("aria-pressed", String(showFullMap));
  testMapButton.setAttribute("aria-label", `전체 지도 표시 ${showFullMap ? "켜짐, 다시 누르면 닫기" : "꺼짐"}`);
}

function toggleTestMap() {
  if (!TEST_MODE) return;
  resetAllInputs();
  showFullMap = !showFullMap;
  updateTestMapButton();
}

function resetGame() {
  bullets.length = 0;
  enemyBullets.length = 0;
  particles.length = 0;
  enemies.length = 0;
  heartItems.length = 0;
  turrets.length = 0;
  generateMap();
  resetPlayerPosition();

  player.hp = 3;
  player.maxHp = 3;
  player.score = 0;
  player.invincible = 0;
  cameraLookDirection = 1;
  cameraPendingDirection = 0;
  cameraDirectionHoldTime = 0;
  cameraX = Math.max(
    minWorldX,
    Math.min(
      maxWorldX - WIDTH,
      player.x + player.width / 2 - cameraAnchorScreenX(1),
    ),
  );
  cameraY = 0;
  gameOver = false;
  showFullMap = false;
  updateTestMapButton();
  buildStage();
  testJumpRouteIndex = -1;
  updateTestJumpPathButton();
  updateTestResolutionButton();
  updateTestOrientationButton();
}
