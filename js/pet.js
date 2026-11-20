// Dibujo y expresiones del orbe.
const L = 74, R = 126;

const EYES = {
  open: (x) => `<rect x="${x - 9}" y="82" width="18" height="28" rx="9" class="eye"/><ellipse cx="${x - 3}" cy="90" rx="3" ry="4.5" class="eye-core"/>`,
  big: (x) => `<rect x="${x - 11}" y="78" width="22" height="34" rx="11" class="eye"/><ellipse cx="${x - 4}" cy="88" rx="4" ry="5.5" class="eye-core"/><circle cx="${x + 4}" cy="100" r="2" class="eye-core"/>`,
  happy: (x) => `<path d="M${x - 11} 100 Q${x} 82 ${x + 11} 100" class="eye-line"/>`,
  closed: (x) => `<path d="M${x - 10} 96 Q${x} 103 ${x + 10} 96" class="eye-line"/>`,
  half: (x) => `<path d="M${x - 10} 94 h20 a10 11 0 0 1 -20 0z" class="eye"/>`,
  look: (x) => `<rect x="${x - 7}" y="88" width="14" height="18" rx="7" class="eye"/>`,
  sad: (x, side) => {
    const brow = side < 0 ? `M${x - 12} 76 L${x + 9} 70` : `M${x + 12} 76 L${x - 9} 70`;
    return `<rect x="${x - 8}" y="86" width="16" height="24" rx="8" class="eye"/><path d="${brow}" class="eye-line" style="stroke-width:4"/>`;
  },
  squint: (x, side) => side < 0
    ? `<path d="M${x - 9} 87 L${x + 7} 96 L${x - 9} 105" class="eye-line"/>`
    : `<path d="M${x + 9} 87 L${x - 7} 96 L${x + 9} 105" class="eye-line"/>`,
  heart: (x) => `<path d="M${x} 108 C${x - 18} 96 ${x - 13} 78 ${x} 88 C${x + 13} 78 ${x + 18} 96 ${x} 108Z" class="eye"/>`,
  x: (x) => `<path d="M${x - 8} 88 L${x + 8} 104 M${x + 8} 88 L${x - 8} 104" class="eye-line"/>`,
  angry: (x, side) => {
    const brow = side < 0 ? `M${x - 11} 76 L${x + 10} 82` : `M${x + 11} 76 L${x - 10} 82`;
    return `<path d="M${x - 9} 92 h18 a9 10 0 0 1 -18 0z" class="eye"/><path d="${brow}" class="eye-line" style="stroke-width:4"/>`;
  },
};

const MOUTHS = {
  smile: '<path d="M86 126 Q100 138 114 126" class="mouth"/>',
  big: '<path d="M82 122 Q100 148 118 122 Z" class="mouth-fill"/>',
  o: '<ellipse cx="100" cy="131" rx="6" ry="7" class="mouth-fill"/>',
  O: '<ellipse cx="100" cy="132" rx="9" ry="12" class="mouth-fill"/>',
  frown: '<path d="M88 135 Q100 124 112 135" class="mouth"/>',
  flat: '<path d="M90 130 h20" class="mouth"/>',
  wavy: '<path d="M83 130 q4.25 -5 8.5 0 t8.5 0 t8.5 0 t8.5 0" class="mouth"/>',
  chatter: '<path d="M84 126 h32 v8 h-32z" class="mouth-fill" style="stroke-width:2.5"/><path d="M88 126 v8 M94 126 v8 M100 126 v8 M106 126 v8 M112 126 v8" class="mouth" style="stroke-width:1.6"/>',
  tongue: '<path d="M83 122 Q100 140 117 122Z" class="mouth-fill"/><path d="M92 130 q8 26 16 0z" class="tongue"/>',
  cat: '<path d="M87 126 q6.5 8 13 0 q6.5 8 13 0" class="mouth"/>',
  yawn: '<ellipse cx="100" cy="132" rx="10" ry="15" class="mouth-fill"/>',
  smirk: '<path d="M88 131 Q103 136 114 124" class="mouth"/>',
  zz: '<path d="M93 130 q7 -4 14 0" class="mouth"/>',
};

