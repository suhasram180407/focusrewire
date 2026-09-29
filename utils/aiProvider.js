// utils/aiProvider.js
// FocusRewire — Centralized FREE-ONLY AI Provider Architecture
// Supported Providers: OpenRouter (Free), Google Gemini (Free Tier), Groq (Free Plan), Mistral (Free Mode), Ollama (Local), Offline / Built-in

const AIProviderType = {
  OPENROUTER: "openrouter",
  GEMINI: "gemini",
  GROQ: "groq",
  MISTRAL: "mistral",
  OLLAMA: "ollama",
  OFFLINE: "offline"
};

const DEFAULT_AI_CONFIG = {
  provider: AIProviderType.OFFLINE,
  openrouter: { apiKey: "", model: "" },
  gemini: { apiKey: "", model: "" },
  groq: { apiKey: "", model: "" },
  mistral: { apiKey: "", model: "" },
  ollama: { endpoint: "http://localhost:11434", model: "" }
};

// ── FREE & COMPATIBILITY FILTERING ──────────────────────────────────────────

function isFreeModel(model, provider) {
  if (!model) return false;

  const prov = String(provider || "").toLowerCase();
  if (prov === "offline" || prov === AIProviderType.OFFLINE) return true;
  if (prov === "ollama" || prov === AIProviderType.OLLAMA) return true;

  if (prov === "openrouter" || prov === AIProviderType.OPENROUTER) {
    if (model.id === "openrouter/free") return true;
    const p = model.pricing || {};
    const promptPrice = p.prompt !== undefined && p.prompt !== null ? parseFloat(p.prompt) : null;
    const compPrice = p.completion !== undefined && p.completion !== null ? parseFloat(p.completion) : null;
    return (promptPrice === 0 && compPrice === 0);
  }

  if (prov === "gemini" || prov === AIProviderType.GEMINI) {
    // All Gemini free tier models under generateContent API
    return true;
  }

  if (prov === "groq" || prov === AIProviderType.GROQ) {
    // Groq free tier models under free developer plan
    return true;
  }

  if (prov === "mistral" || prov === AIProviderType.MISTRAL) {
    // Mistral Free Mode endpoints
    return true;
  }

  return Boolean(model.is_free);
}

function isFocusRewireCompatible(model, provider) {
  if (!model) return false;

  const id = String(model.id || model.name || "").toLowerCase();
  const name = String(model.name || model.displayName || "").toLowerCase();
  const desc = String(model.description || "").toLowerCase();
  const combined = `${id} ${name} ${desc}`;

  // 1. Modality check if architecture details are present (e.g. OpenRouter)
  if (model.architecture?.modality) {
    const mod = String(model.architecture.modality).toLowerCase();
    const parts = mod.split("->");
    if (parts.length === 2) {
      const outputMod = parts[1];
      // Output MUST NOT be audio, image, or video generation
      if (outputMod.includes("audio") || outputMod.includes("image") || outputMod.includes("video")) {
        return false;
      }
      // Output must produce text
      if (!outputMod.includes("text")) {
        return false;
      }
    }
  }
  if (Array.isArray(model.architecture?.output_modalities)) {
    const outs = model.architecture.output_modalities.map(m => String(m).toLowerCase());
    if (outs.includes("audio") || outs.includes("image") || outs.includes("video")) {
      return false;
    }
    if (!outs.includes("text")) {
      return false;
    }
  }


  // 2. Embedding-only models
  if (
    /\b(embed|embedding|embeddings)\b/i.test(combined) ||
    id.includes("bge-") || id.includes("e5-") || id.includes("gte-") ||
    id.includes("minilm") || id.includes("instructor") ||
    id.includes("nomic-embed") || id.includes("mxbai-embed") ||
    id.includes("text-embedding")
  ) {
    return false;
  }

  // 3. Reranker-only models
  if (
    /\b(rerank|reranker|colbert)\b/i.test(combined) ||
    id.includes("bge-reranker") || id.includes("cohere-rerank")
  ) {
    return false;
  }

  // 4. Speech / Audio-only models (TTS, Whisper, Transcription)
  if (
    /\b(whisper|tts|speech|audio|voice|transcribe|bark|seamless|audiolm)\b/i.test(combined) ||
    id.includes("whisper-") || id.includes("distil-whisper")
  ) {
    return false;
  }

  // 5. Image / Video generation-only models
  if (
    /\b(diffusion|flux|dall-e|midjourney|stable-diffusion|sdxl|imagen|videogen|cogvideo|animatediff|sd-)\b/i.test(combined)
  ) {
    return false;
  }

  // 6. Moderation / Guard-only models
  if (
    /\b(llamaguard|shieldgemma|moderation|guard-3|guard-2|safety)\b/i.test(combined) ||
    id.includes("guard") || id.includes("moderation")
  ) {
    return false;
  }

  // 7. Vision-only models without text generation (depth, segmentation, YOLO)
  if (
    /\b(sam-|segment-anything|depth-anything|yolo)\b/i.test(combined)
  ) {
    return false;
  }

  // 8. Provider-specific method checks
  const prov = String(provider || "").toLowerCase();
  if (prov === "gemini" || prov === AIProviderType.GEMINI) {
    if (Array.isArray(model.supportedGenerationMethods)) {
      if (!model.supportedGenerationMethods.includes("generateContent")) {
        return false;
      }
    }
    if (id.includes("aqa") || id.includes("embedding")) {
      return false;
    }
  }

  // Small instruction models (1B, 2B, 3B, etc.) are fully accepted and preserved.
  return true;
}

