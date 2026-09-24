"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createGame(testMode = true) {
  const pauseCalls = [];
  const button = {
    attributes: {}, listeners: {}, textContent: "",
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const tools = { hidden: false };
  const canvas = { getContext: () => ({ setTransform() {} }), addEventListener() {} };
  const scope = {
    performance: { now: () => 0 },
    setCurrentStageMusicPaused: (paused) => pauseCalls.push(paused),
    document: {
      querySelector: (selector) => selector === "#game" ? canvas
        : selector === "[data-test-music]" ? button
          : selector === "[data-test-controls]" ? tools : null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      location: { search: testMode ? "?test=1" : "" },
      addEventListener() {},
      innerWidth: 720,
      innerHeight: 1280,
      matchMedia: () => ({ matches: false }),
    },
  };
  vm.createContext(scope);
  for (const name of ["config", "state", "world", "combat", "player", "input"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "js", `${name}.js`), "utf8"),
      scope,
      { filename: `${name}.js` },
    );
  }
  return { button, tools, pauseCalls };
}

function click(button) {
  button.listeners.click({ preventDefault() {} });
}

test("test BGM button pauses and resumes stage music", () => {
  const { button, pauseCalls } = createGame();
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.equal(button.textContent, "BGM Ⅱ");
  click(button);
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.equal(button.textContent, "BGM ▶");
  assert.ok(button.attributes["aria-label"].includes("일시정지됨"));
  click(button);
  assert.equal(button.attributes["aria-pressed"], "false");
  assert.equal(button.textContent, "BGM Ⅱ");
  assert.deepEqual(pauseCalls, [true, false]);
});

test("normal mode hides and cannot operate the BGM test control", () => {
  const { button, tools, pauseCalls } = createGame(false);
  assert.equal(tools.hidden, true);
  click(button);
  assert.deepEqual(pauseCalls, []);
  assert.equal(button.attributes["aria-pressed"], undefined);
});
