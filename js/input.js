"use strict";

// Keyboard, pointer, joystick, and test-control bindings.

const keyMap = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowDown: "down",
  KeyS: "down",
  ArrowUp: "up",
  KeyW: "up",
  Space: "jump",
  KeyJ: "fire",
};

function keyboardControl(event) {
  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") return "jump";
  return keyMap[event.code] ?? keyMap[event.key] ?? null;
}

function pointerControls(control) {
  for (const pointer of activeControlPointers.values()) {
    if (pointer.control === control) return true;
  }
  return false;
}

function syncControl(control) {
  controls[control] = (
    keyboardControls[control] ||
    pointerControls(control) ||
    Boolean(joystickControls[control])
  );
}

function setJoystickControls(nextControls) {
  const jumpWasActive = controls.jump || controls.up;
  Object.keys(joystickControls).forEach((control) => {
    joystickControls[control] = Boolean(nextControls[control]);
    syncControl(control);
  });
  if ((joystickControls.jump || joystickControls.up) && !jumpWasActive) {
    jumpQueued = true;
  }
}

function updateMovementJoystick(event) {
  if (event.pointerId !== movementJoystickPointerId || !movementJoystickElement) return;
  const rect = movementJoystickElement.getBoundingClientRect();
  const dx = event.clientX - movementJoystickOriginX;
  const dy = event.clientY - movementJoystickOriginY;
  const distance = Math.hypot(dx, dy);
  const maximumKnobDistance = rect.width * 0.3;
  const knobScale = distance > maximumKnobDistance
    ? maximumKnobDistance / distance
    : 1;
  const knobX = dx * knobScale;
  const knobY = dy * knobScale;
  movementJoystickKnob?.style.setProperty(
    "transform",
    `translate3d(${knobX}px, ${knobY}px, 0)`,
  );

  const deadZone = rect.width * 0.14;
  setJoystickControls({
    left: dx < -deadZone,
    right: dx > deadZone,
    up: dy < -deadZone,
    down: dy > deadZone,
  });
}

function releaseMovementJoystick(pointerId) {
  if (
    movementJoystickPointerId === null ||
    (pointerId !== undefined && pointerId !== movementJoystickPointerId)
  ) return;

  movementJoystickPointerId = null;
  movementJoystickElement?.classList.remove("active");
  movementJoystickKnob?.style.setProperty("transform", "translate3d(0, 0, 0)");
  setJoystickControls({});
}

function releaseControlPointer(pointerId) {
  const pointer = activeControlPointers.get(pointerId);
  if (!pointer) return;

  activeControlPointers.delete(pointerId);
  if (![...activeControlPointers.values()].some((active) => active.button === pointer.button)) {
    pointer.button.classList.remove("active");
  }
  syncControl(pointer.control);
}

function resetAllInputs() {
  jumpQueued = false;
  player.jumpBufferTimer = 0;
  player.jumpLatch = false;
  releaseMovementJoystick();
  for (const pointer of activeControlPointers.values()) {
    pointer.button.classList.remove("active");
  }
  activeControlPointers.clear();
  Object.keys(controls).forEach((control) => {
    keyboardControls[control] = false;
    controls[control] = false;
  });
}

window.addEventListener("keydown", (event) => {
  const control = keyboardControl(event);
  if (!control) return;
  event.preventDefault();
  if ((control === "jump" || control === "up") && !event.repeat) jumpQueued = true;
  keyboardControls[control] = true;
  syncControl(control);
});

window.addEventListener("keyup", (event) => {
  const control = keyboardControl(event);
  if (!control) return;
  event.preventDefault();
  keyboardControls[control] = false;
  syncControl(control);
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    releaseControlPointer(event.pointerId);
    if (control === "jump" && !controls.jump) jumpQueued = true;
    activeControlPointers.set(event.pointerId, { control, button });
    syncControl(control);
    button.classList.add("active");
  };
  const release = (event) => {
    event.preventDefault();
    releaseControlPointer(event.pointerId);
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

movementJoystickElement = document.querySelector("[data-movement-joystick]");
movementJoystickKnob = movementJoystickElement?.querySelector(".joystick-knob") ?? null;
if (movementJoystickElement) {
  const pressJoystick = (event) => {
    event.preventDefault();
    releaseMovementJoystick();
    movementJoystickPointerId = event.pointerId;
    movementJoystickOriginX = event.clientX;
    movementJoystickOriginY = event.clientY;
    movementJoystickElement.setPointerCapture?.(event.pointerId);
    movementJoystickElement.classList.add("active");
    setJoystickControls({});
  };
  const moveJoystick = (event) => {
    event.preventDefault();
    updateMovementJoystick(event);
  };
  const releaseJoystick = (event) => {
    event.preventDefault();
    releaseMovementJoystick(event.pointerId);
  };

  movementJoystickElement.addEventListener("pointerdown", pressJoystick);
  movementJoystickElement.addEventListener("pointermove", moveJoystick);
  movementJoystickElement.addEventListener("pointerup", releaseJoystick);
  movementJoystickElement.addEventListener("pointercancel", releaseJoystick);
  movementJoystickElement.addEventListener("lostpointercapture", releaseJoystick);
}

const releasePointerAnywhere = (event) => {
  releaseControlPointer(event.pointerId);
  releaseMovementJoystick(event.pointerId);
};
window.addEventListener("pointerup", releasePointerAnywhere, true);
window.addEventListener("pointercancel", releasePointerAnywhere, true);

const preventBrowserAction = (event) => event.preventDefault();
["contextmenu", "dragstart", "selectstart", "copy", "cut"].forEach((eventName) => {
  document.addEventListener(eventName, preventBrowserAction, true);
});

canvas.addEventListener("pointerdown", () => {
  if (gameOver && !playerIsDown()) resetGame();
});

testJumpPathButton?.addEventListener("click", (event) => {
  event.preventDefault();
  movePlayerToHorizontalJumpPath();
});

testResolutionButton?.addEventListener("click", (event) => {
  event.preventDefault();
  cycleTestResolution();
});

testOrientationButton?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleTestOrientation();
});

