import { load, save, reset, clamp, pick, DEFAULT_MODEL } from './store.js';
import { PetView, EXPR } from './pet.js';
import * as W from './weather.js';
import { detect, addBday, addNote, upcoming, daysUntil, whenText, fmtDate, norm } from './memory.js';
import { brain, MODELS } from './brain.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const S = load();
const view = new PetView(app);

let wx = null;          // clima actual (real o simulado)
let place = '';
let tempExpr = null;    // expresión temporal
let tempUntil = 0;
let busy = null;        // 'game' | 'bath' | 'eat' | null
let thinking = false;

const petName = () => S.petName || 'Lumi';
const userName = () => S.userName || '';
const hi = () => (userName() ? `, ${userName()}` : '');

// ================= Estado y ánimo =================
function decay() {
  const now = Date.now();
  const h = Math.min(48, (now - S.last) / 3600000);
  S.last = now;
  if (h <= 0) return;
  const st = S.stats;
  if (S.sleeping) {
    st.energy = clamp(st.energy + 22 * h);
    st.hunger = clamp(st.hunger - 3 * h);
    st.fun = clamp(st.fun - 1 * h);
    if (st.energy >= 100) wake(true);
  } else {
    st.hunger = clamp(st.hunger - 6 * h);
    st.energy = clamp(st.energy - 4 * h);
    st.fun = clamp(st.fun - 5 * h);
    st.clean = clamp(st.clean - 3 * h);
  }
}

function avg() {
  const s = S.stats;
  return (s.hunger + s.energy + s.fun + s.clean) / 4;
}

function baseMood() {
  const s = S.stats;
  const f = W.look(wx).flags;
  if (S.sleeping) return 'sleeping';
  if (s.hunger < 20) return 'hungry';
  if (s.energy < 15) return 'sleepy';
  if (f.storm && Math.random() < .3) return 'scared';
  if (f.cold) return 'cold';
  if (f.hot) return 'hot';
  if (s.clean < 22) return 'dirty';
  if (s.hunger < 35) return 'hungry';
  if (s.energy < 30) return 'sleepy';
  if (s.fun < 15) return 'sad';
  if (s.fun < 32) return 'bored';
  if (s.clean < 38) return 'dirty';
  const hr = new Date().getHours();
  if ((hr >= 23 || hr < 6) && s.energy < 65) return 'sleepy';
  if (avg() >= 74 || s.love >= 80) return 'happy';
  return 'neutral';
}

function mood() {
  if (tempExpr && Date.now() < tempUntil) return tempExpr;
  tempExpr = null;
  if (thinking) return 'thinking';
  return baseMood();
}

function feel(expr, ms = 2500) {
  tempExpr = expr; tempUntil = Date.now() + ms;
  render();
  clearTimeout(feel._t);
  feel._t = setTimeout(render, ms + 30);
}

function render() {
  const m = mood();
  view.show(m);
  view.setRing(avg());
  app.dataset.time = (wx && !wx.isDay) || isNightHour() ? 'night' : 'day';
  const lk = W.look(wx);
  app.dataset.season = lk.season;
  const f = lk.flags;
  const awake = !S.sleeping;
  const temp = tempExpr && Date.now() < tempUntil;
  view.acc('nightcap', S.sleeping);
  view.acc('beanie', awake && (f.cold || f.snow || (lk.season === 'invierno' && f.chilly)));
  view.acc('scarf', f.cold || f.snow || (lk.season === 'otono' && f.chilly !== false) || (lk.season === 'invierno' && f.chilly));
  view.acc('sweat', awake && (f.hot || m === 'hot'));
  view.acc('shades', awake && !temp && f.sunny && f.warm && !f.hot && m !== 'sleepy');
  view.acc('umbrella', awake && f.rain);
  view.acc('flower', awake && lk.season === 'primavera' && !f.cold && !f.rain && !f.hot);
  document.querySelectorAll('.stat').forEach((el) => {
    const v = S.stats[el.dataset.k];
    el.querySelector('i').style.width = v + '%';
    el.classList.toggle('low', v < 30);
  });
  $('#petName').textContent = petName();
  $('#sleepLbl').textContent = S.sleeping ? 'Despertar' : 'Dormir';
  app.classList.toggle('lights-off', S.sleeping);
  view.pet.classList.toggle('sleeping', S.sleeping);
  setParticles(lk);
}

const isNightHour = () => { const h = new Date().getHours(); return h >= 21 || h < 7; };

