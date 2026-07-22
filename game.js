const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const levelText = document.getElementById("levelText");
const shotsText = document.getElementById("shotsText");
const timeText = document.getElementById("timeText");
const scoreText = document.getElementById("scoreText");
const message = document.getElementById("message");
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const nameStartBtn = document.getElementById("nameStartBtn");
const rankModal = document.getElementById("rankModal");
const rankList = document.getElementById("rankList");
const rankRestartBtn = document.getElementById("rankRestartBtn");
const soundBtn = document.getElementById("soundBtn");
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
const nicknameKey = "bageunjipang:nickname";
const ranksKey = "bageunjipang:ranks";
const soundKey = "bageunjipang:sound";
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
let holdTimer = null;
let queuePress = null;
let rafId = null;
let lastTime = 0;
let currentPlayer = localStorage.getItem(nicknameKey) || "";
let audioCtx = null;
let musicTimer = null;
let musicStep = 0;
let soundOn = localStorage.getItem(soundKey) === "on";

const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880, 739.99, 659.25, 783.99, 987.77, 783.99, 587.33, 659.25, 739.99, 880];
const bass = [261.63, 261.63, 293.66, 293.66, 329.63, 329.63, 293.66, 392];

function makeLevel(level, resetScore = false) {
  level = Math.max(1, Math.min(level, maxLevel));
  const heroCount = Math.min(3 + Math.floor((level - 1) / 2), 5);
  const heroes = shuffle(animals).slice(0, heroCount);
  const shooterType = heroes[(level - 1) % heroes.length];
  const targets = makeTargets(level, heroes, shooterType);
  const goalTotal = targets.filter((target) => target.isGoal).length;

  return {
    level,
    shots: Math.max(goalTotal + 2, 8 - Math.floor(level / 3)),
    timeLeft: getLevelTime(level),
    totalTime: resetScore ? 0 : (state && state.totalTime) || 0,
    score: resetScore ? 0 : (state && state.score) || 0,
    levelStartTime: resetScore ? 0 : (state && state.totalTime) || 0,
    levelStartScore: resetScore ? 0 : (state && state.score) || 0,
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

    const type = winningSlots.has(i) ? shooterType : pickObstacleAnimal(i, level, shooterType);
    targets.push({
      ...type,
      x,
      y,
      baseX: x,
      baseY: y,
      r: targetRadius,
      alive: true,
      pop: 0,
      isGoal: winningSlots.has(i),
      isBomb: false,
      isPoop: false,
      phase: Math.random() * Math.PI * 2,
      speed: moving ? 0.7 + difficulty * 0.08 + Math.random() * 0.5 : 0,
    });
  }

  return setupOrbitingTargets(shuffle(targets), difficulty);
}

function getLevelTime(level) {
  return Math.max(25, 48 - level * 2);
}

function setupOrbitingTargets(targets, difficulty) {
  const centerX = W / 2;
  const centerY = 285;
  const outerCount = Math.ceil(targets.length / 2);

  return targets.map((target, index) => {
    const outerLane = index < outerCount;
    const laneIndex = outerLane ? index : index - outerCount;
    const laneCount = outerLane ? outerCount : targets.length - outerCount;
    const angle = -Math.PI + (Math.PI * 2 * laneIndex) / Math.max(1, laneCount);
    const speed = (0.32 + difficulty * 0.035) * (outerLane ? 1 : 1.15);

    return {
      ...target,
      orbitCx: centerX,
      orbitCy: centerY + (outerLane ? 6 : 20),
      orbitRx: outerLane ? 312 : 218,
      orbitRy: outerLane ? 132 : 82,
      orbitAngle: angle,
      orbitSpeed: speed,
    };
  });
}

function pickObstacleAnimal(index, level, shooterType) {
  const choices = animals.filter((animal) => animal.id !== shooterType.id);
  return choices[(index + level) % choices.length];
}

