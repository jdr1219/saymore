/* ════════ Glass Chat — client ════════ */
const socket = io();

const $ = id => document.getElementById(id);

/* THEMES, THEME_VAR_MAP, and getTheme() now live in themes-data.js
   (shared with Glass Games and any future page) — loaded via a
   <script> tag in index.html before this file. */
function parseColorStr(str) {
  str = String(str).trim();
  if (str[0] === '#') {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255, a:1 };
  }
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return { r:p[0]||0, g:p[1]||0, b:p[2]||0, a: p.length>3 ? p[3] : 1 };
  }
  return { r:0, g:0, b:0, a:1 };
}
function lerpColorStr(c1, c2, t) {
  const a = parseColorStr(c1), b = parseColorStr(c2);
  const r = Math.round(a.r + (b.r-a.r)*t), g = Math.round(a.g + (b.g-a.g)*t), bl = Math.round(a.b + (b.b-a.b)*t);
  const al = a.a + (b.a-a.a)*t;
  return `rgba(${r},${g},${bl},${al.toFixed(3)})`;
}
function lerpHexNum(n1, n2, t) {
  const r1=(n1>>16)&255, g1=(n1>>8)&255, b1=n1&255;
  const r2=(n2>>16)&255, g2=(n2>>8)&255, b2=n2&255;
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return (r<<16)|(g<<8)|b;
}

let currentThemeId = localStorage.getItem('gc_theme') || 'sky';
if (!THEMES.some(t => t.id === currentThemeId)) currentThemeId = 'sky';
let vantaEffect = null;
let themeAnimRaf = null;
const themeGridContainers = [];

function setFaviconLink(id, href, fallback) {
  const link = document.getElementById(id);
  if (!link) return;
  const test = new Image();
  test.onload = () => { link.href = href; };
  test.onerror = () => { link.href = fallback; };
  test.src = href;
}
function applyFavicon(theme) {
  const suffix = theme.slug ? `-${theme.slug}` : '';
  setFaviconLink('icon-ico', `favicon${suffix}.ico`, 'favicon.ico');
  setFaviconLink('icon-32', `favicon-32${suffix}.png`, 'favicon-32.png');
  setFaviconLink('apple-touch', `apple-touch-icon${suffix}.png`, 'apple-touch-icon.png');
}

/* Default profile photo — a circle in the current theme's colors with the
   first letter of the person's name, used anywhere someone hasn't uploaded
   a real photo (welcome screen, header, profile menu). */