// ================= Burbuja de diálogo y voz =================
const bubble = $('#bubble');
let bubbleT;
function say(text, { ms, speak = true, keep = false } = {}) {
  bubble.classList.remove('thinking');
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleT);
  if (!keep) bubbleT = setTimeout(() => bubble.classList.remove('show'), ms || Math.min(14000, 2600 + text.length * 55));
  if (speak) talk(text);
}
function sayThinking() {
  bubble.textContent = '';
  bubble.classList.add('show', 'thinking');
  clearTimeout(bubbleT);
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis?.getVoices?.() || [];
  voice = vs.find((v) => /es[-_]CL/i.test(v.lang)) || vs.find((v) => /es[-_](US|MX|419)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function talk(text) {
  if (!S.settings.voice || !('speechSynthesis' in window)) return;
  const clean = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
  if (!clean) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'es-CL';
  u.pitch = 1.45; u.rate = 1.05;
  speechSynthesis.speak(u);
}

// ================= Partículas =================
const fx = $('#fx');
let pTimer = null, pKey = '';
function spawn(cls, opts = {}) {
  if (fx.childElementCount > 90) return null;
  const el = document.createElement('i');
  el.className = 'p ' + cls;
  el.style.left = (opts.x ?? Math.random() * 100) + (opts.px ? 'px' : '%');
  if (opts.y != null) el.style.top = opts.y + 'px';
  if (opts.bottom != null) el.style.bottom = opts.bottom + 'px';
  if (opts.dur) el.style.animationDuration = opts.dur + 's';
  if (opts.dx != null) el.style.setProperty('--dx', opts.dx + 'px');
  if (opts.bg) el.style.background = opts.bg;
  if (opts.text) el.textContent = opts.text;
  if (opts.size) { el.style.width = el.style.height = opts.size + 'px'; }
  fx.appendChild(el);
  const life = (opts.dur || 3) * 1000 + 300;
  setTimeout(() => el.remove(), life);
  return el;
}

function setParticles(lk) {
  const f = lk.flags || {};
  const key = [f.rain, f.snow, f.storm, f.hot, lk.season, app.dataset.time, S.sleeping].join('|');
  if (key === pKey) return;
  pKey = key;
  clearInterval(pTimer);
  fx.querySelectorAll('.p-star').forEach((e) => e.remove());
  if (app.dataset.time === 'night' && !f.rain && !f.snow) {
    for (let i = 0; i < 40; i++) {
      const s = spawn('p-star', { x: Math.random() * 100, dur: 99999 });
      if (s) { s.style.top = Math.random() * 55 + '%'; s.style.animationDuration = (1.5 + Math.random() * 3) + 's'; s.style.animationDelay = (-Math.random() * 3) + 's'; }
    }
  }
  const leafColors = ['#d9822b', '#c4512f', '#e3b23c', '#9c5a2b'];
  pTimer = setInterval(() => {
    if (document.hidden) return;
    if (f.rain) for (let i = 0; i < 3; i++) spawn('p-rain', { dur: .7 + Math.random() * .4, dx: -30 });
    if (f.storm && Math.random() < .04) { spawn('p-flash', { x: 0, dur: .8 }); if (!S.sleeping) feel('scared', 1500); }
    if (f.snow) spawn('p-snow', { dur: 6 + Math.random() * 5, dx: (Math.random() - .5) * 120, size: 3 + Math.random() * 5 });
    if (!f.rain && !f.snow && lk.season === 'otono' && Math.random() < .25) spawn('p-leaf', { dur: 7 + Math.random() * 5, bg: pick(leafColors) });
    if (!f.rain && !f.snow && lk.season === 'primavera' && Math.random() < .12) spawn('p-petal', { dur: 8 + Math.random() * 4 });
    if (f.hot && Math.random() < .3) spawn('p-heat', { dur: 5 });
    if (S.sleeping && Math.random() < .12) zzz();
  }, 300);
}

function floatAtPet(text, n = 1) {
  const c = view.center();
  for (let i = 0; i < n; i++) {
    setTimeout(() => spawn('p-float', { x: c.x - 12 + (Math.random() - .5) * c.w * .5, px: true, bottom: innerHeight - c.y + c.w * .15, dur: 1.6, dx: (Math.random() - .5) * 80, text: typeof text === 'function' ? text() : text }), i * 140);
  }
}
const zzz = () => floatAtPet(pick(['z', 'Z', 'z']), 1);

// ================= Interacciones táctiles =================
let press = null, taps = [];
const petEl = view.pet;

petEl.addEventListener('pointerdown', (e) => {
  petEl.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, t: Date.now(), dist: 0, lx: e.clientX, ly: e.clientY, stroking: false, hug: false };
  press.timer = setTimeout(() => { if (press && press.dist < 18) { press.hug = true; hug(); } }, 650);
});
petEl.addEventListener('pointermove', (e) => {
  if (!press) return;
  const d = Math.hypot(e.clientX - press.lx, e.clientY - press.ly);
  press.dist += d; press.lx = e.clientX; press.ly = e.clientY;
  if (busy === 'bath') { scrub(e, d); return; }
  if (press.dist > 120 && !S.sleeping) {
    if (!press.stroking) { press.stroking = true; startPet(); }
    if (Math.random() < d / 120) floatAtPet(pick(['💗', '💕', '✨']));
    S.stats.love = clamp(S.stats.love + d / 400);
    S.stats.fun = clamp(S.stats.fun + d / 800);
  }
});
const endPress = () => {
  if (!press) return;
  clearTimeout(press.timer);
  const p = press; press = null;
  if (p.hug) return;
  if (p.stroking) { endPet(); return; }
  if (p.dist < 18 && Date.now() - p.t < 450) tap();
};
petEl.addEventListener('pointerup', endPress);
petEl.addEventListener('pointercancel', endPress);

document.addEventListener('pointermove', (e) => {
  if (busy === 'game') return;
  view.lookAtPoint(e.clientX, e.clientY);
  clearTimeout(document._gz);
  document._gz = setTimeout(() => view.look(0, 0), 2500);
}, { passive: true });

const TAP_LINES = {
  happy: ['¡Jiji! 😆', '¡Hola, hola!', '¡Eso hace cosquillas!', '¿Jugamos?', '✨ ¡boop! ✨'],
  neutral: ['¿Sí?', '¡Boop!', '¿Me llamabas?', 'Aquí estoy 👀', 'Hmm?'],
  hungry: ['Tengo hambre… 🥺', '¿Me das algo de comer?', 'Mi guatita suena…'],
  sleepy: ['Mmm… tengo sueño 😪', '*bostezo*', '¿Me dejas dormir un ratito?'],
  bored: ['Estoy aburrido…', '¿Jugamos a algo?', 'Cuéntame algo entretenido'],
  sad: ['Me siento solito…', '¿Me haces cariño?', '🥺'],
  dirty: ['Creo que necesito un baño…', 'Uff, estoy cochinito 🫧'],
  cold: ['¡Brrr! ¡Qué frío! 🥶', 'Hace frío, ¡abrígate tú también!', '¡Me congelo! ¿Me prestas tu bufanda?'],
  hot: ['Uff… qué calor 🥵', 'Me estoy derritiendo…', '¿Un heladito? 🍦'],
};

function tap() {
  if (busy === 'game') return;
  const now = Date.now();
  taps = taps.filter((t) => now - t < 2500); taps.push(now);
  if (S.sleeping) {
    if (taps.length >= 3) { wake(); taps = []; }
    else { view.anim('wiggle', 800); say(pick(['Zzz… mmh…', '5 minutitos más… 😴', '*ronquidito*']), { speak: false }); }
    return;
  }
  if (taps.length >= 6) { taps = []; dizzy(); return; }
  view.anim('bounce', 600);
  S.stats.fun = clamp(S.stats.fun + 1.5);
  S.stats.love = clamp(S.stats.love + .5);
  const m = baseMood();
  const lines = TAP_LINES[m] || TAP_LINES.neutral;
  if (Math.random() < .55) say(pick(lines), { speak: false });
  feel(m === 'neutral' || m === 'happy' ? pick(['happy', 'surprised', 'excited']) : m, 1300);
}

function dizzy() {
  view.anim('dizzy', 1300);
  feel('dizzy', 2600);
  say(pick(['¡Aaay, me mareo! 😵‍💫', '¡Todo da vueltas!', 'Ya, ya, ¡paraaa! 🌀']), { speak: false });
}

function startPet() {
  feel('love', 60000);
  say(pick(['Mmm… qué rico 💗', '*ronronea*', '¡Más cariñitos!', 'Te quiero harto 💕']), { speak: false });
}
function endPet() {
  feel('happy', 1800);
  save(S);
}
function hug() {
  if (S.sleeping) return;
  view.anim('squish', 900);
  feel('love', 2600);
  S.stats.love = clamp(S.stats.love + 4);
  S.stats.fun = clamp(S.stats.fun + 3);
  floatAtPet('💗', 4);
  say(pick(['¡Abrazo! 🤗', 'Awww, yo también te quiero', '¡Apapacho!']), { speak: false });
}

// Agitar el celular → se marea
let lastShake = 0;
window.addEventListener('devicemotion', (e) => {
  const a = e.accelerationIncludingGravity; if (!a) return;
  const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  if (mag > 28 && Date.now() - lastShake > 3000 && !S.sleeping && !busy) { lastShake = Date.now(); dizzy(); }
});

// ================= Acciones =================
const FOODS = [
  { e: '🍎', n: 'Manzana', hunger: 15, fun: 2, clean: 0, line: ['¡Crujiente y sanita! 🍎', 'Mmm, ñam ñam.'] },
  { e: '🍪', n: 'Galleta', hunger: 10, fun: 6, clean: -2, line: ['¡Galletita! 🍪 Mi favorita.', 'Crunch crunch 😋'] },
  { e: '🍕', n: 'Pizza', hunger: 28, fun: 6, clean: -6, line: ['¡PIZZAAA! 🍕', 'Quedé con la cara llena de salsa jaja'] },
  { e: '🍦', n: 'Helado', hunger: 8, fun: 10, clean: -3, line: ['¡Heladito! 🍦', 'Frío y rico.'] },
  { e: '🍵', n: 'Tecito', hunger: 4, fun: 4, clean: 0, line: ['Un tecito calentito ☕', 'Ahhh, qué rico.'] },
  { e: '🥑', n: 'Palta', hunger: 18, fun: 4, clean: 0, line: ['¡Palta! Muy chileno de tu parte 🥑', 'Cremosita, mmm.'] },
];
$('#foodGrid').innerHTML = FOODS.map((f, i) => `<button data-i="${i}"><span>${f.e}</span><span>${f.n}</span></button>`).join('');
$('#foodGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  closeSheets();
  eat(FOODS[+b.dataset.i]);
});

