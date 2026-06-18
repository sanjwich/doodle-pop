/* ===========================================================================
   DOODLE POP  —  a tennis-ball bubble shooter starring a grey goldendoodle
   puppy with heterochromia.  Pure Canvas 2D + Web Audio. No dependencies.

   Sibling to Hoppy Pup — the puppy renderer, audio engine, juice helpers and
   responsive loop are lifted from that game and extended here.
   =========================================================================== */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const SQRT3 = Math.sqrt(3);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------------------------------------------------------------------------
  // Canvas + responsive layout (logical 390-wide world, scaled to fit + DPR)
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hintEl = document.getElementById('hint');

  const W = 390;
  let H = Math.round(W * (window.innerHeight / Math.max(1, window.innerWidth)));
  H = clamp(H, 600, 860);

  const GROUND_H = 84;
  let groundY = H - GROUND_H;

  const DPR = clamp(window.devicePixelRatio || 1, 1, 3);

  function layout() {
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ---------------------------------------------------------------------------
  // Audio engine (Web Audio) — created lazily on first user gesture
  // ---------------------------------------------------------------------------
  let actx = null;
  let muted = false;
  let audioReady = false;

  // iOS 16.4+: lets Web Audio play even when the phone's ring/silent switch is on.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    return actx;
  }
  function unlockAudio() {
    const a = audio();
    if (!a) return;
    if (a.state === 'suspended' && a.resume) a.resume();
    if (!audioReady) {
      try {
        const b = a.createBuffer(1, 1, 22050);
        const s = a.createBufferSource();
        s.buffer = b; s.connect(a.destination); s.start(0);
      } catch (e) {}
      if (a.state === 'running') audioReady = true;
    }
  }
  ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, unlockAudio, { passive: true })
  );
  function tone(freq, start, dur, type, vol, freqEnd) {
    const a = audio(); if (!a || muted) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(a.destination);
    o.start(start); o.stop(start + dur + 0.03);
  }
  function noise(t, dur, vol, decay) {
    const a = audio(); if (!a || muted) return;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay || 2);
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(a.destination); s.start(t);
  }

  // Rising-pitch pentatonic chain — the single most important reward signal.
  const PENTA = [0, 2, 4, 7, 9];
  function chainFreq(i) {
    const base = 392; // G4
    const oct = Math.floor(i / 5), step = PENTA[i % 5];
    return base * Math.pow(2, (step + 12 * oct) / 12);
  }
  function playPop(i) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime, f = chainFreq(i);
    tone(f, t, 0.13, 'triangle', 0.22, f * 1.5);
    tone(f * 2, t, 0.06, 'sine', 0.08, f * 2.4);
  }
  function playFire() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(300, t, 0.12, 'square', 0.16, 720);   // boing up
    tone(150, t, 0.10, 'sine', 0.10, 240);
  }
  function playSnap() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(520, t, 0.05, 'sine', 0.10, 380);
    noise(t, 0.04, 0.06, 3);
  }
  function playSqueak() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(900, t, 0.07, 'sine', 0.16, 1700);
    tone(1500, t + 0.06, 0.09, 'sine', 0.16, 800);
  }
  function playBomb() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(160, t, 0.28, 'sine', 0.34, 48);
    noise(t, 0.26, 0.3, 2.2);
  }
  function playServe() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(220, t, 0.26, 'sawtooth', 0.18, 1200);
    noise(t, 0.22, 0.18, 1.6);
  }
  function playGold() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) =>
      tone(660 * Math.pow(2, s / 12), t + i * 0.05, 0.18, 'triangle', 0.18, 660 * Math.pow(2, s / 12) * 1.4));
  }
  function playGulp() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(620, t, 0.07, 'triangle', 0.18, 980);
    tone(300, t + 0.05, 0.08, 'sine', 0.14, 180);
  }
  function playZoomies() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    [0, 3, 5, 7, 10, 12].forEach((s, i) =>
      tone(440 * Math.pow(2, s / 12), t + i * 0.06, 0.16, 'square', 0.13));
  }
  function playClear() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    [0, 4, 7, 12].forEach((s, i) =>
      tone(523 * Math.pow(2, s / 12), t + i * 0.08, 0.22, 'triangle', 0.2));
  }
  function playThud() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(150, t, 0.18, 'sine', 0.18, 50);
    noise(t, 0.14, 0.1, 2.5);
  }
  function playHeart() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(70, t, 0.1, 'sine', 0.22, 45);
    tone(64, t + 0.18, 0.12, 'sine', 0.2, 40);
  }
  function playCoin() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(880, t, 0.05, 'triangle', 0.12, 1320);
  }
  function playBuy() {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime;
    tone(660, t, 0.08, 'triangle', 0.18, 990);
    tone(990, t + 0.07, 0.12, 'triangle', 0.18, 1480);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  const KEY = 'doodlepop.';
  const load = (k, d) => { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} };

  let best = load('best', 0) | 0;
  let treats = load('treats', 0) | 0;
  let unlocks = load('unlocks', {}) || {};      // {itemId:true}
  let equipped = load('equipped', { skin: 'classic', court: 'grass', wear: 'none' });
  muted = load('muted', false);
  let cbMode = load('cb', false);                // colorblind pips
  let streak = load('streak', 0) | 0;
  let lastPlay = load('lastPlay', '');

  // Daily streak: tick once per calendar day, award a small treat bonus.
  let streakBonus = 0;
  (function dailyStreak() {
    const today = new Date();
    const key = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    if (lastPlay !== key) {
      const y = new Date(today.getTime() - 864e5);
      const ykey = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
      streak = (lastPlay === ykey) ? streak + 1 : 1;
      streakBonus = Math.min(10 + streak * 5, 60);
      treats += streakBonus;
      lastPlay = key;
      save('streak', streak); save('lastPlay', lastPlay); save('treats', treats);
    }
  })();

  // ---------------------------------------------------------------------------
  // Tennis-ball colours + specials
  // ---------------------------------------------------------------------------
  // 6 felt colours; brightness deliberately varied (not just hue) for
  // colourblind legibility, each with a distinct pip symbol.
  // Early game uses the first 3 (lime / sky / pink); purple, teal, then red ramp
  // in. Brightness is deliberately varied (not just hue) for colourblind legibility.
  const COLORS = [
    { name: 'lime',   lo: '#bcd62b', hi: '#e9f37b', rim: 'rgba(120,140,30,0.55)', pip: 'circle' },
    { name: 'sky',    lo: '#3f9fe0', hi: '#abe2ff', rim: 'rgba(30,90,150,0.55)',  pip: 'square' },
    { name: 'pink',   lo: '#ff5fa6', hi: '#ffc6e0', rim: 'rgba(150,30,90,0.55)',  pip: 'heart' },
    { name: 'grape',  lo: '#8a4fe0', hi: '#d6b8ff', rim: 'rgba(70,35,130,0.55)',  pip: 'star' },
    { name: 'teal',   lo: '#16b5a6', hi: '#92efe0', rim: 'rgba(15,95,90,0.55)',   pip: 'triangle' },
    { name: 'cherry', lo: '#d32f3a', hi: '#ff9c95', rim: 'rgba(120,20,25,0.55)',  pip: 'cross' },
  ];
  // Specials live in the launch queue (rainbow becomes a board resident; the
  // rest detonate on landing). Obstacles (stone/metal/caged) are board-only.
  const FELT = '#f7f9ee';

  // ---------------------------------------------------------------------------
  // Board geometry (hex grid)
  // ---------------------------------------------------------------------------
  const R = 18;                         // ball radius
  const COLS = 10;                      // cells in an even (top-flush) row
  const PW = COLS * 2 * R;              // 360
  const PX = (W - PW) / 2;              // 15
  const rowH = R * SQRT3;               // vertical row pitch (~31.18)
  const NETY = 40;                      // fence band bottom
  const boardY0 = NETY + R + 6;         // world-Y of row-0 centre
  const launch = { x: W / 2, y: groundY - 28 };
  const dangerY = launch.y - 18;        // lose line, just above the held ball
  const pupBase = { x: W / 2, y: groundY + 18 };

  let rowParity0 = 0;                   // parity of row 0 (flips on each descend)
  let descendAnim = 0;                  // transient smooth-descend offset (<=0)
  const parity = (r) => (rowParity0 + r) & 1;
  const cellCount = (r) => COLS - parity(r);
  const cellX = (r, c) => PX + R + 2 * R * c + (parity(r) ? R : 0);
  const cellY = (r) => boardY0 + r * rowH + descendAnim;

  function neighbors(r, c) {
    const p = parity(r);
    return p === 0
      ? [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]]
      : [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]];
  }

  // grid[r] = array(cellCount(r)) of cell|null.  cell = {kind, color, hp, pop, born}
  // kind: 'ball' | 'rainbow' | 'stone' | 'metal' | 'caged'
  let grid = [];
  const inB = (r, c) => r >= 0 && r < grid.length && c >= 0 && c < grid[r].length;
  const at = (r, c) => (inB(r, c) ? grid[r][c] : null);
  function ensureRow(r) {
    while (grid.length <= r) grid.push(new Array(cellCount(grid.length)).fill(null));
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let scene = 'title';                  // 'title' | 'play' | 'over' | 'shop'
  let paused = false;
  let score = 0, newBest = false;
  let combo = 0, mult = 1;
  let shotsFired = 0;
  let shotsSinceDrop = 0;
  let zoom = 0;                         // ZOOMIES meter 0..1
  let frenzy = 0;                       // frenzy seconds remaining
  let proj = null;                      // flying ball
  let cur = null, nxt = null;           // queue {kind,color}
  let inputLock = false;                // during catch leaps
  let aiming = false;
  const aim = { x: W / 2, y: 100, a: -Math.PI / 2 };
  let fallers = [];                     // detached balls falling (catchable)
  let particles = [];                   // felt puffs
  let coins = [];                       // treat-coin shower
  let pops = [];                        // floating text/score
  let praiseT = 0, praiseTxt = '';
  let runStartTreats = 0;
  let dangerPulse = 0, heartT = 0;
  let zoomiesFlash = 0;
  let clearWiggle = 0;                  // zoomies body-wiggle on board clear

  // juice
  let shake = 0, flash = 0, timeScale = 1;

  // animation clocks
  let animT = 0, runT = 0, fireFlick = 0, aimPose = 0;

  // puppy launcher
  const pup = { lx: 0, ly: 0, sx: 1, sy: 1, leap: null, mood: 0 };

  // difficulty (ramps with shots fired)
  function level() { return 1 + Math.floor(shotsFired / 14); }
  function colorCount() { return clamp(3 + Math.floor(level() / 3), 3, COLORS.length); }
  function dropEvery() { return clamp(7 - Math.floor(level() / 2), 3, 7); }
  function assist() { return level() < 4 ? 2 : level() < 8 ? 1 : 0; }
  function obstacleChance() { return level() < 6 ? 0 : clamp((level() - 6) * 0.02, 0, 0.16); }

  // ---------------------------------------------------------------------------
  // Parallax clouds  (lifted)
  // ---------------------------------------------------------------------------
  const clouds = [];
  function seedClouds() {
    clouds.length = 0;
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 30 + Math.random() * 120,
        s: 0.6 + Math.random() * 0.8,
        spd: 0.12 + Math.random() * 0.18,
      });
    }
  }
  seedClouds();
  function moveClouds(dx) {
    for (const c of clouds) {
      c.x -= dx * c.spd;
      if (c.x < -70 * c.s) { c.x = W + 70 * c.s; c.y = 30 + Math.random() * 120; }
    }
  }

  // ---------------------------------------------------------------------------
  // Curly-fur texture + goldendoodle palette  (lifted from Hoppy Pup)
  // ---------------------------------------------------------------------------
  function mkRng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function genCurls(n, seed) {
    const r = mkRng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const ang = r() * TAU, rad = Math.sqrt(r()) * 0.95;
      out.push({ dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad, r: 2.0 + r() * 1.6, shade: r() > 0.5 });
    }
    return out;
  }
  const BODY_CURLS = genCurls(11, 7);
  const HEAD_CURLS = genCurls(9, 23);
  const TAIL_CURLS = genCurls(8, 41);
  const MUZZLE_FUR = genCurls(16, 53);

  const C = {
    base: '#524e47', light: '#7d7770', dark: '#2b2722',
    ear: '#241f19', earDark: '#18140f',
    cream: '#c9bc9f',
    tan: '#b3854b', tanDark: '#916a33',
    nose: '#161312', mouth: '#241c17',
    iris1: '#b9802b', iris1Rim: '#6f4514',
    iris2: '#8cb4cb', iris2Rim: '#557e98',
    iris2Sector: '#6f3c24',
    sclera: '#efe9df',
    tongue: '#e87f95',
  };

  function fluffBlob(cx, cy, rx, ry, fill, wob = 0.12, freq = 7) {
    ctx.beginPath();
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const w = 1 + wob * Math.sin(a * freq) + wob * 0.55 * Math.sin(a * (freq - 3) + 1.3);
      const x = cx + Math.cos(a) * rx * w;
      const y = cy + Math.sin(a) * ry * w;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function drawCurls(cx, cy, rx, ry, pts) {
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(cx + p.dx * rx, cy + p.dy * ry, p.r, 0, TAU);
      ctx.fillStyle = p.shade ? C.dark : C.light;
      ctx.globalAlpha = 0.3;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawEar(ax, ay, angle, len, w, near) {
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    fluffBlob(0, len * 0.5, w, len * 0.5, near ? C.ear : C.earDark, 0.16, 6);
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc((i % 2 ? 1 : -1) * w * 0.4, len * (0.25 + i * 0.18), 2.6, 0, TAU);
      ctx.fillStyle = C.earDark; ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawLeg(hipX, hipY, phase, near) {
    const swing = Math.sin(phase) * 0.4;
    const len = 13;
    const kx = hipX + Math.sin(swing) * 6;
    const ky = hipY + Math.cos(swing) * len;
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.fillStyle = C.base;
    ctx.beginPath();
    ctx.ellipse(kx + 2, ky + 1, 6, 4.2, 0, 0, TAU);
    ctx.fill();
  }

  // The launcher pup. opts: {lookX,lookY, curColor, nxtColor, curSp, nxtSp, worried}
  function drawPuppy(opts) {
    opts = opts || {};
    const wag = opts.wag || 1;
    const alert = opts.alert || 0;     // 0..1 — "locked on a target" aiming pose
    // ----- TAIL (wags normally; raises & stiffens when locked on a target) -----
    ctx.save();
    ctx.translate(-23, -2);
    ctx.rotate(Math.sin(animT * 9 * wag) * (0.35 * wag * (1 - alert * 0.7)) - 0.5 - alert * 0.34);
    fluffBlob(-4, 0, 8, 7, C.base, 0.18, 6);
    drawCurls(-4, 0, 8, 7, TAIL_CURLS);
    ctx.restore();

    drawLeg(-12, 13, runT + Math.PI, false);
    drawLeg(-6, 14, runT + Math.PI * 0.6, false);
    drawEar(20, -16, 0.5 + Math.sin(animT * 8) * 0.12 - (opts.worried ? 0.5 : 0) - alert * 0.5, 24, 8, false);

    // ----- BODY -----
    fluffBlob(0, 2, 22, 14, C.base, 0.06, 7);
    ctx.globalAlpha = 0.4; fluffBlob(-6, -4, 14, 6, C.ear, 0.14, 7); ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.18; fluffBlob(2, 9, 13, 4, C.dark, 0.1, 6); ctx.globalAlpha = 1;
    drawCurls(0, 2, 22, 14, BODY_CURLS);

    // bandana cosmetic (around the neck, under the head)
    if (opts.wear === 'bandana') {
      ctx.save();
      ctx.fillStyle = '#e0444f';
      ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(20, 6); ctx.lineTo(13, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8323c';
      ctx.fillRect(4, 4, 18, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(9 + i * 4, 12 + (i % 2) * 3, 1.1, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    drawLeg(10, 15, runT, true);
    drawLeg(16, 15, runT + Math.PI * 0.5, true);

    // ----- HEAD -----
    const hx = 21, hy = -7;
    fluffBlob(hx, hy, 17, 16, C.base, 0.06, 8);
    ctx.globalAlpha = 0.6; fluffBlob(hx - 1, hy - 7, 13, 7, C.ear, 0.06, 8); ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.4; fluffBlob(hx - 4, hy - 6, 7, 4.5, C.light, 0.12, 6); ctx.globalAlpha = 1;
    drawCurls(hx, hy, 17, 16, HEAD_CURLS);
    fluffBlob(hx + 9, hy + 12, 9, 6, C.base, 0.18, 6);
    ctx.globalAlpha = 0.55; fluffBlob(hx + 7, hy + 15, 6.5, 4, C.dark, 0.22, 6); ctx.globalAlpha = 1;

    // visor cosmetic (sun visor on the forehead — keeps the eyes visible)
    if (opts.wear === 'visor') {
      ctx.save();
      ctx.fillStyle = '#2fb36b';
      ctx.beginPath(); ctx.ellipse(hx + 12, hy - 9, 16, 5, -0.15, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#23985a';
      ctx.fillRect(hx - 4, hy - 12, 26, 4);
      ctx.restore();
    }

    drawEar(hx - 6, hy - 12, -0.35 + Math.sin(animT * 8) * 0.14 - (opts.worried ? -0.4 : 0) - alert * 0.42, 28, 9, true);

    // ----- MUZZLE -----
    fluffBlob(hx + 13, hy + 4, 12, 9.2, C.base, 0.12, 7);
    ctx.globalAlpha = 0.45; ctx.fillStyle = C.dark;
    ctx.beginPath(); ctx.ellipse(hx + 13, hy + 8, 11, 4.5, -0.1, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    for (const p of MUZZLE_FUR) {
      ctx.beginPath();
      ctx.arc(hx + 13 + p.dx * 11, hy + 4 + p.dy * 8, p.r * 0.8, 0, TAU);
      ctx.fillStyle = p.shade ? C.dark : C.light;
      ctx.globalAlpha = 0.4; ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = C.mouth; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx + 12, hy + 8);
    ctx.quadraticCurveTo(hx + 19, hy + 11, hx + 24, hy + 8);
    ctx.stroke();

    const tongueOut = 2 + Math.max(0, Math.sin(runT)) * 2 + fireFlick * 3;
    ctx.fillStyle = C.tongue;
    ctx.beginPath();
    ctx.ellipse(hx + 20, hy + 10 + tongueOut * 0.4, 3.2, tongueOut, 0.1, 0, TAU);
    ctx.fill();

    ctx.fillStyle = C.nose;
    ctx.beginPath(); ctx.ellipse(hx + 24, hy + 2, 4.2, 3.4, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(hx + 23, hy + 0.5, 1.4, 1, 0, 0, TAU); ctx.fill();

    // ----- BROWS + EYES (heterochromia; eyes preview the ball queue) -----
    const bw = opts.worried ? 0.28 : 0;
    drawBrow(hx + 6, hy - 7.5 + (opts.worried ? 2 : 0), -0.24 + bw);
    drawBrow(hx + 15, hy - 8.5 + (opts.worried ? 2 : 0), -0.12 - bw);
    const lx = opts.lookX || 0, ly = opts.lookY || 0;
    drawEye(hx + 7, hy - 3, 4.0, C.iris1, C.iris1Rim, null, lx, ly, opts.curColor, opts.curSp);
    drawEye(hx + 16, hy - 4, 3.7, C.iris2, C.iris2Rim, C.iris2Sector, lx, ly, opts.nxtColor, opts.nxtSp);

    ctx.fillStyle = 'rgba(244,150,160,0.35)';
    ctx.beginPath(); ctx.ellipse(hx + 4, hy + 6, 4, 3, 0, 0, TAU); ctx.fill();
  }

  function drawEye(x, y, r, iris, rim, sector, lx, ly, glint, sparkle) {
    ctx.save();
    const ry = r * 0.82;
    ctx.fillStyle = C.sclera;
    ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU); ctx.fill();
    const ir = r * 0.66, ox = (lx || 0) * r * 0.32, oy = (ly || 0) * r * 0.26;
    const ix = x + ox, iy = y - r * 0.03 + oy;
    ctx.save();
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.clip();
    ctx.fillStyle = iris;
    ctx.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);
    if (sector) { ctx.fillStyle = sector; ctx.fillRect(ix - ir, iy - ir, ir * 2, ir); }
    ctx.globalAlpha = 0.4; ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(ix, iy + ir * 0.6, ir * 0.95, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(18,10,5,0.55)';
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#0a0603';
    ctx.beginPath(); ctx.arc(ix, iy, ir * 0.5, 0, TAU); ctx.fill();
    // coloured reflected-ball glint = the queued ball colour
    if (glint) {
      ctx.fillStyle = glint;
      ctx.beginPath(); ctx.arc(ix - ir * 0.34, iy - ir * 0.36, ir * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(ix - ir * 0.5, iy - ir * 0.5, ir * 0.16, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(ix - ir * 0.3, iy - ir * 0.32, ir * 0.24, 0, TAU); ctx.fill();
    }
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU); ctx.clip();
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y - ry * 0.98, r * 1.1, ry * 0.42, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 1.0; ctx.strokeStyle = '#1c130c';
    ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    // special loaded → starburst over the eye
    if (sparkle) drawSparkle(x, y - 1, 4 + 2 * Math.abs(Math.sin(animT * 6)), 1);
  }

  function drawBrow(bx, by, ang) {
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(ang);
    fluffBlob(0, 0, 6.2, 2.7, C.ear, 0.3, 5);
    fluffBlob(-1, -0.5, 4.4, 1.9, C.earDark, 0.28, 5);
    ctx.globalAlpha = 0.4; ctx.fillStyle = C.base;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 2.7, 0.2, 0.95, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Tennis ball renderer (recoloured per game colour; specials overlaid)
  // ---------------------------------------------------------------------------
  function drawTennisBall(cx, cy, r, cell, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    const kind = cell && cell.kind;
    if (kind === 'rainbow') { drawRainbow(r); ctx.restore(); return; }
    if (kind === 'stone') { drawStone(r, cell); ctx.restore(); return; }
    if (kind === 'metal') { drawMetal(r); ctx.restore(); return; }

    const col = (cell && cell.color != null) ? COLORS[cell.color] : COLORS[0];
    const skin = equipped.skin || 'classic';
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.25, 0, 0, r * 1.1);
    g.addColorStop(0, col.hi);
    g.addColorStop(1, col.lo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = col.rim;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();

    // the white S-seam (on every ball)
    ctx.strokeStyle = skin === 'neon' ? '#ffffff' : FELT;
    ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
    if (skin === 'glitter') { ctx.shadowColor = '#fff'; ctx.shadowBlur = 4; }
    ctx.beginPath();
    ctx.moveTo(-r * 0.04, -r * 0.93);
    ctx.bezierCurveTo(r * 0.62, -r * 0.5, -r * 0.62, r * 0.5, r * 0.04, r * 0.93);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (skin === 'neon') {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = col.hi; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }

    if (kind === 'caged') drawCage(r);

    // colourblind pip
    if (cbMode && cell && cell.color != null) drawPip(col.pip, r);
    ctx.restore();
  }
  function drawPip(kind, r) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(20,20,20,0.78)';
    ctx.strokeStyle = 'rgba(20,20,20,0.78)';
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const s = r * 0.42;
    ctx.beginPath();
    if (kind === 'circle') { ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.fill(); }
    else if (kind === 'square') { ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4); }
    else if (kind === 'triangle') { ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7); ctx.closePath(); ctx.fill(); }
    else if (kind === 'cross') { ctx.lineWidth = s * 0.7; ctx.moveTo(-s * 0.7, -s * 0.7); ctx.lineTo(s * 0.7, s * 0.7); ctx.moveTo(s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.7, s * 0.7); ctx.stroke(); }
    else if (kind === 'star') { star(0, 0, 5, s, s * 0.45); ctx.fill(); }
    else if (kind === 'heart') { heart(0, -s * 0.2, s); ctx.fill(); }
    ctx.restore();
  }
  function star(cx, cy, n, ro, ri) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU - Math.PI / 2, rr = i % 2 ? ri : ro;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function heart(cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.7);
    ctx.bezierCurveTo(cx + s, cy - s * 0.2, cx + s * 0.4, cy - s, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx - s * 0.4, cy - s, cx - s, cy - s * 0.2, cx, cy + s * 0.7);
    ctx.closePath();
  }
  function drawRainbow(r) {
    const cols = ['#ff5d5d', '#ffa23d', '#ffe23d', '#52d96a', '#46a6ff', '#9b5cff'];
    for (let i = 0; i < cols.length; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (i / cols.length) * TAU - 1.2, ((i + 1) / cols.length) * TAU - 1.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = FELT; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.04, -r * 0.93);
    ctx.bezierCurveTo(r * 0.62, -r * 0.5, -r * 0.62, r * 0.5, r * 0.04, r * 0.93);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.34, r * 0.18, 0, TAU); ctx.fill();
  }
  function drawStone(r, cell) {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.1);
    g.addColorStop(0, '#9a9a9a'); g.addColorStop(1, '#5c5c5c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.2); ctx.lineTo(r * 0.1, r * 0.1); ctx.lineTo(-r * 0.1, r * 0.5); ctx.stroke();
    if (cell && cell.hp === 1) { // cracked
      ctx.strokeStyle = 'rgba(20,20,20,0.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * 0.2, -r * 0.1); ctx.lineTo(-r * 0.2, r * 0.3); ctx.lineTo(r * 0.1, r * 0.8); ctx.stroke();
    }
  }
  function drawMetal(r) {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#e8edf2'); g.addColorStop(0.5, '#9fb0bd'); g.addColorStop(1, '#6b7d8c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#48565f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#566570';
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 1.4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.3, r * 0.16, -0.6, 0, TAU); ctx.fill();
  }
  function drawCage(r) {
    ctx.strokeStyle = 'rgba(60,50,40,0.85)'; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.5, -r * 0.86); ctx.lineTo(i * r * 0.5, r * 0.86); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.86, i * r * 0.5); ctx.lineTo(r * 0.86, i * r * 0.5); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Juice helpers  (lifted)
  // ---------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function textC(str, x, y, size, fill, stroke, weight) {
    ctx.font = `${weight || 800} ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = size * 0.18; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }
  function drawSparkle(x, y, s, a) {
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = '#fffdf0';
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawShinyTitle(text, cx, y, size) {
    ctx.save();
    ctx.font = `800 ${size}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const left = cx - w / 2, right = cx + w / 2;
    ctx.fillStyle = 'rgba(20,55,85,0.28)';
    ctx.fillText(text, cx + 2, y + 3);
    ctx.lineWidth = size * 0.17; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a6f9e';
    ctx.strokeText(text, cx, y);
    const baseG = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
    baseG.addColorStop(0, '#ffffff');
    baseG.addColorStop(0.5, '#ecf7ff');
    baseG.addColorStop(0.5, '#cfeaff');
    baseG.addColorStop(1, '#a9d8f5');
    ctx.fillStyle = baseG;
    ctx.fillText(text, cx, y);
    const sweep = ((animT * 0.6) % 2.6) - 0.4;
    const b = clamp(sweep, 0, 1);
    if (b > 0.02 && b < 0.98) {
      const a = clamp(sweep - 0.13, 0, 1), c = clamp(sweep + 0.13, 0, 1);
      const glint = ctx.createLinearGradient(left, 0, right, 0);
      glint.addColorStop(a, 'rgba(255,255,255,0)');
      glint.addColorStop(b, 'rgba(255,255,255,0.92)');
      glint.addColorStop(c, 'rgba(255,255,255,0)');
      ctx.fillStyle = glint;
      ctx.fillText(text, cx, y);
    }
    ctx.restore();
    const tw = (ph) => Math.max(0, Math.sin(animT * 3 + ph));
    drawSparkle(right + 9, y - size * 0.34, 3.5 + 4 * tw(0), tw(0));
    drawSparkle(left - 9, y + size * 0.30, 3 + 3 * tw(2.1), tw(2.1));
    drawSparkle(cx + w * 0.16, y - size * 0.52, 2.5 + 2.5 * tw(4.2), tw(4.2));
  }

  // ---------------------------------------------------------------------------
  // Background — sunny backyard tennis court
  // ---------------------------------------------------------------------------
  const COURTS = {
    grass:  { skyT: '#7fd0f4', skyM: '#bfeaf0', skyB: '#cdeeb6', court: '#5fae3f', courtD: '#4f9434', line: '#eef7e6' },
    clay:   { skyT: '#f4c98b', skyM: '#f7dcae', skyB: '#e8b483', court: '#c8643c', courtD: '#a84e2c', line: '#f6e2cf' },
    night:  { skyT: '#1d2a44', skyM: '#2a3c63', skyB: '#33507a', court: '#2f6f54', courtD: '#225640', line: '#bfe6d6' },
    beach:  { skyT: '#62c6e8', skyM: '#9fe2ea', skyB: '#f2dca0', court: '#4aa6c8', courtD: '#3a86a8', line: '#eaf6fb' },
  };
  function court() { return COURTS[equipped.court] || COURTS.grass; }

  function drawBackground() {
    const t = court();
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, t.skyT); sky.addColorStop(0.55, t.skyM); sky.addColorStop(1, t.skyB);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // sun
    const sunCol = equipped.court === 'night' ? 'rgba(245,245,220,' : 'rgba(255,241,186,';
    ctx.fillStyle = sunCol + '0.5)';
    ctx.beginPath(); ctx.arc(W - 60, 70, 38, 0, TAU); ctx.fill();
    ctx.fillStyle = sunCol + '0.9)';
    ctx.beginPath(); ctx.arc(W - 60, 70, 24, 0, TAU); ctx.fill();

    for (const c of clouds) drawCloud(c.x, c.y, c.s);

    drawGround(t);
    drawHopper();
    drawNet();
  }
  function drawCloud(x, y, s) {
    const g = ctx.createLinearGradient(0, y - 18 * s, 0, y + 14 * s);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(232,240,255,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * s, 16 * s, 0, 0, TAU);
    ctx.ellipse(x + 20 * s, y + 4 * s, 20 * s, 13 * s, 0, 0, TAU);
    ctx.ellipse(x - 20 * s, y + 5 * s, 18 * s, 12 * s, 0, 0, TAU);
    ctx.ellipse(x + 4 * s, y - 8 * s, 16 * s, 12 * s, 0, 0, TAU);
    ctx.fill();
  }
  function drawGround(t) {
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, t.court); g.addColorStop(1, t.courtD);
    ctx.fillStyle = g; ctx.fillRect(0, groundY, W, GROUND_H);
    // court lines (perspective-ish)
    ctx.strokeStyle = t.line; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, groundY + 3); ctx.lineTo(W, groundY + 3); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(W / 2 - 60, groundY + 8); ctx.lineTo(W / 2 - 110, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + 60, groundY + 8); ctx.lineTo(W / 2 + 110, H); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawHopper() {
    // wire ball-hopper prop sitting on the court, lower-left
    const x = 34, y = groundY + 6;
    ctx.save();
    ctx.strokeStyle = 'rgba(60,60,70,0.7)'; ctx.lineWidth = 2;
    roundRect(x - 16, y, 32, 30, 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,60,70,0.45)'; ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 6, y); ctx.lineTo(x + i * 6, y + 30); ctx.stroke(); }
    for (let j = 1; j < 5; j++) { ctx.beginPath(); ctx.moveTo(x - 16, y + j * 6); ctx.lineTo(x + 16, y + j * 6); ctx.stroke(); }
    // a few balls peeking out the top
    drawTennisBall(x - 7, y - 2, 7, { kind: 'ball', color: 0 });
    drawTennisBall(x + 7, y - 3, 7, { kind: 'ball', color: 0 });
    drawTennisBall(x, y - 8, 7, { kind: 'ball', color: 0 });
    ctx.restore();
  }
  function drawNet() {
    // chain-link fence / net the grid hangs from
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, NETY);
    ctx.strokeStyle = 'rgba(70,90,110,0.5)'; ctx.lineWidth = 1.2;
    const m = 11;
    for (let x = -NETY; x < W + NETY; x += m) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + NETY, NETY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + NETY, 0); ctx.lineTo(x, NETY); ctx.stroke();
    }
    // top rail + posts
    ctx.fillStyle = '#6b7a86'; ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = '#55636e';
    ctx.fillRect(8, 0, 6, NETY); ctx.fillRect(W - 14, 0, 6, NETY); ctx.fillRect(W / 2 - 3, 0, 6, NETY);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Ball queue / spawning
  // ---------------------------------------------------------------------------
  function activeColors() {
    // restrict to colours currently present on the board (so you can always
    // clear), padded up to the difficulty's colour count.
    const present = new Set();
    for (const row of grid) for (const cell of row) if (cell && cell.kind === 'ball' && cell.color != null) present.add(cell.color);
    let pool = [...present];
    if (pool.length === 0) { for (let i = 0; i < colorCount(); i++) pool.push(i); }
    return pool;
  }
  function randColor() {
    const pool = activeColors();
    return pool[(Math.random() * pool.length) | 0];
  }
  function makeQueueBall(allowSpecial) {
    if (frenzy > 0) return { kind: 'rainbow' };
    if (allowSpecial) {
      const r = Math.random();
      if (r < 0.012) return { kind: 'gold' };
      if (r < 0.045) return { kind: 'rainbow' };
      if (r < 0.075) return { kind: 'bomb' };
      if (r < 0.10) return { kind: 'serve' };
    }
    return { kind: 'ball', color: randColor() };
  }
  function refillQueue() {
    cur = nxt || makeQueueBall(false);
    nxt = makeQueueBall(shotsFired > 2);
  }

  function makeRow(r, forceFull) {
    const len = cellCount(r);
    const row = new Array(len).fill(null);
    const cc = colorCount();
    const oc = obstacleChance();
    for (let c = 0; c < len; c++) {
      if (!forceFull && Math.random() < 0.12) continue;     // small gaps
      const r = Math.random();
      if (r < oc * 0.4) row[c] = { kind: 'stone', hp: 2 };
      else if (r < oc * 0.6) row[c] = { kind: 'metal' };
      else if (r < oc) row[c] = { kind: 'caged', color: (Math.random() * cc) | 0 };
      else row[c] = { kind: 'ball', color: (Math.random() * cc) | 0 };
    }
    // never spawn a fully empty row
    if (row.every((x) => x == null)) row[(len / 2) | 0] = { kind: 'ball', color: (Math.random() * cc) | 0 };
    return row;
  }

  // ---------------------------------------------------------------------------
  // Aim / trajectory preview
  // ---------------------------------------------------------------------------
  function setAimFromPoint(px, py) {
    let dx = px - launch.x, dy = py - launch.y;
    let a = Math.atan2(dy, dx);
    // clamp to an upward cone (never shoot straight down/sideways-down)
    const minA = -Math.PI + 0.18, maxA = -0.18;
    if (a > maxA && a < Math.PI / 2) a = maxA;
    else if (a >= Math.PI / 2 || a < minA) a = minA;
    a = clamp(a, -Math.PI + 0.18, -0.18);
    aim.a = a; aim.x = px; aim.y = py;
  }
  function ballAt(x, y, rad) {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        const dx = x - cellX(r, c), dy = y - cellY(r);
        if (dx * dx + dy * dy < rad * rad) return { r, c };
      }
    }
    return null;
  }
  function simulateAim(maxBounce) {
    const pts = [{ x: launch.x, y: launch.y }];
    let x = launch.x, y = launch.y;
    let vx = Math.cos(aim.a), vy = Math.sin(aim.a);
    const lo = PX + R, hi = PX + PW - R, step = 4;
    let bounces = 0, hit = null;
    for (let i = 0; i < 600; i++) {
      x += vx * step; y += vy * step;
      if (x < lo) { x = lo; vx = -vx; bounces++; pts.push({ x, y }); }
      else if (x > hi) { x = hi; vx = -vx; bounces++; pts.push({ x, y }); }
      if (y - R <= cellY(0) - R + 1) { hit = { x, y, ceiling: true }; break; }
      const b = ballAt(x, y, 2 * R * 0.92);
      if (b) { hit = { x, y, cell: b }; break; }
      if (bounces > maxBounce + 2 || y > groundY) break;
    }
    pts.push({ x, y });
    return { pts, hit };
  }
  function drawAim() {
    if (!cur || proj || inputLock) return;
    const a = assist();
    const pts = simulateAim(3).pts;
    // Dotted aim line shows your DIRECTION and the first wall bank — but not
    // where the ball lands; judging that is the skill. The line shortens as the
    // difficulty ramps. (No landing ghost.)
    const maxLen = a >= 2 ? 430 : a >= 1 ? 320 : 230;
    ctx.save();
    ctx.strokeStyle = frenzy > 0 ? 'rgba(255,240,150,0.9)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.setLineDash([2, 11]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1].x, y0 = pts[i - 1].y;
      let x1 = pts[i].x, y1 = pts[i].y;
      const seg = Math.hypot(x1 - x0, y1 - y0) || 0.0001;
      if (acc + seg > maxLen) {
        const t = (maxLen - acc) / seg;
        ctx.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        break;
      }
      ctx.lineTo(x1, y1);
      acc += seg;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Fire / projectile
  // ---------------------------------------------------------------------------
  function fire() {
    if (!cur || proj || inputLock || scene !== 'play') return;
    const speed = 9.2;
    proj = { x: launch.x, y: launch.y, vx: Math.cos(aim.a) * speed, vy: Math.sin(aim.a) * speed, ball: cur };
    fireFlick = 1;
    playFire();
    cur = nxt;
    nxt = makeQueueBall(shotsFired > 2);
    shotsFired++;
    aiming = false;
    hintEl.classList.add('hidden');
  }
  function stepProjectile() {
    if (!proj) return;
    const lo = PX + R, hi = PX + PW - R;
    const sub = 4;
    for (let s = 0; s < sub; s++) {
      proj.x += proj.vx / sub; proj.y += proj.vy / sub;
      if (proj.x < lo) { proj.x = lo; proj.vx = -proj.vx; playSnap(); }
      else if (proj.x > hi) { proj.x = hi; proj.vx = -proj.vx; playSnap(); }
      if (proj.y - R <= cellY(0) - R + 1) { snapProjectile(true); return; }
      const b = ballAt(proj.x, proj.y, 2 * R * 0.9);
      if (b) { snapProjectile(false); return; }
    }
  }
  // Pure (no grid mutation) — safe to call from the aim preview too.
  function snapCell(x, y) {
    let r = Math.round((y - (boardY0 + descendAnim)) / rowH);
    r = Math.max(0, r);
    let c = Math.round((x - PX - R - (parity(r) ? R : 0)) / (2 * R));
    c = clamp(c, 0, cellCount(r) - 1);
    if (!at(r, c)) return { r, c };
    // occupied → pick nearest empty among a small neighbourhood
    let bestD = Infinity, best = null;
    for (let dr = -1; dr <= 2; dr++) {
      const rr = r + dr; if (rr < 0) continue;
      for (let cc = 0; cc < cellCount(rr); cc++) {
        if (at(rr, cc)) continue;
        const dx = x - cellX(rr, cc), dy = y - cellY(rr);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { r: rr, c: cc }; }
      }
    }
    return best || { r, c };
  }
  function snapProjectile(ceiling) {
    const ball = proj.ball;
    const sc = snapCell(proj.x, proj.y);
    proj = null;
    if (!sc) { afterShot(false); return; }
    const { r, c } = sc;
    ensureRow(r);
    playSnap();
    shake = Math.max(shake, 3);

    // specials that detonate on contact (not residents)
    if (ball.kind === 'bomb') { detonateBomb(r, c); afterShot(true); return; }
    if (ball.kind === 'serve') { flamingServe(c); afterShot(true); return; }
    if (ball.kind === 'gold') { goldJackpot(r, c); afterShot(true); return; }

    // resident ball (normal or rainbow wildcard)
    grid[r][c] = (ball.kind === 'rainbow') ? { kind: 'rainbow' } : { kind: 'ball', color: ball.color };
    grid[r][c].land = animT;   // trigger the landing squash-pop

    const group = matchGroup(r, c);
    if (group.length >= 3) {
      popCells(group, cellX(r, c), cellY(r));
      const dropped = detachFloaters();
      afterShot(true, group.length, dropped);
    } else {
      // settle the rainbow to a colour so it can be matched later
      if (grid[r][c].kind === 'rainbow') { /* stays wild, fine */ }
      loseCheck();
      afterShot(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Matching + detaching
  // ---------------------------------------------------------------------------
  function matchColorOf(r, c) {
    const cell = grid[r][c];
    if (cell.kind === 'ball') return cell.color;
    if (cell.kind === 'rainbow') {
      // adopt the most common matchable neighbour colour
      const tally = {};
      for (const [nr, nc] of neighbors(r, c)) {
        const n = at(nr, nc);
        if (n && n.kind === 'ball') tally[n.color] = (tally[n.color] || 0) + 1;
      }
      let bestK = null, bestV = 0;
      for (const k in tally) if (tally[k] > bestV) { bestV = tally[k]; bestK = +k; }
      return bestK;
    }
    return null;
  }
  function canMatch(cell, color) {
    if (!cell) return false;
    if (cell.kind === 'rainbow') return true;
    return cell.kind === 'ball' && cell.color === color;
  }
  function matchGroup(r, c) {
    const color = matchColorOf(r, c);
    const seen = new Set(), out = [];
    const id = (a, b) => a + ',' + b;
    const stack = [[r, c]]; seen.add(id(r, c));
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const cell = at(cr, cc);
      if (!cell) continue;
      // rainbow with no resolvable colour still groups by adjacency-to-wild
      if (color == null) { if (cell.kind === 'rainbow') out.push([cr, cc]); continue; }
      if (!canMatch(cell, color)) continue;
      out.push([cr, cc]);
      for (const [nr, nc] of neighbors(cr, cc)) {
        if (!inB(nr, nc) || seen.has(id(nr, nc))) continue;
        const n = at(nr, nc);
        if (n && canMatch(n, color)) { seen.add(id(nr, nc)); stack.push([nr, nc]); }
      }
    }
    return out;
  }

  function popCells(cells, fx, fy) {
    const n = cells.length;
    combo++;
    const gain = Math.round(n * 10 * mult * (frenzy > 0 ? 2 : 1));
    score += gain;

    // rising-pitch chain + felt-puff pops, staggered slightly by distance
    cells.sort((a, b) => {
      const da = (cellX(a[0], a[1]) - fx) ** 2 + (cellY(a[0]) - fy) ** 2;
      const db = (cellX(b[0], b[1]) - fx) ** 2 + (cellY(b[0]) - fy) ** 2;
      return da - db;
    });
    for (let i = 0; i < cells.length; i++) {
      const [r, c] = cells[i];
      const cell = grid[r][c];
      const colObj = cell && cell.color != null ? COLORS[cell.color] : COLORS[0];
      spawnPuff(cellX(r, c), cellY(r), colObj);
      playPop(i);
      grid[r][c] = null;
      // obstacle reactions to an adjacent pop
      reactNeighbors(r, c);
    }
    pops.push({ x: fx, y: fy - 6, t: 1, txt: '+' + gain, size: 18, col: '#fff', stroke: 'rgba(60,90,40,0.85)' });

    // juice scales with cluster size
    shake = Math.max(shake, clamp(4 + n, 4, 16));
    flash = Math.max(flash, clamp(n * 0.04, 0, 0.4));
    timeScale = Math.min(timeScale, clamp(1 - n * 0.05, 0.45, 1));
    addZoom(0.05 + n * 0.025);

    praise(n, combo);
  }
  function reactNeighbors(r, c) {
    for (const [nr, nc] of neighbors(r, c)) {
      const n = at(nr, nc);
      if (!n) continue;
      if (n.kind === 'caged') { n.kind = 'ball'; spawnPuff(cellX(nr, nc), cellY(nr), COLORS[n.color || 0]); }
      else if (n.kind === 'stone') { n.hp--; if (n.hp <= 0) { grid[nr][nc] = null; spawnPuff(cellX(nr, nc), cellY(nr), { hi: '#aaa', lo: '#777' }); } }
    }
  }

  function detachFloaters() {
    const reach = new Set();
    const id = (a, b) => a + ',' + b;
    const stack = [];
    if (grid[0]) for (let c = 0; c < grid[0].length; c++) if (grid[0][c]) { stack.push([0, c]); reach.add(id(0, c)); }
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [nr, nc] of neighbors(r, c)) {
        if (!inB(nr, nc) || reach.has(id(nr, nc))) continue;
        if (grid[nr][nc]) { reach.add(id(nr, nc)); stack.push([nr, nc]); }
      }
    }
    let dropped = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] && !reach.has(id(r, c))) {
          const cell = grid[r][c];
          grid[r][c] = null;
          fallers.push({
            x: cellX(r, c), y: cellY(r),
            vx: (Math.random() - 0.5) * 1.4, vy: 0.5 + Math.random() * 0.5,
            cell, caught: false, t: 0,
          });
          dropped++;
        }
      }
    }
    trimGrid();
    return dropped;
  }
  function trimGrid() {
    while (grid.length && grid[grid.length - 1].every((x) => x == null)) grid.pop();
  }

  // ---------------------------------------------------------------------------
  // Specials on landing
  // ---------------------------------------------------------------------------
  function detonateBomb(r, c) {
    playBomb();
    shake = Math.max(shake, 14); flash = Math.max(flash, 0.4); timeScale = 0.5;
    const rad = 2; // hex rings
    const hitSet = ringCells(r, c, rad);
    combo++;
    let cleared = 0;
    for (const [rr, cc] of hitSet) {
      const cell = at(rr, cc);
      if (!cell) continue;
      if (cell.kind === 'metal') continue;
      spawnPuff(cellX(rr, cc), cellY(rr), cell.color != null ? COLORS[cell.color] : { hi: '#ddd', lo: '#999' });
      grid[rr][cc] = null; cleared++;
    }
    score += cleared * 15 * mult;
    pops.push({ x: cellX(r, c), y: cellY(r), t: 1, txt: 'BOOM', size: 22, col: '#ffd24d', stroke: 'rgba(120,60,0,0.8)' });
    addZoom(0.25);
    const dropped = detachFloaters();
    afterDrops(dropped);
  }
  function ringCells(r, c, rad) {
    const out = [[r, c]];
    let frontier = [[r, c]]; const seen = new Set([r + ',' + c]);
    for (let d = 0; d < rad; d++) {
      const next = [];
      for (const [cr, cc] of frontier) for (const [nr, nc] of neighbors(cr, cc)) {
        const k = nr + ',' + nc;
        if (nr < 0 || seen.has(k)) continue; seen.add(k);
        out.push([nr, nc]); next.push([nr, nc]);
      }
      frontier = next;
    }
    return out;
  }
  function flamingServe(c) {
    playServe();
    shake = Math.max(shake, 12); flash = Math.max(flash, 0.35);
    combo++;
    let cleared = 0;
    for (let r = 0; r < grid.length; r++) {
      const cc = clamp(c, 0, grid[r].length - 1);
      const cell = grid[r][cc];
      if (cell && cell.kind !== 'metal') {
        spawnPuff(cellX(r, cc), cellY(r), cell.color != null ? COLORS[cell.color] : { hi: '#ffb36b', lo: '#ff6a2b' });
        // a flame flourish
        for (let k = 0; k < 3; k++) particles.push({ x: cellX(r, cc), y: cellY(r), vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, life: 1, col: ['#ff6a2b', '#ffd24d', '#ff3b2b'][k % 3], r: 3 + Math.random() * 2 });
        grid[r][cc] = null; cleared++;
      }
    }
    score += cleared * 14 * mult;
    pops.push({ x: cellX(0, clamp(c, 0, cellCount(0) - 1)), y: launch.y - 120, t: 1, txt: 'ACE!', size: 24, col: '#ff7a3d', stroke: 'rgba(120,40,0,0.8)' });
    addZoom(0.25);
    const dropped = detachFloaters();
    afterDrops(dropped);
  }
  function goldJackpot(r, c) {
    playGold();
    flash = Math.max(flash, 0.5); shake = Math.max(shake, 10);
    const jp = 500 * mult;
    score += jp;
    combo++;
    // clear a small ring too
    for (const [rr, cc] of ringCells(r, c, 1)) {
      const cell = at(rr, cc);
      if (cell && cell.kind !== 'metal') { spawnPuff(cellX(rr, cc), cellY(rr), COLORS[cell.color || 0]); grid[rr][cc] = null; }
    }
    // treat-coin shower
    for (let i = 0; i < 16; i++) coins.push({ x: cellX(r, c), y: cellY(r), vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 4, life: 1.4 });
    pops.push({ x: W / 2, y: 140, t: 1.4, txt: 'JACKPOT +' + jp, size: 24, col: '#ffd24d', stroke: 'rgba(120,70,0,0.85)' });
    addZoom(0.5);
    const dropped = detachFloaters();
    afterDrops(dropped);
  }

  // ---------------------------------------------------------------------------
  // After-shot resolution (combo, descend, catch, lose)
  // ---------------------------------------------------------------------------
  function afterShot(popped, n, dropped) {
    if (popped) {
      // board cleared?
      if (grid.every((row) => row.every((x) => x == null))) { boardCleared(); return; }
    } else {
      combo = 0; mult = 1;
    }
    if (popped) mult = clamp(1 + Math.floor(combo / 2), 1, 9);
    afterDrops(dropped || 0);
    // descend the net on a cadence
    shotsSinceDrop++;
    if (shotsSinceDrop >= dropEvery() && frenzy <= 0) { descendNet(); }
    loseCheck();
    if (score > best) { best = score; newBest = true; }
  }
  function afterDrops(dropped) {
    if (dropped > 0) { startLeap(); }
  }
  function descendNet() {
    shotsSinceDrop = 0;
    rowParity0 ^= 1;                  // flip parity first so the new row sizes correctly
    grid.unshift(makeRow(0, false));
    descendAnim -= rowH;       // keep existing balls visually in place, then ease down
    playThud();
    loseCheck();
  }
  function loseCheck() {
    // settled position (ignoring the transient descend ease) of the lowest occupied row
    for (let r = grid.length - 1; r >= 0; r--) {
      let occ = false;
      for (let c = 0; c < grid[r].length; c++) if (grid[r][c]) { occ = true; break; }
      if (occ) { if (boardY0 + r * rowH + R >= dangerY) gameOver(); return; }
    }
  }
  function boardCleared() {
    playClear();
    clearWiggle = 1.6;
    score += 1000 * mult;
    pops.push({ x: W / 2, y: H / 2, t: 1.6, txt: 'BOARD CLEAR!', size: 26, col: '#fff', stroke: 'rgba(60,120,40,0.9)' });
    addZoom(0.6);
    // refill a fresh few rows so endless continues
    grid = [];
    rowParity0 = 0; descendAnim = 0;
    const rows = clamp(3 + Math.floor(level() / 4), 3, 6);
    for (let i = 0; i < rows; i++) grid.push(makeRow(i, i < rows - 1));
    combo = 0; mult = 1; shotsSinceDrop = 0;
  }

  // ---------------------------------------------------------------------------
  // Praise text
  // ---------------------------------------------------------------------------
  function praise(n, combo) {
    let txt = null;
    if (combo >= 6 || n >= 7) txt = ['ZOOMIES!', 'OH RAYMOND!!', 'GOOD DOG!!'][combo % 3];
    else if (combo >= 4 || n >= 5) txt = 'FETCH!';
    else if (combo >= 2 || n >= 4) txt = 'NICE!';
    if (txt) { praiseTxt = txt; praiseT = 1.1; }
  }

  // ---------------------------------------------------------------------------
  // Particles / coins
  // ---------------------------------------------------------------------------
  function spawnPuff(x, y, colObj) {
    const n = 6 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 1 + Math.random() * 3;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1,
        col: Math.random() < 0.5 ? colObj.hi : colObj.lo, r: 2 + Math.random() * 2.5,
      });
    }
  }
  function updateParticles() {
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.98; p.life -= 0.035; }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
    for (const c of coins) { c.x += c.vx; c.y += c.vy; c.vy += 0.22; c.life -= 0.02; }
    const before = coins.length;
    coins = coins.filter((c) => c.life > 0);
    if (coins.length < before && Math.random() < 0.3) { treats++; }
  }

  // ---------------------------------------------------------------------------
  // ZOOMIES / frenzy
  // ---------------------------------------------------------------------------
  function addZoom(a) {
    if (frenzy > 0) return;
    zoom = clamp(zoom + a, 0, 1);
    if (zoom >= 1) enterFrenzy();
  }
  function enterFrenzy() {
    frenzy = 6.5; zoom = 1; zoomiesFlash = 1;
    playZoomies();
    cur = { kind: 'rainbow' }; nxt = { kind: 'rainbow' };
    pops.push({ x: W / 2, y: H * 0.4, t: 1.4, txt: 'ZOOMIES!', size: 34, col: '#ffe14d', stroke: 'rgba(150,80,0,0.9)' });
  }
  function updateFrenzy(dt) {
    if (frenzy > 0) {
      frenzy -= dt;
      if (frenzy <= 0) { frenzy = 0; zoom = 0; cur = makeQueueBall(false); nxt = makeQueueBall(true); }
    }
    if (zoomiesFlash > 0) zoomiesFlash = Math.max(0, zoomiesFlash - dt * 1.5);
  }

  // ---------------------------------------------------------------------------
  // The hero mechanic — puppy leaps to catch the falling balls
  // ---------------------------------------------------------------------------
  function startLeap() {
    const live = fallers.filter((f) => !f.caught);
    if (!live.length) return;
    let cx = 0; for (const f of live) cx += f.x; cx /= live.length;
    const n = live.length;
    const reach = clamp(cx - pupBase.x, -150, 150);
    const peak = clamp(46 + n * 18, 46, 280);
    const dur = 0.42 + Math.min(n, 8) * 0.05;
    pup.leap = { t: 0, dur, reach, peak, n, x0: pup.lx };
    inputLock = true;
    if (n >= 4) timeScale = Math.min(timeScale, 0.5);
  }
  function mouthPos() {
    // approximate world position of the pup's mouth given current leap offset
    const s = 1.5;
    return { x: pupBase.x + pup.lx + 30 * s * pup.sx, y: pupBase.y + pup.ly - 8 * s };
  }
  function updateLeap(dt) {
    const L = pup.leap;
    if (L) {
      L.t += dt;
      const t = clamp(L.t / L.dur, 0, 1);
      pup.lx = lerp(L.x0, L.reach, easeInOut(t));
      pup.ly = -L.peak * Math.sin(Math.PI * t);
      // squash/stretch
      const air = Math.sin(Math.PI * t);
      pup.sx = 1 - air * 0.12; pup.sy = 1 + air * 0.16;
      if (t >= 1) { pup.leap = null; }
    } else {
      // ease back to baseline
      pup.lx = lerp(pup.lx, 0, 0.2);
      pup.ly = lerp(pup.ly, 0, 0.25);
      pup.sx = lerp(pup.sx, 1, 0.2); pup.sy = lerp(pup.sy, 1, 0.2);
      if (inputLock && Math.abs(pup.lx) < 1 && Math.abs(pup.ly) < 1 && fallers.length === 0) {
        inputLock = false;
      }
    }
  }
  function updateFallers(dt) {
    const mouth = mouthPos();
    const airborne = pup.ly < -8;
    for (const f of fallers) {
      if (f.caught) continue;
      f.t += dt;
      // magnetic scoop while the pup is up and near
      const dx = mouth.x - f.x, dy = mouth.y - f.y, d = Math.hypot(dx, dy) || 1;
      if (airborne && d < 130) { f.vx += (dx / d) * 1.4; f.vy += (dy / d) * 1.4; }
      f.x += f.vx; f.y += f.vy; f.vy += 0.42; f.vx *= 0.99;
      if (d < R + 14) { catchFaller(f); continue; }
      if (f.y > H + 40) { f.caught = 'miss'; playThud(); }
    }
    fallers = fallers.filter((f) => !f.caught);
  }
  function catchFaller(f) {
    f.caught = true; f.fade = 0;
    treats++;
    addZoom(0.04);
    playGulp();
    pop1(mouthPos().x, mouthPos().y - 10);
    pup.mood = 1;
  }
  function pop1(x, y) {
    pops.push({ x, y, t: 1, txt: '+1', size: 16, col: '#ffe14d', stroke: 'rgba(110,80,10,0.85)' });
  }

  // ---------------------------------------------------------------------------
  // Scenes / UI
  // ---------------------------------------------------------------------------
  let buttons = [];
  function button(id, x, y, w, h) { buttons.push({ id, x, y, w, h }); return { x, y, w, h }; }
  function btnAt(px, py) { for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id; } return null; }
  // Draws just the glossy pill; callers render their own centred label via textC.
  function drawBtn(x, y, w, h, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; roundRect(x + 2, y + 3, w, h, h / 2.4); ctx.fill();
    ctx.fillStyle = col; roundRect(x, y, w, h, h / 2.4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(x + 3, y + 3, w - 6, h * 0.45, h / 3); ctx.fill();
  }

  function drawHUD() {
    // score
    textC(String(score), W / 2, NETY + 4, 30, '#fff', 'rgba(40,80,40,0.85)');
    // combo / multiplier
    if (mult > 1) textC('x' + mult, W / 2 + 56, NETY + 6, 18, '#ffe14d', 'rgba(120,80,0,0.8)');
    // treats chip
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(W - 92, 10, 80, 24, 12); ctx.fill();
    drawTennisBall(W - 80, 22, 8, { kind: 'ball', color: 0 });
    textC(String(treats), W - 52, 22, 15, '#fff', null, 800);
    // pause
    const p = button('pause', 10, 10, 30, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(p.x + 9, p.y + 7, 4, 12); ctx.fillRect(p.x + 17, p.y + 7, 4, 12);

    // ZOOMIES meter
    const bw = 150, bx = (W - bw) / 2, by = H - 22;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(bx, by, bw, 12, 6); ctx.fill();
    const fillC = frenzy > 0 ? `hsl(${(animT * 200) % 360},90%,60%)` : '#ffcf3f';
    ctx.fillStyle = fillC; roundRect(bx + 2, by + 2, (bw - 4) * (frenzy > 0 ? 1 : zoom), 8, 4); ctx.fill();
    textC(frenzy > 0 ? 'FRENZY!' : 'ZOOMIES', W / 2, by - 9, 11, 'rgba(255,255,255,0.85)', null, 800);
  }

  function drawDanger() {
    // lose line + heartbeat vignette as balls approach
    let nearest = Infinity;
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) if (grid[r][c]) nearest = Math.min(nearest, dangerY - (cellY(r) + R));
    const close = clamp(1 - nearest / (rowH * 3), 0, 1);
    ctx.save();
    ctx.strokeStyle = `rgba(220,40,40,${0.25 + 0.5 * close})`;
    ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(W, dangerY); ctx.stroke();
    ctx.setLineDash([]);
    if (close > 0.15) {
      const a = close * (0.4 + 0.3 * Math.sin(heartT * 8));
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62);
      vg.addColorStop(0, 'rgba(220,30,30,0)'); vg.addColorStop(1, `rgba(200,20,20,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    dangerPulse = close;
  }

  function drawQueue() {
    // held current ball at the launch point + the puppy
    const worried = dangerPulse > 0.4;
    const lookX = clamp((aim.x - launch.x) / 160, -1, 1);
    const lookY = clamp((aim.y - launch.y) / 200, -1, 0.4);
    const curCol = cur ? queueGlint(cur) : null;
    const nxtCol = nxt ? queueGlint(nxt) : null;

    // Aim wind-up + fire-lunge pose, layered on top of any catch-leap offset.
    const coil = aimPose;                                 // 0..1 while aiming
    const fl = fireFlick;                                 // 1..0 spike on release
    const adx = Math.cos(aim.a), ady = Math.sin(aim.a);   // aim direction (ady<0 = up)
    const wiggle = Math.sin(animT * 20) * coil * 2.0;     // anticipation butt-wiggle
    const poseX = pup.lx + wiggle + fl * adx * 16;        // lunge toward the aim on release
    const poseY = pup.ly + coil * 8 + fl * ady * 16;      // deep crouch while aiming, spring on fire
    const psx = 1.5 * pup.sx * (1 + coil * 0.10 - fl * 0.05);  // aim: widen;  fire: narrow
    const psy = 1.5 * pup.sy * (1 - coil * 0.16 + fl * 0.14);  // aim: crouch; fire: spring tall

    ctx.save();
    ctx.translate(pupBase.x + poseX, pupBase.y + poseY);
    ctx.rotate(-coil * 0.05 + fl * adx * 0.11);           // lean back to aim, flick forward to throw
    ctx.scale(psx, psy);
    drawPuppy({
      lookX, lookY, curColor: curCol, nxtColor: nxtCol,
      curSp: cur && cur.kind !== 'ball', nxtSp: nxt && nxt.kind !== 'ball',
      worried, alert: coil, wear: equipped.wear,
      wag: (frenzy > 0 || clearWiggle > 0 || pup.mood > 0) ? 2.2 : 1,
    });
    ctx.restore();
    // current ball held in the mouth — winds back as you aim, then springs away
    if (cur && !proj && !inputLock) {
      const bx = launch.x - adx * coil * 5, by = launch.y - ady * coil * 5;
      drawTennisBall(bx, by, R, cur.kind === 'ball' ? cur : queueCell(cur));
    }
    // next-ball mini preview by the hopper
    if (nxt) { drawTennisBall(W - 22, launch.y, 11, nxt.kind === 'ball' ? nxt : queueCell(nxt)); textC('next', W - 22, launch.y + 18, 9, 'rgba(255,255,255,0.7)', null, 700); }
  }
  function queueGlint(q) {
    if (q.kind === 'ball') return COLORS[q.color].hi;
    if (q.kind === 'rainbow') return '#ff8de0';
    if (q.kind === 'bomb') return '#888';
    if (q.kind === 'serve') return '#ff7a3d';
    if (q.kind === 'gold') return '#ffd24d';
    return '#fff';
  }
  function queueCell(q) {
    if (q.kind === 'rainbow') return { kind: 'rainbow' };
    if (q.kind === 'gold') return { kind: 'ball', color: 0, gold: true };
    if (q.kind === 'bomb') return { kind: 'bomb' };
    if (q.kind === 'serve') return { kind: 'serve' };
    return { kind: 'ball', color: q.color || 0 };
  }

  function drawBoard() {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const by = cellY(r);
        if (by < -R || by > H + R) continue;
        // gentle ambient "alive" motion — a soft bob + sway + spin wave so the
        // board shimmers instead of sitting dead still (purely cosmetic; the
        // logical cell position is unchanged)
        const ph = r * 0.55 + c * 0.75;
        const ox = Math.sin(animT * 1.6 + ph * 1.3) * 0.4;
        const oy = Math.sin(animT * 2.2 + ph) * 0.9;
        // rotation is around the ball centre, so the seam visibly sways without
        // ever opening a gap to its neighbours
        const rot = Math.sin(animT * 2.0 + ph) * 0.13;
        // brief squash-pop the instant a ball lands
        let sc = 1;
        if (cell.land != null) {
          const e = animT - cell.land;
          if (e < 0.35) sc = 1 + Math.sin((e / 0.35) * Math.PI) * 0.16;
        }
        drawTennisBall(cellX(r, c) + ox, by + oy, R * sc, cell, rot);
      }
    }
  }

  function drawSpecialProjectile(p) {
    const q = p.ball;
    if (q.kind === 'bomb') { drawTennisBall(p.x, p.y, R, { kind: 'ball', color: 0 }); drawBoneOverlay(p.x, p.y, R); }
    else if (q.kind === 'serve') { drawFlameBall(p.x, p.y, R); }
    else if (q.kind === 'gold') { drawGoldBall(p.x, p.y, R); }
    else drawTennisBall(p.x, p.y, R, q.kind === 'rainbow' ? { kind: 'rainbow' } : q);
  }
  function drawBoneOverlay(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.5); ctx.fillStyle = '#fff7e8'; ctx.strokeStyle = '#caa46a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(-r * 0.5, -r * 0.3, r * 0.22, 0, TAU); ctx.arc(-r * 0.5, r * 0.1, r * 0.22, 0, TAU);
    ctx.arc(r * 0.5, -r * 0.3, r * 0.22, 0, TAU); ctx.arc(r * 0.5, r * 0.1, r * 0.22, 0, TAU); ctx.fill();
    ctx.fillRect(-r * 0.5, -r * 0.25, r, r * 0.3); ctx.restore();
  }
  function drawFlameBall(x, y, r) {
    drawTennisBall(x, y, r, { kind: 'ball', color: 5 });
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ff3b2b', '#ff7a2b', '#ffd24d'][i]; ctx.beginPath(); ctx.ellipse((i - 1) * 4, -r - 2 - i, 4 - i, 8 - i * 1.5, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawGoldBall(x, y, r) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.1);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.6, '#ffd24d'); g.addColorStop(1, '#e0a020');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = FELT; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.04, -r * 0.93); ctx.bezierCurveTo(r * 0.62, -r * 0.5, -r * 0.62, r * 0.5, r * 0.04, r * 0.93); ctx.stroke();
    drawSparkle(-r * 0.3, -r * 0.3, 4, 0.8 + 0.2 * Math.sin(animT * 8));
    ctx.restore();
  }

  function drawFallers() {
    for (const f of fallers) {
      if (f.caught === true) continue;
      ctx.save(); ctx.globalAlpha = clamp(1, 0, 1);
      drawTennisBall(f.x, f.y, R - 1, f.cell);
      ctx.restore();
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of coins) {
      ctx.globalAlpha = clamp(c.life, 0, 1);
      drawTennisBall(c.x, c.y, 6, { kind: 'ball', color: 0 });
    }
    ctx.globalAlpha = 1;
  }
  function drawPops() {
    for (const p of pops) {
      ctx.globalAlpha = clamp(p.t, 0, 1);
      textC(p.txt, p.x, p.y, p.size, p.col, p.stroke, 800);
    }
    ctx.globalAlpha = 1;
    if (praiseT > 0) {
      ctx.globalAlpha = clamp(praiseT, 0, 1);
      const s = 30 + (1 - clamp(praiseT, 0, 1)) * 14;
      textC(praiseTxt, W / 2, H * 0.42, s, '#fff', 'rgba(230,120,40,0.9)', 800);
      ctx.globalAlpha = 1;
    }
  }

  // ----- title -----
  function drawTitle() {
    drawShinyTitle('Doodle Pop', W / 2, 96, 42);
    // pup bobbing with a ball
    ctx.save();
    ctx.translate(W / 2, 220 + Math.sin(animT * 2.2) * 6);
    ctx.scale(1.7, 1.7);
    drawPuppy({ lookX: Math.sin(animT) * 0.4, lookY: -0.2, curColor: COLORS[0].hi, nxtColor: COLORS[3].hi, wear: equipped.wear, wag: 1.4 });
    ctx.restore();
    drawTennisBall(W / 2, 168, 18, { kind: 'ball', color: 0 });

    // best + streak chips
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; roundRect(W / 2 - 92, 286, 88, 32, 16); ctx.fill();
    textC('Best ' + best, W / 2 - 48, 302, 15, '#4a6b3a', null, 700);
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; roundRect(W / 2 + 4, 286, 88, 32, 16); ctx.fill();
    textC('🔥 ' + streak + 'd', W / 2 + 48, 302, 15, '#a85a2a', null, 700);

    // play button
    drawBtn(W / 2 - 80, 344, 160, 52, '#5fb0e8', '#fff', 22);
    button('play', W / 2 - 80, 344, 160, 52);
    textC('PLAY', W / 2, 370, 22, '#fff', null, 800);

    // shop + settings row
    drawBtn(W / 2 - 80, 410, 76, 40, '#7bc86b', '#fff', 15);
    button('shop', W / 2 - 80, 410, 76, 40);
    textC('Shop', W / 2 - 42, 430, 15, '#fff', null, 800);
    drawBtn(W / 2 + 4, 410, 76, 40, muted ? '#b88' : '#88a', '#fff', 15);
    button('mute', W / 2 + 4, 410, 76, 40);
    textC(muted ? 'Muted' : 'Sound', W / 2 + 42, 430, 15, '#fff', null, 800);

    drawBtn(W / 2 - 80, 458, 160, 36, cbMode ? '#caa84a' : '#9aa', '#fff', 13);
    button('cb', W / 2 - 80, 458, 160, 36);
    textC('Colorblind pips: ' + (cbMode ? 'ON' : 'OFF'), W / 2, 476, 13, '#fff', null, 800);

    const a = 0.55 + 0.45 * Math.sin(animT * 4);
    ctx.globalAlpha = a;
    textC('drag to aim — release to pop', W / 2, groundY - 40, 16, '#fff', 'rgba(60,90,120,0.6)', 700);
    ctx.globalAlpha = 1;
  }

  // ----- game over -----
  function drawOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(0, 0, W, H);
    const pw = 264, ph = 232, px = (W - pw) / 2, py = H * 0.22;
    ctx.fillStyle = '#fff8ec'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.fillStyle = '#f2e3c8'; roundRect(px + 8, py + 8, pw - 16, ph - 16, 16); ctx.fill();
    textC('Game Over', W / 2, py + 36, 28, '#c75a3a', null, 800);

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '700 15px -apple-system, "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#8a7a5a';
    ctx.fillText('SCORE', px + 32, py + 78);
    ctx.fillText('BEST', px + 32, py + 110);
    ctx.fillText('TREATS', px + 32, py + 142);
    ctx.textAlign = 'right';
    ctx.font = '800 26px -apple-system, "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#5a4a2a';
    ctx.fillText(String(score), px + pw - 32, py + 78);
    ctx.fillText(String(best), px + pw - 32, py + 110);
    ctx.fillStyle = '#3a8a3a';
    ctx.fillText('+' + (treats - runStartTreats), px + pw - 32, py + 142);

    if (newBest) {
      ctx.save(); ctx.translate(px + pw - 54, py + 52); ctx.rotate(-0.2);
      ctx.fillStyle = '#ffcf3f'; roundRect(-34, -12, 68, 24, 12); ctx.fill();
      textC('NEW!', 0, 0, 14, '#7a5a10', null, 800); ctx.restore();
    }

    drawBtn(px + 24, py + ph - 50, 102, 38, '#5fb0e8', '#fff', 16);
    button('again', px + 24, py + ph - 50, 102, 38);
    textC('Again', px + 24 + 51, py + ph - 31, 16, '#fff', null, 800);
    drawBtn(px + pw - 126, py + ph - 50, 102, 38, '#7bc86b', '#fff', 16);
    button('home', px + pw - 126, py + ph - 50, 102, 38);
    textC('Home', px + pw - 126 + 51, py + ph - 31, 16, '#fff', null, 800);
  }

  // ----- pause -----
  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H);
    textC('Paused', W / 2, H * 0.32, 32, '#fff', 'rgba(0,0,0,0.4)', 800);
    drawBtn(W / 2 - 80, H * 0.4, 160, 46, '#5fb0e8', '#fff', 18); button('resume', W / 2 - 80, H * 0.4, 160, 46);
    textC('Resume', W / 2, H * 0.4 + 23, 18, '#fff', null, 800);
    drawBtn(W / 2 - 80, H * 0.4 + 56, 160, 42, muted ? '#b88' : '#88a', '#fff', 16); button('pmute', W / 2 - 80, H * 0.4 + 56, 160, 42);
    textC(muted ? 'Sound: Off' : 'Sound: On', W / 2, H * 0.4 + 77, 16, '#fff', null, 800);
    drawBtn(W / 2 - 80, H * 0.4 + 106, 160, 42, '#7bc86b', '#fff', 16); button('phome', W / 2 - 80, H * 0.4 + 106, 160, 42);
    textC('Quit to Title', W / 2, H * 0.4 + 127, 16, '#fff', null, 800);
  }

  // ----- shop -----
  const SHOP = [
    { id: 'wear:bandana', label: 'Bandana', kind: 'wear', val: 'bandana', cost: 60 },
    { id: 'wear:visor', label: 'Sun Visor', kind: 'wear', val: 'visor', cost: 90 },
    { id: 'skin:neon', label: 'Neon Balls', kind: 'skin', val: 'neon', cost: 120 },
    { id: 'skin:glitter', label: 'Glitter Balls', kind: 'skin', val: 'glitter', cost: 160 },
    { id: 'court:clay', label: 'Clay Court', kind: 'court', val: 'clay', cost: 100 },
    { id: 'court:night', label: 'Night Court', kind: 'court', val: 'night', cost: 140 },
    { id: 'court:beach', label: 'Beach Court', kind: 'court', val: 'beach', cost: 140 },
  ];
  function owned(it) { return it.cost === 0 || unlocks[it.id]; }
  function isEquipped(it) { return equipped[it.kind] === it.val; }
  function drawShop() {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, W, H);
    textC('Treat Shop', W / 2, 54, 28, '#fff', 'rgba(0,0,0,0.4)', 800);
    drawTennisBall(W / 2 - 56, 86, 9, { kind: 'ball', color: 0 });
    textC(String(treats) + ' treats', W / 2 + 6, 86, 16, '#ffe14d', 'rgba(80,60,0,0.6)', 800);

    const cols = 2, cw = 168, chh = 86, gap = 12;
    const x0 = (W - (cols * cw + gap)) / 2;
    for (let i = 0; i < SHOP.length; i++) {
      const it = SHOP[i];
      const cx = x0 + (i % cols) * (cw + gap);
      const cy = 112 + Math.floor(i / cols) * (chh + gap);
      ctx.fillStyle = '#fff8ec'; roundRect(cx, cy, cw, chh, 14); ctx.fill();
      // preview swatch
      if (it.kind === 'court') { const t = COURTS[it.val]; ctx.fillStyle = t.court; roundRect(cx + 10, cy + 10, 40, 40, 8); ctx.fill(); ctx.fillStyle = t.line; ctx.fillRect(cx + 10, cy + 28, 40, 3); }
      else if (it.kind === 'skin') { const sk = equipped.skin; equipped.skin = it.val; drawTennisBall(cx + 30, cy + 30, 16, { kind: 'ball', color: 3 }); equipped.skin = sk; }
      else { ctx.fillStyle = it.val === 'bandana' ? '#e0444f' : '#2fb36b'; roundRect(cx + 14, cy + 16, 30, 28, 6); ctx.fill(); }
      textC(it.label, cx + 100, cy + 24, 14, '#5a4a2a', null, 800);
      const ownedIt = owned(it);
      const eq = isEquipped(it);
      const bx = cx + 60, by = cy + 48, bw = cw - 70, bh = 28;
      const col = eq ? '#9aa' : ownedIt ? '#7bc86b' : (treats >= it.cost ? '#5fb0e8' : '#caa');
      drawBtn(bx, by, bw, bh, col, '#fff', 13);
      button('buy:' + i, bx, by, bw, bh);
      const lbl = eq ? 'Equipped' : ownedIt ? 'Equip' : it.cost + ' 🎾';
      textC(lbl, bx + bw / 2, by + bh / 2 + 1, 13, '#fff', null, 800);
    }
    drawBtn(W / 2 - 60, H - 64, 120, 42, '#7bc86b', '#fff', 16);
    button('shopback', W / 2 - 60, H - 64, 120, 42);
    textC('Back', W / 2, H - 43, 16, '#fff', null, 800);
  }

  // ---------------------------------------------------------------------------
  // Scene transitions
  // ---------------------------------------------------------------------------
  function startGame() {
    scene = 'play'; paused = false;
    score = 0; combo = 0; mult = 1; newBest = false;
    shotsFired = 0; shotsSinceDrop = 0; zoom = 0; frenzy = 0;
    proj = null; fallers = []; particles = []; coins = []; pops = [];
    inputLock = false; aiming = false;
    pup.lx = pup.ly = 0; pup.sx = pup.sy = 1; pup.leap = null; pup.mood = 0;
    rowParity0 = 0; descendAnim = 0;
    runStartTreats = treats;
    grid = [];
    const rows = 5;
    for (let i = 0; i < rows; i++) grid.push(makeRow(i, i < rows - 1));
    cur = makeQueueBall(false); nxt = makeQueueBall(false);
    hintEl.classList.remove('hidden');
  }
  function gameOver() {
    if (scene !== 'play') return;
    scene = 'over';
    flash = Math.max(flash, 0.6); shake = Math.max(shake, 10);
    playThud();
    if (score > best) { best = score; newBest = true; }
    save('best', best); save('treats', treats);
    hintEl.classList.add('hidden');
  }
  function toTitle() { scene = 'title'; paused = false; save('treats', treats); hintEl.classList.add('hidden'); }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * W,
      y: (e.clientY - rect.top) / rect.height * H,
    };
  }
  let downPos = null, downBtn = null, movedFar = false;

  function onDown(e) {
    e.preventDefault();
    audio();
    const p = toLogical(e);
    downPos = p; movedFar = false;
    downBtn = btnAt(p.x, p.y);
    if (scene === 'play' && !paused) {
      if (downBtn === 'pause') return;
      // tapping the held ball swaps current<->next
      if (cur && nxt && Math.hypot(p.x - launch.x, p.y - launch.y) < R * 1.6 && !inputLock && !proj) {
        const t = cur; cur = nxt; nxt = t; playSnap(); return;
      }
      if (!inputLock && !proj) { aiming = true; setAimFromPoint(p.x, p.y); }
    }
  }
  function onMove(e) {
    e.preventDefault();
    const p = toLogical(e);
    if (downPos && Math.hypot(p.x - downPos.x, p.y - downPos.y) > 8) movedFar = true;
    if (scene === 'play' && aiming && !inputLock && !proj) setAimFromPoint(p.x, p.y);
  }
  function onUp(e) {
    e.preventDefault();
    const p = toLogical(e);
    const up = btnAt(p.x, p.y);

    if (paused) { if (up && up === downBtn) handleButton(up); downPos = null; aiming = false; return; }

    if (scene === 'play') {
      if (downBtn === 'pause' && up === 'pause') { paused = true; aiming = false; downPos = null; return; }
      if (aiming && !inputLock && !proj) { fire(); }
      aiming = false; downPos = null; return;
    }
    // menus: activate the button if press & release on the same one
    if (up && up === downBtn) handleButton(up);
    downPos = null;
  }
  function handleButton(id) {
    if (id === 'play' || id === 'again') { startGame(); return; }
    if (id === 'shop') { scene = 'shop'; return; }
    if (id === 'shopback') { scene = 'title'; return; }
    if (id === 'mute' || id === 'pmute') { muted = !muted; save('muted', muted); return; }
    if (id === 'cb') { cbMode = !cbMode; save('cb', cbMode); return; }
    if (id === 'home' || id === 'phome') { toTitle(); return; }
    if (id === 'pause') { paused = true; return; }
    if (id === 'resume') { paused = false; return; }
    if (id && id.indexOf('buy:') === 0) { shopBuy(+id.split(':')[1]); return; }
  }
  function shopBuy(i) {
    const it = SHOP[i]; if (!it) return;
    if (isEquipped(it)) return;
    if (owned(it)) { equipped[it.kind] = it.val; save('equipped', equipped); playBuy(); return; }
    if (treats >= it.cost) {
      treats -= it.cost; unlocks[it.id] = true; equipped[it.kind] = it.val;
      save('treats', treats); save('unlocks', unlocks); save('equipped', equipped);
      playBuy();
    }
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  canvas.addEventListener('touchstart', (e) => { if (!('PointerEvent' in window)) onDown(e.touches[0]); }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') { muted = !muted; save('muted', muted); }
    if (e.code === 'Space') {
      e.preventDefault();
      if (scene === 'title') startGame();
      else if (scene === 'over') startGame();
      else if (scene === 'play' && !paused && !proj && !inputLock) fire();
    }
    if (e.key === 'ArrowLeft' && scene === 'play') setAimFromPoint(launch.x - 100, launch.y - 120);
    if (e.key === 'ArrowRight' && scene === 'play') setAimFromPoint(launch.x + 100, launch.y - 120);
    if ((e.key === 'r' || e.key === 'R') && (scene === 'play' || scene === 'over')) startGame();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (scene === 'play') paused = !paused;
      else if (scene === 'shop') scene = 'title';
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (actx) actx.suspend(); if (scene === 'play') paused = true; }
    else if (actx && actx.state === 'suspended' && actx.resume) actx.resume();
  });

  // ---------------------------------------------------------------------------
  // Update (fixed 60Hz step)
  // ---------------------------------------------------------------------------
  function update(dt) {
    // smooth descend easing always runs
    if (descendAnim < 0) descendAnim = Math.min(0, descendAnim + rowH * dt * 3.2);

    if (scene === 'play' && !paused) {
      moveClouds(0.3);
      runT += 0.06;
      stepProjectile();
      updateFrenzy(dt);
      updateLeap(dt);
      updateFallers(dt);
      heartT += dt;
      if (dangerPulse > 0.45 && Math.floor(heartT * 4) !== Math.floor((heartT - dt) * 4)) { /* placeholder */ }
      // heartbeat audio roughly twice a second when close
      if (dangerPulse > 0.5) { heartAcc += dt; if (heartAcc > 0.9) { heartAcc = 0; playHeart(); } }
      if (pup.mood > 0) pup.mood = Math.max(0, pup.mood - dt * 2);
    } else {
      moveClouds(0.12);
      runT += 0.03;
    }

    updateParticles();
    if (clearWiggle > 0) clearWiggle = Math.max(0, clearWiggle - dt);
    if (praiseT > 0) praiseT -= dt;
    for (const p of pops) { p.y -= 0.5; p.t -= dt * 0.9; }
    pops = pops.filter((p) => p.t > 0);

    fireFlick *= 0.88;
    // aim wind-up eases in while actively aiming, out otherwise
    const wantAim = (scene === 'play' && !paused && aiming && !proj && !inputLock) ? 1 : 0;
    aimPose = lerp(aimPose, wantAim, 0.22);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    if (shake > 0) shake = Math.max(0, shake - dt * 42);
    timeScale = lerp(timeScale, 1, 0.06);
  }
  let heartAcc = 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render() {
    ctx.clearRect(0, 0, W, H);
    buttons = [];

    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawBackground();

    if (scene === 'title') {
      drawTitle();
    } else if (scene === 'shop') {
      drawShop();
    } else {
      // play / over share the board view
      drawBoard();
      if (proj) drawSpecialProjectile(proj);
      drawFallers();
      if (scene === 'play' && !paused) { drawDanger(); drawAim(); }
      else { /* still show danger line faded on over */ }
      drawQueue();
      drawParticles();
      drawPops();
      // first-shot control hint, drawn in the empty board area so it never
      // collides with the HUD or the ZOOMIES meter; fades after you fire.
      if (scene === 'play' && !paused && shotsFired === 0 && !proj) {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(animT * 4);
        textC('drag to aim — release to pop', W / 2, H * 0.6, 16, '#fff', 'rgba(30,60,90,0.6)', 700);
        ctx.globalAlpha = 1;
      }
      drawHUD();
      if (scene === 'over') drawOver();
      if (paused) drawPauseOverlay();
    }

    ctx.restore(); // shake

    // zoomies screen wash
    if (frenzy > 0 || zoomiesFlash > 0) {
      const a = frenzy > 0 ? 0.10 + 0.05 * Math.sin(animT * 10) : zoomiesFlash * 0.4;
      ctx.fillStyle = `hsla(${(animT * 120) % 360},90%,60%,${a})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (flash > 0.001) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------------------------------------------------------------------------
  // Main loop (fixed-step physics, smooth render)
  // ---------------------------------------------------------------------------
  let last = 0, acc = 0;
  const STEP = 1 / 60;
  function loop(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.1) dt = 0.1;
    const scaled = dt * timeScale;
    animT += scaled;
    acc += scaled;
    let steps = 0;
    while (acc >= STEP && steps < 5) { update(STEP); acc -= STEP; steps++; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
