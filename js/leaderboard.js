"use strict";

const LEADERBOARD_STORAGE_KEY = "nova.leaderboard.v1";
const LEADERBOARD_LIMIT = 100;
const LEADERBOARD_NAME_LIMIT = 12;

const gameOverPanelElement = document.querySelector("[data-game-over-panel]");
const gameOverScoreElement = document.querySelector("[data-game-over-score]");
const gameOverFormElement = document.querySelector("[data-game-over-form]");
const gameOverNameElement = document.querySelector("[data-game-over-name]");
const gameOverRegisterElement = document.querySelector("[data-game-over-register]");
const gameOverResultElement = document.querySelector("[data-game-over-result]");
const gameOverRestartElement = document.querySelector("[data-game-over-restart]");
const leaderboardListElement = document.querySelector("[data-leaderboard-list]");

let cachedLeaderboardEntries = null;
let gameOverScorePanelVisible = false;
let gameOverScoreSubmitted = false;
let gameOverScoreSnapshot = 0;
let currentLeaderboardEntryId = null;

function sanitizeLeaderboardName(value) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, LEADERBOARD_NAME_LIMIT).join("");
}

function normalizeLeaderboardEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry, index) => {
    const name = sanitizeLeaderboardName(entry?.name);
    const score = Math.max(0, Math.floor(Number(entry?.score)));
    const createdAt = Number(entry?.createdAt);
    if (!name || !Number.isFinite(score)) return [];
    return [{
      id: String(entry?.id ?? `legacy-${index}-${createdAt || 0}`),
      name,
      score,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    }];
  });
}

function sortLeaderboardEntries(entries) {
  return normalizeLeaderboardEntries(entries).sort((first, second) => (
    second.score - first.score ||
    first.createdAt - second.createdAt ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  ));
}

function leaderboardStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadLeaderboardEntries() {
  if (cachedLeaderboardEntries) return [...cachedLeaderboardEntries];
  let saved = [];
  try {
    const serialized = leaderboardStorage()?.getItem(LEADERBOARD_STORAGE_KEY);
    if (serialized) saved = JSON.parse(serialized);
  } catch {
    saved = [];
  }
  cachedLeaderboardEntries = sortLeaderboardEntries(saved).slice(0, LEADERBOARD_LIMIT);
  return [...cachedLeaderboardEntries];
}

function saveLeaderboardEntries(entries) {
  cachedLeaderboardEntries = sortLeaderboardEntries(entries).slice(0, LEADERBOARD_LIMIT);
  try {
    leaderboardStorage()?.setItem(
      LEADERBOARD_STORAGE_KEY,
      JSON.stringify(cachedLeaderboardEntries),
    );
  } catch {
    // Private browsing or a full storage quota still keeps this session's ranking.
  }
  return [...cachedLeaderboardEntries];
}

function createLeaderboardEntry(name, score) {
  const createdAt = Date.now();
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
    name: sanitizeLeaderboardName(name),
    score: Math.max(0, Math.floor(Number(score) || 0)),
    createdAt,
  };
}

function registerLeaderboardScore(name, score) {
  const entry = createLeaderboardEntry(name, score);
  if (!entry.name) return { entry: null, rank: null, entries: loadLeaderboardEntries() };
  const allEntries = sortLeaderboardEntries([...loadLeaderboardEntries(), entry]);
  const rank = allEntries.findIndex((candidate) => candidate.id === entry.id) + 1;
  const entries = saveLeaderboardEntries(allEntries);
  return {
    entry,
    rank: rank > 0 && rank <= LEADERBOARD_LIMIT ? rank : null,
    entries,
  };
}

function formatLeaderboardScore(score) {
  return String(Math.max(0, Math.floor(Number(score) || 0))).padStart(6, "0");
}

function renderLeaderboardInto(
  targetListElement,
  entries = loadLeaderboardEntries(),
  currentEntryId = null,
) {
  if (!targetListElement || typeof document.createElement !== "function") return;
  const rows = [];
  for (let index = 0; index < LEADERBOARD_LIMIT; index += 1) {
    const entry = entries[index] ?? null;
    const row = document.createElement("li");
    row.className = `leaderboard-row${entry?.id === currentEntryId ? " current" : ""}`;

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `#${String(index + 1).padStart(3, "0")}`;

    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = entry?.name ?? "---";

    const score = document.createElement("span");
    score.className = "leaderboard-score";
    score.textContent = entry ? formatLeaderboardScore(entry.score) : "------";

    row.append(rank, name, score);
    rows.push(row);
  }
  targetListElement.replaceChildren(...rows);
  const currentRow = rows.find((row) => row.classList?.contains?.("current"));
  currentRow?.scrollIntoView?.({ block: "center" });
}

