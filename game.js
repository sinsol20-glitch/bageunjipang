const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const levelText = document.getElementById("levelText");
const shotsText = document.getElementById("shotsText");
const scoreText = document.getElementById("scoreText");
const message = document.getElementById("message");
const homeBtn = document.getElementById("homeBtn");
const restartBtn = document.getElementById("restartBtn");
const nextBtn = document.getElementById("nextBtn");

const W = canvas.width;
const H = canvas.height;
const launchSpot = { x: W / 2, y: H - 235 };
const queueY = H - 88;
const maxLevel = 10;
const shotSpeed = 860;
const enterSpeed = 3.1;
const returnSpeed = 9.5;
const airDrag = 0.997;
const wallBounce = 0.78;
const animals = [
  { id: "moon", color: "#ead9ff", label: "달", src: "./assets/character-1.png" },
  { id: "cookie", color: "#ffd2a1", label: "쿠키", src: "./assets/character-2.png" },
  { id: "star", color: "#ffe58b", label: "별", src: "./assets/character-3.png" },
  { id: "rabbit", color: "#ffe1e5", label: "토끼", src: "./assets/character-4.png" },
  { id: "cloud", color: "#dbeaff", label: "구름", src: "./assets/character-5.png" },
  { id: "bear", color: "#ffd2a1", label: "곰", src: "./assets/character-6.png" },
];

const characterImages = new Map();
for (const animal of animals) {
  const image = new Image();
  image.src = animal.src;
  image.onload = () => {
    if (state) draw();
  };
  characterImages.set(animal.id, image);
}

let state;
let pointer = null;
let rafId = null;
let lastTime = 0;

function makeLevel(level) {
  level = Math.max(1, Math.min(level, maxLevel));
  const heroCount = Math.min(3 + Math.floor((level - 1) / 2), 5);
  const heroes = shuffle(animals).slice(0, heroCount);
  const shooterType = heroes[(level - 1) % heroes.length];
  const targets = makeTargets(level, heroes, shooterType);
  const goalTotal = targets.filter((target) => !target.isBomb && !target.isPoop && target.id === shooterType.id).length;

  return {
    level,
    shots: Math.max(goalTotal + 2, 8 - Math.floor(level / 3)),
    score: (state && state.score) || 0,
    heroes,
    shooterType,
    targets,
    goalTotal,
    goalLeft: goalTotal,
    shooter: null,
    entering: false,
    flying: false,
    win: false,
    lose: false,
    sparkles: [],
  };
}

function makeTargets(level, heroes, shooterType) {
  const targets = [];
  const difficulty = Math.min(level, maxLevel);
  const count = Math.min(5 + difficulty * 2, 18);
  const columns = difficulty < 3 ? 4 : Math.min(4 + Math.floor(difficulty / 2), 6);
  const gapX = W / (columns + 1);
  const gapY = Math.max(88, 126 - difficulty * 5);
  const startY = 156;
  const moving = difficulty >= 4;
  const targetRadius = Math.max(28, 38 - Math.floor(difficulty / 2));
  const bombCount = difficulty >= 4 ? Math.min(1 + Math.floor((difficulty - 4) / 2), 4) : 0;
  const poopCount = difficulty >= 2 ? Math.min(1 + Math.floor((difficulty - 2) / 2), 5) : 0;
  const goalCount = Math.min(2 + Math.floor(difficulty / 2), Math.max(2, count - bombCount - poopCount - 1));
  const winningSlots = new Set();
  const hazardSlots = new Map();

  while (winningSlots.size < goalCount) {
    winningSlots.add(Math.floor(Math.random() * count));
  }

  while ([...hazardSlots.values()].filter((type) => type === "bomb").length < bombCount) {
    const slot = Math.floor(Math.random() * count);
    if (!winningSlots.has(slot) && !hazardSlots.has(slot)) hazardSlots.set(slot, "bomb");
  }

  while ([...hazardSlots.values()].filter((type) => type === "poop").length < poopCount) {
    const slot = Math.floor(Math.random() * count);
    if (!winningSlots.has(slot) && !hazardSlots.has(slot)) hazardSlots.set(slot, "poop");
  }

  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = gapX * (col + 1) + (row % 2 ? 22 : -10);
    const y = startY + row * gapY;

    const hazard = hazardSlots.get(i);
    if (hazard === "bomb") {
      targets.push(makeBomb(x, y, moving, difficulty));
      continue;
    }

    if (hazard === "poop") {
      targets.push(makePoop(x, y, moving, difficulty));
      continue;
    }

    const type = winningSlots.has(i) ? shooterType : animals[(i + level) % animals.length];
    targets.push({
      ...type,
      x,
      y,
      baseX: x,
      r: targetRadius,
      alive: true,
      pop: 0,
      isBomb: false,
      isPoop: false,
      phase: Math.random() * Math.PI * 2,
      speed: moving ? 0.7 + difficulty * 0.08 + Math.random() * 0.5 : 0,
    });
  }

  return shuffle(targets);
}

