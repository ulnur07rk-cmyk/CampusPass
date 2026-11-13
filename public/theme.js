// CampusPass — day/night theme. Loaded in <head> so the page never flashes in the wrong colours.
// The choice is saved in the browser (localStorage 'cp.theme'); without a choice the device setting is used.
(function () {
  var saved = null; try { saved = localStorage.getItem('cp.theme'); } catch (e) { saved = null; }
  var dark = saved ? saved === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  window.CPTheme = {
    get: function () { return document.documentElement.getAttribute('data-theme'); },
    set: function (t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('cp.theme', t); } catch (e) { /* private mode */ } },
    toggle: function () { this.set(this.get() === 'dark' ? 'light' : 'dark'); return this.get(); }
  };
})();