function makeBomb(x, y, moving, level) {
  return {
    id: "bomb",
    label: "폭탄",
    color: "#333946",
    x,
    y,
    baseX: x,
    baseY: y,
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
    baseY: y,
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

function start(level = 1, resetScore = false) {
  rankModal.classList.add("hidden");
  state = makeLevel(level, resetScore);
  pointer = null;
  if (holdTimer) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
  queuePress = null;
  lastTime = performance.now();
  message.classList.add("hidden");
  spawnShooter();
  updateHud();
  if (soundOn) startMusic();
  loop();
}

function restartCurrentLevel() {
  if (!state) {
    start(1, true);
    return;
  }

  state.score = state.levelStartScore;
  state.totalTime = state.levelStartTime;
  start(state.level);
}

function updateHud() {
  levelText.textContent = state.level;
  shotsText.textContent = state.shots;
  timeText.textContent = Math.max(0, Math.ceil(state.timeLeft));
  scoreText.textContent = state.score;
  nextBtn.textContent = state.level >= maxLevel ? "처음부터" : "다음 단계";
  soundBtn.textContent = soundOn ? "소리 끄기" : "소리 켜기";
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function setSound(enabled) {
  soundOn = enabled;
  localStorage.setItem(soundKey, enabled ? "on" : "off");
  if (enabled) {
    ensureAudio();
    startMusic();
  } else {
    stopMusic();
  }
  if (state) updateHud();
  else soundBtn.textContent = soundOn ? "소리 끄기" : "소리 켜기";
}

function startMusic() {
  if (!soundOn || musicTimer) return;
  ensureAudio();
  musicTimer = window.setInterval(playMusicStep, 180);
}

function stopMusic() {
  if (!musicTimer) return;
  window.clearInterval(musicTimer);
  musicTimer = null;
}

function playTone(frequency, duration = 0.12, type = "square", volume = 0.045, offset = 0) {
  if (!soundOn || !audioCtx) return;
  const start = audioCtx.currentTime + offset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playNoise(duration = 0.12, volume = 0.08) {
  if (!soundOn || !audioCtx) return;
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  noise.buffer = buffer;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  noise.connect(gain).connect(audioCtx.destination);
  noise.start();
}

function playMusicStep() {
  if (!soundOn || !audioCtx || state?.win || state?.lose) return;
  playTone(melody[musicStep % melody.length], 0.105, "square", 0.026);
  if (musicStep % 2 === 0) playTone(bass[Math.floor(musicStep / 2) % bass.length], 0.14, "triangle", 0.018);
  musicStep += 1;
}

function playPopSound() {
  playTone(784, 0.07, "square", 0.06);
  playTone(1046.5, 0.09, "square", 0.05, 0.055);
}

function playMissSound() {
  playTone(246.94, 0.09, "sawtooth", 0.045);
  playTone(196, 0.12, "sawtooth", 0.04, 0.07);
}

function playBombSound() {
  playNoise(0.18, 0.09);
  playTone(110, 0.18, "sawtooth", 0.05);
}

function playWinSound() {
  playTone(523.25, 0.1, "square", 0.055);
  playTone(659.25, 0.1, "square", 0.055, 0.09);
  playTone(783.99, 0.12, "square", 0.055, 0.18);
  playTone(1046.5, 0.18, "square", 0.05, 0.3);
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
  const hero = getQueueHeroAtPoint(p);
  if (hero) {
    queuePress = { heroId: hero.id, x: p.x, y: p.y, switched: false };
    holdTimer = window.setTimeout(() => {
      queuePress.switched = switchShooter(hero.id);
      holdTimer = null;
    }, 320);
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (distance(p, state.shooter) < 125) {
    pointer = { ...p };
    canvas.setPointerCapture(event.pointerId);
  }
}

function onPointerMove(event) {
  if (queuePress) {
    const p = canvasPoint(event);
    if (Math.hypot(p.x - queuePress.x, p.y - queuePress.y) > 38 && holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
    return;
  }
  if (!pointer || state.flying) return;
  pointer = canvasPoint(event);
  draw();
}

function onPointerUp(event) {
  if (holdTimer) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (queuePress) {
    if (!queuePress.switched) switchShooter(queuePress.heroId);
    queuePress = null;
    return;
  }
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

function getQueueHeroAtPoint(point) {
  const gap = 94;
  const startX = W / 2 - ((state.heroes.length - 1) * gap) / 2;

  for (let i = 0; i < state.heroes.length; i += 1) {
    const hero = state.heroes[i];
    const x = startX + i * gap;
    if (Math.abs(point.x - x) < 48 && Math.abs(point.y - queueY) < 58) return hero;
  }

  return null;
}

function switchShooter(heroId) {
  if (state.flying || state.entering || !state.shooter) return;
  const hero = state.heroes.find((item) => item.id === heroId);
  if (!hero || hero.id === state.shooterType.id) return false;

  state.shooterType = hero;
  state.shooter = null;
  spawnShooter();
  return true;
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
  updateTimer(dt);
  updateSparkles(dt);
  updateTargets(dt, time);
  updateShooter(dt);
}

function updateTimer(dt) {
  if (state.win || state.lose) return;
  state.timeLeft -= dt;
  state.totalTime += dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.lose = true;
    state.flying = false;
    state.shooter = null;
    stopMusic();
    playMissSound();
    updateHud();
    showMessage("시간 끝!\n다시 해보자");
    return;
  }
  updateHud();
}

function cleanName(value) {
  return value
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 10) || "친구";
}

function beginGameFromName() {
  if (soundOn) ensureAudio();
  currentPlayer = cleanName(nameInput.value);
  localStorage.setItem(nicknameKey, currentPlayer);
  nameModal.classList.add("hidden");
  start(1, true);
}

function readRanks() {
  try {
    return JSON.parse(localStorage.getItem(ranksKey) || "[]");
  } catch {
    return [];
  }
}

function saveRank() {
  const ranks = readRanks();
  ranks.push({
    name: currentPlayer || "친구",
    score: state.score,
    totalTime: Math.round(state.totalTime * 10) / 10,
    shots: state.shots,
    date: new Date().toISOString(),
  });
  ranks.sort(compareRanks);
  localStorage.setItem(ranksKey, JSON.stringify(ranks.slice(0, 10)));
}

function compareRanks(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if ((a.totalTime || 9999) !== (b.totalTime || 9999)) return (a.totalTime || 9999) - (b.totalTime || 9999);
  if ((b.shots || 0) !== (a.shots || 0)) return (b.shots || 0) - (a.shots || 0);
  return new Date(a.date) - new Date(b.date);
}

function showRanks() {
  stopMusic();
  const ranks = readRanks();
  rankList.innerHTML = "";
  for (const rank of ranks.slice(0, 5)) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("span");
    const time = document.createElement("span");

    name.className = "rank-name";
    score.className = "rank-score";
    time.className = "rank-time";
    name.textContent = cleanName(rank.name || "");
    score.textContent = `${rank.score}점`;
    time.textContent = `${rank.totalTime || "?"}초`;

    item.append(name, score, time);
    rankList.appendChild(item);
  }
  rankModal.classList.remove("hidden");
}

function updateSparkles(dt) {
  state.sparkles = state.sparkles
    .map((sparkle) => ({ ...sparkle, life: sparkle.life - dt, y: sparkle.y - 65 * dt }))
    .filter((sparkle) => sparkle.life > 0);
}

function updateTargets(dt, time) {
  for (const target of state.targets) {
    if (target.pop > 0) target.pop = Math.max(0, target.pop - dt * 3);
    if (!target.alive) continue;
    target.orbitAngle += target.orbitSpeed * dt;
    target.x = target.orbitCx + Math.cos(target.orbitAngle + target.phase * 0.08) * target.orbitRx;
    target.y = target.orbitCy + Math.sin(target.orbitAngle + target.phase * 0.08) * target.orbitRy;
  }
  separateTargets();
}

function separateTargets() {
  const aliveTargets = state.targets.filter((target) => target.alive);

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < aliveTargets.length; i += 1) {
      for (let j = i + 1; j < aliveTargets.length; j += 1) {
        const a = aliveTargets[i];
        const b = aliveTargets[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceNow = Math.hypot(dx, dy) || 1;
        const minGap = Math.max(56, a.r + b.r + 10);

        if (distanceNow >= minGap) continue;

        const push = (minGap - distanceNow) / 2;
        const nx = dx / distanceNow;
        const ny = dy / distanceNow;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        keepTargetInsideArena(a);
        keepTargetInsideArena(b);
      }
    }
  }
}

function keepTargetInsideArena(target) {
  target.x = Math.max(82, Math.min(W - 82, target.x));
  target.y = Math.max(156, Math.min(672, target.y));
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
    stopMusic();
    playBombSound();
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
    if (target.isGoal) state.goalLeft = Math.max(0, state.goalLeft - 1);
    state.score += target.isGoal ? 100 + state.level * 20 : 40;
    state.flying = false;
    state.shooter = null;
    burst(target.x, target.y, target.color);
    playPopSound();
    updateHud();
    if (target.isGoal && state.goalLeft <= 0) {
      state.win = true;
      playWinSound();
      if (state.level >= maxLevel) {
        saveRank();
        showRanks();
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
  playMissSound();
  updateHud();

  if (state.shots <= 0) {
    state.lose = true;
    state.flying = false;
    stopMusic();
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
  ctx.roundRect(48, 132, W - 96, 582, 42);
  ctx.fill();
  ctx.strokeStyle = "rgba(190, 203, 219, 0.95)";
  ctx.lineWidth = 4;
  ctx.stroke();

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
  ctx.font = "700 21px 'Segoe UI', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center";
  const goalText = state.goalLeft === 1 ? "같은 친구 1개만 더 맞히면 성공!" : `같은 친구 ${state.goalLeft}개를 더 맞혀요`;
  ctx.fillText(goalText, W / 2, 58);

  if (state.level >= 4) {
    ctx.fillStyle = "#d05f38";
    ctx.font = "700 19px 'Segoe UI', 'Noto Sans KR', sans-serif";
    ctx.fillText("더 작고 빠르게 움직여요", W / 2, 88);
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
  drawBouncePath(launchSpot.x, launchSpot.y, Math.cos(angle), Math.sin(angle), 3200, state.shooter.r + 18);
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

  for (let bounce = 0; bounce < 9 && remaining > 0; bounce += 1) {
    let t = remaining;

    if (vx > 0) t = Math.min(t, (maxX - currentX) / vx);
    if (vx < 0) t = Math.min(t, (minX - currentX) / vx);
    if (vy < 0) t = Math.min(t, (minY - currentY) / vy);
    if (t <= 0.01) break;

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
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(launchSpot.x, launchSpot.y, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (state.shooter) drawAnimal(state.shooter, 0, true);
}

function drawHeroQueue() {
  const gap = 94;
  const startX = W / 2 - ((state.heroes.length - 1) * gap) / 2;
  ctx.fillStyle = "#e9f7f0";
  ctx.beginPath();
  ctx.roundRect(58, H - 144, W - 116, 112, 40);
  ctx.fill();
  ctx.strokeStyle = "rgba(165, 204, 186, 0.95)";
  ctx.lineWidth = 4;
  ctx.stroke();

  for (let i = 0; i < state.heroes.length; i += 1) {
    const hero = state.heroes[i];
    const isActive = hero.id === state.shooterType.id;
    const mini = {
      ...hero,
      x: startX + i * gap,
      y: queueY,
      r: isActive ? 40 : 34,
      suppressLabel: true,
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

  if (isShooter && animal.r > 34 && !animal.suppressLabel) {
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

  ctx.fillStyle = "#ffcf66";
  ctx.font = "900 26px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("*", 0, 4);
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

nameStartBtn.addEventListener("click", beginGameFromName);
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") beginGameFromName();
});
rankRestartBtn.addEventListener("click", () => start(1, true));
soundBtn.addEventListener("click", () => setSound(!soundOn));
homeBtn.addEventListener("click", () => start(1, true));
restartBtn.addEventListener("click", restartCurrentLevel);
nextBtn.addEventListener("click", () => {
  if (state.level >= maxLevel) {
    start(1, true);
  } else {
    start(state.level + 1);
  }
});

nameInput.value = currentPlayer;
soundBtn.textContent = soundOn ? "소리 끄기" : "소리 켜기";

if (currentPlayer) {
  nameModal.classList.add("hidden");
  start(1, true);
} else {
  setTimeout(() => nameInput.focus(), 100);
}
