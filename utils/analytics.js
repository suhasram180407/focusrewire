// utils/analytics.js
// Centralized analytics tracking and retrieval

const Analytics = (() => {

  // Get local calendar date key (YYYY-MM-DD in local time)
  function getLocalTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Default analytics structure
  const defaultAnalytics = {
    blockedVideos: 0,
    shortsBlocked: 0,
    blockedSearches: 0,
    sponsorsBlocked: 0,
    timeSaved: 0,
    sessionsCompleted: 0,
    totalFocusMinutes: 0,
    statsDate: null,       // Local date string "YYYY-MM-DD"
    todayBlocked: 0,       // Reset to 0 when local date rolls over
    todayShorts: 0,        // Reset to 0 when local date rolls over
    todayTimeSaved: 0,     // Reset to 0 when local date rolls over
    dailyStats: {},        // { "YYYY-MM-DD": { blockedVideos, shortsBlocked, blockedSearches, sponsorsBlocked, focusMinutes } }
    weeklyStats: [],       // last 7 days summary
    topicsStudied: [],     // list of topics used
    lastUpdated: null
  };

  // Helper to ensure today's stats container exists and resets if day rolled over
  function ensureDayRollover(a) {
    const today = getLocalTodayDate();
    if (a.statsDate !== today) {
      a.statsDate = today;
      a.todayBlocked = 0;
      a.todayShorts = 0;
      a.todayTimeSaved = 0;
    }
    if (!a.dailyStats) a.dailyStats = {};
    if (!a.dailyStats[today]) {
      a.dailyStats[today] = {
        blockedVideos: 0,
        shortsBlocked: 0,
        blockedSearches: 0,
        sponsorsBlocked: 0,
        focusMinutes: 0
      };
    }
    return today;
  }

  // Increment a specific counter
  function track(key, amount = 1) {
    chrome.storage.local.get("analytics", (data) => {
      const a = Object.assign({}, defaultAnalytics, data.analytics || {});
      const today = ensureDayRollover(a);

      // Global lifetime count
      a[key] = (a[key] || 0) + amount;
      a.timeSaved = Math.round((a.blockedVideos || 0) * 1.5);

      // Daily counters
      if (key === "blockedVideos") {
        a.todayBlocked = (a.todayBlocked || 0) + amount;
        a.todayTimeSaved = Math.round(a.todayBlocked * 1.5);
      } else if (key === "shortsBlocked") {
        a.todayShorts = (a.todayShorts || 0) + amount;
      }

      // Historical daily stats for dashboard
      if (a.dailyStats[today] && a.dailyStats[today][key] !== undefined) {
        a.dailyStats[today][key] += amount;
      }

      a.lastUpdated = Date.now();
      chrome.storage.local.set({ analytics: a });
    });
  }

  // Add focus session time
  function trackSession(durationMinutes) {
    chrome.storage.local.get("analytics", (data) => {
      const a = Object.assign({}, defaultAnalytics, data.analytics || {});
      const today = ensureDayRollover(a);

      a.sessionsCompleted = (a.sessionsCompleted || 0) + 1;
      a.totalFocusMinutes = (a.totalFocusMinutes || 0) + durationMinutes;

      if (a.dailyStats[today]) {
        a.dailyStats[today].focusMinutes = (a.dailyStats[today].focusMinutes || 0) + durationMinutes;
      }

      a.lastUpdated = Date.now();
      chrome.storage.local.set({ analytics: a });
    });
  }

  // Add topic to studied list
  function trackTopic(topic) {
    chrome.storage.local.get("analytics", (data) => {
      const a = Object.assign({}, defaultAnalytics, data.analytics || {});
      if (!a.topicsStudied) a.topicsStudied = [];
      if (!a.topicsStudied.includes(topic)) {
        a.topicsStudied.push(topic);
      }
      chrome.storage.local.set({ analytics: a });
    });
  }

  // Get last 7 days data for chart
  function getLast7Days(analytics) {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      const stat = (analytics?.dailyStats || {})[key] || {};
      result.push({
        date: key,
        label: dayLabel,
        blockedVideos: stat.blockedVideos || 0,
        shortsBlocked: stat.shortsBlocked || 0,
        blockedSearches: stat.blockedSearches || 0,
        sponsorsBlocked: stat.sponsorsBlocked || 0,
        focusMinutes: stat.focusMinutes || 0
      });
    }
    return result;
  }

  // Calculate efficiency score (0-100)
  function getEfficiencyScore(analytics) {
    const allowed = analytics?.totalFocusMinutes || 0;
    const blocked = analytics?.blockedVideos || 0;
    if (allowed + blocked === 0) return 0;
    return Math.round((allowed / (allowed + blocked)) * 100);
  }

  // Reset all analytics
  function reset(callback) {
    chrome.storage.local.set({ analytics: { ...defaultAnalytics } }, callback);
  }

  return {
    track,
    trackSession,
    trackTopic,
    getLast7Days,
    getEfficiencyScore,
    reset,
    getLocalTodayDate,
    ensureDayRollover,
    defaultAnalytics
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Analytics;
}

