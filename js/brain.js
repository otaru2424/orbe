// Cerebro propio: un modelo de IA pequeño que corre dentro del celular (WebLLM + WebGPU).
// No usa servidores ni cuentas: se descarga una vez y queda guardado en el teléfono.
const WL_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';

export const MODELS = [
  { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Liviano — rápido, más simple (~1,6 GB de memoria)' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Equilibrado — recomendado (~2,2 GB de memoria)' },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Inteligente — más lento (~3,9 GB de memoria)' },
];

let wl = null;
async function lib() {
  if (!wl) wl = await import(WL_URL);
  return wl;
}

const IDB_KEY = 'orbe.idb';
function useIdb() { try { return localStorage.getItem(IDB_KEY) === '1'; } catch { return false; } }
async function appCfg() {
  const { prebuiltAppConfig } = await lib();
  return { ...prebuiltAppConfig, useIndexedDBCache: useIdb() };
}

export const brain = {
  engine: null,
  modelId: null,
  status: 'off', // off | loading | ready | error | unsupported
  progress: 0,
  progressText: '',
  error: '',
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach((f) => f(this)); },

  async supported() {
    if (!('gpu' in navigator)) return { ok: false, f16: false };
    try {
      const a = await navigator.gpu.requestAdapter();
      if (!a) return { ok: false, f16: false };
      return { ok: true, f16: a.features.has('shader-f16') };
    } catch { return { ok: false, f16: false }; }
  },

  async resolveId(id) {
    const s = await this.supported();
    if (!s.ok) return null;
    return s.f16 ? id : id.replace('q4f16_1', 'q4f32_1');
  },

  async isCached(id) {
    try {
      const realId = await this.resolveId(id);
      if (!realId) return false;
      const { hasModelInCache } = await lib();
      return await hasModelInCache(realId, await appCfg());
    } catch { return false; }
  },

  async load(id) {
    if (this.status === 'loading') return;
    const realId = await this.resolveId(id);
    if (!realId) {
      this.status = 'unsupported';
      this.error = 'Este navegador no tiene WebGPU. Usa Chrome actualizado en tu celular.';
      this.emit();
      return;
    }
    this.status = 'loading'; this.progress = 0; this.progressText = 'Preparando…'; this.error = '';
    this.emit();
    let worker = null;
    try {
      try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
      const { CreateWebWorkerMLCEngine } = await lib();
      if (this.engine) { try { await this.engine.unload(); } catch { /* nada */ } this.engine = null; }
      this.worker?.terminate();
      worker = this.worker = new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' });
      this.engine = await CreateWebWorkerMLCEngine(worker, realId, {
        appConfig: await appCfg(),
        initProgressCallback: (r) => {
          this.progress = r.progress ?? 0;
          this.progressText = r.text || '';
          this.emit();
        },
      });
      this.modelId = realId;
      this.status = 'ready';
      this.progress = 1;
      this.emit();
      this.cleanupOthers(realId);
    } catch (e) {
      console.error(e);
      worker?.terminate(); this.worker = null; this.engine = null;
      // Si el almacenamiento normal falla, reintenta guardando el cerebro en IndexedDB.
      if (!useIdb() && /cache|quota/i.test(`${e?.name} ${e?.message} ${e}`)) {
        try { localStorage.setItem(IDB_KEY, '1'); } catch { /* nada */ }
        this.status = 'off';
        return this.load(id);
      }
      this.status = 'error';
      this.error = String(e?.message || e).slice(0, 200);
      this.emit();
    }
  },

  // Respuesta en streaming. onToken recibe el texto acumulado (limpio).
  async chat(messages, onToken) {
    if (this.status !== 'ready') throw new Error('cerebro no listo');
    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 140,
      extra_body: { enable_thinking: false },
    });
    let full = '';
    for await (const ch of stream) {
      full += ch.choices?.[0]?.delta?.content || '';
      onToken?.(clean(full));
    }
    return clean(full);
  },

  // Borra otros cerebros descargados para no ocupar espacio de más.
  async cleanupOthers(keepId) {
    try {
      const { deleteModelAllInfoInCache, hasModelInCache } = await lib();
      const cfg = await appCfg();
      for (const m of MODELS) {
        for (const id of [m.id, m.id.replace('q4f16_1', 'q4f32_1')]) {
          if (id !== keepId && await hasModelInCache(id, cfg)) await deleteModelAllInfoInCache(id, cfg);
        }
      }
    } catch (e) { console.warn('limpieza', e); }
  },

  // Borra todos los cerebros descargados de este navegador (libera espacio).
  async removeAll() {
    // Si se está cargando, espera a que termine para que no se vuelva a guardar.
    while (this.status === 'loading') await new Promise((r) => setTimeout(r, 300));
    // Cerrar el proceso de la IA directamente (más rápido y seguro que pedirle que se descargue).
    this.worker?.terminate();
    this.engine = null; this.worker = null; this.modelId = null;
    try {
      const { deleteModelAllInfoInCache } = await lib();
      const cfg = await appCfg();
      for (const m of MODELS) {
        for (const id of [m.id, m.id.replace('q4f16_1', 'q4f32_1')]) {
          try { await deleteModelAllInfoInCache(id, cfg); } catch { /* no estaba */ }
        }
      }
    } catch (e) { console.warn('borrar', e); }
    try { for (const k of await caches.keys()) if (k.startsWith('webllm')) await caches.delete(k); } catch { /* nada */ }
    this.status = 'off'; this.progress = 0; this.error = ''; this._greeted = false;
    this.emit();
  },

  async interrupt() { try { await this.engine?.interruptGenerate(); } catch { /* nada */ } },
};

function clean(s) {
  return s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');
}
