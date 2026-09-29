// background.js
// Service worker — handles API calls, messaging, background tasks, and timer management

importScripts("utils/aiProvider.js");

// ── MESSAGE ROUTER ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GENERATE_KEYWORDS") {
    generateKeywords(message.topic, message.forceRefresh)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({
        success: false,
        error: {
          code: err.code || "UNKNOWN_ERROR",
          message: err.message || "Keyword generation failed",
          provider: err.provider || "",
          model: err.model || ""
        }
      }));
    return true;
  }

  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "OPEN_SETTINGS") {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "START_SESSION") {
    const profile = message.profile;
    const mode = message.mode || "strict";
    chrome.storage.local.set({
      sessionActive: true,
      activeFocusProfile: profile,
      currentMode: mode
    }, () => {
      broadcastToYouTubeTabs({
        type: "SESSION_STARTED",
        profile,
        mode
      });
      sendResponse({ success: true, active: true });
    });
    return true;
  }

  if (message.type === "STOP_SESSION") {
    chrome.storage.local.set({ sessionActive: false }, () => {
      chrome.storage.local.remove(["activeFocusProfile", "timerState", "timerStartTime", "timerDuration"], () => {
        broadcastToYouTubeTabs({
          type: "SESSION_STOPPED"
        });
        sendResponse({ success: true, active: false });
      });
    });
    return true;
  }

  if (message.type === "SET_MODE") {
    chrome.storage.local.set({ currentMode: message.mode }, () => {
      broadcastToYouTubeTabs({
        type: "SET_MODE",
        mode: message.mode
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SET_REWIRE_MODE") {
    chrome.storage.local.set({ rewireMode: message.enabled }, () => {
      broadcastToYouTubeTabs({
        type: "SET_REWIRE_MODE",
        enabled: message.enabled
      });
      sendResponse({ success: true, rewireMode: message.enabled });
    });
    return true;
  }


  if (message.type === "CLEAR_PROFILE") {
    chrome.storage.local.remove("activeFocusProfile", () => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CHECK_SEARCH_RELEVANCE") {
    checkSearchRelevance(message.query, message.topic)
      .then(res => sendResponse(res))
      .catch(() => sendResponse({ related: true, fallback: true }));
    return true;
  }

  if (
    message.type === "GET_PROVIDER_MODELS" ||
    message.type === "GET_OPENROUTER_MODELS" ||
    message.type === "GET_GEMINI_MODELS" ||
    message.type === "GET_GROQ_MODELS" ||
    message.type === "GET_MISTRAL_MODELS" ||
    message.type === "GET_OLLAMA_MODELS"
  ) {
    let provider = message.provider;
    if (!provider) {
      if (message.type === "GET_OLLAMA_MODELS") provider = "ollama";
      else if (message.type === "GET_GEMINI_MODELS") provider = "gemini";
      else if (message.type === "GET_GROQ_MODELS") provider = "groq";
      else if (message.type === "GET_MISTRAL_MODELS") provider = "mistral";
      else provider = "openrouter";
    }
    const cred = message.credential || message.apiKey || message.endpoint;

    AIService.getModels(provider, cred)
      .then(models => sendResponse({ success: true, models }))
      .catch(err => sendResponse({
        success: false,
        error: {
          code: err.code || "UNKNOWN_ERROR",
          message: err.message || "Failed to fetch models",
          provider: err.provider || provider,
          model: err.model || "",
          retryAfter: err.retryAfter || null
        }
      }));
    return true;
  }

  if (message.type === "TEST_AI_CONNECTION") {
    AIService.testConnection(message.config)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({
        success: false,
        status: "Connection failed",
        message: err.message || "Test failed",
        error: {
          code: err.code || "UNKNOWN_ERROR",
          message: err.message || "Test failed",
          provider: err.provider || message.config?.provider || "",
          model: err.model || "",
          retryAfter: err.retryAfter || null
        }
      }));
    return true;
  }

  if (message.type === "GET_AI_CONFIG") {
    AIService.getConfig()
      .then(config => sendResponse({ success: true, config }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SAVE_AI_CONFIG") {
    AIService.saveConfig(message.config)
      .then(config => sendResponse({ success: true, config }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Fallback for unknown messages to prevent hung channels
  sendResponse({ ok: false, error: "Unhandled message type in background" });
  return false;
});

// ── KEYWORD GENERATION ────────────────────────────────────────────────────

async function generateKeywords(topic, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await chrome.storage.local.get(`kw_${topic}`);
    if (cached[`kw_${topic}`]) {
      const profile = cached[`kw_${topic}`];
      await chrome.storage.local.set({ activeFocusProfile: profile });
      return { success: true, profile, fromCache: true };
    }
  }

  try {
    const result = await AIService.generateKeywords(topic);
    if (result && result.success && result.profile) {
      await cacheProfile(topic, result.profile);
      return {
        success: true,
        profile: result.profile,
        fallback: Boolean(result.fallback)
      };
    }

    if (result && !result.success && result.error) {
      const code = result.error.code;
      if (code === "RATE_LIMITED" || code === "QUOTA_EXCEEDED" || code === "FREE_TIER_EXHAUSTED") {
        return {
          success: false,
          error: result.error,
          quotaExceeded: true
        };
      }
    }
  } catch (e) {
    console.warn("AIService keyword generation error:", e);
    if (e.code === "RATE_LIMITED" || e.code === "QUOTA_EXCEEDED") {
      return {
        success: false,
        error: {
          code: e.code,
          provider: e.provider || "",
          model: e.model || "",
          message: e.message || "Free rate limit reached."
        },
        quotaExceeded: true
      };
    }
  }

  const fallback = FallbackProvider.generateKeywords(topic);
  await cacheProfile(topic, fallback);
  return { success: true, profile: fallback, fallback: true };
}

async function cacheProfile(topic, profile) {
  await chrome.storage.local.set({
    [`kw_${topic}`]: profile,
    activeFocusProfile: profile
  });
}

// ── SEARCH RELEVANCE ──────────────────────────────────────────────────────

async function checkSearchRelevance(query, topic) {
  try {
    return await AIService.classifySearch(query, topic);
  } catch (e) {
    return { related: true, fallback: true };
  }
}

function getLocalTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── ALARM: daily stats rollup + timer management ────────────────────────

chrome.alarms.create("dailyRollup", { periodInMinutes: 60 });
chrome.alarms.create("timerCheck", { periodInMinutes: 0.1 }); // Check every 6 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyRollup") {
    chrome.storage.local.get("analytics", (data) => {
      const a = data.analytics;
      if (!a || !a.dailyStats) return;
      const keys = Object.keys(a.dailyStats).sort();
      if (keys.length > 30) {
        keys.slice(0, keys.length - 30).forEach(k => delete a.dailyStats[k]);
        chrome.storage.local.set({ analytics: a });
      }
    });
  }

  if (alarm.name === "timerCheck") {
    chrome.storage.local.get(["timerState", "timerStartTime", "timerDuration"], (data) => {
      if (data.timerState === "running" && data.timerStartTime && data.timerDuration) {
        const elapsed = Math.floor((Date.now() - data.timerStartTime) / 1000);
        const timeLeft = data.timerDuration - elapsed;

        if (timeLeft <= 0) {
          chrome.storage.local.get("analytics", (analyticsData) => {
            const a = analyticsData.analytics || {};
            a.sessionsCompleted = (a.sessionsCompleted || 0) + 1;
            a.totalFocusMinutes = (a.totalFocusMinutes || 0) + Math.floor(data.timerDuration / 60);
            const today = getLocalTodayDate();
            if (!a.dailyStats) a.dailyStats = {};
            if (!a.dailyStats[today]) a.dailyStats[today] = { blockedVideos: 0, shortsBlocked: 0, blockedSearches: 0, sponsorsBlocked: 0, focusMinutes: 0 };
            a.dailyStats[today].focusMinutes = (a.dailyStats[today].focusMinutes || 0) + Math.floor(data.timerDuration / 60);
            chrome.storage.local.set({ analytics: a });
          });

          chrome.storage.local.remove(["timerState", "timerStartTime", "timerDuration"]);
        }
      }
    });
  }
});

// ── BROADCAST HELPER ──────────────────────────────────────────────────────

function broadcastToYouTubeTabs(msg) {
  chrome.tabs.query({}, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach((tab) => {
        if (tab.url && (tab.url.includes("youtube.com") || tab.url.includes("youtu.be"))) {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {
            // Tab might not have content script ready or tab closed
          });
        }
      });
    }
  });
}

