/* ════════ Glass Games — theme sync ════════
   Reads the same 'gc_theme' localStorage key the chat app writes to
   (see themes-data.js + app.js) and applies it instantly — no
   crossfade needed since this is a fresh page load, not a live
   switch. Keeps Glass Games always matching whatever theme the
   person picked in Glass Chat, including the Vanta fog and favicon. */
(function () {
  const savedId = localStorage.getItem('gc_theme') || 'sky';
  const theme = (typeof getTheme === 'function') ? getTheme(savedId) : null;
  if (!theme) return;

  const root = document.documentElement.style;
  Object.entries(THEME_VAR_MAP).forEach(([key, cssVar]) => root.setProperty(cssVar, theme[key]));

  function setFaviconLink(id, href, fallback) {
    const link = document.getElementById(id);
    if (!link) return;
    const test = new Image();
    test.onload = () => { link.href = href; };
    test.onerror = () => { link.href = fallback; };
    test.src = href;
  }
  const suffix = theme.slug ? `-${theme.slug}` : '';
  setFaviconLink('icon-ico', `favicon${suffix}.ico`, 'favicon.ico');
  setFaviconLink('icon-32', `favicon-32${suffix}.png`, 'favicon-32.png');
  setFaviconLink('apple-touch', `apple-touch-icon${suffix}.png`, 'apple-touch-icon.png');

  try {
    if (window.THREE && window.VANTA) {
      window.__gamesVanta = VANTA.FOG({
        el: '#bg', mouseControls: true, touchControls: true, gyroControls: false,
        minHeight: 200, minWidth: 200,
        highlightColor: theme.vanta.highlight, midtoneColor: theme.vanta.midtone,
        lowlightColor: theme.vanta.lowlight, baseColor: theme.vanta.base,
      });
    }
  } catch (e) { console.warn('Vanta init failed:', e); }
})();