function letterAvatarDataUrl(letter, theme) {
  const ch = (letter || '?').toString().slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0%" stop-color="${theme.blue}"/><stop offset="100%" stop-color="${theme.blueDeep}"/>`
    + `</linearGradient></defs>`
    + `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`
    + `<text x="32" y="33" font-family="Inter, -apple-system, Helvetica, sans-serif" font-size="30" `
    + `font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${ch}</text>`
    + `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function refreshThemeGridSelection() {
  themeGridContainers.forEach(container => {
    container.querySelectorAll('.theme-mini-swatch').forEach(el => {
      el.classList.toggle('active', el.dataset.themeId === currentThemeId);
    });
  });
}

function applyTheme(id, { animate = true } = {}) {
  const from = getTheme(currentThemeId);
  const to = getTheme(id);
  currentThemeId = id;
  localStorage.setItem('gc_theme', id);
  applyFavicon(to);
  refreshThemeGridSelection();

  const root = document.documentElement.style;
  if (themeAnimRaf) cancelAnimationFrame(themeAnimRaf);

  if (!animate) {
    Object.entries(THEME_VAR_MAP).forEach(([key, cssVar]) => root.setProperty(cssVar, to[key]));
    if (vantaEffect) vantaEffect.setOptions({
      highlightColor: to.vanta.highlight, midtoneColor: to.vanta.midtone,
      lowlightColor: to.vanta.lowlight, baseColor: to.vanta.base,
    });
    return;
  }

  const DUR = 650;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / DUR);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — matches the app's --ease feel
    Object.entries(THEME_VAR_MAP).forEach(([key, cssVar]) => {
      root.setProperty(cssVar, lerpColorStr(from[key], to[key], eased));
    });
    if (vantaEffect) {
      vantaEffect.setOptions({
        highlightColor: lerpHexNum(from.vanta.highlight, to.vanta.highlight, eased),
        midtoneColor: lerpHexNum(from.vanta.midtone, to.vanta.midtone, eased),
        lowlightColor: lerpHexNum(from.vanta.lowlight, to.vanta.lowlight, eased),
        baseColor: lerpHexNum(from.vanta.base, to.vanta.base, eased),
      });
    }
    if (t < 1) themeAnimRaf = requestAnimationFrame(tick);
    else themeAnimRaf = null;
  }
  themeAnimRaf = requestAnimationFrame(tick);
}

function buildThemeSwatch(theme) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-mini-swatch' + (theme.id === currentThemeId ? ' active' : '');
  btn.title = theme.name;
  btn.dataset.themeId = theme.id;
  btn.style.background = `linear-gradient(135deg, ${theme.blue} 0%, ${theme.blueDeep} 55%, ${theme.bodyBg} 100%)`;
  btn.innerHTML = '<svg class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  btn.addEventListener('click', () => {
    applyTheme(theme.id, { animate: true });
    if (typeof refreshDefaultAvatars === 'function') refreshDefaultAvatars();
  });
  return btn;
}
function renderThemeGrid(container) {
  if (!container) return;
  container.innerHTML = '';
  THEMES.forEach(theme => container.appendChild(buildThemeSwatch(theme)));
  if (!themeGridContainers.includes(container)) themeGridContainers.push(container);
}

/* Init Vanta with whatever theme is already saved, then apply the rest
   of that theme's CSS vars instantly — no flash of the default sky
   theme before the saved one kicks in. */
(function initThemeAndVanta() {
  const theme = getTheme(currentThemeId);
  try {
    if (window.THREE && window.VANTA) {
      vantaEffect = VANTA.FOG({
        el: '#bg', mouseControls: true, touchControls: true, gyroControls: false,
        minHeight: 200, minWidth: 200,
        highlightColor: theme.vanta.highlight, midtoneColor: theme.vanta.midtone,
        lowlightColor: theme.vanta.lowlight, baseColor: theme.vanta.base,
      });
    }
  } catch (e) { console.warn('Vanta init failed:', e); }
  applyTheme(currentThemeId, { animate: false });
  renderThemeGrid($('theme-grid-login'));
  renderThemeGrid($('theme-grid-profile'));
})();

let myName = '';
let myAvatar = null;
let pendingSetupAvatar = null;
let pendingProfileMenuAvatar; // undefined = "no new upload chosen this time menu was opened"
let lastGroupEl = null, lastGroupUser = null, lastGroupTime = 0;
let replyTarget = null, editTarget = null;
let typingTimers = {};
let hasJoinedOnce = false;
let soundOn = localStorage.getItem('gc_sound') !== 'off';
let notifOn = localStorage.getItem('gc_notif') === 'on';
let lastDateKey = '';
const GROUP_GAP = 60000;
const AV_COLORS = ['#3fa9e0','#1f7fc9','#5ab3e6','#2f8fd4','#6cc2ec','#1a6bb8'];
const REACTION_SET = ['👍','❤️','😂','😮','😢','🙏'];
const ROOM_ICON_SET = ['🫧','💬','🎮','🎲','🎧','📚','🎨','🍕','☕','🌙','⚡','🔥','🌊','🐝','🎬','⭐'];

/* ── rooms / sidebar state ── */
let currentRoomId = 'general';
let currentRoomInfo = { id: 'general', name: 'General', icon: '💬', isDefault: true, isAdmin: false };
let myRooms = [];
let notificationsList = [];
function roomOf(msgId) { return allMessages.get(msgId)?.roomId || currentRoomId; }

const userColor = n => { let h=0; for (const c of n) h=(h*31+c.charCodeAt(0))&0xffff; return AV_COLORS[h%AV_COLORS.length]; };
const fmtTime = ts => new Date(ts||Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function dateKey(ts) { return new Date(ts).toDateString(); }
function dateLabel(ts) {
  const d = new Date(ts), today = new Date(), yest = new Date(Date.now()-86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric', year: d.getFullYear()!==today.getFullYear()?'numeric':undefined });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

/* Lightweight inline markdown -> safe HTML (bold/italic/code/links/mentions) */
function renderRich(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/@([A-Za-z0-9_]{1,24})/g, (m, name) => `<span class="mention">@${name}</span>`);
  return html;
}

/* ── particles ── */
class Particles {
  constructor(c){this.c=c;this.ctx=c.getContext('2d');this.p=[];this.raf=null;this._r();window.addEventListener('resize',()=>this._r());}
  _r(){this.c.width=innerWidth;this.c.height=innerHeight;}
  burst(px,py,type){
    const theme = getTheme(currentThemeId);
    const cfg = type==='send'
      ? {n:14,vy:-2.0,spd:[2.5,6],sz:[1.5,3.5],dec:[0.022,0.036],cols:[theme.blue,theme.blueDeep,'#ffffff',theme.blueLight]}
      : {n:9,vy:-1.2,spd:[1.2,3.4],sz:[1.2,2.6],dec:[0.026,0.040],cols:['#ffffff',theme.bluePale,theme.blueLight]};
    for(let i=0;i<cfg.n;i++){
      const a=(Math.PI*2*i/cfg.n)+(Math.random()-0.5)*1.1;
      const s=cfg.spd[0]+Math.random()*(cfg.spd[1]-cfg.spd[0]);
      this.p.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s+cfg.vy,
        r:cfg.sz[0]+Math.random()*(cfg.sz[1]-cfg.sz[0]),a:0.8+Math.random()*0.15,
        col:cfg.cols[Math.floor(Math.random()*cfg.cols.length)],
        dec:cfg.dec[0]+Math.random()*(cfg.dec[1]-cfg.dec[0])});
    }
    if(!this.raf)this._loop();
  }
  _loop(){
    const tick=()=>{
      const{ctx,c}=this; ctx.clearRect(0,0,c.width,c.height);
      this.p=this.p.filter(p=>p.a>0.01);
      for(const p of this.p){
        p.x+=p.vx;p.y+=p.vy;p.vy+=0.11;p.vx*=0.97;p.a-=p.dec;p.r*=0.98;
        ctx.save();ctx.globalAlpha=Math.max(0,p.a);ctx.fillStyle=p.col;
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0.1,p.r),0,Math.PI*2);ctx.fill();ctx.restore();
      }
      if(this.p.length){this.raf=requestAnimationFrame(tick);}
      else{this.raf=null;ctx.clearRect(0,0,c.width,c.height);}
    };
    this.raf=requestAnimationFrame(tick);
  }
}
const ps = new Particles($('pcanvas'));
function ripple(x,y){
  const r=document.createElement('div');
  r.className='ripple-ring'; r.style.left=x+'px'; r.style.top=y+'px';
  document.body.appendChild(r);
  setTimeout(()=>r.remove(),520);
}

let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('gc-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'gc-toast'; t.className = 'gc-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ── notification sound: soft two-note chime, gentle attack/decay ── */
let actx = null;
function playTone(freq, startOffset, dur, vol) {
  const now = actx.currentTime + startOffset;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now + dur + 0.02);
}
function chime() {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    playTone(987.77, 0,    0.16, 0.05);
    playTone(1318.5, 0.07, 0.22, 0.045);
  } catch {}
}
function sendTick() {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    playTone(740, 0, 0.09, 0.035);
  } catch {}
}

/* ── image resize helper ── */
function fileToResizedDataUrl(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.onload = () => {
      let { width:w, height:h } = img;
      if (w > h && w > maxDim) { h = h*maxDim/w; w = maxDim; }
      else if (h > maxDim) { w = w*maxDim/h; h = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    }; img.onerror = reject; img.src = e.target.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── per-browser identity ── */
let clientId = localStorage.getItem('gc_client_id');
if (!clientId) {
  clientId = (window.crypto?.randomUUID?.() || (Date.now() + '_' + Math.random().toString(36).slice(2)));
  localStorage.setItem('gc_client_id', clientId);
}

/* ════════════════════════════════════════════════
   PERSONAL "delete for me" / Recently Deleted store
   100% client-side — server and other clients never
   know a message was hidden this way.
════════════════════════════════════════════════ */
const allMessages = new Map(); // id -> latest known full message data

function getRecentlyDeleted() {
  try { return JSON.parse(localStorage.getItem('gc_recently_deleted') || '[]'); }
  catch { return []; }
}
function saveRecentlyDeleted(arr) {
  localStorage.setItem('gc_recently_deleted', JSON.stringify(arr.slice(0, 300)));
}
function getHiddenIds() {
  return new Set(getRecentlyDeleted().map(e => e.id));
}
function addToRecentlyDeleted(entry) {
  const arr = getRecentlyDeleted();
  if (!arr.find(e => e.id === entry.id)) {
    arr.unshift({ ...entry, deletedAt: Date.now() });
    saveRecentlyDeleted(arr);
  }
}
function removeFromRecentlyDeleted(id) {
  saveRecentlyDeleted(getRecentlyDeleted().filter(e => e.id !== id));
}

/* Hide a message from MY view only. If alsoUnsend, also tell the server
   to globally delete it (only valid/used for your OWN messages). */
function hideMessageLocally(msg, alsoUnsend) {
  addToRecentlyDeleted({ ...msg, wasGlobalUnsend: !!alsoUnsend });
  if (alsoUnsend) socket.emit('delete-msg', { id: msg.id, roomId: msg.roomId || currentRoomId });
  rerenderAll();
}

/* ── login / profile setup ──
   We recognize returning visitors by their public IP (server-side
   /api/profile lookup) and skip the "type your name" screen entirely.
   First-time visitors get a one-time welcome screen to set a name + photo. */
function showFieldError(msg) { $('field-error').textContent = msg || ''; }

/* Keeps any currently-shown default (letter) avatars in sync with the
   active theme and the name someone's typed so far — real uploaded
   photos are never touched by this. */
function refreshDefaultAvatars() {
  const theme = getTheme(currentThemeId);
  if (!myAvatar) {
    $('header-avatar').src = letterAvatarDataUrl(myName, theme);
    if (pendingProfileMenuAvatar === undefined) {
      $('profile-menu-avatar-preview').src = letterAvatarDataUrl(myName, theme);
    }
  }
  if (!pendingSetupAvatar) {
    $('setup-avatar-preview').src = letterAvatarDataUrl($('name-input').value.trim(), theme);
  }
}

function updateHeaderProfile() {
  $('header-username').textContent = myName || 'Glass Chat';
  $('header-avatar').src = myAvatar || letterAvatarDataUrl(myName, getTheme(currentThemeId));
}

function goStraightToChat() {
  hasJoinedOnce = true;
  $('login-screen').classList.add('hidden');
  $('chat-screen').classList.remove('hidden');
  updateHeaderProfile();
  socket.emit('join', { name: myName, clientId, avatar: myAvatar });
}

function showWelcomeScreen() {
  $('login-screen').classList.remove('hidden');
  if (!pendingSetupAvatar) {
    $('setup-avatar-preview').src = letterAvatarDataUrl($('name-input').value.trim(), getTheme(currentThemeId));
  }
  setTimeout(() => $('name-input').focus(), 50);
}

async function initProfile() {
  try {
    const res = await fetch('/api/profile');
    const data = await res.json();
    if (data.exists) {
      myName = data.name;
      myAvatar = data.avatar || null;
      localStorage.setItem('gc_name', myName);
      if (myAvatar) localStorage.setItem('gc_avatar', myAvatar); else localStorage.removeItem('gc_avatar');
      goStraightToChat();
      return;
    }
  } catch {}
  // no saved profile for this IP (or the lookup failed) — fall back to
  // any locally cached profile before asking the person to set one up
  const cachedName = localStorage.getItem('gc_name');
  if (cachedName) {
    myName = cachedName;
    myAvatar = localStorage.getItem('gc_avatar') || null;
    goStraightToChat();
  } else {
    showWelcomeScreen();
  }
}
initProfile();

$('setup-avatar-btn').addEventListener('click', () => $('setup-avatar-upload').click());
$('setup-avatar-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToResizedDataUrl(file, 200, 0.85);
    pendingSetupAvatar = dataUrl;
    $('setup-avatar-preview').src = dataUrl;
  } catch {}
});

async function joinChat() {
  const nameInp = $('name-input');
  const name = nameInp.value.trim();
  if (!name) {
    nameInp.classList.remove('shake'); void nameInp.offsetWidth; nameInp.classList.add('shake');
    showFieldError('Enter a name to continue');
    setTimeout(()=>nameInp.classList.remove('shake'),450);
    return;
  }
  showFieldError('');
  $('join-btn').disabled = true;
  myName = name;
  myAvatar = pendingSetupAvatar || null;
  localStorage.setItem('gc_name', name);
  if (myAvatar) localStorage.setItem('gc_avatar', myAvatar); else localStorage.removeItem('gc_avatar');
  try {
    await fetch('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar: myAvatar }),
    });
  } catch {}
  socket.emit('join', { name, clientId, avatar: myAvatar });
}
$('join-btn').addEventListener('click', joinChat);
$('name-input').addEventListener('keydown', e => { if (e.key==='Enter') joinChat(); });
$('name-input').addEventListener('input', () => {
  if (!pendingSetupAvatar) {
    $('setup-avatar-preview').src = letterAvatarDataUrl($('name-input').value.trim(), getTheme(currentThemeId));
  }
});

socket.on('name-taken', () => {
  $('join-btn').disabled = false;
  showFieldError('That name is already taken');
  $('name-input').classList.remove('shake'); void $('name-input').offsetWidth; $('name-input').classList.add('shake');
});
socket.on('error-msg', msg => {
  if ($('profile-menu').classList.contains('open')) { $('profile-menu-error').textContent = msg; return; }
  if (!$('login-screen').classList.contains('hidden')) { showFieldError(msg); return; }
  showToast(msg);
});

socket.on('join-success', () => {
  $('join-btn').disabled = false;
  updateHeaderProfile();
  if (!$('chat-screen').classList.contains('hidden')) {
    // already showing chat (returning-profile flow went straight in)
    hasJoinedOnce ? hideReconnectBanner() : ($('msg-input').focus());
    hasJoinedOnce = true;
  } else {
    // first-time welcome/setup flow — animate the setup card away
    hasJoinedOnce = true;
    $('login-card').classList.add('leaving');
    setTimeout(() => {
      $('login-screen').classList.add('hidden');
      $('chat-screen').classList.remove('hidden');
      $('msg-input').focus();
    }, 280);
  }
});

/* ── settings dropdown: change display name / photo any time ── */
$('profile-trigger').addEventListener('click', e => {
  e.stopPropagation();
  $('more-menu').classList.remove('open');
  const menu = $('profile-menu');
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open');
  if (opening) {
    $('profile-menu-name-input').value = myName;
    $('profile-menu-avatar-preview').src = myAvatar || letterAvatarDataUrl(myName, getTheme(currentThemeId));
    $('profile-menu-error').textContent = '';
    pendingProfileMenuAvatar = undefined;
  }
});
document.addEventListener('click', e => {
  if (!$('profile-menu').contains(e.target) && !$('profile-trigger').contains(e.target)) {
    $('profile-menu').classList.remove('open');
  }
});
$('profile-menu-avatar-btn').addEventListener('click', () => $('profile-menu-avatar-upload').click());
$('profile-menu-avatar-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToResizedDataUrl(file, 200, 0.85);
    pendingProfileMenuAvatar = dataUrl;
    $('profile-menu-avatar-preview').src = dataUrl;
  } catch {}
});
$('profile-menu-save-btn').addEventListener('click', async () => {
  const newName = $('profile-menu-name-input').value.trim();
  if (!newName) { $('profile-menu-error').textContent = 'Enter a name'; return; }
  $('profile-menu-error').textContent = '';
  $('profile-menu-save-btn').disabled = true;
  const payload = { name: newName };
  if (pendingProfileMenuAvatar !== undefined) payload.avatar = pendingProfileMenuAvatar;
  try {
    const res = await fetch('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      $('profile-menu-error').textContent = data.error || 'Could not save';
      $('profile-menu-save-btn').disabled = false;
      return;
    }
    myName = data.name; myAvatar = data.avatar;
    localStorage.setItem('gc_name', myName);
    if (myAvatar) localStorage.setItem('gc_avatar', myAvatar); else localStorage.removeItem('gc_avatar');
    socket.emit('update-profile', { name: myName, avatar: myAvatar });
    updateHeaderProfile();
    $('profile-menu').classList.remove('open');
  } catch {
    $('profile-menu-error').textContent = 'Network error — try again';
  }
  $('profile-menu-save-btn').disabled = false;
});
socket.on('profile-updated', ({ name, avatar }) => {
  myName = name; myAvatar = avatar;
  updateHeaderProfile();
});

/* ── sign out ──
   Forgets the profile on the server (so the IP-recognition flow in
   initProfile() doesn't just log the person straight back in on their
   next visit or a page refresh), clears what's cached locally, and
   drops back to the welcome/setup screen. */
async function signOut() {
  if (!confirm('Sign out of Glass Chat?')) return;
  try { await fetch('/api/profile', { method: 'DELETE' }); } catch {}

  localStorage.removeItem('gc_name');
  localStorage.removeItem('gc_avatar');
  myName = ''; myAvatar = null;
  pendingSetupAvatar = null; pendingProfileMenuAvatar = undefined;
  hasJoinedOnce = false;

  $('profile-menu').classList.remove('open');
  $('more-menu').classList.remove('open');
  $('recently-deleted-screen').classList.add('hidden');
  $('chat-screen').classList.add('hidden');

  $('messages').innerHTML = '';
  allMessages.clear();
  lastGroupEl = null; lastGroupUser = null; lastDateKey = '';
  currentRoomId = 'general';
  currentRoomInfo = { id: 'general', name: 'General', icon: '💬', isDefault: true, isAdmin: false };
  myRooms = []; notificationsList = [];
  renderRoomList(); renderNotiList(); updateCurrentRoomLabel();
  collapseRailSections(); closeMobileRail();

  $('name-input').value = '';
  showFieldError('');
  $('setup-avatar-preview').src = letterAvatarDataUrl('', getTheme(currentThemeId));

  $('login-screen').classList.remove('hidden');
  $('login-card').classList.remove('leaving');
  // replay the welcome card's entrance animation instead of leaving it static
  $('login-card').style.animation = 'none';
  void $('login-card').offsetWidth;
  $('login-card').style.animation = '';
  setTimeout(() => $('name-input').focus(), 50);

  socket.disconnect();
  socket.connect();
}
$('signout-btn').addEventListener('click', signOut);

/* ── grouping / positions ── */
function updatePositions(stack) {
  const bs = stack.querySelectorAll('.bubble-wrap');
  bs.forEach((b, i) => {
    const bub = b.querySelector('.bubble');
    bub.dataset.pos = bs.length===1 ? 'single' : i===0 ? 'first' : i===bs.length-1 ? 'last' : 'middle';
  });
}

function maybeDateDivider(ts) {
  const k = dateKey(ts);
  if (k !== lastDateKey) {
    lastDateKey = k;
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.innerHTML = `<span>${dateLabel(ts)}</span>`;
    $('messages').appendChild(div);
    lastGroupEl = null; lastGroupUser = null;
  }
}

function renderReactions(msgId, reactions) {
  const row = document.createElement('div');
  row.className = 'reactions-row';
  row.dataset.msgId = msgId;
  (reactions||[]).forEach(r => {
    if (!r.users.length) return;
    const pill = document.createElement('span');
    pill.className = 'reaction-pill' + (r.users.includes(myName) ? ' mine' : '');
    pill.textContent = `${r.emoji} ${r.users.length}`;
    pill.title = r.users.join(', ');
    pill.addEventListener('click', () => socket.emit('react', { msgId, emoji: r.emoji, roomId: roomOf(msgId) }));
    row.appendChild(pill);
  });
  return row;
}

function openEmojiPicker(msgId, anchorEl) {
  document.querySelectorAll('.emoji-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  REACTION_SET.forEach(e => {
    const b = document.createElement('button');
    b.textContent = e;
    b.addEventListener('click', () => { socket.emit('react', { msgId, emoji: e, roomId: roomOf(msgId) }); picker.remove(); });
    picker.appendChild(b);
  });
  anchorEl.style.position = 'relative';
  anchorEl.appendChild(picker);
  const close = ev => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function svgIcon(name) {
  const icons = {
    react: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8 15c1 1.2 2.4 2 4 2s3-.8 4-2"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    edit:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  };
  return icons[name] || '';
}

/* ── per-message action bar ──
   React + Reply available on everyone's messages.
   Edit is own-only. Delete is available on ANY message —
   for your own it also unsends globally; for others it
   only ever hides the message from YOUR view. */
function buildBubbleActions(msg, isOwn) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-actions';
  if (msg.deleted) return wrap;

  const reactBtn = document.createElement('button');
  reactBtn.innerHTML = svgIcon('react'); reactBtn.title = 'React';
  reactBtn.addEventListener('click', e => { e.stopPropagation(); openEmojiPicker(msg.id, wrap.parentElement); });
  wrap.appendChild(reactBtn);

  const replyBtn = document.createElement('button');
  replyBtn.innerHTML = svgIcon('reply'); replyBtn.title = 'Reply';
  replyBtn.addEventListener('click', e => { e.stopPropagation(); startReply(msg); });
  wrap.appendChild(replyBtn);

  if (isOwn) {
    const editBtn = document.createElement('button');
    editBtn.innerHTML = svgIcon('edit'); editBtn.title = 'Edit';
    editBtn.addEventListener('click', e => { e.stopPropagation(); startEdit(msg); });
    wrap.appendChild(editBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.innerHTML = svgIcon('trash');
  delBtn.title = isOwn ? 'Unsend' : 'Remove from your view';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    const ok = confirm(isOwn ? 'Unsend this message for everyone?' : 'Remove this message from your view? No one else will know.');
    if (ok) hideMessageLocally(msg, isOwn);
  });
  wrap.appendChild(delBtn);
  return wrap;
}

/* ── tap to reveal actions on touch devices, tap again to hide
   (disabled while select mode is active — taps select instead) ── */
const MOVE_CANCEL_PX = 10;
let activeActionsGroup = null;

function closeActiveActions() {
  if (activeActionsGroup) { activeActionsGroup.classList.remove('actions-visible'); activeActionsGroup = null; }
}

function attachTapToggle(bubble, group) {
  let startX = 0, startY = 0, moved = false;

  bubble.addEventListener('touchstart', e => {
    if (selectMode) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; moved = false;
    bubble.classList.add('pressing');
  }, { passive: true });

  bubble.addEventListener('touchmove', e => {
    if (selectMode) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX) {
      moved = true;
      bubble.classList.remove('pressing');
    }
  }, { passive: true });

  bubble.addEventListener('touchend', e => {
    if (selectMode) return;
    bubble.classList.remove('pressing');
    if (moved) return;
    if (e.target.tagName === 'IMG' || e.target.closest('a')) return;
    e.preventDefault();
    const isOpen = group.classList.contains('actions-visible');
    if (activeActionsGroup && activeActionsGroup !== group) activeActionsGroup.classList.remove('actions-visible');
    if (isOpen) {
      group.classList.remove('actions-visible');
      activeActionsGroup = null;
    } else {
      group.classList.add('actions-visible');
      activeActionsGroup = group;
      if (navigator.vibrate) navigator.vibrate(8);
    }
  });

  bubble.addEventListener('touchcancel', () => bubble.classList.remove('pressing'));
}

document.addEventListener('touchstart', e => {
  if (selectMode) return;
  if (activeActionsGroup && !activeActionsGroup.contains(e.target)) closeActiveActions();
}, { passive: true });
document.addEventListener('click', e => {
  if (selectMode) return;
  if (activeActionsGroup && !activeActionsGroup.contains(e.target)) closeActiveActions();
});

/* ════════════════════════════════════════════════
   SELECT MODE — bulk delete
════════════════════════════════════════════════ */
let selectMode = false;
const selectedIds = new Set();

function updateSelectBar() {
  $('select-count').textContent = `${selectedIds.size} selected`;
  $('select-delete-btn').disabled = selectedIds.size === 0;
}

function enterSelectMode() {
  selectMode = true;
  selectedIds.clear();
  closeActiveActions();
  document.body.classList.add('select-mode-active');
  $('select-bar').classList.add('open');
  updateSelectBar();
}
function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  document.body.classList.remove('select-mode-active');
  document.querySelectorAll('.bubble-wrap.selected').forEach(w => w.classList.remove('selected'));
  $('select-bar').classList.remove('open');
}

$('select-mode-btn').addEventListener('click', () => {
  $('more-menu').classList.remove('open');
  enterSelectMode();
});
$('select-cancel-btn').addEventListener('click', exitSelectMode);
$('select-delete-btn').addEventListener('click', () => {
  if (!selectedIds.size) return;
  const n = selectedIds.size;
  if (!confirm(`Remove ${n} message${n>1?'s':''}? Your own messages will be unsent for everyone; others' messages will only be removed from your view.`)) return;
  for (const id of selectedIds) {
    const msg = allMessages.get(id);
    if (!msg) continue;
    const isOwn = msg.user === myName;
    addToRecentlyDeleted({ ...msg, wasGlobalUnsend: isOwn });
    if (isOwn) socket.emit('delete-msg', { id, roomId: msg.roomId || currentRoomId });
  }
  exitSelectMode();
  rerenderAll();
});

