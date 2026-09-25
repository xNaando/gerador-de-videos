// ============================================================
// minigames.js — Snake p/ passar o tempo enquanto o vídeo
// é gerado. Teclado (setas/WASD), swipe no canvas ou D-pad.
// ============================================================

let mgCleanup = null;

function startMinigame() {
  const box = document.getElementById('minigame');
  if (!box) return;
  box.classList.remove('hidden');
  const stage = document.getElementById('game-stage');
  if (mgCleanup) { mgCleanup(); mgCleanup = null; }
  stage.innerHTML = '';
  mgCleanup = mountSnake(stage);
}

function stopMinigame() {
  const box = document.getElementById('minigame');
  if (mgCleanup) { mgCleanup(); mgCleanup = null; }
  if (box) box.classList.add('hidden');
}

// ---------- 🐍 SNAKE ----------
function mountSnake(root) {
  const C = 14, S = 20, SZ = C * S;
  const score = document.createElement('div');
  score.className = 'game-score';
  score.innerHTML = 'Pontos: <b>0</b>';
  root.appendChild(score);
  const scoreEl = score.querySelector('b');

  const cv = document.createElement('canvas');
  cv.className = 'game-canvas';
  cv.width = SZ; cv.height = SZ;
  root.appendChild(cv);
  const ctx = cv.getContext('2d');

  // D-pad p/ celular (e quem preferir clicar)
  const dpad = document.createElement('div');
  dpad.className = 'dpad';
  dpad.innerHTML =
    '<span></span><button data-dir="up" aria-label="cima">▲</button><span></span>' +
    '<button data-dir="left" aria-label="esquerda">◀</button>' +
    '<button data-dir="down" aria-label="baixo">▼</button>' +
    '<button data-dir="right" aria-label="direita">▶</button>';
  root.appendChild(dpad);

  let snake, dir, nextDir, apple, pts, alive;
  const reset = () => {
    snake = [{ x: 7, y: 7 }]; dir = { x: 1, y: 0 }; nextDir = dir;
    apple = spawn(); pts = 0; alive = true;
    scoreEl.textContent = '0';
    const ov = root.querySelector('.game-over'); if (ov) ov.remove();
  };
  const spawn = () => {
    let p;
    do { p = { x: (Math.random() * C) | 0, y: (Math.random() * C) | 0 }; }
    while (snake.some(s => s.x === p.x && s.y === p.y));
    return p;
  };
  const setDir = (d) => {
    if (alive && (d.x !== -dir.x || d.y !== -dir.y)) nextDir = d;
  };

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const onKey = (e) => {
    const map = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    };
    const name = map[e.key];
    if (!name) return;
    setDir(DIRS[name]);
    if (e.key.startsWith('Arrow')) e.preventDefault();
  };
  const onPad = (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    setDir(DIRS[b.dataset.dir]);
    e.preventDefault();
  };
  let tx = 0, ty = 0;
  const onTS = (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; };
  const onTE = (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    e.preventDefault();
  };

  const iv = setInterval(() => {
    if (!alive) return;
    dir = nextDir;
    const h = { x: (snake[0].x + dir.x + C) % C, y: (snake[0].y + dir.y + C) % C };
    if (snake.some(s => s.x === h.x && s.y === h.y)) {
      alive = false;
      const ov = document.createElement('div');
      ov.className = 'game-over';
      ov.innerHTML = `<b>Fim de jogo!</b><span>${pts} pontos</span><button class="btn-mini">Jogar de novo</button>`;
      ov.querySelector('button').onclick = reset;
      root.appendChild(ov);
      return;
    }
    snake.unshift(h);
    if (h.x === apple.x && h.y === apple.y) {
      pts++;
      scoreEl.textContent = pts;
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
  dpad.addEventListener('pointerdown', onPad);
  cv.addEventListener('touchstart', onTS, { passive: true });
  cv.addEventListener('touchend', onTE);
  reset();

  return () => {
    clearInterval(iv);
    window.removeEventListener('keydown', onKey);
    dpad.removeEventListener('pointerdown', onPad);
    cv.removeEventListener('touchstart', onTS);
    cv.removeEventListener('touchend', onTE);
  };
}