testMapButton?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleTestMap();
});

let testMusicPaused = false;
function updateTestMusicButton() {
  if (!TEST_MODE || !testMusicButton) return;
  testMusicButton.setAttribute("aria-pressed", String(testMusicPaused));
  testMusicButton.setAttribute(
    "aria-label",
    testMusicPaused
      ? "배경음악 일시정지됨, 다시 누르면 재생"
      : "배경음악 재생 중, 누르면 일시정지",
  );
  testMusicButton.textContent = testMusicPaused ? "BGM ▶" : "BGM Ⅱ";
}

function toggleTestMusic() {
  if (!TEST_MODE) return;
  testMusicPaused = !testMusicPaused;
  if (typeof setCurrentStageMusicPaused === "function") {
    setCurrentStageMusicPaused(testMusicPaused);
  }
  updateTestMusicButton();
}

testMusicButton?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleTestMusic();
});
updateTestMusicButton();

function updateTestInvincibilityButton() {
  if (!TEST_MODE || !testInvincibilityButton) return;
  testInvincibilityButton.setAttribute("aria-pressed", String(testInvincibility));
  testInvincibilityButton.setAttribute("aria-label", `무적 모드 ${testInvincibility ? "켜짐" : "꺼짐"}`);
}

function toggleTestInvincibility() {
  if (!TEST_MODE) return;
  testInvincibility = !testInvincibility;
  updateTestInvincibilityButton();
}

testInvincibilityButton?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleTestInvincibility();
});
updateTestInvincibilityButton();

testSpawnMonster1Button?.addEventListener("click", (event) => {
  event.preventDefault();
  spawnTestMonster("monster1");
});

testSpawnMonster2Button?.addEventListener("click", (event) => {
  event.preventDefault();
  spawnTestMonster("monster2");
});

testSpawnMonster3Button?.addEventListener("click", (event) => {
  event.preventDefault();
  spawnTestMonster("monster3");
});

testSpawnMonster4Button?.addEventListener("click", (event) => {
  event.preventDefault();
  spawnTestMonster("monster4");
});

function updateTestAreaButton(button, enabled, subject) {
  if (!button || !TEST_MODE) return;
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute(
    "aria-label",
    `${subject} 영역 표시 ${enabled ? "켜짐" : "꺼짐"}`,
  );
}

testPlayerAreaButton?.addEventListener("click", (event) => {
  event.preventDefault();
  showPlayerArea = !showPlayerArea;
  updateTestAreaButton(testPlayerAreaButton, showPlayerArea, "주인공");
});

testMonsterAreaButton?.addEventListener("click", (event) => {
  event.preventDefault();
  showMonsterArea = !showMonsterArea;
  updateTestAreaButton(testMonsterAreaButton, showMonsterArea, "몬스터·포탑");
});

updateTestAreaButton(testPlayerAreaButton, showPlayerArea, "주인공");
updateTestAreaButton(testMonsterAreaButton, showMonsterArea, "몬스터·포탑");

let orientationSyncFrame = null;
function scheduleCanvasOrientationSync() {
  if (orientationSyncFrame !== null) cancelAnimationFrame(orientationSyncFrame);
  orientationSyncFrame = requestAnimationFrame(() => {
    orientationSyncFrame = null;
    syncCanvasOrientation();
  });
}

window.addEventListener("resize", scheduleCanvasOrientationSync);
window.addEventListener("orientationchange", scheduleCanvasOrientationSync);
window.screen?.orientation?.addEventListener("change", scheduleCanvasOrientationSync);
window.addEventListener("blur", resetAllInputs);
window.addEventListener("pagehide", resetAllInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetAllInputs();
});