function eat(food) {
  if (S.sleeping) { say('Shhh… está durmiendo 😴', { speak: false }); return; }
  if (S.stats.hunger > 94) { feel('grumpy', 1800); say(pick(['Estoy llenito, gracias 😮‍💨', 'No me cabe ni una miga más.'])); return; }
  busy = 'eat';
  const c = view.center();
  const el = spawn('p-food', { x: c.x - 17, px: true, bottom: 40, dur: 1.2, text: food.e });
  feel('surprised', 700);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (el) { el.style.transform = `translateY(${-(innerHeight - 40 - (c.y + c.w * .18))}px) scale(.6)`; el.style.opacity = '0'; }
  }));
  setTimeout(() => {
    feel('eating', 1300);
    view.anim('chomp', 1100);
    const st = S.stats;
    st.hunger = clamp(st.hunger + food.hunger);
    st.fun = clamp(st.fun + food.fun);
    st.clean = clamp(st.clean + food.clean);
    st.love = clamp(st.love + 1);
    const f = W.look(wx).flags;
    let line = pick(food.line);
    if (food.e === '🍦' && f.cold) line = '¿Helado con este frío? ¡Estás loco! Igual me lo como 🥶🍦';
    if (food.e === '🍦' && f.hot) { line = '¡Justo lo que necesitaba con este calor! 🍦'; st.fun = clamp(st.fun + 6); }
    if (food.e === '🍵' && f.cold) { line = 'Un tecito calentito con este frío… perfecto ☕💗'; st.fun = clamp(st.fun + 6); }
    setTimeout(() => { say(line); feel('happy', 1800); busy = null; save(S); }, 1150);
  }, 750);
}

