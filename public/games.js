/* ════════ Glass Games — bubble menu ════════
   $ is declared in sidebar.js, which loads before this file. */

function rand(min, max) { return min + Math.random() * (max - min); }

function makeBubble(game, i) {
  const wrap = document.createElement('a');
  wrap.className = 'bubble-float';
  wrap.href = `games/${encodeURIComponent(game.file)}`;
  wrap.style.setProperty('--dur', rand(4.5, 7.5).toFixed(2) + 's');
  wrap.style.setProperty('--delay', (-rand(0, 5)).toFixed(2) + 's');
  wrap.style.setProperty('--hue', (i % 2 === 0 ? 1 : -1) * (8 + (i * 5) % 22) + 'deg');

  const bubble = document.createElement('span');
  bubble.className = 'game-bubble';
  bubble.title = game.name;

  const label = document.createElement('span');
  label.className = 'game-bubble-label';
  label.textContent = game.name;
  bubble.appendChild(label);
  wrap.appendChild(bubble);

  wrap.addEventListener('click', e => {
    e.preventDefault();
    if (bubble.classList.contains('popping')) return;
    bubble.classList.add('popping');
    setTimeout(() => { window.location.href = wrap.href; }, 260);
  });

  return wrap;
}

function renderEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'games-empty';
  empty.innerHTML = `
    <div class="ghost-bubble gb-a"></div>
    <div class="ghost-bubble gb-b"></div>
    <div class="games-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="9" r="6.5" stroke-dasharray="3.5 3.5"/>
        <circle cx="17" cy="16" r="3.5" stroke-dasharray="2.5 2.5"/>
      </svg>
    </div>
    <div class="games-empty-title">No games yet</div>
    <p class="games-empty-sub">New games will float up here the moment they're added.</p>
  `;
  return empty;
}

let allGames = [];

function renderGames(games) {
  const body = $('games-results');
  body.innerHTML = '';
  if (!Array.isArray(games) || games.length === 0) {
    body.appendChild(renderEmptyState());
    return;
  }
  const field = document.createElement('div');
  field.className = 'bubble-field';
  games.forEach((g, i) => field.appendChild(makeBubble(g, i)));
  body.appendChild(field);
}

function renderNoMatches(query) {
  const body = $('games-results');
  body.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'games-empty';
  div.innerHTML = `
    <div class="games-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </div>
    <div class="games-empty-title">No games match "${query.replace(/</g,'&lt;')}"</div>
    <p class="games-empty-sub">Try a different search.</p>
  `;
  body.appendChild(div);
}

async function loadGames() {
  let games = [];
  try {
    const res = await fetch('/api/games');
    if (res.ok) games = await res.json();
  } catch { /* network hiccup — fall through to empty state */ }
  allGames = Array.isArray(games) ? games : [];
  renderGames(allGames);
}

$('games-search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderGames(allGames); return; }
  const matches = allGames.filter(g => g.name.toLowerCase().includes(q));
  if (!matches.length) renderNoMatches(e.target.value.trim());
  else renderGames(matches);
});

loadGames();
