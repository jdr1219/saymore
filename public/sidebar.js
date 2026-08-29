/* ════════ Glass Chat — shared sidebar (rail) ════════
   Loaded on index.html after app.js, and reuses its $, escapeHtml,
   and identity. Games now lives inside index.html too (a toggled
   view, not a separate page), so there's only ever one socket and
   one identity to worry about. */

if (typeof $ === 'undefined') {
  window.$ = id => document.getElementById(id);
}
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
if (typeof socket === 'undefined') {
  window.socket = io();
}
function sbMyName() {
  return (typeof myName !== 'undefined' && myName) || '';
}

/* Searchable emoji set for room icons — not exhaustive, but covers
   the common categories people actually reach for. */
const EMOJI_LIST = [["😀","grinning happy smile"],["😂","laugh joy tears funny"],["😅","sweat laugh relief"],["😊","smile blush happy"],["😍","love heart eyes crush"],["🥰","love hearts adore"],["😘","kiss love"],["😜","wink silly tongue"],["🤔","think hmm thinking"],["😎","cool sunglasses"],["🥳","party celebrate birthday"],["😭","cry sad tears"],["😡","angry mad rage"],["😱","scream shock scared"],["🥺","pleading puppy eyes sad"],["🤯","mind blown shocked"],["😴","sleep tired zzz"],["🤢","sick nauseous gross"],["🤩","star struck excited"],["😇","angel innocent halo"],["🙃","upside down silly"],["😏","smirk sly"],["🤗","hug embrace"],["🤫","shh quiet secret"],["👍","thumbs up good yes"],["👎","thumbs down bad no"],["👏","clap applause"],["🙌","hands up celebrate"],["🙏","pray please thanks"],["💪","muscle strong flex"],["👋","wave hello hi bye"],["✌️","peace victory"],["🤝","handshake deal agree"],["👀","eyes look watch"],["🧠","brain smart think"],["💀","skull dead"],["👻","ghost spooky"],["🤖","robot bot ai"],["👽","alien ufo"],["🐱","cat kitty"],["🐶","dog puppy"],["🦊","fox"],["🐻","bear"],["🐼","panda"],["🐨","koala"],["🦁","lion"],["🐯","tiger"],["🐸","frog"],["🐵","monkey"],["🦄","unicorn"],["🐔","chicken"],["🐧","penguin"],["🦉","owl"],["🐢","turtle"],["🐍","snake"],["🐙","octopus"],["🐬","dolphin"],["🐳","whale"],["🦋","butterfly"],["🐝","bee"],["🌸","flower blossom spring"],["🌻","sunflower"],["🌹","rose flower"],["🌵","cactus"],["🌲","tree pine forest"],["🍀","clover luck"],["🌈","rainbow pride"],["☀️","sun sunny"],["🌙","moon night"],["⭐","star"],["✨","sparkle magic"],["🔥","fire hot lit"],["💧","water drop"],["❄️","snow cold winter"],["⚡","lightning bolt zap"],["🌊","wave ocean sea"],["🍕","pizza food"],["🍔","burger food"],["🌮","taco food"],["🍟","fries food"],["🍩","donut sweet"],["🍰","cake dessert"],["🍦","ice cream"],["🍿","popcorn movie"],["☕","coffee drink"],["🍺","beer drink"],["🍷","wine drink"],["🧋","boba tea drink"],["🍎","apple fruit"],["🍌","banana fruit"],["🍇","grapes fruit"],["🍓","strawberry fruit"],["⚽","soccer football sport"],["🏀","basketball sport"],["🏈","football sport"],["⚾","baseball sport"],["🎾","tennis sport"],["🏐","volleyball sport"],["🎮","game controller gaming"],["🕹️","joystick arcade gaming"],["🎲","dice game board"],["♟️","chess game strategy"],["🎯","dart target goal"],["🎳","bowling game"],["🎸","guitar music"],["🎧","headphones music"],["🎤","mic karaoke music"],["🎬","movie film clapper"],["📚","books study read"],["✏️","pencil write"],["📝","note write memo"],["💡","idea lightbulb"],["🔬","science lab microscope"],["🧪","test tube science chemistry"],["🖥️","computer desktop tech"],["💻","laptop computer tech"],["📱","phone mobile"],["⌚","watch time clock"],["🔒","lock secure private"],["🔑","key unlock"],["💰","money cash rich"],["💎","gem diamond jewel"],["🏆","trophy win champion"],["🎁","gift present"],["🎉","party celebrate confetti"],["🎈","balloon party"],["🚀","rocket launch space"],["🛸","ufo alien spaceship"],["🌍","earth world globe"],["🗺️","map travel"],["✈️","plane travel flight"],["🚗","car drive"],["🏠","house home"],["🏰","castle fantasy"],["⛺","tent camp"],["🏖️","beach vacation"],["💬","chat speech bubble talk"],["🫧","bubble bubbles"],["❤️","heart love red"],["💙","heart love blue"],["💚","heart love green"],["💛","heart love yellow"],["💜","heart love purple"],["🖤","heart love black"],["🤍","heart love white"],["🧡","heart love orange"],["💯","hundred perfect"],["✅","check yes done"],["❌","cross no wrong"],["❓","question mark"],["❗","exclamation mark"],["⚠️","warning caution"]];