$('messages').addEventListener('click', e => {
  if (!selectMode) return;
  const wrap = e.target.closest('.bubble-wrap');
  if (!wrap || !wrap.dataset.msgId) return;
  const id = wrap.dataset.msgId;
  if (selectedIds.has(id)) { selectedIds.delete(id); wrap.classList.remove('selected'); }
  else { selectedIds.add(id); wrap.classList.add('selected'); }
  updateSelectBar();
});

/* ── more menu (header "..." button) ── */
$('more-btn').addEventListener('click', e => {
  e.stopPropagation();
  $('profile-menu').classList.remove('open');
  $('more-menu').classList.toggle('open');
});
document.addEventListener('click', e => {
  if (!$('more-menu').contains(e.target) && e.target !== $('more-btn') && !$('more-btn').contains(e.target)) {
    $('more-menu').classList.remove('open');
  }
});

/* ════════════════════════════════════════════════
   RECENTLY DELETED screen
════════════════════════════════════════════════ */
function openRecentlyDeleted() {
  $('more-menu').classList.remove('open');
  renderRecentlyDeletedList();
  $('recently-deleted-screen').classList.remove('hidden');
}
function closeRecentlyDeleted() {
  $('recently-deleted-screen').classList.add('hidden');
}
$('recently-deleted-btn').addEventListener('click', openRecentlyDeleted);
$('rd-back-btn').addEventListener('click', closeRecentlyDeleted);

