(() => {
'use strict';

// ============================================================
// ==== КОНФИГУРАЦИЯ EMAILJS ====
// ============================================================
const EMAILJS_SERVICE_ID  = '67';                 // ← твой Service ID
const EMAILJS_TEMPLATE_ID = 'template_34dyryd';   // ← твой Template ID
const EMAILJS_PUBLIC_KEY  = '-TOpiRq_dmU1oSU3i';  // ← твой Public Key

function isEmailJSReady() {
  return typeof emailjs !== 'undefined'
      && EMAILJS_SERVICE_ID  !== 'YOUR_SERVICE_ID'
      && EMAILJS_TEMPLATE_ID !== 'YOUR_TEMPLATE_ID'
      && EMAILJS_PUBLIC_KEY  !== 'YOUR_PUBLIC_KEY';
}

if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
  try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); }
  catch (e) { console.warn('EmailJS init error:', e); }
}
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const rotateEl = document.getElementById('rotate');
let W = 0, H = 0, DPR = 1, S = 1;
let bgCanvas = null, isLandscape = true;
const keys = { left:false, right:false, jump:false, shoot:false };
let jumpBuffer = 0;
const buttons = {
  left:  { x:0, y:0, r:0, pressed:false },
  right: { x:0, y:0, r:0, pressed:false },
  jump:  { x:0, y:0, r:0, pressed:false },
  shoot: { x:0, y:0, r:0, pressed:false },
};
let uiState = 'auth';
let draggingButton = null, draggingOffsetX = 0, draggingOffsetY = 0;
let customButtonScale = 1.0, customPositions = null;
const pauseButton = { x:0, y:0, r:0 };
let difficulty = 'medium';
const DIFFICULTY_SETTINGS = {
  easy:   { bossHp: 8,  coinMin: 0, coinMax: 1 },
  medium: { bossHp: 12, coinMin: 1, coinMax: 2 },
  hard:   { bossHp: 20, coinMin: 2, coinMax: 3 },
};
const BOSS_REWARDS = { easy: 10, medium: 15, hard: 50 };
let bossMaxHp = 12;
const SKINS = [
  { id: 'default',    name: 'Оригинал',   price: 0   },
  { id: 'background', name: 'Фон игры',   price: 50  },
  { id: 'blackboard', name: 'Шк. доска',  price: 100 },
  { id: 'ghost',      name: 'Привидение', price: 150 },
  { id: 'toilet',     name: 'Унитаз',     price: 200 },
];
let totalCoins = 0, ownedSkins = ['default'], currentSkin = 'default';
function saveProgress() { try { localStorage.setItem('chairsVsDesks', JSON.stringify({ coins: totalCoins, owned: ownedSkins, skin: currentSkin })); } catch(e) {} }
function loadProgress() {
  try {
    const raw = localStorage.getItem('chairsVsDesks'); if (!raw) return;
    const d = JSON.parse(raw);
    if (typeof d.coins === 'number') totalCoins = d.coins;
    if (Array.isArray(d.owned)) ownedSkins = d.owned;
    if (typeof d.skin === 'string') currentSkin = d.skin;
    if (!ownedSkins.includes('default')) ownedSkins.push('default');
  } catch(e) {}
}
let platforms = [], spikes = [], ghosts = [], levelCoins = [], orbs = [], debris = [], saws = [], springs = [], portals = [];
let ghostParticles = [];
let cyclicSpikes = [];
let cannon = null;
let cannonBalls = [];
let gravityDir = 1;
let player = null, goal = null, startPlatform = null;
let score = 0, gameOver = false;
let checkpointLevel = 1;
const CHECKPOINT_LEVELS = [5, 10];
const TOTAL_LEVELS = 12;
let lives = 3, invulnTimer = 0, hitFlash = 0;
const INVULN_TIME = 1.5;
let introTimer = -1;
let isBossLevel = false, boss = null;
let postBossPhase = 'none', postBossTimer = 0;
let victoryTextAlpha = 1, continuingTextAlpha = 0;
const VICTORY_TIME = 5.0, FADE_TIME = 0.6, CONTINUING_TIME = 5.0;
let lastBossReward = 0, bossIntroTimer = 0;
const BASE_BREAK_DURATION = 2.0;
let platformSpeedMult = 1.0, breakDuration = BASE_BREAK_DURATION, sawSpeedMult = 1.0, cannonInterval = 3.0;
let conveyorSpeedMult = 1.0;
const PLATFORM_SPEED = 2.1;
const GHOST_SPEED = 1.4;
const HITBOX_W = 34;

// ==== АУТЕНТИФИКАЦИЯ ====
const authEmailEl = document.getElementById('authEmail');
const authPasswordEl = document.getElementById('authPassword');
const authCodeEl = document.getElementById('authCode');
let pendingRegEmail = '';
let pendingRegCode = '';
let authToast = '';
let authToastTimer = 0;
let authSuccessTimer = 0;
let loggedInEmail = '';
let sendingCode = false;