// ---- Minijuego: atrapa chispas ----
async function play() {
  if (S.sleeping) { say('Está durmiendo… despiértalo primero 🌙', { speak: false }); return; }
  if (S.stats.energy < 15) { feel('sleepy', 2000); say('Estoy muy cansado para jugar… ¿dormimos un rato? 😪'); return; }
  if (busy) return;
  busy = 'game';
  const game = $('#game'); game.hidden = false;
  game.querySelectorAll('.spark').forEach((s) => s.remove());
  let score = 0, left = 15;
  $('#gScore').textContent = 0; $('#gTime').textContent = left;
  feel('excited', 1500);
  say('¡Atrapa las chispas antes que se apaguen! ✨', { ms: 2500 });
  const rect = () => game.getBoundingClientRect();
  const spawnSpark = () => {
    const r = rect();
    const b = document.createElement('button');
    b.className = 'spark'; b.setAttribute('aria-label', 'Chispa');
    const x = 30 + Math.random() * (r.width - 60), y = 40 + Math.random() * (r.height - 80);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    b.onpointerdown = (ev) => {
      ev.stopPropagation();
      score++; $('#gScore').textContent = score;
      view.lookAtPoint(ev.clientX, ev.clientY);
      feel(pick(['happy', 'excited']), 600); view.anim('bounce', 500);
      b.remove();
    };
    game.appendChild(b);
    view.lookAtPoint(r.left + x, r.top + y);
    setTimeout(() => b.remove(), 1300 + Math.random() * 500);
  };
  const sp = setInterval(spawnSpark, 620);
  const tm = setInterval(() => { left--; $('#gTime').textContent = left; }, 1000);
  await new Promise((r) => setTimeout(r, 15000));
  clearInterval(sp); clearInterval(tm);
  game.querySelectorAll('.spark').forEach((s) => s.remove());
  game.hidden = true; busy = null;
  const st = S.stats;
  st.fun = clamp(st.fun + Math.min(35, 8 + score * 2.5));
  st.energy = clamp(st.energy - 8); st.hunger = clamp(st.hunger - 5);
  st.love = clamp(st.love + 2);
  view.look(0, 0);
  if (score >= 15) { feel('proud', 3000); floatAtPet('⭐', 5); say(`¡${score} chispas! ¡Eres un crack! 🏆`); }
  else if (score >= 8) { feel('happy', 2500); say(`¡${score} chispas! Bien jugado 😄`); }
  else { feel('neutral', 2000); say(`${score} chispas… ¡la próxima te gano yo! 😜`); }
  save(S);
}

// ---- Baño ----
let bathT = null, lastBubble = 0;
function bath() {
  if (S.sleeping) { say('Shhh… mejor lo bañamos cuando despierte.', { speak: false }); return; }
  if (busy === 'bath') { endBath(); return; }
  if (busy) return;
  if (S.stats.clean > 92) { say('¡Ya estoy limpiecito y brillante! ✨'); return; }
  busy = 'bath';
  document.querySelector('[data-act="clean"]').classList.add('on');
  feel('surprised', 900);
  say('¡Frótame con el dedo para bañarme! 🫧', { ms: 3000 });
  bathT = setTimeout(endBath, 25000);
}
function scrub(e, d) {
  S.stats.clean = clamp(S.stats.clean + d / 30);
  if (Date.now() - lastBubble > 70) {
    lastBubble = Date.now();
    spawn('p-bubble', { x: e.clientX - 9 + (Math.random() - .5) * 30, px: true, bottom: innerHeight - e.clientY, dur: 1.8, dx: (Math.random() - .5) * 60, size: 10 + Math.random() * 16 });
  }
  feel('happy', 800);
  render();
  if (S.stats.clean >= 100) endBath(true);
}
function endBath(done) {
  clearTimeout(bathT);
  busy = null;
  document.querySelector('[data-act="clean"]').classList.remove('on');
  if (done || S.stats.clean > 90) { feel('proud', 2500); floatAtPet('✨', 6); say('¡Quedé brillante! Gracias 🫧✨'); S.stats.fun = clamp(S.stats.fun + 5); }
  save(S);
}

// ---- Dormir ----
function sleep() {
  if (S.sleeping) { wake(); return; }
  if (busy) return;
  if (S.stats.energy > 85) { feel('excited', 1500); say('¿Dormir? ¡Si tengo pila para rato! 😆'); return; }
  feel('yawn', 1600);
  say(pick(['Buenas noches… 🌙', 'A mimir… 😴', 'Que sueñes bonito tú también 💤']));
  setTimeout(() => { S.sleeping = true; S.last = Date.now(); render(); save(S); }, 1500);
}
function wake(auto) {
  S.sleeping = false;
  render();
  if (auto) { feel('happy', 2500); say(`¡Buenos días${hi()}! Dormí rebién ☀️`); }
  else if (S.stats.energy < 50) { feel('grumpy', 2500); say('Mmmh… me despertaste… 😒 Bueno, ya.'); }
  else { feel('yawn', 1500); setTimeout(() => say(`¡Ya desperté${hi()}! 🌞`), 1500); }
  save(S);
}

document.querySelector('.actions').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'feed') { if (S.sleeping) say('Shhh… está durmiendo 😴', { speak: false }); else openSheet('sheetFood'); }
  if (a === 'play') play();
  if (a === 'clean') bath();
  if (a === 'sleep') sleep();
});

// ================= Hojas =================
function openSheet(id) { closeSheets(); $('#' + id).hidden = false; }
function closeSheets() { document.querySelectorAll('.sheet').forEach((s) => { if (s.id !== 'sheetHello') s.hidden = true; }); }
document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s && s.id !== 'sheetHello') s.hidden = true; }));

$('#btnNotes').onclick = () => { renderNotes(); openSheet('sheetNotes'); };
$('#btnSettings').onclick = () => { renderSettings(); openSheet('sheetSettings'); };
$('#btnHistory').onclick = () => { renderHistory(); openSheet('sheetHistory'); };
$('#wxChip').onclick = () => { if (S.sleeping) return; feel('thinking', 900); setTimeout(() => say(W.report(wx, place)), 500); };

