"use strict";

// Background, terrain, characters, projectiles, and HUD rendering.

const PIXEL_ART_GRID = 2;

function pixelSnap(value, grid = PIXEL_ART_GRID) {
  return Math.round(value / grid) * grid;
}

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
  const first = Math.max(0, Math.floor((cameraX - 48 - platform.start) / panelWidth));
  const last = Math.min(
    Math.ceil((platform.end - platform.start) / panelWidth) - 1,
    Math.floor((cameraX + WIDTH + 48 - platform.start) / panelWidth),
  );
  const y = pixelSnap(platform.y + 3);

  for (let panel = first; panel <= last; panel += 1) {
    const start = platform.start + panel * panelWidth;
    const width = Math.min(panelWidth, platform.end - start);
    if (width < 16) continue;
    const x = pixelSnap(start);
    ctx.fillStyle = palette[panel % 2];
    ctx.fillRect(x + 2, y, width - 4, thickness);
    ctx.fillStyle = "#0a131b";
    ctx.fillRect(x, y + 2, 2, thickness - 2);
    ctx.fillRect(x + width - 2, y + 2, 2, thickness - 2);
    ctx.fillStyle = "#526878";
    ctx.fillRect(x + 6, y + 2, 10, 2);
    ctx.fillRect(x + width - 16, y + 2, 10, 2);
    ctx.fillStyle = "#080e15";
    ctx.fillRect(x + 10, y + 7, 4, 2);
    ctx.fillRect(x + width - 14, y + 7, 4, 2);

    if (platform.style === 0) {
      ctx.fillStyle = "#324856";
      if (width >= 64) ctx.fillRect(x + 24, y + 5, width - 48, 2);
      ctx.fillStyle = "#101a23";
      ctx.fillRect(x + Math.floor(width / 2) - 2, y + 3, 4, 8);
    } else if (platform.style === 1) {
      ctx.fillStyle = "#46515c";
      for (let mark = 20; mark < width - 16; mark += 20) {
        ctx.fillRect(x + mark, y + (mark % 40 === 0 ? 6 : 4), 8, 2);
      }
    } else {
      ctx.fillStyle = "#315765";
      if (width >= 56) {
        ctx.fillRect(x + 24, y + 4, 4, 6);
        ctx.fillRect(x + width - 28, y + 4, 4, 6);
      }
      if (width >= 72) ctx.fillRect(x + 32, y + 8, width - 64, 2);
    }
  }
}

function drawRoadPixelTexture(platform, palette, isSubPath = false) {
  const tileWidth = 32;
  const first = Math.max(0, Math.floor((cameraX - 40 - platform.start) / tileWidth));
  const last = Math.min(
    Math.ceil((platform.end - platform.start) / tileWidth) - 1,
    Math.floor((cameraX + WIDTH + 40 - platform.start) / tileWidth),
  );
  for (let tile = first; tile <= last; tile += 1) {
    const start = platform.start + tile * tileWidth;
    const x = pixelSnap(start);
    const y = pixelSnap(platformSurfaceY(platform, start + 16));
    const wear = platformFeatureNoise(platform, tile * 37 + 19);
    ctx.fillStyle = palette[2];
    ctx.fillRect(x + 4, y + 8, 6, 2);
    ctx.fillRect(x + 24, y + 5, 4, 2);
    ctx.fillStyle = palette[0];
    ctx.fillRect(x + 12, y + 4, wear > 0.58 ? 8 : 4, 2);
    if (wear > 0.68) {
      ctx.fillStyle = isSubPath ? "#a286d0" : "#6eafbd";
      ctx.fillRect(x + 20, y + 6, 4, 2);
    }
  }
}

