// Google Analytics 4 (G-LV24FGSHJJ), loaded as a classic script so the CSP needs no inline code.
// The app sends page views itself (app.js) with route-only addresses: query strings in the hash can carry
// one-time verify/reset tokens and record IDs become ":id", so nothing secret or personal reaches Google.
// Skipped during local development so test traffic stays out of the reports.
(() => {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  const ID = 'G-LV24FGSHJJ';
  const route = () => (location.hash.slice(1).split('?')[0] || '/')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
  const page = () => ({ page_location: location.origin + route(), page_title: document.title });

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag expects the arguments object
  window.gtag('js', new Date());
  window.gtag('config', ID, { send_page_view: false, ...page() });
  window.mihmahTrackPage = () => window.gtag('event', 'page_view', page());

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.append(script);
})();
