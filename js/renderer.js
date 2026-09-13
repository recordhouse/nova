"use strict";

// Background, terrain, characters, projectiles, and HUD rendering.

function drawBackground() {
  const spaceGradient = ctx.createLinearGradient(0, 0, 0, BASE_GROUND_Y);
  spaceGradient.addColorStop(0, "#02030a");
  spaceGradient.addColorStop(0.55, "#080b1d");
  spaceGradient.addColorStop(1, "#111126");
  ctx.fillStyle = spaceGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (
    fixedBackground.loaded &&
    fixedBackground.image.naturalWidth &&
    fixedBackground.image.naturalHeight
  ) {
    const imageWidth = fixedBackground.image.naturalWidth;
    const imageHeight = fixedBackground.image.naturalHeight;
    const sourceAspect = imageWidth / imageHeight;
    const canvasAspect = WIDTH / HEIGHT;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = imageWidth;
    let sourceHeight = imageHeight;

    if (sourceAspect > canvasAspect) {
      sourceWidth = imageHeight * canvasAspect;
      sourceX = (imageWidth - sourceWidth) / 2;
    } else {
      sourceHeight = imageWidth / canvasAspect;
      sourceY = (imageHeight - sourceHeight) / 2;
    }

    ctx.drawImage(
      fixedBackground.image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      WIDTH,
      HEIGHT,
    );
  }

  const starSpan = WIDTH + 160;
  const starHeight = HEIGHT + 180;
  for (const star of stars) {
    const wrappedX = ((star.x - cameraX * star.depth) % starSpan + starSpan) % starSpan - 80;
    const starY = ((star.y - cameraY * star.depth) % starHeight + starHeight) % starHeight - 90;
    const twinkle = 0.6 + Math.sin(gameTime * 2.2 + star.phase) * 0.28;
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = star.glow ? "#b8dcff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(wrappedX, starY, star.size, 0, Math.PI * 2);
    ctx.fill();

    if (star.glow) {
      ctx.fillRect(wrappedX - star.size * 2.4, starY - 0.5, star.size * 4.8, 1);
      ctx.fillRect(wrappedX - 0.5, starY - star.size * 2.4, 1, star.size * 4.8);
    }
  }
  ctx.globalAlpha = 1;
}

function drawStationPanels(platform, thickness = PLATFORM_DECK_THICKNESS - 4) {
  const panelWidths = [84, 112, 140];
  const panelPalettes = [
    ["#18232d", "#1c2934"],
    ["#20252d", "#252c35"],
    ["#142a31", "#19343c"],
  ];
  const panelWidth = panelWidths[platform.style];
  const palette = panelPalettes[platform.style];
  const firstPanel = platform.start + panelWidth / 2;

  for (let x = firstPanel; x <= platform.end - panelWidth / 2; x += panelWidth) {
    ctx.save();
    ctx.translate(x, platform.y);

    ctx.fillStyle = Math.floor((x - platform.start) / panelWidth) % 2 === 0
      ? palette[0]
      : palette[1];
    ctx.fillRect(-panelWidth / 2 - 1, 3, panelWidth + 2, thickness);
    ctx.strokeStyle = "rgba(89, 112, 128, 0.62)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-panelWidth / 2, 4, panelWidth, thickness - 2);

    ctx.strokeStyle = "rgba(111, 151, 170, 0.28)";
    ctx.beginPath();
    if (platform.style === 0) {
      ctx.moveTo(0, 5);
      ctx.lineTo(0, thickness + 1);
    } else if (platform.style === 1) {
      ctx.moveTo(-panelWidth * 0.32, thickness + 1);
      ctx.lineTo(panelWidth * 0.32, 5);
    } else {
      ctx.moveTo(-panelWidth * 0.2, 5);
      ctx.lineTo(-panelWidth * 0.2, thickness + 1);
      ctx.moveTo(panelWidth * 0.2, 5);
      ctx.lineTo(panelWidth * 0.2, thickness + 1);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(104, 211, 225, 0.28)";
    ctx.fillRect(-panelWidth * 0.28, 6, panelWidth * 0.56, 1.5);
    ctx.restore();
  }
}

function drawPlatformLights(platform) {
  const frame = Math.floor(gameTime * 22);
  const spacing = Math.min(150, platform.lightSpacing);
  const platformLength = platform.end - platform.start;
  if (platformLength < 36) return;
  const firstLightX = Math.max(
    platform.start + 18,
    Math.min(platform.start + platform.lightOffset, platform.end - 18),
  );
  for (
    let x = firstLightX;
    x <= platform.end - 18;
    x += spacing
  ) {
    const seed = Math.floor(x - platform.start) + 330;
    const damaged = platformFeatureNoise(platform, seed) > 0.72;
    const flicker = platformFeatureNoise(platform, seed + frame * 19);
    const lit = !damaged || flicker > 0.43;
    const pulse = lit
      ? 0.72 + Math.sin(gameTime * 2.8 + platform.lightPhase + x * 0.015) * 0.2
      : 0.08;
    ctx.save();
    ctx.fillStyle = "#05090e";
    ctx.fillRect(x - 8, platform.y + 4, 16, 8);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 7.5, platform.y + 4.5, 15, 7);
    ctx.globalAlpha = pulse;
    ctx.shadowColor = platform.lightColor;
    ctx.shadowBlur = lit ? 11 : 2;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(x - 5, platform.y + 7, 10, 2);
    ctx.fillRect(x - 2, platform.y - 3, 4, 1.5);
    ctx.restore();

    if (damaged && flicker > 0.76) {
      drawPlatformElectricArc(
        platform,
        { seed },
        x - 3,
        platform.y + 6,
        x + (flicker - 0.5) * 22,
        platform.y - 8 - flicker * 7,
        440,
        platform.lightColor,
      );
    }
  }
}

