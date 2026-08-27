const express = require("express");
const http    = require("http");
const path    = require("path");
const fs      = require("fs");
const { Server } = require("socket.io");

const log = {
  info:  (msg, d={}) => console.log(JSON.stringify({ level:"info",  msg, ...d, t: new Date().toISOString() })),
  warn:  (msg, d={}) => console.warn(JSON.stringify({ level:"warn",  msg, ...d, t: new Date().toISOString() })),
  error: (msg, d={}) => console.error(JSON.stringify({ level:"error", msg, ...d, t: new Date().toISOString() })),
};

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: process.env.ALLOWED_ORIGIN || "*" }, maxHttpBufferSize: 4e6 });

app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.send("ok"));

/* ── Glass Games catalog ──────────────────────────────────
   Scans public/games for .html files so the Glass Games menu
   always reflects what's actually on disk — drop a new game's
   html file in that folder and it shows up automatically on
   next deploy, no code changes needed here. Display name comes
   from the file's own <title> tag when it has a real one,
   otherwise it's derived from the filename. */
const GAMES_DIR = path.join(__dirname, "public", "games");
function titleFromFilename(file) {
  return file
    .replace(/\.html?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || file;
}
app.get("/api/games", (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(GAMES_DIR).filter(f => /\.html?$/i.test(f));
  } catch { files = []; }

  const games = files.sort((a, b) => a.localeCompare(b)).map(file => {
    let name = null;
    try {
      const html = fs.readFileSync(path.join(GAMES_DIR, file), "utf8");
      const m = html.match(/<title>([^<]+)<\/title>/i);
      const t = m && m[1].trim();
      if (t && !/^document$/i.test(t)) name = t;
    } catch { /* fall through to filename-derived name */ }
    return { file, name: name || titleFromFilename(file) };
  });

  res.json(games);
});

/* Search/browse rooms — public discovery info only (name/icon/member
   count/admin), never membership or pending-request details. Empty
   query returns everything (capped) so the sidebar can browse too. */
app.get("/api/rooms/search", (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  const results = Object.values(rooms)
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 25)
    .map(r => ({ id: r.id, name: r.name, icon: r.icon, memberCount: r.members.length, adminName: r.adminName }));
  res.json(results);
});

/* Search people who have ever set up a Glass Chat profile (keyed by
   name, deduped across IPs/devices) — lets a room admin find someone
   to invite even if that person isn't online right now. */
app.get("/api/people/search", (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  const byName = new Map();
  for (const p of Object.values(profiles)) {
    if (!p?.name) continue;
    const key = p.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (existing.updatedAt || 0) < (p.updatedAt || 0)) byName.set(key, p);
  }
  const results = [...byName.values()]
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 20)
    .map(p => ({ name: p.name }));
  res.json(results);
});

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function getSocketIp(handshake) {
  const xff = handshake.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return handshake.address || "unknown";
}

/* ── Best-effort disk persistence ───────────────────────────
   Survives crashes/restarts within the same container.
   NOTE: most hosting platforms (incl. Render's default web
   service disk) wipe local files on a fresh deploy — for true
   durability across deploys you'd want a managed database. */
const DATA_FILE = path.join(__dirname, "data", "messages.json");
function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    for (const msg of raw) {
      const plain = msg.reactionsRaw || {};
      msg.reactionsRaw = {};
      for (const [emoji, arr] of Object.entries(plain)) msg.reactionsRaw[emoji] = new Set(arr);
    }
    return raw;
  } catch { return []; }
}
function serializeHistory() {
  return history.map(m => ({
    ...m,
    reactionsRaw: Object.fromEntries(Object.entries(m.reactionsRaw || {}).map(([e, s]) => [e, [...s]])),
  }));
}
let saveTimer = null;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(serializeHistory()));
    } catch (e) { log.error("save-failed", { err: e.message }); }
  }, 800);
}

/* ── IP-keyed profile persistence (name + avatar) ──
   Lets returning visitors skip the "type your name" screen —
   we recognize their public IP and greet them straight into
   chat with their saved name/photo. NOTE: everyone behind the
   same public IP (e.g. same household/office NAT) shares one
   saved profile — a known tradeoff of IP-based recognition. */