// ── ERROR NORMALIZATION ──────────────────────────────────────────────────────

function createAIError(code, provider, model, message, retryAfter = null) {
  const err = new Error(message || "AI operation failed");
  err.name = "AIError";
  err.code = code; // "RATE_LIMITED", "QUOTA_EXCEEDED", "INVALID_API_KEY", "MODEL_NOT_FOUND", "PROVIDER_UNAVAILABLE"
  err.provider = provider;
  err.model = model || "";
  err.retryAfter = retryAfter;
  return err;
}

// ── 1. FALLBACK PROVIDER (BUILT-IN / OFFLINE) ────────────────────────────────

const FallbackProvider = {
  type: AIProviderType.OFFLINE,
  name: "Offline / Built-in",

  generateKeywords(topic) {
    const t = (topic || "").toLowerCase().trim();
    const words = t.split(/\s+/).filter(Boolean);

    const positive_keywords = [
      t,
      ...words,
      `${t} tutorial`,
      `${t} course`,
      `${t} for beginners`,
      `${t} beginner`,
      `${t} advanced`,
      `${t} explained`,
      `learn ${t}`,
      `${t} guide`,
      `${t} tips`,
      `${t} examples`,
      `${t} project`,
      `${t} projects`,
      `${t} crash course`,
      `${t} full course`,
      `${t} programming`,
      `${t} coding`,
      `${t} introduction`,
      `intro to ${t}`,
      `${t} in hindi`,
      `${t} in english`,
      `${t} 2025`,
      `${t} 2026`,
      `${t} basics`,
      `${t} fundamentals`,
      `${t} complete`,
      `${t} how to`,
      `how to use ${t}`,
      `${t} for students`,
      `${t} roadmap`
    ];

    const negative_keywords = [
      "funny", "prank", "vlog", "challenge", "reaction", "drama",
      "gaming", "minecraft", "fortnite", "roblox", "among us",
      "meme", "shorts", "tiktok", "music video", "song", "trailer",
      "movie", "celebrity", "gossip", "roast", "compilation",
      "unboxing", "review phone", "sneakers", "food", "travel vlog",
      "dance", "comedy", "fails", "satisfying", "asmr"
    ];

    const subtopics = [
      `${t} basics`,
      `${t} advanced`,
      `${t} projects`,
      `${t} interview`,
      `${t} tips`
    ];

    return {
      topic,
      positive_keywords,
      negative_keywords,
      subtopics,
      threshold: 0.0,
      generated_at: Date.now(),
      isFallback: true,
      provider: "offline"
    };
  },

  classifySearch(query, topic) {
    if (!query || !topic) return { related: true };
    const q = query.toLowerCase().trim();
    const t = topic.toLowerCase().trim();
    const topicWords = t.split(/\s+/).filter(w => w.length > 2);

    if (q.includes(t)) return { related: true };
    for (const w of topicWords) {
      if (q.includes(w)) return { related: true };
    }

    return { related: true, fallback: true };
  },

  async testConnection() {
    return {
      success: true,
      status: "Ready",
      message: "Built-in rule-based engine is ready ($0 cost, no network required)."
    };
  }
};

// ── 2. OPENROUTER PROVIDER (FREE MODELS ONLY) ────────────────────────────────