function loadAccounts() {
  try { const r = localStorage.getItem('chairsAccounts'); return r ? JSON.parse(r) : {}; } catch(e) { return {}; }
}
function saveAccounts(a) { try { localStorage.setItem('chairsAccounts', JSON.stringify(a)); } catch(e) {} }
function hashPassword(p) {
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0;
  return 'h' + h.toString(16);
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function generateCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function hideAllAuthInputs() {
  authEmailEl.style.display = 'none';
  authPasswordEl.style.display = 'none';
  authCodeEl.style.display = 'none';
  try { authEmailEl.blur(); authPasswordEl.blur(); authCodeEl.blur(); } catch(e) {}
}
function layoutAuthInputs() {
  const inH = Math.max(44, Math.min(52, 50 * S));
  const inW = Math.min(W * 0.55, 320 * S);
  [authEmailEl, authPasswordEl, authCodeEl].forEach(el => {
    el.style.width = inW + 'px';
    el.style.height = inH + 'px';
    el.style.fontSize = Math.max(16, Math.min(22, 20 * S)) + 'px';
  });
  const vh = window.innerHeight || H;
  const gap = 14;
  if (uiState === 'authLogin') {
    const baseTop = Math.max(58, vh * 0.16);
    authEmailEl.style.top = baseTop + 'px';
    authPasswordEl.style.top = (baseTop + inH + gap) + 'px';
  } else if (uiState === 'authRegisterEmail' || uiState === 'authRegisterCode' || uiState === 'authRegisterPassword') {
    const top = Math.max(58, vh * 0.24);
    authEmailEl.style.top = top + 'px';
    authPasswordEl.style.top = top + 'px';
    authCodeEl.style.top = top + 'px';
  }
}
function goToAuth() {
  hideAllAuthInputs();
  uiState = 'auth';
}
function goToAuthLogin() {
  hideAllAuthInputs();
  authEmailEl.value = ''; authPasswordEl.value = '';
  uiState = 'authLogin';
  layoutAuthInputs();
  authEmailEl.style.display = 'block';
  authPasswordEl.style.display = 'block';
  setTimeout(() => { try { authEmailEl.focus(); } catch(e) {} }, 80);
}
function goToAuthRegister() {
  hideAllAuthInputs();
  pendingRegEmail = ''; pendingRegCode = '';
  uiState = 'authRegisterEmail';
  authEmailEl.value = '';
  layoutAuthInputs();
  authEmailEl.style.display = 'block';
  setTimeout(() => { try { authEmailEl.focus(); } catch(e) {} }, 80);
}
function submitAuthLogin() {
  const email = (authEmailEl.value || '').trim().toLowerCase();
  const pass = authPasswordEl.value || '';
  if (!isValidEmail(email)) { authToast = 'Некорректный email'; authToastTimer = 3; return; }
  if (!pass) { authToast = 'Введите пароль'; authToastTimer = 3; return; }
  const acc = loadAccounts();
  if (!acc[email]) { authToast = 'Аккаунт не найден'; authToastTimer = 3; return; }
  if (acc[email].password !== hashPassword(pass)) { authToast = 'Неверный пароль'; authToastTimer = 3; return; }
  loggedInEmail = email;
  hideAllAuthInputs();
  authToast = 'Добро пожаловать!'; authToastTimer = 2;
  uiState = 'menu';
}
function submitAuthRegisterEmail() {
  if (sendingCode) return;
  const email = (authEmailEl.value || '').trim().toLowerCase();
  if (!isValidEmail(email)) { authToast = 'Некорректный email'; authToastTimer = 3; return; }
  const acc = loadAccounts();
  if (acc[email]) { authToast = 'Аккаунт уже существует'; authToastTimer = 3; return; }

  pendingRegEmail = email;
  pendingRegCode = generateCode();

  if (!isEmailJSReady()) {
    authToast = 'Демо: код ' + pendingRegCode; authToastTimer = 8;
    hideAllAuthInputs();
    uiState = 'authRegisterCode';
    authCodeEl.value = pendingRegCode;
    layoutAuthInputs();
    authCodeEl.style.display = 'block';
    setTimeout(() => { try { authCodeEl.focus(); authCodeEl.select(); } catch(e) {} }, 80);
    return;
  }

  sendingCode = true;
  authToast = 'Отправляем код на ' + email + '...'; authToastTimer = 8;

  const templateParams = {
    to_email:          email,
    verification_code: pendingRegCode,
    app_name:          'Стулья против Парт',
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
    .then(function() {
      sendingCode = false;
      authToast = 'Код отправлен! Проверьте почту и папку «Спам»'; authToastTimer = 5;
      hideAllAuthInputs();
      uiState = 'authRegisterCode';
      authCodeEl.value = '';
      layoutAuthInputs();
      authCodeEl.style.display = 'block';
      setTimeout(() => { try { authCodeEl.focus(); } catch(e) {} }, 80);
    })
    .catch(function(err) {
      sendingCode = false;
      console.error('EmailJS error:', err);
      let msg = 'Не удалось отправить код';
      if (err && err.text) msg = err.text;
      else if (err && err.message) msg = err.message;
      authToast = 'Ошибка: ' + msg;
      authToastTimer = 6;
    });
}
function submitAuthRegisterCode() {
  const code = (authCodeEl.value || '').replace(/\D/g, '').slice(0, 6);
  if (code !== pendingRegCode) { authToast = 'Неверный код'; authToastTimer = 3; return; }
  hideAllAuthInputs();
  authPasswordEl.value = '';
  uiState = 'authRegisterPassword';
  authToast = 'Придумайте пароль'; authToastTimer = 3;
  layoutAuthInputs();
  authPasswordEl.style.display = 'block';
  setTimeout(() => { try { authPasswordEl.focus(); } catch(e) {} }, 80);
}
function submitAuthRegisterPassword() {
  const pass = authPasswordEl.value || '';
  if (pass.length < 4) { authToast = 'Пароль мин. 4 символа'; authToastTimer = 3; return; }
  const acc = loadAccounts();
  acc[pendingRegEmail] = { password: hashPassword(pass) };
  saveAccounts(acc);
  loggedInEmail = pendingRegEmail;
  hideAllAuthInputs();
  pendingRegEmail = ''; pendingRegCode = '';
  authToast = ''; authToastTimer = 0;
  authSuccessTimer = 2.5;
  uiState = 'authSuccess';
}
document.getElementById('authForm').addEventListener('submit', e => {
  e.preventDefault();
  if (uiState === 'authLogin') submitAuthLogin();
  else if (uiState === 'authRegisterEmail') submitAuthRegisterEmail();
  else if (uiState === 'authRegisterCode') submitAuthRegisterCode();
  else if (uiState === 'authRegisterPassword') submitAuthRegisterPassword();
});

function getMovingPlatformSpeedMult() { if (difficulty === 'easy') return 0.5; if (difficulty === 'medium') return 1 / 1.5; return 1.0; }
function getBreakTimeMult() { if (difficulty === 'medium') return 1 / 1.5; if (difficulty === 'hard') return 0.5; return 1.0; }
function getSawSpeedMult() { if (difficulty === 'easy') return 0.5; if (difficulty === 'medium') return 1 / 1.5; return 1.0; }
function getCannonInterval() { if (difficulty === 'easy') return 4.0; if (difficulty === 'hard') return 2.0; return 3.0; }
function getConveyorSpeedMult() { if (difficulty === 'medium') return 1.5; if (difficulty === 'hard') return 2.0; return 1.0; }

loadProgress();

function openWithdraw() { uiState = 'withdraw'; }

function updateOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  isLandscape = !(portrait && isTouch);
  rotateEl.style.display = isLandscape ? 'none' : 'flex';
  return isLandscape;
}
function tryLockLandscape() { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }
function isCinematic() { return postBossPhase !== 'none'; }
function pointInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function pointInCircle(px, py, c, m) { m = m || 1; const dx = px - c.x, dy = py - c.y; return dx*dx+dy*dy <= (c.r*m)*(c.r*m); }
function aabb(a, b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }

const LEVEL_DATA = [
  { name:'Первый звонок', hasFloor:false,
    plats:[[20,310,100,14,{start:1}],[180,300,90,14],[350,270,90,14],[520,260,90,14],[690,285,90,14],[820,305,90,14,{goalPlat:1}]],
    spikes:[], ghosts:[], coins:[[240,230],[580,190],[740,215]], goalX:850, goalY:245 },
  { name:'Клякса', hasFloor:true, floorY:380,
    floorSegments:[[-50,150],[230,460],[540,680],[760,1250]],
    plats:[[20,380,100,14,{start:1}],[310,300,80,14]],
    spikes:[[340,366,20,14]], ghosts:[[610,350,70]],
    coins:[[190,300],[500,300],[720,300]], goalX:850, goalY:320 },
  { name:'Золотой орб', hasFloor:true, floorY:380,
    floorSegments:[[-50,250],[450,640],[800,1250]],
    plats:[[20,320,100,14,{start:1}]], spikes:[], ghosts:[],
    orbs:[[350,290,'yellow'],[720,275,'yellow']],
    coins:[[140,300],[540,300]], goalX:850, goalY:320 },
  { name:'Хрупкие парты', hasFloor:false,
    plats:[[20,340,90,14,{start:1}],
      [180,320,80,14,{type:'moving',axis:'x',range:70,speed:2.1}],
      [380,280,80,14,{type:'moving',axis:'y',range:70,speed:2.1}],
      [560,300,80,14,{type:'moving',axis:'x',range:70,speed:2.1}],
      [730,270,80,14,{type:'moving',axis:'y',range:60,speed:2.1}],
      [830,320,90,14,{goalPlat:1}]],
    spikes:[], ghosts:[], coins:[[240,240],[600,220]], goalX:855, goalY:260 },
  { name:'Пружинные парты', hasFloor:false,
    plats:[[20,340,90,14,{start:1}],[180,330,80,14,{type:'breakable'}],[360,300,80,14,{type:'breakable'}],
      [540,280,80,14,{type:'breakable'}],[720,300,80,14,{type:'breakable'}],
      [830,320,90,14,{goalPlat:1}]],
    spikes:[], ghosts:[], coins:[[220,250],[570,220]], goalX:855, goalY:260 },
  { name:'Пружины', hasFloor:true, floorY:380,
    floorSegments:[[-50,240],[470,1250]],
    plats:[[20,320,100,14,{start:1}],[200,220,100,14],[360,240,90,14],[560,120,130,14],[780,110,90,14,{goalPlat:1}]],
    springs:[[140,'yellow'],[500,'red']],
    spikes:[], ghosts:[], coins:[[250,180],[630,80],[820,60]], goalX:800, goalY:50 },
  { name:'Циркулярки', hasFloor:true, floorY:380,
    floorSegments:[[-50,640],[815,1250]],
    plats:[[20,380,100,14,{start:1}],[280,300,100,14],[660,300,110,14,{type:'breakable'}],[820,260,80,14,{goalPlat:1}]],
    saws:[[200,362,18,[[200,362]],0],[330,362,18,[[330,362],[480,362]],2.5],[567,362,18,[[567,362]],0]],
    spikes:[], ghosts:[], coins:[[330,250],[860,190]], goalX:835, goalY:200 },
  { name:'Лёд и конвейер', hasFloor:false,
    plats:[[-50,380,150,60,{ground:1}],[20,340,90,14,{start:1}],[170,320,120,14,{type:'ice'}],
      [350,300,120,14,{type:'conveyor',conveyorDir:-1}],[560,280,120,14,{type:'ice'}],
      [720,300,100,14,{type:'conveyor',conveyorDir:1}],[830,340,90,14,{goalPlat:1}]],
    spikes:[], ghosts:[], coins:[[280,250],[620,220]], goalX:855, goalY:280 },
  { name:'Ловушки', hasFloor:true, floorY:380,
    floorSegments:[[-50, 130], [310, 390], [570, 950]],
    plats:[[20, 380, 100, 14, {start:1}],[130, 414, 180, 60, {ground:1}],[390, 414, 180, 60, {ground:1}],[820, 300, 80, 14, {goalPlat:1}]],
    spikes:[],
    verticalSpikes:[[130, 380, 14, 34, 'right'],[296, 380, 14, 34, 'left'],[390, 380, 14, 34, 'right'],[556, 380, 14, 34, 'left']],
    cyclicSpikesList:[{ x: 310, y: 380, w: 34 },{ x: 356, y: 380, w: 34 }],
    cannon:{ x: 845, y: 347 },
    ghosts:[[205, 384, 75], [465, 384, 75]],
    coins:[[60, 340], [650, 340]], goalX: 850, goalY: 240 },
  { name:'Вверх ногами', hasFloor:true, floorY:380,
    floorSegments:[[-50, 300], [640, 1250]],
    plats: [],
    spikes: [],
    dynamicCeiling: {
      y: 50, h: 20, gapStart: 250, gapEnd: 640,
      insets: { easy: 0, medium: 1, hard: 2 }
    },
    portals:[
      {x:250, y:300, w:30, h:80, type:'blue'}
    ],
    ghosts: [], coins:[[200, 340], [760, 340]], goalX: 820, goalY: 320 },
  { name:'Орбы и потолок', hasFloor:true, floorY:380,
    floorSegments:[[-50, 300], [810, 878]],
    plats:[
      [20, 380, 100, 14, {start:1}],
      [820, 180, 160, 15, {goalPlat:1}]
    ],
    spikes:[],
    dynamicCeiling: {
      y: 50, h: 20, gapStart: 385, gapEnd: 725,
      insets: { easy: 0, medium: 0, hard: 0 },
      noPortal: true
    },
    orbs:[
      [334, 290, 'yellow'],
      [390, 250, 'gravityUp'],
      [790, 173, 'gravityDown'],
      [790, 350, 'red']
    ],
    ghosts:[], coins:[[150, 340], [820, 340]],
    goalX: 870, goalY: 120 },
  { name:'Вентилятор', hasFloor:true, floorY:380,
    plats:[[20,340,90,14,{start:1}],[200,300,80,14],[400,240,80,14],[600,260,80,14],[790,320,100,14,{goalPlat:1}]],
    spikes:[[320,366,20,14],[560,366,20,14]], ghosts:[[660,350,90]],
    coins:[[240,200],[440,150],[640,170]], goalX:820, goalY:260 },
];

function buildBackground() {
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.max(1, Math.floor(W));
  bgCanvas.height = Math.max(1, Math.floor(H));
  const b = bgCanvas.getContext('2d');
  const h3 = H / 3;
  b.fillStyle = '#ffffff'; b.fillRect(0, 0, W, h3);
  b.fillStyle = '#169b62'; b.fillRect(0, h3, W, h3);
  b.fillStyle = '#ff821e'; b.fillRect(0, 2*h3, W, H - 2*h3);
  const cx = W/2, cy = H/2, R = Math.min(W, H) * 0.20;
  b.fillStyle = '#c81e1e';
  b.beginPath(); b.arc(cx, cy, R, 0, Math.PI * 2); b.fill();
  const ss = R * 0.78;
  b.save();
  b.translate(cx, cy); b.scale(-1, 1); b.rotate(-130 * Math.PI / 180);
  b.translate(0.130 * ss, 0.218 * ss);
  drawHammerSickle(b, 0, 0, ss);
  b.restore();
}
function drawHammerSickle(c, cx, cy, size) {
  const gold = '#ffd700';
  c.save(); c.translate(cx, cy);
  const arcR = size*0.62, arcA0 = Math.PI*0.85, arcA1 = Math.PI*1.85, arcMid = (arcA0+arcA1)/2;
  c.beginPath(); c.arc(0, 0, arcR, arcA0, arcA1);
  c.strokeStyle = gold; c.lineWidth = size*0.20; c.lineCap = 'butt'; c.stroke();
  c.fillStyle = gold;
  c.fillRect(-size*0.90, size*0.18, size*0.40, size*0.16);
  c.save(); c.rotate(arcMid); c.fillStyle = gold;
  const ie = 0.65*size, oe = 0.25*size;
  c.fillRect(arcR-ie, -size*0.08, ie+oe, size*0.16);
  c.fillRect(arcR-ie-size*0.26, -size*0.26, size*0.26, size*0.52);
  c.restore(); c.restore();
}
function drawMiniHammerSickleCtx(cxx, cyy, size) {
  const gold = '#ffd700';
  ctx.save();
  ctx.translate(cxx, cyy); ctx.scale(-1, 1); ctx.rotate(-130 * Math.PI / 180);
  const arcR = size * 0.55;
  ctx.beginPath(); ctx.arc(0, 0, arcR, Math.PI * 0.85, Math.PI * 1.85);
  ctx.strokeStyle = gold; ctx.lineWidth = size * 0.18; ctx.lineCap = 'butt'; ctx.stroke();
  ctx.fillStyle = gold;
  ctx.fillRect(-size * 0.85, size * 0.15, size * 0.35, size * 0.14);
  const arcMid = Math.PI * 1.35;
  ctx.save(); ctx.rotate(arcMid);
  const innerExt = size * 0.55, outerExt = size * 0.20;
  ctx.fillRect(arcR - innerExt, -size * 0.07, innerExt + outerExt, size * 0.14);
  ctx.fillRect(arcR - innerExt - size * 0.22, -size * 0.22, size * 0.22, size * 0.44);
  ctx.restore(); ctx.restore();
}

function newGame() {
  score = 0; gameOver = false;
  lives = 3; invulnTimer = 0; hitFlash = 0;
  introTimer = -1; isBossLevel = false; boss = null;
  debris = []; ghostParticles = [];
  cannonBalls = []; cannon = null; cyclicSpikes = [];
  portals = []; gravityDir = 1;
  checkpointLevel = 1; bossIntroTimer = 0;
  postBossPhase = 'none'; postBossTimer = 0;
  victoryTextAlpha = 1; continuingTextAlpha = 0;
  lastBossReward = 0;
  generateLevel();
}
function respawnGame() {
  if (checkpointLevel <= 1) { newGame(); return; }
  score = checkpointLevel - 1; gameOver = false;
  lives = 3; invulnTimer = 0; hitFlash = 0;
  isBossLevel = false; boss = null;
  debris = []; ghostParticles = [];
  cannonBalls = []; cannon = null; cyclicSpikes = [];
  portals = []; gravityDir = 1;
  bossIntroTimer = 0;
  postBossPhase = 'none'; postBossTimer = 0;
  victoryTextAlpha = 1; continuingTextAlpha = 0;
  lastBossReward = 0;
  generateLevel();
}
function startGameWithDifficulty(diff) {
  difficulty = diff;
  bossMaxHp = DIFFICULTY_SETTINGS[diff].bossHp;
  platformSpeedMult = getMovingPlatformSpeedMult();
  breakDuration = BASE_BREAK_DURATION * getBreakTimeMult();
  sawSpeedMult = getSawSpeedMult();
  cannonInterval = getCannonInterval();
  conveyorSpeedMult = getConveyorSpeedMult();
  uiState = 'playing'; newGame();
}
function resetToMenu() { score = 0; checkpointLevel = 1; gameOver = false; uiState = 'menu'; }

function resize() {
  updateOrientation();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  S = Math.max(0.5, Math.min(W / 900, H / 420, 1.3));
  if (W < 100 || H < 100) return;
  layoutButtons();
  buildBackground();
  if (uiState === 'authLogin' || uiState === 'authRegisterEmail' || uiState === 'authRegisterCode' || uiState === 'authRegisterPassword') {
    layoutAuthInputs();
  }
  if (uiState === 'auth' || uiState === 'authLogin' || uiState === 'authRegisterEmail' || uiState === 'authRegisterCode' || uiState === 'authRegisterPassword' || uiState === 'authSuccess' || uiState === 'menu' || uiState === 'settings' || uiState === 'difficulty' || uiState === 'shop' || uiState === 'withdraw') return;
  if (player && !gameOver && !isCinematic() && !isBossLevel) {
    const ks = score, kl = lives;
    buildLevel(score + 1);
    score = ks; lives = kl;
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 350));

function layoutButtons() {
  const autoR = Math.max(24, Math.min(W, H) * 0.105);
  const baseR = autoR * customButtonScale;
  if (customPositions) {
    for (const n of ['left','right','jump','shoot']) {
      const b = buttons[n]; const cp = customPositions[n];
      b.x = cp.rx * W; b.y = cp.ry * H;
      b.r = baseR * ((n === 'jump' || n === 'shoot') ? 1.12 : 1);
    }
  } else {
    const r = baseR, margin = r * 0.4, y = H - r - margin;
    buttons.left.r = r;   buttons.left.x = margin + r;        buttons.left.y = y;
    buttons.right.r = r;  buttons.right.x = margin + r*3.3;   buttons.right.y = y;
    buttons.jump.r = r*1.12;  buttons.jump.x = W - margin - buttons.jump.r; buttons.jump.y = y;
    buttons.shoot.r = r*1.12; buttons.shoot.x = buttons.jump.x - buttons.jump.r - r*0.85; buttons.shoot.y = y;
  }
  const pr = Math.max(18, Math.min(W, H) * 0.038);
  pauseButton.r = pr; pauseButton.x = W / 2; pauseButton.y = pr + 10 * S;
}
function dismissIntroFast() { if (introTimer !== 0) introTimer = 0.5; }
function dismissBossIntro() { if (bossIntroTimer !== 0) bossIntroTimer = 0.5; }
function updateButtonsFromTouches(touches) {
  const st = { left:false, right:false, jump:false, shoot:false };
  for (const t of touches) {
    for (const name of ['left','right','jump','shoot']) {
      const b = buttons[name];
      const dx = t.clientX - b.x, dy = t.clientY - b.y;
      if (dx*dx + dy*dy < b.r*b.r*1.3) st[name] = true;
    }
  }
  if (st.jump && !keys.jump) jumpBuffer = 0.15;
  if (st.left || st.right || st.jump || st.shoot) dismissIntroFast();
  keys.left = st.left; keys.right = st.right; keys.jump = st.jump; keys.shoot = st.shoot;
  buttons.left.pressed = st.left; buttons.right.pressed = st.right;
  buttons.jump.pressed = st.jump; buttons.shoot.pressed = st.shoot;
}

function getAuthChoiceButtons() {
  const bw = Math.min(W * 0.55, 380 * S);
  const bh = Math.max(44, Math.min(58 * S, 58));
  const gap = Math.max(10, 14 * S);
  const cy = H * 0.58;
  return {
    login:    { x: W/2 - bw/2, y: cy - bh - gap/2, w: bw, h: bh },
    register: { x: W/2 - bw/2, y: cy + gap/2,      w: bw, h: bh },
  };
}
function getAuthActionButtons() {
  const vh = window.innerHeight || H;
  const bw = Math.min(W * 0.5, 340 * S);
  const bh = Math.max(42, Math.min(52 * S, 52));
  const inH = Math.max(44, Math.min(52, 50 * S));
  let baseTop, inputCount;
  if (uiState === 'authLogin') { baseTop = Math.max(58, vh * 0.16); inputCount = 2; }
  else { baseTop = Math.max(58, vh * 0.24); inputCount = 1; }
  const submitY = baseTop + inputCount * (inH + 14) + 8;
  const backY = submitY + bh + 8;
  return {
    submit: { x: W/2 - bw/2, y: submitY, w: bw, h: bh },
    back:   { x: W/2 - bw/2, y: backY,   w: bw, h: bh },
  };
}
function getMenuButtons() {
  const fs = Math.max(28, Math.min(W * 0.085, H * 0.16));
  const tb = H * 0.20 + fs * 0.72 + 8 * S;
  const av = Math.max(120 * S, H - 14 * S - tb);
  let gap = av * 0.04;
  let bh = (av - gap * 3) / 4;
  bh = Math.max(30, Math.min(bh, 56 * S));
  gap = Math.max(6, Math.min(gap, bh * 0.25));
  const tH = bh * 4 + gap * 3;
  const startY = Math.min(tb + Math.max(0, (av - tH)/2), H - 14*S - tH);
  const bw = Math.min(W * 0.55, 380 * S), cx = W / 2;
  return {
    play:     { x: cx - bw/2, y: startY,                  w: bw, h: bh },
    shop:     { x: cx - bw/2, y: startY + bh + gap,       w: bw, h: bh },
    settings: { x: cx - bw/2, y: startY + (bh + gap) * 2, w: bw, h: bh },
    withdraw: { x: cx - bw/2, y: startY + (bh + gap) * 3, w: bw, h: bh },
  };
}
function getDifficultyButtons() {
  const bw = Math.min(W * 0.24, 200 * S), bh = Math.max(50, 74 * S);
  const gap = bw * 0.18, cx = W / 2, cy = H * 0.55;
  const tW = bw * 3 + gap * 2, sx = cx - tW / 2;
  const bW = Math.max(120, 160 * S), bH = Math.max(38, 50 * S);
  return {
    easy:   { x: sx, y: cy - bh/2, w: bw, h: bh },
    medium: { x: sx + bw + gap, y: cy - bh/2, w: bw, h: bh },
    hard:   { x: sx + (bw+gap)*2, y: cy - bh/2, w: bw, h: bh },
    back:   { x: cx - bW/2, y: cy + bh*0.9, w: bW, h: bH },
  };
}
function getPauseButtons() {
  const bw = Math.min(W * 0.5, 340 * S), bh = Math.max(50, 74 * S);
  const gap = bh * 0.4, cx = W / 2, cy = H / 2;
  return {
    resume: { x: cx - bw/2, y: cy - bh - gap/2, w: bw, h: bh },
    menu:   { x: cx - bw/2, y: cy + gap/2,      w: bw, h: bh },
  };
}
function getSettingsButtons() {
  const size = Math.max(44, 60 * S), cy = 90 * S;
  const bW = Math.max(120, 160 * S), bH = Math.max(38, 50 * S);
  const rW = Math.max(140, 180 * S);
  return {
    minus: { x: W/2 - size*2.2, y: cy - size/2, w: size, h: size },
    plus:  { x: W/2 + size*1.2, y: cy - size/2, w: size, h: size },
    reset: { x: W/2 - rW/2, y: H - size*2.6, w: rW, h: 44 * S },
    back:  { x: W/2 - bW/2, y: H - size*1.6, w: bW, h: bH },
  };
}
function getShopCards() {
  const cW = Math.min(W * 0.165, 128 * S), cH = Math.min(H * 0.58, 240 * S);
  const gap = Math.min(W * 0.014, 12 * S), n = SKINS.length;
  const tW = cW * n + gap * (n - 1);
  const sx = W/2 - tW/2, y = H * 0.52 - cH/2 + 10 * S;
  const cards = [];
  for (let i = 0; i < n; i++) cards.push({ id: SKINS[i].id, x: sx + (cW+gap)*i, y, w: cW, h: cH });
  const bW = Math.max(120, 160 * S), bH = Math.max(38, 50 * S);
  return {
    cards,
    back: { x: W/2 - bW/2, y: H - bH - 12 * S, w: bW, h: bH },
  };
}

function handleUIPointerDown(px, py) {
  if (uiState === 'auth') {
    const b = getAuthChoiceButtons();
    if (pointInRect(px, py, b.login)) { goToAuthLogin(); return true; }
    if (pointInRect(px, py, b.register)) { goToAuthRegister(); return true; }
    return true;
  }
  if (uiState === 'authLogin') {
    const b = getAuthActionButtons();
    if (pointInRect(px, py, b.submit)) { submitAuthLogin(); return true; }
    if (pointInRect(px, py, b.back)) { goToAuth(); return true; }
    return true;
  }
  if (uiState === 'authRegisterEmail') {
    const b = getAuthActionButtons();
    if (pointInRect(px, py, b.submit)) { submitAuthRegisterEmail(); return true; }
    if (pointInRect(px, py, b.back)) { goToAuth(); return true; }
    return true;
  }
  if (uiState === 'authRegisterCode') {
    const b = getAuthActionButtons();
    if (pointInRect(px, py, b.submit)) { submitAuthRegisterCode(); return true; }
    if (pointInRect(px, py, b.back)) { goToAuth(); return true; }
    return true;
  }
  if (uiState === 'authRegisterPassword') {
    const b = getAuthActionButtons();
    if (pointInRect(px, py, b.submit)) { submitAuthRegisterPassword(); return true; }
    if (pointInRect(px, py, b.back)) { goToAuth(); return true; }
    return true;
  }
  if (uiState === 'authSuccess') {
    uiState = 'menu';
    return true;
  }
  if (uiState === 'menu') {
    const b = getMenuButtons();
    if (pointInRect(px, py, b.play)) { uiState = 'difficulty'; return true; }
    if (pointInRect(px, py, b.shop)) { uiState = 'shop'; return true; }
    if (pointInRect(px, py, b.settings)) { uiState = 'settings'; return true; }
    if (pointInRect(px, py, b.withdraw)) { openWithdraw(); return true; }
    return true;
  }
  if (uiState === 'shop') {
    const s = getShopCards();
    for (const c of s.cards) {
      if (pointInRect(px, py, c)) {
        if (ownedSkins.includes(c.id)) { currentSkin = c.id; saveProgress(); }
        else {
          const sk = SKINS.find(x => x.id === c.id);
          if (sk && totalCoins >= sk.price) { totalCoins -= sk.price; ownedSkins.push(c.id); currentSkin = c.id; saveProgress(); }
        }
        return true;
      }
    }
    if (pointInRect(px, py, s.back)) { uiState = 'menu'; return true; }
    return true;
  }
  if (uiState === 'difficulty') {
    const b = getDifficultyButtons();
    if (pointInRect(px, py, b.easy)) { startGameWithDifficulty('easy'); return true; }
    if (pointInRect(px, py, b.medium)) { startGameWithDifficulty('medium'); return true; }
    if (pointInRect(px, py, b.hard)) { startGameWithDifficulty('hard'); return true; }
    if (pointInRect(px, py, b.back)) { uiState = 'menu'; return true; }
    return true;
  }
  if (uiState === 'settings') {
    for (const n of ['left','right','jump','shoot']) {
      if (pointInCircle(px, py, buttons[n], 1.2)) {
        draggingButton = n; draggingOffsetX = px - buttons[n].x; draggingOffsetY = py - buttons[n].y;
        if (!customPositions) {
          customPositions = {};
          for (const nn of ['left','right','jump','shoot']) {
            const bb = buttons[nn]; customPositions[nn] = { rx: bb.x/W, ry: bb.y/H };
          }
        }
        return true;
      }
    }
    const b = getSettingsButtons();
    if (pointInRect(px, py, b.minus)) { customButtonScale = Math.max(0.5, +(customButtonScale - 0.1).toFixed(2)); layoutButtons(); return true; }
    if (pointInRect(px, py, b.plus))  { customButtonScale = Math.min(1.5, +(customButtonScale + 0.1).toFixed(2)); layoutButtons(); return true; }
    if (pointInRect(px, py, b.reset)) { customButtonScale = 1.0; customPositions = null; layoutButtons(); return true; }
    if (pointInRect(px, py, b.back))  { uiState = 'menu'; return true; }
    return true;
  }
  if (uiState === 'withdraw') {
    const bW = Math.max(140, 180 * S), bH = Math.max(44, 56 * S);
    const backRect = { x: W/2 - bW/2, y: H - bH - 20*S, w: bW, h: bH };
    if (pointInRect(px, py, backRect)) { uiState = 'menu'; return true; }
    return true;
  }
  if (uiState === 'paused') {
    const b = getPauseButtons();
    if (pointInRect(px, py, b.resume)) { uiState = 'playing'; return true; }
    if (pointInRect(px, py, b.menu))   { resetToMenu(); return true; }
    return true;
  }
  return false;
}
function handleUIPointerMove(px, py) {
  if (uiState === 'settings' && draggingButton) {
    const b = buttons[draggingButton];
    b.x = px - draggingOffsetX; b.y = py - draggingOffsetY;
    b.x = Math.max(b.r, Math.min(W - b.r, b.x));
    b.y = Math.max(b.r, Math.min(H - b.r, b.y));
    if (customPositions) customPositions[draggingButton] = { rx: b.x/W, ry: b.y/H };
    return true;
  }
  return false;
}
function handleUIPointerUp() { draggingButton = null; }

canvas.addEventListener('touchstart', e => {
  e.preventDefault(); tryLockLandscape();
  if (uiState !== 'playing') { for (const t of e.touches) handleUIPointerDown(t.clientX, t.clientY); return; }
  for (const t of e.touches) {
    if (checkPauseButton(t.clientX, t.clientY) && !gameOver && !isCinematic()) {
      uiState = 'paused'; keys.left = keys.right = keys.jump = keys.shoot = false;
      updateButtonsFromTouches([]); return;
    }
  }
  if (isCinematic()) return;
  if (bossIntroTimer !== 0) { dismissBossIntro(); return; }
  if (gameOver) { respawnGame(); return; }
  dismissIntroFast();
  updateButtonsFromTouches(e.touches);
}, { passive:false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (uiState !== 'playing') { for (const t of e.touches) handleUIPointerMove(t.clientX, t.clientY); return; }
  if (gameOver || isCinematic() || bossIntroTimer !== 0) return;
  updateButtonsFromTouches(e.touches);
}, { passive:false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (uiState !== 'playing') { handleUIPointerUp(); return; }
  if (gameOver || isCinematic() || bossIntroTimer !== 0) return;
  updateButtonsFromTouches(e.touches);
}, { passive:false });
canvas.addEventListener('touchcancel', e => {
  e.preventDefault();
  if (uiState !== 'playing') { handleUIPointerUp(); return; }
  if (gameOver || isCinematic() || bossIntroTimer !== 0) return;
  updateButtonsFromTouches(e.touches);
}, { passive:false });
canvas.addEventListener('mousedown', e => {
  if (uiState !== 'playing') { handleUIPointerDown(e.clientX, e.clientY); return; }
  if (checkPauseButton(e.clientX, e.clientY) && !gameOver && !isCinematic()) {
    uiState = 'paused'; keys.left = keys.right = keys.jump = keys.shoot = false;
    updateButtonsFromTouches([]); return;
  }
  if (isCinematic()) return;
  if (bossIntroTimer !== 0) { dismissBossIntro(); return; }
  if (gameOver) { respawnGame(); return; }
  dismissIntroFast();
  updateButtonsFromTouches([{ clientX:e.clientX, clientY:e.clientY }]);
});
canvas.addEventListener('mousemove', e => {
  if (uiState !== 'playing') { handleUIPointerMove(e.clientX, e.clientY); return; }
  if (!e.buttons || gameOver || isCinematic() || bossIntroTimer !== 0) return;
  updateButtonsFromTouches([{ clientX:e.clientX, clientY:e.clientY }]);
});
window.addEventListener('mouseup', () => {
  if (uiState !== 'playing') { handleUIPointerUp(); return; }
  updateButtonsFromTouches([]);
});
window.addEventListener('blur', () => { keys.left = keys.right = keys.jump = keys.shoot = false; updateButtonsFromTouches([]); });
window.addEventListener('keydown', e => {
  if (uiState !== 'playing') {
    if (e.key === 'Escape') {
      if (uiState === 'withdraw') { uiState = 'menu'; return; }
      if (uiState === 'authLogin' || uiState === 'authRegisterEmail' || uiState === 'authRegisterCode' || uiState === 'authRegisterPassword') { goToAuth(); return; }
      if (uiState === 'settings' || uiState === 'difficulty' || uiState === 'shop') uiState = 'menu';
      else if (uiState === 'paused') uiState = 'playing';
    }
    return;
  }
  if (isCinematic()) return;
  if (bossIntroTimer !== 0 && !gameOver) { dismissBossIntro(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; dismissIntroFast(); }
  if (e.key === 'ArrowRight'|| e.key === 'd' || e.key === 'D') { keys.right = true; dismissIntroFast(); }
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    if (!keys.jump) jumpBuffer = 0.15;
    keys.jump = true; dismissIntroFast(); e.preventDefault();
  }
  if (e.key === 'e' || e.key === 'E' || e.key === 'q' || e.key === 'Q') { keys.shoot = true; dismissIntroFast(); }
  if (e.key === 'Escape') { uiState = 'paused'; keys.left = keys.right = keys.jump = keys.shoot = false; updateButtonsFromTouches([]); }
  if ((e.key === 'r' || e.key === 'R') && gameOver) respawnGame();
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight'|| e.key === 'd' || e.key === 'D') keys.right = false;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.jump = false;
  if (e.key === 'e' || e.key === 'E' || e.key === 'q' || e.key === 'Q') keys.shoot = false;
});
function checkPauseButton(px, py) { const dx = px - pauseButton.x, dy = py - pauseButton.y; const r = pauseButton.r*1.5; return dx*dx + dy*dy <= r*r; }

function buildLevel(num) {
  const data = LEVEL_DATA[num - 1];
  if (!data) { newGame(); return; }
  isBossLevel = false; boss = null;
  debris = []; ghostParticles = [];
  cannonBalls = []; cannon = null; cyclicSpikes = [];
  portals = []; gravityDir = 1;
  platforms = []; spikes = []; ghosts = []; levelCoins = []; orbs = []; saws = []; springs = [];

  if (data.hasFloor) {
    if (data.floorSegments) {
      for (const seg of data.floorSegments) {
        platforms.push({ x: seg[0]*S, y: data.floorY*S, w: (seg[1] - seg[0])*S, h: 60*S, ground: true, visible: true });
      }
    } else {
      platforms.push({ x: -50*S, y: data.floorY*S, w: 1200*S, h: 60*S, ground: true, visible: true });
    }
  }

  for (const entry of (data.plats || [])) {
    const x = entry[0], y = entry[1], w = entry[2], h = entry[3];
    const opts = entry[4] || {};
    const p = { x: x*S, y: y*S, w: w*S, h: h*S, visible: true, alpha: 1 };
    if (opts.start) p.isStartPlat = true;
    if (opts.goalPlat) p.isGoalPlat = true;
    if (opts.ground) p.ground = true;
    if (opts.isCeiling) p.isCeiling = true;
    if (opts.type === 'breakable') {
      p.type = 'breakable'; p.broken = false; p.breakTimer = 0; p.blinkPhase = 0;
      p.breakDuration = breakDuration;
    } else if (opts.type === 'moving') {
      p.type = 'moving'; p.axis = opts.axis;
      p.range = (opts.range||50)*S;
      p.speed = (opts.speed||PLATFORM_SPEED) * S * platformSpeedMult;
      p.baseX = p.x; p.baseY = p.y; p.offset = 0; p.dir = 1;
    } else if (opts.type === 'ice') p.type = 'ice';
    else if (opts.type === 'conveyor') { p.type = 'conveyor'; p.conveyorDir = opts.conveyorDir || 1; }
    platforms.push(p);
  }

  for (const sp of (data.spikes || [])) {
    const spk = { x: sp[0]*S, y: sp[1]*S, w: (sp[2]||14)*S, h: (sp[3]||14)*S };
    if (sp[4]) spk.dir = sp[4];
    spikes.push(spk);
  }
  for (const sp of (data.verticalSpikes || [])) {
    spikes.push({ x: sp[0]*S, y: sp[1]*S, w: sp[2]*S, h: sp[3]*S, vertical: true, dir: sp[4] });
  }

  for (const p of (data.portals || [])) {
    portals.push({ x: p.x * S, y: p.y * S, w: p.w * S, h: p.h * S, type: p.type, phase: Math.random() * 6.28 });
  }

  if (data.dynamicCeiling) {
    const dc = data.dynamicCeiling;
    const insetBoxes = (dc.insets && dc.insets[difficulty]) || 0;
    const insetPx = insetBoxes * HITBOX_W;
    const cX1 = dc.gapStart + insetPx;
    const cX2 = dc.gapEnd - insetPx;
    const cW = cX2 - cX1;
    const cY = dc.y, cH = dc.h;
    if (cW > 0) {
      platforms.push({ x: cX1*S, y: cY*S, w: cW*S, h: cH*S, ground: true, isCeiling: true, visible: true });
      const sw = 12, sh = 14;
      const perGroup = 5;
      const gapBetween = 60;
      const cCenter = (cX1 + cX2) / 2;
      const groupW = perGroup * sw;
      const leftStart = cCenter - gapBetween/2 - groupW;
      const rightStart = cCenter + gapBetween/2;
      const spikeY = cY + cH;
      for (let i = 0; i < perGroup; i++) {
        spikes.push({ x: (leftStart + i * sw) * S, y: spikeY * S, w: sw * S, h: sh * S, dir: 'down' });
      }
      for (let i = 0; i < perGroup; i++) {
        spikes.push({ x: (rightStart + i * sw) * S, y: spikeY * S, w: sw * S, h: sh * S, dir: 'down' });
      }
      if (!dc.noPortal) {
        portals.push({ x: (cX2 - 30) * S, y: (cY + cH) * S, w: 30 * S, h: 80 * S, type: 'orange', phase: Math.random() * 6.28 });
      }
    }
  }

  if (data.cyclicSpikesList) {
    for (const cs of data.cyclicSpikesList) {
      cyclicSpikes.push({ x: cs.x * S, y: cs.y * S, w: cs.w * S, h: 14 * S, progress: 0, phase: 'down', timer: 1.0 });
    }
  }
  if (data.cannon) {
    cannon = { x: data.cannon.x * S, y: data.cannon.y * S, w: 24 * S, h: 20 * S, timer: cannonInterval, shootInterval: cannonInterval, muzzleFlash: 0 };
  }
  for (const g of (data.ghosts || [])) {
    const gx = g[0]*S, gy = g[1]*S, gr = (g[2]||60)*S;
    ghosts.push({ x: gx, y: gy, w: 30*S, h: 30*S, baseX: gx, range: gr, dir: 1, speed: GHOST_SPEED * S, alive: true, wobble: Math.random()*6.28 });
  }
  for (const o of (data.orbs || [])) {
    orbs.push({ x: o[0]*S, y: o[1]*S, r: 14*S, type: o[2], used: false, cooldown: 0, pulse: Math.random()*6.28 });
  }
  for (const sw of (data.saws || [])) {
    const sx = sw[0], sy = sw[1], sr = sw[2], path = sw[3];
    const spd = sw.length >= 5 ? sw[4] : 2;
    saws.push({ x: sx*S, y: sy*S, r: (sr||18)*S, path: path.map(p => ({ x: p[0]*S, y: p[1]*S })), t: 0, pingDir: 1, speed: spd * S * sawSpeedMult, rot: 0 });
  }
  if (data.springs) {
    const floorY = data.floorY || 380;
    const sw = 50 * S, sh = 26 * S;
    for (const sp of data.springs) {
      springs.push({ x: sp[0]*S, y: (floorY)*S - sh, w: sw, h: sh, type: sp[1], animTimer: 0 });
    }
  }

  const dcCoins = DIFFICULTY_SETTINGS[difficulty];
  const allCoinsPool = (data.coins || []).slice();
  for (let i = allCoinsPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = allCoinsPool[i]; allCoinsPool[i] = allCoinsPool[j]; allCoinsPool[j] = tmp;
  }
  const wantedCount = dcCoins.coinMin + Math.floor(Math.random() * (dcCoins.coinMax - dcCoins.coinMin + 1));
  const selectedCoins = allCoinsPool.slice(0, Math.min(wantedCount, allCoinsPool.length));
  for (const c of selectedCoins) {
    const r = 11*S;
    levelCoins.push({ x: c[0]*S - r, y: c[1]*S - r, w: r*2, h: r*2, r: r, pulse: Math.random()*6.28, collected: false });
  }

  startPlatform = platforms.find(p => p.isStartPlat);
  const pw = 34*S, ph = 45*S;
  const basePlayer = { w: pw, h: ph, vx:0, vy:0, onGround:false, riding: null, iceSurface: false, lastDir: 0, iceSlideActive: false };
  if (startPlatform) player = { ...basePlayer, x: startPlatform.x + (startPlatform.w - pw)/2, y: startPlatform.y - ph };
  else player = { ...basePlayer, x: 45*S, y: 340*S - ph };

  goal = { x: data.goalX*S, y: data.goalY*S, w: 30*S, h: 60*S };
  introTimer = 0;
}
function generateLevel() {
  isBossLevel = false; boss = null;
  debris = []; ghostParticles = [];
  cannonBalls = []; cannon = null; cyclicSpikes = [];
  portals = []; gravityDir = 1;
  bossIntroTimer = 0;
  buildLevel(score + 1);
}
function nextLevel() {
  score++;
  const num = score + 1;
  if (CHECKPOINT_LEVELS.indexOf(num) !== -1) checkpointLevel = num;
  lives = 3; invulnTimer = 0; hitFlash = 0; debris = []; ghostParticles = [];
  cannonBalls = []; cannon = null; cyclicSpikes = [];
  portals = []; gravityDir = 1;
  buildBackground();
  generateLevel();
}

const GRAVITY = 0.7, MAX_FALL = 12;

function spawnDebris(p) {
  for (let i = 0; i < 10; i++) {
    debris.push({
      x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h,
      vx: (Math.random() - 0.5) * 6 * S, vy: -Math.random() * 4 * S,
      w: (4 + Math.random()*6) * S, h: (3 + Math.random()*4) * S,
      rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 0.4, life: 1.5,
    });
  }
}
function spawnGhostParticles(cx, cy) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (1.2 + Math.random() * 3.6) * S;
    const sz = (3 + Math.random() * 5) * S;
    ghostParticles.push({
      type: 'chunk', x: cx + (Math.random() - 0.5) * 18 * S, y: cy + (Math.random() - 0.5) * 18 * S,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5 * S, size: sz,
      life: 0.75 + Math.random() * 0.5, maxLife: 1.25, rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 0.6,
    });
  }
  ghostParticles.push({ type: 'flash', x: cx, y: cy, vx: 0, vy: 0, size: 12 * S, life: 0.25, maxLife: 0.25, rot: 0, rotV: 0 });
}
function updateGhostParticles() {
  for (const p of ghostParticles) {
    if (p.type === 'chunk') {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35 * S; p.vx *= 0.985; p.rot += p.rotV;
    } else if (p.type === 'flash') p.size += 8 * S;
    p.life -= 1/60;
  }
  ghostParticles = ghostParticles.filter(p => p.life > 0);
}
function updatePlatforms() {
  const riding = player.riding;
  for (const p of platforms) {
    if (p.type !== 'moving') continue;
    const oX = p.x, oY = p.y;
    p.offset += p.dir * p.speed;
    if (Math.abs(p.offset) >= p.range) { p.offset = p.dir * p.range; p.dir *= -1; }
    if (p.axis === 'x') p.x = p.baseX + p.offset;
    else p.y = p.baseY + p.offset;
    if (riding === p) { player.x += p.x - oX; player.y += p.y - oY; }
    if (p !== riding && aabb(player, p)) {
      const dx = (player.x + player.w/2) - (p.x + p.w/2);
      const dy = (player.y + player.h/2) - (p.y + p.h/2);
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) player.x = p.x + p.w + 0.5; else player.x = p.x - player.w - 0.5;
      } else {
        if (dy > 0) player.y = p.y + p.h + 0.5; else player.y = p.y - player.h - 0.5;
      }
    }
  }
  for (const p of platforms) {
    if (p.type !== 'breakable') continue;
    if (p.broken) continue;
    if (p.breakTimer > 0) {
      p.breakTimer -= 1/60;
      p.blinkPhase += 1/60;
      p.visible = (Math.floor(p.blinkPhase * 10) % 2) === 0 || p.breakTimer > p.breakDuration - 0.7;
      if (p.breakTimer <= 0) { p.broken = true; p.visible = false; spawnDebris(p); }
    }
  }
  for (const d of debris) {
    d.x += d.vx; d.y += d.vy; d.vy += 0.5 * S; d.rot += d.rotV; d.life -= 1/60;
  }
  debris = debris.filter(d => d.life > 0 && d.y < H + 50*S);
}
const CYCLE_DOWN = 1.0, CYCLE_RISING = 0.25, CYCLE_UP = 0.5, CYCLE_FALLING = 0.25;
function updateCyclicSpikes() {
  for (const cs of cyclicSpikes) {
    cs.timer -= 1/60;
    if (cs.timer <= 0) {
      if (cs.phase === 'down') { cs.phase = 'rising'; cs.timer = CYCLE_RISING; }
      else if (cs.phase === 'rising') { cs.phase = 'up'; cs.timer = CYCLE_UP; }
      else if (cs.phase === 'up') { cs.phase = 'falling'; cs.timer = CYCLE_FALLING; }
      else if (cs.phase === 'falling') { cs.phase = 'down'; cs.timer = CYCLE_DOWN; }
    }
    if (cs.phase === 'down') cs.progress = 0;
    else if (cs.phase === 'rising') cs.progress = Math.max(0, Math.min(1, 1 - cs.timer / CYCLE_RISING));
    else if (cs.phase === 'up') cs.progress = 1;
    else if (cs.phase === 'falling') cs.progress = Math.max(0, Math.min(1, cs.timer / CYCLE_FALLING));
    if (cs.progress > 0.15 && invulnTimer <= 0) {
      const effH = cs.h * cs.progress;
      const box = { x: cs.x, y: cs.y - effH, w: cs.w, h: effH };
      if (aabb(player, box)) {
        lives--; invulnTimer = INVULN_TIME; hitFlash = 0.45;
        player.vy = -10 * S * gravityDir;
        if (player.x + player.w/2 < cs.x + cs.w/2) player.x = cs.x - player.w - 4*S;
        else player.x = cs.x + cs.w + 4*S;
        if (player.x < 0) player.x = 0;
        if (player.x + player.w > W) player.x = W - player.w;
        if (lives <= 0) gameOver = true;
      }
    }
  }
}
function updatePortals() {
  for (const pt of portals) {
    pt.phase += 1/60;
    if (aabb(player, pt)) {
      if (pt.type === 'blue' && gravityDir > 0) {
        gravityDir = -1; player.vy = 0; player.vx = 0; player.onGround = false;
      } else if (pt.type === 'orange' && gravityDir < 0) {
        gravityDir = 1; player.vy = 0; player.vx = 0; player.onGround = false;
      }
    }
  }
  for (const o of orbs) {
    if (o.type !== 'gravityUp' && o.type !== 'gravityDown') continue;
    if (o.cooldown > 0) continue;
    const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
    const dx = pcx - o.x, dy = pcy - o.y;
    const rad = o.r + player.w*0.5;
    if (dx*dx + dy*dy < rad*rad) {
      if (o.type === 'gravityUp' && gravityDir > 0) {
        gravityDir = -1; player.vy = 0; player.vx = 0; player.onGround = false;
        o.cooldown = 1.0;
      } else if (o.type === 'gravityDown' && gravityDir < 0) {
        gravityDir = 1; player.vy = 0; player.vx = 0; player.onGround = false;
        o.cooldown = 1.0;
      }
    }
  }
}
function updateCannon() {
  if (!cannon) return;
  if (cannon.muzzleFlash > 0) cannon.muzzleFlash -= 1/60;
  cannon.timer -= 1/60;
  if (cannon.timer <= 0) {
    cannon.timer = cannon.shootInterval; cannon.muzzleFlash = 0.15;
    cannonBalls.push({ x: cannon.x - 6*S, y: cannon.y + cannon.h/2 - 6*S, w: 12*S, h: 12*S, vx: -6*S, dead: false });
  }
  for (const b of cannonBalls) {
    b.x += b.vx;
    if (invulnTimer <= 0 && aabb(player, b)) {
      lives--; invulnTimer = INVULN_TIME; hitFlash = 0.4; b.dead = true;
      if (lives <= 0) { gameOver = true; return; }
    }
  }
  cannonBalls = cannonBalls.filter(b => !b.dead && b.x > -50*S);
}
function updateSaws() {
  for (const s of saws) {
    s.rot += 0.3;
    if (s.path.length >= 2) {
      const a = s.path[0], b = s.path[1];
      if (a && b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        s.t += s.pingDir * s.speed / len;
        if (s.t >= 1) { s.t = 1; s.pingDir = -1; } else if (s.t <= 0) { s.t = 0; s.pingDir = 1; }
        s.x = a.x + dx * s.t; s.y = a.y + dy * s.t;
      }
    }
    const bb = { x: s.x - s.r, y: s.y - s.r, w: s.r*2, h: s.r*2 };
    if (invulnTimer <= 0 && aabb(player, bb)) {
      lives--; invulnTimer = INVULN_TIME; hitFlash = 0.45;
      if (player.x + player.w/2 < s.x) player.x = s.x - s.r - player.w - 4*S;
      else player.x = s.x + s.r + 4*S;
      player.vy = -10*S * gravityDir;
      if (player.x < 0) player.x = 0;
      if (player.x + player.w > W) player.x = W - player.w;
      if (lives <= 0) { gameOver = true; return; }
    }
  }
}
function updateGhosts() {
  for (const g of ghosts) {
    if (!g.alive) continue;
    g.x += g.dir * g.speed;
    if (g.x > g.baseX + g.range) { g.x = g.baseX + g.range; g.dir = -1; }
    if (g.x < g.baseX - g.range) { g.x = g.baseX - g.range; g.dir = 1; }
    g.wobble += 0.08;
    if (invulnTimer <= 0 && aabb(player, g)) {
      const pb = player.y + player.h, gt = g.y + 4*S;
      const stomping = (gravityDir > 0 && player.vy > 0 && pb - player.vy <= gt + 6*S)
                    || (gravityDir < 0 && player.vy < 0 && player.y - player.vy >= g.y + g.h - 6*S);
      if (stomping) {
        spawnGhostParticles(g.x + g.w/2, g.y + g.h/2); g.alive = false;
        player.vy = -9 * S * gravityDir;
      } else {
        lives--; invulnTimer = INVULN_TIME; hitFlash = 0.45;
        if (player.x + player.w/2 < g.x + g.w/2) player.x = g.x - player.w - 4*S;
        else player.x = g.x + g.w + 4*S;
        player.vy = -8*S * gravityDir;
        if (lives <= 0) { gameOver = true; return; }
      }
    }
  }
}

