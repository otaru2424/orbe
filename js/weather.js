// Clima gratis con Open-Meteo (sin cuenta ni API key).
import { pick } from './store.js';

const CODES = {
  0: ['despejado', '☀️', 'clear'], 1: ['mayormente despejado', '🌤️', 'clear'],
  2: ['parcialmente nublado', '⛅', 'cloudy'], 3: ['nublado', '☁️', 'cloudy'],
  45: ['con neblina', '🌫️', 'fog'], 48: ['con neblina helada', '🌫️', 'fog'],
  51: ['con llovizna suave', '🌦️', 'rain'], 53: ['con llovizna', '🌦️', 'rain'], 55: ['con llovizna fuerte', '🌧️', 'rain'],
  56: ['con llovizna helada', '🌧️', 'rain'], 57: ['con llovizna helada', '🌧️', 'rain'],
  61: ['con lluvia débil', '🌧️', 'rain'], 63: ['con lluvia', '🌧️', 'rain'], 65: ['con lluvia fuerte', '🌧️', 'rain'],
  66: ['con lluvia helada', '🌧️', 'rain'], 67: ['con lluvia helada', '🌧️', 'rain'],
  71: ['con nieve débil', '🌨️', 'snow'], 73: ['nevando', '🌨️', 'snow'], 75: ['con nevazón', '❄️', 'snow'], 77: ['con granizo fino', '🌨️', 'snow'],
  80: ['con chubascos', '🌦️', 'rain'], 81: ['con chubascos', '🌧️', 'rain'], 82: ['con chubascos fuertes', '⛈️', 'rain'],
  85: ['con chubascos de nieve', '🌨️', 'snow'], 86: ['con chubascos de nieve', '❄️', 'snow'],
  95: ['con tormenta', '⛈️', 'storm'], 96: ['con tormenta y granizo', '⛈️', 'storm'], 99: ['con tormenta y granizo', '⛈️', 'storm'],
};

export function describe(code, isDay = 1) {
  const c = CODES[code] || ['variable', '🌡️', 'cloudy'];
  let icon = c[1];
  if (!isDay && c[2] === 'clear') icon = '🌙';
  return { text: c[0], icon, kind: c[2] };
}

export function season(date = new Date(), lat = -33) {
  const m = date.getMonth(); // 0..11
  const north = ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otono', 'otono', 'otono', 'invierno'];
  const south = { invierno: 'verano', verano: 'invierno', primavera: 'otono', otono: 'primavera' };
  const s = north[m];
  return lat < 0 ? south[s] : s;
}

export const SEASON_NAME = { verano: 'verano', otono: 'otoño', invierno: 'invierno', primavera: 'primavera' };

export async function fetchWeather(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code'
    + '&timezone=auto&forecast_days=2';
  const r = await fetch(url);
  if (!r.ok) throw new Error('clima ' + r.status);
  const j = await r.json();
  const c = j.current, d = j.daily;
  return {
    ts: Date.now(), lat, lon,
    temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, isDay: c.is_day,
    wind: c.wind_speed_10m, hum: c.relative_humidity_2m,
    tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0],
    rainProb: d.precipitation_probability_max?.[0] ?? null, uv: d.uv_index_max?.[0] ?? null,
    tomorrow: { tmax: d.temperature_2m_max[1], tmin: d.temperature_2m_min[1], code: d.weather_code[1], rainProb: d.precipitation_probability_max?.[1] ?? null },
  };
}

export async function placeName(lat, lon) {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`);
    const j = await r.json();
    return j.city || j.locality || j.principalSubdivision || '';
  } catch { return ''; }
}

export async function searchCity(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es`);
  const j = await r.json();
  const g = j.results?.[0];
  if (!g) return null;
  return { lat: g.latitude, lon: g.longitude, name: g.name };
}

export function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('sin GPS'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 });
  });
}

// Climas de prueba para ver todos los looks.
export function simulated(kind, lat = -33) {
  const base = { ts: Date.now(), isDay: 1, wind: 8, hum: 60, uv: 3, rainProb: 10, place: 'Simulación', sim: true };
  const S = {
    frio: { temp: 2, feels: -1, code: 3, tmax: 7, tmin: -1 },
    calor: { temp: 34, feels: 36, code: 0, tmax: 36, tmin: 20, uv: 10 },
    lluvia: { temp: 13, feels: 12, code: 63, tmax: 15, tmin: 9, rainProb: 90 },
    nieve: { temp: -2, feels: -6, code: 73, tmax: 1, tmin: -5 },
    tormenta: { temp: 16, feels: 15, code: 95, tmax: 18, tmin: 12, rainProb: 95 },
    otono: { temp: 14, feels: 13, code: 2, tmax: 17, tmin: 7, season: 'otono' },
    invierno: { temp: 9, feels: 7, code: 3, tmax: 12, tmin: 3, season: 'invierno' },
    primavera: { temp: 19, feels: 19, code: 1, tmax: 22, tmin: 10, season: 'primavera' },
    verano: { temp: 26, feels: 26, code: 0, tmax: 29, tmin: 15, uv: 9, season: 'verano' },
  };
  return { ...base, ...S[kind], lat };
}