document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  $('#tabBdays').hidden = t.dataset.tab !== 'bdays';
  $('#tabNotes').hidden = t.dataset.tab !== 'notes';
});

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderNotes() {
  const bl = upcoming(S.bdays);
  $('#bdayList').innerHTML = bl.length ? bl.map((b) => `<li><div class="t">${esc(b.name)}<small>${fmtDate(b)} · <span class="${b.days <= 7 ? 'soon' : ''}">${whenText(b.days)}</span></small></div><button data-del-b="${b.id}" aria-label="Borrar">×</button></li>`).join('')
    : '<li class="empty">Aún no hay cumpleaños anotados 🎂</li>';
  $('#noteList').innerHTML = S.notes.length ? S.notes.map((n, i) => `<li><div class="t">${i + 1}. ${esc(n.text)}<small>${new Date(n.ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</small></div><button data-del-n="${n.id}" aria-label="Borrar">×</button></li>`).join('')
    : '<li class="empty">Libreta vacía 📒</li>';
}
$('#sheetNotes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.delB) { S.bdays = S.bdays.filter((x) => x.id !== b.dataset.delB); save(S); renderNotes(); }
  if (b.dataset.delN) { S.notes = S.notes.filter((x) => x.id !== b.dataset.delN); save(S); renderNotes(); }
});
$('#bdayForm').onsubmit = (e) => {
  e.preventDefault();
  const [, m, d] = $('#bdayDate').value.split('-').map(Number);
  const name = $('#bdayName').value.trim();
  if (!name || !m) return;
  addBday(S, name, d, m); save(S); renderNotes();
  $('#bdayName').value = ''; $('#bdayDate').value = '';
  feel('happy', 1500);
};
$('#noteForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('#noteText').value.trim(); if (!t) return;
  addNote(S, t); save(S); renderNotes(); $('#noteText').value = '';
};

function renderHistory() {
  const h = S.history.slice(-60);
  $('#historyList').innerHTML = h.length ? h.map((m) => `<div class="msg ${m.role === 'user' ? 'me' : ''}">${esc(m.content)}</div>`).join('')
    : `<p class="muted">Todavía no hemos conversado. ¡Escríbeme o háblame por voz!</p>`;
  const card = $('#sheetHistory .sheet-card'); setTimeout(() => card.scrollTop = card.scrollHeight, 30);
}

$('#btnClearHist').onclick = () => { S.history = []; save(S); renderHistory(); };

// ---- Ajustes ----
$('#modelSel').innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
async function renderSettings() {
  $('#setPetName').value = S.petName; $('#setUserName').value = S.userName;
  $('#setVoice').checked = !!S.settings.voice;
  $('#modelSel').value = S.settings.model;
  $('#simSel').value = S.settings.sim || '';
  $('#wxStatus').textContent = wx ? `${wx.sim ? 'Simulación' : (place || 'Tu ubicación')}: ${Math.round(wx.temp)}°, ${W.describe(wx.code, wx.isDay).text}` : 'Sin datos de clima todavía.';
  renderBrain();
}
$('#setPetName').onchange = (e) => { S.petName = e.target.value.trim(); save(S); render(); };
$('#setUserName').onchange = (e) => { S.userName = e.target.value.trim(); save(S); };
$('#setVoice').onchange = (e) => { S.settings.voice = e.target.checked; save(S); if (e.target.checked) talk('¡Hola! Ahora puedo hablar.'); };
$('#modelSel').onchange = (e) => { S.settings.model = e.target.value; save(S); renderBrain(); };
$('#simSel').onchange = (e) => { S.settings.sim = e.target.value; save(S); refreshWeather(); };
$('#btnGeo').onclick = async () => { S.settings.loc = null; save(S); await refreshWeather(true); renderSettings(); };
$('#btnCity').onclick = async () => {
  const q = $('#cityInput').value.trim(); if (!q) return;
  try {
    const c = await W.searchCity(q);
    if (!c) { $('#wxStatus').textContent = 'No encontré esa ciudad 🤔'; return; }
    S.settings.loc = c; save(S); await refreshWeather(); renderSettings();
  } catch { $('#wxStatus').textContent = 'Sin conexión para buscar la ciudad.'; }
};
$('#btnReset').onclick = () => {
  if (confirm('¿Borrar todo y empezar de cero? Se pierden notas, cumpleaños y la mascota (el cerebro descargado se mantiene).')) { reset(); location.reload(); }
};

$('#btnBrain').onclick = () => {
  if (brain.status === 'ready' && brain.modelId?.startsWith(S.settings.model.split('-q4')[0])) return;
  brain.load(S.settings.model);
};
async function renderBrain() {
  const st = $('#brainStatus'), btn = $('#btnBrain'), prog = $('#brainProg');
  prog.hidden = brain.status !== 'loading';
  prog.querySelector('i').style.width = Math.round(brain.progress * 100) + '%';
  btn.disabled = brain.status === 'loading';
  if (brain.status === 'loading') { st.textContent = `Despertando cerebro… ${Math.round(brain.progress * 100)}%  ${brain.progressText.replace(/\[.*?\]/g, '').slice(0, 80)}`; btn.textContent = 'Cargando…'; return; }
  if (brain.status === 'unsupported' || brain.status === 'error') { st.textContent = '⚠️ ' + brain.error; btn.textContent = 'Reintentar'; return; }
  const sameModel = brain.modelId && brain.modelId.split('-q4')[0] === S.settings.model.split('-q4')[0];
  if (brain.status === 'ready' && sameModel) { st.textContent = '✅ Cerebro activo. Funciona sin internet.'; btn.textContent = 'Listo'; btn.disabled = true; return; }
  const cached = await brain.isCached(S.settings.model);
  st.textContent = cached ? 'Descargado en el celular. Toca para activarlo.' : 'Sin descargar. Pesa bastante, usa Wi‑Fi.';
  btn.textContent = cached ? 'Activar cerebro' : 'Descargar cerebro';
}
brain.on(() => {
  if (!$('#sheetSettings').hidden) renderBrain();
  if (brain.status === 'ready' && !brain._greeted) { brain._greeted = true; feel('excited', 2500); say('¡Mi cerebro despertó! 🧠✨ Ahora puedo conversar contigo de verdad.'); }
});