const OpenRouterProvider = {
  type: AIProviderType.OPENROUTER,
  name: "OpenRouter",

  async getModels(apiKey) {
    const key = (apiKey || "").trim();
    if (!key) {
      throw createAIError("INVALID_API_KEY", this.name, "", "Please enter your OpenRouter API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${key}`,
          "HTTP-Referer": "https://focusrewire.extension",
          "X-Title": "FocusRewire"
        },
        signal: controller.signal
      });

      if (res.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, "", "Invalid API key (HTTP 401 Unauthorized).");
      }
      if (res.status === 429) {
        throw createAIError("RATE_LIMITED", this.name, "", "OpenRouter rate limit reached (HTTP 429).");
      }
      if (!res.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, "", `OpenRouter returned HTTP ${res.status}.`);
      }

      const json = await res.json();
      const rawList = Array.isArray(json.data) ? json.data : [];

      // STRICT FREE-ONLY + FOCUSREWIRE COMPATIBLE FILTER:
      // Only keep models that are $0 free and capable of FocusRewire text generation tasks
      const eligibleModels = rawList.filter(m => {
        return isFreeModel(m, AIProviderType.OPENROUTER) && isFocusRewireCompatible(m, AIProviderType.OPENROUTER);
      }).map(m => {
        const dev = (m.id || "").split("/")[0] || "OpenRouter";
        return {
          id: m.id,
          name: m.name || m.id,
          developer: dev,
          description: m.description || "Free inference model",
          context_length: m.context_length || 0,
          is_free: true,
          prompt_price: 0,
          completion_price: 0,
          modality: m.architecture?.modality || "text->text"
        };
      });

      return eligibleModels;
    } catch (e) {
      if (e.name === "AbortError") {
        throw createAIError("NETWORK_ERROR", this.name, "", "Connection timed out reaching OpenRouter.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async generateKeywords(topic, config) {
    const apiKey = (config?.openrouter?.apiKey || "").trim();
    const model = (config?.openrouter?.model || "").trim();
    if (!apiKey) throw createAIError("INVALID_API_KEY", this.name, model, "OpenRouter API key is missing.");
    if (!model) throw createAIError("MODEL_NOT_FOUND", this.name, "", "No free OpenRouter model selected.");

    const prompt = buildKeywordPrompt(topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://focusrewire.extension",
          "X-Title": "FocusRewire"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 800
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        throw createAIError("RATE_LIMITED", this.name, model, "OpenRouter free rate limit reached.");
      }
      if (response.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, model, "Invalid OpenRouter API key.");
      }
      if (response.status === 404) {
        throw createAIError("MODEL_NOT_FOUND", this.name, model, `Model "${model}" unavailable or expired.`);
      }
      if (!response.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, model, `OpenRouter HTTP ${response.status}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = parseCleanJson(raw);

      return formatProfile(topic, parsed, "openrouter", model);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async classifySearch(query, topic, config) {
    const apiKey = (config?.openrouter?.apiKey || "").trim();
    const model = (config?.openrouter?.model || "").trim();
    if (!apiKey || !model) return FallbackProvider.classifySearch(query, topic);

    const prompt = buildSearchPrompt(query, topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://focusrewire.extension",
          "X-Title": "FocusRewire"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        }),
        signal: controller.signal
      });

      if (!response.ok) return FallbackProvider.classifySearch(query, topic);
      const data = await response.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
      return { related: answer.includes("YES") };
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async testConnection(config) {
    const apiKey = (config?.openrouter?.apiKey || "").trim();
    const model = (config?.openrouter?.model || "").trim();
    if (!apiKey) return { success: false, status: "Not configured", message: "API key is missing." };
    if (!model) return { success: false, status: "Not configured", message: "Please select a free model to test." };

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://focusrewire.extension",
          "X-Title": "FocusRewire"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5
        })
      });

      if (response.status === 401) {
        return { success: false, status: "Connection failed", message: "Invalid API key (HTTP 401)." };
      }
      if (response.status === 429) {
        return { success: false, status: "Rate limit reached", message: "Free rate limit exceeded (HTTP 429)." };
      }
      if (response.status === 404) {
        return { success: false, status: "Model unavailable", message: `Model "${model}" not found (HTTP 404).` };
      }
      if (!response.ok) {
        return { success: false, status: "Connection failed", message: `OpenRouter returned HTTP ${response.status}.` };
      }

      return { success: true, status: "Connected", message: `Free model "${model}" is verified ($0 cost).` };
    } catch (e) {
      return { success: false, status: "Connection failed", message: e.message || "Network error reaching OpenRouter." };
    }
  }
};

// ── 3. GOOGLE GEMINI PROVIDER (FREE TIER) ───────────────────────────────────

const GeminiProvider = {
  type: AIProviderType.GEMINI,
  name: "Google Gemini",

  async getModels(apiKey) {
    const key = (apiKey || "").trim();
    if (!key) {
      throw createAIError("INVALID_API_KEY", this.name, "", "Please enter your Google Gemini API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        method: "GET",
        signal: controller.signal
      });

      if (res.status === 400 || res.status === 403) {
        throw createAIError("INVALID_API_KEY", this.name, "", "Invalid Gemini API key or unauthorized.");
      }
      if (res.status === 429) {
        throw createAIError("QUOTA_EXCEEDED", this.name, "", "Gemini free-tier quota/rate limit exceeded (HTTP 429).");
      }
      if (!res.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, "", `Gemini returned HTTP ${res.status}.`);
      }

      const json = await res.json();
      const rawList = Array.isArray(json.models) ? json.models : [];

      // STRICT FREE-ONLY + FOCUSREWIRE COMPATIBLE FILTER:
      const eligibleModels = rawList.filter(m => {
        return isFreeModel(m, AIProviderType.GEMINI) && isFocusRewireCompatible(m, AIProviderType.GEMINI);
      }).map(m => {
        const id = (m.name || "").replace("models/", "");
        return {
          id: id,
          name: m.displayName || id,
          developer: "Google",
          description: m.description || "Gemini Free Tier Model",
          context_length: m.inputTokenLimit || 128000,
          is_free: true,
          prompt_price: 0,
          completion_price: 0,
          modality: "text->text"
        };
      });

      return eligibleModels;
    } catch (e) {
      if (e.name === "AbortError") {
        throw createAIError("NETWORK_ERROR", this.name, "", "Connection timed out reaching Google Gemini.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async generateKeywords(topic, config) {
    const apiKey = (config?.gemini?.apiKey || "").trim();
    const model = (config?.gemini?.model || "gemini-1.5-flash").trim();
    if (!apiKey) throw createAIError("INVALID_API_KEY", this.name, model, "Gemini API key is missing.");

    const prompt = buildKeywordPrompt(topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        }),
        signal: controller.signal
      });

      if (res.status === 429) {
        throw createAIError("QUOTA_EXCEEDED", this.name, model, "Gemini free rate limit reached (requests or tokens per minute).");
      }
      if (res.status === 400 || res.status === 403) {
        throw createAIError("INVALID_API_KEY", this.name, model, "Invalid Gemini API key.");
      }
      if (!res.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, model, `Gemini HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseCleanJson(text);

      return formatProfile(topic, parsed, "gemini", model);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async classifySearch(query, topic, config) {
    const apiKey = (config?.gemini?.apiKey || "").trim();
    const model = (config?.gemini?.model || "gemini-1.5-flash").trim();
    if (!apiKey) return FallbackProvider.classifySearch(query, topic);

    const prompt = buildSearchPrompt(query, topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 }
        }),
        signal: controller.signal
      });

      if (!res.ok) return FallbackProvider.classifySearch(query, topic);
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toUpperCase();
      return { related: text.includes("YES") };
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async testConnection(config) {
    const apiKey = (config?.gemini?.apiKey || "").trim();
    const model = (config?.gemini?.model || "").trim();
    if (!apiKey) return { success: false, status: "Not configured", message: "API key is missing." };
    if (!model) return { success: false, status: "Not configured", message: "Please select a Gemini model to test." };

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hi" }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (res.status === 400 || res.status === 403) {
        return { success: false, status: "Connection failed", message: "Invalid API key (HTTP 400/403)." };
      }
      if (res.status === 429) {
        return { success: false, status: "Rate limit reached", message: "Gemini free rate limit exceeded (HTTP 429)." };
      }
      if (!res.ok) {
        return { success: false, status: "Connection failed", message: `Gemini returned HTTP ${res.status}.` };
      }

      return { success: true, status: "Connected", message: `Gemini Free model "${model}" verified and ready.` };
    } catch (e) {
      return { success: false, status: "Connection failed", message: e.message || "Network error reaching Gemini." };
    }
  }
};