function update() {
  if (!player) return;
  if (isCinematic()) return;
  updatePlatforms(); updateGhostParticles(); updateCyclicSpikes();
  if (gameOver) return;
  updatePortals(); updateCannon();
  if (gameOver) return;
  for (const sp of springs) { if (sp.animTimer > 0) sp.animTimer -= 1/60; }
  if (bossIntroTimer !== 0) {
    if (bossIntroTimer > 0) { bossIntroTimer -= 1/60; if (bossIntroTimer < 0) bossIntroTimer = 0; }
    return;
  }
  if (introTimer > 0) { introTimer -= 1/60; if (introTimer < 0) introTimer = 0; }
  const moveSpeed = 4.2 * S, jumpPower = -12 * S, maxFall = MAX_FALL * S;
  if (invulnTimer > 0) invulnTimer -= 1/60;
  if (keys.left) player.lastDir = -1; else if (keys.right) player.lastDir = 1;
  const onIce = player.onGround && player.iceSurface;
  if (onIce) {
    if (!keys.left && !keys.right) {
      player.vx *= 0.93;
      if (Math.abs(player.vx) < 0.15 * S) player.vx = 0;
    } else {
      if (keys.left)  player.vx -= moveSpeed * 0.35;
      if (keys.right) player.vx += moveSpeed * 0.35;
      player.vx *= 0.97;
    }
    player.vx = Math.max(-moveSpeed * 1.2, Math.min(moveSpeed * 1.2, player.vx));
  } else {
    player.vx = 0;
    if (keys.left) player.vx -= moveSpeed;
    if (keys.right) player.vx += moveSpeed;
  }
  player.vy += GRAVITY * S * gravityDir;
  if (gravityDir > 0) { if (player.vy > maxFall) player.vy = maxFall; } else { if (player.vy < -maxFall) player.vy = -maxFall; }

  const oldX = player.x;
  player.x += player.vx;
  for (const p of platforms) {
    if (p.type === 'breakable' && p.broken) continue;
    if (!aabb(player, p)) continue;
    if (player.vx > 0 && oldX + player.w <= p.x + 1.5) player.x = p.x - player.w;
    else if (player.vx < 0 && oldX >= p.x + p.w - 1.5) player.x = p.x + p.w;
  }

  const oldY = player.y;
  player.y += player.vy;
  player.onGround = false; player.iceSurface = false; player.riding = null;
  let landed = null;
  for (const p of platforms) {
    if (p.type === 'breakable' && p.broken) continue;
    if (!aabb(player, p)) continue;
    if (gravityDir > 0) {
      if (player.vy > 0 && oldY + player.h <= p.y + 2) { player.y = p.y - player.h; player.vy = 0; player.onGround = true; landed = p; }
      else if (player.vy < 0 && oldY >= p.y + p.h - 2) { player.y = p.y + p.h; player.vy = 0; }
    } else {
      if (player.vy < 0 && oldY >= p.y + p.h - 2) { player.y = p.y + p.h; player.vy = 0; player.onGround = true; landed = p; }
      else if (player.vy > 0 && oldY + player.h <= p.y + 2) { player.y = p.y - player.h; player.vy = 0; }
    }
  }

  for (const sp of springs) {
    if (!aabb(player, sp)) continue;
    if (player.vy > 0 && oldY + player.h <= sp.y + 6) {
      player.y = sp.y - player.h; player.onGround = true;
      player.vy = sp.type === 'yellow' ? -15.2 * S : -19.4 * S;
      sp.animTimer = 0.45; landed = null;
    }
  }

  if (landed) {
    if (landed.type === 'ice') {
      player.iceSurface = true;
      if (!player.iceSlideActive) {
        const vdir = Math.abs(player.vx) > 0.5 * S ? Math.sign(player.vx) : (player.lastDir || 1);
        player.vx = vdir * moveSpeed; player.iceSlideActive = true;
      }
    } else player.iceSlideActive = false;
    if (landed.type === 'conveyor') player.x += landed.conveyorDir * 1.6 * S * conveyorSpeedMult;
    if (landed.type === 'moving') player.riding = landed;
    if (landed.type === 'breakable' && landed.breakTimer === 0 && !landed.broken) landed.breakTimer = landed.breakDuration;
  }
  if (!player.onGround) player.iceSlideActive = false;
  if (jumpBuffer > 0 && player.onGround) {
    player.vy = jumpPower * gravityDir; player.onGround = false; jumpBuffer = 0;
  }
  jumpBuffer -= 1/60; if (jumpBuffer < 0) jumpBuffer = 0;
  if (player.x < 0) player.x = 0;
  if (player.x + player.w > W) player.x = W - player.w;

  for (const o of orbs) {
    o.pulse += 1/60;
    if (o.cooldown > 0) o.cooldown -= 1/60;
    if (o.type === 'gravityUp' || o.type === 'gravityDown') continue;
    const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
    const dx = pcx - o.x, dy = pcy - o.y, rad = o.r + player.w*0.5;
    if (dx*dx + dy*dy < rad*rad && o.cooldown <= 0 && jumpBuffer > 0) {
      if (o.type === 'yellow') player.vy = jumpPower * 1.0;
      else if (o.type === 'red') player.vy = jumpPower * 1.414;
      else if (o.type === 'blue') player.vy = 0;
      o.cooldown = 1.2; jumpBuffer = 0;
    }
  }
  updateGhosts();
  if (gameOver) return;
  updateSaws();
  if (gameOver) return;
  for (const c of levelCoins) {
    if (c.collected) continue;
    c.pulse += 1/60;
    if (aabb(player, c)) { c.collected = true; totalCoins++; saveProgress(); }
  }
  levelCoins = levelCoins.filter(c => !c.collected);
  for (const s of spikes) {
    if (invulnTimer <= 0 && aabb(player, s)) {
      lives--; invulnTimer = INVULN_TIME; hitFlash = 0.45;
      if (player.x + player.w/2 < s.x + s.w/2) player.x = s.x - player.w - 6*S;
      else player.x = s.x + s.w + 6*S;
      player.vy = -10*S * gravityDir;
      if (player.x < 0) player.x = 0;
      if (player.x + player.w > W) player.x = W - player.w;
      if (lives <= 0) { gameOver = true; return; }
    }
  }
  if (goal && aabb(player, goal)) { nextLevel(); return; }
  if ((gravityDir > 0 && player.y > H + 60*S) || (gravityDir < 0 && player.y + player.h < -60*S)) {
    lives--; hitFlash = 0.4;
    if (lives <= 0) { gameOver = true; return; }
    for (const p of platforms) if (p.type === 'breakable') { p.broken = false; p.breakTimer = 0; p.visible = true; }
    debris = []; ghostParticles = []; cannonBalls = [];
    gravityDir = 1;
    if (startPlatform) {
      player.x = startPlatform.x + (startPlatform.w - player.w)/2;
      player.y = startPlatform.y - player.h - 20*S;
    } else {
      const fb = platforms.find(p => !p.isGoalPlat) || platforms[0];
      if (fb) { player.x = fb.x + (fb.w - player.w)/2; player.y = fb.y - player.h - 20*S; }
      else { player.x = 45*S; player.y = 340*S - player.h - 20*S; }
    }
    player.vx = 0; player.vy = 0; player.iceSlideActive = false;
    invulnTimer = INVULN_TIME;
    return;
  }
}

