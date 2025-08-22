// Ping Pong Multitouch PWA
// Canvas & sizing ------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
resize();

// Game state ----------------------------------------------------------------
const state = {
  running: false,
  width() { return canvas.clientWidth },
  height() { return canvas.clientHeight },
  ball: { x: 0, y: 0, vx: 0, vy: 0, r: 9, speed: 360 },
  paddles: {
    top:   { x: 0, y: 30, w: 96, h: 12, vx: 0, hue: 300 },
    bottom:{ x: 0, y: 0,  w: 96, h: 12, vx: 0, hue: 180 },
  },
  score: { p1: 0, p2: 0, toWin: 5 },
  particles: [],
  sound: true,
};

// Position paddles
function resetPositions() {
  state.paddles.top.y = 24;
  state.paddles.bottom.y = state.height() - 36;
  state.paddles.top.x = (state.width() - state.paddles.top.w) / 2;
  state.paddles.bottom.x = (state.width() - state.paddles.bottom.w) / 2;
  // Ball center
  state.ball.x = state.width()/2;
  state.ball.y = state.height()/2;
  const angle = (Math.random() * 0.6 + 0.2) * Math.PI; // between ~36° and 144°
  const dir = Math.random() < 0.5 ? 1 : -1;
  state.ball.vx = Math.cos(angle) * state.ball.speed * (Math.random() < 0.5 ? 1 : -1);
  state.ball.vy = Math.sin(angle) * state.ball.speed * dir;
}
resetPositions();