// ================= Conversación =================
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('#chatInput').value.trim();
  if (!t) return;
  $('#chatInput').value = '';
  $('#chatInput').blur();
  handle(t);
};

function pushHist(role, content) {
  S.history.push({ role, content, ts: Date.now() });
  if (S.history.length > 120) S.history = S.history.slice(-120);
  save(S);
}

async function handle(text) {
  if (thinking) { say('Espérame, todavía estoy pensando lo anterior… 🤔', { speak: false, ms: 2500 }); return; }
  pushHist('user', text);
  if (S.sleeping && !/despierta|buenos dias|arriba/i.test(norm(text))) {
    view.anim('wiggle', 800);
    return reply('Zzz… (está durmiendo. Toca “Despertar” o dile “despierta”)', { hist: false });
  }
  const it = detect(text);
  if (it) {
    const r = await doIntent(it);
    if (r) return reply(r);
  }
  if (brain.status === 'ready') return llmReply(text);
  return reply(fallback(text) + (brain.status === 'loading' ? ` (Mi cerebro sigue despertando: ${Math.round(brain.progress * 100)}%)` : ''));
}

function reply(text, { hist = true } = {}) {
  if (hist) pushHist('assistant', text);
  say(text);
}

async function doIntent(it) {
  const f = W.look(wx).flags;
  switch (it.type) {
    case 'bday-add': {
      addBday(S, it.name, it.d, it.m); save(S);
      const days = daysUntil(it);
      feel('happy', 2000);
      return `¡Anotado! 🎂 El cumple de ${it.name} es el ${fmtDate(it)} (${whenText(days)}). Te aviso cuando se acerque.`;
    }
    case 'bday-when': {
      const b = S.bdays.find((x) => norm(x.name).includes(norm(it.name)) || norm(it.name).includes(norm(x.name)));
      if (!b) { feel('thinking', 1500); return `Mmm, no tengo anotado el cumple de ${it.name}. Dime “el cumple de ${it.name} es el 5 de mayo” y lo guardo.`; }
      return `El cumple de ${b.name} es el ${fmtDate(b)}, o sea ${whenText(daysUntil(b))} 🎈`;
    }
    case 'bday-list': {
      if (!S.bdays.length) return 'Todavía no tengo cumpleaños anotados. Dime por ejemplo: “el cumple de la Cami es el 3 de marzo”.';
      let list = upcoming(S.bdays, it.within);
      if (it.exact != null) list = list.filter((b) => b.days === it.exact);
      if (!list.length) {
        const nx = upcoming(S.bdays)[0];
        const when = it.within === 0 ? 'hoy' : it.exact === 1 ? 'mañana' : it.within <= 7 ? 'esta semana' : 'pronto';
        return `No hay cumpleaños ${when}. El próximo es el de ${nx.name}, ${whenText(nx.days)} (${fmtDate(nx)}).`;
      }
      feel('excited', 1800);
      if (list.length === 1) return `¡El de ${list[0].name}! Es ${whenText(list[0].days)} (${fmtDate(list[0])}) 🎂`;
      return 'Se vienen estos cumples: ' + list.slice(0, 5).map((b) => `${b.name} (${whenText(b.days)})`).join(', ') + ' 🎉';
    }
    case 'note-add': {
      addNote(S, it.text); save(S);
      feel('proud', 1500);
      return pick(['¡Listo, anotado en la libreta! 📒', 'Anotadito ✍️', 'Guardado. Yo me acuerdo por ti 😉']) + ` “${it.text}”`;
    }
    case 'note-list': {
      if (!S.notes.length) return 'Tu libreta está vacía 📒. Dime “anota que…” y lo guardo.';
      const n = S.notes.slice(0, 6).map((x, i) => `${i + 1}) ${x.text}`).join(' · ');
      return `Esto tienes anotado: ${n}${S.notes.length > 6 ? ` …y ${S.notes.length - 6} más en la libreta.` : ''}`;
    }
    case 'note-del': {
      const n = S.notes[it.n - 1];
      if (!n) return `No encontré la nota ${it.n} 🤔`;
      S.notes.splice(it.n - 1, 1); save(S);
      return `Listo, borré: “${n.text}” ✔️`;
    }
    case 'weather': {
      if (!wx) await refreshWeather(true);
      feel(f.cold ? 'cold' : f.hot ? 'hot' : 'thinking', 2500);
      return it.tomorrow ? W.reportTomorrow(wx) : W.report(wx, place);
    }
    case 'time': return `Son las ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} ⏰`;
    case 'date': return `Hoy es ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} 📅`;
    case 'rename-pet': if (!it.name) return null; S.petName = it.name; save(S); render(); feel('love', 2000); return `¡${it.name}! Me encanta mi nuevo nombre 💗`;
    case 'rename-user': if (!it.name) return null; S.userName = it.name; save(S); feel('happy', 1500); return `¡Un gusto, ${it.name}! Ya no se me olvida 😊`;
    case 'act':
      if (it.act === 'play') { setTimeout(play, 300); return '¡Vamos! 🎮'; }
      if (it.act === 'sleep') { setTimeout(sleep, 300); return null; }
      if (it.act === 'wake') { if (S.sleeping) wake(); else return '¡Si estoy despierto! 😄'; return null; }
      if (it.act === 'feed') { openSheet('sheetFood'); return S.stats.hunger < 60 ? '¡Sí! Tengo hambre 🤤' : 'Bueno, algo chiquitito…'; }
      if (it.act === 'clean') { bath(); return null; }
  }
  return null;
}