const PROFILES_FILE = path.join(__dirname, "data", "profiles.json");
function loadProfiles() {
  try { return JSON.parse(fs.readFileSync(PROFILES_FILE, "utf8")); }
  catch { return {}; }
}
let profileSaveTimer = null;
function saveProfilesDebounced() {
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(PROFILES_FILE), { recursive: true });
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles));
    } catch (e) { log.error("profile-save-failed", { err: e.message }); }
  }, 500);
}

/* ── Rooms ──────────────────────────────────────────────────
   'general' is the always-on default room everyone lands in —
   it behaves exactly as the old single-room chat always did
   (no membership gate, no admin). Any other room is created by
   a user (who becomes its admin), has its own message history,
   and gates entry behind an admin-approved join request. ── */
const ROOMS_FILE = path.join(__dirname, "data", "rooms.json");
function loadRooms() {
  try { return JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8")); }
  catch { return {}; }
}
let roomsSaveTimer = null;
function saveRoomsDebounced() {
  clearTimeout(roomsSaveTimer);
  roomsSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(ROOMS_FILE), { recursive: true });
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms));
    } catch (e) { log.error("rooms-save-failed", { err: e.message }); }
  }, 500);
}

const ROOM_MESSAGES_FILE = path.join(__dirname, "data", "room-messages.json");
function loadRoomMessages() {
  try {
    const raw = JSON.parse(fs.readFileSync(ROOM_MESSAGES_FILE, "utf8"));
    for (const rid of Object.keys(raw)) {
      for (const msg of raw[rid]) {
        const plain = msg.reactionsRaw || {};
        msg.reactionsRaw = {};
        for (const [emoji, arr] of Object.entries(plain)) msg.reactionsRaw[emoji] = new Set(arr);
      }
    }
    return raw;
  } catch { return {}; }
}
function serializeRoomMessages() {
  const out = {};
  for (const [rid, arr] of Object.entries(roomMessages)) {
    out[rid] = arr.map(m => ({
      ...m,
      reactionsRaw: Object.fromEntries(Object.entries(m.reactionsRaw || {}).map(([e, s]) => [e, [...s]])),
    }));
  }
  return out;
}
let roomMsgSaveTimer = null;
function saveRoomMessagesDebounced() {
  clearTimeout(roomMsgSaveTimer);
  roomMsgSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(ROOM_MESSAGES_FILE), { recursive: true });
      fs.writeFileSync(ROOM_MESSAGES_FILE, JSON.stringify(serializeRoomMessages()));
    } catch (e) { log.error("room-messages-save-failed", { err: e.message }); }
  }, 800);
}

/* ── Per-user notification inbox (join requests + their outcomes) ── */
const NOTIFICATIONS_FILE = path.join(__dirname, "data", "notifications.json");
function loadNotifications() {
  try { return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, "utf8")); }
  catch { return {}; }
}
let notifSaveTimer = null;
function saveNotificationsDebounced() {
  clearTimeout(notifSaveTimer);
  notifSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(NOTIFICATIONS_FILE), { recursive: true });
      fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications));
    } catch (e) { log.error("notifications-save-failed", { err: e.message }); }
  }, 500);
}

const MAX_HISTORY = 300;
const PAGE_SIZE   = 30;
const MAX_MSG_LEN = 2000;
const MAX_IMG_LEN = 950000; // ~700KB base64, enough headroom for 1000px-wide JPEGs
const MAX_AVATAR_LEN = 300000; // small square photo, plenty of headroom
const RATE_LIMIT  = 8;

const history  = loadHistory();
const profiles = loadProfiles(); // ip -> { name, avatar, updatedAt }
const rooms         = loadRooms();          // roomId -> RoomMeta (excludes 'general')
const roomMessages  = loadRoomMessages();   // roomId -> [msg,...]  (excludes 'general', which uses `history`)
const notifications = loadNotifications();  // usernameLower -> [notif,...]
const GENERAL_ROOM = { id: "general", name: "General", icon: "💬" };
const users      = {};   // socket.id -> { name, clientId, avatar, roomId }
const rateLimits = {};

