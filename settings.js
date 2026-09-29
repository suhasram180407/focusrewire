// settings.js — FocusRewire Settings UI Logic
// FREE-ONLY AI Provider configuration, model discovery, testing, and rate-limit modal handling

document.addEventListener("DOMContentLoaded", () => {
  // ── DOM ELEMENTS: GENERAL ──────────────────────────────────────────────────
  const backBtn = document.getElementById("backBtn");
  const providerSelect = document.getElementById("providerSelect");
  const statusPill = document.getElementById("statusPill");
  const statusLabel = document.getElementById("statusLabel");
  const statusMessage = document.getElementById("statusMessage");
  const saveConfigBtn = document.getElementById("saveConfigBtn");
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");

  // Quota Modal Elements
  const quotaModal = document.getElementById("quotaModal");
  const closeQuotaModalBtn = document.getElementById("closeQuotaModalBtn");
  const quotaProviderName = document.getElementById("quotaProviderName");
  const quotaModelName = document.getElementById("quotaModelName");
  const quotaRetryInfo = document.getElementById("quotaRetryInfo");
  const quotaChangeModelBtn = document.getElementById("quotaChangeModelBtn");
  const quotaChangeProviderBtn = document.getElementById("quotaChangeProviderBtn");

  // Provider Panels
  const panels = {
    openrouter: document.getElementById("openrouterPanel"),
    gemini: document.getElementById("geminiPanel"),
    groq: document.getElementById("groqPanel"),
    mistral: document.getElementById("mistralPanel"),
    ollama: document.getElementById("ollamaPanel"),
    offline: document.getElementById("offlinePanel")
  };

  // Provider UI Controls
  const providerUI = {
    openrouter: {
      keyInput: document.getElementById("openrouterKey"),
      toggleBtn: document.getElementById("toggleOpenrouterKeyBtn"),
      fetchBtn: document.getElementById("fetchOpenrouterModelsBtn"),
      keyError: document.getElementById("openrouterKeyError"),
      emptyNotice: document.getElementById("openrouterEmptyNotice"),
      loadedContainer: document.getElementById("openrouterLoadedContainer"),
      searchInput: document.getElementById("openrouterSearchInput"),
      sortSelect: document.getElementById("openrouterSortSelect"),
      modelsCount: document.getElementById("openrouterModelsCount"),
      refreshBtn: document.getElementById("refreshOpenrouterBtn"),
      listContainer: document.getElementById("openrouterModelListContainer"),
      selectedBanner: document.getElementById("openrouterSelectedBanner"),
      selectedTitle: document.getElementById("selectedOpenrouterName"),
      selectedId: document.getElementById("selectedOpenrouterId"),
      testBtn: document.getElementById("testOpenrouterModelBtn"),
      models: [],
      selectedModel: null,
      isTested: false,
      cacheKey: "focusrewire_openrouter_free_models"
    },
    gemini: {
      keyInput: document.getElementById("geminiKey"),
      toggleBtn: document.getElementById("toggleGeminiKeyBtn"),
      fetchBtn: document.getElementById("fetchGeminiModelsBtn"),
      keyError: document.getElementById("geminiKeyError"),
      emptyNotice: document.getElementById("geminiEmptyNotice"),
      loadedContainer: document.getElementById("geminiLoadedContainer"),
      searchInput: document.getElementById("geminiSearchInput"),
      sortSelect: document.getElementById("geminiSortSelect"),
      modelsCount: document.getElementById("geminiModelsCount"),
      refreshBtn: document.getElementById("refreshGeminiBtn"),
      listContainer: document.getElementById("geminiModelListContainer"),
      selectedBanner: document.getElementById("geminiSelectedBanner"),
      selectedTitle: document.getElementById("selectedGeminiName"),
      selectedId: document.getElementById("selectedGeminiId"),
      testBtn: document.getElementById("testGeminiModelBtn"),
      models: [],
      selectedModel: null,
      isTested: false,
      cacheKey: "focusrewire_gemini_free_models"
    },
    groq: {
      keyInput: document.getElementById("groqKey"),
      toggleBtn: document.getElementById("toggleGroqKeyBtn"),
      fetchBtn: document.getElementById("fetchGroqModelsBtn"),
      keyError: document.getElementById("groqKeyError"),
      emptyNotice: document.getElementById("groqEmptyNotice"),
      loadedContainer: document.getElementById("groqLoadedContainer"),
      searchInput: document.getElementById("groqSearchInput"),
      sortSelect: document.getElementById("groqSortSelect"),
      modelsCount: document.getElementById("groqModelsCount"),
      refreshBtn: document.getElementById("refreshGroqBtn"),
      listContainer: document.getElementById("groqModelListContainer"),
      selectedBanner: document.getElementById("groqSelectedBanner"),
      selectedTitle: document.getElementById("selectedGroqName"),
      selectedId: document.getElementById("selectedGroqId"),
      testBtn: document.getElementById("testGroqModelBtn"),
      models: [],
      selectedModel: null,
      isTested: false,
      cacheKey: "focusrewire_groq_free_models"
    },
    mistral: {
      keyInput: document.getElementById("mistralKey"),
      toggleBtn: document.getElementById("toggleMistralKeyBtn"),
      fetchBtn: document.getElementById("fetchMistralModelsBtn"),
      keyError: document.getElementById("mistralKeyError"),
      emptyNotice: document.getElementById("mistralEmptyNotice"),
      loadedContainer: document.getElementById("mistralLoadedContainer"),
      searchInput: document.getElementById("mistralSearchInput"),
      sortSelect: document.getElementById("mistralSortSelect"),
      modelsCount: document.getElementById("mistralModelsCount"),
      refreshBtn: document.getElementById("refreshMistralBtn"),
      listContainer: document.getElementById("mistralModelListContainer"),
      selectedBanner: document.getElementById("mistralSelectedBanner"),
      selectedTitle: document.getElementById("selectedMistralName"),
      selectedId: document.getElementById("selectedMistralId"),
      testBtn: document.getElementById("testMistralModelBtn"),
      models: [],
      selectedModel: null,
      isTested: false,
      cacheKey: "focusrewire_mistral_free_models"
    },
    ollama: {
      endpointInput: document.getElementById("ollamaEndpoint"),
      detectBtn: document.getElementById("detectOllamaModelsBtn"),
      emptyNotice: document.getElementById("ollamaEmptyNotice"),
      loadedContainer: document.getElementById("ollamaLoadedContainer"),
      searchInput: document.getElementById("ollamaSearchInput"),
      sortSelect: document.getElementById("ollamaSortSelect"),
      modelsCount: document.getElementById("ollamaModelsCount"),
      refreshBtn: document.getElementById("refreshOllamaBtn"),
      listContainer: document.getElementById("ollamaModelListContainer"),
      selectedBanner: document.getElementById("ollamaSelectedBanner"),
      selectedTitle: document.getElementById("selectedOllamaName"),
      selectedId: document.getElementById("selectedOllamaId"),
      testBtn: document.getElementById("testOllamaModelBtn"),
      models: [],
      selectedModel: null,
      isTested: false
    }
  };

  // State
  let currentConfig = {
    provider: "offline",
    openrouter: { apiKey: "", model: "" },
    gemini: { apiKey: "", model: "" },
    groq: { apiKey: "", model: "" },
    mistral: { apiKey: "", model: "" },
    ollama: { endpoint: "http://localhost:11434", model: "" }
  };

  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  // ── 1. INITIAL LOAD ────────────────────────────────────────────────────────
  loadSettings();

  function loadSettings() {
    sendMessageSafe({ type: "GET_AI_CONFIG" }, (res) => {
      if (res && res.success && res.config) {
        currentConfig = {
          provider: res.config.provider || "offline",
          openrouter: {
            apiKey: res.config.openrouter?.apiKey || "",
            model: res.config.openrouter?.model || ""
          },
          gemini: {
            apiKey: res.config.gemini?.apiKey || "",
            model: res.config.gemini?.model || ""
          },
          groq: {
            apiKey: res.config.groq?.apiKey || "",
            model: res.config.groq?.model || ""
          },
          mistral: {
            apiKey: res.config.mistral?.apiKey || "",
            model: res.config.mistral?.model || ""
          },
          ollama: {
            endpoint: res.config.ollama?.endpoint || "http://localhost:11434",
            model: res.config.ollama?.model || ""
          }
        };
      }
      populateInitialUI();
    });
  }

  function populateInitialUI() {
    const provider = currentConfig.provider || "offline";
    providerSelect.value = provider;

    // Populate saved keys and models
    providerUI.openrouter.keyInput.value = currentConfig.openrouter?.apiKey || "";
    if (currentConfig.openrouter?.model) {
      providerUI.openrouter.selectedModel = { id: currentConfig.openrouter.model, name: currentConfig.openrouter.model };
    }

    providerUI.gemini.keyInput.value = currentConfig.gemini?.apiKey || "";
    if (currentConfig.gemini?.model) {
      providerUI.gemini.selectedModel = { id: currentConfig.gemini.model, name: currentConfig.gemini.model };
    }

    providerUI.groq.keyInput.value = currentConfig.groq?.apiKey || "";
    if (currentConfig.groq?.model) {
      providerUI.groq.selectedModel = { id: currentConfig.groq.model, name: currentConfig.groq.model };
    }

    providerUI.mistral.keyInput.value = currentConfig.mistral?.apiKey || "";
    if (currentConfig.mistral?.model) {
      providerUI.mistral.selectedModel = { id: currentConfig.mistral.model, name: currentConfig.mistral.model };
    }

    providerUI.ollama.endpointInput.value = currentConfig.ollama?.endpoint || "http://localhost:11434";
    if (currentConfig.ollama?.model) {
      providerUI.ollama.selectedModel = { id: currentConfig.ollama.model, name: currentConfig.ollama.model };
    }

    switchProviderPanel(provider);

    // Load cached models for cloud providers with saved credentials
    ["openrouter", "gemini", "groq", "mistral"].forEach(pKey => {
      const p = providerUI[pKey];
      if (p.keyInput.value.trim()) {
        loadCachedModels(pKey);
      }
    });

    updateSaveButtonState();
  }

  function loadCachedModels(pKey) {
    const p = providerUI[pKey];
    if (!p.cacheKey) return;

    chrome.storage.local.get(p.cacheKey, (data) => {
      const cached = data[p.cacheKey];
      if (cached && Array.isArray(cached.models) && cached.models.length > 0) {
        // Enforce Free-Only + FocusRewire Compatible filter on cached models
        p.models = cached.models.filter(m => {
          const free = typeof isFreeModel === "function" ? isFreeModel(m, pKey) : (m.is_free || (m.prompt_price === 0 && m.completion_price === 0));
          const comp = typeof isFocusRewireCompatible === "function" ? isFocusRewireCompatible(m, pKey) : true;
          return free && comp;
        });
        renderProviderModels(pKey);

        const savedModelId = currentConfig[pKey]?.model;
        if (savedModelId) {
          const match = p.models.find(m => m.id === savedModelId);
          if (match) {
            selectProviderModel(pKey, match, false);
            p.isTested = true; // previously saved
          }
        }
      }
    });
  }

  // ── 2. PROVIDER SWITCHING ──────────────────────────────────────────────────
  providerSelect.addEventListener("change", (e) => {
    switchProviderPanel(e.target.value);
  });

  function switchProviderPanel(provider) {
    Object.keys(panels).forEach(key => {
      if (panels[key]) panels[key].classList.remove("active");
    });

    if (panels[provider]) {
      panels[provider].classList.add("active");
    }

    if (provider === "offline") {
      updateStatus("ready", "Ready", "Built-in rule-based fallback engine is ready ($0 cost, no network required).");
    } else {
      const p = providerUI[provider];
      if (p && p.selectedModel && p.isTested) {
        updateStatus("connected", "Connected", `Free model "${p.selectedModel.name}" is verified and ready.`);
      } else if (p && p.selectedModel) {
        updateStatus("not-tested", "Not tested", `Selected "${p.selectedModel.name}". Click "Test Selected Model" to verify.`);
      } else {
        updateStatus("not-configured", "Not configured", "Fetch free models and select a model to continue.");
      }
    }

    updateSaveButtonState();
  }

  // ── 3. SHOW / HIDE API KEYS ────────────────────────────────────────────────
  setupToggleKey("openrouter");
  setupToggleKey("gemini");
  setupToggleKey("groq");
  setupToggleKey("mistral");

  function setupToggleKey(pKey) {
    const p = providerUI[pKey];
    if (!p?.toggleBtn || !p?.keyInput) return;
    p.toggleBtn.addEventListener("click", () => {
      const isPass = p.keyInput.type === "password";
      p.keyInput.type = isPass ? "text" : "password";
      p.toggleBtn.textContent = isPass ? "Hide" : "Show";
    });
  }

  // ── 4. MODEL DISCOVERY (FREE ONLY) ─────────────────────────────────────────
  setupCloudDiscovery("openrouter", "OpenRouter");
  setupCloudDiscovery("gemini", "Google Gemini");
  setupCloudDiscovery("groq", "Groq");
  setupCloudDiscovery("mistral", "Mistral AI");

  function setupCloudDiscovery(pKey, providerDisplayName) {
    const p = providerUI[pKey];
    if (!p) return;

    p.fetchBtn.addEventListener("click", () => fetchCloudModels(pKey, providerDisplayName));
    p.refreshBtn?.addEventListener("click", () => fetchCloudModels(pKey, providerDisplayName));

    p.searchInput?.addEventListener("input", () => renderProviderModelsList(pKey));
    p.sortSelect?.addEventListener("change", () => renderProviderModelsList(pKey));

    p.testBtn?.addEventListener("click", () => testProviderModel(pKey, providerDisplayName));
  }

  function fetchCloudModels(pKey, providerDisplayName) {
    const p = providerUI[pKey];
    const key = p.keyInput.value.trim();
    if (p.keyError) p.keyError.style.display = "none";

    if (!key) {
      if (p.keyError) {
        p.keyError.textContent = `Please enter your ${providerDisplayName} API key.`;
        p.keyError.style.display = "block";
      }
      p.keyInput.focus();
      return;
    }

    p.fetchBtn.disabled = true;
    p.fetchBtn.textContent = "⚡ Fetching Models...";
    updateStatus("testing", "Testing...", `Discovering free models from ${providerDisplayName}...`);

    sendMessageSafe({
      type: "GET_PROVIDER_MODELS",
      provider: pKey,
      apiKey: key
    }, (res) => {
      p.fetchBtn.disabled = false;
      p.fetchBtn.textContent = "⚡ Fetch Models";

      if (res && res.success && Array.isArray(res.models)) {
        // STRICT FREE-ONLY + FOCUSREWIRE COMPATIBLE FILTER:
        p.models = res.models.filter(m => {
          const free = typeof isFreeModel === "function" ? isFreeModel(m, pKey) : (m.is_free || (m.prompt_price === 0 && m.completion_price === 0));
          const comp = typeof isFocusRewireCompatible === "function" ? isFocusRewireCompatible(m, pKey) : true;
          return free && comp;
        });

        if (p.models.length === 0) {
          if (p.keyError) {
            p.keyError.textContent = `No compatible $0 inference models found for ${providerDisplayName}.`;
            p.keyError.style.display = "block";
          }
          updateStatus("failed", "No compatible free models", `No compatible $0 free models available under ${providerDisplayName}.`);
          return;
        }

        // Cache free models (never caching the API key)
        if (p.cacheKey) {
          chrome.storage.local.set({
            [p.cacheKey]: {
              models: p.models,
              fetchedAt: Date.now()
            }
          });
        }

        renderProviderModels(pKey);
        updateStatus("connected", "Connected", `Discovered ${p.models.length} free model(s) from ${providerDisplayName}.`);

        // Reselect previously selected model if it exists in list
        const currentSavedId = currentConfig[pKey]?.model;
        if (currentSavedId) {
          const match = p.models.find(m => m.id === currentSavedId);
          if (match) selectProviderModel(pKey, match, false);
        }
      } else {
        const errObj = res?.error || {};
        const errMsg = errObj.message || res?.error || `Failed to fetch models from ${providerDisplayName}.`;

        if (errObj.code === "RATE_LIMITED" || errObj.code === "QUOTA_EXCEEDED" || errMsg.includes("429")) {
          showQuotaModal(providerDisplayName, "", errMsg, errObj.retryAfter);
        } else if (p.keyError) {
          p.keyError.textContent = errMsg;
          p.keyError.style.display = "block";
        }
        updateStatus("failed", "Connection failed", errMsg);
      }
      updateSaveButtonState();
    });
  }

  function renderProviderModels(pKey) {
    const p = providerUI[pKey];
    if (p.emptyNotice) p.emptyNotice.style.display = "none";
    if (p.loadedContainer) p.loadedContainer.style.display = "block";
    renderProviderModelsList(pKey);
  }

  function renderProviderModelsList(pKey) {
    const p = providerUI[pKey];
    const query = (p.searchInput?.value || "").toLowerCase().trim();
    const sortBy = p.sortSelect?.value || "name";

    // Strictly Free Models Only
    let filtered = p.models.filter(m => {
      if (!m.is_free && (m.prompt_price !== 0 || m.completion_price !== 0)) return false;
      if (query) {
        const matchName = (m.name || "").toLowerCase().includes(query);
        const matchId = (m.id || "").toLowerCase().includes(query);
        const matchDev = (m.developer || "").toLowerCase().includes(query);
        if (!matchName && !matchId && !matchDev) return false;
      }
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === "name") {
        return (a.name || a.id).localeCompare(b.name || b.id);
      }
      if (sortBy === "context") {
        return (b.context_length || 0) - (a.context_length || 0);
      }
      return 0;
    });

    if (p.modelsCount) {
      p.modelsCount.textContent = `Showing ${filtered.length} of ${p.models.length} free models`;
    }

    p.listContainer.innerHTML = "";

    if (filtered.length === 0) {
      p.listContainer.innerHTML = `
        <div class="models-empty-state" style="padding: 20px;">
          <div>No free models match your search.</div>
        </div>
      `;
      return;
    }

    // Render batch
    const renderBatch = filtered.slice(0, 100);
    const selectedId = p.selectedModel?.id || "";

    renderBatch.forEach(m => {
      const card = createModelCard(m, m.id === selectedId, (chosenModel) => {
        selectProviderModel(pKey, chosenModel, true);
      });
      p.listContainer.appendChild(card);
    });

    if (filtered.length > 100) {
      const notice = document.createElement("div");
      notice.className = "field-hint";
      notice.style.textAlign = "center";
      notice.style.padding = "8px";
      notice.textContent = "Showing top 100 free models. Use the search bar to filter further.";
      p.listContainer.appendChild(notice);
    }
  }

  function createModelCard(model, isSelected, onSelect) {
    const card = document.createElement("div");
    card.className = `model-card ${isSelected ? "selected" : ""}`;
    card.dataset.modelId = model.id;

    const contextFormatted = formatContext(model.context_length);
    const modalityFormatted = formatModality(model.modality);

    card.innerHTML = `
      <div class="model-card-header">
        <div class="model-title-wrap">
          <div class="model-title">${escapeHtml(model.name || model.id)}</div>
          <div class="model-id-text">${escapeHtml(model.id)}</div>
        </div>
        <span class="pricing-badge free">Free / $0</span>
      </div>

      <div class="model-meta-grid">
        <div class="meta-item">
          <span class="meta-lbl">Context</span>
          <span class="meta-val">${contextFormatted}</span>
        </div>
        <div class="meta-item">
          <span class="meta-lbl">Inference</span>
          <span class="meta-val" style="color: var(--green);">$0 (Free)</span>
        </div>
        <div class="meta-item">
          <span class="meta-lbl">Type</span>
          <span class="meta-val">${modalityFormatted}</span>
        </div>
      </div>

      <div class="model-card-footer">
        <div class="model-desc-snippet" title="${escapeHtml(model.description || '')}">
          ${escapeHtml(model.description || 'Free inference model ($0 cost)')}
        </div>
        <button type="button" class="btn-select-model ${isSelected ? "active" : ""}">
          ${isSelected ? "✓ Selected" : "Select"}
        </button>
      </div>
    `;

    const selectBtn = card.querySelector(".btn-select-model");
    selectBtn.addEventListener("click", () => onSelect(model));

    return card;
  }

  function selectProviderModel(pKey, model, isUserAction) {
    const p = providerUI[pKey];
    p.selectedModel = model;

    // Update active class on card elements in list
    const cards = p.listContainer.querySelectorAll(".model-card");
    cards.forEach(c => {
      const match = c.dataset.modelId === model.id;
      c.classList.toggle("selected", match);
      const btn = c.querySelector(".btn-select-model");
      if (btn) {
        btn.classList.toggle("active", match);
        btn.textContent = match ? "✓ Selected" : "Select";
      }
    });

    // Update Selected Model Banner
    if (p.selectedBanner) {
      p.selectedBanner.style.display = "flex";
      if (p.selectedTitle) p.selectedTitle.textContent = model.name || model.id;
      if (p.selectedId) p.selectedId.textContent = model.id;
    }

    if (isUserAction) {
      p.isTested = false;
      updateStatus("not-tested", "Not tested", `Selected "${model.name || model.id}". Click "Test Selected Model" to verify.`);
    }

    updateSaveButtonState();
  }

  // ── 5. TEST SELECTED MODEL ─────────────────────────────────────────────────
  function testProviderModel(pKey, providerDisplayName) {
    const p = providerUI[pKey];
    const key = p.keyInput.value.trim();
    const model = p.selectedModel?.id || "";

    if (!key || !model) {
      updateStatus("not-configured", "Not configured", "Please select a model and enter an API key.");
      return;
    }

    p.testBtn.disabled = true;
    p.testBtn.textContent = "⚡ Testing...";
    updateStatus("testing", "Testing...", `Testing request with free model "${model}"...`);

    const testConfig = {
      provider: pKey,
      [pKey]: {
        apiKey: key,
        model: model
      }
    };

    sendMessageSafe({ type: "TEST_AI_CONNECTION", config: testConfig }, (res) => {
      p.testBtn.disabled = false;
      p.testBtn.textContent = "⚡ Test Selected Model";

      if (res && res.success) {
        p.isTested = true;
        updateStatus("connected", "Connected", res.message || `Free model "${model}" is verified ($0 cost).`);
      } else {
        p.isTested = false;
        const errObj = res?.error || {};
        const errMsg = errObj.message || res?.message || "Model test failed.";

        if (errObj.code === "RATE_LIMITED" || errObj.code === "QUOTA_EXCEEDED" || errMsg.includes("429")) {
          showQuotaModal(providerDisplayName, model, errMsg, errObj.retryAfter);
          updateStatus("failed", "Rate limit reached", errMsg);
        } else {
          updateStatus("failed", res?.status || "Connection failed", errMsg);
        }
      }
      updateSaveButtonState();
    });
  }

  // ── 6. OLLAMA LOCAL DETECTION & TESTING ─────────────────────────────────────
  const ollama = providerUI.ollama;
  ollama.detectBtn.addEventListener("click", () => detectOllamaModels());
  ollama.refreshBtn?.addEventListener("click", () => detectOllamaModels());
  ollama.searchInput?.addEventListener("input", () => renderOllamaModelsList());
  ollama.sortSelect?.addEventListener("change", () => renderOllamaModelsList());
  ollama.testBtn?.addEventListener("click", () => testOllamaModel());

  function detectOllamaModels() {
    const endpoint = ollama.endpointInput.value.trim() || "http://localhost:11434";
    ollama.detectBtn.disabled = true;
    ollama.detectBtn.textContent = "⚡ Detecting...";
    updateStatus("testing", "Testing...", `Connecting to Ollama at ${endpoint}...`);

    sendMessageSafe({
      type: "GET_PROVIDER_MODELS",
      provider: "ollama",
      endpoint: endpoint
    }, (res) => {
      ollama.detectBtn.disabled = false;
      ollama.detectBtn.textContent = "⚡ Detect Models";

      if (res && res.success && Array.isArray(res.models) && res.models.length > 0) {
        ollama.models = res.models;
        ollama.emptyNotice.style.display = "none";
        ollama.loadedContainer.style.display = "block";
        renderOllamaModelsList();

        updateStatus("connected", "Connected", `Found ${ollama.models.length} local Ollama model(s).`);

        const savedModelId = currentConfig.ollama?.model;
        if (savedModelId) {
          const match = ollama.models.find(m => m.id === savedModelId);
          if (match) selectProviderModel("ollama", match, false);
        }
      } else {
        const errMsg = res?.error?.message || res?.error || `Could not reach Ollama at ${endpoint}. Ensure Ollama is running.`;
        ollama.emptyNotice.style.display = "flex";
        ollama.loadedContainer.style.display = "none";
        updateStatus("failed", "Connection failed", errMsg);
      }
      updateSaveButtonState();
    });
  }

  function renderOllamaModelsList() {
    const query = (ollama.searchInput?.value || "").toLowerCase().trim();
    let filtered = ollama.models.filter(m => {
      if (query) {
        return (m.name || "").toLowerCase().includes(query) || (m.id || "").toLowerCase().includes(query);
      }
      return true;
    });

    ollama.modelsCount.textContent = `${filtered.length} local model(s) available`;
    ollama.listContainer.innerHTML = "";

    const selectedId = ollama.selectedModel?.id || "";

    filtered.forEach(m => {
      const card = createModelCard(m, m.id === selectedId, (chosenModel) => {
        selectProviderModel("ollama", chosenModel, true);
      });
      ollama.listContainer.appendChild(card);
    });
  }

  function testOllamaModel() {
    const endpoint = ollama.endpointInput.value.trim() || "http://localhost:11434";
    const model = ollama.selectedModel?.id || "";
    if (!model) return;

    ollama.testBtn.disabled = true;
    ollama.testBtn.textContent = "⚡ Testing...";
    updateStatus("testing", "Testing...", `Testing local model "${model}"...`);

    const testConfig = {
      provider: "ollama",
      ollama: { endpoint, model }
    };

    sendMessageSafe({ type: "TEST_AI_CONNECTION", config: testConfig }, (res) => {
      ollama.testBtn.disabled = false;
      ollama.testBtn.textContent = "⚡ Test Selected Model";

      if (res && res.success) {
        ollama.isTested = true;
        updateStatus("connected", "Connected", res.message || `Ollama model "${model}" is ready (local inference).`);
      } else {
        ollama.isTested = false;
        updateStatus("failed", "Model unavailable", res?.message || "Ollama model test failed.");
      }
      updateSaveButtonState();
    });
  }

  // ── 7. QUOTA / RATE LIMIT MODAL HANDLER ────────────────────────────────────
  function showQuotaModal(providerName, modelName, message, retryAfter) {
    quotaProviderName.textContent = providerName || "Current Provider";
    quotaModelName.textContent = modelName || "selected model";

    if (retryAfter || message) {
      quotaRetryInfo.style.display = "block";
      quotaRetryInfo.textContent = retryAfter ? `Try again after ${retryAfter}.` : message;
    } else {
      quotaRetryInfo.style.display = "none";
    }

    quotaModal.style.display = "flex";
  }

  function hideQuotaModal() {
    quotaModal.style.display = "none";
  }

  closeQuotaModalBtn?.addEventListener("click", hideQuotaModal);

  quotaChangeModelBtn?.addEventListener("click", () => {
    hideQuotaModal();
    // Focus search input or list of current provider
    const curr = providerSelect.value;
    const p = providerUI[curr];
    if (p?.searchInput) {
      p.searchInput.focus();
      p.searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  quotaChangeProviderBtn?.addEventListener("click", () => {
    hideQuotaModal();
    providerSelect.focus();
    providerSelect.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Close modal when clicking on dark backdrop
  quotaModal?.addEventListener("click", (e) => {
    if (e.target === quotaModal) hideQuotaModal();
  });

  // ── 8. SAVE CONFIGURATION ──────────────────────────────────────────────────
  saveConfigBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    const finalConfig = {
      provider,
      openrouter: {
        apiKey: providerUI.openrouter.keyInput.value.trim(),
        model: providerUI.openrouter.selectedModel?.id || ""
      },
      gemini: {
        apiKey: providerUI.gemini.keyInput.value.trim(),
        model: providerUI.gemini.selectedModel?.id || ""
      },
      groq: {
        apiKey: providerUI.groq.keyInput.value.trim(),
        model: providerUI.groq.selectedModel?.id || ""
      },
      mistral: {
        apiKey: providerUI.mistral.keyInput.value.trim(),
        model: providerUI.mistral.selectedModel?.id || ""
      },
      ollama: {
        endpoint: providerUI.ollama.endpointInput.value.trim() || "http://localhost:11434",
        model: providerUI.ollama.selectedModel?.id || ""
      }
    };

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = "Saving...";

    sendMessageSafe({ type: "SAVE_AI_CONFIG", config: finalConfig }, (res) => {
      saveConfigBtn.disabled = false;
      saveConfigBtn.textContent = "💾 Save Configuration";

      if (res && res.success) {
        currentConfig = res.config || finalConfig;
        showToast("Configuration saved successfully!");
      } else {
        showToast("Error saving configuration.");
      }
    });
  });

  // ── 9. NAVIGATION ──────────────────────────────────────────────────────────
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  });

  // ── 10. HELPERS ────────────────────────────────────────────────────────────
  function updateSaveButtonState() {
    const provider = providerSelect.value;
    if (provider === "offline") {
      saveConfigBtn.disabled = false;
      return;
    }

    const p = providerUI[provider];
    if (!p) {
      saveConfigBtn.disabled = true;
      return;
    }

    if (provider === "ollama") {
      const hasEndpoint = Boolean(p.endpointInput?.value.trim());
      const hasModel = Boolean(p.selectedModel?.id);
      saveConfigBtn.disabled = !(hasEndpoint && hasModel && p.isTested);
    } else {
      const hasKey = Boolean(p.keyInput?.value.trim());
      const hasModel = Boolean(p.selectedModel?.id);
      saveConfigBtn.disabled = !(hasKey && hasModel && p.isTested);
    }
  }

  function updateStatus(typeClass, label, message) {
    statusPill.className = `status-pill ${typeClass}`;
    statusLabel.textContent = label;
    statusMessage.textContent = message;
  }

  function sendMessageSafe(msg, callback) {
    let responded = false;
    function safeCallback(data) {
      if (responded) return;
      responded = true;
      callback(data);
    }

    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError || !response || response.success === false) {
          const err = chrome.runtime.lastError?.message || response?.error || "";
          // If port closed or worker sleeping, execute directly via AIService
          if (typeof AIService !== "undefined") {
            executeLocally(msg, safeCallback);
            return;
          }
          safeCallback(response || { success: false, error: err || "No response received" });
          return;
        }
        safeCallback(response);
      });
    } catch (err) {
      if (typeof AIService !== "undefined") {
        executeLocally(msg, safeCallback);
        return;
      }
      safeCallback({ success: false, error: err.message });
    }
  }

  function executeLocally(msg, callback) {
    if (typeof AIService === "undefined") {
      callback({ success: false, error: "Please reload the extension at chrome://extensions." });
      return;
    }

    if (msg.type === "GET_PROVIDER_MODELS" || msg.type === "GET_OPENROUTER_MODELS" || msg.type === "GET_OLLAMA_MODELS") {
      const provider = msg.provider || (msg.type === "GET_OLLAMA_MODELS" ? "ollama" : "openrouter");
      const cred = msg.credential || msg.apiKey || msg.endpoint;
      AIService.getModels(provider, cred)
        .then(models => callback({ success: true, models }))
        .catch(err => callback({
          success: false,
          error: {
            code: err.code || "UNKNOWN_ERROR",
            message: err.message || "Failed to fetch models",
            provider: err.provider || provider,
            model: err.model || "",
            retryAfter: err.retryAfter || null
          }
        }));
    } else if (msg.type === "TEST_AI_CONNECTION") {
      AIService.testConnection(msg.config)
        .then(res => callback(res))
        .catch(err => callback({
          success: false,
          status: "Connection failed",
          message: err.message || "Test failed"
        }));
    } else if (msg.type === "GET_AI_CONFIG") {
      AIService.getConfig()
        .then(config => callback({ success: true, config }))
        .catch(err => callback({ success: false, error: err.message }));
    } else if (msg.type === "SAVE_AI_CONFIG") {
      AIService.saveConfig(msg.config)
        .then(config => callback({ success: true, config }))
        .catch(err => callback({ success: false, error: err.message }));
    } else {
      callback({ success: false, error: "Unknown action" });
    }
  }

  function formatContext(tokens) {
    if (!tokens || tokens <= 0) return "General";
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
    return `${tokens}`;
  }

  function formatModality(mod) {
    if (!mod) return "Text";
    if (mod.includes("image") || mod.includes("video") || mod.includes("audio") || mod.includes("multimodal")) {
      return "Multimodal";
    }
    return "Text";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let toastTimeout = null;
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add("visible");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove("visible");
    }, 3000);
  }
});