function drawRampLights(platform) {
  const length = Math.hypot(
    platform.exitX - platform.entryX,
    platform.exitY - platform.entryY,
  );
  const spacing = Math.min(150, platform.lightSpacing);
  const firstDistance = 24 + platform.lightOffset % 42;
  const angle = Math.atan2(
    platform.exitY - platform.entryY,
    platform.exitX - platform.entryX,
  );
  const frame = Math.floor(gameTime * 22);

  for (let distance = firstDistance; distance < length - 18; distance += spacing) {
    const progress = distance / length;
    const x = platform.entryX + (platform.exitX - platform.entryX) * progress;
    const y = platform.entryY + (platform.exitY - platform.entryY) * progress;
    const seed = Math.floor(distance) + 570;
    const damaged = platformFeatureNoise(platform, seed) > 0.76;
    const flicker = platformFeatureNoise(platform, seed + frame * 23);
    const lit = !damaged || flicker > 0.4;
    const pulse = lit
      ? 0.72 + Math.sin(gameTime * 2.8 + platform.lightPhase + distance * 0.02) * 0.2
      : 0.08;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#05090e";
    ctx.fillRect(-8, 4, 16, 7);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7.5, 4.5, 15, 6);
    ctx.globalAlpha = pulse;
    ctx.shadowColor = platform.lightColor;
    ctx.shadowBlur = lit ? 11 : 2;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(-5, 6.5, 10, 2);
    ctx.restore();

    if (damaged && flicker > 0.78) {
      drawPlatformElectricArc(
        platform,
        { seed },
        x,
        y + 6,
        x + (flicker - 0.5) * 20,
        y - 10 - flicker * 6,
        630,
        platform.lightColor,
      );
    }
  }
}

function drawPlatformArchitecture(platform) {
  const length = platform.end - platform.start;
  ctx.save();

  if (platform.architecture === "conduit") {
    ctx.strokeStyle = "rgba(113, 149, 171, 0.74)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(platform.start + 8, platform.y + 5);
    ctx.lineTo(platform.end - 8, platform.y + 5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(126, 98, 196, 0.68)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(platform.start + 14, platform.y + 11);
    ctx.lineTo(platform.end - 14, platform.y + 11);
    ctx.stroke();
  }

  if (platform.zone === "connector") {
    ctx.fillStyle = "rgba(105, 245, 255, 0.78)";
    ctx.fillRect(platform.start + 10, platform.y + 4, Math.max(0, length - 20), 1.5);
    ctx.fillRect(platform.start + 20, platform.y + 11, Math.max(0, length - 40), 1.5);
  } else if (platform.zone === "rest") {
    ctx.fillStyle = "rgba(141, 255, 189, 0.7)";
    const markerX = platform.start + length / 2;
    ctx.fillRect(markerX - 22, platform.y - 4, 44, 3);
  } else if (platform.zone === "sub") {
    ctx.fillStyle = "rgba(199, 169, 255, 0.78)";
    for (let x = platform.start + 18; x < platform.end - 12; x += 58) {
      ctx.fillRect(x, platform.y + 5, Math.min(18, platform.end - x), 1.5);
    }
  }
  ctx.restore();
}

function platformFeatureNoise(platform, salt = 0) {
  const value = Math.sin(
    (platform.id + 1) * 12.9898 + (salt + 1) * 78.233,
  ) * 43758.5453;
  return value - Math.floor(value);
}

function drawPlatformElectricArc(
  platform,
  feature,
  startX,
  startY,
  endX,
  endY,
  salt,
  color = "#c9f8ff",
) {
  const frame = Math.floor(gameTime * 24);
  const steps = 6;
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  for (let step = 1; step < steps; step += 1) {
    const progress = step / steps;
    const jitter = (
      platformFeatureNoise(
        platform,
        feature.seed + salt + frame * 17 + step * 5,
      ) - 0.5
    ) * 11;
    ctx.lineTo(
      startX + dx * progress + normalX * jitter,
      startY + dy * progress + normalY * jitter,
    );
  }
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawBrokenNeonFeature(platform, feature) {
  const width = feature.width;
  const startX = feature.centerX - width / 2;
  const y = platform.y + 10;
  const frame = Math.floor(gameTime * 18);
  const segmentCount = Math.max(4, Math.floor(width / 24));
  const segmentGap = 5;
  const segmentWidth = (width - segmentGap * (segmentCount - 1)) / segmentCount;
  const brokenIndex = Math.floor(
    platformFeatureNoise(platform, feature.seed + 31) * segmentCount,
  );
  const flicker = platformFeatureNoise(platform, feature.seed + frame + 190);

  ctx.save();
  ctx.fillStyle = "#05080c";
  ctx.fillRect(startX - 5, y - 3, width + 10, 11);
  ctx.fillStyle = "#303942";
  ctx.fillRect(startX - 3, y - 1, width + 6, 2);

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const segmentX = startX + segment * (segmentWidth + segmentGap);
    const permanentlyBroken = (
      segment === brokenIndex ||
      platformFeatureNoise(platform, feature.seed + 70 + segment) < 0.12
    );
    const nearDamage = Math.abs(segment - brokenIndex) <= 1;
    const isLit = !permanentlyBroken && (!nearDamage || flicker > 0.46);
    ctx.fillStyle = "#11181e";
    ctx.fillRect(segmentX, y + 1, segmentWidth, 4);
    if (!isLit) continue;

    const pulse = nearDamage
      ? 0.28 + flicker * 0.72
      : 0.76 + Math.sin(gameTime * 3.4 + feature.phase + segment) * 0.16;
    ctx.globalAlpha = pulse;
    ctx.shadowColor = segment % 3 === 0 ? "#d79cff" : "#6df5ff";
    ctx.shadowBlur = 10;
    ctx.fillStyle = segment % 3 === 0 ? "#e7b6ff" : "#9cfcff";
    ctx.fillRect(segmentX + 1, y + 2, Math.max(2, segmentWidth - 2), 2);
  }
  ctx.restore();

  const brokenX = startX + brokenIndex * (segmentWidth + segmentGap) + segmentWidth / 2;
  ctx.fillStyle = "#020509";
  ctx.beginPath();
  ctx.moveTo(brokenX - 8, platform.y - 5);
  ctx.lineTo(brokenX - 3, platform.y + 3);
  ctx.lineTo(brokenX + 2, platform.y - 1);
  ctx.lineTo(brokenX + 8, platform.y - 5);
  ctx.closePath();
  ctx.fill();

  if (flicker > 0.67) {
    drawPlatformElectricArc(
      platform,
      feature,
      brokenX - 3,
      y + 2,
      brokenX + 4 + flicker * 7,
      platform.y - 10 - flicker * 7,
      410,
      "#a9faff",
    );
  }
}

function drawElectricHoseFeature(platform, feature) {
  const width = feature.width;
  const startX = feature.centerX - width / 2;
  const endX = feature.centerX + width / 2;
  const connectionY = platform.y + 3;
  const sagY = platform.y + 27;
  const frame = Math.floor(gameTime * 21);
  const discharge = platformFeatureNoise(platform, feature.seed + frame + 520);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(2, 5, 8, 0.9)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(startX, connectionY);
  ctx.bezierCurveTo(
    startX + width * 0.24,
    sagY,
    endX - width * 0.24,
    sagY,
    endX,
    connectionY,
  );
  ctx.stroke();
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const connectorX of [startX, endX]) {
    ctx.fillStyle = "#11181e";
    ctx.fillRect(connectorX - 8, connectionY - 6, 16, 13);
    ctx.strokeStyle = "#d8e4e8";
    ctx.lineWidth = 2;
    ctx.strokeRect(connectorX - 7, connectionY - 5, 14, 11);
    ctx.fillStyle = "#8df7ff";
    ctx.fillRect(connectorX - 2, connectionY - 2, 4, 4);
  }
  ctx.restore();

  if (discharge > 0.3) {
    const arcOriginX = feature.centerX + (discharge - 0.5) * width * 0.34;
    drawPlatformElectricArc(
      platform,
      feature,
      arcOriginX,
      platform.y + 21,
      arcOriginX + (discharge - 0.5) * 28,
      platform.y - 18 - discharge * 10,
      610,
      "#e7fdff",
    );
    if (discharge > 0.72) {
      drawPlatformElectricArc(
        platform,
        feature,
        arcOriginX,
        platform.y + 8,
        arcOriginX + 24,
        platform.y - 5,
        720,
        "#91efff",
      );
    }
  }
}