// ── 4. GROQ PROVIDER (FREE PLAN) ─────────────────────────────────────────────

const GroqProvider = {
  type: AIProviderType.GROQ,
  name: "Groq",

  async getModels(apiKey) {
    const key = (apiKey || "").trim();
    if (!key) {
      throw createAIError("INVALID_API_KEY", this.name, "", "Please enter your Groq API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: { "Authorization": `Bearer ${key}` },
        signal: controller.signal
      });

      if (res.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, "", "Invalid Groq API key (HTTP 401).");
      }
      if (res.status === 429) {
        throw createAIError("RATE_LIMITED", this.name, "", "Groq free-plan rate limit exceeded (HTTP 429).");
      }
      if (!res.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, "", `Groq returned HTTP ${res.status}.`);
      }

      const json = await res.json();
      const rawList = Array.isArray(json.data) ? json.data : [];

      // STRICT FREE-ONLY + FOCUSREWIRE COMPATIBLE FILTER:
      const eligibleModels = rawList.filter(m => {
        return isFreeModel(m, AIProviderType.GROQ) && isFocusRewireCompatible(m, AIProviderType.GROQ);
      }).map(m => {
        return {
          id: m.id,
          name: m.id,
          developer: m.owned_by || "Groq",
          description: "Groq Free Plan Model ($0 inference)",
          context_length: m.context_window || 8192,
          is_free: true,
          prompt_price: 0,
          completion_price: 0,
          modality: "text->text"
        };
      });

      return eligibleModels;
    } catch (e) {
      if (e.name === "AbortError") {
        throw createAIError("NETWORK_ERROR", this.name, "", "Connection timed out reaching Groq.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async generateKeywords(topic, config) {
    const apiKey = (config?.groq?.apiKey || "").trim();
    const model = (config?.groq?.model || "llama-3.3-70b-versatile").trim();
    if (!apiKey) throw createAIError("INVALID_API_KEY", this.name, model, "Groq API key is missing.");

    const prompt = buildKeywordPrompt(topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        throw createAIError("RATE_LIMITED", this.name, model, "Groq Free Plan limit reached (requests or tokens per minute).");
      }
      if (response.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, model, "Invalid Groq API key.");
      }
      if (!response.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, model, `Groq HTTP ${response.status}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = parseCleanJson(raw);

      return formatProfile(topic, parsed, "groq", model);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async classifySearch(query, topic, config) {
    const apiKey = (config?.groq?.apiKey || "").trim();
    const model = (config?.groq?.model || "llama-3.3-70b-versatile").trim();
    if (!apiKey) return FallbackProvider.classifySearch(query, topic);

    const prompt = buildSearchPrompt(query, topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        }),
        signal: controller.signal
      });

      if (!response.ok) return FallbackProvider.classifySearch(query, topic);
      const data = await response.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
      return { related: answer.includes("YES") };
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async testConnection(config) {
    const apiKey = (config?.groq?.apiKey || "").trim();
    const model = (config?.groq?.model || "").trim();
    if (!apiKey) return { success: false, status: "Not configured", message: "API key is missing." };
    if (!model) return { success: false, status: "Not configured", message: "Please select a Groq model to test." };

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5
        })
      });

      if (res.status === 401) {
        return { success: false, status: "Connection failed", message: "Invalid API key (HTTP 401)." };
      }
      if (res.status === 429) {
        return { success: false, status: "Rate limit reached", message: "Groq free-plan rate limit reached (HTTP 429)." };
      }
      if (!res.ok) {
        return { success: false, status: "Connection failed", message: `Groq returned HTTP ${res.status}.` };
      }

      return { success: true, status: "Connected", message: `Groq Free model "${model}" verified and ready.` };
    } catch (e) {
      return { success: false, status: "Connection failed", message: e.message || "Network error reaching Groq." };
    }
  }
};

// ── 5. MISTRAL AI PROVIDER (FREE MODE) ───────────────────────────────────────

const MistralProvider = {
  type: AIProviderType.MISTRAL,
  name: "Mistral AI",

  async getModels(apiKey) {
    const key = (apiKey || "").trim();
    if (!key) {
      throw createAIError("INVALID_API_KEY", this.name, "", "Please enter your Mistral API key.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        method: "GET",
        headers: { "Authorization": `Bearer ${key}` },
        signal: controller.signal
      });

      if (res.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, "", "Invalid Mistral API key (HTTP 401).");
      }
      if (res.status === 429) {
        throw createAIError("RATE_LIMITED", this.name, "", "Mistral free usage limit reached (HTTP 429).");
      }
      if (!res.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, "", `Mistral returned HTTP ${res.status}.`);
      }

      const json = await res.json();
      const rawList = Array.isArray(json.data) ? json.data : [];

      // STRICT FREE-ONLY + FOCUSREWIRE COMPATIBLE FILTER:
      const eligibleModels = rawList.filter(m => {
        return isFreeModel(m, AIProviderType.MISTRAL) && isFocusRewireCompatible(m, AIProviderType.MISTRAL);
      }).map(m => {
        return {
          id: m.id,
          name: m.name || m.id,
          developer: "Mistral AI",
          description: "Mistral Free Mode Model ($0 inference)",
          context_length: m.max_context_length || 32000,
          is_free: true,
          prompt_price: 0,
          completion_price: 0,
          modality: "text->text"
        };
      });

      return eligibleModels;
    } catch (e) {
      if (e.name === "AbortError") {
        throw createAIError("NETWORK_ERROR", this.name, "", "Connection timed out reaching Mistral AI.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async generateKeywords(topic, config) {
    const apiKey = (config?.mistral?.apiKey || "").trim();
    const model = (config?.mistral?.model || "mistral-small-latest").trim();
    if (!apiKey) throw createAIError("INVALID_API_KEY", this.name, model, "Mistral API key is missing.");

    const prompt = buildKeywordPrompt(topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        throw createAIError("QUOTA_EXCEEDED", this.name, model, "Mistral free usage limit reached.");
      }
      if (response.status === 401) {
        throw createAIError("INVALID_API_KEY", this.name, model, "Invalid Mistral API key.");
      }
      if (!response.ok) {
        throw createAIError("PROVIDER_UNAVAILABLE", this.name, model, `Mistral HTTP ${response.status}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = parseCleanJson(raw);

      return formatProfile(topic, parsed, "mistral", model);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async classifySearch(query, topic, config) {
    const apiKey = (config?.mistral?.apiKey || "").trim();
    const model = (config?.mistral?.model || "mistral-small-latest").trim();
    if (!apiKey) return FallbackProvider.classifySearch(query, topic);

    const prompt = buildSearchPrompt(query, topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        }),
        signal: controller.signal
      });

      if (!response.ok) return FallbackProvider.classifySearch(query, topic);
      const data = await response.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
      return { related: answer.includes("YES") };
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async testConnection(config) {
    const apiKey = (config?.mistral?.apiKey || "").trim();
    const model = (config?.mistral?.model || "").trim();
    if (!apiKey) return { success: false, status: "Not configured", message: "API key is missing." };
    if (!model) return { success: false, status: "Not configured", message: "Please select a Mistral model to test." };

    try {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5
        })
      });

      if (res.status === 401) {
        return { success: false, status: "Connection failed", message: "Invalid API key (HTTP 401)." };
      }
      if (res.status === 429) {
        return { success: false, status: "Rate limit reached", message: "Mistral free usage limit reached (HTTP 429)." };
      }
      if (!res.ok) {
        return { success: false, status: "Connection failed", message: `Mistral returned HTTP ${res.status}.` };
      }

      return { success: true, status: "Connected", message: `Mistral Free model "${model}" verified and ready.` };
    } catch (e) {
      return { success: false, status: "Connection failed", message: e.message || "Network error reaching Mistral." };
    }
  }
};

