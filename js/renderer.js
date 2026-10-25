"use strict";

// Background, terrain, characters, projectiles, and HUD rendering.

const PIXEL_ART_GRID = 2;

function pixelSnap(value, grid = PIXEL_ART_GRID) {
  return Math.round(value / grid) * grid;
}

function drawBackground() {
  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const backgroundVideoAsset = typeof spaceBackgroundVideoAsset !== "undefined"
    ? spaceBackgroundVideoAsset
    : null;
  const backgroundVideo = backgroundVideoAsset?.video;
  if (
    backgroundVideo &&
    (backgroundVideoAsset.loaded || backgroundVideo.readyState >= 2) &&
    drawVideoCover(backgroundVideo, 0, 0, WIDTH, HEIGHT)
  ) {
    ctx.fillStyle = "rgba(1, 3, 10, 0.16)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }

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
  const panelWidths = [96, 120, 144];
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
  const y = pixelSnap(platform.y + 3, 1);

  for (let panel = first; panel <= last; panel += 1) {
    const start = platform.start + panel * panelWidth;
    const width = Math.min(panelWidth, platform.end - start);
    if (width < 16) continue;
    const x = pixelSnap(start, 1);
    ctx.fillStyle = palette[panel % 2];
    ctx.fillRect(x + 1, y, width - 2, thickness);
    ctx.fillStyle = "rgba(5, 12, 17, 0.7)";
    ctx.fillRect(x, y + 2, 1, thickness - 2);
    ctx.fillRect(x + width - 1, y + 2, 1, thickness - 2);
    ctx.fillStyle = "rgba(112, 143, 160, 0.58)";
    ctx.fillRect(x + 7, y + 2, 8, 1);
    ctx.fillRect(x + width - 15, y + 2, 8, 1);
    ctx.fillStyle = "rgba(5, 10, 15, 0.72)";
    ctx.fillRect(x + 11, y + 7, 3, 1);
    ctx.fillRect(x + width - 14, y + 7, 3, 1);

    if (platform.style === 0) {
      ctx.fillStyle = "rgba(67, 96, 112, 0.62)";
      if (width >= 64) ctx.fillRect(x + 24, y + 5, width - 48, 1);
      ctx.fillStyle = "rgba(12, 23, 31, 0.72)";
      ctx.fillRect(x + Math.floor(width / 2) - 1, y + 3, 2, 7);
    } else if (platform.style === 1) {
      ctx.fillStyle = "rgba(91, 104, 116, 0.55)";
      for (let mark = 20; mark < width - 16; mark += 24) {
        ctx.fillRect(x + mark, y + (mark % 48 === 0 ? 6 : 4), 6, 1);
      }
    } else {
      ctx.fillStyle = "rgba(60, 105, 118, 0.58)";
      if (width >= 56) {
        ctx.fillRect(x + 24, y + 4, 2, 6);
        ctx.fillRect(x + width - 26, y + 4, 2, 6);
      }
      if (width >= 72) ctx.fillRect(x + 32, y + 8, width - 64, 1);
    }
  }
}

function drawRoadPixelTexture(platform, palette, isSubPath = false) {
  const tileWidth = 28;
  const first = Math.max(0, Math.floor((cameraX - 40 - platform.start) / tileWidth));
  const last = Math.min(
    Math.ceil((platform.end - platform.start) / tileWidth) - 1,
    Math.floor((cameraX + WIDTH + 40 - platform.start) / tileWidth),
  );
  ctx.save();
  const baseAlpha = ctx.globalAlpha;
  for (let tile = first; tile <= last; tile += 1) {
    const start = platform.start + tile * tileWidth;
    const x = pixelSnap(start, 1);
    const y = pixelSnap(platformSurfaceY(platform, start + tileWidth / 2), 1);
    const wear = platformFeatureNoise(platform, tile * 37 + 19);
    ctx.globalAlpha = baseAlpha * 0.62;
    ctx.fillStyle = palette[2];
    ctx.fillRect(x + 3, y + 8, 4, 1);
    ctx.fillRect(x + 18, y + 5, 3, 1);
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.fillStyle = palette[0];
    ctx.fillRect(x + 9, y + 4, wear > 0.58 ? 6 : 3, 1);
    if (wear > 0.68) {
      ctx.globalAlpha = baseAlpha * 0.64;
      ctx.fillStyle = isSubPath ? "#a286d0" : "#6eafbd";
      ctx.fillRect(x + 15, y + 6, 3, 1);
    }
  }
  ctx.restore();
}

function drawPixelRoadRail(platform, railColor, isSubPath = false) {
  const highlight = isSubPath ? "rgba(201, 174, 255, 0.72)" : "rgba(105, 226, 238, 0.74)";
  const visibleStart = Math.max(platform.start, cameraX - 16);
  const visibleEnd = Math.min(platform.end, cameraX + WIDTH + 16);
  if (visibleEnd <= visibleStart) return;
  if (platform.kind === "flat") {
    const y = pixelSnap(platform.y, 1);
    ctx.fillStyle = railColor;
    ctx.fillRect(visibleStart, y - 3, visibleEnd - visibleStart, 3);
    ctx.fillStyle = highlight;
    ctx.fillRect(visibleStart, y - 1, visibleEnd - visibleStart, 1);
    ctx.fillStyle = "#0c161e";
    const firstNotch = Math.max(0, Math.floor((visibleStart - platform.start) / 56));
    for (let notch = firstNotch; platform.start + notch * 56 < visibleEnd; notch += 1) {
      const x = pixelSnap(platform.start + notch * 56 + 42, 1);
      if (x + 3 <= platform.end) ctx.fillRect(x, y - 1, 3, 1);
    }
    return;
  }

  const blockWidth = 6;
  const first = Math.max(0, Math.floor((visibleStart - platform.start) / blockWidth));
  const last = Math.min(
    Math.ceil((platform.end - platform.start) / blockWidth) - 1,
    Math.floor((visibleEnd - platform.start) / blockWidth),
  );
  for (let block = first; block <= last; block += 1) {
    const x = platform.start + block * blockWidth;
    const width = Math.min(blockWidth, platform.end - x);
    const y = pixelSnap(platformSurfaceY(platform, x + width / 2), 1);
    ctx.fillStyle = railColor;
    ctx.fillRect(x, y - 3, width, 3);
    if (block % 8 !== 7) {
      ctx.fillStyle = highlight;
      ctx.fillRect(x, y - 1, width, 1);
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
    const baseAlpha = ctx.globalAlpha;
    ctx.fillStyle = "#05090e";
    ctx.fillRect(lightX - 8, lightY + 4, 16, 8);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(lightX - 7.5, lightY + 4.5, 15, 7);
    ctx.globalAlpha = baseAlpha * pulse * 0.2;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(lightX - 9, lightY + 5, 18, 6);
    ctx.globalAlpha = baseAlpha * pulse * 0.46;
    ctx.fillRect(lightX - 7, lightY + 6, 14, 4);
    ctx.globalAlpha = baseAlpha * pulse;
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
    const baseAlpha = ctx.globalAlpha;
    ctx.translate(pixelSnap(x), pixelSnap(y));
    ctx.rotate(angle);
    ctx.fillStyle = "#05090e";
    ctx.fillRect(-8, 4, 16, 7);
    ctx.strokeStyle = "rgba(117, 139, 153, 0.82)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-7.5, 4.5, 15, 6);
    ctx.globalAlpha = baseAlpha * pulse * 0.22;
    ctx.fillStyle = platform.lightColor;
    ctx.fillRect(-9, 5, 18, 5);
    ctx.globalAlpha = baseAlpha * pulse;
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
  const baseAlpha = ctx.globalAlpha;
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
    ctx.globalAlpha = baseAlpha;
    ctx.fillStyle = "#11181e";
    ctx.fillRect(segmentX, y + 1, segmentWidth, 4);
    if (!isLit) continue;

    const pulse = nearDamage
      ? 0.28 + flicker * 0.72
      : 0.76 + Math.sin(gameTime * 3.4 + feature.phase + segment) * 0.16;
    ctx.globalAlpha = baseAlpha * pulse;
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
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(platform.entryX, platform.entryY + 3);
  ctx.lineTo(platform.exitX, platform.exitY + 3);
  ctx.stroke();
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bottomEntryX, platform.entryY + PLATFORM_DECK_THICKNESS - 2);
  ctx.lineTo(bottomExitX, platform.exitY + PLATFORM_DECK_THICKNESS - 2);
  ctx.stroke();

  const divisions = Math.max(3, Math.floor((platform.end - platform.start) / 48));
  ctx.strokeStyle = "rgba(104, 151, 171, 0.26)";
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
  ctx.lineWidth = 2;
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

function drawTriangleEnergyFrame(platform, palette, centerX, apexY) {
  const depth = apexY - platform.y;
  const halfWidth = (platform.end - platform.start) / 2;
  const phase = platform.lightPhase / (Math.PI * 2);
  const fixture = { seed: 1320 + platform.id * 7 };

  // Two current bands travel through the open center without allocating particles.
  for (let current = 0; current < 2; current += 1) {
    const progress = (gameTime * 0.38 + phase + current * 0.5) % 1;
    const y = platform.y + 13 + progress * Math.max(1, depth - 28);
    const spanAtY = halfWidth * Math.max(0, 1 - (y - platform.y) / depth);
    const inset = Math.min(10, spanAtY * 0.24);
    const startX = centerX - spanAtY + inset;
    const endX = centerX + spanAtY - inset;
    if (endX - startX < 7) continue;
    const color = current === 0 ? "#c7fbff" : "#dfc6ff";
    drawPlatformElectricArc(
      platform,
      fixture,
      startX,
      y,
      endX,
      y,
      1400 + current * 170,
      color,
    );
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pixelSnap(startX - 1, 1), pixelSnap(y - 1, 1), 3, 3);
    ctx.fillRect(pixelSnap(endX - 1, 1), pixelSnap(y - 1, 1), 3, 3);
    ctx.restore();
  }

  const frameLeftX = platform.start + 5;
  const frameRightX = platform.end - 5;
  const frameTopY = platform.y + 5;
  const frameApexY = apexY - 6;
  const traceFrame = () => {
    ctx.beginPath();
    ctx.moveTo(frameLeftX, frameTopY);
    ctx.lineTo(frameRightX, frameTopY);
    ctx.lineTo(centerX, frameApexY);
    ctx.closePath();
  };

  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#080d14";
  ctx.lineWidth = 11;
  traceFrame();
  ctx.stroke();
  ctx.strokeStyle = palette[1];
  ctx.lineWidth = 7;
  traceFrame();
  ctx.stroke();
  ctx.strokeStyle = "rgba(137, 176, 194, 0.72)";
  ctx.lineWidth = 1.5;
  traceFrame();
  ctx.stroke();
  ctx.restore();
}

function drawInvertedTrianglePlatform(platform, palette, railColor) {
  const centerX = (platform.start + platform.end) / 2;
  const depth = invertedTrianglePlatformDepth(platform);
  const apexY = platform.y + depth;
  const hollowEnergyFrame = platform.isJumpPad && platform.trick === "horizontal-jump";
  if (hollowEnergyFrame) {
    drawTriangleEnergyFrame(platform, palette, centerX, apexY);
  } else {
    ctx.fillStyle = palette[1];
    ctx.beginPath();
    ctx.moveTo(platform.start, platform.y);
    ctx.lineTo(platform.end, platform.y);
    ctx.lineTo(centerX, apexY);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    const baseAlpha = ctx.globalAlpha;
    ctx.beginPath();
    ctx.moveTo(platform.start, platform.y);
    ctx.lineTo(platform.end, platform.y);
    ctx.lineTo(centerX, apexY);
    ctx.closePath();
    ctx.clip();
    for (let bandY = pixelSnap(platform.y + 7, 1); bandY < apexY; bandY += 8) {
      const band = Math.floor((bandY - platform.y) / 8);
      ctx.fillStyle = band % 2 === 0 ? palette[0] : palette[2];
      ctx.globalAlpha = baseAlpha * 0.24;
      ctx.fillRect(platform.start, bandY, platform.end - platform.start, 2);
    }
    ctx.globalAlpha = baseAlpha;
    drawRoadPixelTexture(platform, palette, platform.routeRole === "sub");
    ctx.restore();

    ctx.strokeStyle = "rgba(119, 151, 166, 0.58)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(platform.start, platform.y);
    ctx.lineTo(centerX, apexY);
    ctx.lineTo(platform.end, platform.y);
    ctx.stroke();
  }

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
  ctx.globalAlpha *= pulse;
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

function drawTerrainPlatform(platform, palette, railColor, isSubPath) {
  if (platform.kind === "ramp") {
    drawRamp(platform, palette, railColor);
    return;
  }
  if (isInvertedTrianglePlatform(platform)) {
    drawInvertedTrianglePlatform(platform, palette, railColor);
    return;
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
    pixelSnap(platform.y + 2, 1),
    platform.end - platform.start,
    3,
  );
  ctx.fillStyle = palette[2];
  ctx.fillRect(
    platform.start,
    pixelSnap(platform.y + PLATFORM_DECK_THICKNESS - 3, 1),
    platform.end - platform.start,
    2,
  );
  drawStationPanels(platform);
  drawRoadPixelTexture(platform, palette, isSubPath);
  ctx.fillStyle = "#0a1118";
  ctx.fillRect(
    platform.start,
    platform.y + PLATFORM_DECK_THICKNESS - 1,
    platform.end - platform.start,
    1,
  );
  drawPlatformArchitecture(platform);
  ctx.restore();

  drawPlatformLights(platform);
  drawPixelRoadRail(platform, isSubPath ? "#8873ad" : railColor, isSubPath);
  drawPlatformFeature(platform);

  ctx.strokeStyle = "#0a1017";
  ctx.lineWidth = 2;
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

function drawTerrain() {
  const deckPalettes = [
    ["#253541", "#17232d", "#0d151c"],
    ["#343740", "#20262d", "#10161c"],
    ["#214049", "#172c32", "#0c181c"],
  ];
  const railColors = ["#718391", "#8b8378", "#668f96"];
  for (const platform of platforms) {
    if (platform.end < cameraX - 120 || platform.start > cameraX + WIDTH + 120) {
      continue;
    }
    const bounds = platformVisualBounds(platform);
    let platformBottomY = bounds.bottom;
    if (platform.features?.some((feature) => feature.type === "electric-hose")) {
      platformBottomY = Math.max(platformBottomY, platform.y + ELECTRIC_WIRE_MAX_DROP);
    }
    if (
      platformBottomY < cameraY - 100 ||
      bounds.top > cameraY + HEIGHT + 120
    ) continue;

    const isSubPath = platform.routeRole === "sub";
    const palette = isSubPath
      ? ["#332a48", "#211c32", "#120f1e"]
      : deckPalettes[platform.style];
    const railColor = railColors[platform.style];
    drawTerrainPlatform(platform, palette, railColor, isSubPath);
  }
}

let playerShieldDotSprite;
let playerRevivalOrbSprite;

function getPlayerShieldDotSprite() {
  if (playerShieldDotSprite !== undefined) return playerShieldDotSprite;
  const cache = new Map();
  playerShieldDotSprite = cachedCanvasSprite(cache, "purple-shield-dot", 30, 30, (context) => {
    context.globalCompositeOperation = "lighter";
    context.fillStyle = "rgba(128, 42, 232, 0.82)";
    context.beginPath();
    context.arc(15, 15, 10.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#c174ff";
    context.beginPath();
    context.arc(15, 15, 6.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f6e5ff";
    context.beginPath();
    context.arc(15, 15, 3.1, 0, Math.PI * 2);
    context.fill();
  }) ?? null;
  return playerShieldDotSprite;
}

function getPlayerRevivalOrbSprite() {
  if (playerRevivalOrbSprite !== undefined) return playerRevivalOrbSprite;
  const cache = new Map();
  playerRevivalOrbSprite = cachedCanvasSprite(cache, "bright-revival-orb", 30, 30, (context) => {
    context.globalCompositeOperation = "lighter";
    context.fillStyle = "rgba(159, 60, 244, 0.88)";
    context.beginPath();
    context.arc(15, 15, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#df9cff";
    context.beginPath();
    context.arc(15, 15, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#fff4ff";
    context.beginPath();
    context.arc(15, 15, 3.4, 0, Math.PI * 2);
    context.fill();
  }) ?? null;
  return playerRevivalOrbSprite;
}

function drawPlayerShieldInteriorImpact(
  centerX,
  centerY,
  radiusX,
  radiusY,
  hitProgress,
  frontLayer,
) {
  if (hitProgress <= 0) return;
  const direction = player.accelerationShieldHitDirection || -player.facing || -1;
  const travel = 1 - hitProgress;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX * 0.84, radiusY * 0.84, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  if (!frontLayer) {
    const impactX = direction * radiusX * (0.46 - travel * 0.28);
    const glow = ctx.createRadialGradient(
      impactX,
      0,
      2,
      impactX * 0.35,
      0,
      Math.max(radiusX, radiusY) * 0.9,
    );
    glow.addColorStop(0, "rgba(241, 216, 255, 0.78)");
    glow.addColorStop(0.28, "rgba(181, 103, 255, 0.38)");
    glow.addColorStop(0.68, "rgba(122, 55, 231, 0.12)");
    glow.addColorStop(1, "rgba(84, 24, 176, 0)");
    ctx.globalAlpha = Math.pow(hitProgress, 0.72) * 0.58;
    ctx.fillStyle = glow;
    ctx.fillRect(-radiusX, -radiusY, radiusX * 2, radiusY * 2);
    ctx.restore();
    return;
  }

  ctx.scale(direction, 1);
  ctx.lineCap = "round";
  for (let wave = 0; wave < 3; wave += 1) {
    const waveX = radiusX * (0.46 - travel * 0.62) - wave * 8;
    ctx.globalAlpha = Math.max(0,
      Math.pow(hitProgress, 0.85) * (0.32 - wave * 0.065),
    );
    ctx.strokeStyle = wave === 0 ? "#f0d3ff" : "#ad65ff";
    ctx.lineWidth = wave === 0 ? 1.2 : 0.8;
    ctx.beginPath();
    ctx.ellipse(
      waveX,
      0,
      radiusX * (0.2 + wave * 0.08),
      radiusY * (0.48 + wave * 0.07),
      0,
      -Math.PI / 2,
      Math.PI / 2,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayerAccelerationShield(frontLayer) {
  const visualLevel = Math.max(0, Math.min(3, player.accelerationShieldVisual));
  const hitProgress = Math.max(0, Math.min(
    1,
    player.accelerationShieldHitTimer / PLAYER_ACCELERATION_SHIELD_HIT_DURATION,
  ));
  if (visualLevel < 0.015 && hitProgress <= 0) return;

  const hitbox = getPlayerHitbox();
  const centerX = hitbox.x + hitbox.width / 2;
  const centerY = hitbox.y + hitbox.height / 2 - 2;
  const smoothVisibility = (value) => value * value * (3 - 2 * value);
  const firstStage = smoothVisibility(Math.min(1, visualLevel));
  const secondStage = smoothVisibility(Math.min(1, Math.max(0, visualLevel - 1)));
  const thirdStage = smoothVisibility(Math.max(0, visualLevel - 2));
  const radiusX = 56 + secondStage * 5 + thirdStage * 4 + hitProgress * 4;
  const radiusY = 80 + secondStage * 5 + thirdStage * 4 + hitProgress * 6;
  const rotation = gameTime * (0.46 + secondStage * 0.12 + thirdStage * 0.1);
  const dotSprite = getPlayerShieldDotSprite();

  drawPlayerShieldInteriorImpact(
    centerX,
    centerY,
    radiusX,
    radiusY,
    hitProgress,
    frontLayer,
  );
  if (!frontLayer) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(centerX, centerY);
  for (let sector = 0; sector < 3; sector += 1) {
    const sectorAngle = -Math.PI / 2 + sector * Math.PI * 2 / 3;
    for (let tier = 0; tier < 3; tier += 1) {
      const visibility = tier === 0 ? firstStage : tier === 1 ? secondStage : thirdStage;
      if (visibility < 0.015) continue;

      const angle = rotation + (tier === 0
        ? sectorAngle
        : tier === 1
          ? sectorAngle + secondStage * Math.PI / 3 - thirdStage * Math.PI / 9
          : sectorAngle + Math.PI / 3 + thirdStage * Math.PI / 9);
      const radialProgress = 0.82 + visibility * 0.18;
      const x = Math.cos(angle) * radiusX * radialProgress;
      const y = Math.sin(angle) * radiusY * radialProgress;
      const dot = sector * 3 + tier;
      const pulse = 0.5 + Math.sin(gameTime * 5.2 + dot * 1.7) * 0.5;
      const size = (13 + thirdStage * 0.8 + pulse * 2 + hitProgress * 5) *
        (0.58 + visibility * 0.42);
      ctx.globalAlpha = Math.min(
        1,
        visibility * (0.82 + pulse * 0.18 + hitProgress * 0.24),
      );
      if (dotSprite) {
        ctx.drawImage(dotSprite, x - size, y - size, size * 2, size * 2);
      } else {
        ctx.fillStyle = "#b86cff";
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, size * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawPlayerUltimateAura(frontLayer) {
  if (!player.ultimateActive || frontLayer) return;
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height + PLAYER_FINISHING_SPRITE_Y_OFFSET -
    PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_FINISHING_SPRITE_SCALE / 2;
  const pulse = 0.5 + Math.sin(gameTime * 24) * 0.5;
  const liftProgress = Math.min(1,
    player.ultimateTime / PLAYER_ULTIMATE_LIFT_DURATION);
  const radiusX = 58 + pulse * 7;
  const radiusY = 88 + liftProgress * 14;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(centerX, centerY);
  ctx.scale(1, radiusY / radiusX);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  glow.addColorStop(0, `rgba(137, 54, 211, ${0.14 + pulse * 0.04})`);
  glow.addColorStop(0.56, `rgba(153, 73, 224, ${0.17 + pulse * 0.05})`);
  glow.addColorStop(0.82, `rgba(185, 79, 255, ${0.09 + pulse * 0.03})`);
  glow.addColorStop(1, "rgba(185, 79, 255, 0)");
  ctx.shadowColor = "#b94fff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const blinking = player.downPhase === "hold" || (!player.downPhase && player.invincible > 0);
  const blinkTime = player.downPhase === "hold"
    ? player.downTime - PLAYER_DOWN_ANIMATION_DURATION : gameTime;
  drawPlayerUltimateAura(false);
  drawPlayerAccelerationShield(false);
  ctx.save();
  // Dim rather than disappear completely, keeping the character easy to locate.
  if (blinking && Math.floor(blinkTime * 10) % 2 !== 0) ctx.globalAlpha *= 0.28;
  const spriteTopY = drawPlayerSprite(player.x + player.width / 2);
  ctx.restore();
  drawPlayerAccelerationShield(true);
  drawPlayerUltimateAura(true);
  if (!player.ultimateActive) drawPlayerFireEnergyGauge(spriteTopY);
}

const PLAYER_GAUGE_STYLE = {
  outer: "rgba(14, 6, 27, 0.9)",
  border: "#7145a2",
  track: "#241331",
  fill: "#a653f5",
  highlight: "#e6b5ff",
};
const MONSTER_GAUGE_STYLES = [0, 60, 120].map((hue) => ({
  outer: "rgba(4, 7, 10, 0.88)",
  border: "rgba(220, 231, 239, 0.6)",
  track: "rgba(33, 38, 43, 0.94)",
  fill: `hsl(${hue}, 92%, 52%)`,
  highlight: `hsl(${hue}, 92%, 76%)`,
}));

function drawPixelGauge(centerX, topY, width, ratio, style) {
  const height = 8;
  const left = pixelSnap(centerX - width / 2, 1);
  const top = pixelSnap(topY, 1);
  const filledWidth = Math.round((width - 4) * Math.max(0, Math.min(1, ratio)));

  ctx.save();
  ctx.fillStyle = style.outer;
  ctx.fillRect(left - 3, top - 3, width + 6, height + 6);
  ctx.fillStyle = style.border;
  ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
  ctx.fillStyle = style.track;
  ctx.fillRect(left, top, width, height);
  if (filledWidth > 0) {
    ctx.fillStyle = style.fill;
    ctx.fillRect(left + 2, top + 2, filledWidth, 4);
    ctx.fillStyle = style.highlight;
    ctx.fillRect(left + 2, top + 2, filledWidth, 2);
  }
  ctx.restore();
}

function drawPlayerFireEnergyGauge(spriteTopY) {
  drawPixelGauge(
    player.x + player.width / 2,
    spriteTopY - 18,
    56,
    player.fireEnergy / PLAYER_FIRE_ENERGY_MAX,
    PLAYER_GAUGE_STYLE,
  );
}

function drawMonsterHealthGauge(enemy, pose) {
  const ratio = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
  const colorStage = ratio > 0.6 ? 2 : ratio > 0.3 ? 1 : 0;
  const spriteTopY = pose.feetY +
    (-enemy.spriteHeight + enemy.spriteBottomOffset) * pose.scaleY;
  drawPixelGauge(
    pose.centerX + pose.hitOffsetX,
    spriteTopY - 13,
    pixelSnap(Math.max(48, Math.min(64, enemy.spriteWidth * 0.54))),
    ratio,
    MONSTER_GAUGE_STYLES[colorStage],
  );
}

function drawTurretHealthGauge(turret, visualBottomY) {
  const ratio = Math.max(0, Math.min(1,
    turret.hp / Math.max(1, turret.maxHp),
  ));
  const colorStage = ratio > 0.6 ? 2 : ratio > 0.3 ? 1 : 0;
  drawPixelGauge(
    turret.x + turret.width / 2,
    visualBottomY - TURRET.spriteHeight + TURRET.spriteBottomOffset - 13,
    Math.max(58, Math.min(72, TURRET.spriteWidth * 0.72)),
    ratio,
    MONSTER_GAUGE_STYLES[colorStage],
  );
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
  const isRunning = playerIsRunningOnGround();
  const isJumping = !player.grounded && !player.ultimateActive;
  const isDeepFalling = isJumping && player.deepFalling;
  const isFiring = controls.fire && playerCanFire() && (
    player.fireEnergy >= PLAYER_FIRE_ENERGY_PER_SHOT || player.fireTimer > 0
  );
  const isCrouching = player.crouching && player.grounded;
  const isAimingHigh = playerIsAimingHigh();
  const isRunningFirePose = isFiring && playerUsesRunningFirePose();
  const sprite = isDownPose
    ? playerSprites.down
    : player.ultimateActive
      ? playerSprites.finishing
      : isCrouching && isFiring
        ? playerSprites.blastSit
        : isCrouching
          ? playerSprites.sit
          : isFiring
            ? isJumping
              ? playerSprites.blastJump
              : isRunningFirePose
                ? playerSprites.blastRun
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
  const spriteYOffset = isDownPose
    ? PLAYER_DOWN_SPRITE_Y_OFFSET
    : player.ultimateActive
      ? PLAYER_FINISHING_SPRITE_Y_OFFSET
      : isFiring
        ? PLAYER_FIRE_SPRITE_Y_OFFSET
        : isCrouching
          ? PLAYER_SIT_SPRITE_Y_OFFSET
          : isJumping
            ? PLAYER_JUMP_SPRITE_Y_OFFSET
            : isRunning
              ? PLAYER_RUN_SPRITE_Y_OFFSET
              : PLAYER_STAND_SPRITE_Y_OFFSET;
  const spriteFeetY = player.y + player.height + spriteYOffset;
  if (!sprite?.loaded || !sprite.image.naturalWidth || !sprite.image.naturalHeight) {
    return spriteFeetY - PLAYER_SPRITE_DRAW_HEIGHT * PLAYER_STAND_SPRITE_SCALE;
  }

  const jumpProgress = Math.min(1, player.jumpAnimationTime / JUMP_ANIMATION_DURATION);
  const frame = isDownPose
    ? Math.min(sprite.frames.length - 1, Math.floor(player.downTime * sprite.fps))
    : sprite === playerSprites.finishing
      ? Math.floor(player.ultimateTime * sprite.fps) % sprite.frames.length
      : sprite === playerSprites.blastRun
        ? Math.floor(player.runAnimationTime * sprite.fps) % sprite.frames.length
        : isFiring
          ? Math.floor(player.fireAnimationTime * sprite.fps) % sprite.frames.length
          : isDeepFalling
            ? Math.floor(player.fallAnimationTime * sprite.fps) % sprite.frames.length
            : isJumping
              ? Math.min(sprite.frames.length - 1, Math.floor(jumpProgress * sprite.frames.length))
              : sprite === playerSprites.run
                ? Math.floor(player.runAnimationTime * sprite.fps) % sprite.frames.length
                : Math.floor(gameTime * sprite.fps) % sprite.frames.length;
  const source = sprite.frames[frame];
  const spriteScale = sprite === playerSprites.down
    ? PLAYER_DOWN_SPRITE_SCALE
    : sprite === playerSprites.finishing
      ? PLAYER_FINISHING_SPRITE_SCALE
      : sprite === playerSprites.stand
        ? PLAYER_STAND_SPRITE_SCALE
        : sprite === playerSprites.blastHigh
          ? PLAYER_BLAST_HIGH_SPRITE_SCALE
          : sprite === playerSprites.blastRun
            ? PLAYER_BLAST_RUN_SPRITE_SCALE
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
  const feetY = spriteFeetY;

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

function drawCombatantPhysicsDebug(target, color) {
  if (!TEST_MODE || !showMonsterArea || !target.alive) return;
  const hitbox = MONSTER_TYPES[target.kind]
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
  if (enemy.kind === "monster3") {
    const eye = monster3EyeOrigin(enemy);
    ctx.setLineDash([8, 6]);
    ctx.fillStyle = "rgba(255, 157, 81, 0.025)";
    ctx.strokeStyle = "rgba(255, 172, 99, 0.22)";
    ctx.lineWidth = 1;
    ctx.fillRect(eye.x - enemy.attackRange, eye.y - 640, enemy.attackRange * 2, 1280);
    ctx.strokeRect(eye.x - enemy.attackRange, eye.y - 640, enemy.attackRange * 2, 1280);
    ctx.restore();
    return;
  }
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
  if (enemy.kind === "monster4") {
    const origin = monster4SpearOrigin(enemy);
    ctx.setLineDash([8, 5]);
    ctx.fillStyle = "rgba(255, 47, 63, 0.035)";
    ctx.strokeStyle = "rgba(255, 79, 88, 0.3)";
    ctx.fillRect(
      origin.x - enemy.spearAttackRange,
      origin.y - enemy.spearAttackVerticalRange,
      enemy.spearAttackRange * 2,
      enemy.spearAttackVerticalRange * 2,
    );
    ctx.strokeRect(
      origin.x - enemy.spearAttackRange,
      origin.y - enemy.spearAttackVerticalRange,
      enemy.spearAttackRange * 2,
      enemy.spearAttackVerticalRange * 2,
    );
  }
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

function drawMonster3Charge(enemy) {
  if (enemy.kind !== "monster3" || enemy.state !== "charge") return;
  const eye = monster3EyeOrigin(enemy);
  const progress = Math.max(0, Math.min(1,
    1 - enemy.stateTimer / enemy.chargeDuration,
  ));
  const pulse = 0.78 + Math.sin(gameTime * 28) * 0.22;
  ctx.save();
  ctx.translate(pixelSnap(eye.x), pixelSnap(eye.y));
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "#ff7944";
  ctx.shadowBlur = 10 + progress * 18;
  ctx.fillStyle = `rgba(255, 89, 42, ${0.35 + progress * 0.45})`;
  ctx.beginPath();
  ctx.arc(0, 0, (6 + progress * 10) * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 5;
  ctx.fillStyle = "#fff4b5";
  ctx.fillRect(-2, -2, 4, 4);
  ctx.fillStyle = "#ffb060";
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + gameTime * 1.6;
    const radius = 28 - progress * 17;
    ctx.fillRect(
      pixelSnap(Math.cos(angle) * radius),
      pixelSnap(Math.sin(angle) * radius),
      3 + progress * 2,
      3 + progress * 2,
    );
  }
  ctx.restore();
}

function traceMonster4Crescent(context, radius) {
  const cutoutRadius = radius * 0.74;
  const cutoutX = -radius * 0.36;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.moveTo(cutoutX + cutoutRadius, 0);
  context.arc(cutoutX, 0, cutoutRadius, 0, Math.PI * 2);
}

function drawMonster4SpearCharge(enemy) {
  if (enemy.kind !== "monster4" || enemy.state !== "spear-charge") return;
  const origin = monster4SpearOrigin(enemy);
  const direction = enemy.attackDirection || enemy.facing || -1;
  const progress = Math.max(0, Math.min(1,
    1 - enemy.stateTimer / enemy.spearChargeDuration,
  ));
  const pulse = 0.82 + Math.sin(gameTime * 24 + enemy.animationPhase) * 0.18;
  ctx.save();
  ctx.translate(pixelSnap(origin.x), pixelSnap(origin.y));
  ctx.scale(direction, 1);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "square";
  for (let shard = 0; shard < 6; shard += 1) {
    const phase = (gameTime * 3.2 + shard / 6 + enemy.animationPhase) % 1;
    const distance = 62 - phase * (38 + progress * 20);
    const y = (shard - 2.5) * (7 - progress * 2) * (1 - phase * 0.5);
    ctx.globalAlpha = 0.34 + progress * 0.42 + phase * 0.18;
    ctx.strokeStyle = shard % 2 === 0 ? "#ff3049" : "#ff8c72";
    ctx.lineWidth = shard % 2 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pixelSnap(distance + 13), pixelSnap(y));
    ctx.lineTo(pixelSnap(distance), pixelSnap(y * 0.58));
    ctx.stroke();
  }
  const crescentRadius = 6 + progress * 12;
  ctx.globalAlpha = (0.45 + progress * 0.5) * pulse;
  ctx.shadowColor = "#ff233f";
  ctx.shadowBlur = 8 + progress * 12;
  ctx.fillStyle = "#ff334f";
  traceMonster4Crescent(ctx, crescentRadius);
  ctx.fill("evenodd");
  ctx.shadowBlur = 0;
  ctx.globalAlpha = Math.min(1, 0.62 + progress * 0.38);
  ctx.strokeStyle = "#fff1df";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffb1b9";
  ctx.fillRect(crescentRadius * 0.42, -2, 4, 4);
  ctx.restore();
}

function drawEnemy(enemy) {
  const sprite = enemySprites[enemy.kind];
  const isMonster2 = enemy.kind === "monster2";
  const isMonster3 = enemy.kind === "monster3";
  const isMonster4 = enemy.kind === "monster4";
  const pose = enemySpritePose(enemy);

  ctx.save();
  ctx.translate(
    pose.centerX,
    pose.feetY,
  );
  ctx.translate(pose.hitOffsetX, 0);
  if (!isMonster3 && !isMonster4) {
    const groundGlow = enemy.crimsonVariant ? "255, 42, 65" : "72, 255, 48";
    ctx.fillStyle = `rgba(${groundGlow}, 0.08)`;
    ctx.fillRect(-pixelSnap(enemy.width * 0.55), -6, pixelSnap(enemy.width * 1.1), 6);
    ctx.fillStyle = `rgba(${groundGlow}, 0.18)`;
    ctx.fillRect(-pixelSnap(enemy.width * 0.42), -4, pixelSnap(enemy.width * 0.84), 4);
  }
  const spriteDirection = enemy.facing * (enemy.spriteFacing ?? 1);
  ctx.transform(spriteDirection * pose.scaleX, 0, 0, pose.scaleY, 0, 0);

  if (sprite?.loaded && sprite.image.naturalWidth && sprite.image.naturalHeight) {
    ctx.imageSmoothingEnabled = false;
    if (isMonster4 && enemy.state === "spear-charge") {
      const chargeProgress = Math.max(0, Math.min(1,
        1 - enemy.stateTimer / enemy.spearChargeDuration,
      ));
      const pulse = 0.95 + Math.sin(gameTime * 24) * 0.08;
      ctx.filter = `sepia(1) saturate(${4 + chargeProgress * 5}) hue-rotate(310deg) brightness(${pulse + chargeProgress * 0.32})`;
    } else if (enemy.crimsonVariant) {
      ctx.filter = `sepia(1) saturate(7) hue-rotate(315deg) contrast(1.16) brightness(${pose.hitPulse > 0 ? 1.48 : 0.92})`;
    } else if (pose.hitPulse > 0) {
      ctx.filter = "brightness(1.65) saturate(1.35)";
    }
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
    ctx.fillStyle = enemy.crimsonVariant ? "#d51d37" : "#34d728";
    ctx.fillRect(-enemy.width * 0.35, -enemy.height * 0.76, enemy.width * 0.7, enemy.height * 0.52);
    ctx.fillStyle = enemy.crimsonVariant ? "#ff8a91" : "#b7ff6a";
    ctx.fillRect(-8, -enemy.height * 0.68, 16, 12);
  }
  ctx.restore();
  if (isMonster2) drawMonster2Attack(enemy);
  if (isMonster3) drawMonster3Charge(enemy);
  if (isMonster4) drawMonster4SpearCharge(enemy);
  drawMonsterHealthGauge(enemy, pose);
}

// Local sprite coordinates: base, armor plates, then the gun housing.
const TURRET_DAMAGE_CRACKS = [
  [[-44, -31], [-36, -29], [-32, -23], [-25, -21]],
  [[14, -31], [8, -26], [12, -20], [6, -15]],
  [[-18, -73], [-14, -66], [-19, -59], [-15, -52]],
  [[28, -32], [35, -28], [33, -22], [40, -17]],
  [[-29, -99], [-24, -92], [-26, -83], [-20, -78]],
  [[3, -88], [9, -82], [5, -75], [10, -68]],
  [[8, -119], [14, -115], [17, -110], [23, -105]],
  [[-5, -40], [1, -36], [-2, -29], [4, -24]],
  [[-39, -70], [-33, -66], [-30, -59], [-25, -55]],
  [[20, -66], [25, -61], [23, -54], [29, -49]],
  [[26, -124], [31, -120], [33, -113], [40, -110]],
  [[-10, -122], [-6, -116], [-9, -110], [-4, -102]],
  [[0, -61], [6, -56], [3, -48], [9, -43]],
  [[41, -29], [47, -23], [44, -16], [50, -12]],
];

function drawTurretDamageCracks(turret) {
  const damage = Math.max(0, Math.min(
    TURRET_DAMAGE_CRACKS.length,
    Math.ceil((turret.maxHp ?? TURRET.hp) - turret.hp),
  ));
  if (damage === 0) return;

  ctx.save();
  ctx.lineJoin = "miter";
  ctx.lineCap = "square";
  for (let crack = 0; crack < damage; crack += 1) {
    const points = TURRET_DAMAGE_CRACKS[crack];
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let point = 1; point < points.length; point += 1) {
      ctx.lineTo(points[point][0], points[point][1]);
    }
    ctx.strokeStyle = "#100a19";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = damage >= 9 ? "#c477e0" : "#8650a2";
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTurret(turret) {
  const bottomY = turret.y + turret.height;
  const visualBottomY = bottomY + TURRET.visualGroundOffset;
  const charge = turret.active && turret.burstShotsRemaining === 0 && turret.fireTimer <= TURRET.chargeDuration
    ? Math.max(0, Math.min(1, 1 - turret.fireTimer / TURRET.chargeDuration))
    : 0;
  const recoil = Math.max(0, turret.recoilTimer / 0.2);
  const hitPulse = Math.max(0, turret.hitTimer / 0.18);
  const pulse = 0.72 + Math.sin(gameTime * 19 + turret.animationPhase) * 0.28;

  ctx.save();
  ctx.translate(
    pixelSnap(turret.x + turret.width / 2 - turret.facing * recoil * 5),
    pixelSnap(visualBottomY),
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
  drawTurretDamageCracks(turret);
  ctx.restore();

  drawTurretHealthGauge(turret, visualBottomY);

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
  // A dark, stepped silhouette keeps the flame readable as pixel art.
  ctx.shadowBlur = 0;
  for (let segment = 0; segment < 9; segment += 1) {
    const taper = segment / 8;
    const x = pixelSnap(-radius * 2.7 + radius * 1.9 * taper - 1);
    const waviness = Math.sin(gameTime * 22 + bullet.phase + segment * 1.3) * (1 - taper) * 3;
    const halfHeight = Math.max(2, pixelSnap(radius * (0.12 + taper * 0.56)));
    ctx.fillStyle = "#86271c";
    ctx.fillRect(x, pixelSnap(waviness - halfHeight - 2), 10, halfHeight * 2 + 4);
  }
  drawPixelFireballDisk(radius, "#86271c", 2);
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
  drawPixelFireballDisk(Math.max(2, radius - 2), "#e64b21", 4);
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

function drawMonster4Crescent(bullet) {
  const travelProgress = Math.max(0, Math.min(1,
    1 - bullet.remainingRange / Math.max(1, bullet.initialRange),
  ));
  const pulse = 0.94 + Math.sin(gameTime * 28 + (bullet.phase ?? 0)) * 0.06;
  const fade = Math.pow(1 - travelProgress, 0.28);
  const radius = 24 * pulse;
  ctx.save();
  ctx.translate(pixelSnap(bullet.x), pixelSnap(bullet.y));
  ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = fade;
  ctx.shadowColor = "#ff244d";
  ctx.shadowBlur = 11;
  ctx.fillStyle = "#ff3158";
  traceMonster4Crescent(ctx, radius);
  ctx.fill("evenodd");
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ff91a7";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#ffe5df";
  ctx.fillRect(pixelSnap(radius * 0.56), -8, 5, 4);
  ctx.fillRect(pixelSnap(radius * 0.72), -2, 6, 4);
  ctx.fillRect(pixelSnap(radius * 0.56), 6, 5, 4);
  ctx.globalAlpha = fade * 0.62;
  ctx.fillStyle = "#ff4968";
  ctx.fillRect(-radius - 9, -8, 6, 4);
  ctx.fillRect(-radius - 15, -1, 8, 3);
  ctx.fillRect(-radius - 8, 6, 5, 4);
  ctx.restore();
}

function paintPlayerProjectile(context, shimmer = 1, trailLength = 36) {
  const normalizedTrailLength = Math.max(36, trailLength);
  const mainStartX = 17 - normalizedTrailLength;
  const trailEndX = mainStartX - 1;
  context.lineCap = "round";
  context.shadowColor = "#b35cff";
  context.shadowBlur = 20 * shimmer;
  context.strokeStyle = "rgba(181, 108, 255, 0.72)";
  context.lineWidth = 8.5 * shimmer;
  context.beginPath();
  context.moveTo(mainStartX, 0);
  context.lineTo(14, 0);
  context.stroke();
  context.shadowBlur = 8;
  context.strokeStyle = "#c996ff";
  context.lineWidth = 4.5;
  context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = "#fffaff";
  context.lineWidth = 2;
  context.stroke();

  context.strokeStyle = "rgba(185, 124, 255, 0.42)";
  context.lineWidth = 2.25 * shimmer;
  context.beginPath();
  context.moveTo(-normalizedTrailLength, 0);
  context.lineTo(trailEndX, 0);
  context.stroke();
  context.shadowBlur = 5;
  context.globalAlpha *= shimmer;
  context.fillStyle = "#eddaff";
  context.fillRect(trailEndX - 6, -5, 2, 2);
  context.fillRect(-normalizedTrailLength + 2, 3, 2, 2);
  context.fillStyle = "#ffffff";
  context.fillRect(5, -1, 8, 2);
  context.fillRect(8, -4, 2, 8);
}

let playerProjectileSprite = null;
let playerProjectileSpriteAttempted = false;
const playerUltimateLaserSpriteCache = new Map();

function cachedCanvasSprite(cache, key, width, height, paint) {
  if (cache.has(key)) return cache.get(key);
  const backingWidth = Math.ceil(width * 2);
  const backingHeight = Math.ceil(height * 2);
  const sprite = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(backingWidth, backingHeight)
    : typeof document !== "undefined" ? document.createElement?.("canvas") : null;
  if (!sprite) return null;
  sprite.width = backingWidth;
  sprite.height = backingHeight;
  const spriteContext = sprite.getContext?.("2d");
  if (!spriteContext) return null;
  spriteContext.scale(2, 2);
  paint(spriteContext);
  cache.set(key, sprite);
  return sprite;
}

function getPlayerProjectileSprite() {
  if (playerProjectileSpriteAttempted) return playerProjectileSprite;
  playerProjectileSpriteAttempted = true;
  const sprite = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(224, 120)
    : document.createElement?.("canvas");
  if (!sprite) return null;
  sprite.width = 224;
  sprite.height = 120;
  const spriteContext = sprite.getContext?.("2d");
  if (!spriteContext) return null;
  spriteContext.scale(2, 2);
  spriteContext.translate(56, 30);
  spriteContext.globalCompositeOperation = "lighter";
  paintPlayerProjectile(spriteContext);
  playerProjectileSprite = sprite;
  return sprite;
}

function paintPlayerUltimateLaser(context, length) {
  paintPlayerProjectile(context, 1, length);
}

function getPlayerUltimateLaserSprite() {
  const spriteLength = PLAYER_ULTIMATE_LASER_LENGTH;
  const horizontalPadding = 28;
  const width = spriteLength + horizontalPadding * 2;
  const height = 60;
  return cachedCanvasSprite(
    playerUltimateLaserSpriteCache,
    `ultimate-laser-${spriteLength}`,
    width,
    height,
    (spriteContext) => {
      spriteContext.translate(spriteLength + horizontalPadding, height / 2);
      spriteContext.globalCompositeOperation = "lighter";
      paintPlayerUltimateLaser(spriteContext, spriteLength);
    },
  );
}

function drawPlayerUltimateLaser(laser) {
  const shimmer = 0.9 + Math.sin(
    gameTime * 12 + laser.x * 0.008 + laser.y * 0.004,
  ) * 0.1;
  const length = laser.visibleLength ??
    laser.beamLength ?? PLAYER_ULTIMATE_LASER_LENGTH;
  const spriteLength = PLAYER_ULTIMATE_LASER_LENGTH;
  const horizontalPadding = 28;
  const spriteWidth = spriteLength + horizontalPadding * 2;
  const spriteHeight = 60;
  const sprite = getPlayerUltimateLaserSprite();
  ctx.save();
  ctx.translate(laser.x, laser.y);
  ctx.rotate(Math.atan2(laser.vy, laser.vx));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= shimmer;
  if (sprite) {
    ctx.scale(Math.max(0.1, Math.min(1, length / spriteLength)), 1);
    ctx.drawImage(
      sprite,
      -(spriteLength + horizontalPadding),
      -spriteHeight / 2,
      spriteWidth,
      spriteHeight,
    );
  } else {
    paintPlayerProjectile(ctx, shimmer, length);
  }
  ctx.restore();
}

function drawProjectiles() {
  const playerSprite = bullets.some((bullet) => bullet.kind !== "player-ultimate-laser")
    ? getPlayerProjectileSprite()
    : null;
  for (const bullet of bullets) {
    const drawMargin = bullet.kind === "player-ultimate-laser"
      ? (bullet.beamLength ?? PLAYER_ULTIMATE_LASER_LENGTH) + 100
      : 100;
    if (
      bullet.x < cameraX - drawMargin || bullet.x > cameraX + WIDTH + drawMargin ||
      bullet.y < cameraY - drawMargin || bullet.y > cameraY + HEIGHT + drawMargin
    ) continue;
    if (bullet.kind === "player-ultimate-laser") {
      drawPlayerUltimateLaser(bullet);
      continue;
    }
    const shimmer = 0.9 + Math.sin(gameTime * 12 + bullet.x * 0.008 + bullet.y * 0.004) * 0.1;
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.globalCompositeOperation = "lighter";
    if (playerSprite) {
      ctx.globalAlpha *= shimmer;
      ctx.drawImage(playerSprite, -56, -30, 112, 60);
    } else {
      paintPlayerProjectile(ctx, shimmer);
    }
    ctx.restore();
  }

  for (const bullet of enemyBullets) {
    if (
      bullet.x < cameraX - 100 || bullet.x > cameraX + WIDTH + 100 ||
      bullet.y < cameraY - 100 || bullet.y > cameraY + HEIGHT + 100
    ) continue;
    if (bullet.kind === "monster2-fireball") {
      drawMonster2Fireball(bullet);
      continue;
    }
    if (bullet.kind === "monster4-crescent") {
      drawMonster4Crescent(bullet);
      continue;
    }
    if (bullet.kind === "monster3-laser") {
      const pulse = 0.85 + Math.sin(gameTime * 32) * 0.15;
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.shadowColor = "#ff6c40";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(255, 91, 46, 0.45)";
      ctx.lineWidth = 15 * pulse;
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.shadowBlur = 7;
      ctx.strokeStyle = "#ffac62";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff6bd";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#fff8d4";
      ctx.fillRect(11, -2, 6, 4);
      ctx.restore();
      continue;
    }
    if (bullet.kind === "turret-laser") {
      const pulse = 0.86 + Math.sin(gameTime * 28) * 0.14;
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#dc216f";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(91, 8, 56, 0.94)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
      ctx.fill();
      const orb = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
      orb.addColorStop(0, "#fff3f8");
      orb.addColorStop(0.24, "#ff8abd");
      orb.addColorStop(0.58, "#d93482");
      orb.addColorStop(1, "#5b103c");
      ctx.shadowBlur = 11;
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 160, 204, 0.92)";
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

function crimsonGrenadeNoise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const crimsonGrenadeGlowSpriteCache = new Map();

function crimsonGrenadeGlowSprite() {
  return cachedCanvasSprite(
    crimsonGrenadeGlowSpriteCache,
    "crimson-grenade-glow",
    128,
    128,
    (spriteContext) => {
      const glow = spriteContext.createRadialGradient(64, 64, 2, 64, 64, 60);
      glow.addColorStop(0, "rgba(255, 245, 196, 0.98)");
      glow.addColorStop(0.2, "rgba(255, 119, 42, 0.82)");
      glow.addColorStop(0.5, "rgba(239, 38, 54, 0.46)");
      glow.addColorStop(1, "rgba(104, 8, 28, 0)");
      spriteContext.fillStyle = glow;
      spriteContext.fillRect(4, 4, 120, 120);
    },
  );
}

function drawCrimsonGrenadeBlast(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const eased = 1 - (1 - progress) ** 2.4;
  const phase = particle.phase ?? 0;
  const spread = particle.size * (0.08 + eased * 0.68);
  const coreSize = particle.size * (0.08 + Math.pow(remaining, 0.65) * 0.2);
  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 0.68) * 0.96;
  const glowSprite = crimsonGrenadeGlowSprite();
  if (glowSprite) {
    const glowSize = Math.max(coreSize * 3.8, spread * 1.72);
    ctx.globalAlpha = Math.pow(remaining, 0.74) * 0.9;
    ctx.drawImage(
      glowSprite,
      -glowSize / 2,
      -glowSize / 2,
      glowSize,
      glowSize,
    );
    ctx.globalAlpha = Math.pow(remaining, 0.68) * 0.96;
  }

  const coreBlocks = [
    [-0.56, -0.28, 1.12, 0.56, "#fff3bd"],
    [-0.32, -0.68, 0.62, 1.34, "#ffc247"],
    [-0.78, -0.1, 0.34, 0.48, "#ff642e"],
    [0.43, -0.32, 0.46, 0.58, "#ff642e"],
    [-0.18, -0.86, 0.42, 0.3, "#ff8d32"],
    [-0.3, 0.54, 0.58, 0.35, "#e9263d"],
  ];
  for (const [x, y, width, height, color] of coreBlocks) {
    ctx.fillStyle = color;
    ctx.fillRect(
      pixelSnap(x * coreSize),
      pixelSnap(y * coreSize),
      Math.max(2, pixelSnap(width * coreSize)),
      Math.max(2, pixelSnap(height * coreSize)),
    );
  }

  for (let ray = 0; ray < 18; ray += 1) {
    const seed = phase * 91.7 + ray * 7.31;
    const angle = crimsonGrenadeNoise(seed) * Math.PI * 2;
    const reachNoise = crimsonGrenadeNoise(seed + 3.7);
    const lengthNoise = crimsonGrenadeNoise(seed + 8.9);
    const reach = spread * (0.42 + reachNoise * 0.72);
    const length = particle.size * (0.055 + lengthNoise * 0.15) *
      (0.45 + Math.pow(remaining, 0.4) * 0.75);
    const thickness = Math.max(2, pixelSnap(2 + remaining * (2 + reachNoise * 3)));
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = ray % 5 === 0 ? "#fff3bd"
      : ray % 2 === 0 ? "#ff642e" : "#e9263d";
    ctx.fillRect(pixelSnap(reach), -thickness / 2, Math.max(3, pixelSnap(length)), thickness);
    const shardGap = 5 + crimsonGrenadeNoise(seed + 11.2) * 14;
    const shardSize = Math.max(2, pixelSnap(thickness * (0.55 + lengthNoise * 0.5)));
    ctx.fillStyle = ray % 3 === 0 ? "#ffc247" : "#ff3048";
    ctx.fillRect(
      pixelSnap(reach + length + shardGap),
      pixelSnap((reachNoise - 0.5) * 9),
      Math.max(2, pixelSnap(shardSize * (1.3 + lengthNoise))),
      shardSize,
    );
    ctx.restore();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = Math.pow(remaining, 1.2) * 0.48;
  for (let smoke = 0; smoke < 7; smoke += 1) {
    const seed = phase * 47.3 + smoke * 9.17;
    const offsetX = (crimsonGrenadeNoise(seed) - 0.5) * spread * 0.8;
    const offsetY = -spread * (0.12 + crimsonGrenadeNoise(seed + 4.1) * 0.58);
    const size = Math.max(3, pixelSnap(5 + crimsonGrenadeNoise(seed + 8.4) * 12));
    ctx.fillStyle = smoke % 2 === 0 ? "#551d2b" : "#76252c";
    ctx.fillRect(pixelSnap(offsetX), pixelSnap(offsetY), size, Math.max(3, pixelSnap(size * 0.68)));
  }
  ctx.restore();
}

function drawTurretMushroomBlastPixel(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const phase = particle.phase ?? 0;
  const rise = 1 - (1 - progress) ** 2.2;
  const capGrowth = Math.min(1, progress / 0.56);
  const size = particle.size;
  const capY = -size * (0.16 + rise * 0.46);
  const capWidth = size * (0.22 + capGrowth * 0.65);
  const stemHeight = Math.max(size * 0.12, -capY - size * 0.03);
  const fade = Math.min(1, remaining * 3.4);

  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.globalAlpha = fade;

  if (progress < 0.52) {
    const shockProgress = progress / 0.52;
    const shockFade = 1 - shockProgress;
    ctx.globalCompositeOperation = "lighter";
    for (const direction of [-1, 1]) {
      for (let layer = 0; layer < 3; layer += 1) {
        const length = size * (0.1 + shockProgress * (0.22 + layer * 0.08));
        const thickness = Math.max(2, pixelSnap(5 - layer + shockFade * 3));
        ctx.globalAlpha = fade * shockFade * (0.92 - layer * 0.18);
        ctx.fillStyle = layer === 0 ? "#fff2a8"
          : layer === 1 ? "#ff9c2f" : "#e54432";
        ctx.fillRect(
          pixelSnap(direction > 0 ? size * 0.06 : -size * 0.06 - length),
          pixelSnap(layer * 5 - 2),
          Math.max(4, pixelSnap(length)),
          thickness,
        );
      }
    }
    ctx.globalAlpha = fade;
    ctx.globalCompositeOperation = "source-over";
  }

  if (progress < 0.36) {
    const flashRemaining = 1 - progress / 0.36;
    ctx.globalCompositeOperation = "lighter";
    for (let ray = 0; ray < 12; ray += 1) {
      const seed = phase * 83.1 + ray * 6.73;
      const angle = Math.PI + (ray / 11) * Math.PI;
      const reach = size * (0.14 + (1 - flashRemaining) * 0.25) *
        (0.8 + crimsonGrenadeNoise(seed) * 0.35);
      const thickness = Math.max(2, pixelSnap(size * (0.018 + flashRemaining * 0.018)));
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = ray % 3 === 0 ? "#fff2a8"
        : ray % 2 === 0 ? "#ffb12f" : "#ff5a2f";
      ctx.fillRect(
        pixelSnap(size * 0.04),
        -thickness / 2,
        Math.max(4, pixelSnap(reach)),
        thickness,
      );
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  for (let segment = 0; segment < 8; segment += 1) {
    const segmentProgress = segment / 7;
    const seed = phase * 51.7 + segment * 4.91;
    const segmentWidth = size * (0.14 - segmentProgress * 0.045) *
      (0.86 + crimsonGrenadeNoise(seed) * 0.24);
    const segmentHeight = stemHeight / 7 + 3;
    const offsetX = (crimsonGrenadeNoise(seed + 2.8) - 0.5) * size * 0.045;
    const y = -segmentProgress * stemHeight;
    ctx.fillStyle = segment % 2 === 0 ? "#552b35" : "#78302f";
    ctx.fillRect(
      pixelSnap(offsetX - segmentWidth / 2),
      pixelSnap(y - segmentHeight),
      Math.max(4, pixelSnap(segmentWidth)),
      Math.max(4, pixelSnap(segmentHeight + 2)),
    );
    if (progress < 0.84) {
      const coreWidth = segmentWidth * (0.28 + remaining * 0.26);
      ctx.fillStyle = segment % 3 === 0 ? "#fff2a8"
        : segment % 2 === 0 ? "#ffb12f" : "#f15a30";
      ctx.fillRect(
        pixelSnap(offsetX - coreWidth / 2),
        pixelSnap(y - segmentHeight * 0.82),
        Math.max(3, pixelSnap(coreWidth)),
        Math.max(3, pixelSnap(segmentHeight * 0.68)),
      );
    }
    const veinX = offsetX + (crimsonGrenadeNoise(seed + 6.4) - 0.5) * segmentWidth * 0.58;
    ctx.fillStyle = segment % 3 === 0 ? "#ffd36a" : "#b74432";
    ctx.fillRect(
      pixelSnap(veinX),
      pixelSnap(y - segmentHeight * 0.58),
      Math.max(2, pixelSnap(segmentWidth * 0.13)),
      Math.max(2, pixelSnap(segmentHeight * 0.22)),
    );
    ctx.fillStyle = "#322630";
    ctx.fillRect(
      pixelSnap(offsetX - segmentWidth * 0.42),
      pixelSnap(y - segmentHeight * (0.25 + crimsonGrenadeNoise(seed + 9.3) * 0.45)),
      Math.max(2, pixelSnap(segmentWidth * 0.11)),
      Math.max(2, pixelSnap(segmentHeight * 0.18)),
    );
  }

  const capRows = [0.42, 0.72, 0.96, 1, 0.82, 0.55];
  const rowHeight = Math.max(5, pixelSnap(size * 0.055));
  for (let row = 0; row < capRows.length; row += 1) {
    const seed = phase * 67.3 + row * 8.17;
    const width = capWidth * capRows[row];
    const offsetX = (crimsonGrenadeNoise(seed) - 0.5) * size * 0.045;
    const y = capY + (row - 2.4) * rowHeight;
    ctx.fillStyle = row < 2 ? "#4b2b35"
      : row % 2 === 0 ? "#6a3033" : "#893530";
    ctx.fillRect(
      pixelSnap(offsetX - width / 2),
      pixelSnap(y),
      Math.max(6, pixelSnap(width)),
      rowHeight + 2,
    );
    if (progress < 0.78 && row > 0 && row < capRows.length - 1) {
      const innerWidth = width * (0.4 + remaining * 0.18);
      ctx.fillStyle = row % 2 === 0 ? "#ff6a30" : "#ffb12f";
      ctx.fillRect(
        pixelSnap(offsetX - innerWidth / 2),
        pixelSnap(y + rowHeight * 0.18),
        Math.max(4, pixelSnap(innerWidth)),
        Math.max(3, pixelSnap(rowHeight * 0.62)),
      );
    }
    for (let detail = 0; detail < 3; detail += 1) {
      const detailSeed = seed + 12.4 + detail * 3.77;
      const detailX = offsetX + (crimsonGrenadeNoise(detailSeed) - 0.5) * width * 0.82;
      const detailY = y + rowHeight * (0.16 + crimsonGrenadeNoise(detailSeed + 1.9) * 0.56);
      const detailWidth = Math.max(2, pixelSnap(
        2 + crimsonGrenadeNoise(detailSeed + 5.1) * size * 0.025,
      ));
      ctx.fillStyle = detail === 0 && progress < 0.72 ? "#ffc85a"
        : detail % 2 === 0 ? "#b54334" : "#2b2430";
      ctx.fillRect(
        pixelSnap(detailX),
        pixelSnap(detailY),
        detailWidth,
        Math.max(2, pixelSnap(detailWidth * 0.58)),
      );
    }
  }

  for (let lobe = 0; lobe < 12; lobe += 1) {
    const seed = phase * 39.4 + lobe * 7.53;
    const across = lobe / 11 - 0.5;
    const lobeSize = size * (0.055 + crimsonGrenadeNoise(seed) * 0.045);
    const x = across * capWidth * 0.92;
    const y = capY - Math.cos(across * Math.PI) * size * 0.12 +
      (crimsonGrenadeNoise(seed + 4.2) - 0.5) * size * 0.035;
    ctx.fillStyle = lobe % 3 === 0 ? "#3f2934"
      : lobe % 2 === 0 ? "#672d31" : "#91352e";
    ctx.fillRect(
      pixelSnap(x - lobeSize / 2),
      pixelSnap(y - lobeSize / 2),
      Math.max(4, pixelSnap(lobeSize)),
      Math.max(4, pixelSnap(lobeSize * 0.72)),
    );
    if (lobe % 2 === 0) {
      ctx.fillStyle = lobe % 4 === 0 ? "#c34d38" : "#552832";
      ctx.fillRect(
        pixelSnap(x - lobeSize * 0.12),
        pixelSnap(y - lobeSize * 0.2),
        Math.max(2, pixelSnap(lobeSize * 0.28)),
        Math.max(2, pixelSnap(lobeSize * 0.18)),
      );
    }
  }

  const rimY = capY + rowHeight * 3.12;
  ctx.globalCompositeOperation = "lighter";
  for (let rim = 0; rim < 11; rim += 1) {
    const seed = phase * 73.6 + rim * 6.19;
    const across = rim / 10 - 0.5;
    const rimWidth = size * (0.034 + crimsonGrenadeNoise(seed) * 0.025);
    const rimHeight = size * (0.025 + crimsonGrenadeNoise(seed + 3.1) * 0.025);
    const x = across * capWidth * 0.83;
    const y = rimY + Math.abs(across) * rowHeight * 0.5;
    ctx.fillStyle = rim % 3 === 0 ? "#fff0a0"
      : rim % 2 === 0 ? "#ffb12f" : "#f05a30";
    ctx.fillRect(
      pixelSnap(x - rimWidth / 2),
      pixelSnap(y),
      Math.max(3, pixelSnap(rimWidth)),
      Math.max(3, pixelSnap(rimHeight)),
    );
    if (rim % 2 === 0) {
      ctx.fillStyle = "#ffe57c";
      ctx.fillRect(
        pixelSnap(x - rimWidth * 0.18),
        pixelSnap(y + rimHeight),
        Math.max(2, pixelSnap(rimWidth * 0.36)),
        Math.max(2, pixelSnap(rimHeight * 0.65)),
      );
    }
  }

  if (progress < 0.82) {
    const cinderFade = 1 - progress / 0.82;
    ctx.globalAlpha = fade * (0.5 + cinderFade * 0.5);
    for (let cinder = 0; cinder < 14; cinder += 1) {
      const seed = phase * 91.2 + cinder * 9.73;
      const direction = crimsonGrenadeNoise(seed) < 0.5 ? -1 : 1;
      const travel = size * progress *
        (0.2 + crimsonGrenadeNoise(seed + 1.8) * 0.55);
      const x = direction * (capWidth * 0.16 + travel) +
        (crimsonGrenadeNoise(seed + 4.2) - 0.5) * size * 0.08;
      const y = -size * (0.04 + crimsonGrenadeNoise(seed + 7.5) * 0.55) -
        progress * size * 0.18;
      const cinderSize = Math.max(2, pixelSnap(2 + crimsonGrenadeNoise(seed + 11.1) * 5));
      ctx.fillStyle = cinder % 4 === 0 ? "#fff3ad"
        : cinder % 2 === 0 ? "#ff9e31" : "#e84631";
      ctx.fillRect(pixelSnap(x), pixelSnap(y), cinderSize * 1.6, cinderSize);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = fade;

  if (progress > 0.22) {
    for (let wisp = 0; wisp < 8; wisp += 1) {
      const seed = phase * 44.9 + wisp * 10.31;
      const drift = (crimsonGrenadeNoise(seed) - 0.5) * capWidth * 0.82;
      const lift = size * (0.1 + progress * 0.16 +
        crimsonGrenadeNoise(seed + 5.7) * 0.14);
      const wispSize = size * (0.025 + crimsonGrenadeNoise(seed + 9.2) * 0.035);
      ctx.fillStyle = wisp % 3 === 0 ? "#362a35"
        : wisp % 2 === 0 ? "#4c2c35" : "#653032";
      ctx.fillRect(
        pixelSnap(drift - wispSize / 2),
        pixelSnap(capY - lift),
        Math.max(3, pixelSnap(wispSize)),
        Math.max(3, pixelSnap(wispSize * 0.72)),
      );
      ctx.fillStyle = wisp % 2 === 0 ? "#2b2630" : "#4a2931";
      ctx.fillRect(
        pixelSnap(drift + wispSize * 0.18),
        pixelSnap(capY - lift - wispSize * 0.72),
        Math.max(2, pixelSnap(wispSize * 0.45)),
        Math.max(2, pixelSnap(wispSize * 0.36)),
      );
    }
  }

  if (progress < 0.74) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade * (1 - progress / 0.74) * 0.86;
    for (let ember = 0; ember < 10; ember += 1) {
      const seed = phase * 106.7 + ember * 5.83;
      const direction = ember % 2 === 0 ? -1 : 1;
      const x = direction * size *
        (0.08 + crimsonGrenadeNoise(seed) * (0.24 + progress * 0.34));
      const y = size * (0.015 + crimsonGrenadeNoise(seed + 3.4) * 0.045);
      const emberWidth = Math.max(2, pixelSnap(2 + crimsonGrenadeNoise(seed + 6.8) * 5));
      ctx.fillStyle = ember % 3 === 0 ? "#fff0a0"
        : ember % 2 === 0 ? "#ff9d32" : "#e84a31";
      ctx.fillRect(
        pixelSnap(x),
        pixelSnap(y),
        emberWidth,
        Math.max(2, pixelSnap(emberWidth * 0.5)),
      );
    }
  }

  ctx.restore();
}

const turretExplosionBlobCache = new Map();

function turretExplosionBlobSprite(tone) {
  const palette = {
    charcoal: ["rgba(37, 34, 42, 0.96)", "rgba(71, 59, 65, 0.72)"],
    smoke: ["rgba(72, 63, 69, 0.94)", "rgba(118, 91, 83, 0.68)"],
    warm: ["rgba(112, 58, 46, 0.94)", "rgba(190, 82, 45, 0.64)"],
    fire: ["rgba(255, 245, 190, 0.98)", "rgba(255, 104, 36, 0.74)"],
  }[tone] ?? ["rgba(72, 63, 69, 0.94)", "rgba(118, 91, 83, 0.68)"];
  return cachedCanvasSprite(
    turretExplosionBlobCache,
    `turret-explosion-${tone}`,
    96,
    96,
    (spriteContext) => {
      const gradient = spriteContext.createRadialGradient(48, 52, 4, 48, 48, 45);
      gradient.addColorStop(0, palette[0]);
      gradient.addColorStop(0.48, palette[1]);
      gradient.addColorStop(0.8, palette[1].replace(/0\.(?:64|68|72|74)/, "0.28"));
      gradient.addColorStop(1, "rgba(20, 16, 24, 0)");
      spriteContext.fillStyle = gradient;
      spriteContext.fillRect(2, 2, 92, 92);
    },
  );
}

function drawTurretExplosionBlob(x, y, width, height, tone, alpha = 1) {
  const sprite = turretExplosionBlobSprite(tone);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (sprite) {
    ctx.drawImage(sprite, x - width / 2, y - height / 2, width, height);
  } else {
    ctx.fillStyle = tone === "fire" ? "#ff8b38"
      : tone === "warm" ? "#8b4a3c"
        : tone === "charcoal" ? "#29242d" : "#574b50";
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTurretMushroomBlast(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const phase = particle.phase ?? 0;
  const size = particle.size;
  const rise = 1 - (1 - progress) ** 2.25;
  const capGrowth = 1 - (1 - Math.min(1, progress / 0.62)) ** 2;
  const fade = Math.min(1, remaining * 3.2);
  const capY = -size * (0.18 + rise * 0.48);
  const capWidth = size * (0.28 + capGrowth * 0.72);
  const stemHeight = Math.max(size * 0.18, -capY - size * 0.02);
  const heat = Math.max(0, 1 - progress / 0.78);

  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));

  if (progress < 0.48) {
    const shockProgress = progress / 0.48;
    const shockFade = (1 - shockProgress) * fade;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = shockFade * 0.9;
    for (let ring = 0; ring < 2; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        size * 0.025,
        size * (0.16 + shockProgress * (0.5 + ring * 0.14)),
        size * (0.035 + shockProgress * 0.025),
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = ring === 0 ? "#ffe7a0" : "#ef6038";
      ctx.lineWidth = Math.max(1.5, size * (0.018 - ring * 0.004));
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let glow = 0; glow < 6; glow += 1) {
    const seed = phase * 51.9 + glow * 7.17;
    const vertical = glow / 5;
    const glowWidth = size * (0.18 + (1 - vertical) * 0.07) * (0.8 + heat * 0.35);
    drawTurretExplosionBlob(
      (crimsonGrenadeNoise(seed) - 0.5) * size * 0.08,
      -vertical * stemHeight * 0.86,
      glowWidth,
      glowWidth * 1.35,
      "fire",
      fade * heat * (0.55 + (1 - vertical) * 0.25),
    );
  }
  ctx.restore();

  for (let segment = 0; segment < 10; segment += 1) {
    const vertical = segment / 9;
    const seed = phase * 63.4 + segment * 5.83;
    const sway = Math.sin(vertical * Math.PI * 1.3 + phase) * size * 0.028 +
      (crimsonGrenadeNoise(seed) - 0.5) * size * 0.045;
    const width = size * (0.16 + vertical * 0.08) *
      (0.82 + crimsonGrenadeNoise(seed + 2.4) * 0.26);
    const height = stemHeight / 4.8 * (0.9 + crimsonGrenadeNoise(seed + 6.7) * 0.3);
    const tone = progress < 0.5 && segment < 7 ? "warm"
      : segment % 3 === 0 ? "charcoal" : "smoke";
    drawTurretExplosionBlob(
      sway,
      -vertical * stemHeight,
      width,
      height,
      tone,
      fade * (0.78 + vertical * 0.18),
    );
  }

  for (let lobe = 0; lobe < 20; lobe += 1) {
    const seed = phase * 78.2 + lobe * 6.31;
    const across = lobe / 19 - 0.5;
    const x = across * capWidth * 0.9 +
      (crimsonGrenadeNoise(seed) - 0.5) * size * 0.045;
    const arch = Math.cos(across * Math.PI);
    const y = capY - arch * size * 0.13 +
      (crimsonGrenadeNoise(seed + 3.8) - 0.5) * size * 0.055;
    const width = size * (0.16 + crimsonGrenadeNoise(seed + 7.2) * 0.1);
    const height = width * (0.72 + crimsonGrenadeNoise(seed + 10.5) * 0.3);
    const tone = progress < 0.48 && lobe % 3 !== 0 ? "warm"
      : lobe % 4 === 0 ? "charcoal" : "smoke";
    drawTurretExplosionBlob(x, y, width, height, tone, fade * 0.96);
  }

  for (let crown = 0; crown < 10; crown += 1) {
    const seed = phase * 42.7 + crown * 9.13;
    const across = crown / 9 - 0.5;
    const width = size * (0.14 + crimsonGrenadeNoise(seed) * 0.1);
    drawTurretExplosionBlob(
      across * capWidth * 0.68,
      capY - size * (0.13 + crimsonGrenadeNoise(seed + 3.6) * 0.11),
      width,
      width * (0.78 + crimsonGrenadeNoise(seed + 7.1) * 0.28),
      crown % 3 === 0 ? "charcoal" : "smoke",
      fade * 0.86,
    );
  }

  if (progress > 0.18) {
    for (let wisp = 0; wisp < 8; wisp += 1) {
      const seed = phase * 94.6 + wisp * 8.47;
      const drift = (crimsonGrenadeNoise(seed) - 0.5) * capWidth *
        (0.55 + progress * 0.32);
      const wispSize = size * (0.065 + crimsonGrenadeNoise(seed + 5.4) * 0.075);
      drawTurretExplosionBlob(
        drift,
        capY - size * (0.2 + progress * 0.28 + crimsonGrenadeNoise(seed + 2.2) * 0.18),
        wispSize,
        wispSize * 0.82,
        wisp % 3 === 0 ? "charcoal" : "smoke",
        fade * remaining * 0.72,
      );
    }
  }

  if (progress < 0.76) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade * (1 - progress / 0.76);
    for (let ember = 0; ember < 14; ember += 1) {
      const seed = phase * 107.3 + ember * 5.91;
      const direction = ember % 2 === 0 ? -1 : 1;
      const distance = size * (0.1 + crimsonGrenadeNoise(seed) * (0.3 + progress * 0.34));
      const radius = 1.5 + crimsonGrenadeNoise(seed + 4.6) * 3.5;
      ctx.fillStyle = ember % 3 === 0 ? "#fff2b2"
        : ember % 2 === 0 ? "#ff9d3b" : "#e94d33";
      ctx.beginPath();
      ctx.arc(
        direction * distance,
        size * 0.02 - crimsonGrenadeNoise(seed + 8.1) * size * 0.28,
        radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawPurpleBulletHitElectricity(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const flickerFrame = Math.floor(progress * 5);
  const phase = (particle.phase ?? 0) + flickerFrame * 1.73;
  const travelAngle = particle.travelAngle ?? 0;
  const reachScale = 0.82 + Math.sin(progress * Math.PI) * 0.28;

  ctx.save();
  ctx.translate(pixelSnap(particle.x, 1), pixelSnap(particle.y, 1));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 0.62);
  ctx.rotate(travelAngle);

  for (let bolt = 0; bolt < 7; bolt += 1) {
    const seed = phase * 37.9 + bolt * 8.41;
    const angle = (bolt / 7) * Math.PI * 2 +
      (crimsonGrenadeNoise(seed) - 0.5) * 0.7;
    const reach = particle.size * reachScale *
      (0.58 + crimsonGrenadeNoise(seed + 2.6) * 0.5);
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let segment = 1; segment <= 4; segment += 1) {
      const segmentSeed = seed + segment * 5.27;
      const x = reach * segment / 4;
      const y = (crimsonGrenadeNoise(segmentSeed) - 0.5) *
        particle.size * (segment === 4 ? 0.12 : 0.3);
      ctx.lineTo(pixelSnap(x, 1), pixelSnap(y, 1));
    }
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.strokeStyle = bolt % 2 === 0 ? "#8f2dff" : "#c447ff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = bolt % 3 === 0 ? "#fff2ff" : "#e8b5ff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  const flashSize = Math.max(3, pixelSnap(particle.size * (0.16 + remaining * 0.08), 1));
  ctx.fillStyle = "#f8dcff";
  ctx.fillRect(-flashSize, -1, flashSize * 2, 2);
  ctx.fillRect(-1, -flashSize, 2, flashSize * 2);
  ctx.fillStyle = "#b53cff";
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}

function drawPlayerImpactFlash(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const reach = 20 + progress * 90;
  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 1.35);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 38 + progress * 20);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  glow.addColorStop(0.25, particle.color);
  glow.addColorStop(1, "rgba(66, 23, 81, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 38 + progress * 20, 0, Math.PI * 2);
  ctx.fill();
  for (let spoke = 0; spoke < 16; spoke += 1) {
    ctx.save();
    ctx.rotate(spoke * Math.PI / 8);
    ctx.fillStyle = spoke % 2 === 0 ? "#fff5ec" : particle.color;
    const length = 18 + (spoke % 3) * 7;
    const thickness = spoke % 2 === 0 ? 2 : 1.25;
    ctx.fillRect(pixelSnap(reach * 0.28), -thickness / 2, length, thickness);
    ctx.fillRect(pixelSnap(reach * 0.84), -0.5, 7, 1);
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayerShieldRamImpact(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const eased = 1 - (1 - progress) ** 2;
  const direction = particle.direction || 1;
  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.scale(direction, 1);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let wave = 0; wave < 3; wave += 1) {
    ctx.globalAlpha = Math.pow(remaining, 0.9) * (0.9 - wave * 0.2);
    ctx.strokeStyle = wave === 0 ? particle.coreColor : particle.color;
    ctx.lineWidth = wave === 0 ? 1.35 : 0.9;
    ctx.beginPath();
    ctx.ellipse(
      4 + eased * (25 + wave * 8),
      0,
      9 + eased * 15 + wave * 4,
      25 + eased * 13 + wave * 6,
      0,
      -Math.PI / 2,
      Math.PI / 2,
    );
    ctx.stroke();
  }

  for (let streak = 0; streak < 8; streak += 1) {
    const spread = (streak - 3.5) / 3.5;
    const angle = spread * 0.72 + Math.sin(particle.phase + streak * 1.7) * 0.035;
    const reach = 7 + eased * (32 + Math.abs(spread) * 11) + streak % 2 * 4;
    const length = (10 + (streak % 3) * 4) * (0.55 + remaining * 0.45);
    ctx.save();
    ctx.rotate(angle);
    ctx.globalAlpha = Math.pow(remaining, 1.12) * (0.82 - Math.abs(spread) * 0.18);
    ctx.fillStyle = streak % 3 === 0 ? particle.coreColor : particle.color;
    ctx.fillRect(reach, -0.5, length, 1);
    ctx.restore();
  }

  ctx.globalAlpha = Math.pow(remaining, 1.4);
  ctx.fillStyle = particle.coreColor;
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(1, -7 * remaining);
  ctx.lineTo(5 + eased * 5, 0);
  ctx.lineTo(1, 7 * remaining);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeartPickupGlow(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const radius = particle.size * (0.3 + progress * 0.75);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 1.15) * 0.7;
  const halo = ctx.createRadialGradient(
    particle.x,
    particle.y,
    1,
    particle.x,
    particle.y,
    radius,
  );
  halo.addColorStop(0, "rgba(255, 255, 255, 0.94)");
  halo.addColorStop(0.26, "rgba(255, 218, 231, 0.72)");
  halo.addColorStop(0.7, "rgba(255, 111, 159, 0.28)");
  halo.addColorStop(1, "rgba(255, 86, 142, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.fillStyle = "#fff0f6";
  for (let ray = 0; ray < 8; ray += 1) {
    ctx.save();
    ctx.rotate(Math.PI / 8 + ray * Math.PI / 4);
    const reach = 7 + progress * 34;
    const length = 10 - progress * 6;
    ctx.globalAlpha = Math.pow(remaining, 1.25) * 0.84;
    ctx.fillRect(pixelSnap(reach), -1, pixelSnap(length), 2);
    ctx.fillStyle = ray % 2 === 0 ? "#ff91b1" : "#fff0f6";
    ctx.fillRect(pixelSnap(reach + length + 4), -2, 3, 3);
    ctx.restore();
  }

  ctx.restore();
}

function drawHeartPickupPop(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const expansion = 0.9 + Math.sin(
    Math.min(1, progress * 1.65) * Math.PI / 2,
  ) * 0.65;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 0.65);
  ctx.shadowColor = "#ff719b";
  ctx.shadowBlur = 24 * remaining;
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.scale(expansion, expansion);
  drawPixelHeart(
    -3.5 * particle.size,
    -3 * particle.size,
    1,
    particle.size,
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

const lightRaySpriteCache = new Map();

function lightRaySprite(particle, kind) {
  const key = `${kind}:${particle.color}:${particle.coreColor}`;
  return cachedCanvasSprite(lightRaySpriteCache, key, 40, 24, (spriteContext) => {
    spriteContext.translate(20, 12);
    spriteContext.globalCompositeOperation = "lighter";
    spriteContext.shadowColor = particle.color;
    spriteContext.shadowBlur = kind === "revival" ? 5 : 9;
    spriteContext.fillStyle = particle.color;
    if (kind === "revival") {
      spriteContext.fillRect(-10.4, -0.65, 16, 1.3);
      spriteContext.shadowBlur = 0;
      spriteContext.globalAlpha = 0.75;
      spriteContext.fillStyle = particle.coreColor;
      spriteContext.fillRect(-5.12, -0.5, 7.68, 1);
    } else {
      spriteContext.fillRect(-6.6, -0.72, 12.3, 1.44);
      spriteContext.shadowBlur = 0;
      spriteContext.fillStyle = particle.coreColor;
      spriteContext.fillRect(-1.95, -0.45, 4.8, 0.9);
    }
  });
}

function drawPlayerShieldBreakFlash(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const progress = 1 - remaining;
  const tier = Math.max(1, Math.min(3, particle.shieldTier ?? 1));
  const radiusX = 56 + (tier - 1) * 5;
  const radiusY = 80 + (tier - 1) * 5;
  const direction = particle.direction || 1;
  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 0.72);
  ctx.lineCap = "square";
  ctx.strokeStyle = particle.color;
  ctx.lineWidth = Math.max(0.75, 1.7 - progress * 0.85);

  for (let fragment = 0; fragment < 6; fragment += 1) {
    const angle = -Math.PI / 2 + fragment * Math.PI / 3 +
      (fragment % 2 === 0 ? progress * 0.13 : -progress * 0.1);
    const halfArc = 0.18 + (fragment % 3) * 0.025;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      radiusX * (1 + progress * 0.24),
      radiusY * (1 + progress * 0.24),
      0,
      angle - halfArc,
      angle + halfArc,
    );
    ctx.stroke();
  }

  ctx.translate(direction * radiusX * (0.68 + progress * 0.18), 0);
  ctx.rotate(direction * (progress - 0.5) * 0.18);
  ctx.fillStyle = particle.coreColor;
  for (let crack = -1; crack <= 1; crack += 1) {
    const length = 18 + (crack + 1) * 5 + progress * 14;
    ctx.save();
    ctx.rotate(crack * 0.34);
    ctx.fillRect(0, -0.45, length, 0.9);
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayerShieldBreakShard(particle) {
  const remaining = Math.max(0, particle.life / particle.maxLife);
  const length = particle.size * (1.4 + remaining * 1.25);
  const thickness = Math.max(0.8, particle.size * 0.48);
  ctx.save();
  ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
  ctx.rotate(particle.angle);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(remaining, 0.82);
  ctx.shadowColor = particle.color;
  ctx.shadowBlur = 8 * remaining;
  ctx.fillStyle = particle.color;
  ctx.beginPath();
  ctx.moveTo(-length, 0);
  ctx.lineTo(0, -thickness);
  ctx.lineTo(length * 0.7, 0);
  ctx.lineTo(0, thickness);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = particle.coreColor;
  ctx.fillRect(-length * 0.38, -0.4, length * 0.72, 0.8);
  ctx.restore();
}

function drawParticles() {
  for (const particle of particles) {
    const cullMargin = particle.crimsonGrenadeBlast || particle.turretMushroomBlast
      ? particle.size + 48 : 120;
    if (
      particle.x < cameraX - cullMargin ||
      particle.x > cameraX + WIDTH + cullMargin ||
      particle.y < cameraY - cullMargin ||
      particle.y > cameraY + HEIGHT + cullMargin
    ) continue;
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    if (particle.debris) {
      drawCombatDebris(particle);
    } else if (particle.shieldRamImpact) {
      drawPlayerShieldRamImpact(particle);
    } else if (particle.impactFlash) {
      drawPlayerImpactFlash(particle);
    } else if (particle.heartPickupGlow) {
      drawHeartPickupGlow(particle);
    } else if (particle.heartPickupPop) {
      drawHeartPickupPop(particle);
    } else if (particle.shieldBreakFlash) {
      drawPlayerShieldBreakFlash(particle);
    } else if (particle.shieldBreakShard) {
      drawPlayerShieldBreakShard(particle);
    } else if (particle.impactRay) {
      const remaining = Math.max(0, particle.life / particle.maxLife);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.pow(remaining, 1.15);
      ctx.translate(pixelSnap(particle.x), pixelSnap(particle.y));
      ctx.rotate(Math.atan2(particle.vy, particle.vx));
      const raySprite = lightRaySprite(particle, "impact");
      if (raySprite) {
        const scale = particle.size / 3;
        ctx.drawImage(raySprite, -20 * scale, -12 * scale, 40 * scale, 24 * scale);
      } else {
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 9 * remaining;
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size * 2.2, -particle.size * 0.24,
          particle.size * 4.1, Math.max(1, particle.size * 0.48));
        ctx.shadowBlur = 0;
        ctx.fillStyle = particle.coreColor;
        ctx.fillRect(-particle.size * 0.65, -0.5, particle.size * 1.6, 1);
      }
      ctx.restore();
    } else if (particle.turretMushroomBlast) {
      drawTurretMushroomBlast(particle);
    } else if (particle.crimsonGrenadeBlast) {
      drawCrimsonGrenadeBlast(particle);
    } else if (particle.bulletHitElectric) {
      drawPurpleBulletHitElectricity(particle);
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
    } else if (particle.revivalOrb) {
      const remaining = Math.max(0, particle.life / particle.maxLife);
      const progress = 1 - remaining;
      const pulse = 0.5 + Math.sin(gameTime * 8 + particle.angle * 2) * 0.5;
      const size = particle.size * (0.84 + progress * 0.22 + pulse * 0.1);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.pow(remaining, 0.58) * (0.97 + pulse * 0.03);
      const dotSprite = getPlayerRevivalOrbSprite();
      if (dotSprite) {
        ctx.drawImage(
          dotSprite,
          particle.x - size,
          particle.y - size,
          size * 2,
          size * 2,
        );
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(3, size * 0.38), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (particle.reversalSpark) {
      const sparkSize = Math.max(2, pixelSnap(particle.size, 1));
      const sparkThickness = Math.max(3, pixelSnap(sparkSize * 0.48, 1));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 10;
      ctx.translate(pixelSnap(particle.x, 1), pixelSnap(particle.y, 1));
      ctx.fillStyle = particle.color;
      ctx.fillRect(-sparkSize * 2.4, 0, sparkSize * 2.4, sparkThickness);
      ctx.fillRect(0, -sparkSize * 1.25, sparkThickness, sparkSize * 1.25 + sparkThickness);
      ctx.fillRect(sparkThickness, -sparkSize * 1.25, sparkSize * 2.4, sparkThickness);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff0ff";
      ctx.fillRect(0, -sparkSize * 1.25, sparkThickness, sparkThickness);
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
  drawHeartItems();
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
      drawCombatantPhysicsDebug(enemy,
        enemy.kind === "monster3" ? "#ffbd78"
          : enemy.kind === "monster2" ? "#ff96ec"
            : enemy.kind === "monster4" ? "#ff9a72" : "#8aff9c");
    }
    for (const turret of turrets) drawCombatantPhysicsDebug(turret, "#ffd278");
  }
  ctx.restore();
}

function drawHeartItems() {
  for (const heart of heartItems) {
    if (
      heart.x < cameraX - 90 || heart.x > cameraX + WIDTH + 90 ||
      heart.y < cameraY - 90 || heart.y > cameraY + HEIGHT + 90
    ) continue;
    const floatPhase = gameTime * 2.1 + heart.phase;
    const y = heart.y + Math.sin(floatPhase) * 9;
    const glowRadius = 68 + Math.sin(floatPhase * 1.3) * 6;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(heart.x, y, 3, heart.x, y, glowRadius);
    halo.addColorStop(0, "rgba(255, 232, 239, 0.64)");
    halo.addColorStop(0.32, "rgba(255, 88, 132, 0.4)");
    halo.addColorStop(1, "rgba(255, 56, 114, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(heart.x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "#ff719b";
    ctx.shadowBlur = 32;
    drawPixelHeart(
      heart.x - HEART_ITEM_DRAW_SCALE * 3.5,
      y - HEART_ITEM_DRAW_SCALE * 3,
      1,
      HEART_ITEM_DRAW_SCALE,
    );
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3f5";
    for (let spark = 0; spark < 4; spark += 1) {
      const angle = floatPhase * 0.55 + spark * Math.PI / 2;
      const distance = 35 + Math.sin(floatPhase * 1.5 + spark) * 6;
      ctx.fillRect(
        pixelSnap(heart.x + Math.cos(angle) * distance),
        pixelSnap(y + Math.sin(angle) * distance * 0.65),
        spark % 2 === 0 ? 4 : 3,
        spark % 2 === 0 ? 4 : 3,
      );
    }
    ctx.restore();
  }
}

const TOP_VIDEO_SLOT_SCALE = 1.28;
const TOP_VIDEO_SLOT_SIZE_RATIO = 2 / 3;
const TOP_VIDEO_SLOT_ENLARGEMENT = 1.3;
const TOP_VIDEO_SLOT_TOP_ASPECT = 1.04;
const TOP_VIDEO_SLOT_BOTTOM_RATIO = 0.88;
const TOP_VIDEO_SLOT_REFERENCE_Y = 30;
const HUD_ULTIMATE_FRAME_COLOR = "rgba(132, 92, 157, 0.42)";
const HUD_STATUS_ICON_MAX_SCALE = 3.2;
const HUD_STATUS_ICON_GAP_UNITS = 1.4;
const MINIMAP_VERTICAL_EXAGGERATION_MAX = 2.5;
const MINIMAP_HEIGHT_RATIO = 0.9;

function topVideoSlotReferenceHeight(mapWidth) {
  return HEIGHT > WIDTH
    ? Math.max(104, Math.min(128, Math.round(mapWidth * 0.72)))
    : Math.max(92, Math.min(112, Math.round(mapWidth * 0.48)));
}

function topVideoSlotMetrics(mapX, mapWidth) {
  const centerGap = WIDTH < 650 ? 8 : 12;
  const baseHeight = TOP_VIDEO_SLOT_REFERENCE_Y +
    topVideoSlotReferenceHeight(mapWidth) + 12;
  const maximumTopWidth = Math.max(1, mapX - centerGap);
  const originalHeight = Math.min(
    maximumTopWidth / TOP_VIDEO_SLOT_TOP_ASPECT,
    baseHeight * TOP_VIDEO_SLOT_SCALE * TOP_VIDEO_SLOT_SIZE_RATIO,
  );
  const height = originalHeight * TOP_VIDEO_SLOT_ENLARGEMENT;
  return {
    centerGap,
    originalHeight,
    height,
    topWidth: height * TOP_VIDEO_SLOT_TOP_ASPECT,
    bottomWidth: height * TOP_VIDEO_SLOT_BOTTOM_RATIO,
  };
}

function hudHeaderLayout() {
  const portrait = HEIGHT > WIDTH;
  const gap = WIDTH < 650 ? 10 : 12;
  const infoY = 13;
  const infoHeight = 22;
  const mapY = 7;
  const mapWidth = Math.round(WIDTH * (portrait ? 0.44 : 0.38));
  const mapX = (WIDTH - mapWidth) / 2;
  const video = topVideoSlotMetrics(mapX, mapWidth);
  const mapHeight = Math.round(video.originalHeight * MINIMAP_HEIGHT_RATIO);
  const compactSideLayout = WIDTH < 800;
  const groupGap = compactSideLayout ? 1 : 6;
  const videoGap = compactSideLayout ? 1 : 8;
  const leftGroupX = video.topWidth + videoGap;
  const halfInnerEdge = WIDTH / 2 - video.centerGap;
  const sideAvailableWidth = Math.max(2, halfInnerEdge - leftGroupX);
  const sideRegionWidth = Math.min(
    96,
    Math.max(1, (sideAvailableWidth - groupGap) / 2),
  );
  const sideGroupWidth = sideRegionWidth * 2 + groupGap;
  const rightGroupX = WIDTH - video.topWidth - videoGap - sideGroupWidth;
  return {
    top: mapY,
    mainHeight: mapHeight,
    infoY,
    infoHeight,
    stage: {
      x: rightGroupX,
      y: infoY,
      width: sideRegionWidth,
      height: infoHeight,
    },
    hearts: {
      x: leftGroupX,
      y: infoY,
      width: sideRegionWidth,
      height: infoHeight,
    },
    map: { x: mapX, y: mapY, width: mapWidth, height: mapHeight },
    ultimate: {
      x: leftGroupX + sideRegionWidth + groupGap,
      y: infoY,
      width: sideRegionWidth,
      height: infoHeight,
    },
    score: {
      x: rightGroupX + sideRegionWidth + groupGap,
      y: infoY,
      width: sideRegionWidth,
      height: infoHeight,
    },
  };
}

function topVideoSlotLayout() {
  const header = hudHeaderLayout();
  const { originalHeight, height, topWidth, bottomWidth } = topVideoSlotMetrics(
    header.map.x,
    header.map.width,
  );
  return {
    originalHeight,
    height,
    left: [
      { x: 0, y: 0 },
      { x: topWidth, y: 0 },
      { x: bottomWidth, y: height },
      { x: 0, y: height },
    ],
    right: [
      { x: WIDTH, y: 0 },
      { x: WIDTH - topWidth, y: 0 },
      { x: WIDTH - bottomWidth, y: height },
      { x: WIDTH, y: height },
    ],
  };
}

function traceTopVideoSlot(points, renderContext = ctx) {
  renderContext.beginPath();
  renderContext.moveTo(points[0].x, points[0].y);
  for (let point = 1; point < points.length; point += 1) {
    renderContext.lineTo(points[point].x, points[point].y);
  }
  renderContext.lineTo(points[0].x, points[0].y);
}

function drawTopVideoSlotBorder(points, renderContext = ctx) {
  renderContext.save();
  renderContext.lineJoin = "round";
  traceTopVideoSlot(points, renderContext);
  renderContext.strokeStyle = HUD_ULTIMATE_FRAME_COLOR;
  renderContext.lineWidth = 1.5;
  renderContext.stroke();
  renderContext.restore();
}

function drawVideoCover(video, x, y, width, height, renderContext = ctx) {
  const sourceWidth = video?.videoWidth ?? 0;
  const sourceHeight = video?.videoHeight ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0 || width <= 0 || height <= 0) return false;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetAspect;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  renderContext.drawImage(
    video,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height,
  );
  return true;
}

function monsterVideoCutInOpacity(asset) {
  if (!asset?.active || !asset.video) return 0;
  const video = asset.video;
  const playbackRate = Math.max(0.1, video.playbackRate || 1);
  const elapsed = Math.max(0, video.currentTime || 0) / playbackRate;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const remaining = duration > 0
    ? Math.max(0, duration - (video.currentTime || 0)) / playbackRate
    : Infinity;
  return Math.max(0, Math.min(1, elapsed / 0.08, remaining / 0.16));
}

const topVideoSlotLayers = { left: null, right: null };

function prepareTopVideoSlotLayer(
  side,
  points,
  height,
  slotVideo,
  slotOpacity = 1,
  backgroundVideo = null,
) {
  const slotWidth = side === "left"
    ? Math.max(points[1].x, points[2].x)
    : WIDTH - Math.min(points[1].x, points[2].x);
  const originX = side === "left" ? 0 : WIDTH - slotWidth;
  const renderScale = Math.max(1, Math.min(
    MAX_RENDER_SCALE,
    canvas.width > 0 ? canvas.width / WIDTH : 1,
  ));
  const pixelWidth = Math.max(1, Math.ceil(slotWidth * renderScale));
  const pixelHeight = Math.max(1, Math.ceil(height * renderScale));
  let layer = topVideoSlotLayers[side];
  if (!layer) {
    const surface = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(pixelWidth, pixelHeight)
      : typeof document !== "undefined" ? document.createElement?.("canvas") : null;
    const context = surface?.getContext?.("2d");
    if (!surface || !context) return null;
    layer = { surface, context, frameKey: "" };
    topVideoSlotLayers[side] = layer;
  }
  const { surface, context } = layer;
  const resized = surface.width !== pixelWidth || surface.height !== pixelHeight;
  if (resized) {
    surface.width = pixelWidth;
    surface.height = pixelHeight;
  }
  const videoFrame = slotVideo
    ? Math.max(0, Math.floor((slotVideo.currentTime ?? 0) * 30))
    : -1;
  const videoSource = slotVideo?.currentSrc || slotVideo?.src || "idle";
  const backgroundFrame = backgroundVideo
    ? Math.max(0, Math.floor((backgroundVideo.currentTime ?? 0) * 30))
    : -1;
  const backgroundSource = backgroundVideo?.currentSrc || backgroundVideo?.src || "none";
  const opacityFrame = Math.round(slotOpacity * 100);
  const frameKey = `${pixelWidth}:${pixelHeight}:${backgroundSource}:${backgroundFrame}:${videoSource}:${videoFrame}:${opacityFrame}`;
  if (!resized && layer.frameKey === frameKey) {
    return { surface, originX, slotWidth };
  }

  const localPoints = points.map((point) => ({
    x: point.x - originX,
    y: point.y,
  }));
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.save();
  traceTopVideoSlot(localPoints, context);
  context.clip();
  context.fillStyle = "rgba(9, 5, 18, 0.36)";
  context.fillRect(0, 0, slotWidth, height);
  if (backgroundVideo) {
    drawVideoCover(
      backgroundVideo,
      0,
      0,
      slotWidth,
      height,
      context,
    );
  }
  if (slotVideo && slotOpacity > 0) {
    context.save();
    context.globalAlpha *= slotOpacity;
    drawVideoCover(
      slotVideo,
      0,
      0,
      slotWidth,
      height,
      context,
    );
    context.restore();
  }
  context.restore();
  drawTopVideoSlotBorder(localPoints, context);
  layer.frameKey = frameKey;
  return { surface, originX, slotWidth };
}

function drawTopVideoSlots() {
  const layout = topVideoSlotLayout();
  const forceStartVideo =
    typeof isFemaleStartVoiceVideoActive === "function" &&
    isFemaleStartVoiceVideoActive();
  for (const [side, points] of [
    ["left", layout.left],
    ["right", layout.right],
  ]) {
    const gunVideo = typeof playerGunVideoAsset !== "undefined" &&
      playerGunVideoAsset.loaded && playerGunVideoAsset.active
      ? playerGunVideoAsset.video
      : null;
    const runVideo = typeof playerRunVideoAsset !== "undefined" &&
      playerRunVideoAsset.loaded && playerRunVideoAsset.active
      ? playerRunVideoAsset.video
      : null;
    const standVideo = typeof playerStandVideoAsset !== "undefined" &&
      playerStandVideoAsset.loaded && playerStandVideoAsset.active
      ? playerStandVideoAsset.video
      : null;
    const forcedStartVideo = forceStartVideo &&
      typeof playerStartVideoAsset !== "undefined" &&
      playerStartVideoAsset.loaded
      ? playerStartVideoAsset.video
      : forceStartVideo && typeof playerStandVideoAsset !== "undefined" &&
          playerStandVideoAsset.loaded
        ? playerStandVideoAsset.video
        : null;
    const downVideo = typeof playerDownVideoAsset !== "undefined" &&
      playerDownVideoAsset.loaded && playerDownVideoAsset.active
      ? playerDownVideoAsset.video
      : null;
    const finishingVideo = typeof playerFinishingVideoAsset !== "undefined" &&
      playerFinishingVideoAsset.loaded && playerFinishingVideoAsset.active
      ? playerFinishingVideoAsset.video
      : null;
    const activeEnemyVideoAsset = typeof activeEnemyAttackVideoAsset === "function"
      ? activeEnemyAttackVideoAsset()
      : typeof monster2AttackVideoAsset !== "undefined"
        ? monster2AttackVideoAsset
        : null;
    const enemyVideoAsset = activeEnemyVideoAsset?.loaded && activeEnemyVideoAsset.active
      ? activeEnemyVideoAsset
      : null;
    const basicEnemyVideo = typeof monsterBasicVideoAsset !== "undefined" &&
      monsterBasicVideoAsset.loaded && monsterBasicVideoAsset.active
      ? monsterBasicVideoAsset.video
      : null;
    const slotVideo = side === "left"
      ? forcedStartVideo ?? downVideo ?? finishingVideo ?? gunVideo ??
        runVideo ?? standVideo
      : enemyVideoAsset?.video ?? basicEnemyVideo;
    const backgroundVideo = side === "right" && enemyVideoAsset
      ? basicEnemyVideo
      : null;
    const slotOpacity = side === "right" && enemyVideoAsset
      ? monsterVideoCutInOpacity(enemyVideoAsset)
      : 1;
    const layer = prepareTopVideoSlotLayer(
      side,
      points,
      layout.height,
      slotVideo,
      slotOpacity,
      backgroundVideo,
    );
    if (layer) {
      ctx.drawImage(
        layer.surface,
        layer.originX,
        0,
        layer.slotWidth,
        layout.height,
      );
      continue;
    }
    ctx.save();
    traceTopVideoSlot(points);
    ctx.clip();
    ctx.fillStyle = "rgba(9, 5, 18, 0.36)";
    ctx.fillRect(0, 0, WIDTH, layout.height);
    const slotWidth = side === "left"
      ? Math.max(points[1].x, points[2].x)
      : WIDTH - Math.min(points[1].x, points[2].x);
    const originX = side === "left" ? 0 : WIDTH - slotWidth;
    if (backgroundVideo) {
      drawVideoCover(
        backgroundVideo,
        originX,
        0,
        slotWidth,
        layout.height,
      );
    }
    if (slotVideo && slotOpacity > 0) {
      ctx.save();
      ctx.globalAlpha *= slotOpacity;
      drawVideoCover(
        slotVideo,
        originX,
        0,
        slotWidth,
        layout.height,
      );
      ctx.restore();
    }
    ctx.restore();
    drawTopVideoSlotBorder(points);
  }
}

const MINIMAP_RENDER_INTERVAL = 1 / 30;
const MINIMAP_IMMEDIATE_REFRESH_DISTANCE = 24;
let minimapLayer = null;
let minimapWorldBoundsCache = null;
let minimapRenderCache = {
  signature: "",
  time: -Infinity,
  focusX: NaN,
  focusY: NaN,
};

function invalidateMinimapCache() {
  minimapWorldBoundsCache = null;
  minimapRenderCache.signature = "";
  minimapRenderCache.time = -Infinity;
}

function minimapWorldBounds() {
  const first = platforms[0];
  const last = platforms[platforms.length - 1];
  const signature = [
    mapSeed,
    WIDTH,
    HEIGHT,
    platforms.length,
    first?.id ?? "",
    first?.start ?? "",
    first?.y ?? "",
    last?.id ?? "",
    last?.end ?? "",
    last?.y ?? "",
  ].join(":");
  if (minimapWorldBoundsCache?.signature === signature) {
    return minimapWorldBoundsCache;
  }

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const platform of platforms) {
    left = Math.min(left, platform.start);
    right = Math.max(right, platform.end);
    if (platform.kind === "ramp") {
      top = Math.min(top, platform.entryY, platform.exitY);
      bottom = Math.max(bottom, platform.entryY, platform.exitY);
    } else {
      top = Math.min(top, platform.y);
      bottom = Math.max(bottom, platform.y);
    }
  }
  const horizontalMargin = Math.max(1, (right - left) * 0.025);
  const verticalMargin = Math.max(LEVEL_GAP * 0.65, (bottom - top) * 0.08);
  minimapWorldBoundsCache = {
    signature,
    left: left - horizontalMargin,
    right: right + horizontalMargin,
    top: top - verticalMargin,
    bottom: bottom + verticalMargin,
  };
  return minimapWorldBoundsCache;
}

function prepareMinimapLayer(panelX, panelY, panelWidth, panelHeight) {
  const renderScale = 2;
  const pixelWidth = Math.max(1, Math.ceil(panelWidth * renderScale));
  const pixelHeight = Math.max(1, Math.ceil(panelHeight * renderScale));
  if (!minimapLayer) {
    const surface = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(pixelWidth, pixelHeight)
      : document.createElement?.("canvas");
    const context = surface?.getContext?.("2d");
    if (!surface || !context) return null;
    minimapLayer = { surface, context };
  }
  const { surface, context } = minimapLayer;
  if (surface.width !== pixelWidth) surface.width = pixelWidth;
  if (surface.height !== pixelHeight) surface.height = pixelHeight;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.setTransform(
    renderScale,
    0,
    0,
    renderScale,
    -panelX * renderScale,
    -panelY * renderScale,
  );
  return minimapLayer;
}

function applyMinimapSideAndBottomFade(
  renderContext,
  panelX,
  panelY,
  panelWidth,
  panelHeight,
) {
  renderContext.save();
  renderContext.globalCompositeOperation = "destination-in";

  const horizontalMask = renderContext.createLinearGradient(
    panelX,
    panelY,
    panelX + panelWidth,
    panelY,
  );
  horizontalMask.addColorStop(0, "rgba(0, 0, 0, 0)");
  horizontalMask.addColorStop(0.1, "rgba(0, 0, 0, 1)");
  horizontalMask.addColorStop(0.9, "rgba(0, 0, 0, 1)");
  horizontalMask.addColorStop(1, "rgba(0, 0, 0, 0)");
  renderContext.fillStyle = horizontalMask;
  renderContext.fillRect(panelX, panelY, panelWidth, panelHeight);

  const bottomMask = renderContext.createLinearGradient(
    panelX,
    panelY,
    panelX,
    panelY + panelHeight,
  );
  bottomMask.addColorStop(0, "rgba(0, 0, 0, 1)");
  bottomMask.addColorStop(0.76, "rgba(0, 0, 0, 1)");
  bottomMask.addColorStop(1, "rgba(0, 0, 0, 0)");
  renderContext.fillStyle = bottomMask;
  renderContext.fillRect(panelX, panelY, panelWidth, panelHeight);
  renderContext.restore();
}

function drawMinimap(fullMap = false) {
  if (platforms.length === 0) return;
  const expanded = fullMap && TEST_MODE;

  const header = hudHeaderLayout();
  const panelWidth = expanded ? WIDTH - 44 : header.map.width;
  const canvasBounds = expanded ? canvas.getBoundingClientRect?.() : null;
  const toolsBounds = expanded ? testControlsElement?.getBoundingClientRect?.() : null;
  const toolsBottom = canvasBounds?.height > 0 && toolsBounds
    ? (toolsBounds.bottom - canvasBounds.top) / canvasBounds.height * HEIGHT
    : 0;
  const panelY = expanded
    ? Math.min(HEIGHT * 0.5, Math.max(128, HEIGHT * 0.2, toolsBottom + 18))
    : header.map.y;
  const panelHeight = expanded ? HEIGHT - panelY - HEIGHT * 0.16 - 20 : header.map.height;
  const panelX = expanded ? WIDTH - panelWidth - 22 : header.map.x;
  const plotX = panelX + 10;
  const plotY = panelY + 10;
  const plotWidth = panelWidth - 20;
  const plotHeight = panelHeight - 20;

  const worldBounds = minimapWorldBounds();
  const fullWorldLeft = worldBounds.left;
  const fullWorldRight = worldBounds.right;
  const fullWorldTop = worldBounds.top;
  const fullWorldBottom = worldBounds.bottom;

  const fullWorldWidth = Math.max(1, fullWorldRight - fullWorldLeft);
  const fullWorldHeight = Math.max(1, fullWorldBottom - fullWorldTop);
  const worldWidth = expanded ? fullWorldWidth : Math.min(
    fullWorldWidth,
    Math.max(WIDTH * 1.25, fullWorldWidth * MINIMAP_LOCAL_WORLD_RATIO),
  );
  const worldHeight = expanded ? fullWorldHeight : Math.min(
    fullWorldHeight,
    Math.max(HEIGHT * 1.1, fullWorldHeight * MINIMAP_LOCAL_WORLD_RATIO),
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
  const localScaleX = plotWidth / worldWidth;
  const localScaleY = Math.min(
    plotHeight / worldHeight,
    localScaleX * MINIMAP_VERTICAL_EXAGGERATION_MAX,
  );
  const localContentHeight = worldHeight * localScaleY;
  const mapX = expanded
    ? (value) => plotX + (plotWidth - worldWidth * mapScale) / 2 + (value - worldLeft) * mapScale
    : (value) => plotX + (value - worldLeft) / worldWidth * plotWidth;
  const mapY = expanded
    ? (value) => plotY + (plotHeight - worldHeight * mapScale) / 2 + (value - worldTop) * mapScale
    : (value) => plotY + (plotHeight - localContentHeight) / 2 +
      (value - worldTop) * localScaleY;

  const renderMap = (ctx) => {
  ctx.save();
  if (expanded) {
    ctx.fillStyle = "rgba(1, 4, 9, 0.86)";
    ctx.fillRect(0, 104, WIDTH, HEIGHT - 104);
  }
  ctx.fillStyle = expanded
    ? "rgba(3, 9, 15, 0.72)"
    : "rgba(3, 9, 15, 0.48)";
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelWidth, panelHeight);
  ctx.clip();

  ctx.beginPath();
  ctx.rect(plotX, plotY, plotWidth, plotHeight);
  ctx.clip();

  ctx.strokeStyle = "rgba(108, 153, 170, 0.13)";
  ctx.lineWidth = 1;
  const gridCellSize = plotHeight / 3;
  const gridCenterX = plotX + plotWidth / 2;
  for (let x = gridCenterX; x > plotX; x -= gridCellSize) {
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + plotHeight);
    ctx.stroke();
  }
  for (let x = gridCenterX + gridCellSize; x < plotX + plotWidth; x += gridCellSize) {
    ctx.beginPath();
    ctx.moveTo(x, plotY);
    ctx.lineTo(x, plotY + plotHeight);
    ctx.stroke();
  }
  for (let y = plotY + gridCellSize; y < plotY + plotHeight; y += gridCellSize) {
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
      if (
        !expanded &&
        (platform.end < worldLeft || platform.start > worldRight ||
          Math.max(startY, endY) < worldTop || Math.min(startY, endY) > worldBottom)
      ) continue;
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
  ctx.fillStyle = "rgba(255, 224, 113, 0.18)";
  ctx.beginPath();
  ctx.arc(playerMapX, playerMapY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffe071";
  ctx.strokeStyle = "rgba(255, 250, 214, 0.52)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(playerMapX, playerMapY, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  };

  if (expanded) {
    renderMap(ctx);
    return;
  }
  const renderSignature = [
    mapSeed,
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    platforms.length,
  ].join(":");
  const elapsed = gameTime - minimapRenderCache.time;
  const focusShift = Math.hypot(
    focusX - minimapRenderCache.focusX,
    focusY - minimapRenderCache.focusY,
  );
  const shouldRefresh = (
    minimapRenderCache.signature !== renderSignature ||
    elapsed < 0 || elapsed >= MINIMAP_RENDER_INTERVAL ||
    focusShift >= MINIMAP_IMMEDIATE_REFRESH_DISTANCE
  );
  let layer = minimapLayer;
  if (shouldRefresh) {
    layer = prepareMinimapLayer(panelX, panelY, panelWidth, panelHeight);
    if (!layer) {
      renderMap(ctx);
      return;
    }
    renderMap(layer.context);
    applyMinimapSideAndBottomFade(
      layer.context,
      panelX,
      panelY,
      panelWidth,
      panelHeight,
    );
    minimapRenderCache = {
      signature: renderSignature,
      time: gameTime,
      focusX,
      focusY,
    };
  }
  if (!layer?.surface) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(layer.surface, panelX, panelY, panelWidth, panelHeight);
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

const HUD_NUMERAL_GLYPHS = {
  0: ["0111110", "1100011", "1100011", "1100111", "1101011", "1110011", "1100011", "1100011", "0111110"],
  1: ["0011100", "0111100", "1101100", "0001100", "0001100", "0001100", "0001100", "0001100", "1111111"],
  2: ["0111110", "1100011", "0000011", "0000110", "0011100", "0110000", "1100000", "1100000", "1111111"],
  3: ["1111110", "0000011", "0000011", "0011110", "0000011", "0000011", "0000011", "1100011", "0111110"],
  4: ["1100110", "1100110", "1100110", "1100110", "1111111", "0000110", "0000110", "0000110", "0000110"],
  5: ["1111111", "1100000", "1100000", "1111110", "0000011", "0000011", "0000011", "1100011", "0111110"],
  6: ["0111110", "1100011", "1100000", "1111110", "1100011", "1100011", "1100011", "1100011", "0111110"],
  7: ["1111111", "0000011", "0000110", "0001100", "0011000", "0011000", "0011000", "0011000", "0011000"],
  8: ["0111110", "1100011", "1100011", "0111110", "1100011", "1100011", "1100011", "1100011", "0111110"],
  9: ["0111110", "1100011", "1100011", "1100011", "0111111", "0000011", "0000011", "1100011", "0111110"],
};

const hudGlyphSpriteCache = new Map();

function hudNumeralWidth(text, scale) {
  return text.length === 0 ? 0 : (text.length * 8 - 1) * scale;
}

function drawHudNumerals(text, x, y, scale) {
  for (let digit = 0; digit < text.length; digit += 1) {
    const glyph = HUD_NUMERAL_GLYPHS[text[digit]];
    if (!glyph) continue;
    const sprite = cachedCanvasSprite(
      hudGlyphSpriteCache,
      `number:${text[digit]}:${scale}`,
      7 * scale,
      9 * scale,
      (spriteContext) => {
        for (let row = 0; row < glyph.length; row += 1) {
          spriteContext.fillStyle = row <= 2 ? "#ffffff" : row >= 7 ? "#a6cdd6" : "#e7f7fa";
          for (let column = 0; column < glyph[row].length; column += 1) {
            if (glyph[row][column] === "1") {
              spriteContext.fillRect(column * scale, row * scale, scale, scale);
            }
          }
        }
      },
    );
    if (sprite) {
      ctx.drawImage(sprite, pixelSnap(x + digit * 8 * scale, 1), pixelSnap(y, 1),
        7 * scale, 9 * scale);
      continue;
    }
    for (let row = 0; row < glyph.length; row += 1) {
      ctx.fillStyle = row <= 2 ? "#ffffff" : row >= 7 ? "#a6cdd6" : "#e7f7fa";
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        ctx.fillRect(
          pixelSnap(x + (digit * 8 + column) * scale, 1),
          pixelSnap(y + row * scale, 1),
          scale,
          scale,
        );
      }
    }
  }
}

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
    const sprite = cachedCanvasSprite(
      hudGlyphSpriteCache,
      `letter:${character}:${scale}:${color}`,
      5 * scale,
      7 * scale,
      (spriteContext) => {
        spriteContext.fillStyle = color;
        for (let row = 0; row < glyph.length; row += 1) {
          for (let column = 0; column < glyph[row].length; column += 1) {
            if (glyph[row][column] === "1") {
              spriteContext.fillRect(column * scale, row * scale, scale, scale);
            }
          }
        }
      },
    );
    if (sprite) {
      ctx.drawImage(sprite, pixelSnap(cursorX, 1), pixelSnap(y, 1),
        5 * scale, 7 * scale);
      cursorX += 6 * scale;
      continue;
    }
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

function paintPixelHeart(target, x, y, fillAmount, scale) {
  const fill = Math.max(0, Math.min(1, fillAmount));
  const filledColumns = 7 * fill;
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
      const filledRatio = Math.min(1, Math.max(0, filledColumns - column));
      if (filledRatio < 1) {
        target.fillStyle = "rgba(73, 91, 104, 0.7)";
        target.fillRect(pixelX, pixelY, scale, scale);
      }
      if (filledRatio > 0) {
        target.fillStyle = "#ff4f5f";
        target.fillRect(pixelX, pixelY, scale * filledRatio, scale);
      }
    }
  }
  if (fill <= 0) return;
  target.fillStyle = "#ffc3c8";
  target.fillRect(x + scale, y + scale, scale, scale);
  if (fill >= 0.75) {
    target.fillStyle = "#ff8e9b";
    target.fillRect(x + scale * 4, y + scale * 4, scale, scale);
  }
}

function drawPixelHeart(x, y, fillAmount, scale = 3) {
  const fill = Math.max(0, Math.min(1, fillAmount));
  const sprite = cachedCanvasSprite(
    hudGlyphSpriteCache,
    `heart:${fill}`,
    7,
    6,
    (spriteContext) => paintPixelHeart(spriteContext, 0, 0, fill, 1),
  );
  if (sprite) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, pixelSnap(x, 1), pixelSnap(y, 1),
      7 * scale, 6 * scale);
    ctx.restore();
  } else {
    paintPixelHeart(ctx, x, y, fill, scale);
  }
}

function paintPixelUltimateSlot(target, x, y, filled, scale) {
  const outline = [
    "0001000",
    "0010100",
    "0100010",
    "1000001",
    "0100010",
    "0010100",
    "0001000",
  ];
  const core = [
    "0001000",
    "0011100",
    "0111110",
    "1111111",
    "0111110",
    "0011100",
    "0001000",
  ];
  const pixels = filled ? core : outline;
  for (let row = 0; row < pixels.length; row += 1) {
    for (let column = 0; column < pixels[row].length; column += 1) {
      if (pixels[row][column] !== "1") continue;
      target.fillStyle = filled
        ? row <= 2 ? "#efd6ff" : "#a855f1"
        : "rgba(156, 123, 183, 0.46)";
      target.fillRect(
        x + column * scale,
        y + row * scale,
        scale,
        scale,
      );
    }
  }
}

function drawPixelUltimateSlot(x, y, filled, scale = 2) {
  const sprite = cachedCanvasSprite(
    hudGlyphSpriteCache,
    `ultimate:${filled ? 1 : 0}:${scale}`,
    7 * scale,
    7 * scale,
    (spriteContext) => paintPixelUltimateSlot(spriteContext, 0, 0, filled, scale),
  );
  if (sprite) {
    ctx.drawImage(sprite, pixelSnap(x, 1), pixelSnap(y, 1),
      7 * scale, 7 * scale);
  } else {
    paintPixelUltimateSlot(ctx, x, y, filled, scale);
  }
}

function digitalHudScoreValue() {
  const elapsed = gameTime - player.scoreGainStartedAt;
  if (
    !Number.isFinite(elapsed) || elapsed < 0 ||
    elapsed >= HUD_SCORE_DIGITAL_DURATION
  ) return player.score;
  const previousScore = Math.max(0, player.score - player.scoreGainAmount);
  const progress = elapsed / HUD_SCORE_DIGITAL_DURATION;
  const digitalSteps = 6;
  const steppedProgress = Math.min(
    1,
    Math.floor(progress * digitalSteps) / digitalSteps,
  );
  return Math.round(
    previousScore + (player.score - previousScore) * steppedProgress,
  );
}

function ultimateMeterFillRatio() {
  if (player.ultimateCharges >= PLAYER_MAX_ULTIMATE_CHARGES) return 1;
  return Math.max(0, Math.min(
    1,
    (player.ultimateMeterScore ?? 0) / ULTIMATE_SCORE_PER_CHARGE,
  ));
}

function ultimateMeterLayout() {
  return {
    x: 0,
    y: 0,
    width: WIDTH,
    height: 6,
    inset: 1,
  };
}

function drawUltimateScoreMeter() {
  const layout = ultimateMeterLayout();
  const barWidth = layout.width;
  const barHeight = layout.height;
  const barX = layout.x;
  const barY = layout.y;
  const inset = layout.inset;
  const innerWidth = barWidth - inset * 2;
  const innerHeight = barHeight - inset * 2;
  const ratio = ultimateMeterFillRatio();
  const fillWidth = Math.round(innerWidth * ratio);
  const flashElapsed = gameTime - player.ultimateChargeStartedAt;
  const flash = flashElapsed >= 0 && flashElapsed < HUD_ULTIMATE_CHARGE_FLASH_DURATION
    ? 1 - flashElapsed / HUD_ULTIMATE_CHARGE_FLASH_DURATION
    : 0;

  ctx.save();
  ctx.fillStyle = "rgba(8, 4, 14, 0.82)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = HUD_ULTIMATE_FRAME_COLOR;
  ctx.fillRect(barX, barY, barWidth, 1);
  ctx.fillRect(barX, barY + barHeight - 1, barWidth, 1);
  if (fillWidth > 0) {
    const fill = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    fill.addColorStop(0, "#6f24c7");
    fill.addColorStop(0.62, "#b04fff");
    fill.addColorStop(1, "#f0d0ff");
    ctx.fillStyle = fill;
    ctx.shadowColor = "#a942ff";
    ctx.shadowBlur = 4 + flash * 9;
    ctx.fillRect(barX + inset, barY + inset, fillWidth, innerHeight);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#f4ddff";
    ctx.fillRect(barX + inset, barY + inset, fillWidth, 1);
  }
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "#06030a";
  for (let segment = 1; segment < 10; segment += 1) {
    const segmentX = barX + inset + Math.round(innerWidth * segment / 10);
    ctx.fillRect(segmentX, barY + inset, 1, innerHeight);
  }
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(barX, barY, barWidth, 1);
    ctx.fillRect(barX, barY + barHeight - 1, barWidth, 1);
  }
  ctx.restore();
}

function drawHud() {
  const header = hudHeaderLayout();
  const labelScale = 1;
  const hudScale = 7 / 9;
  const infoCenterY = header.infoY + header.infoHeight / 2;
  const labelY = infoCenterY - 7 * labelScale / 2;
  const valueY = infoCenterY - 9 * hudScale / 2;
  const textGap = 3;
  const scoreText = String(digitalHudScoreValue()).padStart(3, "0");
  const stageText = String(CURRENT_STAGE).padStart(2, "0");
  const scoreLabelWidth = pixelTextWidth("SCORE", labelScale);
  const scoreValueWidth = hudNumeralWidth(scoreText, hudScale);
  const scoreRowWidth = scoreLabelWidth + textGap + scoreValueWidth;
  const scoreX = header.score.x + (header.score.width - scoreRowWidth) / 2;
  const scoreValueX = scoreX + scoreLabelWidth + textGap;
  const scoreCenterX = header.score.x + header.score.width / 2;
  const scoreCenterY = infoCenterY;
  const stageCenterY = infoCenterY;
  const stageLabelWidth = pixelTextWidth("STAGE", labelScale);
  const stageValueWidth = hudNumeralWidth(stageText, hudScale);
  const stageRowWidth = stageLabelWidth + textGap + stageValueWidth;
  const infoVisualScale = Math.min(
    HUD_INFO_TEXT_VISUAL_SCALE,
    header.score.width / scoreRowWidth,
    header.stage.width / stageRowWidth,
  );
  const canTransformHudText = typeof ctx.translate === "function" &&
    typeof ctx.scale === "function";

  if (TEST_MODE && showFullMap) {
    drawMinimap(true);
    return;
  }
  drawTopVideoSlots();
  drawUltimateScoreMeter();
  drawMinimap(false);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = "rgba(101, 218, 230, 0.35)";
  ctx.shadowBlur = 3;
  ctx.save();
  if (canTransformHudText) {
    ctx.translate(scoreCenterX, scoreCenterY);
    ctx.scale(infoVisualScale, infoVisualScale);
    ctx.translate(-scoreCenterX, -scoreCenterY);
  }
  drawPixelText(
    "SCORE",
    scoreX,
    labelY,
    labelScale,
    "#99dce5",
  );
  drawHudNumerals(
    scoreText,
    scoreValueX,
    valueY,
    hudScale,
  );
  ctx.restore();

  const stageStartX = header.stage.x + (header.stage.width - stageRowWidth) / 2;
  const stageValueX = stageStartX + stageLabelWidth + textGap;
  const stageCenterX = header.stage.x + header.stage.width / 2;
  ctx.save();
  if (canTransformHudText) {
    ctx.translate(stageCenterX, stageCenterY);
    ctx.scale(infoVisualScale, infoVisualScale);
    ctx.translate(-stageCenterX, -stageCenterY);
  }
  drawPixelText(
    "STAGE",
    stageStartX,
    labelY,
    labelScale,
    "#99dce5",
  );
  drawHudNumerals(
    stageText,
    stageValueX,
    valueY,
    hudScale,
  );
  ctx.restore();

  ctx.shadowColor = "rgba(255, 87, 117, 0.44)";
  ctx.shadowBlur = 6;
  const maximumHearts = Math.min(PLAYER_MAX_HEARTS, player.maxHp ?? 3);
  const heartScale = Math.min(
    HUD_STATUS_ICON_MAX_SCALE,
    header.hearts.width / Math.max(
      1,
      maximumHearts * 7 +
      Math.max(0, maximumHearts - 1) * HUD_STATUS_ICON_GAP_UNITS,
    ),
  );
  const heartWidth = 7 * heartScale;
  const heartGap = heartScale * HUD_STATUS_ICON_GAP_UNITS;
  const heartRowWidth = maximumHearts * heartWidth +
    Math.max(0, maximumHearts - 1) * heartGap;
  const heartsX = header.hearts.x + (header.hearts.width - heartRowWidth) / 2;
  const heartsY = infoCenterY - 3 * heartScale;
  for (let heart = 0; heart < maximumHearts; heart += 1) {
    drawPixelHeart(
      heartsX + heart * (heartWidth + heartGap),
      heartsY,
      Math.max(0, Math.min(1, player.hp - heart)),
      heartScale,
    );
  }

  const ultimateGapUnits = HUD_STATUS_ICON_GAP_UNITS;
  const ultimateScale = Math.min(
    HUD_STATUS_ICON_MAX_SCALE,
    header.ultimate.width / Math.max(
      1,
      PLAYER_MAX_ULTIMATE_CHARGES * 7 +
      (PLAYER_MAX_ULTIMATE_CHARGES - 1) * ultimateGapUnits,
    ),
  );
  const ultimateWidth = 7 * ultimateScale;
  const ultimateGap = ultimateGapUnits * ultimateScale;
  const ultimateRowWidth = PLAYER_MAX_ULTIMATE_CHARGES * ultimateWidth +
    (PLAYER_MAX_ULTIMATE_CHARGES - 1) * ultimateGap;
  const ultimateX = header.ultimate.x +
    (header.ultimate.width - ultimateRowWidth) / 2;
  const ultimateY = infoCenterY - 7 * ultimateScale / 2;
  const ultimateCharges = Math.max(0, Math.min(
    PLAYER_MAX_ULTIMATE_CHARGES,
    player.ultimateCharges ?? 0,
  ));
  for (let slot = 0; slot < PLAYER_MAX_ULTIMATE_CHARGES; slot += 1) {
    drawPixelUltimateSlot(
      ultimateX + slot * (ultimateWidth + ultimateGap),
      ultimateY,
      slot < ultimateCharges,
      ultimateScale,
    );
  }
  ctx.restore();

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