function renderRecentlyDeletedList() {
  const list = $('recently-deleted-list');
  const entries = getRecentlyDeleted();
  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<div class="rd-empty">Nothing here right now.</div>';
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'rd-row';
    const info = document.createElement('div');
    info.className = 'rd-info';
    const who = document.createElement('div');
    who.className = 'rd-who';
    who.textContent = entry.user === myName ? 'You' : entry.user;
    const snippet = document.createElement('div');
    snippet.className = 'rd-snippet';
    snippet.textContent = entry.image && !entry.text ? '📷 Image' : (entry.text || '(empty message)');
    const when = document.createElement('div');
    when.className = 'rd-when';
    when.textContent = `Deleted ${timeAgo(entry.deletedAt)}`;
    info.appendChild(who); info.appendChild(snippet); info.appendChild(when);

    const actions = document.createElement('div');
    actions.className = 'rd-actions';
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'rd-btn rd-restore'; restoreBtn.innerHTML = svgIcon('restore') + '<span>Restore</span>';
    restoreBtn.addEventListener('click', () => restoreMessage(entry));
    const permBtn = document.createElement('button');
    permBtn.className = 'rd-btn rd-perm'; permBtn.innerHTML = svgIcon('trash') + '<span>Delete</span>';
    permBtn.addEventListener('click', () => {
      if (confirm('Permanently delete this from Recently Deleted? This cannot be undone.')) {
        removeFromRecentlyDeleted(entry.id);
        renderRecentlyDeletedList();
      }
    });
    actions.appendChild(restoreBtn); actions.appendChild(permBtn);

    row.appendChild(info); row.appendChild(actions);
    list.appendChild(row);
  });
}

function restoreMessage(entry) {
  removeFromRecentlyDeleted(entry.id);
  if (entry.wasGlobalUnsend) {
    // original was actually unsent server-side and is gone for good —
    // the only way "back" is to resend the content as a new message.
    socket.emit('message', { text: entry.text || '', image: entry.image || null });
  } else {
    rerenderAll();
  }
  renderRecentlyDeletedList();
}

function startReply(msg) {
  replyTarget = msg;
  $('reply-bar').classList.add('open');
  $('reply-bar-text').innerHTML = `Replying to <b>${escapeHtml(msg.user)}</b>: ${escapeHtml((msg.text||'📷 image').slice(0,60))}`;
  $('msg-input').focus();
}
$('reply-bar-close').addEventListener('click', () => { replyTarget = null; $('reply-bar').classList.remove('open'); });

function startEdit(msg) {
  editTarget = msg;
  $('edit-bar').classList.add('open');
  $('msg-input').value = msg.text;
  $('msg-input').focus();
  autoResize();
}
$('edit-bar-close').addEventListener('click', () => { editTarget = null; $('edit-bar').classList.remove('open'); $('msg-input').value=''; });

