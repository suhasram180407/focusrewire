// utils/searchGuard.js
// FocusRewire — Intercepts YouTube searches and blocks/warns if off-topic
// Supports immediate dynamic activation/deactivation without page reload

let _sgProfile = null;
let _sgMode = "strict";
let _sgActive = false;
let _sgListenersAttached = false;
let _lastUrl = typeof location !== "undefined" ? location.href : "";

// 5-Minute Off-Topic Search Timer State (Casual Mode)
let _offTopicTimer = null;
let _offTopicElapsedMinutes = 0;
let _allowedOffTopicQuery = null;
let _offTopicAllowanceActive = false;

function isOffTopicSearchAllowed(query = null) {
  if (!_sgActive || _sgMode !== "casual" || !_offTopicAllowanceActive) return false;
  if (!query) return true;
  return _allowedOffTopicQuery && query.toLowerCase().trim() === _allowedOffTopicQuery;
}

function resetOffTopicTimer() {
  if (_offTopicTimer) {
    clearTimeout(_offTopicTimer);
    _offTopicTimer = null;
  }
  _offTopicElapsedMinutes = 0;
  _allowedOffTopicQuery = null;
  _offTopicAllowanceActive = false;
  document.getElementById("fr-warning-modal")?.remove();
}

function enableSearchGuard(profile, mode) {
  _sgProfile = profile;
  _sgMode = mode || "strict";
  _sgActive = true;
  resetOffTopicTimer();
  attachSearchGuardListeners();
}

function disableSearchGuard() {
  _sgActive = false;
  _sgProfile = null;
  resetOffTopicTimer();
  removeSearchGuardUI();
}

function updateSearchGuardMode(mode) {
  _sgMode = mode || "strict";
  if (_sgMode === "strict") {
    resetOffTopicTimer();
  }
}

function initSearchGuard(profile, mode) {
  enableSearchGuard(profile, mode);
}

function removeSearchGuardUI() {
  document.getElementById("fr-block-banner")?.remove();
  document.getElementById("fr-warning-modal")?.remove();
}

// ── LISTENERS ─────────────────────────────────────────────────────────────

function attachSearchGuardListeners() {
  if (_sgListenersAttached) return;
  _sgListenersAttached = true;

  // 1. YouTube SPA URL change watcher
  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      if (_sgActive && _sgProfile) {
        onUrlChange(location.href);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // 2. Strict Mode Search Box Interaction Interceptor (Click & Focus)
  document.addEventListener("focusin", (e) => {
    if (!_sgActive || !_sgProfile) return;
    if (_sgMode === "strict") {
      const searchInput = getSearchInputElement();
      if (searchInput && (e.target === searchInput || searchInput.contains(e.target))) {
        e.preventDefault();
        searchInput.blur();
        showStrictSearchBanner("Search is not permitted while Strict Mode is active.");
      }
    }
  }, true);

  document.addEventListener("click", (e) => {
    if (!_sgActive || !_sgProfile) return;

    // Check if clicked the search input or search button
    const searchInput = getSearchInputElement();
    const isSearchInput = searchInput && (e.target === searchInput || searchInput.contains(e.target));
    const searchBtn = getSearchButtonElement(e.target);

    // STRICT MODE: Block any search attempt or input click immediately
    if (_sgMode === "strict") {
      if (isSearchInput || searchBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (searchInput) searchInput.blur();
        showStrictSearchBanner("Search is not permitted while Strict Mode is active.");
        return false;
      }
    }

    // CASUAL MODE: Check query relevance on search button click
    if (_sgMode === "casual" && searchBtn) {
      const query = searchInput?.value?.trim();
      if (query) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCasualSearchSubmission(query, false);
        return false;
      }
    }
  }, true);

  // 3. Keyboard Enter in Search Bar
  document.addEventListener("keydown", (e) => {
    if (!_sgActive || !_sgProfile) return;

    const searchInput = getSearchInputElement();
    const isInputActive = searchInput && (document.activeElement === searchInput || e.target === searchInput);

    if (_sgMode === "strict" && isInputActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      searchInput.blur();
      showStrictSearchBanner("Search is not permitted while Strict Mode is active.");
      return false;
    }

    if (e.key === "Enter" && isInputActive) {
      const query = searchInput.value.trim();
      if (!query) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (_sgMode === "strict") {
        searchInput.blur();
        showStrictSearchBanner("Search is not permitted while Strict Mode is active.");
        return false;
      }

      handleCasualSearchSubmission(query, false);
      return false;
    }
  }, true);
}

function getSearchInputElement() {
  return document.querySelector("input#search, input[name='search_query'], input.ytSearchboxComponentInput, input.ytd-searchbox");
}

function getSearchButtonElement(target) {
  if (!target) return null;
  return target.closest(
    "#search-icon-legacy, button#search-icon-legacy, yt-icon-button#search-icon-legacy, [id='search-icon-legacy'], button.ytSearchboxComponentSearchButton, button[aria-label='Search']"
  );
}

// ── RELEVANCE EVALUATION ──────────────────────────────────────────────────