// ── 6. OLLAMA PROVIDER (LOCAL / FREE) ────────────────────────────────────────

const OllamaProvider = {
  type: AIProviderType.OLLAMA,
  name: "Ollama",

  normalizeEndpoint(endpoint) {
    let ep = (endpoint || "http://localhost:11434").trim();
    if (!ep.startsWith("http://") && !ep.startsWith("https://")) {
      ep = "http://" + ep;
    }
    return ep.replace(/\/+$/, "");
  },

  async getModels(endpoint) {
    const base = this.normalizeEndpoint(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${base}/api/tags`, {
        method: "GET",
        signal: controller.signal
      });

      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      const raw = Array.isArray(data.models) ? data.models : [];

      const eligibleModels = raw.filter(m => {
        return isFreeModel(m, AIProviderType.OLLAMA) && isFocusRewireCompatible(m, AIProviderType.OLLAMA);
      }).map(m => {
        const name = m.name || m.model || "";
        return {
          id: name,
          name: name,
          developer: "Local Ollama",
          description: `Local model (${m.details?.parameter_size || "local size"}, ${m.details?.quantization_level || ""})`.trim(),
          context_length: 0,
          is_free: true,
          prompt_price: 0,
          completion_price: 0,
          modality: "text->text"
        };
      }).filter(m => m.id);

      return eligibleModels;
    } catch (e) {
      if (e.name === "AbortError") {
        throw createAIError("NETWORK_ERROR", this.name, "", "Connection timed out reaching local Ollama instance.");
      }
      throw createAIError("PROVIDER_UNAVAILABLE", this.name, "", `Cannot reach Ollama at ${base}. Ensure Ollama is running.`);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async generateKeywords(topic, config) {
    const endpoint = this.normalizeEndpoint(config?.ollama?.endpoint);
    const model = (config?.ollama?.model || "llama3.2").trim();
    const prompt = buildKeywordPrompt(topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      let rawText = "";
      const chatRes = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
          options: { temperature: 0.2 }
        }),
        signal: controller.signal
      });

      if (chatRes.ok) {
        const data = await chatRes.json();
        rawText = data.message?.content || "";
      } else {
        const genRes = await fetch(`${endpoint}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            format: "json",
            options: { temperature: 0.2 }
          }),
          signal: controller.signal
        });
        if (!genRes.ok) throw new Error(`Ollama HTTP ${genRes.status}`);
        const data = await genRes.json();
        rawText = data.response || "";
      }

      const parsed = parseCleanJson(rawText);
      return formatProfile(topic, parsed, "ollama", model);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async classifySearch(query, topic, config) {
    const endpoint = this.normalizeEndpoint(config?.ollama?.endpoint);
    const model = (config?.ollama?.model || "llama3.2").trim();
    const prompt = buildSearchPrompt(query, topic);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: 0.1 }
        }),
        signal: controller.signal
      });

      if (!res.ok) return FallbackProvider.classifySearch(query, topic);
      const data = await res.json();
      const text = (data.message?.content || "").trim().toUpperCase();
      return { related: text.includes("YES") };
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async testConnection(config) {
    const endpoint = this.normalizeEndpoint(config?.ollama?.endpoint);
    const model = (config?.ollama?.model || "").trim();
    if (!model) return { success: false, status: "Not configured", message: "Please select an installed Ollama model." };

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          stream: false
        })
      });

      if (res.ok) {
        return { success: true, status: "Connected", message: `Ollama model "${model}" is ready (local inference).` };
      }

      return { success: false, status: "Model unavailable", message: `Ollama model "${model}" failed to respond.` };
    } catch (e) {
      return { success: false, status: "Connection failed", message: `Cannot reach Ollama at ${endpoint}.` };
    }
  }
};

