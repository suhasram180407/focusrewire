// popup.js

let timerInterval = null;
let timeLeft = 25 * 60;
let timerRunning = false;
let currentMode = "strict";
let activeProfile = null;
let timerStartTime = null;

// ── INIT ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.local.get([
    "activeFocusProfile", "currentMode", "analytics", "rewireMode", 
    "timerState", "timerStartTime", "timerDuration"
  ]);

  if (data.activeFocusProfile) {
    activeProfile = data.activeFocusProfile;
    document.getElementById("topicInput").value = activeProfile.topic;
    setStatus(`✅ Active: ${activeProfile.topic}`, "green");
    toggleSessionUI(true);
  }

  if (data.currentMode) setMode(data.currentMode, false);
  if (data.analytics) updateStatsUI(data.analytics);

  if (data.rewireMode) {
    document.getElementById("rewireBtn").classList.add("active");
    document.getElementById("rewireBtn").textContent = "🔁 Rewire: ON";
  }

  // Restore timer state
  if (data.timerState && data.timerStartTime && data.timerDuration) {
    const elapsed = Math.floor((Date.now() - data.timerStartTime) / 1000);
    timeLeft = Math.max(0, data.timerDuration - elapsed);
    
    if (data.timerState === "running" && timeLeft > 0) {
      timerRunning = true;
      timerStartTime = data.timerStartTime;
      const tb = document.getElementById("timerBtn");
      tb.textContent = "⏸ Pause";
      if (currentMode === "strict") tb.style.opacity = "0.4";
      document.getElementById("timerDisplay").contentEditable = "false";
      startTimerInterval();
    } else if (timeLeft <= 0) {
      // Timer finished while popup was closed
      timeLeft = 5 * 60; // 5 min break
      onSessionComplete();
    }
  }
  
  updateTimerDisplay();

  // Refresh stats every 2s while popup is open
  setInterval(refreshStats, 2000);
});

function toggleSessionUI(isActive) {
  const act = document.getElementById("activateBtn");
  const deact = document.getElementById("deactivateBtn");
  if (isActive) {
    act.disabled = true;
    act.classList.replace("btn-primary", "btn-secondary");
    deact.disabled = false;
    deact.classList.replace("btn-secondary", "btn-primary");
  } else {
    act.disabled = false;
    act.classList.replace("btn-secondary", "btn-primary");
    deact.disabled = true;
    deact.classList.replace("btn-primary", "btn-secondary");
  }
}

// ── ACTIVATE / DEACTIVATE ─────────────────────────────────────────────────

document.getElementById("activateBtn").addEventListener("click", async () => {
  const topic = document.getElementById("topicInput").value.trim();
  if (!topic) { setStatus("⚠️ Please enter a topic.", "red"); return; }

  setStatus("⏳ Generating AI keywords...", "dim");
  document.getElementById("activateBtn").disabled = true;

  const response = await chrome.runtime.sendMessage({
    type: "GENERATE_KEYWORDS",
    topic
  });

  document.getElementById("activateBtn").disabled = false;

  if (response && response.success) {
    activeProfile = response.profile;
    const cached = response.fromCache ? " (cached)" : "";
    const fallback = response.fallback ? " (offline mode)" : "";
    setStatus(`✅ Active: ${topic}${cached}${fallback}`, "green");
    toggleSessionUI(true);

    // Tell content script to start filtering
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "START_FILTERING",
        profile: response.profile
      });
    }
  } else {
    setStatus("❌ Error generating keywords. Check API key.", "red");
  }
});

document.getElementById("deactivateBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove("activeFocusProfile");
  activeProfile = null;
  setStatus("⏸ Session ended.", "dim");
  toggleSessionUI(false);
  document.getElementById("topicInput").value = "";
  
  // Auto-reset timer when session ends
  clearInterval(timerInterval);
  timerRunning = false;
  timeLeft = 25 * 60;
  timerStartTime = null;
  updateTimerDisplay();
  const tb = document.getElementById("timerBtn");
  tb.textContent = "▶ Start";
  tb.style.opacity = "";
  document.getElementById("timerDisplay").contentEditable = "plaintext-only";
  
  // Clear timer state from storage
  chrome.storage.local.remove(["timerState", "timerStartTime", "timerDuration"]);
});

// ── MODE TOGGLE ───────────────────────────────────────────────────────────

document.getElementById("strictBtn").addEventListener("click", () => {
  if (activeProfile || timerRunning) {
    setStatus("🔒 Cannot change mode during active session!", "red");
    return;
  }
  setMode("strict");
});

document.getElementById("casualBtn").addEventListener("click", () => {
  if (activeProfile || timerRunning) {
    setStatus("🔒 Cannot change mode during active session!", "red");
    return;
  }
  setMode("casual");
});

function setMode(mode, broadcast = true) {
  currentMode = mode;
  chrome.storage.local.set({ currentMode: mode });
  document.getElementById("strictBtn").classList.toggle("active", mode === "strict");
  document.getElementById("casualBtn").classList.toggle("active", mode === "casual");

  if (broadcast) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "SET_MODE", mode });
    });
  }
}


// ── TIMER ────────────────────────────────────────────────────────────────

document.getElementById("timerBtn").addEventListener("click", () => {
  if (timerRunning) {
    if (currentMode === "strict") {
      setStatus("🔒 Cannot pause in Strict Mode!", "red");
      return;
    }
    pauseTimer();
  } else {
    startTimer();
  }
});