/* ── state ── */
let currentRoomId = 'general';
let currentRoomInfo = { id: 'general', name: 'General', icon: '💬', isDefault: true, isAdmin: false, isCoAdmin: false, isPrivileged: false, members: [], bans: [] };
let myRooms = [];
let notificationsList = [];

/* ── recent-rooms tracking (client-side, per browser) ── */
function touchRoomRecency(roomId) {
  try {
    const map = JSON.parse(localStorage.getItem('gc_room_recency') || '{}');
    map[roomId] = Date.now();
    localStorage.setItem('gc_room_recency', JSON.stringify(map));
  } catch {}
}
function getRoomRecency(roomId) {
  try { return JSON.parse(localStorage.getItem('gc_room_recency') || '{}')[roomId] || 0; }
  catch { return 0; }
}

function timeAgoShort(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function updateCurrentRoomLabel() {
  const iconEl = $('current-room-icon'), nameEl = $('current-room-name'), labelEl = $('current-room-label');
  if (!labelEl) return; // no chat header currently mounted (shouldn't happen now that games is a view, not a page)
  iconEl.textContent = currentRoomInfo.icon || '💬';
  nameEl.textContent = currentRoomInfo.name || 'General';
  labelEl.title = currentRoomInfo.isPrivileged ? `${currentRoomInfo.name} — room settings` : currentRoomInfo.name;
  labelEl.classList.toggle('is-privileged', !!currentRoomInfo.isPrivileged);
}

/* ── rooms list (top 5 most recently used) ── */
function renderRoomList() {
  const list = $('room-list');
  list.innerHTML = '';
  if (!myRooms.length) {
    list.innerHTML = '<div class="room-list-empty">No rooms yet</div>';
    return;
  }
  const sorted = [...myRooms].sort((a, b) => getRoomRecency(b.id) - getRoomRecency(a.id));
  const top = sorted.slice(0, 5);
  top.forEach(room => {
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
    }

    row.addEventListener('click', () => switchToRoom(room.id));
    list.appendChild(row);
  });
  if (sorted.length > 5) {
    const more = document.createElement('div');
    more.className = 'room-list-more';
    more.textContent = `+${sorted.length - 5} more room${sorted.length - 5 === 1 ? '' : 's'}`;
    list.appendChild(more);
  }
}