function renderLeaderboard(entries = loadLeaderboardEntries(), currentEntryId = null) {
  return renderLeaderboardInto(leaderboardListElement, entries, currentEntryId);
}

function resetGameOverScorePanel() {
  gameOverScorePanelVisible = false;
  gameOverScoreSubmitted = false;
  gameOverScoreSnapshot = 0;
  currentLeaderboardEntryId = null;
  if (gameOverPanelElement) {
    gameOverPanelElement.hidden = true;
    gameOverPanelElement.setAttribute("aria-hidden", "true");
  }
  if (gameOverNameElement) {
    gameOverNameElement.value = "";
    gameOverNameElement.disabled = false;
    gameOverNameElement.setCustomValidity?.("");
  }
  if (gameOverRegisterElement) gameOverRegisterElement.disabled = false;
  if (gameOverResultElement) gameOverResultElement.textContent = "";
}

function showGameOverScorePanel(score = player.score) {
  if (!gameOverPanelElement || gameOverScorePanelVisible) return false;
  gameOverScorePanelVisible = true;
  gameOverScoreSubmitted = false;
  currentLeaderboardEntryId = null;
  gameOverScoreSnapshot = Math.max(0, Math.floor(Number(score) || 0));
  gameOverPanelElement.hidden = false;
  gameOverPanelElement.setAttribute("aria-hidden", "false");
  if (gameOverScoreElement) {
    gameOverScoreElement.textContent = formatLeaderboardScore(gameOverScoreSnapshot);
  }
  if (gameOverNameElement) {
    gameOverNameElement.value = "";
    gameOverNameElement.disabled = false;
    gameOverNameElement.setCustomValidity?.("");
  }
  if (gameOverRegisterElement) gameOverRegisterElement.disabled = false;
  if (gameOverResultElement) gameOverResultElement.textContent = "";
  renderLeaderboard(loadLeaderboardEntries());
  return true;
}

function syncGameOverScorePanel(visible) {
  if (visible) return showGameOverScorePanel(player.score);
  if (!gameOverScorePanelVisible) return false;
  resetGameOverScorePanel();
  return true;
}

function gameOverScorePanelIsVisible() {
  return gameOverScorePanelVisible;
}

gameOverFormElement?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!gameOverScorePanelVisible || gameOverScoreSubmitted) return;
  const name = sanitizeLeaderboardName(gameOverNameElement?.value);
  if (!name) {
    gameOverNameElement?.setCustomValidity?.("ENTER NAME");
    gameOverNameElement?.reportValidity?.();
    return;
  }
  gameOverNameElement?.setCustomValidity?.("");
  const result = registerLeaderboardScore(name, gameOverScoreSnapshot);
  if (!result.entry) return;
  gameOverScoreSubmitted = true;
  currentLeaderboardEntryId = result.entry.id;
  if (gameOverNameElement) gameOverNameElement.disabled = true;
  if (gameOverRegisterElement) gameOverRegisterElement.disabled = true;
  if (gameOverResultElement) {
    gameOverResultElement.textContent = result.rank
      ? `RANK #${String(result.rank).padStart(3, "0")}`
      : "OUTSIDE TOP 100";
  }
  renderLeaderboard(result.entries, currentLeaderboardEntryId);
});

gameOverNameElement?.addEventListener("input", () => {
  gameOverNameElement.value = sanitizeLeaderboardName(gameOverNameElement.value);
  gameOverNameElement.setCustomValidity?.("");
});

gameOverRestartElement?.addEventListener("click", (event) => {
  event.preventDefault();
  if (typeof resetGame === "function") resetGame();
});

window.addEventListener?.("storage", (event) => {
  if (event.key !== LEADERBOARD_STORAGE_KEY) return;
  cachedLeaderboardEntries = null;
  if (gameOverScorePanelVisible) {
    renderLeaderboard(loadLeaderboardEntries(), currentLeaderboardEntryId);
  }
});
