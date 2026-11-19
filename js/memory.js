// Libreta, cumpleaños y entender lo que le dices (sin IA, con reglas).
import { uid } from './store.js';

const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MRE = Object.keys(MONTHS).join('|');
const DATE_RE = `(\\d{1,2})\\s*(?:de\\s+)?(${MRE})|(\\d{1,2})\\s*[\\/\\-.]\\s*(\\d{1,2})`;

// Minúsculas y sin tildes, manteniendo el largo del texto (para recortar nombres del original).
export function norm(s) {
  return s.normalize('NFC').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
}

function dateFrom(m) {
  // m: grupos [d, mesNombre, d2, mesNum]
  let d, mo;
  if (m[0]) { d = +m[0]; mo = MONTHS[m[1]]; } else { d = +m[2]; mo = +m[3]; }
  if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { d, m: mo };
}

function cleanName(s) {
  s = s.trim().replace(/^(la|el|mi|de|del)\s+/i, '').replace(/[?.!,;:]+$/g, '').trim();
  s = s.replace(/^(la|el|mi)\s+/i, '');
  if (!s || s.length > 40) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function daysUntil(b, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), b.m - 1, b.d);
  if (next < today) next = new Date(now.getFullYear() + 1, b.m - 1, b.d);
  return Math.round((next - today) / 86400000);
}

export function upcoming(bdays, within = 3650) {
  return bdays.map((b) => ({ ...b, days: daysUntil(b) })).filter((b) => b.days <= within).sort((a, b) => a.days - b.days);
}

export function whenText(days) {
  if (days === 0) return 'hoy 🎉';
  if (days === 1) return 'mañana';
  if (days < 7) return `en ${days} días`;
  if (days < 14) return 'la próxima semana';
  return `en ${days} días`;
}

export const fmtDate = (b) => `${b.d} de ${MONTH_NAMES[b.m - 1]}`;

export function addBday(state, name, d, m) {
  const ex = state.bdays.find((b) => norm(b.name) === norm(name));
  if (ex) { ex.d = d; ex.m = m; return ex; }
  const b = { id: uid(), name, d, m };
  state.bdays.push(b);
  return b;
}

export function addNote(state, text) {
  const n = { id: uid(), text: text.trim(), ts: Date.now() };
  state.notes.unshift(n);
  return n;
}