function isSearchQueryRelevant(query, profile) {
  if (!query || !profile) return false;

  const qNorm = query.toLowerCase().trim();

  // PRIORITY RULE 1: Negative keywords check
  for (const neg of (profile.negative_keywords || [])) {
    const n = neg.toLowerCase().trim();
    if (n && qNorm.includes(n)) {
      return false; // Matched negative keyword -> Block!
    }
  }

  // PRIORITY RULE 2: Positive relevance check
  if (typeof scoreContent === "function") {
    const { positiveHits, negativeHits } = scoreContent(query, profile);
    if (negativeHits > 0) return false;
    if (positiveHits === 0) return false;
    return true;
  }

  // Fallback positive keyword check
  const topic = (profile.topic || "").toLowerCase().trim();
  if (topic && (qNorm.includes(topic) || topic.includes(qNorm))) {
    return true;
  }
  for (const pos of (profile.positive_keywords || [])) {
    const p = pos.toLowerCase().trim();
    if (p && qNorm.includes(p)) return true;
  }
  for (const sub of (profile.subtopics || [])) {
    const s = sub.toLowerCase().trim();
    if (s && qNorm.includes(s)) return true;
  }

  return false;
}

// ── CASUAL SEARCH SUBMISSION ──────────────────────────────────────────────

