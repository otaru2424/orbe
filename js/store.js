// Estado persistente de la mascota (se guarda en el celular).
const KEY = 'orbe.state.v1';

export const DEFAULT_MODEL = 'Qwen3.5-2B-q4f16_1-MLC';

function fresh() {
  const now = Date.now();
  return {
    v: 1,
    petName: '',
    userName: '',
    born: now,
    last: now,
    stats: { hunger: 80, energy: 85, fun: 75, clean: 90, love: 20 },
    sleeping: false,
    notes: [],
    bdays: [],
    history: [],
    settings: { model: DEFAULT_MODEL, voice: false, loc: null, sim: '' },
    wxCache: null,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    const base = fresh();
    return {
      ...base, ...s,
      stats: { ...base.stats, ...(s.stats || {}) },
      settings: { ...base.settings, ...(s.settings || {}) },
    };
  } catch {
    return fresh();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin espacio o modo privado */ }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

export const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