// ---------- Interpretar mensajes ----------
export function detect(raw) {
  const text = raw.normalize('NFC').trim();
  const t = norm(text);

  // Cumpleaños: agregar
  let m;
  const pre = '(?:^|\\b)(?:(?:anota|apunta|anotame|apuntame|guarda|agenda|agrega|recuerda|recuerdame)\\s+(?:que\\s+)?)?';
  const r1 = new RegExp(pre + `(?:el\\s+)?cumple(?:anos)?\\s+(?:de(?:l)?\\s+)?(.+?)\\s+(?:es|sera|cae|seria)\\s+(?:el\\s+)?(?:${DATE_RE})`, 'd');
  const r2 = new RegExp(`(?:el\\s+)?(?:${DATE_RE})\\s+(?:es|sera|cae)\\s+(?:el\\s+)?cumple(?:anos)?\\s+de(?:l)?\\s+(.+)$`, 'd');
  const r3 = new RegExp(pre + `(.+?)\\s+(?:esta de cumpleanos|esta de cumple|cumple anos|cumple)\\s+(?:el\\s+)?(?:${DATE_RE})`, 'd');
  if ((m = r1.exec(t))) {
    const name = cleanName(text.slice(m.indices[1][0], m.indices[1][1]));
    const date = dateFrom(m.slice(2, 6));
    if (name && date) return { type: 'bday-add', name, ...date };
  }
  if ((m = r2.exec(t))) {
    const date = dateFrom(m.slice(1, 5));
    const name = cleanName(text.slice(m.indices[5][0], m.indices[5][1]));
    if (name && date) return { type: 'bday-add', name, ...date };
  }
  if ((m = r3.exec(t)) && !/\b(cuando|quien)\b/.test(t)) {
    const name = cleanName(text.slice(m.indices[1][0], m.indices[1][1]));
    const date = dateFrom(m.slice(2, 6));
    if (name && date && name.split(/\s+/).length <= 4) return { type: 'bday-add', name, ...date };
  }

  // Cumpleaños: consultar
  if (/cumple/.test(t)) {
    if ((m = /cuando\s+(?:es|sera|cae)\s+(?:el\s+)?cumple(?:anos)?\s+de(?:l)?\s+(.+)$/d.exec(t))) {
      return { type: 'bday-when', name: cleanName(text.slice(m.indices[1][0], m.indices[1][1])) };
    }
    if (/\b(hoy)\b/.test(t)) return { type: 'bday-list', within: 0 };
    if (/\b(manana)\b/.test(t)) return { type: 'bday-list', within: 1, exact: 1 };
    if (/\bsemana\b/.test(t)) return { type: 'bday-list', within: 7 };
    if (/\bmes\b/.test(t)) return { type: 'bday-list', within: 31 };
    return { type: 'bday-list', within: 60 };
  }

  // Notas
  if ((m = /^(?:oye\s+|porfa\s+|por favor\s+)?(?:anota|apunta|anotame|apuntame|guarda|agrega|escribe|recuerdame|recuerda)(?:\s+en\s+(?:la|mi)\s+libreta)?\s+(?:que\s+)?(.{2,})$/d.exec(t))) {
    return { type: 'note-add', text: text.slice(m.indices[1][0], m.indices[1][1]).replace(/[.!]+$/, '') };
  }
  if ((m = /(?:borra|elimina|quita|tacha)\s+(?:la\s+)?nota\s+(?:n(?:umero)?\s*)?(\d+)/.exec(t))) {
    return { type: 'note-del', n: +m[1] };
  }
  if (/(mis notas|las notas|libreta|anotado|apuntado|que anote|que apunte|que te dije que anotaras|pendientes)/.test(t)) {
    return { type: 'note-list' };
  }

  // Clima (si pide ideas o planes, mejor que responda el cerebro con el clima como contexto)
  const wantsIdeas = /(que (podemos|puedo|hago|hacemos|me recomiendas hacer)|planes?|panorama|ideas?)/.test(t);
  if (!wantsIdeas && /(clima|el tiempo|tiempo hace|temperatura|llover|llueve|lluvia|paraguas|abrig|que me pongo|que ropa|bloqueador|grados|hace frio|hace calor|va a hacer)/.test(t)) {
    return { type: 'weather', tomorrow: /manana/.test(t) };
  }

  // Hora / fecha
  if (/(que hora|la hora)/.test(t)) return { type: 'time' };
  if (/(que dia es|que fecha|fecha de hoy|dia es hoy)/.test(t)) return { type: 'date' };

  // Nombres
  if ((m = /(?:te vas a llamar|tu nombre (?:es|sera|va a ser)|te llamare|ahora te llamas)\s+(.+)$/d.exec(t))) {
    return { type: 'rename-pet', name: cleanName(text.slice(m.indices[1][0], m.indices[1][1])) };
  }
  if ((m = /(?:^|\b)(?:me llamo|mi nombre es)\s+([a-zñ]+(?:\s+[a-zñ]+)?)\s*$/d.exec(t))) {
    return { type: 'rename-user', name: cleanName(text.slice(m.indices[1][0], m.indices[1][1])) };
  }

  // Acciones
  if (/(vamos a jugar|juguemos|quiero jugar|a jugar)/.test(t)) return { type: 'act', act: 'play' };
  if (/(a dormir|buenas noches|anda a dormir|duermete|a la cama|apaga la luz)/.test(t)) return { type: 'act', act: 'sleep' };
  if (/(despierta|buenos dias|arriba|prende la luz)/.test(t)) return { type: 'act', act: 'wake' };
  if (/(tienes hambre|quieres comer|te doy comida|a comer|dame de comer)/.test(t)) return { type: 'act', act: 'feed' };
  if (/(banate|a banarse|bano|te bano|estas sucio)/.test(t)) return { type: 'act', act: 'clean' };

  return null;
}