// ── 7. CENTRALIZED AI SERVICE (REGISTRY & DISPATCHER) ────────────────────────

const AIService = {
  providers: {
    [AIProviderType.OPENROUTER]: OpenRouterProvider,
    [AIProviderType.GEMINI]: GeminiProvider,
    [AIProviderType.GROQ]: GroqProvider,
    [AIProviderType.MISTRAL]: MistralProvider,
    [AIProviderType.OLLAMA]: OllamaProvider,
    [AIProviderType.OFFLINE]: FallbackProvider
  },

  getProvider(type) {
    return this.providers[type] || FallbackProvider;
  },

  async getConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get("aiConfig", data => {
        const stored = data.aiConfig || {};
        resolve({
          provider: stored.provider || DEFAULT_AI_CONFIG.provider,
          openrouter: {
            apiKey: stored.openrouter?.apiKey || "",
            model: stored.openrouter?.model || ""
          },
          gemini: {
            apiKey: stored.gemini?.apiKey || "",
            model: stored.gemini?.model || ""
          },
          groq: {
            apiKey: stored.groq?.apiKey || "",
            model: stored.groq?.model || ""
          },
          mistral: {
            apiKey: stored.mistral?.apiKey || "",
            model: stored.mistral?.model || ""
          },
          ollama: {
            endpoint: stored.ollama?.endpoint || DEFAULT_AI_CONFIG.ollama.endpoint,
            model: stored.ollama?.model || ""
          }
        });
      });
    });
  },

  async saveConfig(newConfig) {
    const current = await this.getConfig();
    const updated = {
      provider: newConfig.provider || current.provider,
      openrouter: {
        apiKey: newConfig.openrouter?.apiKey !== undefined ? newConfig.openrouter.apiKey : current.openrouter.apiKey,
        model: newConfig.openrouter?.model !== undefined ? newConfig.openrouter.model : current.openrouter.model
      },
      gemini: {
        apiKey: newConfig.gemini?.apiKey !== undefined ? newConfig.gemini.apiKey : current.gemini.apiKey,
        model: newConfig.gemini?.model !== undefined ? newConfig.gemini.model : current.gemini.model
      },
      groq: {
        apiKey: newConfig.groq?.apiKey !== undefined ? newConfig.groq.apiKey : current.groq.apiKey,
        model: newConfig.groq?.model !== undefined ? newConfig.groq.model : current.groq.model
      },
      mistral: {
        apiKey: newConfig.mistral?.apiKey !== undefined ? newConfig.mistral.apiKey : current.mistral.apiKey,
        model: newConfig.mistral?.model !== undefined ? newConfig.mistral.model : current.mistral.model
      },
      ollama: {
        endpoint: newConfig.ollama?.endpoint || current.ollama.endpoint,
        model: newConfig.ollama?.model !== undefined ? newConfig.ollama.model : current.ollama.model
      }
    };
    return new Promise(resolve => {
      chrome.storage.local.set({ aiConfig: updated }, () => resolve(updated));
    });
  },

  async getModels(providerType, credentialOrEndpoint) {
    const provider = this.getProvider(providerType);
    if (!provider || typeof provider.getModels !== "function") {
      return [];
    }
    return await provider.getModels(credentialOrEndpoint);
  },

  async getOpenRouterModels(apiKey) {
    return await this.getModels(AIProviderType.OPENROUTER, apiKey);
  },

  async getGeminiModels(apiKey) {
    return await this.getModels(AIProviderType.GEMINI, apiKey);
  },

  async getGroqModels(apiKey) {
    return await this.getModels(AIProviderType.GROQ, apiKey);
  },

  async getMistralModels(apiKey) {
    return await this.getModels(AIProviderType.MISTRAL, apiKey);
  },

  async getOllamaModels(endpoint) {
    return await this.getModels(AIProviderType.OLLAMA, endpoint);
  },

  async testConnection(config) {
    const targetConfig = config || await this.getConfig();
    const provider = this.getProvider(targetConfig.provider);
    return await provider.testConnection(targetConfig);
  },

  async generateKeywords(topic) {
    const config = await this.getConfig();
    const provider = this.getProvider(config.provider);

    if (provider.type === AIProviderType.OFFLINE) {
      const profile = FallbackProvider.generateKeywords(topic);
      return { success: true, profile, fallback: true };
    }

    try {
      const profile = await provider.generateKeywords(topic, config);
      return { success: true, profile, fallback: false };
    } catch (e) {
      // Return structured error so UI can display Quota / Limit popup if applicable
      return {
        success: false,
        error: {
          code: e.code || "UNKNOWN_ERROR",
          provider: provider.name,
          model: e.model || config[config.provider]?.model || "",
          message: e.message || "Keyword generation failed."
        },
        fallbackProfile: FallbackProvider.generateKeywords(topic)
      };
    }
  },

  async classifySearch(query, topic) {
    const config = await this.getConfig();
    const provider = this.getProvider(config.provider);

    try {
      return await provider.classifySearch(query, topic, config);
    } catch {
      return FallbackProvider.classifySearch(query, topic);
    }
  }
};