document.getElementById("resetTimerBtn").addEventListener("click", () => {
  resetTimer();
});

function startTimer() {
  timerRunning = true;
  timerStartTime = Date.now();
  const tb = document.getElementById("timerBtn");
  tb.textContent = "⏸ Pause";
  if (currentMode === "strict") tb.style.opacity = "0.4";
  
  document.getElementById("timerDisplay").contentEditable = "false";
  
  // Save timer state
  chrome.storage.local.set({
    timerState: "running",
    timerStartTime: timerStartTime,
    timerDuration: timeLeft
  });
  
  startTimerInterval();
}

function startTimerInterval() {
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      const tbtn = document.getElementById("timerBtn");
      tbtn.textContent = "▶ Start";
      tbtn.style.opacity = "";
      document.getElementById("timerDisplay").contentEditable = "plaintext-only";
      timeLeft = 5 * 60; // 5 min break
      
      // Clear timer state
      chrome.storage.local.remove(["timerState", "timerStartTime", "timerDuration"]);
      
      onSessionComplete();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  const tb = document.getElementById("timerBtn");
  tb.textContent = "▶ Resume";
  tb.style.opacity = "";
  document.getElementById("timerDisplay").contentEditable = "plaintext-only";
  
  // Save paused state
  chrome.storage.local.set({
    timerState: "paused",
    timerStartTime: null,
    timerDuration: timeLeft
  });
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const s = (timeLeft % 60).toString().padStart(2, "0");
  document.getElementById("timerDisplay").textContent = `${m}:${s}`;
}

const timerDisplay = document.getElementById("timerDisplay");

timerDisplay.addEventListener("blur", processEdit);
timerDisplay.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    processEdit();
  }
});

function processEdit() {
  const txt = timerDisplay.textContent.trim();
  let m = 25, s = 0;
  if (txt.includes(":")) {
    const parts = txt.split(":");
    m = parseInt(parts[0]) || 0;
    s = parseInt(parts[1]) || 0;
  } else {
    m = parseInt(txt) || 0;
  }
  
  if (m >= 0 && s >= 0 && (m > 0 || s > 0)) {
    timeLeft = m * 60 + s;
    
    // Update stored duration if timer is paused
    if (!timerRunning) {
      chrome.storage.local.set({
        timerDuration: timeLeft
      });
    }
  }
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timeLeft = 25 * 60;
  timerStartTime = null;
  updateTimerDisplay();
  const tb = document.getElementById("timerBtn");
  tb.textContent = "▶ Start";
  tb.style.opacity = "";
  document.getElementById("timerDisplay").contentEditable = "plaintext-only";
  
  // Clear timer state from storage
  chrome.storage.local.remove(["timerState", "timerStartTime", "timerDuration"]);
}

async function onSessionComplete() {
  // Track session
  chrome.storage.local.get("analytics", (data) => {
    const a = data.analytics || {};
    a.sessionsCompleted = (a.sessionsCompleted || 0) + 1;
    a.totalFocusMinutes = (a.totalFocusMinutes || 0) + 25;
    const today = new Date().toISOString().split("T")[0];
    if (!a.dailyStats) a.dailyStats = {};
    if (!a.dailyStats[today]) a.dailyStats[today] = { blockedVideos: 0, shortsBlocked: 0, blockedSearches: 0, focusMinutes: 0 };
    a.dailyStats[today].focusMinutes = (a.dailyStats[today].focusMinutes || 0) + 25;
    chrome.storage.local.set({ analytics: a });
  });

  setStatus("☕ Break time! 5 min rest.", "green");
  setTimeout(() => {
    timeLeft = 25 * 60;
    updateTimerDisplay();
    setStatus(`✅ Active: ${activeProfile?.topic || ""}`, "green");
  }, 5 * 60 * 1000);
}

// ── REWIRE MODE ──────────────────────────────────────────────────────────

document.getElementById("rewireBtn").addEventListener("click", async () => {
  const data = await chrome.storage.local.get("rewireMode");
  const newVal = !data.rewireMode;
  await chrome.storage.local.set({ rewireMode: newVal });

  const btn = document.getElementById("rewireBtn");
  btn.classList.toggle("active", newVal);
  btn.textContent = newVal ? "🔁 Rewire: ON" : "🔁 Rewire Mode";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SET_REWIRE_MODE", enabled: newVal });
  }
});

// ── OPEN DASHBOARD ───────────────────────────────────────────────────────

document.getElementById("dashboardBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("dashboardBtn2").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// ── STATS REFRESH ────────────────────────────────────────────────────────

async function refreshStats() {
  const data = await chrome.storage.local.get("analytics");
  if (data.analytics) updateStatsUI(data.analytics);
}

function updateStatsUI(a) {
  document.getElementById("blockedCount").textContent = a.blockedVideos || 0;
  document.getElementById("shortsCount").textContent = a.shortsBlocked || 0;
  document.getElementById("timeSaved").textContent = `${a.timeSaved || 0}m`;
}

// ── HELPERS ──────────────────────────────────────────────────────────────

function setStatus(msg, type = "dim") {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.style.color = type === "green" ? "#4ade80" :
                   type === "red"   ? "#ff4444" : "#888";
}
