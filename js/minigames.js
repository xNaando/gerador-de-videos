// ============================================================
// minigames.js — joguinhos leves p/ passar o tempo enquanto
// o vídeo é gerado. Cada jogo retorna uma função de cleanup.
// ============================================================

const GAMES = { snake: mountSnake, reaction: mountReaction, whack: mountWhack };
let mgCleanup = null;

function startMinigame() {
  const box = document.getElementById('minigame');
  if (!box) return;
  box.classList.remove('hidden');
  const stage = document.getElementById('game-stage');
  const tabs = box.querySelectorAll('[data-game]');

  const mount = (name) => {
    if (mgCleanup) { mgCleanup(); mgCleanup = null; }
    stage.innerHTML = '';
    mgCleanup = GAMES[name](stage);
    tabs.forEach(t => t.classList.toggle('active', t.dataset.game === name));
  };

  tabs.forEach(t => t.onclick = () => mount(t.dataset.game));
  const names = Object.keys(GAMES);
  mount(names[Math.floor(Math.random() * names.length)]);
}

function stopMinigame() {
  const box = document.getElementById('minigame');
  if (mgCleanup) { mgCleanup(); mgCleanup = null; }
  if (box) box.classList.add('hidden');
}

// ---------- helpers ----------
function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}
function gameOver(stage, score, onRetry) {
  const ov = el('div', 'game-over', stage);
  ov.innerHTML = `<b>Fim de jogo!</b><span>${score} pontos</span><button class="btn-mini">Jogar de novo</button>`;
  ov.querySelector('button').onclick = onRetry;
  return ov;
}

// ---------- 🐍 SNAKE ----------
function mountSnake(root) {
  const C = 14, S = 20, SZ = C * S;
  el('div', 'game-score', root).innerHTML = 'Pontos: <b id="mg-score">0</b> · ⬆️⬇️⬅️➡️ ou arrasta';
  const cv = el('canvas', 'game-canvas', root);
  cv.width = SZ; cv.height = SZ;
  const ctx = cv.getContext('2d');

  let snake, dir, nextDir, apple, score, alive, speed;
  const reset = () => {
    snake = [{ x: 7, y: 7 }]; dir = { x: 1, y: 0 }; nextDir = dir;
    apple = spawn(); score = 0; alive = true; speed = 150;
    root.querySelector('#mg-score').textContent = '0';
    const ov = root.querySelector('.game-over'); if (ov) ov.remove();
  };
  const spawn = () => {
    let p;
    do { p = { x: (Math.random() * C) | 0, y: (Math.random() * C) | 0 }; }
    while (snake.some(s => s.x === p.x && s.y === p.y));
    return p;
  };

  const onKey = (e) => {
    const k = e.key;
    const map = {
      ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
    };
    const d = map[k];
    if (!d || !alive) return;
    if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d;
    if (k.startsWith('Arrow')) e.preventDefault();
  };
  let tx = 0, ty = 0;
  const onTS = (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; };
  const onTE = (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    const d = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d;
    e.preventDefault();
  };

  const iv = setInterval(() => {
    if (!alive) return;
    dir = nextDir;
    const h = { x: (snake[0].x + dir.x + C) % C, y: (snake[0].y + dir.y + C) % C };
    if (snake.some(s => s.x === h.x && s.y === h.y)) {
      alive = false;
      gameOver(root, score, reset);
      return;
    }
    snake.unshift(h);
    if (h.x === apple.x && h.y === apple.y) {
      score++;
      root.querySelector('#mg-score').textContent = score;
      apple = spawn();
    } else snake.pop();

    ctx.fillStyle = '#0c0c16';
    ctx.fillRect(0, 0, SZ, SZ);
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(apple.x * S + S / 2, apple.y * S + S / 2, S / 3, 0, 7);
    ctx.fill();
    snake.forEach((s, i) => {
      ctx.fillStyle = i ? '#8b5cf6' : '#c4b5fd';
      ctx.beginPath();
      ctx.roundRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2, 5);
      ctx.fill();
    });
  }, 140);

  window.addEventListener('keydown', onKey);
  cv.addEventListener('touchstart', onTS, { passive: true });
  cv.addEventListener('touchend', onTE);
  reset();

  return () => {
    clearInterval(iv);
    window.removeEventListener('keydown', onKey);
    cv.removeEventListener('touchstart', onTS);
    cv.removeEventListener('touchend', onTE);
  };
}

// ---------- ⚡ REFLEXO ----------
function mountReaction(root) {
  el('div', 'game-score', root).innerHTML = 'Melhor: <b id="mg-best">—</b> ms';
  const pad = el('div', 'reaction-pad', root);
  pad.innerHTML = '<b>⚡ Reflexo</b><span>Toque pra começar</span>';
  let state = 'idle', t0 = 0, timer = null, best = Infinity;
  const bestEl = root.querySelector('#mg-best');

  pad.onclick = () => {
    if (state === 'idle' || state === 'done' || state === 'early') {
      state = 'wait';
      pad.className = 'reaction-pad waiting';
      pad.innerHTML = '<b>Espera o verde...</b>';
      timer = setTimeout(() => {
        state = 'go';
        t0 = performance.now();
        pad.className = 'reaction-pad go';
        pad.innerHTML = '<b>AGORA!</b>';
      }, 1200 + Math.random() * 2800);
    } else if (state === 'wait') {
      clearTimeout(timer);
      state = 'early';
      pad.className = 'reaction-pad';
      pad.innerHTML = '<b>Cedo demais 😅</b><span>Toque pra tentar de novo</span>';
    } else if (state === 'go') {
      const ms = Math.round(performance.now() - t0);
      if (ms < best) { best = ms; bestEl.textContent = ms; }
      state = 'done';
      pad.className = 'reaction-pad';
      pad.innerHTML = `<b>${ms} ms</b><span>${ms < 250 ? 'Rápido demais 🔥' : ms < 400 ? 'Bom reflexo!' : 'Da pra melhorar!'} — toca de novo</span>`;
    }
  };

  return () => clearTimeout(timer);
}

// ---------- 🎯 MIRA ----------
function mountWhack(root) {
  el('div', 'game-score', root).innerHTML = 'Acertos: <b id="mg-hits">0</b> · Clique nos alvos!';
  const grid = el('div', 'whack-grid', root);
  const cells = [];
  for (let i = 0; i < 9; i++) cells.push(el('button', 'whack-cell', grid));

  let hits = 0, alive = null, hideT = null;
  const hitsEl = root.querySelector('#mg-hits');
  const TARGETS = ['\u{1F3AF}', '\u{2B50}', '\u{1F525}', '\u{1F4A5}', '\u26A1'];

  const pop = () => {
    if (alive) { alive.textContent = ''; alive = null; }
    const c = cells[(Math.random() * cells.length) | 0];
    c.textContent = TARGETS[(Math.random() * TARGETS.length) | 0];
    alive = c;
    hideT = setTimeout(() => { if (alive === c) { c.textContent = ''; alive = null; } }, 750);
  };
  const iv = setInterval(pop, 700);

  const onHit = (e) => {
    if (e.target === alive && alive.textContent) {
      hits++;
      hitsEl.textContent = hits;
      alive.textContent = '\u{1F4A5}';
      alive = null;
    }
  };
  grid.addEventListener('pointerdown', onHit);

  return () => { clearInterval(iv); clearTimeout(hideT); grid.removeEventListener('pointerdown', onHit); };
}