// ── HELPERS ──────────────────────────────────────────────────────────────────

function buildKeywordPrompt(topic) {
  return `You are a focus assistant. The user wants to study: "${topic}".

Return ONLY a valid JSON object with this exact structure and no other text:
{
  "positive_keywords": [list of exactly 30 relevant keywords and multi-word phrases about ${topic}],
  "negative_keywords": [list of exactly 20 keywords that represent unrelated distractions, entertainment, or off-topic content],
  "subtopics": [list of exactly 5 specific subtopics within ${topic}]
}

Rules:
- positive_keywords: highly specific to ${topic}, include terminology, tools, concepts, names
- negative_keywords: generic entertainment, gaming, music, vlogs, unrelated tech, news, etc.
- subtopics: specific subcategories the user might search within ${topic}
- Return RAW JSON only. No markdown. No backticks. No explanation.`;
}

function buildSearchPrompt(query, topic) {
  return `Is the search query "${query}" related to the topic "${topic}"? Answer only with YES or NO.`;
}

function parseCleanJson(text) {
  const cleaned = (text || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON between first { and last }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Invalid JSON structure returned by model.");
  }
}

function formatProfile(topic, parsed, provider, model) {
  return {
    topic,
    positive_keywords: Array.isArray(parsed.positive_keywords) ? parsed.positive_keywords : [],
    negative_keywords: Array.isArray(parsed.negative_keywords) ? parsed.negative_keywords : [],
    subtopics: Array.isArray(parsed.subtopics) ? parsed.subtopics : [],
    threshold: 0.0,
    strict_threshold: 0.05,
    generated_at: Date.now(),
    provider,
    model,
    isFree: true
  };
}