function makeBomb(x, y, moving, level) {
  return {
    id: "bomb",
    label: "폭탄",
    color: "#333946",
    x,
    y,
    baseX: x,
      r: Math.max(30, 36 - Math.floor(level / 3)),
    alive: true,
    pop: 0,
    isBomb: true,
    isPoop: false,
    phase: Math.random() * Math.PI * 2,
    speed: moving ? 0.85 + level * 0.08 + Math.random() * 0.4 : 0,
  };
}

function makePoop(x, y, moving, level) {
  return {
    id: "poop",
    label: "똥",
    color: "#8a5a2d",
    x,
    y,
    baseX: x,
    r: Math.max(29, 34 - Math.floor(level / 3)),
    alive: true,
    pop: 0,
    isBomb: false,
    isPoop: true,
    phase: Math.random() * Math.PI * 2,
    speed: moving ? 0.7 + level * 0.07 + Math.random() * 0.45 : 0,
  };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function spawnShooter() {
  const queuePosition = getHeroQueuePosition(state.shooterType.id);
  state.entering = true;
  state.shooter = {
    ...state.shooterType,
    x: queuePosition.x,
    y: queuePosition.y,
    startX: queuePosition.x,
    startY: queuePosition.y,
    enterTime: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    r: 38,
    returning: false,
    missed: false,
    enteredArena: false,
  };
}

function getHeroQueuePosition(id) {
  const gap = 78;
  const startX = W / 2 - ((state.heroes.length - 1) * gap) / 2;
  const index = Math.max(0, state.heroes.findIndex((hero) => hero.id === id));
  return { x: startX + index * gap, y: queueY };
}

function start(level = 1) {
  state = makeLevel(level);
  pointer = null;
  lastTime = performance.now();
  message.classList.add("hidden");
  spawnShooter();
  updateHud();
  loop();
}

function updateHud() {
  levelText.textContent = state.level;
  shotsText.textContent = state.shots;
  scoreText.textContent = state.score;
  nextBtn.textContent = state.level >= maxLevel ? "처음으로" : "다음 단계";
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function onPointerDown(event) {
  if (state.win || state.lose || state.flying || state.entering || !state.shooter) return;
  const p = canvasPoint(event);
  if (distance(p, state.shooter) < 125) {
    pointer = { ...p };
    canvas.setPointerCapture(event.pointerId);
  }
}

function onPointerMove(event) {
  if (!pointer || state.flying) return;
  pointer = canvasPoint(event);
  draw();
}

function onPointerUp(event) {
  if (!pointer || state.flying || state.entering || !state.shooter) return;

  const pull = {
    x: launchSpot.x - pointer.x,
    y: launchSpot.y - pointer.y,
  };
  const power = Math.min(Math.hypot(pull.x, pull.y), 190);

  if (power < 22) {
    pointer = null;
    draw();
    return;
  }

  const angle = Math.atan2(pull.y, pull.x);
  state.shooter.vx = Math.cos(angle) * shotSpeed;
  state.shooter.vy = Math.sin(angle) * shotSpeed;
  state.flying = true;
  pointer = null;
}

function loop(time = performance.now()) {
  const dt = Math.min((time - lastTime) / 1000 || 0.016, 0.033);
  lastTime = time;
  update(dt, time / 1000);
  draw();

  if (state && (!state.win || state.sparkles.length) && (!state.lose || state.sparkles.length)) {
    rafId = requestAnimationFrame(loop);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function update(dt, time) {
  updateSparkles(dt);
  updateTargets(dt, time);
  updateShooter(dt);
}

function updateSparkles(dt) {
  state.sparkles = state.sparkles
    .map((sparkle) => ({ ...sparkle, life: sparkle.life - dt, y: sparkle.y - 65 * dt }))
    .filter((sparkle) => sparkle.life > 0);
}

function updateTargets(dt, time) {
  for (const target of state.targets) {
    if (target.pop > 0) target.pop = Math.max(0, target.pop - dt * 3);
    if (!target.alive || !target.speed) continue;
    target.x = target.baseX + Math.sin(time * target.speed + target.phase) * 52;
  }
}

function updateShooter(dt) {
  const shooter = state.shooter;
  if (!shooter) return;

  if (state.entering) {
    shooter.enterTime = Math.min(1, shooter.enterTime + dt * enterSpeed);
    const ease = 1 - Math.pow(1 - shooter.enterTime, 3);
    shooter.x = mix(shooter.startX, launchSpot.x, ease);
    shooter.y = mix(shooter.startY, launchSpot.y, ease);
    shooter.angle = ease * Math.PI * 4;
    if (shooter.enterTime >= 1) {
      shooter.x = launchSpot.x;
      shooter.y = launchSpot.y;
      shooter.angle = 0;
      state.entering = false;
    }
    return;
  }

  if (!state.flying) return;

  if (shooter.returning) {
    const dx = launchSpot.x - shooter.x;
    const dy = launchSpot.y - shooter.y;
    shooter.x += dx * Math.min(1, dt * returnSpeed);
    shooter.y += dy * Math.min(1, dt * returnSpeed);
    shooter.angle += dt * 12;

    if (Math.hypot(dx, dy) < 5) {
      shooter.x = launchSpot.x;
      shooter.y = launchSpot.y;
      shooter.vx = 0;
      shooter.vy = 0;
      shooter.angle = 0;
      shooter.returning = false;
      state.flying = false;
      finishMiss();
    }
    return;
  }

  shooter.x += shooter.vx * dt;
  shooter.y += shooter.vy * dt;
  shooter.vx *= airDrag;
  shooter.vy *= airDrag;
  shooter.angle += Math.hypot(shooter.vx, shooter.vy) * dt * 0.016;
  if (shooter.y < 750) shooter.enteredArena = true;

  if (shooter.x < shooter.r || shooter.x > W - shooter.r) {
    shooter.vx *= -wallBounce;
    shooter.x = Math.max(shooter.r, Math.min(W - shooter.r, shooter.x));
  }

  for (const target of state.targets) {
    if (!target.alive) continue;
    if (distance(shooter, target) < shooter.r + target.r - 8) {
      handleHit(target);
      return;
    }
  }

  if (shooter.y < 64 || (shooter.enteredArena && shooter.y > 770)) {
    failShot(false);
    return;
  }

  if (Math.hypot(shooter.vx, shooter.vy) < 42) {
    failShot(true);
  }
}

function handleHit(target) {
  if (target.isBomb) {
    burst(target.x, target.y, "#ff5a5f");
    state.lose = true;
    state.flying = false;
    showMessage("폭탄을 맞혔어!\n다시 도전!");
    return;
  }

  if (target.isPoop) {
    burst(target.x, target.y, "#8a5a2d");
    target.pop = 1;
    failShot(true);
    return;
  }

  if (target.id === state.shooter.id) {
    target.alive = false;
    state.goalLeft = Math.max(0, state.goalLeft - 1);
    state.score += 100 + state.level * 20;
    state.flying = false;
    state.shooter = null;
    burst(target.x, target.y, target.color);
    updateHud();
    if (state.goalLeft <= 0) {
      state.win = true;
      if (state.level >= maxLevel) {
        showMessage("모두 깼어!\n바근지팡 최고!");
      } else {
        showMessage(`성공!\n${state.level + 1}단계로 가자!`);
      }
    } else {
      setTimeout(spawnShooter, 260);
    }
    return;
  }

  target.pop = 1;
  failShot(true);
}

function failShot(shouldReturn) {
  if (!state.shooter || state.shooter.missed) return;
  state.shooter.missed = true;
  state.shots = Math.max(0, state.shots - 1);
  updateHud();

  if (state.shots <= 0) {
    state.lose = true;
    state.flying = false;
    showMessage("기회 끝!\n다시 해보자");
    return;
  }

  if (shouldReturn) {
    state.shooter.returning = true;
    return;
  }

  state.flying = false;
  state.shooter = null;
  setTimeout(spawnShooter, 220);
}

function finishMiss() {
  state.shooter = null;
  setTimeout(spawnShooter, 170);
}

function burst(x, y, color) {
  for (let i = 0; i < 20; i += 1) {
    state.sparkles.push({
      x: x + Math.cos(i) * Math.random() * 62,
      y: y + Math.sin(i) * Math.random() * 62,
      r: 7 + Math.random() * 12,
      color,
      life: 0.65 + Math.random() * 0.4,
    });
  }
}

function showMessage(text) {
  message.textContent = text;
  message.classList.remove("hidden");
}

function draw() {
  if (!state) return;
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawTargets();
  drawGuide();
  drawLauncher();
  drawSparkles();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#fffdfa");
  gradient.addColorStop(1, "#eef9ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f5fbff";
  ctx.beginPath();
  ctx.roundRect(48, 104, W - 96, 610, 42);
  ctx.fill();

  ctx.strokeStyle = "#d9e0ea";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([8, 18]);
  ctx.beginPath();
  ctx.moveTo(78, 750);
  ctx.lineTo(W - 78, 750);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#6b788a";
  ctx.font = "700 24px 'Segoe UI', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center";
  const goalText = state.goalLeft === 1 ? "같은 친구 1개만 더 맞히면 성공!" : `같은 친구 ${state.goalLeft}개를 더 맞혀요`;
  ctx.fillText(goalText, W / 2, 68);

  if (state.level >= 4) {
    ctx.fillStyle = "#d05f38";
    ctx.fillText("단계가 올라가면 더 작고 빠르게 움직여요", W / 2, 105);
  }
}

function drawTargets() {
  for (const target of state.targets) {
    if (!target.alive) continue;
    if (target.isBomb) {
      drawBomb(target);
    } else if (target.isPoop) {
      drawPoop(target);
    } else {
      drawAnimal(target, target.pop);
    }
  }
}

function drawGuide() {
  ctx.fillStyle = "#253040";
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.arc(launchSpot.x, launchSpot.y, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (!pointer || !state.shooter) return;
  const dx = launchSpot.x - pointer.x;
  const dy = launchSpot.y - pointer.y;
  const len = Math.min(Math.hypot(dx, dy), 190);
  const angle = Math.atan2(dy, dx);

  ctx.strokeStyle = "#ff8a7a";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pointer.x, pointer.y);
  ctx.lineTo(launchSpot.x, launchSpot.y);
  ctx.stroke();

  ctx.strokeStyle = "#4f74cc";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  drawBouncePath(launchSpot.x, launchSpot.y, Math.cos(angle), Math.sin(angle), 1500, state.shooter.r + 18);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBouncePath(x, y, dirX, dirY, length, startOffset = 0) {
  let remaining = length;
  let currentX = x + dirX * startOffset;
  let currentY = y + dirY * startOffset;
  let vx = dirX;
  let vy = dirY;
  const minX = 48;
  const maxX = W - 48;
  const minY = 104;

  ctx.moveTo(currentX, currentY);

  for (let bounce = 0; bounce < 4 && remaining > 0; bounce += 1) {
    let t = remaining;

    if (vx > 0) t = Math.min(t, (maxX - currentX) / vx);
    if (vx < 0) t = Math.min(t, (minX - currentX) / vx);
    if (vy < 0) t = Math.min(t, (minY - currentY) / vy);

    const nextX = currentX + vx * t;
    const nextY = currentY + vy * t;
    ctx.lineTo(nextX, nextY);

    remaining -= t;
    currentX = nextX;
    currentY = nextY;

    if (currentY <= minY + 0.5) break;
    if (currentX <= minX + 0.5 || currentX >= maxX - 0.5) vx *= -1;
  }
}

function drawLauncher() {
  drawHeroQueue();
  ctx.fillStyle = "rgba(255, 138, 122, 0.14)";
  ctx.strokeStyle = "rgba(255, 138, 122, 0.5)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(launchSpot.x, launchSpot.y, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (state.shooter) drawAnimal(state.shooter, 0, true);
}

function drawHeroQueue() {
  const gap = 78;
  const startX = W / 2 - ((state.heroes.length - 1) * gap) / 2;
  ctx.fillStyle = "#e9f7f0";
  ctx.beginPath();
  ctx.roundRect(88, H - 132, W - 176, 92, 36);
  ctx.fill();

  for (let i = 0; i < state.heroes.length; i += 1) {
    const hero = state.heroes[i];
    const isActive = hero.id === state.shooterType.id;
    const mini = {
      ...hero,
      x: startX + i * gap,
      y: queueY,
      r: isActive ? 29 : 24,
    };
    drawAnimal(mini, 0, isActive);
  }
}

function drawAnimal(animal, wobble = 0, isShooter = false) {
  ctx.save();
  ctx.translate(animal.x, animal.y);
  ctx.rotate(animal.angle || 0);
  const scale = 1 + wobble * 0.08;
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(55, 79, 105, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, animal.r * 0.88, animal.r * 0.78, animal.r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = animal.color;
  ctx.strokeStyle = isShooter ? "#253040" : "rgba(37, 48, 64, 0.16)";
  ctx.lineWidth = isShooter ? 5 : 3;
  ctx.beginPath();
  ctx.arc(0, 0, animal.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const image = characterImages.get(animal.id);
  if (image && image.complete && image.naturalWidth) {
    const imageSize = animal.r * 2.18;
    ctx.drawImage(image, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
  } else {
    ctx.fillStyle = "#253040";
    ctx.font = `800 ${Math.max(16, animal.r * 0.45)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(animal.label, 0, 0);
  }

  ctx.restore();

  if (isShooter && animal.r > 34) {
    ctx.fillStyle = "#253040";
    ctx.font = "800 22px 'Segoe UI', 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(animal.label, animal.x, animal.y + animal.r + 34);
  }
}

function drawBomb(bomb) {
  ctx.save();
  ctx.translate(bomb.x, bomb.y);
  ctx.fillStyle = "rgba(55, 79, 105, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, bomb.r * 0.95, bomb.r * 0.75, bomb.r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3b4250";
  ctx.strokeStyle = "#151923";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, bomb.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#ffcf66";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(bomb.r * 0.35, -bomb.r * 0.72);
  ctx.quadraticCurveTo(bomb.r * 0.72, -bomb.r * 1.2, bomb.r * 0.2, -bomb.r * 1.35);
  ctx.stroke();

  ctx.fillStyle = "#ff5a5f";
  ctx.beginPath();
  ctx.arc(bomb.r * 0.19, -bomb.r * 1.36, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 0, 2);
  ctx.restore();
}

function drawPoop(poop) {
  ctx.save();
  ctx.translate(poop.x, poop.y);
  const scale = 1 + poop.pop * 0.1;
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(55, 79, 105, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, poop.r * 0.98, poop.r * 0.75, poop.r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8a5a2d";
  ctx.strokeStyle = "#5f3b1c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 18, 38, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -2, 30, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -20, 20, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff2d8";
  ctx.beginPath();
  ctx.arc(-12, -3, 5, 0, Math.PI * 2);
  ctx.arc(12, -3, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b1b12";
  ctx.beginPath();
  ctx.arc(-11, -2, 2.2, 0, Math.PI * 2);
  ctx.arc(11, -2, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2b1b12";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 8, 8, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawSparkles() {
  for (const sparkle of state.sparkles) {
    ctx.globalAlpha = Math.max(0, sparkle.life);
    ctx.fillStyle = sparkle.color;
    ctx.beginPath();
    ctx.arc(sparkle.x, sparkle.y, sparkle.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

homeBtn.addEventListener("click", () => start(1));
restartBtn.addEventListener("click", () => start(state.level));
nextBtn.addEventListener("click", () => {
  if (state.level >= maxLevel) {
    start(1);
  } else {
    start(state.level + 1);
  }
});

start();