function drawSkinShape(x, y, w, h, skinId) {
  const cx = x + w / 2;
  if (skinId === 'default') {
    const padX = 4*S, padTop = 5*S;
    const px = x - padX, py = y - padTop, pw = w + padX*2, ph = h + padTop;
    const seatY = py + ph * 0.5;
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(px, py, 8*S, ph*0.6);
    ctx.fillRect(px, py, pw*0.35, 6*S);
    ctx.fillRect(px, seatY, pw, 8*S);
    ctx.fillStyle = '#5a2d0a';
    ctx.fillRect(px + pw - 8*S, seatY + 8*S, 5*S, ph - (seatY - py) - 8*S);
    ctx.fillRect(px + 3*S, seatY + 8*S, 5*S, ph - (seatY - py) - 8*S);
  } else if (skinId === 'background') {
    const h3 = h / 3;
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h3);
    ctx.fillStyle = '#169b62'; ctx.fillRect(x, y + h3, w, h3);
    ctx.fillStyle = '#ff821e'; ctx.fillRect(x, y + 2*h3, w, h - 2*h3);
    const r = Math.min(w, h) * 0.26, cyy = y + h/2;
    ctx.fillStyle = '#c81e1e';
    ctx.beginPath(); ctx.arc(cx, cyy, r, 0, Math.PI*2); ctx.fill();
    drawMiniHammerSickleCtx(cx, cyy, r * 0.95);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5*S; ctx.strokeRect(x, y, w, h);
  } else if (skinId === 'blackboard') {
    ctx.fillStyle = '#6b3d1a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a4a2a'; ctx.fillRect(x + 3*S, y + 3*S, w - 6*S, h - 6*S);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5*S;
    ctx.beginPath();
    ctx.moveTo(x + 6*S, y + h*0.30); ctx.lineTo(x + w - 6*S, y + h*0.30);
    ctx.moveTo(x + 6*S, y + h*0.50); ctx.lineTo(x + w*0.70, y + h*0.50);
    ctx.moveTo(x + 6*S, y + h*0.70); ctx.lineTo(x + w*0.55, y + h*0.70);
    ctx.stroke();
  } else if (skinId === 'ghost') {
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2 * S;
    const r = w/2;
    ctx.beginPath();
    ctx.arc(cx, y + r*0.9, r, Math.PI, 0);
    ctx.lineTo(x + w, y + h*0.85);
    const steps = 4, sw = w/steps;
    for (let i = 0; i < steps; i++) {
      const sx = x + w - sw*i, sy = y + h*0.85;
      const ny = y + h*(i%2===0 ? 1.0 : 0.88);
      ctx.quadraticCurveTo(sx - sw/2, (sy+ny)/2, sx - sw, ny);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx - r*0.35, y + r*0.8, r*0.13, 0, Math.PI*2);
    ctx.arc(cx + r*0.35, y + r*0.8, r*0.13, 0, Math.PI*2);
    ctx.fill();
  } else if (skinId === 'toilet') {
    const lw = Math.max(1.8, 2.4*S);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#000'; ctx.lineWidth = lw; ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w * 0.50, h * 0.55);
    ctx.strokeRect(x, y, w * 0.50, h * 0.55);
    ctx.fillRect(x, y, w * 0.50, h * 0.10);
    ctx.strokeRect(x, y, w * 0.50, h * 0.10);
    ctx.fillRect(x + w * 0.40, y + h * 0.50, w * 0.60, h * 0.12);
    ctx.strokeRect(x + w * 0.40, y + h * 0.50, w * 0.60, h * 0.12);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.10, y + h * 0.58);
    ctx.bezierCurveTo(x + w * 0.10, y + h, x + w * 0.35, y + h, x + w * 0.53, y + h);
    ctx.bezierCurveTo(x + w * 0.71, y + h, x + w * 0.95, y + h, x + w * 0.95, y + h * 0.58);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}