export const EXPR = {
  neutral:   { eyes: 'open',   mouth: 'smile',  color: '#4ff3d6', label: 'tranquilo' },
  happy:     { eyes: 'happy',  mouth: 'big',    color: '#55f7c8', label: 'feliz' },
  love:      { eyes: 'heart',  mouth: 'cat',    color: '#ff6fb5', label: 'enamorado', blush: true },
  excited:   { eyes: 'big',    mouth: 'big',    color: '#ffe066', label: 'emocionado' },
  sleepy:    { eyes: 'half',   mouth: 'o',      color: '#9d8cff', label: 'con sueño' },
  sleeping:  { eyes: 'closed', mouth: 'zz',     color: '#7f72e6', label: 'durmiendo' },
  sad:       { eyes: 'sad',    mouth: 'frown',  color: '#5aa9ff', label: 'triste' },
  hungry:    { eyes: 'big',    mouth: 'wavy',   color: '#ffb347', label: 'con hambre' },
  bored:     { eyes: 'look',   mouth: 'flat',   color: '#9aa4b8', label: 'aburrido' },
  dirty:     { eyes: 'half',   mouth: 'wavy',   color: '#a7c46a', label: 'cochinito' },
  cold:      { eyes: 'squint', mouth: 'chatter',color: '#8fd8ff', label: 'con frío', body: 'shiver' },
  hot:       { eyes: 'half',   mouth: 'tongue', color: '#ff7a45', label: 'acalorado', body: 'hot', blush: true },
  dizzy:     { eyes: 'x',      mouth: 'wavy',   color: '#c58cff', label: 'mareado' },
  surprised: { eyes: 'big',    mouth: 'O',      color: '#7fe9ff', label: 'sorprendido' },
  eating:    { eyes: 'happy',  mouth: 'O',      color: '#ffc46b', label: 'comiendo' },
  grumpy:    { eyes: 'angry',  mouth: 'flat',   color: '#ff8a7a', label: 'gruñón' },
  scared:    { eyes: 'big',    mouth: 'chatter',color: '#b0b8ff', label: 'asustado', body: 'shiver' },
  thinking:  { eyes: 'look',   mouth: 'smirk',  color: '#6fd0ff', label: 'pensando' },
  yawn:      { eyes: 'closed', mouth: 'yawn',   color: '#9d8cff', label: 'bostezando' },
  proud:     { eyes: 'happy',  mouth: 'cat',    color: '#ffd56b', label: 'orgulloso', blush: true },
};

// Llamita: colores de fuego, tamaño según ánimo y etiquetas en femenino
export const LLAMA = {
  neutral:   ['#ff8a3d', 1],    happy:    ['#ffb02e', 1.08], love:     ['#ff5fa2', 1.07],
  excited:   ['#ffd23f', 1.1],  sleepy:   ['#b39cff', .94],  sleeping: ['#8f80f0', .9],
  sad:       ['#5aa9ff', .86],  hungry:   ['#ff9e5e', .96],  bored:    ['#c2a48c', .95],
  dirty:     ['#b5a95a', .97],  cold:     ['#7fd0ff', .84],  hot:      ['#ff3d2e', 1.06],
  dizzy:     ['#c58cff', 1],    surprised:['#ffe58a', 1.05], eating:   ['#ffc46b', 1.03],
  grumpy:    ['#ff4a3a', 1.02], scared:   ['#b0b8ff', .86],  thinking: ['#ffcf6f', 1],
  yawn:      ['#b6a3ff', .95],  proud:    ['#ffd56b', 1.1],
};
const FEM = { tranquilo: 'tranquila', enamorado: 'enamorada', emocionado: 'emocionada', aburrido: 'aburrida',
  cochinito: 'cochinita', acalorado: 'acalorada', mareado: 'mareada', sorprendido: 'sorprendida',
  'gruñón': 'gruñona', asustado: 'asustada', orgulloso: 'orgullosa' };