/* ════════════════════════════════════════════════
   MESSAGE RENDERING
   buildMessageDOM = pure DOM construction (reused by
   live append AND full rebuilds for hide/restore/select).
   addMessage = live wrapper with side effects (sound,
   scroll, unread badge, read receipts).
════════════════════════════════════════════════ */
function buildMessageDOM(data, isOwn, fromHistory) {
  maybeDateDivider(data.ts || Date.now());
  const box = $('messages');
  const ts = data.ts || Date.now(), user = data.user;
  const same = lastGroupEl && lastGroupUser === user && (ts - lastGroupTime) < GROUP_GAP;
  let group, stack;

  if (same) {
    group = lastGroupEl; stack = group.querySelector('.bubble-stack');
    const oldTs = stack.querySelector(':scope > .ts'); if (oldTs) oldTs.remove();
    group.classList.add('tight');
  } else {
    group = document.createElement('div');
    group.className = `msg-group ${isOwn ? 'own' : 'other'}`;
    if (!isOwn) {
      const av = document.createElement('div');
      av.className = 'avatar';
      if (data.avatar) {
        const img = document.createElement('img');
        img.className = 'avatar-img'; img.src = data.avatar; img.alt = '';
        av.appendChild(img);
      } else {
        av.style.background = userColor(user);
        av.textContent = user[0].toUpperCase();
      }
      group.appendChild(av);
    }
    stack = document.createElement('div'); stack.className = 'bubble-stack';
    if (!isOwn) {
      const nm = document.createElement('div'); nm.className = 'sender-name'; nm.textContent = user;
      stack.appendChild(nm);
    }
    group.appendChild(stack); box.appendChild(group);
  }

  const bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'bubble-wrap';
  bubbleWrap.dataset.msgId = data.id || '';
  if (selectMode && selectedIds.has(data.id)) bubbleWrap.classList.add('selected');

  const selectCircle = document.createElement('div');
  selectCircle.className = 'select-circle';

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (fromHistory ? '' : ' pop') + (data.deleted ? ' deleted' : '');
  bubble.dataset.id = data.id || '';
  bubble.dataset.user = user;
  if (data.text && myName && data.text.toLowerCase().includes('@'+myName.toLowerCase()) && !isOwn) bubble.classList.add('mentioned');

  if (data.deleted) {
    bubble.textContent = isOwn ? 'You unsent a message' : `${user} unsent a message`;
  } else {
    if (data.replyTo) {
      const q = document.createElement('div'); q.className = 'reply-quote';
      q.innerHTML = `<b>${escapeHtml(data.replyTo.user)}</b>: ${escapeHtml(data.replyTo.text)}`;
      bubble.appendChild(q);
    }
    if (data.text) {
      const textEl = document.createElement('div');
      textEl.className = 'bubble-text';
      textEl.innerHTML = renderRich(data.text);
      bubble.appendChild(textEl);
    }
    if (data.image) {
      const img = document.createElement('img');
      img.className = 'chat-img'; img.src = data.image;
      img.addEventListener('click', e => { e.stopPropagation(); openLightbox(data.image); });
      bubble.appendChild(img);
    }
  }
  bubble.addEventListener('dblclick', () => { if (!selectMode) openEmojiPicker(data.id, bubbleWrap); });
  attachTapToggle(bubble, group);

  if (isOwn) { bubbleWrap.appendChild(selectCircle); bubbleWrap.appendChild(buildBubbleActions(data, true)); }
  bubbleWrap.appendChild(bubble);
  if (!isOwn) { bubbleWrap.appendChild(buildBubbleActions(data, false)); bubbleWrap.appendChild(selectCircle); }
  stack.appendChild(bubbleWrap);

  if (!data.deleted) {
    const rxRow = renderReactions(data.id, data.reactions);
    stack.appendChild(rxRow);
  }

  if (!data.deleted) {
    const tsEl = document.createElement('div'); tsEl.className = 'ts';
    const tsText = document.createElement('span');
    tsText.textContent = fmtTime(ts) + (data.edited ? ' · edited' : '');
    tsEl.appendChild(tsText);
    if (isOwn) {
      const rc = document.createElement('span');
      rc.className = 'receipt'; rc.dataset.id = data.id || ''; rc.textContent = 'Read';
      if (data.seenBy && data.seenBy.length) rc.classList.add('seen');
      tsEl.appendChild(rc);
    }
    stack.appendChild(tsEl);
  }

  updatePositions(stack);
  lastGroupEl = group; lastGroupUser = user; lastGroupTime = ts;
}

function addMessage(data, isOwn, fromHistory) {
  removeTypingRow();
  buildMessageDOM(data, isOwn, fromHistory);
  const box = $('messages');
  const atBottom = isNearBottom();
  if (isOwn || atBottom || fromHistory) { box.scrollTop = box.scrollHeight; }
  else { bumpUnread(); }

  if (!isOwn && data.id && !data.deleted) socket.emit('seen', { id: data.id, roomId: data.roomId || currentRoomId });
  if (!isOwn && !fromHistory) {
    chime();
    if (notifOn && document.hidden) notify(data.user, data.text || 'Sent an image');
  }
}

/* Full rebuild — used after hide/restore/bulk-delete so the
   visible list always reflects allMessages minus hidden ids,
   in correct chronological order. */
function rerenderAll() {
  const box = $('messages');
  const wasAtBottom = isNearBottom();
  box.innerHTML = '';
  lastGroupEl = null; lastGroupUser = null; lastDateKey = '';
  const hidden = getHiddenIds();
  const sorted = [...allMessages.values()]
    .filter(m => (m.roomId || 'general') === currentRoomId)
    .sort((a, b) => a.ts - b.ts);
  if (hasMoreHistory) renderLoadMoreRow();
  sorted.forEach(m => {
    if (hidden.has(m.id)) return;
    buildMessageDOM(m, m.user === myName, true);
  });
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

function addSystem(text) {
  removeTypingRow();
  const box = $('messages');
  const div = document.createElement('div'); div.className = 'msg-system'; div.textContent = text;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  lastGroupEl = null; lastGroupUser = null;
}

/* ── typing ── */
function removeTypingRow() { const row = $('typing-row'); if (row) row.remove(); }
function showTyping(user) {
  removeTypingRow();
  const box = $('messages');
  const row = document.createElement('div'); row.id = 'typing-row'; row.className = 'typing-row';
  const av = document.createElement('div'); av.className = 'avatar';
  av.style.background = userColor(user); av.textContent = user[0].toUpperCase();
  const bub = document.createElement('div'); bub.className = 'typing-bubble';
  bub.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  row.appendChild(av); row.appendChild(bub);
  box.appendChild(row); box.scrollTop = box.scrollHeight;
}
let lastTypingEmit = 0;
$('msg-input').addEventListener('input', () => {
  if (!myName) return;
  const now = Date.now();
  if (now - lastTypingEmit > 1200) { socket.emit('typing', { roomId: currentRoomId }); lastTypingEmit = now; }
  autoResize();
});
function autoResize() {
  const el = $('msg-input');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

/* ── send ── */
let pendingImage = null;
function sendMsg() {
  const inp = $('msg-input'); const text = inp.value.trim();
  if (!text && !pendingImage) return;

  if (editTarget) {
    socket.emit('edit-msg', { id: editTarget.id, text, roomId: editTarget.roomId || currentRoomId });
    editTarget = null; $('edit-bar').classList.remove('open');
    inp.value = ''; autoResize();
    return;
  }

  socket.emit('message', { text, image: pendingImage, roomId: currentRoomId, replyTo: replyTarget ? { id: replyTarget.id, user: replyTarget.user, text: replyTarget.text } : null });
  inp.value = ''; autoResize();
  pendingImage = null; $('img-preview-bar').classList.remove('open'); $('img-preview-bar').innerHTML = '';
  replyTarget = null; $('reply-bar').classList.remove('open');

  sendTick();
  const btn = $('send-btn');
  const r = btn.getBoundingClientRect();
  ps.burst(r.left + r.width/2, r.top + r.height/2, 'send');
  ripple(r.left + r.width/2, r.top + r.height/2);
  btn.classList.remove('fire'); void btn.offsetWidth; btn.classList.add('fire');
}
$('send-btn').addEventListener('click', sendMsg);
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

/* ── image attach / paste / drag ── */
async function attachImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const dataUrl = await fileToResizedDataUrl(file, 1000, 0.78);
    pendingImage = dataUrl;
    const bar = $('img-preview-bar');
    bar.innerHTML = '';
    const img = document.createElement('img'); img.src = dataUrl;
    const rm = document.createElement('button'); rm.innerHTML = svgIcon('close');
    rm.addEventListener('click', () => { pendingImage = null; bar.classList.remove('open'); bar.innerHTML = ''; });
    bar.appendChild(img); bar.appendChild(rm);
    bar.classList.add('open');
  } catch {}
}
$('attach-btn').addEventListener('click', () => $('img-upload').click());
$('img-upload').addEventListener('change', e => attachImage(e.target.files[0]));
$('msg-input').addEventListener('paste', e => {
  const item = [...(e.clipboardData?.items||[])].find(i => i.type.startsWith('image/'));
  if (item) { attachImage(item.getAsFile()); e.preventDefault(); }
});
const chatCard = document.querySelector('#chat-screen .chat-card');
chatCard.addEventListener('dragover', e => e.preventDefault());
chatCard.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) attachImage(file);
});