function drawPlatform(p) {
  if (!p.visible) return;
  if (p.type === 'ice') {
    ctx.fillStyle = 'rgba(140, 200, 255, 0.8)'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fillRect(p.x, p.y, p.w, 3*S);
    ctx.strokeStyle = '#1a4a8a'; ctx.lineWidth = 1.5; ctx.strokeRect(p.x, p.y, p.w, p.h);
    return;
  }
  if (p.type === 'conveyor') {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(p.x, p.y, p.w, p.h);
    const sp = 12*S, off = (performance.now() / 40 * p.conveyorDir * conveyorSpeedMult) % sp;
    ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
    ctx.fillStyle = '#555';
    for (let xx = p.x - sp + off; xx < p.x + p.w + sp; xx += sp) ctx.fillRect(xx, p.y + 2*S, 4*S, p.h - 4*S);
    ctx.restore();
    ctx.fillStyle = '#ffcc00';
    for (let k = 0; k < 2; k++) {
      const ax = p.x + p.w * (0.30 + k * 0.40), ay = p.y + p.h / 2;
      ctx.beginPath();
      ctx.moveTo(ax + 6*S * p.conveyorDir, ay);
      ctx.lineTo(ax - 6*S * p.conveyorDir, ay - 6*S);
      ctx.lineTo(ax - 6*S * p.conveyorDir, ay + 6*S);
      ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (p.type === 'breakable') {
    ctx.fillStyle = '#c99828'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, p.w, p.h);
    if (p.breakTimer > 0) {
      const cr = 1 - (p.breakTimer / p.breakDuration);
      ctx.strokeStyle = 'rgba(0,0,0,' + (0.4 + cr*0.6) + ')'; ctx.lineWidth = 1.5;
      const n = Math.floor(cr * 5) + 1;
      for (let i = 0; i < n; i++) {
        const c0 = p.x + (i + 0.5) * p.w / n;
        ctx.beginPath();
        ctx.moveTo(c0, p.y);
        ctx.lineTo(c0 + (Math.random()-0.5)*6*S, p.y + p.h * 0.5);
        ctx.lineTo(c0 + (Math.random()-0.5)*8*S, p.y + p.h);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c81e1e';
    const cnt = Math.max(1, Math.floor(p.w / (26*S)));
    for (let i = 0; i < cnt; i++) {
      const cx = p.x + (i + 0.5) * p.w / cnt, cy = p.y + p.h/2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6*S); ctx.lineTo(cx - 5*S, cy + 2*S); ctx.lineTo(cx + 5*S, cy + 2*S);
      ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (p.type === 'moving') {
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#c89828'; ctx.fillRect(p.x, p.y, p.w, 3*S);
    ctx.strokeStyle = '#5a3416'; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#ffcc00';
    for (let i = 0; i < 2; i++) {
      const cx = p.x + p.w * (0.35 + i*0.3), cy = p.y + p.h/2;
      if (p.axis === 'x') {
        ctx.beginPath();
        ctx.moveTo(cx + p.dir*6*S, cy); ctx.lineTo(cx - p.dir*4*S, cy - 4*S); ctx.lineTo(cx - p.dir*4*S, cy + 4*S);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, cy + p.dir*6*S); ctx.lineTo(cx - 4*S, cy - p.dir*4*S); ctx.lineTo(cx + 4*S, cy - p.dir*4*S);
        ctx.closePath(); ctx.fill();
      }
    }
    return;
  }
  ctx.fillStyle = p.isGoalPlat ? '#c89828' : (p.ground ? '#3a2414' : '#6b4a2a');
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = p.isGoalPlat ? '#ffd700' : (p.ground ? '#5a4028' : '#9a7a4a');
  ctx.fillRect(p.x, p.y, p.w, 2);
  ctx.strokeStyle = p.isGoalPlat ? '#ffd700' : (p.ground ? '#5a4028' : '#8a6a40');
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x, p.y, p.w, p.h);
}

function drawSpring(sp) {
  const isYellow = sp.type === 'yellow';
  const c1 = isYellow ? '#ffe066' : '#ff6666';
  const c2 = isYellow ? '#d0a010' : '#a01010';
  const c3 = isYellow ? '#7a5a00' : '#5a0000';
  const compress = sp.animTimer > 0 ? (0.55 + 0.45 * Math.abs(Math.cos(sp.animTimer * 25))) : 1;
  const totalH = sp.h, topPlateH = 6 * S, basePlateH = 5 * S;
  const coilH = (totalH - topPlateH - basePlateH) * compress;
  const topY = sp.y + (totalH - topPlateH - basePlateH - coilH);
  const baseY = sp.y + sp.h - basePlateH;
  ctx.fillStyle = c3; ctx.fillRect(sp.x - 3*S, sp.y + sp.h - basePlateH - 2*S, sp.w + 6*S, basePlateH + 2*S);
  ctx.strokeStyle = c2; ctx.lineWidth = 3.2 * S; ctx.lineCap = 'round';
  ctx.beginPath();
  const cx0 = sp.x + sp.w * 0.5, halfW = sp.w * 0.34, stepY = coilH / 5;
  ctx.moveTo(cx0, baseY);
  for (let i = 0; i < 5; i++) {
    const y0 = baseY - stepY * i;
    ctx.lineTo(cx0 - halfW, y0 - stepY * 0.25);
    ctx.lineTo(cx0 + halfW, y0 - stepY * 0.75);
  }
  ctx.lineTo(cx0, topY + topPlateH); ctx.stroke();
  ctx.fillStyle = c1; ctx.fillRect(sp.x - 4*S, topY, sp.w + 8*S, topPlateH);
  ctx.strokeStyle = c3; ctx.lineWidth = 1.8 * S; ctx.strokeRect(sp.x - 4*S, topY, sp.w + 8*S, topPlateH);
}
function drawDebris() {
  for (const d of debris) {
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life);
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-d.w/2, -d.h/2, d.w, d.h);
    ctx.restore();
  }
}
function drawGhostParticles() {
  for (const p of ghostParticles) {
    const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.5)));
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y);
    if (p.type === 'chunk') {
      ctx.rotate(p.rot); ctx.fillStyle = '#3a5eb8';
      ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a2e6e'; ctx.lineWidth = 1; ctx.stroke();
    } else if (p.type === 'flash') {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      grad.addColorStop(0, 'rgba(200, 230, 255, 0.9)');
      grad.addColorStop(1, 'rgba(120, 180, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
function drawCyclicSpikes() {
  for (const cs of cyclicSpikes) {
    if (cs.progress <= 0.02) continue;
    const effH = cs.h * cs.progress;
    const topY = cs.y - effH;
    const n = 3, segW = cs.w / n;
    for (let i = 0; i < n; i++) {
      const x0 = cs.x + i * segW, x1 = x0 + segW, mid = (x0 + x1) / 2;
      ctx.beginPath();
      ctx.moveTo(x0, cs.y); ctx.lineTo(mid, topY); ctx.lineTo(x1, cs.y);
      ctx.closePath();
      ctx.fillStyle = '#7a0d0d'; ctx.fill();
      ctx.strokeStyle = '#2e0505'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}
function drawPortal(pt) {
  const cx = pt.x + pt.w/2, cy = pt.y + pt.h/2;
  const rx = pt.w/2, ry = pt.h/2;
  const isBlue = pt.type === 'blue';
  const col1 = isBlue ? '#4080ff' : '#ff8020';
  const col2 = isBlue ? '#aaccff' : '#ffcc88';
  const colIn = isBlue ? '#1a6acc' : '#c85020';
  ctx.save();
  ctx.globalAlpha = 0.65 + 0.20 * Math.sin(pt.phase * 3);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry*2);
  grd.addColorStop(0, col2);
  grd.addColorStop(0.5, col1);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx*1.8, ry*1.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = colIn;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col1; ctx.lineWidth = 2.5 * S;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#fff';
  const arrSize = Math.min(rx * 0.6, ry * 0.25);
  const arrowYs = [cy - ry*0.4, cy + ry*0.4];
  for (const ay of arrowYs) {
    ctx.beginPath();
    if (isBlue) {
      ctx.moveTo(cx, ay - arrSize);
      ctx.lineTo(cx - arrSize*0.6, ay);
      ctx.lineTo(cx + arrSize*0.6, ay);
    } else {
      ctx.moveTo(cx, ay + arrSize);
      ctx.lineTo(cx - arrSize*0.6, ay);
      ctx.lineTo(cx + arrSize*0.6, ay);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawCannon() {
  if (!cannon) return;
  const flash = cannon.muzzleFlash > 0;
  ctx.fillStyle = '#333'; ctx.fillRect(cannon.x - 4*S, cannon.y + cannon.h - 4*S, cannon.w + 8*S, 6*S);
  ctx.fillStyle = '#555'; ctx.fillRect(cannon.x, cannon.y, cannon.w, cannon.h);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.strokeRect(cannon.x, cannon.y, cannon.w, cannon.h);
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(cannon.x, cannon.y + cannon.h/2, 4*S, cannon.h/2.2, 0, 0, Math.PI*2); ctx.fill();
  if (flash) {
    const a = Math.min(1, cannon.muzzleFlash / 0.15);
    ctx.fillStyle = `rgba(255, 200, 60, ${a})`;
    ctx.beginPath(); ctx.arc(cannon.x, cannon.y + cannon.h/2, 10*S, 0, Math.PI*2); ctx.fill();
  }
}
function drawCannonBalls() {
  for (const b of cannonBalls) {
    const bx = b.x + b.w/2, by = b.y + b.h/2, r = b.w / 2;
    ctx.fillStyle = '#553'; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#110'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}
function drawSaw(s) {
  if (s.path.length >= 2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(s.path[0].x, s.path[0].y);
    for (let i = 1; i < s.path.length; i++) ctx.lineTo(s.path[i].x, s.path[i].y);
    ctx.stroke();
  }
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
  ctx.fillStyle = '#c8c8c8';
  ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * s.r, Math.sin(a) * s.r);
    ctx.lineTo(Math.cos(a + 0.12) * (s.r + 5*S), Math.sin(a + 0.12) * (s.r + 5*S));
    ctx.lineTo(Math.cos(a + 0.24) * s.r, Math.sin(a + 0.24) * s.r);
    ctx.closePath();
    ctx.fillStyle = '#e0e0e0'; ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, 0, s.r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawSpike(s) {
  if (s.dir === 'down') {
    const tX = s.x + s.w/2, tY = s.y + s.h;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y); ctx.lineTo(tX, tY); ctx.lineTo(s.x + s.w, s.y);
    ctx.closePath();
    ctx.fillStyle = '#7a0d0d'; ctx.fill();
    ctx.strokeStyle = '#2e0505'; ctx.lineWidth = 1.5; ctx.stroke();
    return;
  }
  if (s.vertical) {
    const n = 3, segH = s.h / n;
    for (let i = 0; i < n; i++) {
      const y0 = s.y + i * segH, y1 = y0 + segH;
      ctx.beginPath();
      if (s.dir === 'right') { ctx.moveTo(s.x, y0); ctx.lineTo(s.x + s.w, (y0 + y1) / 2); ctx.lineTo(s.x, y1); }
      else { ctx.moveTo(s.x + s.w, y0); ctx.lineTo(s.x, (y0 + y1) / 2); ctx.lineTo(s.x + s.w, y1); }
      ctx.closePath();
      ctx.fillStyle = '#7a0d0d'; ctx.fill();
      ctx.strokeStyle = '#2e0505'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    return;
  }
  const bY = s.y + s.h, tX = s.x + s.w/2, tY = s.y;
  ctx.beginPath();
  ctx.moveTo(s.x, bY); ctx.lineTo(tX, tY); ctx.lineTo(s.x + s.w, bY);
  ctx.closePath();
  ctx.fillStyle = '#7a0d0d'; ctx.fill();
  ctx.strokeStyle = '#2e0505'; ctx.lineWidth = 1.5; ctx.stroke();
}
function drawGhost(g) {
  if (!g.alive) return;
  const cx = g.x + g.w/2, cy = g.y + g.h/2 + Math.sin(g.wobble) * 3*S, r = g.w * 0.5;
  ctx.save(); ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#3a5eb8';
  ctx.beginPath();
  ctx.arc(cx, cy - r*0.15, r, Math.PI, 0);
  const segs = 4, sw = (r*2)/segs;
  for (let i = 0; i < segs; i++) {
    const sx = cx + r - sw*i, sy = cy + r*0.85;
    const dy = (i%2===0 ? 0.85 : 0.65) * r;
    ctx.quadraticCurveTo(sx - sw/2, sy + r*0.1, sx - sw, cy + dy);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a2e6e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - r*0.3, cy - r*0.1, r*0.2, 0, Math.PI*2);
  ctx.arc(cx + r*0.3, cy - r*0.1, r*0.2, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - r*0.3, cy - r*0.1, r*0.1, 0, Math.PI*2);
  ctx.arc(cx + r*0.3, cy - r*0.1, r*0.1, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}
function drawGravityOrb(o) {
  const isUp = o.type === 'gravityUp';
  const col1 = '#4080ff', col2 = '#aaccff', colIn = '#1a6acc';
  const pulse = 0.5 + 0.5 * Math.sin(o.pulse * 3);
  ctx.save();
  const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.1);
  grd.addColorStop(0, col2); grd.addColorStop(0.55, col1); grd.addColorStop(1, col1 + '00');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = colIn; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = col1; ctx.lineWidth = 2.2 * S;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = col2;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.72 + pulse * 0.1), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  const arrSize = o.r * 0.5;
  for (const k of [-1, 1]) {
    const ay = o.y + k * o.r * 0.35;
    ctx.beginPath();
    if (isUp) {
      ctx.moveTo(o.x, ay - arrSize * 0.6);
      ctx.lineTo(o.x - arrSize * 0.5, ay + arrSize * 0.3);
      ctx.lineTo(o.x + arrSize * 0.5, ay + arrSize * 0.3);
    } else {
      ctx.moveTo(o.x, ay + arrSize * 0.6);
      ctx.lineTo(o.x - arrSize * 0.5, ay - arrSize * 0.3);
      ctx.lineTo(o.x + arrSize * 0.5, ay - arrSize * 0.3);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawOrb(o) {
  if (o.type === 'gravityUp' || o.type === 'gravityDown') { drawGravityOrb(o); return; }
  const pulse = 0.5 + 0.5 * Math.sin(o.pulse * 3);
  const colors = { yellow: ['#ffbb44', '#ff6600'], blue: ['#88ccff', '#1a6acc'], red: ['#ff6666', '#c80000'] };
  const c = colors[o.type] || colors.yellow;
  ctx.save();
  const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.1);
  grd.addColorStop(0, c[0] + 'EE'); grd.addColorStop(0.55, c[1] + '88'); grd.addColorStop(1, c[1] + '00');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.fillStyle = c[0];
  ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.72 + pulse * 0.1), 0, Math.PI*2); ctx.fill();
  if (o.type === 'yellow') {
    ctx.fillStyle = '#000'; const a = o.r * 0.55;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - a);
    ctx.lineTo(o.x - a * 0.55, o.y - a * 0.05); ctx.lineTo(o.x - a * 0.22, o.y - a * 0.05);
    ctx.lineTo(o.x - a * 0.22, o.y + a * 0.7); ctx.lineTo(o.x + a * 0.22, o.y + a * 0.7);
    ctx.lineTo(o.x + a * 0.22, o.y - a * 0.05); ctx.lineTo(o.x + a * 0.55, o.y - a * 0.05);
    ctx.closePath(); ctx.fill();
  } else if (o.type === 'red') {
    ctx.fillStyle = '#fff'; const a = o.r * 0.42;
    for (let k = 0; k < 2; k++) {
      const yy = o.y + a * 0.55 - k * a * 0.9;
      ctx.beginPath();
      ctx.moveTo(o.x, yy - a); ctx.lineTo(o.x - a * 0.7, yy); ctx.lineTo(o.x + a * 0.7, yy);
      ctx.closePath(); ctx.fill();
    }
  } else if (o.type === 'blue') {
    ctx.fillStyle = '#fff'; const a = o.r * 0.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + a); ctx.lineTo(o.x - a * 0.7, o.y - a * 0.2); ctx.lineTo(o.x + a * 0.7, o.y - a * 0.2);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawCoin(c) {
  const cx = c.x + c.w/2;
  const bob = Math.sin((c.pulse||0) * 4) * 4 * S;
  const cy = c.y + c.h/2 + bob, r = c.r;
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  grd.addColorStop(0, 'rgba(255, 230, 80, 0.55)');
  grd.addColorStop(1, 'rgba(255, 230, 80, 0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, r*2.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(cx, cy, r*0.9, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#b8791f'; ctx.lineWidth = 2*S; ctx.stroke();
  ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 1.4*S;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.55, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath(); ctx.ellipse(cx - r*0.30, cy - r*0.35, r*0.18, r*0.10, -0.5, 0, Math.PI * 2); ctx.fill();
}
function drawCoinIcon(cx, cy, r) {
  ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#b8791f'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.55, 0, Math.PI*2); ctx.stroke();
}
function drawGoalDoor() {
  if (!goal) return;
  const gx = goal.x, gy = goal.y, gw = goal.w, gh = goal.h;
  const r = gw/2, archY = gy + r, bottomY = gy + gh;
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.moveTo(gx, bottomY); ctx.lineTo(gx, archY);
  ctx.arc(gx + r, archY, r, Math.PI, 0);
  ctx.lineTo(gx + gw, bottomY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 2*S;
  ctx.beginPath();
  ctx.moveTo(gx, bottomY); ctx.lineTo(gx, archY);
  ctx.arc(gx + r, archY, r, Math.PI, 0);
  ctx.lineTo(gx + gw, bottomY); ctx.stroke();
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(gx + gw - 6*S, gy + gh*0.62, 3.2*S, 0, Math.PI*2); ctx.fill();
}
function drawHeartShape(cx, cy, size, fill, stroke) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.9);
  ctx.bezierCurveTo(-size*1.2, size*0.1, -size*0.9, -size*1.0, 0, -size*0.3);
  ctx.bezierCurveTo(size*0.9, -size*1.0, size*1.2, size*0.1, 0, size*0.9);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
function drawUI() {
  const fs = Math.max(13, 18*S);
  ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const levelNum = score + 1;
  const isCp = CHECKPOINT_LEVELS.indexOf(levelNum) !== -1;
  const lvlName = LEVEL_DATA[levelNum-1] ? LEVEL_DATA[levelNum-1].name : '—';
  const diffLabel = difficulty === 'easy' ? 'Легко' : (difficulty === 'hard' ? 'Сложно' : 'Средне');
  const text = `Уровень: ${levelNum}/${TOTAL_LEVELS}` + (isCp ? ' ★' : '') + `  [${diffLabel}]`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, Math.max(tw + 16, 140*S), fs + 28*S);
  ctx.fillStyle = '#ffff00';
  ctx.fillText(text, 16, 12);
  ctx.font = `bold ${Math.max(11, 13*S)}px -apple-system, Arial, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.fillText(lvlName, 16, 12 + fs + 2);
  const hs = Math.max(12, 14*S), hsp = hs * 2.6;
  const hx0 = 8 + 8 + hs, hy = 8 + fs + 30*S + hs + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, hy - hs - 6*S, hsp*3 + 4*S, hs*2 + 8*S);
  for (let i = 0; i < 3; i++) {
    const cx = hx0 + i * hsp, filled = i < lives;
    drawHeartShape(cx, hy, hs, filled ? '#ff3366' : 'rgba(255,255,255,0.15)', filled ? '#8a001a' : 'rgba(0,0,0,0.55)');
  }
  const cR = Math.max(10, 13*S), cm = 10*S, cp = 8*S, cg = 6*S;
  ctx.font = `bold ${Math.max(14, 18*S)}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  const cTxt = `${totalCoins}`;
  const cTw = ctx.measureText(cTxt).width;
  const cBW = cp*2 + cTw + cg + cR*2, cBH = cR*2 + 10*S;
  const cBX = W - cm - cBW, cBY = cm;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cBX, cBY, cBW, cBH);
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(cTxt, cBX + cp, cBY + cBH/2);
  drawCoinIcon(cBX + cp + cTw + cg + cR, cBY + cBH/2, cR);
}
function drawButton(name) {
  const b = buttons[name];
  const alpha = b.pressed ? 0.65 : 0.30;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill();
  ctx.strokeStyle = `rgba(0,0,0,${b.pressed ? 0.85 : 0.5})`;
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const r = b.r;
  ctx.beginPath();
  if (name === 'left') { ctx.moveTo(b.x - r*0.25, b.y); ctx.lineTo(b.x + r*0.30, b.y - r*0.40); ctx.lineTo(b.x + r*0.30, b.y + r*0.40); }
  else if (name === 'right') { ctx.moveTo(b.x + r*0.25, b.y); ctx.lineTo(b.x - r*0.30, b.y - r*0.40); ctx.lineTo(b.x - r*0.30, b.y + r*0.40); }
  else if (name === 'jump') {
    ctx.moveTo(b.x, b.y - r*0.45); ctx.lineTo(b.x + r*0.40, b.y + r*0.15);
    ctx.lineTo(b.x + r*0.15, b.y + r*0.15); ctx.lineTo(b.x + r*0.15, b.y + r*0.45);
    ctx.lineTo(b.x - r*0.15, b.y + r*0.45); ctx.lineTo(b.x - r*0.15, b.y + r*0.15);
    ctx.lineTo(b.x - r*0.40, b.y + r*0.15);
  }
  ctx.closePath(); ctx.fill();
}
function drawButtons() { drawButton('left'); drawButton('right'); drawButton('jump'); }
function drawPauseButton() {
  ctx.save();
  ctx.beginPath(); ctx.arc(pauseButton.x, pauseButton.y, pauseButton.r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
  const r = pauseButton.r, bw = r*0.22, bh = r*0.85;
  ctx.fillStyle = '#fff';
  ctx.fillRect(pauseButton.x - r*0.30 - bw/2, pauseButton.y - bh/2, bw, bh);
  ctx.fillRect(pauseButton.x + r*0.30 - bw/2, pauseButton.y - bh/2, bw, bh);
  ctx.restore();
}
function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const f1 = Math.max(24, 36*S);
  ctx.font = `bold ${f1}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ff4444';
  ctx.strokeText('ИГРА ОКОНЧЕНА', W/2, H/2 - f1*1.4); ctx.fillText('ИГРА ОКОНЧЕНА', W/2, H/2 - f1*1.4);
  const f2 = Math.max(14, 20*S);
  ctx.font = `bold ${f2}px -apple-system, Arial, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.fillText(`Дошёл до уровня: ${score + 1}`, W/2, H/2 - f1*0.2);
  if (checkpointLevel > 1) {
    ctx.font = `bold ${Math.max(13, 18*S)}px -apple-system, Arial, sans-serif`;
    ctx.fillStyle = '#88ff88';
    ctx.fillText(`★ Чекпоинт: уровень ${checkpointLevel}`, W/2, H/2 + f1*0.5);
  }
  ctx.font = `bold ${Math.max(12, 17*S)}px -apple-system, Arial, sans-serif`;
  ctx.fillStyle = '#ffff66';
  ctx.fillText('Коснись экрана, чтобы продолжить', W/2, H/2 + f1*1.4);
}
function drawRoundedButton(rect, label, color, fontSize) {
  const rad = Math.min(rect.h * 0.25, 16 * S);
  ctx.save();
  ctx.beginPath();
  const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
  ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, 3 * S); ctx.stroke();
  const fs = fontSize || Math.max(16, Math.min(rect.h * 0.42, 32 * S));
  ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, fs * 0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  const cx = x + w/2, cy = y + h/2;
  ctx.strokeText(label, cx, cy); ctx.fillText(label, cx, cy);
  ctx.restore();
}

/* ====== ЭКРАНЫ АУТЕНТИФИКАЦИИ ====== */
function drawToast() {
  if (authToastTimer <= 0 || !authToast) return;
  const fs = Math.max(12, Math.min(16, 15 * S));
  ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
  const tw = ctx.measureText(authToast).width;
  const bx = W/2 - tw/2 - 14 * S;
  const by = 8 * S;
  const bh = fs + 16 * S;
  ctx.save();
  ctx.globalAlpha = Math.min(1, authToastTimer / 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(bx, by, tw + 28 * S, bh);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, tw + 28 * S, bh);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd700';
  ctx.fillText(authToast, W/2, by + bh/2);
  ctx.restore();
}
function drawAuthChoiceScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(26, Math.min(W * 0.08, H * 0.14));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(6, fsT * 0.10); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 20;
  ctx.strokeText('СТУЛЬЯ ПРОТИВ ПАРТ', W/2, H*0.20);
  ctx.fillText('СТУЛЬЯ ПРОТИВ ПАРТ', W/2, H*0.20);
  ctx.shadowBlur = 0;

  const fsSub = Math.max(14, Math.min(W * 0.04, H * 0.075));
  ctx.font = `bold ${fsSub}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(4, fsSub * 0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('Войдите или зарегистрируйтесь', W/2, H*0.35);
  ctx.fillText('Войдите или зарегистрируйтесь', W/2, H*0.35);

  const b = getAuthChoiceButtons();
  drawRoundedButton(b.login, 'ВОЙТИ', '#169b62');
  drawRoundedButton(b.register, 'ЗАРЕГИСТРИРОВАТЬСЯ', '#d09020');
  drawToast();
}
function drawAuthInputLabel(text, yOffset) {
  const fs = Math.max(11, 13 * S);
  ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const w = ctx.measureText(text).width + 12;
  const x = W/2 - w/2;
  ctx.fillRect(x, yOffset - fs/2 - 2, w, fs + 4);
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1;
  ctx.strokeRect(x, yOffset - fs/2 - 2, w, fs + 4);
  ctx.fillStyle = '#ffd700';
  ctx.fillText(text, W/2, yOffset);
}
function drawAuthBaseScreen(title, subtitle) {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(20, Math.min(W * 0.06, H * 0.10));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(5, fsT * 0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText(title, W/2, H * 0.08);
  ctx.fillText(title, W/2, H * 0.08);

  const fsS = Math.max(11, Math.min(W * 0.035, H * 0.06));
  ctx.font = `bold ${fsS}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffffff';
  ctx.strokeText(subtitle, W/2, H * 0.08 + fsT * 1.1);
  ctx.fillText(subtitle, W/2, H * 0.08 + fsT * 1.1);
}
function drawAuthLoginScreen() {
  drawAuthBaseScreen('ВХОД', 'Введите email и пароль');
  const vh = window.innerHeight || H;
  const inH = Math.max(44, Math.min(52, 50 * S));
  const baseTop = Math.max(58, vh * 0.16);
  drawAuthInputLabel('EMAIL', baseTop - 12);
  drawAuthInputLabel('ПАРОЛЬ', baseTop + inH + 14 - 12);

  const b = getAuthActionButtons();
  drawRoundedButton(b.submit, 'ВОЙТИ', '#169b62');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
  drawToast();
}
function drawAuthRegisterEmailScreen() {
  drawAuthBaseScreen('РЕГИСТРАЦИЯ', 'Шаг 1 из 3: Введите email');
  const vh = window.innerHeight || H;
  const top = Math.max(58, vh * 0.24);
  drawAuthInputLabel('EMAIL', top - 12);

  const b = getAuthActionButtons();
  drawRoundedButton(b.submit, 'ОТПРАВИТЬ КОД', '#d09020');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
  drawToast();
}
function drawAuthRegisterCodeScreen() {
  drawAuthBaseScreen('ПОДТВЕРЖДЕНИЕ', 'Шаг 2 из 3: Введите код из email');
  const vh = window.innerHeight || H;
  const top = Math.max(58, vh * 0.24);
  drawAuthInputLabel('КОД (6 ЦИФР)', top - 12);

  const b = getAuthActionButtons();
  drawRoundedButton(b.submit, 'ПОДТВЕРДИТЬ', '#d09020');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
  drawToast();
}
function drawAuthRegisterPasswordScreen() {
  drawAuthBaseScreen('ПРИДУМАЙТЕ ПАРОЛЬ', 'Шаг 3 из 3: Создание пароля');
  const vh = window.innerHeight || H;
  const top = Math.max(58, vh * 0.24);
  drawAuthInputLabel('ПАРОЛЬ (мин. 4 символа)', top - 12);

  const b = getAuthActionButtons();
  drawRoundedButton(b.submit, 'СОЗДАТЬ АККАУНТ', '#169b62');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
  drawToast();
}
function drawAuthSuccessScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = Math.max(28, Math.min(W * 0.09, H * 0.16));
  ctx.font = `bold ${fs}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(6, fs * 0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#88ff88';
  ctx.shadowColor = '#00ff00'; ctx.shadowBlur = 30;
  ctx.strokeText('✓ УСПЕШНАЯ РЕГИСТРАЦИЯ!', W/2, H * 0.42);
  ctx.fillText('✓ УСПЕШНАЯ РЕГИСТРАЦИЯ!', W/2, H * 0.42);
  ctx.shadowBlur = 0;

  const fs2 = Math.max(13, Math.min(W * 0.04, H * 0.07));
  ctx.font = `bold ${fs2}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffffff';
  ctx.strokeText('Переход в главное меню...', W/2, H * 0.62);
  ctx.fillText('Переход в главное меню...', W/2, H * 0.62);
}

function drawMenuScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(28, Math.min(W * 0.085, H * 0.16));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(6, fsT * 0.10); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 20;
  ctx.strokeText('СТУЛЬЯ ПРОТИВ ПАРТ', W/2, H*0.20);
  ctx.fillText('СТУЛЬЯ ПРОТИВ ПАРТ', W/2, H*0.20);
  ctx.shadowBlur = 0;

  if (loggedInEmail) {
    const fsSub = Math.max(10, 12 * S);
    ctx.font = `bold ${fsSub}px -apple-system, Arial, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#88ff88';
    const info = '👤 ' + loggedInEmail;
    ctx.strokeText(info, W/2, H*0.20 + fsT*0.75);
    ctx.fillText(info, W/2, H*0.20 + fsT*0.75);
  }

  const b = getMenuButtons();
  drawRoundedButton(b.play, 'ИГРАТЬ', '#169b62');
  drawRoundedButton(b.shop, 'МАГАЗИН', '#d09020');
  drawRoundedButton(b.settings, 'НАСТРОЙКИ', '#c81e1e');
  drawRoundedButton(b.withdraw, 'ВЫВЕСТИ ДЕНЬГИ', '#2a6fb0');
  drawToast();
}
function drawDifficultyScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(22, Math.min(W * 0.06, H * 0.10));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(5, fsT * 0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('ВЫБЕРИТЕ СЛОЖНОСТЬ', W/2, H*0.28);
  ctx.fillText('ВЫБЕРИТЕ СЛОЖНОСТЬ', W/2, H*0.28);
  const b = getDifficultyButtons();
  drawRoundedButton(b.easy, 'ЛЕГКО', '#169b62');
  drawRoundedButton(b.medium, 'СРЕДНЕ', '#d09020');
  drawRoundedButton(b.hard, 'СЛОЖНО', '#c81e1e');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
}
function drawSettingsScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(20, Math.min(W*0.06, H*0.10));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(4, fsT*0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('НАСТРОЙКИ', W/2, 30*S); ctx.fillText('НАСТРОЙКИ', W/2, 30*S);
  const b = getSettingsButtons();
  drawRoundedButton(b.minus, '−', '#555', Math.max(20, 26*S));
  drawRoundedButton(b.plus, '+', '#555', Math.max(20, 26*S));
  const pct = Math.round(customButtonScale * 100) + '%';
  ctx.font = `bold ${Math.max(16, 22*S)}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  const cx = (b.minus.x + b.minus.w + b.plus.x)/2;
  ctx.strokeText(pct, cx, b.minus.y + b.minus.h/2);
  ctx.fillText(pct, cx, b.minus.y + b.minus.h/2);
  for (const n of ['left','right','jump']) {
    const bb = buttons[n];
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.stroke();
  }
  const hY = b.reset.y - 30*S;
  ctx.font = `bold ${Math.max(12, 16*S)}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  ctx.strokeText('Перетаскивай кнопки для изменения положения', W/2, hY);
  ctx.fillText('Перетаскивай кнопки для изменения положения', W/2, hY);
  drawRoundedButton(b.reset, 'СБРОС', '#884400');
  drawRoundedButton(b.back, 'НАЗАД', '#444');
}
function drawShopScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(22, Math.min(W*0.06, H*0.10));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(5, fsT*0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('МАГАЗИН', W/2, 22*S); ctx.fillText('МАГАЗИН', W/2, 22*S);
  const cR = Math.max(10, 13*S), cyy = Math.max(cR + 8*S, 22*S);
  ctx.font = `bold ${Math.max(14, 18*S)}px -apple-system, Arial, sans-serif`;
  ctx.textAlign = 'left';
  const cTxt = `${totalCoins}`;
  const cTw = ctx.measureText(cTxt).width;
  const cp = 8*S, cg = 6*S;
  const cBW = cp*2 + cR*2 + cg + cTw, cBH = cR*2 + 12*S;
  const cBX = W - 12*S - cBW, cBY = cyy - cBH/2;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(cBX, cBY, cBW, cBH);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.strokeRect(cBX, cBY, cBW, cBH);
  drawCoinIcon(cBX + cp + cR, cyy, cR);
  ctx.fillStyle = '#ffd54a';
  ctx.fillText(cTxt, cBX + cp + cR*2 + cg, cyy);
  ctx.textAlign = 'center';
  const shop = getShopCards();
  for (let i = 0; i < shop.cards.length; i++) {
    const card = shop.cards[i], skin = SKINS[i];
    const owned = ownedSkins.includes(skin.id), active = currentSkin === skin.id;
    let bc = 'rgba(255,255,255,0.4)';
    if (active) bc = '#ffd700'; else if (owned) bc = '#169b62';
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.strokeStyle = bc; ctx.lineWidth = active ? 3 : 2; ctx.strokeRect(card.x, card.y, card.w, card.h);
    const pvW = card.w - 16*S, pvH = card.h * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(card.x + 8*S, card.y + 8*S, pvW, pvH);
    const sh = pvH * 0.7, sw = sh * (34/45);
    drawSkinShape(card.x + 8*S + (pvW - sw)/2, card.y + 8*S + (pvH - sh)/2, sw, sh, skin.id);
    ctx.font = `bold ${Math.max(10, 12*S)}px -apple-system, Arial, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(skin.name, card.x + card.w/2, card.y + pvH + 24*S);
    if (active) { ctx.fillStyle = '#ffd700'; ctx.fillText('АКТИВЕН', card.x + card.w/2, card.y + card.h - 14*S); }
    else if (owned) { ctx.fillStyle = '#88ff88'; ctx.fillText('НАДЕТЬ', card.x + card.w/2, card.y + card.h - 14*S); }
    else { ctx.fillStyle = totalCoins >= skin.price ? '#ffd54a' : '#ff7777'; ctx.fillText(`${skin.price}`, card.x + card.w/2, card.y + card.h - 14*S); }
  }
  drawRoundedButton(shop.back, 'НАЗАД', '#444');
}
function drawWithdrawScreen() {
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(22, Math.min(W*0.07, H*0.11));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(6, fsT*0.12); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('ВЫВОД СРЕДСТВ', W/2, H*0.30); ctx.fillText('ВЫВОД СРЕДСТВ', W/2, H*0.30);

  const fsMsg = Math.max(18, Math.min(W*0.055, H*0.09));
  ctx.font = `bold ${fsMsg}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(5, fsMsg*0.12); ctx.strokeStyle = '#000';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText('БУДЕТ ДОСТУПНО', W/2, H*0.48); ctx.fillText('БУДЕТ ДОСТУПНО', W/2, H*0.48);
  ctx.strokeText('В БУДУЩЕМ', W/2, H*0.48 + fsMsg*1.3); ctx.fillText('В БУДУЩЕМ', W/2, H*0.48 + fsMsg*1.3);

  const bW = Math.max(140, 180 * S), bH = Math.max(44, 56 * S);
  drawRoundedButton({ x: W/2 - bW/2, y: H - bH - 20*S, w: bW, h: bH }, 'НАЗАД', '#444');
}
function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fsT = Math.max(28, Math.min(W*0.09, H*0.16));
  ctx.font = `bold ${fsT}px -apple-system, Arial, sans-serif`;
  ctx.lineWidth = Math.max(6, fsT*0.10); ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffd700';
  ctx.strokeText('ПАУЗА', W/2, H*0.30); ctx.fillText('ПАУЗА', W/2, H*0.30);
  const b = getPauseButtons();
  drawRoundedButton(b.resume, 'ПРОДОЛЖИТЬ', '#169b62');
  drawRoundedButton(b.menu, 'В МЕНЮ', '#c81e1e');
}

function render() {
  if (!isLandscape) return;
  if (uiState === 'auth')                  { drawAuthChoiceScreen();          return; }
  if (uiState === 'authLogin')             { drawAuthLoginScreen();           return; }
  if (uiState === 'authRegisterEmail')     { drawAuthRegisterEmailScreen();   return; }
  if (uiState === 'authRegisterCode')      { drawAuthRegisterCodeScreen();    return; }
  if (uiState === 'authRegisterPassword')  { drawAuthRegisterPasswordScreen(); return; }
  if (uiState === 'authSuccess')           { drawAuthSuccessScreen();         return; }
  if (uiState === 'menu')                  { drawMenuScreen();                return; }
  if (uiState === 'settings')              { drawSettingsScreen();            return; }
  if (uiState === 'difficulty')            { drawDifficultyScreen();          return; }
  if (uiState === 'shop')                  { drawShopScreen();                return; }
  if (uiState === 'withdraw')              { drawWithdrawScreen();            return; }
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  for (const p of platforms) drawPlatform(p);
  drawCyclicSpikes();
  for (const s of saws) drawSaw(s);
  for (const s of spikes) drawSpike(s);
  for (const pt of portals) drawPortal(pt);
  for (const g of ghosts) drawGhost(g);
  drawGhostParticles();
  for (const o of orbs) drawOrb(o);
  for (const c of levelCoins) drawCoin(c);
  for (const sp of springs) drawSpring(sp);
  drawDebris();
  drawCannon();
  drawCannonBalls();
  if (player) {
    const visible = invulnTimer <= 0 || Math.floor(performance.now()/90) % 2 === 0;
    if (visible) {
      if (gravityDir < 0) {
        const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
        ctx.save();
        ctx.translate(pcx, pcy); ctx.scale(1, -1); ctx.translate(-pcx, -pcy);
        drawSkinShape(player.x, player.y, player.w, player.h, currentSkin);
        ctx.restore();
      } else drawSkinShape(player.x, player.y, player.w, player.h, currentSkin);
    }
  }
  drawGoalDoor();
  if (!isCinematic()) {
    drawUI();
    if (!gameOver && uiState === 'playing') drawButtons();
    if (gameOver) drawGameOver();
  }
  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 40, 40, ${hitFlash*0.6})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (uiState === 'playing' && !gameOver && !isCinematic()) drawPauseButton();
  if (uiState === 'paused') drawPauseOverlay();
}

let lastTime = performance.now();
let accumulator = 0;
const FIXED_STEP = 1 / 60;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastTime) / 1000;
  if (dt > 0.25) dt = 0.25;
  lastTime = now;
  accumulator += dt;

  if (authToastTimer > 0) { authToastTimer -= dt; if (authToastTimer < 0) authToastTimer = 0; }
  if (authSuccessTimer > 0) {
    authSuccessTimer -= dt;
    if (authSuccessTimer <= 0) {
      authSuccessTimer = 0;
      if (uiState === 'authSuccess') uiState = 'menu';
    }
  }

  while (accumulator >= FIXED_STEP) {
    if (isLandscape && player && uiState === 'playing') {
      if (!gameOver) update();
      if (hitFlash > 0) { hitFlash -= FIXED_STEP; if (hitFlash < 0) hitFlash = 0; }
    }
    accumulator -= FIXED_STEP;
  }
  render();
}
resize();
setTimeout(resize, 50);
setTimeout(resize, 200);
setTimeout(resize, 600);
window.addEventListener('load', resize);
requestAnimationFrame(loop);
})();