function slugify(str) {
  return String(str || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "room";
}
function cleanId(x, max = 40) { return String(x || "").trim().slice(0, max); }
function isMember(room, clientId) {
  if (!room || !clientId) return false;
  if (room.adminClientId === clientId) return true;
  return room.members.some(m => m.clientId === clientId);
}
function isPrivileged(room, clientId) {
  if (!room || !clientId) return false;
  if (room.adminClientId === clientId) return true;
  return (room.coAdmins || []).some(m => m.clientId === clientId);
}
function publicRoomInfo(room, viewerClientId) {
  const isAdmin = room.adminClientId === viewerClientId;
  const isCoAdmin = (room.coAdmins || []).some(m => m.clientId === viewerClientId);
  const privileged = isAdmin || isCoAdmin;
  return {
    id: room.id, name: room.name, icon: room.icon,
    adminName: room.adminName, isAdmin, isCoAdmin, isPrivileged: privileged,
    memberCount: room.members.length,
    pendingRequests: privileged ? room.pendingRequests : [],
    members: privileged ? room.members.map(m => ({
      clientId: m.clientId, name: m.name,
      role: m.clientId === room.adminClientId ? "admin" : (room.coAdmins || []).some(c => c.clientId === m.clientId) ? "co-admin" : "member",
    })) : [],
  };
}
function myRoomsList(clientId) {
  const mine = Object.values(rooms).filter(r => isMember(r, clientId)).map(r => publicRoomInfo(r, clientId));
  return [{ id: "general", name: "General", icon: "💬", adminName: null, isAdmin: false, isCoAdmin: false, isPrivileged: false, memberCount: null, pendingRequests: [], members: [], isDefault: true }, ...mine];
}
function broadcastRoomToMembers(room) {
  const memberNames = new Set([room.adminName, ...(room.coAdmins || []).map(c => c.name), ...room.members.map(m => m.name)].map(n => n.toLowerCase()));
  Object.entries(users).forEach(([sid, x]) => {
    if (memberNames.has(x.name.toLowerCase())) io.to(sid).emit("room-updated", publicRoomInfo(room, x.clientId));
  });
}
function findClientIdByName(name) {
  const key = String(name || "").toLowerCase(); if (!key) return null;
  let found = null, latest = 0;
  for (const p of Object.values(profiles)) {
    if (p?.name && p.name.toLowerCase() === key && p.clientId && p.updatedAt > latest) { found = p.clientId; latest = p.updatedAt; }
  }
  return found;
}
function notifyUser(name, notif) {
  const key = String(name || "").toLowerCase(); if (!key) return;
  if (!notifications[key]) notifications[key] = [];
  notifications[key].unshift(notif);
  notifications[key] = notifications[key].slice(0, 50);
  saveNotificationsDebounced();
  const target = Object.entries(users).find(([, u]) => u.name.toLowerCase() === key);
  if (target) io.to(target[0]).emit("notification", notif);
}
function getRoomStore(roomId) {
  if (roomId === "general") return history;
  if (!roomMessages[roomId]) roomMessages[roomId] = [];
  return roomMessages[roomId];
}
function saveRoomStoreDebounced(roomId) {
  if (roomId === "general") return saveDebounced();
  return saveRoomMessagesDebounced();
}

function evictStaleSocket(clientId, exceptSocketId) {
  for (const [sid, u] of Object.entries(users)) {
    if (u.clientId === clientId && sid !== exceptSocketId) {
      const oldSocket = io.sockets.sockets.get(sid);
      if (oldSocket) oldSocket.disconnect(true);
      delete users[sid]; delete rateLimits[sid];
    }
  }
}

function sanitize(str = "", max = MAX_MSG_LEN) {
  return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().slice(0, max);
}
function isRateLimited(id) {
  const now = Date.now();
  if (!rateLimits[id] || rateLimits[id].resetAt < now) rateLimits[id] = { count: 0, resetAt: now + 3000 };
  return ++rateLimits[id].count > RATE_LIMIT;
}
function publicMsg(m) {
  const { reactionsRaw, ...rest } = m;
  return {
    ...rest,
    reactions: Object.entries(reactionsRaw || {}).map(([emoji, set]) => ({ emoji, users: [...set] })),
  };
}
function validAvatar(a) {
  return typeof a === "string" && a.startsWith("data:image") && a.length < MAX_AVATAR_LEN ? a : null;
}

/* ── profile API: lets the client check/save the name+photo
   tied to the visitor's public IP ── */
app.get("/api/profile", (req, res) => {
  const ip = getClientIp(req);
  const p = profiles[ip];
  if (p) res.json({ exists: true, name: p.name, avatar: p.avatar || null });
  else res.json({ exists: false });
});

app.post("/api/profile", (req, res) => {
  const ip = getClientIp(req);
  const body = req.body || {};
  const name = sanitize(body.name, 24);
  if (!name) return res.status(400).json({ error: "Name required" });

  const existing = profiles[ip] || {};
  let avatar = existing.avatar || null;
  if ("avatar" in body) avatar = body.avatar === null ? null : validAvatar(body.avatar);

  profiles[ip] = { name, avatar, updatedAt: Date.now() };
  saveProfilesDebounced();
  res.json({ ok: true, name, avatar });
});

/* Sign out — forgets the profile saved against this visitor's IP so the
   auto-recognition above doesn't just log them straight back in on their
   next visit or page refresh. */
app.delete("/api/profile", (req, res) => {
  const ip = getClientIp(req);
  delete profiles[ip];
  saveProfilesDebounced();
  res.json({ ok: true });
});

/* Open Graph link preview — no external API key needed */
const previewCache = new Map();
async function fetchPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 GlassChatBot" } });
    clearTimeout(t);
    const html = await res.text();
    const pick = re => (html.match(re) || [])[1];
    const preview = {
      url,
      title: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || pick(/<title>([^<]+)<\/title>/i) || url,
      desc:  pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
          || pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || "",
      image: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || null,
    };
    previewCache.set(url, preview);
    return preview;
  } catch { return null; }
}