function drawDamagedRoadFeature(platform, feature) {
  const width = feature.width;
  const startX = feature.centerX - width / 2;
  const damageCount = Math.max(2, Math.floor(width / 72));

  ctx.save();
  for (let damage = 0; damage < damageCount; damage += 1) {
    const centerX = (
      startX +
      width * (damage + 0.5) / damageCount +
      (platformFeatureNoise(platform, feature.seed + 810 + damage) - 0.5) * 18
    );
    const holeWidth = 18 + platformFeatureNoise(platform, feature.seed + 840 + damage) * 18;
    const holeTop = (
      platform.y +
      2 +
      platformFeatureNoise(platform, feature.seed + 870 + damage) * 4
    );
    ctx.fillStyle = "rgba(2, 5, 8, 0.92)";
    ctx.beginPath();
    ctx.moveTo(centerX - holeWidth / 2, holeTop + 3);
    ctx.lineTo(centerX - holeWidth * 0.22, holeTop - 2);
    ctx.lineTo(centerX + holeWidth * 0.12, holeTop + 2);
    ctx.lineTo(centerX + holeWidth / 2, holeTop);
    ctx.lineTo(centerX + holeWidth * 0.3, holeTop + 8);
    ctx.lineTo(centerX - holeWidth * 0.34, holeTop + 7);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(126, 151, 164, 0.76)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(centerX - 2, holeTop + 1);
    ctx.lineTo(centerX - 9, holeTop - 5);
    ctx.lineTo(centerX - 14, holeTop - 3);
    ctx.moveTo(centerX + 4, holeTop + 3);
    ctx.lineTo(centerX + 12, holeTop - 4);
    ctx.lineTo(centerX + 18, holeTop - 6);
    ctx.moveTo(centerX, holeTop + 7);
    ctx.lineTo(centerX - 5, holeTop + 12);
    ctx.stroke();

    if (damage === 0) {
      ctx.strokeStyle = "#d7793f";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX - holeWidth * 0.22, holeTop + 7);
      ctx.lineTo(centerX + holeWidth * 0.25, holeTop + 5);
      ctx.stroke();
    }
  }

  const notchX = feature.centerX + width * 0.28;
  ctx.fillStyle = "#020509";
  ctx.beginPath();
  ctx.moveTo(notchX - 13, platform.y - 6);
  ctx.lineTo(notchX - 6, platform.y + 3);
  ctx.lineTo(notchX, platform.y - 1);
  ctx.lineTo(notchX + 7, platform.y + 5);
  ctx.lineTo(notchX + 14, platform.y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLargeDamagedRoadFeature(platform, feature) {
  const width = feature.width;
  const startX = feature.centerX - width / 2;
  const endX = feature.centerX + width / 2;
  const frame = Math.floor(gameTime * 24);
  const discharge = platformFeatureNoise(platform, feature.seed + frame + 980);

  ctx.save();
  ctx.fillStyle = "rgba(1, 4, 7, 0.96)";
  ctx.beginPath();
  ctx.moveTo(startX + 8, platform.y + 7);
  ctx.lineTo(startX + width * 0.2, platform.y + 3);
  ctx.lineTo(startX + width * 0.34, platform.y + 10);
  ctx.lineTo(startX + width * 0.52, platform.y + 5);
  ctx.lineTo(startX + width * 0.7, platform.y + 11);
  ctx.lineTo(endX - 8, platform.y + 5);
  ctx.lineTo(endX - 16, platform.y + PLATFORM_DECK_THICKNESS);
  ctx.lineTo(startX + 18, platform.y + PLATFORM_DECK_THICKNESS - 1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(136, 159, 170, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX + 8, platform.y + 7);
  ctx.lineTo(startX + width * 0.2, platform.y + 3);
  ctx.lineTo(startX + width * 0.34, platform.y + 10);
  ctx.lineTo(startX + width * 0.52, platform.y + 5);
  ctx.lineTo(startX + width * 0.7, platform.y + 11);
  ctx.lineTo(endX - 8, platform.y + 5);
  ctx.stroke();
  ctx.restore();

  drawDamagedRoadFeature(platform, feature);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#c66b38";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startX + 18, platform.y + 18);
  ctx.bezierCurveTo(
    startX + width * 0.3,
    platform.y + 29,
    startX + width * 0.68,
    platform.y + 6,
    endX - 18,
    platform.y + 19,
  );
  ctx.stroke();
  ctx.strokeStyle = "#6d8fa8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX + 22, platform.y + 23);
  ctx.bezierCurveTo(
    startX + width * 0.34,
    platform.y + 8,
    startX + width * 0.72,
    platform.y + 31,
    endX - 22,
    platform.y + 14,
  );
  ctx.stroke();
  ctx.restore();

  drawPlatformElectricArc(
    platform,
    feature,
    startX + 22,
    platform.y + 18,
    endX - 22,
    platform.y + 16,
    1060,
    "#bdf9ff",
  );
  drawPlatformElectricArc(
    platform,
    feature,
    feature.centerX - width * 0.08,
    platform.y + 16,
    feature.centerX + (discharge - 0.5) * 34,
    platform.y - 22 - discharge * 12,
    1180,
    "#ddc2ff",
  );
}

function drawPlatformFeature(platform) {
  for (const feature of platform.features ?? []) {
    if (feature.type === "broken-neon") {
      drawBrokenNeonFeature(platform, feature);
    } else if (feature.type === "electric-hose") {
      drawElectricHoseFeature(platform, feature);
    } else if (feature.type === "damaged-road") {
      drawDamagedRoadFeature(platform, feature);
    } else if (feature.type === "damaged-road-large") {
      drawLargeDamagedRoadFeature(platform, feature);
    }
  }
}

function platformHasJoinedEndpoint(platform, x, y) {
  return platforms.some((other) => {
    if (other.id === platform.id) return false;
    if (other.kind === "ramp") {
      return (
        (Math.abs(other.entryX - x) < 0.5 && Math.abs(other.entryY - y) < 0.5) ||
        (Math.abs(other.exitX - x) < 0.5 && Math.abs(other.exitY - y) < 0.5)
      );
    }
    return (
      Math.abs(other.y - y) < 0.5 &&
      (Math.abs(other.entryX - x) < 0.5 || Math.abs(other.exitX - x) < 0.5)
    );
  });
}

function traceFlatPlatformBody(platform, joinedAtStart, joinedAtEnd) {
  const bottomStart = platform.start + (joinedAtStart ? 0 : platform.edgeInsetStart);
  const bottomEnd = platform.end - (joinedAtEnd ? 0 : platform.edgeInsetEnd);
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(platform.end, platform.y);
  ctx.lineTo(bottomEnd, platform.y + PLATFORM_DECK_THICKNESS);
  ctx.lineTo(bottomStart, platform.y + PLATFORM_DECK_THICKNESS);
  ctx.closePath();
}

function drawRamp(platform, palette, railColor) {
  const topY = Math.min(platform.entryY, platform.exitY);
  const bottomY = (
    Math.max(platform.entryY, platform.exitY) + PLATFORM_DECK_THICKNESS
  );
  const direction = Math.sign(platform.exitX - platform.entryX) || 1;
  const entryInset = direction > 0
    ? platform.edgeInsetStart
    : platform.edgeInsetEnd;
  const exitInset = direction > 0
    ? platform.edgeInsetEnd
    : platform.edgeInsetStart;
  const joinedAtEntry = platformHasJoinedEndpoint(
    platform,
    platform.entryX,
    platform.entryY,
  );
  const joinedAtExit = platformHasJoinedEndpoint(
    platform,
    platform.exitX,
    platform.exitY,
  );
  const bottomEntryX = platform.entryX + direction * (joinedAtEntry ? 0 : entryInset);
  const bottomExitX = platform.exitX - direction * (joinedAtExit ? 0 : exitInset);
  const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.55, palette[1]);
  gradient.addColorStop(1, palette[2]);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(platform.entryX, platform.entryY);
  ctx.lineTo(platform.exitX, platform.exitY);
  ctx.lineTo(bottomExitX, platform.exitY + PLATFORM_DECK_THICKNESS);
  ctx.lineTo(bottomEntryX, platform.entryY + PLATFORM_DECK_THICKNESS);
  ctx.closePath();
  ctx.fill();

  const divisions = Math.max(3, Math.floor((platform.end - platform.start) / 54));
  ctx.strokeStyle = "rgba(104, 151, 171, 0.34)";
  ctx.lineWidth = 1;
  for (let division = 1; division < divisions; division += 1) {
    const progress = division / divisions;
    const x = platform.entryX + (platform.exitX - platform.entryX) * progress;
    const y = platform.entryY + (platform.exitY - platform.entryY) * progress;
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.lineTo(x, y + PLATFORM_DECK_THICKNESS - 2);
    ctx.stroke();
  }

  ctx.strokeStyle = railColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(platform.entryX, platform.entryY);
  ctx.lineTo(platform.exitX, platform.exitY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(105, 226, 238, 0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "#0a1017";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (!joinedAtEntry) {
    ctx.moveTo(platform.entryX, platform.entryY);
    ctx.lineTo(bottomEntryX, platform.entryY + PLATFORM_DECK_THICKNESS);
  }
  if (!joinedAtExit) {
    ctx.moveTo(platform.exitX, platform.exitY);
    ctx.lineTo(bottomExitX, platform.exitY + PLATFORM_DECK_THICKNESS);
  }
  ctx.stroke();
  drawRampLights(platform);
}

function drawInvertedTrianglePlatform(platform, palette, railColor) {
  const centerX = (platform.start + platform.end) / 2;
  const depth = invertedTrianglePlatformDepth(platform);
  const apexY = platform.y + depth;
  const gradient = ctx.createLinearGradient(0, platform.y, 0, apexY);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.54, palette[1]);
  gradient.addColorStop(1, palette[2]);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(platform.end, platform.y);
  ctx.lineTo(centerX, apexY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(102, 139, 157, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(centerX, apexY);
  ctx.lineTo(platform.end, platform.y);
  ctx.stroke();

  ctx.fillStyle = railColor;
  ctx.fillRect(platform.start, platform.y - 3, platform.end - platform.start, 3);
  ctx.fillStyle = "rgba(105, 226, 238, 0.94)";
  ctx.fillRect(platform.start, platform.y - 1.5, platform.end - platform.start, 1);

  const fixtureSeed = 910 + platform.id * 3;
  const frame = Math.floor(gameTime * 22);
  const damaged = platformFeatureNoise(platform, fixtureSeed) > 0.72;
  const flicker = platformFeatureNoise(platform, fixtureSeed + frame * 17);
  const lit = !damaged || flicker > 0.42;
  const pulse = lit
    ? 0.72 + Math.sin(gameTime * 2.4 + platform.lightPhase) * 0.18
    : 0.08;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = platform.lightColor;
  ctx.shadowBlur = lit ? 9 : 2;
  ctx.fillStyle = platform.lightColor;
  ctx.fillRect(centerX - 4, platform.y + Math.min(12, depth * 0.24), 8, 2);
  ctx.restore();

  if (damaged && flicker > 0.76) {
    drawPlatformElectricArc(
      platform,
      { seed: fixtureSeed },
      centerX,
      platform.y + Math.min(12, depth * 0.24),
      centerX + (flicker - 0.5) * 20,
      platform.y - 10 - flicker * 7,
      880,
      platform.lightColor,
    );
  }
}

function drawTerrain() {
  const deckPalettes = [
    ["#253541", "#17232d", "#0d151c"],
    ["#343740", "#20262d", "#10161c"],
    ["#214049", "#172c32", "#0c181c"],
  ];
  const railColors = ["#718391", "#8b8378", "#668f96"];

  for (const platform of platforms) {
    const platformTopY = platform.kind === "flat"
      ? platform.y
      : Math.min(platform.entryY, platform.exitY);
    const platformBottomY = platform.kind === "flat"
      ? platform.y + (
        isInvertedTrianglePlatform(platform)
          ? invertedTrianglePlatformDepth(platform)
          : PLATFORM_DECK_THICKNESS
      )
      : Math.max(platform.entryY, platform.exitY) + PLATFORM_DECK_THICKNESS;
    if (
      platform.end < cameraX - 120 ||
      platform.start > cameraX + WIDTH + 120 ||
      platformBottomY < cameraY - 100 ||
      platformTopY > cameraY + HEIGHT + 120
    ) continue;

    const isSubPath = platform.routeRole === "sub";
    const palette = isSubPath
      ? ["#332a48", "#211c32", "#120f1e"]
      : deckPalettes[platform.style];
    if (platform.kind === "ramp") {
      drawRamp(platform, palette, railColors[platform.style]);
      continue;
    }
    if (isInvertedTrianglePlatform(platform)) {
      drawInvertedTrianglePlatform(platform, palette, railColors[platform.style]);
      continue;
    }
    const deckGradient = ctx.createLinearGradient(
      0,
      platform.y,
      0,
      platform.y + PLATFORM_DECK_THICKNESS,
    );
    deckGradient.addColorStop(0, palette[0]);
    deckGradient.addColorStop(0.48, palette[1]);
    deckGradient.addColorStop(1, palette[2]);
    const joinedAtStart = platformHasJoinedEndpoint(platform, platform.start, platform.y);
    const joinedAtEnd = platformHasJoinedEndpoint(platform, platform.end, platform.y);
    ctx.fillStyle = deckGradient;
    traceFlatPlatformBody(platform, joinedAtStart, joinedAtEnd);
    ctx.fill();

    ctx.save();
    traceFlatPlatformBody(platform, joinedAtStart, joinedAtEnd);
    ctx.clip();
    drawStationPanels(platform);
    ctx.fillStyle = "#0a1118";
    ctx.fillRect(
      platform.start,
      platform.y + PLATFORM_DECK_THICKNESS - 2,
      platform.end - platform.start,
      2,
    );
    drawPlatformArchitecture(platform);
    ctx.restore();

    drawPlatformLights(platform);
    ctx.fillStyle = isSubPath ? "#8873ad" : railColors[platform.style];
    ctx.fillRect(platform.start, platform.y - 3, platform.end - platform.start, 3);
    ctx.fillStyle = isSubPath
      ? "rgba(201, 174, 255, 0.94)"
      : "rgba(105, 226, 238, 0.9)";
    ctx.fillRect(platform.start, platform.y - 1.5, platform.end - platform.start, 1);
    drawPlatformFeature(platform);

    ctx.strokeStyle = "#0a1017";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (!joinedAtStart) {
      ctx.moveTo(platform.start, platform.y);
      ctx.lineTo(
        platform.start + platform.edgeInsetStart,
        platform.y + PLATFORM_DECK_THICKNESS,
      );
    }
    if (!joinedAtEnd) {
      ctx.moveTo(platform.end, platform.y);
      ctx.lineTo(
        platform.end - platform.edgeInsetEnd,
        platform.y + PLATFORM_DECK_THICKNESS,
      );
    }
    ctx.stroke();
  }
}

function drawPlayer() {
  if (player.invincible > 0 && Math.floor(gameTime * 16) % 2 === 0) return;
  drawPlayerSprite(player.x + player.width / 2);
}

function drawPlayerPhysicsDebug() {
  if (!TEST_MODE || !showPlayerArea) return;
  const hitbox = getPlayerHitbox();
  ctx.save();
  ctx.fillStyle = "rgba(55, 255, 105, 0.13)";
  ctx.fillRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
  ctx.strokeStyle = "rgba(105, 255, 145, 0.48)";
  ctx.lineWidth = 1.25;
  ctx.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
  ctx.restore();
}

function drawPlayerSprite(centerX) {
  const isRunning = Math.abs(player.vx) > 1;
  const isJumping = !player.grounded;
  const isDeepFalling = isJumping && player.deepFalling;
  const isFiring = controls.fire;
  const isCrouching = player.crouching && player.grounded;
  const isAimingHigh = playerIsAimingHigh();
  const sprite = isCrouching && isFiring
    ? playerSprites.blastSit
    : isCrouching
      ? playerSprites.sit
      : isFiring
        ? isJumping
          ? playerSprites.blastJump
          : isAimingHigh
            ? playerSprites.blastHigh
            : playerSprites.blast
        : isDeepFalling
          ? playerSprites.getOff
          : isJumping
            ? playerSprites.jump
            : isRunning
              ? playerSprites.run
              : playerSprites.stand;
  if (!sprite.loaded || !sprite.image.naturalWidth || !sprite.image.naturalHeight) return;

  const jumpProgress = Math.min(1, player.jumpAnimationTime / JUMP_ANIMATION_DURATION);
  const frame = isFiring
    ? Math.floor(player.fireAnimationTime * sprite.fps) % sprite.frames.length
    : isDeepFalling
      ? Math.floor(player.fallAnimationTime * sprite.fps) % sprite.frames.length
      : isJumping
        ? Math.min(sprite.frames.length - 1, Math.floor(jumpProgress * sprite.frames.length))
        : Math.floor(gameTime * sprite.fps) % sprite.frames.length;
  const source = sprite.frames[frame];
  const spriteScale = sprite === playerSprites.stand
    ? PLAYER_STAND_SPRITE_SCALE
    : sprite === playerSprites.blastHigh
      ? PLAYER_BLAST_HIGH_SPRITE_SCALE
      : sprite === playerSprites.blastJump
        ? PLAYER_JUMP_SPRITE_SCALE
        : sprite === playerSprites.blast
          ? PLAYER_BLAST_SPRITE_SCALE
          : sprite === playerSprites.sit
            ? PLAYER_SIT_SPRITE_SCALE
            : sprite === playerSprites.blastSit
              ? PLAYER_BLAST_SIT_SPRITE_SCALE
              : sprite === playerSprites.getOff
                ? PLAYER_GET_OFF_SPRITE_SCALE
                : sprite === playerSprites.jump
                  ? PLAYER_JUMP_SPRITE_SCALE
                  : 1;
  const drawHeight = PLAYER_SPRITE_DRAW_HEIGHT * spriteScale;
  const drawWidth = source.width * (drawHeight / source.height);
  const feetY = player.y + player.height;

  ctx.save();
  ctx.translate(centerX, feetY);
  ctx.scale(player.facing, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    sprite.image,
    source.x,
    source.y,
    source.width,
    source.height,
    -drawWidth / 2,
    -drawHeight,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
}

function drawCombatantHealthBar(centerX, topY, width, hp, maxHp) {
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const colorHue = Math.round(ratio * 120);
  const height = 7;
  const left = centerX - width / 2;

  ctx.save();
  ctx.fillStyle = "rgba(4, 7, 10, 0.88)";
  ctx.fillRect(left - 2, topY - 2, width + 4, height + 4);
  ctx.fillStyle = "rgba(33, 38, 43, 0.94)";
  ctx.fillRect(left, topY, width, height);
  ctx.fillStyle = `hsl(${colorHue}, 92%, 52%)`;
  ctx.shadowColor = `hsl(${colorHue}, 96%, 58%)`;
  ctx.shadowBlur = 5;
  ctx.fillRect(left, topY, width * ratio, height);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(220, 231, 239, 0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(left - 0.5, topY - 0.5, width + 1, height + 1);
  ctx.restore();
}

function drawEnemyAwarenessDebug(enemy) {
  if (!TEST_MODE || !showMonsterArea || !enemy.alive) return;
  const centerX = enemy.x + enemy.width / 2;
  const feetY = enemy.y + enemy.height;

  ctx.save();
  ctx.setLineDash([10, 8]);

  ctx.fillStyle = "rgba(70, 220, 255, 0.035)";
  ctx.strokeStyle = "rgba(105, 225, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.fillRect(
    centerX - enemy.chaseRange,
    feetY - enemy.chaseVerticalRange,
    enemy.chaseRange * 2,
    enemy.chaseVerticalRange * 2,
  );
  ctx.strokeRect(
    centerX - enemy.chaseRange,
    feetY - enemy.chaseVerticalRange,
    enemy.chaseRange * 2,
    enemy.chaseVerticalRange * 2,
  );

  ctx.fillStyle = "rgba(144, 111, 255, 0.025)";
  ctx.strokeStyle = "rgba(176, 146, 255, 0.16)";
  ctx.fillRect(
    centerX - enemy.climbSearchRange,
    feetY - enemy.climbVerticalRange,
    enemy.climbSearchRange * 2,
    enemy.climbVerticalRange - enemy.climbMinimumHeight,
  );
  ctx.strokeRect(
    centerX - enemy.climbSearchRange,
    feetY - enemy.climbVerticalRange,
    enemy.climbSearchRange * 2,
    enemy.climbVerticalRange - enemy.climbMinimumHeight,
  );

  ctx.setLineDash([5, 5]);
  ctx.fillStyle = "rgba(255, 73, 83, 0.06)";
  ctx.strokeStyle = "rgba(255, 104, 111, 0.32)";
  ctx.fillRect(
    centerX - enemy.jumpAttackRange,
    feetY - enemy.jumpAttackVerticalRange,
    enemy.jumpAttackRange * 2,
    enemy.jumpAttackVerticalRange * 2,
  );
  ctx.strokeRect(
    centerX - enemy.jumpAttackRange,
    feetY - enemy.jumpAttackVerticalRange,
    enemy.jumpAttackRange * 2,
    enemy.jumpAttackVerticalRange * 2,
  );
  ctx.restore();
}

function drawEnemy(enemy) {
  const sprite = enemySprites[enemy.kind];
  const bottomY = enemy.y + enemy.height;
  const movementRate = enemy.moving ? 9 : 5.5;
  const wobble = Math.sin(enemy.animationTime * movementRate + enemy.animationPhase);
  const counterWobble = Math.sin(
    enemy.animationTime * (movementRate * 0.63) + enemy.animationPhase * 1.7,
  );
  let scaleX = 1 + wobble * (enemy.moving ? 0.085 : 0.045);
  let scaleY = 1 - wobble * (enemy.moving ? 0.065 : 0.035);
  let skewX = counterWobble * (enemy.moving ? 0.055 : 0.025);
  let rotation = counterWobble * (enemy.moving ? 0.035 : 0.018);
  const hitPulse = enemy.hitDuration > 0
    ? Math.pow(Math.max(0, enemy.hitTimer / enemy.hitDuration), 0.55)
    : 0;

  if (hitPulse > 0) {
    scaleX *= 1 - hitPulse * 0.22;
    scaleY *= 1 + hitPulse * 0.11;
    rotation += enemy.hitDirection * hitPulse * 0.085;
  }

  if (enemy.state === "windup") {
    const progress = 1 - Math.max(0, enemy.stateTimer / enemy.jumpWindupDuration);
    scaleX *= 1.12 + progress * 0.12;
    scaleY *= 0.86 - progress * 0.08;
    skewX *= 0.35;
  } else if (enemy.state === "jump") {
    scaleX *= 0.86;
    scaleY *= 1.17;
    rotation += Math.sign(enemy.jumpVx) * 0.055;
  } else if (enemy.state === "recover") {
    const progress = Math.max(0, enemy.stateTimer / enemy.jumpRecoveryDuration);
    scaleX *= 1.12 + progress * 0.1;
    scaleY *= 0.88 - progress * 0.06;
  }

  ctx.save();
  ctx.translate(enemy.x + enemy.width / 2, bottomY);
  ctx.translate(enemy.hitDirection * hitPulse * 4, 0);
  ctx.fillStyle = "rgba(72, 255, 48, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, -1, enemy.width * 0.55, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(rotation);
  ctx.transform(enemy.facing * scaleX, 0, enemy.facing * skewX, scaleY, 0, 0);

  if (sprite?.loaded && sprite.image.naturalWidth && sprite.image.naturalHeight) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (hitPulse > 0) ctx.filter = "brightness(1.65) saturate(1.35)";
    ctx.shadowColor = "rgba(101, 255, 44, 0.48)";
    ctx.shadowBlur = 8;
    ctx.drawImage(
      sprite.image,
      -enemy.spriteWidth / 2,
      -enemy.spriteHeight + enemy.spriteBottomOffset,
      enemy.spriteWidth,
      enemy.spriteHeight,
    );
  } else {
    const gradient = ctx.createRadialGradient(-8, -42, 3, 0, -30, 44);
    gradient.addColorStop(0, "#b7ff6a");
    gradient.addColorStop(0.3, "#34d728");
    gradient.addColorStop(1, "#21123c");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, -enemy.height / 2, enemy.width / 2, enemy.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawCombatantHealthBar(
    enemy.x + enemy.width / 2,
    bottomY - enemy.spriteHeight + enemy.spriteBottomOffset - 13,
    Math.max(48, Math.min(64, enemy.spriteWidth * 0.54)),
    enemy.hp,
    enemy.maxHp,
  );
}

function drawTurret(turret) {
  const bottomY = turret.y + turret.height;
  const charge = turret.active && turret.fireTimer <= TURRET.chargeDuration
    ? Math.max(0, Math.min(1, 1 - turret.fireTimer / TURRET.chargeDuration))
    : 0;
  const recoil = Math.max(0, turret.recoilTimer / 0.2);
  const hitPulse = Math.max(0, turret.hitTimer / 0.18);
  const pulse = 0.72 + Math.sin(gameTime * 19 + turret.animationPhase) * 0.28;

  ctx.save();
  ctx.translate(
    turret.x + turret.width / 2 - turret.facing * recoil * 5,
    bottomY,
  );
  ctx.scale(turret.facing, 1);
  ctx.shadowColor = charge > 0 ? "rgba(183, 48, 255, 0.9)" : "rgba(119, 29, 164, 0.52)";
  ctx.shadowBlur = 8 + charge * 18;
  if (hitPulse > 0) ctx.filter = "brightness(1.8) saturate(1.35)";

  if (
    turretSprite.loaded &&
    turretSprite.image.naturalWidth &&
    turretSprite.image.naturalHeight
  ) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      turretSprite.image,
      -TURRET.spriteWidth / 2,
      -TURRET.spriteHeight + TURRET.spriteBottomOffset,
      TURRET.spriteWidth,
      TURRET.spriteHeight,
    );
  } else {
    ctx.fillStyle = "#351343";
    ctx.fillRect(-turret.width / 2, -turret.height, turret.width, turret.height);
    ctx.fillStyle = "#b735e8";
    ctx.fillRect(0, -turret.height * 0.82, turret.width * 0.62, 13);
  }
  ctx.restore();

  drawCombatantHealthBar(
    turret.x + turret.width / 2,
    bottomY - TURRET.spriteHeight + TURRET.spriteBottomOffset - 13,
    Math.max(58, Math.min(72, TURRET.spriteWidth * 0.72)),
    turret.hp,
    turret.maxHp,
  );

  if (charge <= 0) return;
  const muzzle = turretMuzzlePosition(turret);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "#a71cff";
  ctx.shadowBlur = 15 + charge * 28;
  ctx.fillStyle = `rgba(119, 20, 184, ${0.42 + charge * 0.38})`;
  ctx.beginPath();
  ctx.arc(muzzle.x, muzzle.y, 5 + charge * 9 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(221, 116, 255, ${0.3 + charge * 0.55})`;
  ctx.lineWidth = 2;
  for (let ring = 0; ring < 2; ring += 1) {
    const ringRadius = 10 + ring * 9 + (1 - charge) * 13;
    ctx.beginPath();
    ctx.arc(muzzle.x, muzzle.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMidBoss(boss) {
  const centerX = boss.x + boss.width / 2;
  const centerY = boss.y + boss.height / 2;
  const charge = boss.active && boss.fireTimer < 0.45
    ? 1 - boss.fireTimer / 0.45
    : 0;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(boss.facing, 1);
  ctx.shadowColor = "rgba(255, 61, 207, 0.72)";
  ctx.shadowBlur = 14 + charge * 14;
  const bodyGradient = ctx.createRadialGradient(-14, -18, 6, 0, 0, 62);
  bodyGradient.addColorStop(0, "#d58aff");
  bodyGradient.addColorStop(0.5, "#7c3b94");
  bodyGradient.addColorStop(1, "#25152e");
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, boss.width * 0.47, boss.height * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#e3a9ff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#120b18";
  ctx.beginPath();
  ctx.ellipse(8, -16, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe9ff";
  ctx.beginPath();
  ctx.arc(13, -18, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff45d4";
  ctx.beginPath();
  ctx.arc(15, -18, 2.5, 0, Math.PI * 2);
  ctx.fill();

  const mouthX = boss.width * 0.36;
  const mouthY = boss.height * 0.08;
  ctx.fillStyle = "#09050d";
  ctx.beginPath();
  ctx.arc(mouthX, mouthY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "#ff64e3";
  ctx.shadowBlur = 8 + charge * 22;
  ctx.fillStyle = charge > 0 ? "#fff0ff" : "#ff52d7";
  ctx.beginPath();
  ctx.arc(mouthX + 2, mouthY, 4 + charge * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const healthWidth = boss.width;
  ctx.fillStyle = "rgba(9, 5, 13, 0.88)";
  ctx.fillRect(centerX - healthWidth / 2, boss.y - 17, healthWidth, 8);
  ctx.fillStyle = "#ff4dcc";
  ctx.fillRect(
    centerX - healthWidth / 2 + 2,
    boss.y - 15,
    (healthWidth - 4) * Math.max(0, boss.hp / boss.maxHp),
    4,
  );
}

function drawProjectiles() {
  for (const bullet of bullets) {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.lineCap = "round";
    ctx.shadowColor = "#ad7bff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(173, 123, 255, 0.55)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(13, 0);
    ctx.stroke();
    ctx.shadowBlur = 5;
    ctx.strokeStyle = "#c9a7ff";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f4eaff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  for (const bullet of enemyBullets) {
    if (bullet.kind === "turret-laser") {
      const pulse = 0.86 + Math.sin(gameTime * 28) * 0.14;
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#7512ad";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(52, 3, 78, 0.92)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
      ctx.fill();
      const orb = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
      orb.addColorStop(0, "#fff3ff");
      orb.addColorStop(0.24, "#e293ff");
      orb.addColorStop(0.58, "#9b2bdd");
      orb.addColorStop(1, "#380752");
      ctx.shadowBlur = 11;
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(237, 180, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 13.5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (bullet.kind === "boss-laser") {
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
      ctx.lineCap = "round";
      ctx.shadowColor = "#ff42db";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(255, 61, 215, 0.48)";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.shadowBlur = 8;
      ctx.strokeStyle = "#ff69e2";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff0ff";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.fillStyle = "#ff3d24";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffbd52";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    if (particle.lightImpact) {
      const progress = 1 - Math.max(0, particle.life / particle.maxLife);
      const radius = particle.size * (0.42 + progress * 0.82);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 24 * (1 - progress);
      const flash = ctx.createRadialGradient(
        particle.x,
        particle.y,
        1,
        particle.x,
        particle.y,
        radius,
      );
      flash.addColorStop(0, "rgba(255, 239, 255, 0.98)");
      flash.addColorStop(0.28, "rgba(210, 91, 255, 0.76)");
      flash.addColorStop(1, "rgba(73, 4, 106, 0)");
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(226, 137, 255, ${0.82 * (1 - progress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (particle.shard) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(Math.atan2(particle.vy, particle.vx));
      ctx.fillRect(-particle.size, -particle.size * 0.3, particle.size * 2, particle.size * 0.6);
      ctx.restore();
    } else {
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawWorld() {
  ctx.save();
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  ctx.translate(-cameraX + shakeX, -cameraY + shakeY);
  drawTerrain();
  if (TEST_MODE && showMonsterArea) {
    for (const enemy of enemies) {
      if (
        enemy.alive &&
        enemy.x > cameraX - 100 &&
        enemy.x < cameraX + WIDTH + 100 &&
        enemy.y > cameraY - 100 &&
        enemy.y < cameraY + HEIGHT + 100
      ) drawEnemyAwarenessDebug(enemy);
    }
  }
  for (const turret of turrets) {
    if (
      turret.alive &&
      turret.x + turret.width > cameraX - 120 &&
      turret.x < cameraX + WIDTH + 120 &&
      turret.y + turret.height > cameraY - 120 &&
      turret.y < cameraY + HEIGHT + 120
    ) drawTurret(turret);
  }
  for (const enemy of enemies) {
    if (
      enemy.alive &&
      enemy.x > cameraX - 100 &&
      enemy.x < cameraX + WIDTH + 100 &&
      enemy.y > cameraY - 100 &&
      enemy.y < cameraY + HEIGHT + 100
    ) drawEnemy(enemy);
  }
  for (const boss of midBosses) {
    if (
      boss.alive &&
      boss.x + boss.width > cameraX - 140 &&
      boss.x < cameraX + WIDTH + 140 &&
      boss.y + boss.height > cameraY - 140 &&
      boss.y < cameraY + HEIGHT + 140
    ) drawMidBoss(boss);
  }
  drawPlayer();
  drawPlayerPhysicsDebug();
  drawProjectiles();
  drawParticles();
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(22, 22, WIDTH - 44, 74);
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, WIDTH - 44, 74);

  ctx.fillStyle = "#f5b722";
  ctx.font = "700 22px Arial";
  ctx.fillText("NOVA", 40, 51);
  ctx.fillStyle = "#fff";
  ctx.font = "700 18px Arial";
  ctx.fillText(String(player.score).padStart(6, "0"), 40, 78);

  ctx.textAlign = "right";
  ctx.fillStyle = "#aaa";
  ctx.font = "700 13px Arial";
  const routeArrow = player.platform?.direction < 0 ? "←" : "→";
  ctx.fillText(`MISSION 01  ${routeArrow}`, WIDTH - 40, 49);
  ctx.fillStyle = "#fff";
  ctx.font = "700 22px Arial";
  ctx.fillText("♥".repeat(Math.max(0, player.hp)), WIDTH - 40, 79);
  ctx.textAlign = "left";

  if (player.x < 250 && gameTime < 6) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 15px Arial";
    ctx.fillText("MOVE  ← →   ·   JUMP  ↑ / SPACE   ·   FIRE  J", WIDTH / 2, 132);
    ctx.fillText("CROUCH  ↓ / S", WIDTH / 2, 156);
    ctx.textAlign = "left";
  }

  if (
    goalPlatform &&
    player.platform === goalPlatform &&
    Math.abs(player.x + player.width / 2 - goalX) < 180
  ) {
    drawOverlay("MISSION COMPLETE", "전진 완료");
  }

  if (gameOver) drawOverlay("GAME OVER", "화면을 눌러 재시작");
}

function drawOverlay(title, subtitle) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f5b722";
  ctx.font = "700 48px Impact, sans-serif";
  ctx.fillText(title, WIDTH / 2, HEIGHT * 0.43);
  ctx.fillStyle = "#fff";
  ctx.font = "700 18px Arial";
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT * 0.49);
  ctx.textAlign = "left";
}