function drawPixelRoadRail(platform, railColor, isSubPath = false) {
  const highlight = isSubPath ? "#c9aeff" : "#69e2ee";
  const visibleStart = Math.max(platform.start, cameraX - 16);
  const visibleEnd = Math.min(platform.end, cameraX + WIDTH + 16);
  if (visibleEnd <= visibleStart) return;
  if (platform.kind === "flat") {
    const y = pixelSnap(platform.y);
    ctx.fillStyle = railColor;
    ctx.fillRect(visibleStart, y - 4, visibleEnd - visibleStart, 4);
    ctx.fillStyle = highlight;
    ctx.fillRect(visibleStart, y - 2, visibleEnd - visibleStart, 2);
    ctx.fillStyle = "#0c161e";
    const firstNotch = Math.max(0, Math.floor((visibleStart - platform.start) / 48));
    for (let notch = firstNotch; platform.start + notch * 48 < visibleEnd; notch += 1) {
      const x = pixelSnap(platform.start + notch * 48 + 36);
      if (x + 4 <= platform.end) ctx.fillRect(x, y - 2, 4, 2);
    }
    return;
  }

  const blockWidth = 8;
  const first = Math.max(0, Math.floor((visibleStart - platform.start) / blockWidth));
  const last = Math.min(
    Math.ceil((platform.end - platform.start) / blockWidth) - 1,
    Math.floor((visibleEnd - platform.start) / blockWidth),
  );
  for (let block = first; block <= last; block += 1) {
    const x = platform.start + block * blockWidth;
    const width = Math.min(blockWidth, platform.end - x);
    const y = pixelSnap(platformSurfaceY(platform, x + width / 2));
    ctx.fillStyle = railColor;
    ctx.fillRect(x, y - 4, width, 4);
    if (block % 6 !== 5) {
      ctx.fillStyle = highlight;
      ctx.fillRect(x, y - 2, width, 2);
    }
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
    const lightX = pixelSnap(x);
    const lightY = pixelSnap(platform.y);
    ctx.save();
    ctx.fillStyle = "#05090e";
    ctx.fillRect(lightX - 8, lightY + 4, 16, 8);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(lightX - 7.5, lightY + 4.5, 15, 7);
    ctx.globalAlpha = pulse * 0.2;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(lightX - 9, lightY + 5, 18, 6);
    ctx.globalAlpha = pulse * 0.46;
    ctx.fillRect(lightX - 7, lightY + 6, 14, 4);
    ctx.globalAlpha = pulse;
    ctx.fillRect(lightX - 5, lightY + 7, 10, 2);
    ctx.fillRect(lightX - 2, lightY - 4, 4, 2);
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
    ctx.translate(pixelSnap(x), pixelSnap(y));
    ctx.rotate(angle);
    ctx.fillStyle = "#05090e";
    ctx.fillRect(-8, 4, 16, 7);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7.5, 4.5, 15, 6);
    ctx.globalAlpha = pulse * 0.22;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(-9, 5, 18, 5);
    ctx.globalAlpha = pulse;
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
  const points = electricWirePoints(platform, feature);
  const anchor = points[0];
  const tip = points[points.length - 1];
  const frame = Math.floor(gameTime * 21);
  const discharge = platformFeatureNoise(platform, feature.seed + frame + 520);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(2, 5, 8, 0.9)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = ELECTRIC_WIRE_RADIUS * 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#11181e";
  ctx.fillRect(anchor.x - 8, anchor.y - 6, 16, 13);
  ctx.strokeStyle = "#d8e4e8";
  ctx.lineWidth = 2;
  ctx.strokeRect(anchor.x - 7, anchor.y - 5, 14, 11);
  ctx.fillStyle = "#8df7ff";
  ctx.fillRect(anchor.x - 2, anchor.y - 2, 4, 4);
  ctx.fillStyle = "#f2d69b";
  ctx.fillRect(pixelSnap(tip.x - 2, 1), pixelSnap(tip.y - 2, 1), 4, 5);
  ctx.restore();

  if (discharge > 0.3) {
    drawPlatformElectricArc(
      platform,
      feature,
      tip.x,
      tip.y,
      tip.x + (discharge - 0.5) * 28,
      tip.y + 8 + discharge * 12,
      610,
      "#e7fdff",
    );
    if (discharge > 0.72) {
      drawPlatformElectricArc(
        platform,
        feature,
        tip.x,
        tip.y,
        tip.x - 14,
        tip.y + 5,
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
  ctx.fillStyle = palette[1];
  ctx.beginPath();
  ctx.moveTo(platform.entryX, platform.entryY);
  ctx.lineTo(platform.exitX, platform.exitY);
  ctx.lineTo(bottomExitX, platform.exitY + PLATFORM_DECK_THICKNESS);
  ctx.lineTo(bottomEntryX, platform.entryY + PLATFORM_DECK_THICKNESS);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawRoadPixelTexture(platform, palette, platform.routeRole === "sub");
  ctx.restore();

  ctx.strokeStyle = palette[0];
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(platform.entryX, platform.entryY + 3);
  ctx.lineTo(platform.exitX, platform.exitY + 3);
  ctx.stroke();
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bottomEntryX, platform.entryY + PLATFORM_DECK_THICKNESS - 2);
  ctx.lineTo(bottomExitX, platform.exitY + PLATFORM_DECK_THICKNESS - 2);
  ctx.stroke();

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

  drawPixelRoadRail(platform, railColor, platform.routeRole === "sub");

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
  ctx.fillStyle = palette[1];
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(platform.end, platform.y);
  ctx.lineTo(centerX, apexY);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(platform.end, platform.y);
  ctx.lineTo(centerX, apexY);
  ctx.closePath();
  ctx.clip();
  for (let bandY = pixelSnap(platform.y + 8); bandY < apexY; bandY += 10) {
    const band = Math.floor((bandY - platform.y) / 10);
    ctx.fillStyle = band % 2 === 0 ? palette[0] : palette[2];
    ctx.globalAlpha = 0.32;
    ctx.fillRect(platform.start, bandY, platform.end - platform.start, 4);
  }
  ctx.globalAlpha = 1;
  drawRoadPixelTexture(platform, palette, platform.routeRole === "sub");
  ctx.restore();

  ctx.strokeStyle = "rgba(102, 139, 157, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(platform.start, platform.y);
  ctx.lineTo(centerX, apexY);
  ctx.lineTo(platform.end, platform.y);
  ctx.stroke();

  drawPixelRoadRail(platform, railColor, platform.routeRole === "sub");

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
    let platformBottomY = platform.kind === "flat"
      ? platform.y + (
        isInvertedTrianglePlatform(platform)
          ? invertedTrianglePlatformDepth(platform)
          : PLATFORM_DECK_THICKNESS
      )
      : Math.max(platform.entryY, platform.exitY) + PLATFORM_DECK_THICKNESS;
    if (platform.features?.some((feature) => feature.type === "electric-hose")) {
      platformBottomY = Math.max(platformBottomY, platform.y + ELECTRIC_WIRE_MAX_DROP);
    }
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
    const joinedAtStart = platformHasJoinedEndpoint(platform, platform.start, platform.y);
    const joinedAtEnd = platformHasJoinedEndpoint(platform, platform.end, platform.y);
    ctx.fillStyle = palette[1];
    traceFlatPlatformBody(platform, joinedAtStart, joinedAtEnd);
    ctx.fill();

    ctx.save();
    traceFlatPlatformBody(platform, joinedAtStart, joinedAtEnd);
    ctx.clip();
    ctx.fillStyle = palette[0];
    ctx.fillRect(
      platform.start,
      pixelSnap(platform.y + 2),
      platform.end - platform.start,
      4,
    );
    ctx.fillStyle = palette[2];
    ctx.fillRect(
      platform.start,
      pixelSnap(platform.y + PLATFORM_DECK_THICKNESS - 4),
      platform.end - platform.start,
      4,
    );
    drawStationPanels(platform);
    drawRoadPixelTexture(platform, palette, isSubPath);
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
    drawPixelRoadRail(platform, isSubPath ? "#8873ad" : railColors[platform.style], isSubPath);
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
  const blinking = player.downPhase === "hold" || (!player.downPhase && player.invincible > 0);
  const blinkTime = player.downPhase === "hold"
    ? player.downTime - PLAYER_DOWN_ANIMATION_DURATION : gameTime;
  ctx.save();
  // Dim rather than disappear completely, keeping the character easy to locate.
  if (blinking && Math.floor(blinkTime * 10) % 2 !== 0) ctx.globalAlpha *= 0.28;
  const spriteTopY = drawPlayerSprite(player.x + player.width / 2);
  ctx.restore();
  drawPlayerFireEnergyGauge(spriteTopY);
}

function drawPlayerFireEnergyGauge(spriteTopY) {
  const width = 56;
  const height = 8;
  const left = pixelSnap(player.x + player.width / 2 - width / 2, 1);
  const top = pixelSnap(spriteTopY - 18, 1);
  const ratio = Math.max(0, Math.min(1, player.fireEnergy / PLAYER_FIRE_ENERGY_MAX));
  const filledWidth = Math.round((width - 4) * ratio);

  ctx.save();
  ctx.fillStyle = "rgba(14, 6, 27, 0.9)";
  ctx.fillRect(left - 3, top - 3, width + 6, height + 6);
  ctx.fillStyle = "#7145a2";
  ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
  ctx.fillStyle = "#241331";
  ctx.fillRect(left, top, width, height);
  if (filledWidth > 0) {
    ctx.fillStyle = "#a653f5";
    ctx.fillRect(left + 2, top + 2, filledWidth, 4);
    ctx.fillStyle = "#e6b5ff";
    ctx.fillRect(left + 2, top + 2, filledWidth, 2);
  }
  ctx.restore();
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
  const isDownPose = Boolean(player.downPhase);
  const isRunning = Math.abs(player.vx) > 1;
  const isJumping = !player.grounded;
  const isDeepFalling = isJumping && player.deepFalling;
  const isFiring = controls.fire && (
    player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT || player.fireTimer > 0
  );
  const isCrouching = player.crouching && player.grounded;
  const isAimingHigh = playerIsAimingHigh();
  const sprite = isDownPose
    ? playerSprites.down
    : isCrouching && isFiring
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
  if (!sprite?.loaded || !sprite.image.naturalWidth || !sprite.image.naturalHeight) {
    return player.y + player.height - PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_STAND_SPRITE_SCALE;
  }

  const jumpProgress = Math.min(1, player.jumpAnimationTime / JUMP_ANIMATION_DURATION);
  const frame = isDownPose
    ? Math.min(sprite.frames.length - 1, Math.floor(player.downTime * sprite.fps))
    : isFiring
      ? Math.floor(player.fireAnimationTime * sprite.fps) % sprite.frames.length
      : isDeepFalling
        ? Math.floor(player.fallAnimationTime * sprite.fps) % sprite.frames.length
        : isJumping
          ? Math.min(sprite.frames.length - 1, Math.floor(jumpProgress * sprite.frames.length))
          : Math.floor(gameTime * sprite.fps) % sprite.frames.length;
  const source = sprite.frames[frame];
  const spriteScale = sprite === playerSprites.down
    ? PLAYER_DOWN_SPRITE_SCALE
    : sprite === playerSprites.stand
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
  return feetY - drawHeight;
}

function drawCombatantHealthBar(centerX, topY, width, hp, maxHp) {
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const colorHue = Math.round(ratio * 120);
  const height = 7;
  const left = pixelSnap(centerX - width / 2, 1);
  const barTop = pixelSnap(topY, 1);

  ctx.save();
  ctx.fillStyle = "rgba(4, 7, 10, 0.88)";
  ctx.fillRect(left - 2, barTop - 2, width + 4, height + 4);
  ctx.fillStyle = "rgba(33, 38, 43, 0.94)";
  ctx.fillRect(left, barTop, width, height);
  ctx.fillStyle = `hsl(${colorHue}, 92%, 52%)`;
  ctx.fillRect(left, barTop, pixelSnap(width * ratio, 1), height);
  ctx.strokeStyle = "rgba(220, 231, 239, 0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(left - 0.5, barTop - 0.5, width + 1, height + 1);
  ctx.restore();
}

function drawCombatantPhysicsDebug(target, color) {
  if (!TEST_MODE || !showMonsterArea || !target.alive) return;
  const hitbox = target.kind === "monster1" || target.kind === "monster2"
    ? getEnemyHitbox(target) : target;
  if (
    hitbox.x + hitbox.width < cameraX - 24 ||
    hitbox.x > cameraX + WIDTH + 24 ||
    hitbox.y + hitbox.height < cameraY - 24 ||
    hitbox.y > cameraY + HEIGHT + 24
  ) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.11;
  ctx.fillRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
  ctx.restore();
}

function drawEnemyAwarenessDebug(enemy) {
  if (!TEST_MODE || !showMonsterArea || !enemy.alive) return;
  const centerX = enemy.x + enemy.width / 2;
  const feetY = enemy.y + enemy.height;

  ctx.save();
  if (enemy.kind === "monster2") {
    const direction = (enemy.state === "inhale" || enemy.state === "shoot"
      ? enemy.attackDirection : enemy.facing) || -1;
    const origin = monster2AttackOrigin(enemy);
    const radius = enemy.fireballRadius;
    ctx.setLineDash([8, 6]);
    ctx.fillStyle = "rgba(255, 91, 43, 0.055)";
    ctx.strokeStyle = "rgba(255, 126, 64, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let step = 0; step <= 12; step += 1) {
      const distance = enemy.fireballRange * step / 12;
      const flightTime = distance / enemy.fireballSpeed;
      const centerY = origin.y - enemy.fireballRiseAcceleration * flightTime * flightTime / 2;
      const spread = radius + distance * 0.06;
      const x = origin.x + direction * distance;
      if (step === 0) ctx.moveTo(x, centerY - spread);
      else ctx.lineTo(x, centerY - spread);
    }
    for (let step = 12; step >= 0; step -= 1) {
      const distance = enemy.fireballRange * step / 12;
      const flightTime = distance / enemy.fireballSpeed;
      const centerY = origin.y - enemy.fireballRiseAcceleration * flightTime * flightTime / 2;
      const spread = radius + distance * 0.06;
      ctx.lineTo(origin.x + direction * distance, centerY + spread);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
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

function drawMonster2Charge(enemy) {
  const origin = monster2AttackOrigin(enemy);
  const direction = enemy.attackDirection || enemy.facing || -1;
  const progress = Math.max(0, Math.min(1, 1 - enemy.stateTimer / enemy.inhaleDuration));
  const pulse = 0.9 + Math.sin(gameTime * 12 + enemy.animationPhase) * 0.1;
  ctx.save();
  ctx.translate(pixelSnap(origin.x), pixelSnap(origin.y));
  ctx.scale(direction, 1);
  ctx.globalCompositeOperation = "lighter";

  // Fixed-size procedural effects: inward streaks and a tightening charge ring.
  for (let mote = 0; mote < 12; mote += 1) {
    const phase = (gameTime * 2.6 + mote / 12 + enemy.animationPhase) % 1;
    const distance = (1 - phase) * (64 + progress * 30 + mote % 4 * 12);
    const y = Math.sin(mote * 2.7 + gameTime * 5) * (1 - phase) * (22 + progress * 12);
    const size = phase > 0.7 ? 4 : 3;
    ctx.globalAlpha = 0.3 + phase * 0.4 + progress * 0.2;
    ctx.fillStyle = mote % 2 === 0 ? "#f09bff" : "#ffc16a";
    ctx.fillRect(pixelSnap(distance), pixelSnap(y), size, size);
    ctx.globalAlpha *= 0.4;
    ctx.fillRect(pixelSnap(distance + 5), pixelSnap(y + 1), 7, 2);
  }
  const ringRadius = 34 - progress * 15;
  ctx.globalAlpha = (0.35 + progress * 0.45) * pulse;
  ctx.fillStyle = "#ffac62";
  for (let segment = 0; segment < 12; segment += 1) {
    const angle = segment * Math.PI / 6 + gameTime * 0.7;
    ctx.fillRect(pixelSnap(Math.cos(angle) * ringRadius - 2), pixelSnap(Math.sin(angle) * ringRadius - 2), 4, 4);
  }
  const radius = pixelSnap((8 + progress * 9) * pulse);
  ctx.globalAlpha = 0.62 + progress * 0.3;
  ctx.shadowColor = "#ff762f";
  ctx.shadowBlur = 8 + progress * 10;
  ctx.fillStyle = "#ff7835";
  ctx.fillRect(-radius, -pixelSnap(radius * 0.6), radius * 2, pixelSnap(radius * 1.2));
  ctx.fillRect(-pixelSnap(radius * 0.6), -radius, pixelSnap(radius * 1.2), radius * 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffd76c";
  const core = Math.max(4, pixelSnap(radius * 1.05));
  ctx.fillRect(-core / 2, -core / 2, core, core);
  ctx.fillStyle = "#fff6d8";
  const hotCore = Math.max(2, pixelSnap(core * 0.45));
  ctx.fillRect(-hotCore / 2, -hotCore / 2, hotCore, hotCore);
  ctx.restore();
}

function drawMonster2Attack(enemy) {
  if (enemy.kind !== "monster2") return;
  if (enemy.state === "inhale") {
    drawMonster2Charge(enemy);
    return;
  }
  if (enemy.state !== "shoot" || enemy.fireRecoilTimer <= 0) return;
  const origin = monster2AttackOrigin(enemy);
  const direction = enemy.attackDirection || enemy.facing || -1;
  ctx.save();
  ctx.translate(pixelSnap(origin.x), pixelSnap(origin.y));
  ctx.scale(direction, 1);
  ctx.globalCompositeOperation = "lighter";
  const recoil = enemy.fireRecoilTimer / 0.12;
  ctx.globalAlpha = recoil;
  drawPixelFireballDisk(7 + recoil * 5, "#ff9b3b");
  drawPixelFireballDisk(4, "#fff4b2");
  for (let spark = 0; spark < 6; spark += 1) {
    const angle = spark * Math.PI / 3;
    const distance = 12 + (1 - recoil) * 14;
    ctx.fillRect(pixelSnap(Math.cos(angle) * distance), pixelSnap(Math.sin(angle) * distance), 3, 3);
  }
  ctx.restore();
}

function drawEnemy(enemy) {
  const sprite = enemySprites[enemy.kind];
  const bottomY = enemy.y + enemy.height;
  const isMonster2 = enemy.kind === "monster2";
  const pose = enemySpritePose(enemy);

  ctx.save();
  ctx.translate(
    pose.centerX,
    pose.feetY,
  );
  ctx.translate(pose.hitOffsetX, 0);
  ctx.fillStyle = "rgba(72, 255, 48, 0.08)";
  ctx.fillRect(-pixelSnap(enemy.width * 0.55), -6, pixelSnap(enemy.width * 1.1), 6);
  ctx.fillStyle = "rgba(72, 255, 48, 0.18)";
  ctx.fillRect(-pixelSnap(enemy.width * 0.42), -4, pixelSnap(enemy.width * 0.84), 4);
  const spriteDirection = enemy.facing * (enemy.spriteFacing ?? 1);
  ctx.transform(spriteDirection * pose.scaleX, 0, 0, pose.scaleY, 0, 0);

  if (sprite?.loaded && sprite.image.naturalWidth && sprite.image.naturalHeight) {
    ctx.imageSmoothingEnabled = false;
    if (pose.hitPulse > 0) ctx.filter = "brightness(1.65) saturate(1.35)";
    ctx.drawImage(
      sprite.image,
      -enemy.spriteWidth / 2,
      -enemy.spriteHeight + enemy.spriteBottomOffset,
      enemy.spriteWidth,
      enemy.spriteHeight,
    );
  } else {
    ctx.fillStyle = "#21123c";
    ctx.fillRect(-enemy.width / 2, -enemy.height, enemy.width, enemy.height);
    ctx.fillStyle = "#34d728";
    ctx.fillRect(-enemy.width * 0.35, -enemy.height * 0.76, enemy.width * 0.7, enemy.height * 0.52);
    ctx.fillStyle = "#b7ff6a";
    ctx.fillRect(-8, -enemy.height * 0.68, 16, 12);
  }
  ctx.restore();
  if (isMonster2) drawMonster2Attack(enemy);
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
  const charge = turret.active && turret.burstShotsRemaining === 0 && turret.fireTimer <= TURRET.chargeDuration
    ? Math.max(0, Math.min(1, 1 - turret.fireTimer / TURRET.chargeDuration))
    : 0;
  const recoil = Math.max(0, turret.recoilTimer / 0.2);
  const hitPulse = Math.max(0, turret.hitTimer / 0.18);
  const pulse = 0.72 + Math.sin(gameTime * 19 + turret.animationPhase) * 0.28;

  ctx.save();
  ctx.translate(
    pixelSnap(turret.x + turret.width / 2 - turret.facing * recoil * 5),
    pixelSnap(bottomY),
  );
  ctx.scale(turret.facing, 1);
  if (hitPulse > 0) ctx.filter = "brightness(1.8) saturate(1.35)";

  if (
    turretSprite.loaded &&
    turretSprite.image.naturalWidth &&
    turretSprite.image.naturalHeight
  ) {
    ctx.imageSmoothingEnabled = false;
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

function drawPixelFireballDisk(radius, color, offsetX = 0, offsetY = 0) {
  ctx.fillStyle = color;
  const roundedRadius = Math.max(2, Math.round(radius / 2) * 2);
  for (let y = -roundedRadius; y < roundedRadius; y += 2) {
    const halfWidth = Math.max(2, Math.round(Math.sqrt(
      roundedRadius * roundedRadius - (y + 1) * (y + 1),
    ) / 2) * 2);
    ctx.fillRect(offsetX - halfWidth, offsetY + y, halfWidth * 2, 2);
  }
}

function drawMonster2Fireball(bullet) {
  if (
    bullet.x < cameraX - 80 || bullet.x > cameraX + WIDTH + 80 ||
    bullet.y < cameraY - 80 || bullet.y > cameraY + HEIGHT + 80
  ) return;
  ctx.save();
  ctx.translate(pixelSnap(bullet.x), pixelSnap(bullet.y));
  ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
  const pulse = 0.94 + Math.sin(gameTime * 24 + bullet.phase) * 0.06;
  const radius = bullet.radius * pulse;
  const fade = Math.max(0, Math.min(1, bullet.remainingRange / 165));
  ctx.globalAlpha = fade;
  ctx.shadowColor = "#ff7526";
  ctx.shadowBlur = 16;
  // Stepped, tapered flame stays attached to the hot head while the arc rises.
  for (let segment = 0; segment < 9; segment += 1) {
    const taper = segment / 8;
    const x = pixelSnap(-radius * 2.7 + radius * 1.9 * taper);
    const waviness = Math.sin(gameTime * 22 + bullet.phase + segment * 1.3) * (1 - taper) * 3;
    const halfHeight = Math.max(2, pixelSnap(radius * (0.12 + taper * 0.56)));
    ctx.fillStyle = segment < 3 ? "#d83b1f" : "#e64b21";
    ctx.fillRect(x, pixelSnap(waviness - halfHeight), 8, halfHeight * 2);
  }
  drawPixelFireballDisk(radius, "#e64b21", 2);
  ctx.shadowBlur = 0;
  for (let segment = 2; segment < 9; segment += 1) {
    const taper = segment / 8;
    const x = pixelSnap(-radius * 2.7 + radius * 1.9 * taper + 2);
    const waviness = Math.sin(gameTime * 22 + bullet.phase + segment * 1.3) * (1 - taper) * 3;
    const halfHeight = Math.max(2, pixelSnap(radius * (0.04 + taper * 0.31)));
    ctx.fillStyle = segment < 5 ? "#ff7625" : "#ff9b2e";
    ctx.fillRect(x, pixelSnap(waviness - halfHeight), 6, halfHeight * 2);
  }
  drawPixelFireballDisk(radius * 0.76, "#ff882a", 3);
  drawPixelFireballDisk(radius * 0.49, "#ffd45a", 6, -2);
  drawPixelFireballDisk(radius * 0.24, "#fff5c6", 8, -2);
  ctx.restore();
}

function drawProjectiles() {
  for (const bullet of bullets) {
    const shimmer = 0.9 + Math.sin(gameTime * 12 + bullet.x * 0.008 + bullet.y * 0.004) * 0.1;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.shadowColor = "#b35cff";
    ctx.shadowBlur = 20 * shimmer;
    ctx.strokeStyle = "rgba(181, 108, 255, 0.72)";
    ctx.lineWidth = 8.5 * shimmer;
    ctx.beginPath();
    ctx.moveTo(-19, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#c996ff";
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fffaff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(185, 124, 255, 0.42)";
    ctx.lineWidth = 2.25 * shimmer;
    ctx.beginPath();
    ctx.moveTo(-36, 0);
    ctx.lineTo(-20, 0);
    ctx.stroke();
    ctx.shadowBlur = 5;
    ctx.globalAlpha *= shimmer;
    ctx.fillStyle = "#eddaff";
    ctx.fillRect(-26, -5, 2, 2);
    ctx.fillRect(-34, 3, 2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(5, -1, 8, 2);
    ctx.fillRect(8, -4, 2, 8);
    ctx.restore();
  }

  for (const bullet of enemyBullets) {
    if (bullet.kind === "monster2-fireball") {
      drawMonster2Fireball(bullet);
      continue;
    }
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

function drawCombatExplosionFlash(particle) {
  const progress = 1 - Math.max(0, particle.life / particle.maxLife);
  const radius = particle.size * (0.22 + progress * 0.92);
  const coreSize = Math.max(2, particle.size * (1 - progress) * 0.55);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(1 - progress, 1.25);
  ctx.fillStyle = particle.color;
  const ringSize = Math.max(2, pixelSnap(8 * (1 - progress), 1));
  for (let segment = 0; segment < 24; segment += 1) {
    const angle = segment * Math.PI / 12;
    ctx.fillRect(
      pixelSnap(particle.x + Math.cos(angle) * radius - ringSize / 2),
      pixelSnap(particle.y + Math.sin(angle) * radius - ringSize / 2),
      ringSize,
      ringSize,
    );
  }
  ctx.fillStyle = "#ff973b";
  ctx.fillRect(
    pixelSnap(particle.x - coreSize * 0.7),
    pixelSnap(particle.y - coreSize * 0.35),
    pixelSnap(coreSize * 1.4),
    pixelSnap(coreSize * 0.7),
  );
  ctx.fillRect(
    pixelSnap(particle.x - coreSize * 0.35),
    pixelSnap(particle.y - coreSize * 0.7),
    pixelSnap(coreSize * 0.7),
    pixelSnap(coreSize * 1.4),
  );
  ctx.fillStyle = "#fff3bf";
  ctx.fillRect(
    pixelSnap(particle.x - coreSize * 0.3),
    pixelSnap(particle.y - coreSize * 0.3),
    Math.max(2, pixelSnap(coreSize * 0.6)),
    Math.max(2, pixelSnap(coreSize * 0.6)),
  );
  ctx.restore();
}

function drawOrganicDebris(particle) {
  const grounded = particle.groundDebris;
  const spread = grounded ? 1 - Math.pow(1 - particle.splatProgress, 3) : 0;
  const wobble = grounded ? 0 : Math.sin(particle.angle * 2) * 0.08;
  const width = Math.max(4, pixelSnap(particle.debrisWidth * (grounded ? 1.15 + spread : 0.9 + wobble), 1));
  const height = Math.max(3, pixelSnap(particle.debrisHeight * (grounded ? 0.9 - spread * 0.52 : 1.12 - wobble), 1));
  const top = grounded ? -height : -height / 2;
  const variant = particle.organicVariant;
  ctx.save();
  ctx.globalAlpha = grounded
    ? Math.min(1, Math.max(0, particle.life / (particle.maxLife * 0.65)))
    : Math.min(1, particle.life / 0.25);
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.rotate(grounded ? particle.splatAngle : particle.angle);

  // Stepped lobes and short sticky tails, rather than rigid metal rectangles.
  ctx.fillStyle = particle.shadowColor;
  if (grounded) {
    ctx.fillRect(pixelSnap(-width * 0.58, 1), -2, pixelSnap(width * 1.16, 1), 3);
    ctx.fillRect(pixelSnap(width * 0.6, 1), -2, 2 + variant * 2, 2);
    ctx.fillRect(pixelSnap(-width * 0.72, 1), -3, 3 + variant, 2);
  } else {
    ctx.fillRect(pixelSnap(-width * 0.65, 1), pixelSnap(top + height * 0.35, 1), pixelSnap(width * 0.35, 1), 2);
  }
  ctx.fillRect(pixelSnap(-width * 0.35, 1), pixelSnap(top + height * 0.2, 1), pixelSnap(width * 0.76, 1), height);
  ctx.fillStyle = particle.color;
  ctx.fillRect(pixelSnap(-width * 0.5, 1), pixelSnap(top + height * 0.3, 1), width, Math.max(2, pixelSnap(height * 0.5, 1)));
  ctx.fillRect(pixelSnap(-width * 0.36, 1), pixelSnap(top + height * 0.12, 1), pixelSnap(width * 0.76, 1), Math.max(2, pixelSnap(height * 0.76, 1)));
  ctx.fillRect(pixelSnap(-width * 0.18, 1), pixelSnap(top, 1), pixelSnap(width * 0.42, 1), Math.max(2, pixelSnap(height * 0.7, 1)));
  ctx.fillStyle = particle.highlightColor;
  ctx.globalAlpha *= 0.7;
  ctx.fillRect(pixelSnap(-width * 0.21, 1), pixelSnap(top + height * 0.15, 1), Math.max(2, pixelSnap(width * 0.22, 1)), 2);
  ctx.globalAlpha *= 0.55;
  ctx.fillRect(pixelSnap(width * 0.2, 1), pixelSnap(top + height * 0.38, 1), 2, 2);
  ctx.restore();
}

function drawCombatDebris(particle) {
  if (particle.organicDebris) {
    drawOrganicDebris(particle);
    return;
  }
  const width = Math.max(3, pixelSnap(particle.debrisWidth, 1));
  const height = Math.max(2, pixelSnap(particle.debrisHeight, 1));
  ctx.save();
  ctx.globalAlpha = particle.groundDebris
    ? Math.max(0, particle.life / particle.maxLife)
    : Math.min(1, particle.life / 0.25);
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  if (particle.groundDebris) {
    ctx.fillStyle = "#11131c";
    ctx.fillRect(-width / 2 - 2, -2, width + 4, 3);
  } else ctx.rotate(particle.angle);
  const top = particle.groundDebris ? -height : -height / 2;
  ctx.fillStyle = particle.color;
  ctx.fillRect(-width / 2, top, width, height);
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = particle.highlightColor;
  ctx.fillRect(-width / 2 + 1, top, Math.max(2, width - 2), 2);
  ctx.restore();
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    if (particle.debris) {
      drawCombatDebris(particle);
    } else if (particle.explosionFlash) {
      drawCombatExplosionFlash(particle);
    } else if (particle.explosionSmoke) {
      const progress = 1 - particle.life / particle.maxLife;
      const size = pixelSnap(particle.size * (0.7 + progress * 0.9));
      ctx.globalAlpha *= 0.38;
      ctx.fillRect(pixelSnap(particle.x - size / 2), pixelSnap(particle.y - size / 2), size, size);
      ctx.fillRect(pixelSnap(particle.x - size * 0.7), pixelSnap(particle.y - size * 0.25), size, size * 0.5);
    } else if (particle.groundFlame) {
      const lifeRatio = Math.max(0, particle.life / particle.maxLife);
      const flicker = Math.sin(particle.flamePhase) * 2;
      const height = particle.size * (1.25 + lifeRatio * 1.45) + flicker;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, lifeRatio * 1.35);
      ctx.fillStyle = "#a92818";
      ctx.fillRect(
        pixelSnap(particle.x - particle.size, 1),
        pixelSnap(particle.y - 2, 1),
        pixelSnap(particle.size * 2, 1),
        3,
      );
      ctx.fillStyle = "#ff5521";
      ctx.fillRect(
        pixelSnap(particle.x - particle.size * 0.7, 1),
        pixelSnap(particle.y - height, 1),
        pixelSnap(particle.size * 1.4, 1),
        pixelSnap(height, 1),
      );
      ctx.fillStyle = "#ffb92f";
      ctx.fillRect(
        pixelSnap(particle.x - particle.size * 0.34, 1),
        pixelSnap(particle.y - height * 0.72, 1),
        Math.max(2, pixelSnap(particle.size * 0.68, 1)),
        pixelSnap(height * 0.7, 1),
      );
      if (lifeRatio > 0.42) {
        ctx.fillStyle = "#fff09a";
        ctx.fillRect(
          pixelSnap(particle.x - 1, 1),
          pixelSnap(particle.y - height * 0.48, 1),
          3,
          Math.max(2, pixelSnap(height * 0.32, 1)),
        );
      }
      ctx.restore();
    } else if (particle.revivalFlame) {
      const remaining = Math.max(0, particle.life / particle.maxLife);
      const progress = 1 - remaining;
      const length = particle.size * (4.6 + progress * 1.4);
      const thickness = Math.max(1, particle.size * 0.5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.pow(remaining, 1.3);
      ctx.translate(pixelSnap(particle.x, 1), pixelSnap(particle.y, 1));
      ctx.rotate(Math.atan2(particle.vy, particle.vx));
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 5 * remaining;
      ctx.fillStyle = particle.color;
      ctx.fillRect(-length * 0.65, -thickness / 2, length, thickness);
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= 0.75;
      ctx.fillStyle = particle.coreColor;
      ctx.fillRect(-length * 0.32, -0.5, length * 0.48, 1);
      ctx.restore();
    } else if (particle.flameSpark) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(pixelSnap(particle.x, 1), pixelSnap(particle.y, 1));
      ctx.rotate(Math.atan2(particle.vy, particle.vx));
      ctx.fillStyle = particle.color;
      ctx.fillRect(
        -pixelSnap(particle.size * 1.8, 1),
        -pixelSnap(particle.size * 0.55, 1),
        pixelSnap(particle.size * 2.3, 1),
        Math.max(2, pixelSnap(particle.size * 1.1, 1)),
      );
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= 0.88;
      ctx.fillStyle = particle.coreColor ?? "#ffe77b";
      ctx.fillRect(
        -pixelSnap(particle.size * 0.7, 1),
        -1,
        pixelSnap(particle.size, 1),
        2,
      );
      ctx.restore();
    } else if (particle.lightImpact) {
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

function drawBossGate() {
  if (!bossDoor?.platform) return;

  const centerX = bossDoor.centerX;
  const surfaceY = platformSurfaceY(bossDoor.platform, centerX);
  const width = bossDoor.width;
  const height = bossDoor.height;
  if (
    centerX + width < cameraX - 120 ||
    centerX - width > cameraX + WIDTH + 120 ||
    surfaceY < cameraY - 120 ||
    surfaceY - height > cameraY + HEIGHT + 120
  ) return;

  const playerCenterX = player.x + player.width / 2;
  const proximity = Math.max(0, 1 - Math.abs(playerCenterX - centerX) / 760);
  const pulse = 0.72 + Math.sin(gameTime * 3.4) * 0.18;
  const halfWidth = width / 2;

  ctx.save();
  ctx.translate(centerX, surfaceY);

  const beacon = ctx.createLinearGradient(0, -height - 210, 0, -height + 6);
  beacon.addColorStop(0, "rgba(255, 70, 42, 0)");
  beacon.addColorStop(0.58, `rgba(255, 82, 38, ${0.08 + proximity * 0.08})`);
  beacon.addColorStop(1, `rgba(255, 177, 58, ${0.22 + proximity * 0.16})`);
  ctx.fillStyle = beacon;
  ctx.fillRect(-34, -height - 210, 68, 216);

  ctx.shadowColor = "rgba(255, 72, 31, 0.72)";
  ctx.shadowBlur = 16 + proximity * 18;
  ctx.fillStyle = "#431511";
  ctx.beginPath();
  ctx.moveTo(-halfWidth, 0);
  ctx.lineTo(-halfWidth, -height + 30);
  ctx.lineTo(-halfWidth + 27, -height);
  ctx.lineTo(halfWidth - 27, -height);
  ctx.lineTo(halfWidth, -height + 30);
  ctx.lineTo(halfWidth, 0);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#151b22";
  ctx.beginPath();
  ctx.moveTo(-halfWidth + 14, -4);
  ctx.lineTo(-halfWidth + 14, -height + 38);
  ctx.lineTo(-halfWidth + 34, -height + 16);
  ctx.lineTo(halfWidth - 34, -height + 16);
  ctx.lineTo(halfWidth - 14, -height + 38);
  ctx.lineTo(halfWidth - 14, -4);
  ctx.closePath();
  ctx.fill();

  const doorGradient = ctx.createLinearGradient(-halfWidth, 0, halfWidth, 0);
  doorGradient.addColorStop(0, "#11171d");
  doorGradient.addColorStop(0.46, "#29313a");
  doorGradient.addColorStop(0.54, "#202730");
  doorGradient.addColorStop(1, "#0d1217");
  ctx.fillStyle = doorGradient;
  ctx.fillRect(-halfWidth + 23, -height + 40, width - 46, height - 44);

  ctx.strokeStyle = `rgba(255, 105, 49, ${0.7 + pulse * 0.24})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(-halfWidth + 15, -height + 31, width - 30, height - 34);
  ctx.strokeStyle = "rgba(255, 197, 86, 0.52)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-halfWidth + 24, -height + 41, width - 48, height - 46);

  ctx.shadowColor = "#ff5d2e";
  ctx.shadowBlur = 9 + proximity * 13;
  ctx.strokeStyle = `rgba(255, 102, 43, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -height + 43);
  ctx.lineTo(0, -7);
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const side of [-1, 1]) {
    ctx.fillStyle = "#28323b";
    ctx.fillRect(side * (halfWidth - 12) - (side < 0 ? 12 : 0), -height + 54, 12, height - 66);
    ctx.fillStyle = `rgba(255, 104, 39, ${0.55 + pulse * 0.36})`;
    for (let markerY = -height + 68; markerY < -24; markerY += 29) {
      ctx.fillRect(side * (halfWidth - 9) - 3, markerY, 6, 13);
    }
  }

  ctx.fillStyle = "#080b0f";
  ctx.fillRect(-33, -height - 12, 66, 27);
  ctx.strokeStyle = "#ff6a32";
  ctx.lineWidth = 2;
  ctx.strokeRect(-32, -height - 11, 64, 25);
  ctx.fillStyle = "#ffd17a";
  ctx.font = "700 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText("BOSS", 0, -height + 7);

  ctx.fillStyle = "#111820";
  ctx.fillRect(-halfWidth - 9, -8, width + 18, 11);
  ctx.fillStyle = `rgba(255, 94, 35, ${0.62 + pulse * 0.28})`;
  ctx.fillRect(-halfWidth + 4, -5, width - 8, 3);
  ctx.restore();
}

function drawWorld() {
  ctx.save();
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  ctx.translate(-cameraX + shakeX, -cameraY + shakeY);
  drawTerrain();
  drawBossGate();
  if (TEST_MODE && showMonsterArea) {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const hitbox = getEnemyHitbox(enemy);
      if (
        hitbox.x + hitbox.width > cameraX - 100 &&
        hitbox.x < cameraX + WIDTH + 100 &&
        hitbox.y + hitbox.height > cameraY - 100 &&
        hitbox.y < cameraY + HEIGHT + 100
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
    if (!enemy.alive) continue;
    const hitbox = getEnemyHitbox(enemy);
    const enemyDrawMargin = 100;
    if (
      hitbox.x + hitbox.width > cameraX - enemyDrawMargin &&
      hitbox.x < cameraX + WIDTH + enemyDrawMargin &&
      hitbox.y + hitbox.height > cameraY - enemyDrawMargin &&
      hitbox.y < cameraY + HEIGHT + enemyDrawMargin
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
  if (TEST_MODE && showMonsterArea) {
    for (const enemy of enemies) {
      drawCombatantPhysicsDebug(enemy, enemy.kind === "monster2" ? "#ff96ec" : "#8aff9c");
    }
    for (const turret of turrets) drawCombatantPhysicsDebug(turret, "#ffd278");
  }
  ctx.restore();
}

function drawMinimap(fullMap = false) {
  if (platforms.length === 0) return;
  const expanded = fullMap && TEST_MODE;

  const portrait = HEIGHT > WIDTH;
  const panelWidth = expanded ? WIDTH - 44 : portrait
    ? Math.min(226, WIDTH * 0.34)
    : Math.min(282, WIDTH * 0.24);
  const canvasBounds = expanded ? canvas.getBoundingClientRect?.() : null;
  const toolsBounds = expanded ? testControlsElement?.getBoundingClientRect?.() : null;
  const toolsBottom = canvasBounds?.height > 0 && toolsBounds
    ? (toolsBounds.bottom - canvasBounds.top) / canvasBounds.height * HEIGHT
    : 0;
  const panelY = expanded
    ? Math.min(HEIGHT * 0.5, Math.max(128, HEIGHT * 0.2, toolsBottom + 18))
    : 110;
  const panelHeight = expanded ? HEIGHT - panelY - HEIGHT * 0.16 - 20 : portrait ? 148 : 138;
  const panelX = WIDTH - panelWidth - 22;
  const plotX = panelX + 10;
  const plotY = panelY + 10;
  const plotWidth = panelWidth - 20;
  const plotHeight = panelHeight - 20;

  let fullWorldLeft = Infinity;
  let fullWorldRight = -Infinity;
  let fullWorldTop = Infinity;
  let fullWorldBottom = -Infinity;
  for (const platform of platforms) {
    fullWorldLeft = Math.min(fullWorldLeft, platform.start);
    fullWorldRight = Math.max(fullWorldRight, platform.end);
    if (platform.kind === "ramp") {
      fullWorldTop = Math.min(fullWorldTop, platform.entryY, platform.exitY);
      fullWorldBottom = Math.max(fullWorldBottom, platform.entryY, platform.exitY);
    } else {
      fullWorldTop = Math.min(fullWorldTop, platform.y);
      fullWorldBottom = Math.max(fullWorldBottom, platform.y);
    }
  }

  const horizontalMargin = Math.max(
    1,
    (fullWorldRight - fullWorldLeft) * 0.025,
  );
  const verticalMargin = Math.max(
    LEVEL_GAP * 0.65,
    (fullWorldBottom - fullWorldTop) * 0.08,
  );
  fullWorldLeft -= horizontalMargin;
  fullWorldRight += horizontalMargin;
  fullWorldTop -= verticalMargin;
  fullWorldBottom += verticalMargin;

  const fullWorldWidth = Math.max(1, fullWorldRight - fullWorldLeft);
  const fullWorldHeight = Math.max(1, fullWorldBottom - fullWorldTop);
  const worldWidth = expanded ? fullWorldWidth : Math.min(
    fullWorldWidth,
    Math.max(WIDTH * 1.25, fullWorldWidth * 0.25),
  );
  const worldHeight = expanded ? fullWorldHeight : Math.min(
    fullWorldHeight,
    Math.max(HEIGHT * 1.1, fullWorldHeight * 0.25),
  );
  const focusX = player.x + player.width / 2;
  const focusY = player.y + player.height / 2;
  const worldLeft = expanded ? fullWorldLeft : Math.max(
    fullWorldLeft,
    Math.min(fullWorldRight - worldWidth, focusX - worldWidth / 2),
  );
  const worldRight = worldLeft + worldWidth;
  const worldTop = expanded ? fullWorldTop : Math.max(
    fullWorldTop,
    Math.min(fullWorldBottom - worldHeight, focusY - worldHeight / 2),
  );
  const worldBottom = worldTop + worldHeight;
  const markerPadding = expanded ? 10 : 0;
  const mapScale = Math.min(
    (plotWidth - markerPadding * 2) / worldWidth,
    (plotHeight - markerPadding * 2) / worldHeight,
  );
  const mapX = expanded
    ? (value) => plotX + (plotWidth - worldWidth * mapScale) / 2 + (value - worldLeft) * mapScale
    : (value) => plotX + (value - worldLeft) / worldWidth * plotWidth;
  const mapY = expanded
    ? (value) => plotY + (plotHeight - worldHeight * mapScale) / 2 + (value - worldTop) * mapScale
    : (value) => plotY + (value - worldTop) / worldHeight * plotHeight;

  ctx.save();
  if (expanded) {
    ctx.fillStyle = "rgba(1, 4, 9, 0.86)";
    ctx.fillRect(0, 104, WIDTH, HEIGHT - 104);
  }
  const panelCenterX = panelX + panelWidth / 2;
  const panelCenterY = panelY + panelHeight / 2;
  const panelBackground = ctx.createRadialGradient(
    panelCenterX,
    panelCenterY,
    panelWidth * 0.08,
    panelCenterX,
    panelCenterY,
    panelWidth * 0.72,
  );
  panelBackground.addColorStop(0, "rgba(3, 9, 15, 0.54)");
  panelBackground.addColorStop(0.7, "rgba(3, 8, 14, 0.44)");
  panelBackground.addColorStop(1, "rgba(3, 8, 14, 0.22)");
  ctx.fillStyle = panelBackground;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  const panelBorder = ctx.createLinearGradient(
    panelX,
    panelY,
    panelX + panelWidth,
    panelY + panelHeight,
  );
  panelBorder.addColorStop(0, "rgba(107, 214, 238, 0.08)");
  panelBorder.addColorStop(0.48, "rgba(143, 226, 243, 0.25)");
  panelBorder.addColorStop(1, "rgba(107, 214, 238, 0.09)");
  ctx.strokeStyle = panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.strokeStyle = "rgba(123, 211, 231, 0.07)";
  ctx.strokeRect(panelX + 2.5, panelY + 2.5, panelWidth - 5, panelHeight - 5);

  ctx.beginPath();
  ctx.rect(plotX, plotY, plotWidth, plotHeight);
  ctx.clip();

  ctx.strokeStyle = "rgba(108, 153, 170, 0.13)";
  ctx.lineWidth = 1;
  for (let column = 1; column < 4; column += 1) {
    const x = plotX + plotWidth * column / 4;
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + plotHeight);
    ctx.stroke();
  }
  for (let row = 1; row < 3; row += 1) {
    const y = plotY + plotHeight * row / 3;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotWidth, y);
    ctx.stroke();
  }

  ctx.lineCap = "round";
  for (const routeRole of ["sub", "main"]) {
    ctx.strokeStyle = routeRole === "sub"
      ? "rgba(190, 143, 255, 0.34)"
      : "rgba(83, 221, 242, 0.62)";
    ctx.lineWidth = routeRole === "sub" ? 1.25 : 2;
    for (const platform of platforms) {
      const isSubPath = platform.routeRole === "sub";
      if ((routeRole === "sub") !== isSubPath) continue;
      const startY = platform.kind === "ramp" ? platform.entryY : platform.y;
      const endY = platform.kind === "ramp" ? platform.exitY : platform.y;
      ctx.beginPath();
      ctx.moveTo(mapX(platform.entryX), mapY(startY));
      ctx.lineTo(mapX(platform.exitX), mapY(endY));
      ctx.stroke();
    }
  }

  if (bossDoor?.platform) {
    const doorY = platformSurfaceY(bossDoor.platform, bossDoor.centerX);
    const markerX = mapX(bossDoor.centerX);
    const markerY = mapY(doorY);
    ctx.fillStyle = "#ff6940";
    ctx.shadowColor = "#ff6a32";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(markerX, markerY - 5);
    ctx.lineTo(markerX + 4, markerY);
    ctx.lineTo(markerX, markerY + 5);
    ctx.lineTo(markerX - 4, markerY);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const playerMapX = mapX(player.x + player.width / 2);
  const playerMapY = mapY(player.y + player.height);
  const playerGlow = ctx.createRadialGradient(
    playerMapX,
    playerMapY,
    0,
    playerMapX,
    playerMapY,
    8,
  );
  playerGlow.addColorStop(0, "rgba(255, 224, 113, 0.48)");
  playerGlow.addColorStop(0.48, "rgba(255, 224, 113, 0.2)");
  playerGlow.addColorStop(1, "rgba(255, 224, 113, 0)");
  ctx.fillStyle = playerGlow;
  ctx.beginPath();
  ctx.arc(playerMapX, playerMapY, 8, 0, Math.PI * 2);
  ctx.fill();

  const playerBorder = ctx.createLinearGradient(
    playerMapX - 4,
    playerMapY - 4,
    playerMapX + 4,
    playerMapY + 4,
  );
  playerBorder.addColorStop(0, "rgba(177, 231, 241, 0.12)");
  playerBorder.addColorStop(0.5, "rgba(255, 250, 214, 0.52)");
  playerBorder.addColorStop(1, "rgba(177, 231, 241, 0.14)");
  ctx.fillStyle = "#ffe071";
  ctx.strokeStyle = playerBorder;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(playerMapX, playerMapY, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const HUD_PIXEL_GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

function pixelTextWidth(text, scale) {
  if (text.length === 0) return 0;
  return text.length * 5 * scale + (text.length - 1) * scale;
}

function drawPixelText(text, x, y, scale, color, align = "left") {
  const normalizedText = String(text).toUpperCase();
  const width = pixelTextWidth(normalizedText, scale);
  let cursorX = align === "center"
    ? x - width / 2
    : align === "right"
      ? x - width
      : x;
  ctx.fillStyle = color;

  for (const character of normalizedText) {
    const glyph = HUD_PIXEL_GLYPHS[character] ?? HUD_PIXEL_GLYPHS[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        ctx.fillRect(
          pixelSnap(cursorX + column * scale, 1),
          pixelSnap(y + row * scale, 1),
          scale,
          scale,
        );
      }
    }
    cursorX += 6 * scale;
  }
}

function drawPixelHeart(x, y, fillAmount, scale = 3) {
  const fill = Math.max(0, Math.min(1, fillAmount));
  const pixels = [
    "0110110",
    "1111111",
    "1111111",
    "0111110",
    "0011100",
    "0001000",
  ];
  for (let row = 0; row < pixels.length; row += 1) {
    for (let column = 0; column < pixels[row].length; column += 1) {
      if (pixels[row][column] !== "1") continue;
      const pixelX = pixelSnap(x + column * scale, 1);
      const pixelY = pixelSnap(y + row * scale, 1);
      const filledWidth = Math.min(scale, Math.max(0, 7 * scale * fill - column * scale));
      if (filledWidth < scale) {
        ctx.fillStyle = "rgba(94, 49, 56, 0.62)";
        ctx.fillRect(pixelX, pixelY, scale, scale);
      }
      if (filledWidth > 0) {
        ctx.fillStyle = "#ff4f5f";
        ctx.fillRect(pixelX, pixelY, filledWidth, scale);
      }
    }
  }
  if (fill <= 0) return;
  ctx.fillStyle = "#ff98a2";
  ctx.fillRect(x + scale, y + scale, scale, scale);
}

function drawHud() {
  const panelX = 22;
  const panelY = 22;
  const panelWidth = WIDTH - 44;
  const panelHeight = 74;
  const valueScale = WIDTH > HEIGHT ? 4 : 3;
  const labelScale = WIDTH > HEIGHT ? 3 : 2;
  const valueY = panelY + (panelHeight - 7 * valueScale) / 2;
  const labelY = panelY + (panelHeight - 7 * labelScale) / 2;
  const textGap = labelScale * 2;

  ctx.save();
  drawPixelText(
    "SCORE",
    panelX + 18,
    labelY,
    labelScale,
    "#f7d66d",
  );
  drawPixelText(
    String(player.score).padStart(3, "0"),
    panelX + 18 + pixelTextWidth("SCORE", labelScale) + textGap,
    valueY,
    valueScale,
    "#f7d66d",
  );

  const stageCenterX = panelX + panelWidth / 2;
  const stageLabelWidth = pixelTextWidth("STAGE", labelScale);
  const stageValue = String(CURRENT_STAGE).padStart(2, "0");
  const stageValueWidth = pixelTextWidth(stageValue, valueScale);
  const stageStartX = (
    stageCenterX -
    (stageLabelWidth + textGap + stageValueWidth) / 2
  );
  drawPixelText(
    "STAGE",
    stageStartX,
    labelY,
    labelScale,
    "#eef8fa",
  );
  drawPixelText(
    stageValue,
    stageStartX + stageLabelWidth + textGap,
    valueY,
    valueScale,
    "#eef8fa",
  );

  const heartScale = 3;
  const heartWidth = 7 * heartScale;
  const heartGap = 7;
  const maximumHearts = 3;
  const heartsWidth = maximumHearts * heartWidth + (maximumHearts - 1) * heartGap;
  const heartsX = panelX + panelWidth - heartsWidth - 18;
  const heartsY = panelY + (panelHeight - 6 * heartScale) / 2;
  for (let heart = 0; heart < maximumHearts; heart += 1) {
    drawPixelHeart(
      heartsX + heart * (heartWidth + heartGap),
      heartsY,
      Math.max(0, Math.min(1, player.hp - heart)),
      heartScale,
    );
  }
  ctx.restore();

  drawMinimap(TEST_MODE && showFullMap);
  if (TEST_MODE && showFullMap) return;

  if (
    !gameOver && !playerIsDown() &&
    goalPlatform &&
    player.platform === goalPlatform &&
    Math.abs(player.x + player.width / 2 - goalX) < BOSS_GATE_TRIGGER_DISTANCE
  ) {
    drawOverlay("BOSS GATE", "보스 구역 진입 준비");
  }

  if (gameOver && !playerIsDown()) drawOverlay("GAME OVER", "화면을 눌러 재시작");
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