export class PetView {
  constructor(root) {
    this.root = root; // #app
    this.pet = root.querySelector('#pet');
    this.eyes = root.querySelector('#eyes');
    this.mouth = root.querySelector('#mouth');
    this.moodLabel = root.querySelector('#moodLabel');
    this.ringSegs = root.querySelector('#ringSegs');
    this.current = null;
    this.gaze = { x: 0, y: 0 };
    this.buildRing();
    this.blinkLoop();
  }

  buildRing() {
    const n = 48, cx = 120, cy = 120, r = 102;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r + 9}" class="gold"/><circle cx="${cx}" cy="${cy}" r="${r - 9}" class="gold"/>`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360;
      s += `<rect x="${cx - 3}" y="${cy - r - 6}" width="6" height="12" rx="1.5" transform="rotate(${a} ${cx} ${cy})"/>`;
    }
    this.ringSegs.innerHTML = s;
    this.segs = [...this.ringSegs.querySelectorAll('rect')];
  }

  setRing(pct) {
    const on = Math.round((pct / 100) * this.segs.length);
    this.segs.forEach((el, i) => el.classList.toggle('on', i < on));
  }

  show(name) {
    const e = EXPR[name] || EXPR.neutral;
    if (this.current !== name) {
      this.eyes.innerHTML = `<g class="eyes-in">${EYES[e.eyes](L, -1) + EYES[e.eyes](R, 1)}</g>`;
      this.mouth.innerHTML = MOUTHS[e.mouth];
      this.current = name;
    }
    const llama = this.root.dataset.skin === 'llama';
    const fl = LLAMA[name] || LLAMA.neutral;
    this.root.style.setProperty('--c', llama ? fl[0] : e.color);
    this.root.style.setProperty('--sz', llama ? fl[1] : 1);
    this.pet.classList.toggle('blushing', !!e.blush);
    this.pet.classList.toggle('shiver', e.body === 'shiver');
    this.pet.classList.toggle('hot', e.body === 'hot');
    this.moodLabel.textContent = llama ? (FEM[e.label] || e.label) : e.label;
  }

  acc(id, on) { this.root.querySelector('#acc-' + id)?.classList.toggle('on', !!on); }

  look(x, y) {
    const m = Math.hypot(x, y) || 1;
    const k = Math.min(1, m) * 7;
    this.gaze = { x: (x / m) * k, y: (y / m) * k };
    this.eyes.style.transform = `translate(${this.gaze.x}px, ${this.gaze.y}px)`;
    this.mouth.style.transform = `translate(${this.gaze.x * .5}px, ${this.gaze.y * .4}px)`;
  }

  lookAtPoint(px, py) {
    const r = this.pet.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    this.look((px - cx) / (r.width / 1.5), (py - cy) / (r.height / 1.5));
  }

  anim(cls, ms = 900) {
    this.pet.classList.remove(cls);
    void this.pet.offsetWidth;
    this.pet.classList.add(cls);
    clearTimeout(this['_t' + cls]);
    this['_t' + cls] = setTimeout(() => this.pet.classList.remove(cls), ms);
  }

  blinkLoop() {
    const go = () => {
      const eyesType = EXPR[this.current]?.eyes;
      if (['open', 'big', 'look', 'sad', 'half'].includes(eyesType)) {
        this.pet.classList.add('blink');
        setTimeout(() => this.pet.classList.remove('blink'), 130);
        if (Math.random() < .2) setTimeout(() => { this.pet.classList.add('blink'); setTimeout(() => this.pet.classList.remove('blink'), 120); }, 260);
      }
      setTimeout(go, 2200 + Math.random() * 3800);
    };
    setTimeout(go, 1500);
  }

  center() {
    const r = this.pet.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }
}