// ── GLOBAL EXPORTS ───────────────────────────────────────────────────────────

if (typeof self !== "undefined") {
  self.AIProviderType = AIProviderType;
  self.DEFAULT_AI_CONFIG = DEFAULT_AI_CONFIG;
  self.isFreeModel = isFreeModel;
  self.isFocusRewireCompatible = isFocusRewireCompatible;
  self.createAIError = createAIError;
  self.FallbackProvider = FallbackProvider;
  self.OpenRouterProvider = OpenRouterProvider;
  self.GeminiProvider = GeminiProvider;
  self.GroqProvider = GroqProvider;
  self.MistralProvider = MistralProvider;
  self.OllamaProvider = OllamaProvider;
  self.AIService = AIService;
}

if (typeof window !== "undefined") {
  window.AIProviderType = AIProviderType;
  window.DEFAULT_AI_CONFIG = DEFAULT_AI_CONFIG;
  window.isFreeModel = isFreeModel;
  window.isFocusRewireCompatible = isFocusRewireCompatible;
  window.createAIError = createAIError;
  window.FallbackProvider = FallbackProvider;
  window.OpenRouterProvider = OpenRouterProvider;
  window.GeminiProvider = GeminiProvider;
  window.GroqProvider = GroqProvider;
  window.MistralProvider = MistralProvider;
  window.OllamaProvider = OllamaProvider;
  window.AIService = AIService;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AIProviderType,
    DEFAULT_AI_CONFIG,
    isFreeModel,
    isFocusRewireCompatible,
    createAIError,
    FallbackProvider,
    OpenRouterProvider,
    GeminiProvider,
    GroqProvider,
    MistralProvider,
    OllamaProvider,
    AIService
  };
}