/* ── searchable emoji picker (room icons) ── */
function openIconPicker(roomId, anchorEl) {
  document.querySelectorAll('.icon-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'icon-picker';

  const search = document.createElement('input');
  search.className = 'icon-picker-search';
  search.placeholder = 'Search emoji...';
  search.autocomplete = 'off';
  picker.appendChild(search);

  const grid = document.createElement('div');
  grid.className = 'icon-picker-grid';
  picker.appendChild(grid);

  function renderGrid(list) {
    grid.innerHTML = '';
    list.slice(0, 150).forEach(([emoji]) => {
      const b = document.createElement('button');
      b.textContent = emoji; b.title = emoji;
      b.addEventListener('click', () => { socket.emit('set-room-icon', { roomId, icon: emoji }); picker.remove(); });
      grid.appendChild(b);
    });
    if (!list.length) grid.innerHTML = '<div class="icon-picker-empty">No matches</div>';
  }
  renderGrid(EMOJI_LIST);
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    renderGrid(!q ? EMOJI_LIST : EMOJI_LIST.filter(([, kw]) => kw.includes(q)));
  });

  document.body.appendChild(picker);
  search.focus();
  const r = anchorEl.getBoundingClientRect();
  picker.style.top = Math.min(r.bottom + 6, window.innerHeight - 260) + 'px';
  picker.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
  const close = ev => { if (!picker.contains(ev.target) && ev.target !== anchorEl) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

/* ── room settings (admin/co-admin): icon, promote, kick, ban ──
   A light anchored panel (matching the emoji picker's style) rather
   than a heavy full-screen dark modal. */
const BAN_DURATIONS = [['1h','1 hour'],['1d','1 day'],['1w','1 week'],['30d','30 days']];
function openRoomSettings(anchorEl) {
  if (!currentRoomInfo.isPrivileged) return;
  document.querySelectorAll('.room-settings-panel').forEach(m => m.remove());

  const panel = document.createElement('div');
  panel.className = 'glass room-settings-panel';

  const header = document.createElement('div');
  header.className = 'rs-header';
  const iconBtn = document.createElement('button');
  iconBtn.className = 'rs-icon-btn';
  iconBtn.textContent = currentRoomInfo.icon || '💬';
  iconBtn.title = 'Change room icon';
  iconBtn.addEventListener('click', e => { e.stopPropagation(); openIconPicker(currentRoomId, iconBtn); });
  const title = document.createElement('div');
  title.className = 'rs-title';
  title.textContent = `${currentRoomInfo.name} settings`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'rs-close';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListener('click', () => panel.remove());
  header.appendChild(iconBtn); header.appendChild(title); header.appendChild(closeBtn);
  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'rs-members-list';
  const members = currentRoomInfo.members || [];
  if (!members.length) {
    list.innerHTML = '<div class="rs-empty">No members yet</div>';
  }
  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'rs-member-row';
    const name = document.createElement('span');
    name.className = 'rs-member-name';
    name.textContent = m.name + (m.role !== 'member' ? ` · ${m.role}` : '');
    row.appendChild(name);

    if (m.role !== 'admin' && m.name.toLowerCase() !== sbMyName().toLowerCase()) {
      const actions = document.createElement('div');
      actions.className = 'rs-member-actions';

      if (m.role === 'member') {
        const promoteBtn = document.createElement('button');
        promoteBtn.className = 'rs-action-btn rs-promote'; promoteBtn.textContent = 'Promote';
        promoteBtn.addEventListener('click', () => {
          socket.emit('invite-to-room', { roomId: currentRoomId, name: m.name, asCoAdmin: true });
          promoteBtn.textContent = 'Requested'; promoteBtn.disabled = true;
        });
        actions.appendChild(promoteBtn);
      }

      const kickBtn = document.createElement('button');
      kickBtn.className = 'rs-action-btn rs-kick'; kickBtn.textContent = 'Kick';
      kickBtn.addEventListener('click', () => {
        socket.emit('kick-member', { roomId: currentRoomId, clientId: m.clientId });
        row.remove();
      });
      actions.appendChild(kickBtn);

      const banSelect = document.createElement('select');
      banSelect.className = 'rs-ban-duration';
      BAN_DURATIONS.forEach(([v, l]) => {
        const opt = document.createElement('option'); opt.value = v; opt.textContent = l;
        banSelect.appendChild(opt);
      });
      actions.appendChild(banSelect);

      const banBtn = document.createElement('button');
      banBtn.className = 'rs-action-btn rs-ban'; banBtn.textContent = 'Ban';
      banBtn.addEventListener('click', () => {
        socket.emit('ban-member', { roomId: currentRoomId, clientId: m.clientId, duration: banSelect.value });
        row.remove();
      });
      actions.appendChild(banBtn);

      row.appendChild(actions);
    }
    list.appendChild(row);
  });
  panel.appendChild(list);

  const bans = currentRoomInfo.bans || [];
  if (bans.length) {
    const bansLabel = document.createElement('div');
    bansLabel.className = 'rs-section-label'; bansLabel.textContent = 'Active bans';
    panel.appendChild(bansLabel);
    bans.forEach(b => {
      const row = document.createElement('div');
      row.className = 'rs-ban-row';
      row.textContent = `${b.name} — until ${new Date(b.until).toLocaleString()}`;
      panel.appendChild(row);
    });
  }

  document.body.appendChild(panel);
  const r = anchorEl.getBoundingClientRect();
  panel.style.top = Math.min(r.bottom + 8, window.innerHeight - 420) + 'px';
  panel.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 300)) + 'px';
  const close = ev => { if (!panel.contains(ev.target) && ev.target !== anchorEl && !anchorEl.contains(ev.target)) { panel.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}
(function wireRoomLabel() {
  const labelEl = document.getElementById('current-room-label');
  if (labelEl) labelEl.addEventListener('click', () => { if (currentRoomInfo.isPrivileged) openRoomSettings(labelEl); });
})();

/* Glass Games is now a view inside this same page, so switching a
   room always happens live via the socket — no more cross-page nav. */
function switchToRoom(roomId) {
  if (roomId === currentRoomId) return;
  socket.emit('switch-room', { roomId });
  collapseRailSections();
  if (typeof showChatView === 'function') showChatView();
}

/* ── notifications ── */
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
    } else if (n.type === 'kicked') {
      text.innerHTML = `You were removed from <b>${escapeHtml(n.roomName)}</b>`;
    } else if (n.type === 'banned') {
      text.innerHTML = `You were banned from <b>${escapeHtml(n.roomName)}</b> until ${new Date(n.until).toLocaleString()}`;
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
      const respond = approve => {
        if (n.type === 'join-request') {
          socket.emit('respond-join', { roomId: n.roomId, requesterClientId: n.fromClientId, approve });
        } else {
          socket.emit('respond-invite', { roomId: n.roomId, approve, coAdmin: n.type === 'coadmin-invite' });
        }
        // requests/invites disappear once actioned, so they can't be re-accepted/re-declined
        socket.emit('dismiss-notification', { id: n.id });
        notificationsList = notificationsList.filter(x => x.id !== n.id);
        renderNotiList();
      };
      const accept = document.createElement('button');
      accept.className = 'noti-accept-btn'; accept.textContent = 'Accept';
      accept.addEventListener('click', () => respond(true));
      const deny = document.createElement('button');
      deny.className = 'noti-deny-btn'; deny.textContent = 'Deny';
      deny.addEventListener('click', () => respond(false));
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
  const badge = $('rail-noti-badge');
  if (badge) badge.hidden = !notificationsList.some(n => !n.read);
}

