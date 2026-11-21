(function () {
  try {
    var THEMES = ['snow', 'paper', 'mist', 'sage', 'rose', 'graphite', 'night'];
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get('theme');
    var stored = null;
    try {
      stored = window.localStorage.getItem('lh_theme');
    } catch (e) {
      stored = null;
    }
    var theme =
      fromQuery && THEMES.indexOf(fromQuery) >= 0
        ? fromQuery
        : stored && THEMES.indexOf(stored) >= 0
          ? stored
          : 'snow';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'snow');
  }
})();