async function handleCasualSearchSubmission(query, alreadyNavigated) {
  if (!_sgActive || !_sgProfile) return;

  // If this query is already allowed under active off-topic allowance, proceed
  if (isOffTopicSearchAllowed(query)) {
    if (!alreadyNavigated) {
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
    return;
  }

  const relevant = isSearchQueryRelevant(query, _sgProfile);

  if (relevant) {
    // ALLOW SEARCH: Relevant search resets any off-topic timer
    resetOffTopicTimer();
    if (!alreadyNavigated) {
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
  } else {
    // OFF-TOPIC: Block search and display warning modal
    trackBlockedSearch();
    showWarningModal(query, _sgProfile.topic, alreadyNavigated, 0);
  }
}

// ── SPA URL CHANGE HANDLER ────────────────────────────────────────────────

async function onUrlChange(url) {
  if (!_sgActive || !_sgProfile) return;

  // If navigated away from search results back to home, watch, etc., reset off-topic timer
  if (!url.includes("/results?")) {
    if (_offTopicAllowanceActive) {
      resetOffTopicTimer();
    }
    return;
  }

  try {
    const params = new URLSearchParams(url.split("?")[1] || "");
    const query = params.get("search_query") || "";
    if (!query) return;

    if (_sgMode === "strict") {
      history.back();
      setTimeout(() => showStrictSearchBanner("Search is not permitted while Strict Mode is active."), 300);
      return;
    }

    if (_sgMode === "casual") {
      // If currently allowed under the active off-topic search allowance, let it proceed
      if (isOffTopicSearchAllowed(query)) {
        return;
      }

      const relevant = isSearchQueryRelevant(query, _sgProfile);
      if (relevant) {
        // User navigated to a relevant search, reset off-topic timer
        resetOffTopicTimer();
      } else {
        history.back();
        trackBlockedSearch();
        setTimeout(() => showWarningModal(query, _sgProfile.topic, true, 0), 300);
      }
    }
  } catch (e) {
    console.warn("SearchGuard URL check error:", e);
  }
}

// ── STATS TRACKING ────────────────────────────────────────────────────────

function trackBlockedSearch() {
  chrome.storage.local.get("analytics", (data) => {
    const a = data.analytics || {};
    a.blockedSearches = (a.blockedSearches || 0) + 1;
    const today = new Date().toISOString().split("T")[0];
    if (!a.dailyStats) a.dailyStats = {};
    if (!a.dailyStats[today]) a.dailyStats[today] = { blockedVideos: 0, shortsBlocked: 0, blockedSearches: 0, sponsorsBlocked: 0, focusMinutes: 0 };
    a.dailyStats[today].blockedSearches = (a.dailyStats[today].blockedSearches || 0) + 1;
    a.lastUpdated = Date.now();
    chrome.storage.local.set({ analytics: a });
  });
}

// ── STRICT MODE BANNER ────────────────────────────────────────────────────

function showStrictSearchBanner(message) {
  document.getElementById("fr-block-banner")?.remove();
  if (!document.getElementById("fr-banner-style")) {
    const style = document.createElement("style");
    style.id = "fr-banner-style";
    style.textContent = `
      @keyframes frBannerIn {
        from { opacity:0; transform:translateX(-50%) translateY(-10px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  const banner = document.createElement("div");
  banner.id = "fr-block-banner";
  banner.style.cssText = `
    position: fixed; top: 75px; left: 50%; transform: translateX(-50%);
    background: #ff4444; color: #fff; padding: 14px 28px; border-radius: 10px;
    font-size: 14px; font-weight: 600; z-index: 2147483647;
    font-family: 'Segoe UI', system-ui, sans-serif; box-shadow: 0 8px 32px rgba(255,68,68,0.45);
    animation: frBannerIn 0.2s ease; display: flex; align-items: center; gap: 10px;
  `;
  banner.innerHTML = `<span>🔒</span><span>${message}</span>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3500);
}

// ── OFF-TOPIC WARNING & REMINDER MODAL (CASUAL MODE) ──────────────────────

function showWarningModal(query, topic, alreadyNavigated, elapsedMinutes = 0) {
  document.getElementById("fr-warning-modal")?.remove();

  const isReminder = elapsedMinutes > 0;
  const modal = document.createElement("div");
  modal.id = "fr-warning-modal";
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8);
    display: flex; align-items: center; justify-content: center;
    z-index: 2147483647; font-family: 'Segoe UI', system-ui, sans-serif; backdrop-filter: blur(4px);
  `;

  const badgeText = isReminder ? "⏱️ OFF-TOPIC SEARCH REMINDER" : "🎯 FOCUSREWIRE";
  const titleText = isReminder
    ? `Off-topic search has been active for ${elapsedMinutes} minutes.`
    : "Unrelated or off-topic content detected.";
  const descText = isReminder
    ? `You have been using this off-topic search allowance for <strong>${elapsedMinutes} continuous minutes</strong>.<br/>Would you like to return to your focused topic or continue searching?`
    : `This search does not appear to match<br/>your current focus topic.`;
  const continueBtnText = isReminder ? "Continue for 5 more minutes →" : "Continue Search →";

  modal.innerHTML = `
    <div style="background: #111; border: 1px solid #2a2a2a; border-top: 3px solid #ff4444;
      border-radius: 14px; padding: 32px 28px; color: #f0f0f0; text-align: center;
      max-width: 440px; width: 90%; box-shadow: 0 24px 64px rgba(0,0,0,0.7); box-sizing: border-box;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #ff4444; text-transform: uppercase; margin-bottom: 12px;">
        ${badgeText}
      </div>
      <div style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 12px; line-height: 1.35;">
        ${titleText}
      </div>
      <p style="color: #aaa; font-size: 13px; margin: 0 0 6px; line-height: 1.5;">
        Your current focus is:
      </p>
      <div style="display: inline-block; background: rgba(255,68,68,0.15); border: 1px solid rgba(255,68,68,0.3);
        color: #ff4444; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-bottom: 16px;">
        ${topic || "Active Focus Topic"}
      </div>
      <p style="color: #888; font-size: 13px; margin: 0 0 24px; line-height: 1.5;">
        ${descText}
      </p>
      <div style="display: flex; gap: 10px; justify-content: center; flex-direction: column;">
        <button id="fr-modal-continue" style="padding: 12px 18px; background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: #f0f0f0; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: background 0.15s, border-color 0.15s; font-family: inherit;">
          ${continueBtnText}
        </button>
        <button id="fr-modal-back" style="padding: 12px 18px; background: #ff4444;
          border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: background 0.15s; font-family: inherit;">
          ← Go Back
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Clear search input if on page
  const searchInput = getSearchInputElement();
  if (searchInput && !isReminder) {
    searchInput.value = "";
  }

  // 1. GO BACK ACTION: Keep user inside YouTube
  document.getElementById("fr-modal-back").addEventListener("click", () => {
    resetOffTopicTimer();
    modal.remove();
    if (alreadyNavigated || location.pathname.startsWith("/results")) {
      history.back();
      setTimeout(() => {
        if (location.pathname.startsWith("/results")) {
          window.location.href = "/";
        }
      }, 300);
    }
  });

  // 2. CONTINUE SEARCH ACTION: 5-minute timer & cumulative allowance tracking
  document.getElementById("fr-modal-continue").addEventListener("click", () => {
    modal.remove();
    _offTopicAllowanceActive = true;
    _allowedOffTopicQuery = (query || "").toLowerCase().trim();
    _offTopicElapsedMinutes = (elapsedMinutes || 0) + 5;

    // Schedule 5-minute reminder popup
    if (_offTopicTimer) clearTimeout(_offTopicTimer);
    _offTopicTimer = setTimeout(() => {
      if (_sgActive && _sgProfile && _sgMode === "casual" && _offTopicAllowanceActive) {
        showWarningModal(query, _sgProfile.topic, true, _offTopicElapsedMinutes);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // If not already on the results page for this query, navigate to it
    if (!alreadyNavigated && location.pathname !== "/results") {
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
  });
}

// ── GLOBAL EXPORTS ─────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  window.enableSearchGuard = enableSearchGuard;
  window.disableSearchGuard = disableSearchGuard;
  window.updateSearchGuardMode = updateSearchGuardMode;
  window.initSearchGuard = initSearchGuard;
  window.isOffTopicSearchAllowed = isOffTopicSearchAllowed;
  window.resetOffTopicTimer = resetOffTopicTimer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    enableSearchGuard,
    disableSearchGuard,
    updateSearchGuardMode,
    initSearchGuard,
    isSearchQueryRelevant,
    isOffTopicSearchAllowed,
    resetOffTopicTimer
  };
}