function openLightbox(src) {
  const lb = document.createElement('div'); lb.className = 'lightbox';
  const frame = document.createElement('div'); frame.className = 'lightbox-frame';
  const img = document.createElement('img'); img.src = src;
  frame.appendChild(img);
  lb.appendChild(frame);
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

/* ── search ── */
$('search-btn').addEventListener('click', () => {
  const bar = $('search-bar');
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) { $('search-input').focus(); $('search-btn').classList.add('active'); }
  else { $('search-btn').classList.remove('active'); clearSearchHighlights(); }
});
function clearSearchHighlights() { document.querySelectorAll('.search-hit').forEach(b => b.classList.remove('search-hit')); }
$('search-input').addEventListener('input', e => {
  clearSearchHighlights();
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  let first = null;
  document.querySelectorAll('.bubble').forEach(b => {
    if (b.textContent.toLowerCase().includes(q)) { b.classList.add('search-hit'); if (!first) first = b; }
  });
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

/* ── scroll to bottom / unread ── */
function isNearBottom() {
  const box = $('messages');
  return box.scrollHeight - box.scrollTop - box.clientHeight < 120;
}
let unreadCount = 0;
function bumpUnread() {
  unreadCount++;
  const btn = $('scroll-bottom-btn');
  btn.classList.add('show');
  let dot = btn.querySelector('.unread-dot');
  if (!dot) { dot = document.createElement('span'); dot.className = 'unread-dot'; btn.appendChild(dot); }
  dot.textContent = unreadCount > 9 ? '9+' : unreadCount;
  updateTitleBadge();
}
function clearUnread() {
  unreadCount = 0;
  const btn = $('scroll-bottom-btn');
  btn.classList.remove('show');
  const dot = btn.querySelector('.unread-dot'); if (dot) dot.remove();
  updateTitleBadge();
}
function updateTitleBadge() {
  document.title = unreadCount > 0 ? `(${unreadCount}) Glass Chat` : 'Glass Chat';
}
$('messages').addEventListener('scroll', () => { if (isNearBottom()) clearUnread(); });
$('scroll-bottom-btn').addEventListener('click', () => {
  $('messages').scrollTop = $('messages').scrollHeight;
  clearUnread();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) clearUnread(); });

/* ── notifications ── */
function notify(user, text) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(`${user} — Glass Chat`, { body: text.slice(0,120), icon: 'favicon-32.png' }); } catch {}
}
$('notif-btn').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    notifOn = perm === 'granted';
  } else {
    notifOn = !notifOn;
  }
  localStorage.setItem('gc_notif', notifOn ? 'on' : 'off');
  $('notif-btn').classList.toggle('active', notifOn);
});
if (notifOn) $('notif-btn').classList.add('active');

$('sound-btn').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('gc_sound', soundOn ? 'on' : 'off');
  $('sound-btn').classList.toggle('active', soundOn);
  if (soundOn) chime();
});
if (soundOn) $('sound-btn').classList.add('active');

/* ── load more (pagination) ── */
let oldestTs = null, hasMoreHistory = false;
function renderLoadMoreRow() {
  const existing = document.getElementById('load-more-row');
  if (existing) existing.remove();
  if (!hasMoreHistory) return;
  const row = document.createElement('div'); row.id = 'load-more-row'; row.className = 'load-more-row';
  const btn = document.createElement('button'); btn.className = 'load-more-btn'; btn.textContent = 'Load earlier messages';
  btn.addEventListener('click', () => socket.emit('load-more', { before: oldestTs, roomId: currentRoomId }));
  row.appendChild(btn);
  $('messages').prepend(row);
}

/* ── reconnect banner ── */
function showReconnectBanner() {
  let b = document.getElementById('reconnect-banner');
  if (!b) {
    b = document.createElement('div'); b.id = 'reconnect-banner';
    b.textContent = 'Connection lost — reconnecting…';
    document.querySelector('#chat-screen .chat-card').prepend(b);
  }
}
function hideReconnectBanner() { const b = document.getElementById('reconnect-banner'); if (b) b.remove(); }

/* ── socket events ── */
socket.on('history', msgs => {
  $('messages').innerHTML = '';
  lastGroupEl = null; lastGroupUser = null; lastDateKey = '';
  const hidden = getHiddenIds();
  msgs.forEach(m => {
    allMessages.set(m.id, m);
    if (!hidden.has(m.id)) addMessage(m, m.user === myName, true);
  });
  oldestTs = msgs.length ? msgs[0].ts : null;
  $('messages').scrollTop = $('messages').scrollHeight;
});
socket.on('history-has-more', has => { hasMoreHistory = has; renderLoadMoreRow(); });
socket.on('more-history', ({ msgs, hasMore }) => {
  const box = $('messages');
  const prevHeight = box.scrollHeight;
  lastGroupEl = null; lastGroupUser = null;
  const hidden = getHiddenIds();
  msgs.forEach(m => {
    allMessages.set(m.id, m);
    if (!hidden.has(m.id)) addMessage(m, m.user === myName, true);
  });
  hasMoreHistory = hasMore;
  oldestTs = msgs.length ? msgs[0].ts : oldestTs;
  renderLoadMoreRow();
  box.scrollTop = box.scrollHeight - prevHeight;
});

socket.on('message', data => {
  allMessages.set(data.id, data);
  if ((data.roomId || 'general') !== currentRoomId) return; // cached for later, not for this room's view
  if (getHiddenIds().has(data.id)) return;
  const isOwn = data.socketId === socket.id;
  addMessage(data, isOwn, false);
  if (!isOwn) {
    const r = $('messages').getBoundingClientRect();
    ps.burst(r.left + 60, r.bottom - 75, 'recv');
  }
});
socket.on('msg-edited', ({ id, text }) => {
  const cached = allMessages.get(id);
  if (cached) { cached.text = text; cached.edited = true; }
  const bubble = document.querySelector(`.bubble[data-id="${id}"]`);
  if (!bubble) return;
  const firstDiv = bubble.querySelector(':scope > div');
  if (firstDiv && !firstDiv.classList.contains('reply-quote')) firstDiv.innerHTML = renderRich(text);
  else bubble.insertAdjacentHTML('beforeend', renderRich(text));
  const ts = bubble.closest('.bubble-stack')?.querySelector('.ts span:first-child');
  if (ts && !ts.textContent.includes('edited')) ts.textContent += ' · edited';
});
socket.on('msg-deleted', ({ id }) => {
  const cached = allMessages.get(id);
  if (cached) { cached.deleted = true; cached.text = ''; cached.image = null; }
  const bubble = document.querySelector(`.bubble[data-id="${id}"]`);
  if (!bubble) return;
  const isOwn = bubble.closest('.msg-group')?.classList.contains('own');
  const user = bubble.dataset.user || '';
  bubble.classList.add('deleted');
  bubble.innerHTML = isOwn ? 'You unsent a message' : `${escapeHtml(user)} unsent a message`;
  const wrap = bubble.closest('.bubble-wrap');
  const stack = wrap?.parentElement;
  wrap?.querySelector('.bubble-actions')?.remove();
  stack?.querySelector(`.reactions-row[data-msg-id="${id}"]`)?.remove();
  if (stack) {
    const allWraps = [...stack.querySelectorAll('.bubble-wrap')];
    if (allWraps[allWraps.length - 1] === wrap) stack.querySelector(':scope > .ts')?.remove();
  }
});
socket.on('reaction-update', ({ msgId, reactions }) => {
  const cached = allMessages.get(msgId);
  if (cached) cached.reactions = reactions;
  const row = document.querySelector(`.reactions-row[data-msg-id="${msgId}"]`);
  if (!row) return;
  const fresh = renderReactions(msgId, reactions);
  row.replaceWith(fresh);
});
socket.on('seen-update', ({ id }) => {
  const rc = document.querySelector(`.receipt[data-id="${id}"]`);
  if (rc && !rc.classList.contains('seen')) rc.classList.add('seen');
});
socket.on('link-preview', ({ msgId, preview }) => {
  const bubble = document.querySelector(`.bubble[data-id="${msgId}"]`);
  if (!bubble || bubble.querySelector('.link-preview')) return;
  const a = document.createElement('a');
  a.className = 'link-preview'; a.href = preview.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.innerHTML = `${preview.image ? `<img src="${preview.image}" loading="lazy"/>` : ''}
    <div class="lp-body"><div class="lp-title">${escapeHtml(preview.title||'')}</div><div class="lp-desc">${escapeHtml(preview.desc||'')}</div></div>`;
  bubble.appendChild(a);
});
socket.on('typing', ({ user, roomId } = {}) => {
  if (typeof user !== 'string' || user === myName) return;
  if ((roomId || 'general') !== currentRoomId) return;
  showTyping(user);
  clearTimeout(typingTimers[user]);
  typingTimers[user] = setTimeout(removeTypingRow, 2200);
});
socket.on('system', text => { if (currentRoomId === 'general') addSystem(text); });
socket.on('user-count', n => { $('online-count').textContent = `${n} online`; });