const JOKES = [
  '¿Qué le dice una iguana a su hermana gemela? ¡Somos iguanitas! 🦎',
  '¿Por qué el libro de matemáticas estaba triste? Porque tenía muchos problemas 📘',
  '¿Qué hace una abeja en el gimnasio? ¡Zumba! 🐝',
  '¿Cuál es el café más peligroso del mundo? El ex-preso ☕',
  '—Mamá, en el colegio me dicen distraído. —Niño, tú vives al frente 🏠',
];
function fallback(text) {
  const t = norm(text);
  const m = baseMood();
  if (/^(hola|holi|buenas|hey|wena|ola)\b/.test(t)) return pick([`¡Hola${hi()}! 💫`, `¡Wena${hi()}! ¿Cómo estái?`, '¡Holaaa! Te estaba esperando 😊']);
  if (/(como estas|como te sientes|que tal|como andas)/.test(t)) return `Me siento ${EXPR[m].label}. ${m === 'hungry' ? '¿Me das algo de comer?' : m === 'sleepy' ? 'Creo que necesito dormir.' : m === 'cold' ? '¡Hace frío!' : '¿Y tú?'}`;
  if (/(te quiero|te amo|te adoro)/.test(t)) { feel('love', 2500); return '¡Yo también te quiero harto! 💗'; }
  if (/(gracias|vale|grax)/.test(t)) return pick(['¡De nada! 😊', 'Para eso estoy ✨']);
  if (/chiste/.test(t)) { feel('happy', 2000); return pick(JOKES); }
  if (/(quien eres|que eres|como te llamas)/.test(t)) return `Soy ${petName()}, un orbe que vive en tu celular. Te cuido las notas, los cumpleaños y te digo cómo está el clima ✨`;
  if (/(que puedes hacer|ayuda|que sabes hacer)/.test(t)) return 'Puedo decirte el clima (“¿cómo está el clima?”), anotar cosas (“anota que…”), guardar cumpleaños (“el cumple de X es el 3 de marzo”) y recordarte quién está de cumple. ¡Y jugar!';
  if (/(chao|adios|nos vemos|bye)/.test(t)) { feel('sad', 1500); return pick(['¡Chao! Vuelve pronto 👋', 'Nos vemos… te voy a extrañar 🥺']); }
  if (brain.status === 'off' && !fallback._hinted) { fallback._hinted = true; return 'Mmm… todavía no tengo mi cerebro descargado, así que entiendo poquito 🧠💤. Ve a Ajustes ⚙️ → “Descargar cerebro” y podremos conversar de todo.'; }
  return pick(['¡Qué interesante! Cuéntame más 👀', 'Mmm… no te entendí bien, pero me gusta que me hables 😊', '¡Jaja! ¿En serio?', 'Hmm 🤔']);
}

function systemPrompt() {
  const now = new Date();
  const lk = W.look(wx);
  const bd = upcoming(S.bdays, 45).slice(0, 5).map((b) => `${b.name}: ${fmtDate(b)} (${whenText(b.days)})`).join('; ') || 'ninguno anotado';
  const notes = S.notes.slice(0, 8).map((n, i) => `${i + 1}) ${n.text}`).join('; ') || 'vacía';
  const s = S.stats;
  const wxTxt = wx ? `${Math.round(wx.temp)}°C (sensación ${Math.round(wx.feels)}°), ${W.describe(wx.code, wx.isDay).text}, mín ${Math.round(wx.tmin)}° máx ${Math.round(wx.tmax)}°${wx.rainProb != null ? `, ${wx.rainProb}% lluvia` : ''}${place ? ', en ' + place : ''}. Consejo: ${W.advice(wx)}` : 'desconocido';
  return `Eres ${petName()}, una mascota virtual con forma de orbe mágico oscuro y brillante que vive en el celular de ${userName() || 'tu dueño'}. Eres su amigo.
Personalidad: tierno, juguetón, curioso y muy cariñoso. Hablas español sencillo, claro y cercano, como un buen amigo chileno.
Reglas: responde MUY corto, 1 o 2 frases, como un amigo en un chat, sin listas. Máximo un emoji. Nunca digas que eres un modelo de lenguaje ni nombres empresas: eres ${petName()}. No tienes internet; si no sabes algo, dilo con honestidad y no inventes datos. Los datos de abajo son solo para ti: no los recites ni des porcentajes, úsalos solo si te preguntan por clima, cumpleaños, notas o cómo te sientes.
Ahora: ${now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}, ${W.SEASON_NAME[lk.season]}.
Clima: ${wxTxt}
Tu estado: comida ${Math.round(s.hunger)}%, energía ${Math.round(s.energy)}%, ánimo ${Math.round(s.fun)}%, limpieza ${Math.round(s.clean)}%. Te sientes ${EXPR[baseMood()].label}.
Cumpleaños: ${bd}.
Libreta: ${notes}.`;
}

