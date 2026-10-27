// Color theme. Loaded as a classic script in <head> so the theme is set before the first paint (no dark flash).
// Preference: "system" (default, follows the device), "light" or "dark", remembered per browser.
(() => {
  const KEY = 'mihmah-theme';
  const media = matchMedia('(prefers-color-scheme: light)');
  const read = () => {
    try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
  };
  const apply = (pref = read()) => {
    const theme = pref === 'light' || (pref === 'system' && media.matches) ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#EDEFF2' : '#191B1E');
    window.dispatchEvent(new Event('themechange'));
  };
  media.addEventListener('change', () => { if (read() === 'system') apply(); });
  window.mihmahTheme = {
    get: read,
    set(pref) {
      try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch { /* private mode: applies for this visit only */ }
      apply(pref);
    },
  };
  apply();
})();
