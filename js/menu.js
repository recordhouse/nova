"use strict";

const startScreenElement = document.querySelector("[data-start-screen]");
const startScreenMainElement = document.querySelector("[data-start-main]");
const startGameButton = document.querySelector("[data-start-game]");
const startRankingButton = document.querySelector("[data-start-ranking]");
const startShareButton = document.querySelector("[data-start-share]");
const startShareStatusElement = document.querySelector("[data-start-share-status]");
const startRankingViewElement = document.querySelector("[data-start-ranking-view]");
const startLeaderboardListElement = document.querySelector("[data-start-leaderboard-list]");
const startRankingBackButton = document.querySelector("[data-start-ranking-back]");

let mainMenuActive = Boolean(startScreenElement) &&
  !(typeof TEST_MODE !== "undefined" && TEST_MODE);

function setStartShareStatus(message = "") {
  if (startShareStatusElement) startShareStatusElement.textContent = message;
}

function showStartMainMenu() {
  if (!startScreenElement) return false;
  startScreenMainElement?.removeAttribute("hidden");
  if (startRankingViewElement) startRankingViewElement.hidden = true;
  setStartShareStatus();
  startGameButton?.focus?.({ preventScroll: true });
  return true;
}

function showStartRanking() {
  if (!startScreenElement || !startRankingViewElement) return false;
  if (typeof renderLeaderboardInto === "function") {
    renderLeaderboardInto(
      startLeaderboardListElement,
      typeof loadLeaderboardEntries === "function" ? loadLeaderboardEntries() : [],
    );
  }
  if (startScreenMainElement) startScreenMainElement.hidden = true;
  startRankingViewElement.hidden = false;
  startRankingBackButton?.focus?.({ preventScroll: true });
  return true;
}

function startGameFromMainMenu() {
  if (!mainMenuActive) return false;
  mainMenuActive = false;
  if (startScreenElement) {
    startScreenElement.hidden = true;
    startScreenElement.setAttribute("aria-hidden", "true");
  }
  if (typeof resetAllInputs === "function") resetAllInputs();
  if (typeof setCurrentStageMusicPaused === "function") {
    setCurrentStageMusicPaused(false);
  }
  return true;
}

async function shareNovaGame() {
  const shareData = {
    title: "NOVA",
    text: "NOVA",
    url: window.location.href,
  };
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(shareData);
      setStartShareStatus("SHARED");
      return true;
    }
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(shareData.url);
      setStartShareStatus("LINK COPIED");
      return true;
    }
    const temporaryInput = document.createElement("input");
    temporaryInput.value = shareData.url;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.append(temporaryInput);
    temporaryInput.select();
    const copied = document.execCommand?.("copy") ?? false;
    temporaryInput.remove();
    setStartShareStatus(copied ? "LINK COPIED" : "SHARE UNAVAILABLE");
    return copied;
  } catch (error) {
    if (error?.name !== "AbortError") setStartShareStatus("SHARE FAILED");
    return false;
  }
}

startGameButton?.addEventListener("click", (event) => {
  event.preventDefault();
  startGameFromMainMenu();
});

startRankingButton?.addEventListener("click", (event) => {
  event.preventDefault();
  showStartRanking();
});

startRankingBackButton?.addEventListener("click", (event) => {
  event.preventDefault();
  showStartMainMenu();
});

startShareButton?.addEventListener("click", (event) => {
  event.preventDefault();
  shareNovaGame();
});

if (startScreenElement && !mainMenuActive) {
  startScreenElement.hidden = true;
  startScreenElement.setAttribute("aria-hidden", "true");
}