// Deja la respuesta corta y conversacional (los modelos chicos tienden a alargarse).
function tidy(s) {
  let t = s.replace(/\n+/g, ' ').replace(/\s*[-*•]\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (t.length <= 260) return t;
  const parts = t.match(/[^.!?…]+[.!?…]+["”)]?\s*|[^.!?…]+$/g) || [t];
  let out = '';
  for (const p of parts) { if ((out + p).length > 260 && out) break; out += p; }
  return out.trim();
}

async function llmReply(text) {
  thinking = true; render(); sayThinking();
  const hist = S.history.slice(-11, -1).map(({ role, content }) => ({ role, content }));
  const messages = [{ role: 'system', content: systemPrompt() }, ...hist, { role: 'user', content: text }];
  try {
    const out = await brain.chat(messages, (partial) => {
      if (partial) { bubble.classList.remove('thinking'); bubble.textContent = partial; }
    });
    thinking = false;
    const final = tidy(out) || 'Mmm… me quedé en blanco 😅';
    bubble.textContent = final;
    pushHist('assistant', final);
    say(final);
    if (/[💗❤️😍🥰]|te quiero/.test(final)) feel('love', 2000); else feel('happy', 1200);
  } catch (e) {
    console.error(e);
    thinking = false;
    reply('Uy, se me enredaron las ideas 😵‍💫. ¿Me lo repites?');
  }
}

// ---- Voz → texto ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#btnMic');
if (!SR) mic.hidden = true;
let rec = null;
mic.onclick = () => {
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'es-CL'; rec.interimResults = true; rec.maxAlternatives = 1;
  mic.classList.add('listening');
  feel('surprised', 900);
  say('Te escucho… 👂', { speak: false, keep: true });
  let finalT = '';
  rec.onresult = (e) => {
    const r = [...e.results].map((x) => x[0].transcript).join('');
    $('#chatInput').value = r;
    if (e.results[e.results.length - 1].isFinal) finalT = r;
  };
  rec.onerror = () => { };
  rec.onend = () => {
    mic.classList.remove('listening'); rec = null;
    const t = (finalT || $('#chatInput').value).trim();
    $('#chatInput').value = '';
    if (t) handle(t); else bubble.classList.remove('show');
  };
  rec.start();
};

// ================= Clima =================
async function refreshWeather(askGeo = false) {
  const sim = S.settings.sim;
  if (sim) { wx = W.simulated(sim, S.settings.loc?.lat ?? S.wxCache?.lat ?? -33); place = 'Simulación'; updateWxChip(); render(); return; }
  try {
    let loc = S.settings.loc;
    if (!loc) {
      if (!askGeo && !S.wxCache) { wx = null; place = ''; updateWxChip(); render(); return; }
      const p = await W.getPosition();
      loc = { ...p, name: await W.placeName(p.lat, p.lon), auto: true };
      S.settings.loc = loc;
    }
    wx = await W.fetchWeather(loc.lat, loc.lon);
    place = loc.name || '';
    S.wxCache = { ...wx, place };
    save(S);
  } catch (e) {
    console.warn('clima', e);
    if (S.wxCache) { wx = S.wxCache; place = S.wxCache.place || ''; } else { wx = null; place = ''; }
  }
  updateWxChip(); render();
}
function updateWxChip() {
  if (!wx) { $('#wxIcon').textContent = '📍'; $('#wxTemp').textContent = 'Clima'; return; }
  $('#wxIcon').textContent = W.describe(wx.code, wx.isDay).icon;
  $('#wxTemp').textContent = Math.round(wx.temp) + '°';
}

// ================= Vida propia =================
function idle() {
  setTimeout(idle, 14000 + Math.random() * 16000);
  if (document.hidden || busy || thinking || S.sleeping || bubble.classList.contains('show')) return;
  const m = baseMood();
  const r = Math.random();
  if (r < .35) { view.look((Math.random() - .5) * 2, (Math.random() - .5) * 1.2); setTimeout(() => view.look(0, 0), 1800); return; }
  if (m === 'cold' && r < .7) { say(pick(['¡Brrr! Hace frío, ¡abrígate! 🧣', 'Me castañetean los dientes 🥶', '¿Me prestas una frazada?']), { speak: false }); return; }
  if (m === 'hot' && r < .7) { say(pick(['Uff… me derrito 🥵', 'Qué calor… ¡toma agüita!', '¿No hay un ventilador por ahí?']), { speak: false }); return; }
  if (m === 'hungry' && r < .7) { say(pick(['Mi guatita hace ruido… 🍽️', '¿Comemos algo?']), { speak: false }); return; }
  if (m === 'sleepy' && r < .7) { feel('yawn', 1500); return; }
  if (m === 'bored' && r < .7) { say(pick(['Estoy aburrido… ¿jugamos? ✨', 'Hazme cariño 🥺']), { speak: false }); return; }
  if (m === 'dirty' && r < .7) { say('Creo que necesito un bañito 🫧', { speak: false }); return; }
  if (r < .55) view.anim('wiggle', 800);
  else if (r < .7) { feel(pick(['happy', 'excited', 'proud']), 1500); view.anim('bounce', 600); }
}

function greet() {
  const h = new Date().getHours();
  const away = (Date.now() - S.last) / 3600000;
  const g = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const msgs = [];
  if (away > 8) msgs.push(`¡${g}${hi()}! Te extrañé 🥺💗`);
  else msgs.push(`¡${g}${hi()}! ✨`);
  const soon = upcoming(S.bdays, 1);
  soon.forEach((b) => msgs.push(b.days === 0 ? `¡Hoy está de cumpleaños ${b.name}! 🎂 No te olvides de saludar.` : `Mañana está de cumple ${b.name} 🎈`));
  return msgs.join(' ');
}

function tick() { decay(); render(); save(S); }

// ================= Inicio =================
function start() {
  decay();
  if (S.wxCache) { wx = S.wxCache; place = S.wxCache.place || ''; }
  render(); updateWxChip();
  const firstTime = !S.petName;
  if (firstTime) {
    $('#sheetHello').hidden = false;
    $('#helloForm').onsubmit = (e) => {
      e.preventDefault();
      S.petName = $('#helloPet').value.trim() || 'Lumi';
      S.userName = $('#helloUser').value.trim();
      save(S);
      $('#sheetHello').hidden = true;
      render();
      feel('love', 2500); floatAtPet('💗', 4);
      say(`¡Me llamo ${S.petName}! ${S.userName ? `Un gusto, ${S.userName}. ` : ''}Tócame, hazme cariño o pregúntame por el clima ✨`, { ms: 6000 });
      refreshWeather(true);
    };
  } else {
    setTimeout(() => { if (!S.sleeping) { feel('happy', 2000); view.anim('bounce', 600); } say(greet(), { speak: false }); }, 600);
    refreshWeather(!!S.settings.loc || !!S.wxCache);
  }
  setInterval(tick, 30000);
  setInterval(() => refreshWeather(false), 30 * 60 * 1000);
  setTimeout(idle, 9000);
  // Si el cerebro ya está descargado, se despierta solo.
  brain.isCached(S.settings.model).then((c) => { if (c) brain.load(S.settings.model); });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(S);
  else { decay(); render(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

start();