// Audio (WebAudio) -----------------------------------------------------------
let audioCtx;
function ensureAudio() {
  if (!state.sound) return;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = AC ? new AC() : null;
  }
}
function beep(freq=600, dur=0.05, type='sine', gain=0.02) {
  if (!state.sound || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

// Particles ------------------------------------------------------------------
function spawnParticles(x, y, color='white', count=10) {
  for (let i=0;i<count;i++) {
    state.particles.push({
      x, y,
      vx: (Math.random()*2-1)*120,
      vy: (Math.random()*2-1)*120,
      life: 0.5 + Math.random()*0.4,
      color
    });
  }
}

// Touch handling -------------------------------------------------------------
const touches = new Map(); // id -> {yZone, x}
canvas.addEventListener('touchstart', e => {
  ensureAudio();
  for (const t of e.changedTouches) {
    touches.set(t.identifier, { x: t.clientX, y: t.clientY, zone: t.clientY < window.innerHeight/2 ? 'top' : 'bottom' });
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    const rec = touches.get(t.identifier);
    if (!rec) continue;
    rec.x = t.clientX;
    rec.y = t.clientY;
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) touches.delete(t.identifier);
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchcancel', e => {
  for (const t of e.changedTouches) touches.delete(t.identifier);
  e.preventDefault();
}, { passive: false });

// Mouse fallback (for desktop testing)
let mouseX = null;
canvas.addEventListener('mousemove', e => { mouseX = e.clientX; });

// Physics --------------------------------------------------------------------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

let last = performance.now();
let fpsEl = document.getElementById('fps');
function step(ts) {
  if (!state.running) return;
  const dt = Math.min(0.033, (ts - last) / 1000);
  last = ts;

  // FPS monitor
  const fps = Math.round(1/dt);
  fpsEl.textContent = fps + " FPS";

  // Map touches to paddles
  // Top paddle: average x of touches in top half
  let topXs = [], botXs = [];
  touches.forEach(t => {
    if (t.zone === 'top') topXs.push(t.x);
    else botXs.push(t.x);
  });
  const top = state.paddles.top;
  const bottom = state.paddles.bottom;
  const speed = 1600;

  function movePaddle(p, targetX) {
    const centerTarget = targetX - p.w/2;
    const delta = centerTarget - p.x;
    p.vx = clamp(delta, -speed, speed);
    p.x += p.vx * dt;
    p.x = clamp(p.x, 4, state.width()-p.w-4);
  }

  if (topXs.length) movePaddle(top, topXs.reduce((a,b)=>a+b,0)/topXs.length);
  if (botXs.length) movePaddle(bottom, botXs.reduce((a,b)=>a+b,0)/botXs.length);

  // Mouse fallback: control bottom paddle
  if (!botXs.length && mouseX !== null) movePaddle(bottom, mouseX);

  // Update ball
  state.ball.x += state.ball.vx * dt;
  state.ball.y += state.ball.vy * dt;

  // Wall collisions
  if (state.ball.x - state.ball.r < 0) { state.ball.x = state.ball.r; state.ball.vx *= -1; beep(500, 0.03); }
  if (state.ball.x + state.ball.r > state.width()) { state.ball.x = state.width() - state.ball.r; state.ball.vx *= -1; beep(520, 0.03); }

  // Paddle collisions
  function collideWith(p, isTop) {
    const withinX = state.ball.x > p.x - state.ball.r && state.ball.x < p.x + p.w + state.ball.r;
    const hitTop = isTop && state.ball.y - state.ball.r <= p.y + p.h && state.ball.y > p.y;
    const hitBot = !isTop && state.ball.y + state.ball.r >= p.y && state.ball.y < p.y + p.h;
    if (withinX && (hitTop || hitBot)) {
      // Calculate deflection based on impact point
      const hitPos = (state.ball.x - (p.x + p.w/2)) / (p.w/2); // -1 .. 1
      const angle = hitPos * 0.6; // max ±~34°
      const speedUp = 1.03;
      const dirY = isTop ? 1 : -1;
      const speed = Math.hypot(state.ball.vx, state.ball.vy) * speedUp;
      state.ball.vx = Math.sin(angle) * speed;
      state.ball.vy = dirY * Math.cos(angle) * speed;
      state.ball.y = isTop ? p.y + p.h + state.ball.r : p.y - state.ball.r;
      spawnParticles(state.ball.x, state.ball.y, `hsl(${p.hue} 100% 70%)`, 16);
      beep(isTop ? 800 : 700, 0.04, 'triangle', 0.03);
    }
  }
  collideWith(top, true);
  collideWith(bottom, false);

  // Score conditions
  if (state.ball.y < -40) {
    score('p2'); // bottom player scores
  } else if (state.ball.y > state.height() + 40) {
    score('p1'); // top player scores
  }

  // Update particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  draw();
  requestAnimationFrame(step);
}

function score(who) {
  const p1El = document.getElementById('p1');
  const p2El = document.getElementById('p2');
  state.score[who]++;
  p1El.textContent = state.score.p1;
  p2El.textContent = state.score.p2;
  spawnParticles(state.ball.x, state.ball.y, 'white', 24);
  beep(220, 0.2, 'square', 0.05);
  const winner = state.score.p1 >= state.score.toWin ? 'Jugador 1' :
                 state.score.p2 >= state.score.toWin ? 'Jugador 2' : null;
  resetPositions();
  if (winner) {
    state.running = false;
    document.getElementById('winText').textContent = `¡${winner} gana!`;
    document.getElementById('win').hidden = false;
  }
}

// Rendering ------------------------------------------------------------------
function draw() {
  const w = state.width(), h = state.height();
  // Glow grid
  ctx.clearRect(0,0,w,h);
  // Center line
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  for (let y = 0; y < h; y += 20) {
    ctx.moveTo(w/2 - 1, y);
    ctx.lineTo(w/2 - 1, y + 10);
  }
  ctx.strokeStyle = 'rgba(0,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Paddles
  for (const [key, p] of Object.entries(state.paddles)) {
    ctx.fillStyle = `hsla(${p.hue} 100% 60% / .85)`;
    roundRect(ctx, p.x, p.y, p.w, p.h, 8, true);
  }

  // Ball with trail
  const g = ctx.createRadialGradient(state.ball.x, state.ball.y, 2, state.ball.x, state.ball.y, 22);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, 10, 0, Math.PI*2);
  ctx.fill();

  // Particles
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 1.5);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  if (fill) ctx.fill();
}

// UI wiring ------------------------------------------------------------------
const menu = document.getElementById('menu');
const winScr = document.getElementById('win');
const playBtn = document.getElementById('playBtn');
const againBtn = document.getElementById('againBtn');
const menuBtn = document.getElementById('menuBtn');
const winPoints = document.getElementById('winPoints');
const soundToggle = document.getElementById('soundToggle');

playBtn.addEventListener('click', () => {
  state.score.p1 = state.score.p2 = 0;
  document.getElementById('p1').textContent = '0';
  document.getElementById('p2').textContent = '0';
  state.score.toWin = Math.max(1, Math.min(21, parseInt(winPoints.value || '5', 10)));
  state.sound = !!soundToggle.checked;
  ensureAudio();
  menu.hidden = true;
  winScr.hidden = true;
  resetPositions();
  if (!state.running) {
    state.running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }
});

againBtn.addEventListener('click', () => {
  winScr.hidden = true;
  playBtn.click();
});
menuBtn?.addEventListener('click', () => {
  winScr.hidden = true;
  menu.hidden = false;
});



// PWA install prompt ---------------------------------------------------------
let deferredPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// Service worker -------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}