// Traduce el clima a cómo se ve la mascota.
export function look(wx, now = new Date()) {
  if (!wx) return { season: season(now), flags: {} };
  const se = wx.season || season(now, wx.lat ?? -33);
  const k = describe(wx.code, wx.isDay).kind;
  const f = {
    freezing: wx.feels <= 3,
    cold: wx.feels <= 9,
    chilly: wx.feels <= 15,
    hot: wx.feels >= 29,
    warm: wx.temp >= 24,
    rain: k === 'rain' || k === 'storm',
    snow: k === 'snow',
    storm: k === 'storm',
    sunny: k === 'clear' && wx.isDay,
    night: !wx.isDay,
  };
  return { season: se, kind: k, flags: f };
}

export function advice(wx) {
  if (!wx) return '';
  const tips = [];
  const k = describe(wx.code, wx.isDay).kind;
  if (wx.feels <= 3) tips.push(pick(['¡Está helado! Abrígate harto: chaqueta, bufanda y gorro.', 'Hace un frío que cala los huesos. ¡Ponte primera capa y chaqueta gruesa!']));
  else if (wx.feels <= 9) tips.push(pick(['Hace frío, ¡abrígate bien! Una chaqueta y bufanda no están de más.', 'Brr… sal con chaqueta, que está fresco.']));
  else if (wx.feels <= 15) tips.push('Está fresquito, una chaleca o polerón te va a venir bien.');
  else if (wx.feels >= 29) tips.push(pick(['¡Hace mucho calor! Toma harta agua y busca sombrita.', 'Qué calor… ropa liviana, agua y bloqueador.']));
  else if (wx.temp >= 22) tips.push('Está agradable, ropa liviana y listo.');
  if (k === 'rain' || (wx.rainProb ?? 0) >= 60) tips.push('Lleva paraguas ☔, que puede llover.');
  if (k === 'storm') tips.push('Hay tormenta, mejor quedarse adentro si puedes.');
  if (k === 'snow') tips.push('¡Hay nieve! Cuidado con el piso resbaloso.');
  if ((wx.uv ?? 0) >= 7 && wx.isDay) tips.push('El sol pega fuerte hoy: usa bloqueador y lentes de sol 😎.');
  if (wx.tmax - wx.tmin >= 14) tips.push(`Ojo que cambia harto: mínima ${Math.round(wx.tmin)}° y máxima ${Math.round(wx.tmax)}°. Sal con capas.`);
  return tips.join(' ');
}

export function report(wx, place) {
  if (!wx) return 'Todavía no sé cómo está el clima. Dame permiso de ubicación o escribe tu ciudad en ajustes ⚙️.';
  const d = describe(wx.code, wx.isDay);
  const where = place ? ` en ${place}` : '';
  let s = `Ahora${where} hay ${Math.round(wx.temp)}°`;
  if (Math.abs(wx.feels - wx.temp) >= 2) s += ` (se sienten ${Math.round(wx.feels)}°)`;
  s += ` y está ${d.text} ${d.icon}. Hoy: mínima ${Math.round(wx.tmin)}°, máxima ${Math.round(wx.tmax)}°`;
  if (wx.rainProb != null) s += `, ${wx.rainProb}% de probabilidad de lluvia`;
  s += '. ' + advice(wx);
  return s.trim();
}

export function reportTomorrow(wx) {
  if (!wx?.tomorrow) return report(wx);
  const t = wx.tomorrow, d = describe(t.code, 1);
  let s = `Mañana va a estar ${d.text} ${d.icon}, con mínima de ${Math.round(t.tmin)}° y máxima de ${Math.round(t.tmax)}°`;
  if (t.rainProb != null) s += ` (${t.rainProb}% de lluvia)`;
  s += '.';
  if (t.tmin <= 5) s += ' La mañana va a estar helada, ¡abrígate!';
  if ((t.rainProb ?? 0) >= 60) s += ' Deja el paraguas listo ☔.';
  if (t.tmax >= 29) s += ' Va a hacer calor, prepara agua y bloqueador.';
  return s;
}