io.on("connection", socket => {
  log.info("connect", { id: socket.id });

  socket.on("join", ({ name, clientId, avatar } = {}) => {
    const username = sanitize(name, 24);
    const cid = sanitize(clientId, 64) || null;
    if (!username) return socket.emit("error-msg", "Invalid name");

    const conflict = Object.entries(users).find(
      ([sid, u]) => u.name.toLowerCase() === username.toLowerCase() && u.clientId !== cid
    );
    if (conflict) return socket.emit("name-taken");

    if (cid) evictStaleSocket(cid, socket.id); // drop any earlier session from this same browser
    users[socket.id] = { name: username, clientId: cid, avatar: validAvatar(avatar), roomId: "general" };
    socket.join("general");
    log.info("join", { username });

    // keep this browser's profile record in sync with its clientId so room
    // invites (people-search → invite) can resolve a name back to a specific
    // browser even when that person isn't online at invite time.
    if (cid) {
      const ip = getSocketIp(socket.handshake);
      const existing = profiles[ip] || {};
      profiles[ip] = { name: username, avatar: validAvatar(avatar) || existing.avatar || null, clientId: cid, updatedAt: Date.now() };
      saveProfilesDebounced();
    }

    socket.emit("join-success");
    socket.emit("history", history.slice(-PAGE_SIZE).map(publicMsg));
    socket.emit("history-has-more", history.length > PAGE_SIZE);
    socket.emit("my-rooms", myRoomsList(cid));
    socket.emit("notifications", notifications[username.toLowerCase()] || []);
    socket.broadcast.emit("system", `${username} joined`);
    io.emit("user-count", Object.keys(users).length);
  });

  socket.on("update-profile", (data = {}) => {
    const u = users[socket.id]; if (!u) return;
    let newName = u.name;
    if (typeof data.name === "string") {
      const sn = sanitize(data.name, 24);
      if (sn && sn.toLowerCase() !== u.name.toLowerCase()) {
        const conflict = Object.entries(users).find(
          ([sid, x]) => sid !== socket.id && x.name.toLowerCase() === sn.toLowerCase()
        );
        if (conflict) return socket.emit("error-msg", "That name is already taken");
        newName = sn;
      } else if (sn) newName = sn;
    }
    let newAvatar = u.avatar;
    if ("avatar" in data) newAvatar = data.avatar === null ? null : validAvatar(data.avatar);

    const oldName = u.name;
    u.name = newName; u.avatar = newAvatar;
    socket.emit("profile-updated", { name: newName, avatar: newAvatar });
    if (oldName !== newName) io.emit("system", `${oldName} is now known as ${newName}`);

    // persist against this visitor's IP too, so it sticks on their next visit
    const ip = getSocketIp(socket.handshake);
    profiles[ip] = { name: newName, avatar: newAvatar, updatedAt: Date.now() };
    saveProfilesDebounced();
  });

  /* ── Rooms ── */
  socket.on("create-room", ({ name } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const cleanName = sanitize(name, 30);
    if (!cleanName) return socket.emit("error-msg", "Enter a room name");

    let id = slugify(cleanName);
    if (id === "general" || rooms[id]) {
      let n = 2;
      while (rooms[`${id}-${n}`] || `${id}-${n}` === "general") n++;
      id = `${id}-${n}`;
    }
    const room = {
      id, name: cleanName, icon: "🫧",
      adminClientId: u.clientId, adminName: u.name,
      members: [{ clientId: u.clientId, name: u.name }],
      coAdmins: [],
      pendingRequests: [], createdAt: Date.now(),
    };
    rooms[id] = room;
    saveRoomsDebounced();
    log.info("room-create", { id, by: u.name });
    socket.emit("room-created", publicRoomInfo(room, u.clientId));
  });

  socket.on("switch-room", ({ roomId } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    const room = rid === "general" ? GENERAL_ROOM : rooms[rid];
    if (!room) return socket.emit("error-msg", "Room not found");
    if (rid !== "general" && !isMember(rooms[rid], u.clientId)) return socket.emit("error-msg", "You're not a member of that room");

    socket.leave(u.roomId);
    socket.join(rid);
    u.roomId = rid;
    const store = getRoomStore(rid);
    socket.emit("room-history", {
      roomId: rid,
      msgs: store.slice(-PAGE_SIZE).map(publicMsg),
      hasMore: store.length > PAGE_SIZE,
      room: rid === "general"
        ? { id: "general", name: "General", icon: "💬", isDefault: true, isAdmin: false }
        : publicRoomInfo(rooms[rid], u.clientId),
    });
  });

  socket.on("set-room-icon", ({ roomId, icon } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const room = rooms[cleanId(roomId)]; if (!room) return;
    if (!isPrivileged(room, u.clientId)) return socket.emit("error-msg", "Only room admins can do that");
    const clean = sanitize(icon, 8);
    if (!clean) return;
    room.icon = clean;
    saveRoomsDebounced();
    broadcastRoomToMembers(room);
  });

  socket.on("request-join", ({ roomId } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const room = rooms[cleanId(roomId)]; if (!room) return socket.emit("error-msg", "Room not found");
    if (isMember(room, u.clientId)) return socket.emit("error-msg", "You're already in that room");
    if (room.pendingRequests.some(p => p.clientId === u.clientId)) return socket.emit("error-msg", "Request already sent");

    room.pendingRequests.push({ clientId: u.clientId, name: u.name, ts: Date.now() });
    saveRoomsDebounced();
    const base = {
      type: "join-request", ts: Date.now(), read: false,
      roomId: room.id, roomName: room.name, roomIcon: room.icon,
      fromName: u.name, fromClientId: u.clientId,
    };
    [room.adminName, ...room.coAdmins.map(c => c.name)].forEach(rname => {
      notifyUser(rname, { ...base, id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` });
    });
    socket.emit("info-msg", `Request sent to join ${room.name}`);
  });

  socket.on("respond-join", ({ roomId, requesterClientId, approve } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const room = rooms[cleanId(roomId)]; if (!room) return;
    if (!isPrivileged(room, u.clientId)) return socket.emit("error-msg", "Only room admins can do that");

    const idx = room.pendingRequests.findIndex(p => p.clientId === requesterClientId);
    if (idx === -1) return;
    const reqEntry = room.pendingRequests[idx];
    room.pendingRequests.splice(idx, 1);
    if (approve && !room.members.some(m => m.clientId === reqEntry.clientId)) {
      room.members.push({ clientId: reqEntry.clientId, name: reqEntry.name });
    }
    saveRoomsDebounced();
    notifyUser(reqEntry.name, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: approve ? "join-approved" : "join-denied", ts: Date.now(), read: false,
      roomId: room.id, roomName: room.name, roomIcon: room.icon,
    });
    if (approve) {
      const target = Object.entries(users).find(([, x]) => x.clientId === reqEntry.clientId);
      if (target) io.to(target[0]).emit("my-rooms", myRoomsList(reqEntry.clientId));
    }
    broadcastRoomToMembers(room);
  });

  /* Admin/co-admin invites someone (by name) to join, or to become a
     co-admin — either way it's a request the person must accept. A
     co-admin invite works on existing members too (that's how someone
     already in the room gets promoted). */
  socket.on("invite-to-room", ({ roomId, name, asCoAdmin } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const room = rooms[cleanId(roomId)]; if (!room) return;
    if (!isPrivileged(room, u.clientId)) return socket.emit("error-msg", "Only room admins can invite people");
    const targetName = sanitize(name, 24);
    if (!targetName) return;
    if (targetName.toLowerCase() === u.name.toLowerCase()) return socket.emit("error-msg", "That's you!");

    const targetClientId = findClientIdByName(targetName);
    if (!targetClientId) return socket.emit("error-msg", "Couldn't find that person");
    if (asCoAdmin && room.coAdmins.some(c => c.clientId === targetClientId)) return socket.emit("error-msg", `${targetName} is already a co-admin`);
    if (!asCoAdmin && isMember(room, targetClientId)) return socket.emit("error-msg", `${targetName} is already in that room`);

    notifyUser(targetName, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: asCoAdmin ? "coadmin-invite" : "room-invite", ts: Date.now(), read: false,
      roomId: room.id, roomName: room.name, roomIcon: room.icon,
      fromName: u.name, targetClientId,
    });
    socket.emit("info-msg", `Invite sent to ${targetName}`);
  });

  socket.on("respond-invite", ({ roomId, approve, coAdmin } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const room = rooms[cleanId(roomId)]; if (!room) return socket.emit("error-msg", "Room not found");
    if (!approve) return;

    if (!room.members.some(m => m.clientId === u.clientId)) room.members.push({ clientId: u.clientId, name: u.name });
    if (coAdmin && !room.coAdmins.some(c => c.clientId === u.clientId)) room.coAdmins.push({ clientId: u.clientId, name: u.name });
    saveRoomsDebounced();
    socket.emit("my-rooms", myRoomsList(u.clientId));
    notifyUser(room.adminName, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "invite-accepted", ts: Date.now(), read: false,
      roomId: room.id, roomName: room.name, roomIcon: room.icon, fromName: u.name,
    });
    broadcastRoomToMembers(room);
  });

  socket.on("mark-notification-read", ({ id } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const list = notifications[u.name.toLowerCase()] || [];
    const n = list.find(x => x.id === id);
    if (n) { n.read = true; saveNotificationsDebounced(); }
  });

  socket.on("load-more", ({ before, roomId } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    const store = getRoomStore(rid);
    const idx = store.findIndex(m => m.ts === before);
    const end = idx === -1 ? store.length : idx;
    const start = Math.max(0, end - PAGE_SIZE);
    socket.emit("more-history", { roomId: rid, msgs: store.slice(start, end).map(publicMsg), hasMore: start > 0 });
  });

  socket.on("message", async data => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(data.roomId) || "general";
    if (rid !== "general" && !isMember(rooms[rid], u.clientId)) return;
    if (isRateLimited(socket.id)) return socket.emit("error-msg", "Slow down a little");
    const text = sanitize(data.text || "");
    const image = typeof data.image === "string" && data.image.length < MAX_IMG_LEN ? data.image : null;
    if (!text && !image) return;

    const msg = {
      user: u.name, avatar: u.avatar || null, socketId: socket.id, roomId: rid,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(), text, image, edited: false, deleted: false,
      reactionsRaw: {},
      replyTo: data.replyTo ? {
        id: data.replyTo.id, user: sanitize(data.replyTo.user, 24), text: sanitize(data.replyTo.text, 100),
      } : null,
      seenBy: [],
    };
    const store = getRoomStore(rid);
    store.push(msg);
    if (store.length > MAX_HISTORY) store.shift();
    saveRoomStoreDebounced(rid);
    io.to(rid).emit("message", publicMsg(msg));

    const urlMatch = text.match(/https?:\/\/[^\s<]+/);
    if (urlMatch) {
      const preview = await fetchPreview(urlMatch[0]);
      if (preview) io.to(rid).emit("link-preview", { msgId: msg.id, preview });
    }
  });

  socket.on("edit-msg", ({ id, text, roomId }) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    const store = getRoomStore(rid);
    const msg = store.find(m => m.id === id && m.user === u.name);
    if (!msg) return;
    msg.text = sanitize(text); msg.edited = true;
    saveRoomStoreDebounced(rid);
    io.to(rid).emit("msg-edited", { id, text: msg.text });
  });

  socket.on("delete-msg", ({ id, roomId }) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    const store = getRoomStore(rid);
    const msg = store.find(m => m.id === id && m.user === u.name);
    if (!msg) return;
    msg.deleted = true; msg.text = ""; msg.image = null;
    saveRoomStoreDebounced(rid);
    io.to(rid).emit("msg-deleted", { id });
  });

  socket.on("react", ({ msgId, emoji, roomId }) => {
    const u = users[socket.id]; if (!u || !msgId || !emoji) return;
    const rid = cleanId(roomId) || "general";
    const store = getRoomStore(rid);
    const msg = store.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactionsRaw[emoji]) msg.reactionsRaw[emoji] = new Set();
    const set = msg.reactionsRaw[emoji];
    set.has(u.name) ? set.delete(u.name) : set.add(u.name);
    if (!set.size) delete msg.reactionsRaw[emoji];
    saveRoomStoreDebounced(rid);
    const snapshot = Object.entries(msg.reactionsRaw).map(([e, s]) => ({ emoji: e, users: [...s] }));
    io.to(rid).emit("reaction-update", { msgId, reactions: snapshot });
  });

  socket.on("seen", ({ id, roomId }) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    const store = getRoomStore(rid);
    const msg = store.find(m => m.id === id);
    if (msg && !msg.seenBy.includes(u.name)) {
      msg.seenBy.push(u.name);
      io.to(rid).emit("seen-update", { id, reader: u.name });
    }
  });

  socket.on("typing", ({ roomId } = {}) => {
    const u = users[socket.id]; if (!u) return;
    const rid = cleanId(roomId) || "general";
    socket.to(rid).emit("typing", { user: u.name, roomId: rid });
  });

  socket.on("disconnect", () => {
    const username = users[socket.id]?.name;
    delete users[socket.id]; delete rateLimits[socket.id];
    if (username) {
      log.info("leave", { username });
      io.emit("system", `${username} left`);
      io.emit("user-count", Object.keys(users).length);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => log.info("listening", { port: PORT }));

function shutdown(signal) {
  log.info("shutdown", { signal });
  io.emit("system", "Server restarting — back in a moment.");
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(serializeHistory()));
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles));
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms));
    fs.writeFileSync(ROOM_MESSAGES_FILE, JSON.stringify(serializeRoomMessages()));
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications));
  } catch {}
  server.close(() => { log.info("closed"); process.exit(0); });
  setTimeout(() => process.exit(1), 8000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