socket.on('disconnect', () => { if (hasJoinedOnce) showReconnectBanner(); });
socket.on('connect', () => {
  if (hasJoinedOnce && myName) {
    socket.emit('join', { name: myName, clientId, avatar: myAvatar });
    if (currentRoomId !== 'general') socket.emit('switch-room', { roomId: currentRoomId });
  }
});

/* ════════════════════════════════════════════════
   ROOMS + NOTIFICATIONS SIDEBAR
════════════════════════════════════════════════ */
function timeAgoShort(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function updateCurrentRoomLabel() {
  $('current-room-icon').textContent = currentRoomInfo.icon || '💬';
  $('current-room-name').textContent = currentRoomInfo.name || 'General';
  $('current-room-label').title = currentRoomInfo.isAdmin ? `${currentRoomInfo.name} — you're the admin` : currentRoomInfo.name;
}

function renderRoomList() {
  const list = $('room-list');
  list.innerHTML = '';
  if (!myRooms.length) {
    list.innerHTML = '<div class="room-list-empty">No rooms yet</div>';
    return;
  }
  myRooms.forEach(room => {
    const row = document.createElement('div');
    row.className = 'room-row' + (room.id === currentRoomId ? ' active' : '');
    row.dataset.roomId = room.id;

    const icon = document.createElement('span');
    icon.className = 'room-row-icon';
    icon.textContent = room.icon || '💬';
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'room-row-name';
    name.textContent = room.name;
    row.appendChild(name);

    if (room.isAdmin || room.isCoAdmin) {
      const badge = document.createElement('span');
      badge.className = 'room-row-admin-badge';
      badge.textContent = room.isAdmin ? 'ADMIN' : 'CO-ADMIN';
      row.appendChild(badge);

      const membersBtn = document.createElement('button');
      membersBtn.className = 'room-row-icon-edit';
      membersBtn.title = 'Members';
      membersBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      membersBtn.addEventListener('click', e => { e.stopPropagation(); openMemberPopup(room, membersBtn); });
      row.appendChild(membersBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'room-row-icon-edit';
      editBtn.title = 'Change room icon';
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      editBtn.addEventListener('click', e => { e.stopPropagation(); openIconPicker(room.id, editBtn); });
      row.appendChild(editBtn);
    }

    row.addEventListener('click', () => switchToRoom(room.id));
    list.appendChild(row);
  });
}

function openIconPicker(roomId, anchorEl) {
  document.querySelectorAll('.icon-picker, .member-popup').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'icon-picker';
  ROOM_ICON_SET.forEach(icon => {
    const b = document.createElement('button');
    b.textContent = icon;
    b.addEventListener('click', () => { socket.emit('set-room-icon', { roomId, icon }); picker.remove(); });
    picker.appendChild(b);
  });
  document.body.appendChild(picker);
  const r = anchorEl.getBoundingClientRect();
  picker.style.top = (r.bottom + 6) + 'px';
  picker.style.left = Math.min(r.left, window.innerWidth - 160) + 'px';
  const close = ev => { if (!picker.contains(ev.target) && ev.target !== anchorEl) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

/* Member roster for a room you administer/co-admin — lets you promote
   an existing member to co-admin (a request they still have to accept). */
function openMemberPopup(room, anchorEl) {
  document.querySelectorAll('.icon-picker, .member-popup').forEach(p => p.remove());
  const pop = document.createElement('div');
  pop.className = 'member-popup';
  const title = document.createElement('div');
  title.className = 'member-popup-title';
  title.textContent = `${room.name} members`;
  pop.appendChild(title);

  const members = room.members || [];
  if (!members.length) {
    const empty = document.createElement('div');
    empty.className = 'member-popup-empty'; empty.textContent = 'No members yet';
    pop.appendChild(empty);
  }
  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-popup-row';
    const name = document.createElement('span');
    name.className = 'member-popup-name';
    name.textContent = m.name + (m.role !== 'member' ? ` · ${m.role}` : '');
    row.appendChild(name);
    if (m.role === 'member' && m.name.toLowerCase() !== myName.toLowerCase()) {
      const btn = document.createElement('button');
      btn.className = 'member-popup-promote';
      btn.textContent = 'Make co-admin';
      btn.addEventListener('click', () => {
        socket.emit('invite-to-room', { roomId: room.id, name: m.name, asCoAdmin: true });
        btn.textContent = 'Requested'; btn.disabled = true;
      });
      row.appendChild(btn);
    }
    pop.appendChild(row);
  });

  document.body.appendChild(pop);
  const r = anchorEl.getBoundingClientRect();
  pop.style.top = (r.bottom + 6) + 'px';
  pop.style.left = Math.min(r.left, window.innerWidth - 230) + 'px';
  const close = ev => { if (!pop.contains(ev.target) && ev.target !== anchorEl) { pop.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function switchToRoom(roomId) {
  if (roomId === currentRoomId) return;
  socket.emit('switch-room', { roomId });
  collapseRailSections();
}

function renderNotiList() {
  const list = $('noti-list');
  list.innerHTML = '';
  if (!notificationsList.length) {
    list.innerHTML = '<div class="noti-empty">No notifications</div>';
    updateNotiBadge();
    return;
  }
  notificationsList.forEach(n => {
    const row = document.createElement('div');
    row.className = 'noti-row' + (n.read ? '' : ' unread');

    const text = document.createElement('div');
    text.className = 'noti-row-text';
    if (n.type === 'join-request') {
      text.innerHTML = `<b>${escapeHtml(n.fromName)}</b> wants to join <b>${escapeHtml(n.roomName)}</b> ${escapeHtml(n.roomIcon||'')}`;
    } else if (n.type === 'join-approved') {
      text.innerHTML = `You were approved to join <b>${escapeHtml(n.roomName)}</b> ${escapeHtml(n.roomIcon||'')}`;
    } else if (n.type === 'join-denied') {
      text.innerHTML = `Your request to join <b>${escapeHtml(n.roomName)}</b> was declined`;
    } else if (n.type === 'room-invite') {
      text.innerHTML = `<b>${escapeHtml(n.fromName)}</b> invited you to join <b>${escapeHtml(n.roomName)}</b> ${escapeHtml(n.roomIcon||'')}`;
    } else if (n.type === 'coadmin-invite') {
      text.innerHTML = `<b>${escapeHtml(n.fromName)}</b> wants to make you co-admin of <b>${escapeHtml(n.roomName)}</b> ${escapeHtml(n.roomIcon||'')}`;
    } else if (n.type === 'invite-accepted') {
      text.innerHTML = `<b>${escapeHtml(n.fromName)}</b> accepted your invite to <b>${escapeHtml(n.roomName)}</b>`;
    } else {
      text.textContent = n.text || '';
    }
    row.appendChild(text);

    const time = document.createElement('div');
    time.className = 'noti-row-time';
    time.textContent = timeAgoShort(n.ts);
    row.appendChild(time);

    const actionable = n.type === 'join-request' || n.type === 'room-invite' || n.type === 'coadmin-invite';
    if (actionable) {
      const actions = document.createElement('div');
      actions.className = 'noti-row-actions';
      const accept = document.createElement('button');
      accept.className = 'noti-accept-btn'; accept.textContent = 'Accept';
      accept.addEventListener('click', () => {
        if (n.type === 'join-request') {
          socket.emit('respond-join', { roomId: n.roomId, requesterClientId: n.fromClientId, approve: true });
        } else {
          socket.emit('respond-invite', { roomId: n.roomId, approve: true, coAdmin: n.type === 'coadmin-invite' });
        }
        socket.emit('mark-notification-read', { id: n.id });
        n.read = true; renderNotiList();
      });
      const deny = document.createElement('button');
      deny.className = 'noti-deny-btn'; deny.textContent = 'Deny';
      deny.addEventListener('click', () => {
        if (n.type === 'join-request') {
          socket.emit('respond-join', { roomId: n.roomId, requesterClientId: n.fromClientId, approve: false });
        } else {
          socket.emit('respond-invite', { roomId: n.roomId, approve: false, coAdmin: n.type === 'coadmin-invite' });
        }
        socket.emit('mark-notification-read', { id: n.id });
        n.read = true; renderNotiList();
      });
      actions.appendChild(accept); actions.appendChild(deny);
      row.appendChild(actions);
    } else if (!n.read) {
      row.addEventListener('click', () => { socket.emit('mark-notification-read', { id: n.id }); n.read = true; renderNotiList(); });
    }

    list.appendChild(row);
  });
  updateNotiBadge();
}

function updateNotiBadge() {
  const hasUnread = notificationsList.some(n => !n.read);
  $('rail-noti-badge').hidden = !hasUnread;
}

let roomSearchTimer = null;
async function runRoomSearch(q) {
  try {
    const [roomsRes, peopleRes] = await Promise.all([
      fetch('/api/rooms/search?q=' + encodeURIComponent(q)),
      fetch('/api/people/search?q=' + encodeURIComponent(q)),
    ]);
    const rooms = await roomsRes.json();
    const people = await peopleRes.json();
    renderRoomSearchResults(rooms, people);
  } catch { renderRoomSearchResults([], []); }
}
function renderRoomSearchResults(rooms, people) {
  const box = $('room-search-results');
  box.innerHTML = '';
  const myIds = new Set(myRooms.map(r => r.id));
  const roomResults = (rooms || []).filter(r => !myIds.has(r.id));
  const peopleResults = (people || []).filter(p => p.name.toLowerCase() !== myName.toLowerCase());
  const canInvite = !!currentRoomInfo.isPrivileged;

  if (!roomResults.length && !peopleResults.length) {
    box.innerHTML = '<div class="room-search-empty">No matches found</div>';
    return;
  }

  if (roomResults.length) {
    const label = document.createElement('div');
    label.className = 'search-group-label'; label.textContent = 'Rooms';
    box.appendChild(label);
    roomResults.forEach(r => {
      const row = document.createElement('div');
      row.className = 'room-search-row';

      const icon = document.createElement('span');
      icon.className = 'room-search-row-icon'; icon.textContent = r.icon || '💬';
      row.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'room-search-row-info';
      const name = document.createElement('div');
      name.className = 'room-search-row-name'; name.textContent = r.name;
      const meta = document.createElement('div');
      meta.className = 'room-search-row-meta'; meta.textContent = `${r.memberCount} member${r.memberCount===1?'':'s'}`;
      info.appendChild(name); info.appendChild(meta);
      row.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'room-search-join-btn'; btn.textContent = 'Ask to join';
      btn.addEventListener('click', () => {
        socket.emit('request-join', { roomId: r.id });
        btn.textContent = 'Requested'; btn.disabled = true;
      });
      row.appendChild(btn);

      box.appendChild(row);
    });
  }

  if (peopleResults.length) {
    const label = document.createElement('div');
    label.className = 'search-group-label'; label.textContent = 'People';
    box.appendChild(label);
    peopleResults.forEach(p => {
      const row = document.createElement('div');
      row.className = 'room-search-row';

      const icon = document.createElement('span');
      icon.className = 'room-search-row-icon'; icon.textContent = '👤';
      row.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'room-search-row-info';
      const name = document.createElement('div');
      name.className = 'room-search-row-name'; name.textContent = p.name;
      info.appendChild(name);
      row.appendChild(info);

      if (canInvite) {
        const inviteBtn = document.createElement('button');
        inviteBtn.className = 'room-search-join-btn'; inviteBtn.textContent = 'Invite';
        inviteBtn.title = `Invite to ${currentRoomInfo.name}`;
        inviteBtn.addEventListener('click', () => {
          socket.emit('invite-to-room', { roomId: currentRoomId, name: p.name, asCoAdmin: false });
          inviteBtn.textContent = 'Invited'; inviteBtn.disabled = true;
        });
        row.appendChild(inviteBtn);

        const coBtn = document.createElement('button');
        coBtn.className = 'room-search-join-btn co'; coBtn.textContent = '+Co-admin';
        coBtn.title = `Invite as co-admin of ${currentRoomInfo.name}`;
        coBtn.addEventListener('click', () => {
          socket.emit('invite-to-room', { roomId: currentRoomId, name: p.name, asCoAdmin: true });
          coBtn.textContent = 'Requested'; coBtn.disabled = true;
        });
        row.appendChild(coBtn);
      }

      box.appendChild(row);
    });
  }
}

socket.on('my-rooms', list => {
  myRooms = list;
  const mine = myRooms.find(r => r.id === currentRoomId);
  if (mine) currentRoomInfo = mine;
  renderRoomList();
  updateCurrentRoomLabel();
});
socket.on('notifications', list => { notificationsList = list; renderNotiList(); });
socket.on('notification', n => { notificationsList.unshift(n); renderNotiList(); showToast(
  n.type === 'join-request' ? `${n.fromName} wants to join ${n.roomName}` :
  n.type === 'join-approved' ? `You're in — ${n.roomName}` :
  n.type === 'join-denied' ? `Request to join ${n.roomName} was declined` : 'New notification'
); });
socket.on('room-created', room => {
  showToast(`Room "${room.name}" created — you're the admin`);
  switchToRoom(room.id);
});
socket.on('room-updated', room => {
  const idx = myRooms.findIndex(r => r.id === room.id);
  if (idx !== -1) myRooms[idx] = room; else myRooms.push(room);
  if (room.id === currentRoomId) currentRoomInfo = room;
  renderRoomList();
  updateCurrentRoomLabel();
});
socket.on('room-history', ({ roomId, msgs, hasMore, room }) => {
  currentRoomId = roomId;
  currentRoomInfo = room;
  $('messages').innerHTML = '';
  lastGroupEl = null; lastGroupUser = null; lastDateKey = '';
  const hidden = getHiddenIds();
  msgs.forEach(m => {
    allMessages.set(m.id, m);
    if (!hidden.has(m.id)) addMessage(m, m.user === myName, true);
  });
  oldestTs = msgs.length ? msgs[0].ts : null;
  hasMoreHistory = hasMore;
  renderLoadMoreRow();
  $('messages').scrollTop = $('messages').scrollHeight;
  updateCurrentRoomLabel();
  renderRoomList();
  clearUnread();
});
socket.on('info-msg', msg => showToast(msg));

/* ── sidebar rail interactions ── */
function collapseRailSections() {
  document.querySelectorAll('.rail-section.section-expanded').forEach(s => s.classList.remove('section-expanded'));
  $('side-rail').classList.remove('pinned');
}
function toggleRailSection(name) {
  const section = document.querySelector(`.rail-section[data-section="${name}"]`);
  const isOpen = section.classList.contains('section-expanded');
  collapseRailSections();
  if (!isOpen) {
    section.classList.add('section-expanded');
    $('side-rail').classList.add('pinned');
  }
}
$('rail-notis-btn').addEventListener('click', () => toggleRailSection('notis'));
$('rail-rooms-btn').addEventListener('click', () => toggleRailSection('rooms'));
$('rail-search-btn').addEventListener('click', () => { toggleRailSection('roomsearch'); runRoomSearch(''); });

$('create-room-btn').addEventListener('click', () => {
  $('create-room-form').classList.toggle('hidden');
  if (!$('create-room-form').classList.contains('hidden')) $('create-room-input').focus();
});
function submitCreateRoom() {
  const val = $('create-room-input').value.trim();
  if (!val) return;
  socket.emit('create-room', { name: val });
  $('create-room-input').value = '';
  $('create-room-form').classList.add('hidden');
}
$('create-room-submit').addEventListener('click', submitCreateRoom);
$('create-room-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitCreateRoom(); });

$('room-search-input').addEventListener('input', e => {
  clearTimeout(roomSearchTimer);
  const q = e.target.value;
  roomSearchTimer = setTimeout(() => runRoomSearch(q), 250);
});

document.addEventListener('click', e => {
  if (!$('side-rail').contains(e.target)) collapseRailSections();
});

/* ── mobile rail toggle ── */
function openMobileRail() {
  $('side-rail').classList.add('mobile-open');
  $('rail-backdrop').classList.add('show');
}
function closeMobileRail() {
  $('side-rail').classList.remove('mobile-open');
  $('rail-backdrop').classList.remove('show');
  collapseRailSections();
}
$('rail-toggle-btn').addEventListener('click', () => {
  $('side-rail').classList.contains('mobile-open') ? closeMobileRail() : openMobileRail();
});
$('rail-backdrop').addEventListener('click', closeMobileRail);