/* ── room + people search ── */
let roomSearchTimer = null;
async function runRoomSearch(q) {
  try {
    const [roomsRes, peopleRes] = await Promise.all([
      fetch('/api/rooms/search?q=' + encodeURIComponent(q)),
      fetch('/api/people/search?q=' + encodeURIComponent(q)),
    ]);
    renderRoomSearchResults(await roomsRes.json(), await peopleRes.json());
  } catch { renderRoomSearchResults([], []); }
}
function renderRoomSearchResults(rooms, people) {
  const box = $('room-search-results');
  box.innerHTML = '';
  const myIds = new Set(myRooms.map(r => r.id));
  const roomResults = (rooms || []).filter(r => !myIds.has(r.id));
  const peopleResults = (people || []).filter(p => p.name.toLowerCase() !== sbMyName().toLowerCase());
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

/* ── socket handlers (sidebar-relevant only; app.js handles the
   message-pane parts of room-history separately) ── */
socket.on('my-rooms', list => {
  myRooms = list;
  const mine = myRooms.find(r => r.id === currentRoomId);
  if (mine) currentRoomInfo = mine;
  renderRoomList();
  updateCurrentRoomLabel();
});
socket.on('notifications', list => { notificationsList = list; renderNotiList(); });
socket.on('notification', n => {
  notificationsList.unshift(n);
  renderNotiList();
  showToast(
    n.type === 'join-request' ? `${n.fromName} wants to join ${n.roomName}` :
    n.type === 'join-approved' ? `You're in — ${n.roomName}` :
    n.type === 'join-denied' ? `Request to join ${n.roomName} was declined` :
    n.type === 'room-invite' ? `${n.fromName} invited you to ${n.roomName}` :
    n.type === 'coadmin-invite' ? `${n.fromName} wants to make you co-admin of ${n.roomName}` :
    n.type === 'invite-accepted' ? `${n.fromName} joined ${n.roomName}` :
    n.type === 'kicked' ? `You were removed from ${n.roomName}` :
    n.type === 'banned' ? `You were banned from ${n.roomName}` : 'New notification'
  );
});
socket.on('room-created', room => {
  showToast(`Room "${room.name}" created — you're the admin`);
  touchRoomRecency(room.id);
  switchToRoom(room.id);
});
socket.on('room-updated', room => {
  const idx = myRooms.findIndex(r => r.id === room.id);
  if (idx !== -1) myRooms[idx] = room; else myRooms.push(room);
  if (room.id === currentRoomId) currentRoomInfo = room;
  renderRoomList();
  updateCurrentRoomLabel();
});
socket.on('room-history', ({ roomId, room }) => {
  currentRoomId = roomId;
  currentRoomInfo = room;
  touchRoomRecency(roomId);
  updateCurrentRoomLabel();
  renderRoomList();
});
socket.on('info-msg', msg => showToast(msg));

function showToast(msg) {
  let t = document.getElementById('gc-toast');
  if (!t) { t = document.createElement('div'); t.id = 'gc-toast'; t.className = 'gc-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(showToast._t);
  requestAnimationFrame(() => t.classList.add('show'));
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ── rail interactions ── */
function collapseRailSections() {
  document.querySelectorAll('.rail-section.section-expanded').forEach(s => s.classList.remove('section-expanded'));
  const rail = $('side-rail'); if (rail) rail.classList.remove('pinned');
}
function toggleRailSection(name) {
  const section = document.querySelector(`.rail-section[data-section="${name}"]`);
  if (!section) return;
  const isOpen = section.classList.contains('section-expanded');
  collapseRailSections();
  if (!isOpen) {
    section.classList.add('section-expanded');
    $('side-rail').classList.add('pinned');
  }
}
if ($('rail-notis-btn')) $('rail-notis-btn').addEventListener('click', () => toggleRailSection('notis'));
if ($('rail-rooms-btn')) $('rail-rooms-btn').addEventListener('click', () => toggleRailSection('rooms'));
if ($('rail-search-btn')) $('rail-search-btn').addEventListener('click', () => { toggleRailSection('roomsearch'); runRoomSearch(''); });

if ($('create-room-btn')) $('create-room-btn').addEventListener('click', () => {
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
if ($('create-room-submit')) $('create-room-submit').addEventListener('click', submitCreateRoom);
if ($('create-room-input')) $('create-room-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitCreateRoom(); });

if ($('room-search-input')) $('room-search-input').addEventListener('input', e => {
  clearTimeout(roomSearchTimer);
  const q = e.target.value;
  roomSearchTimer = setTimeout(() => runRoomSearch(q), 250);
});

document.addEventListener('click', e => {
  const rail = $('side-rail');
  if (rail && !rail.contains(e.target)) collapseRailSections();
});

/* ── mobile rail toggle (icon-rail becomes an overlay on narrow screens) ── */
function openMobileRail() { $('side-rail').classList.add('mobile-open'); $('rail-backdrop').classList.add('show'); }
function closeMobileRail() { $('side-rail').classList.remove('mobile-open'); $('rail-backdrop').classList.remove('show'); collapseRailSections(); }
if ($('rail-toggle-btn')) $('rail-toggle-btn').addEventListener('click', () => {
  $('side-rail').classList.contains('mobile-open') ? closeMobileRail() : openMobileRail();
});
if ($('rail-backdrop')) $('rail-backdrop').addEventListener('click', closeMobileRail);

/* Games-view active-page highlighting is handled by
   showGamesView()/showChatView() in app.js now, since it's a
   toggled view rather than a separate page. */
