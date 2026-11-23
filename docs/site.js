(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js-ready');

  // Theme toggle (light default, warm espresso dark option)
  var themeBtn = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');

  function effectiveTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'dark' || explicit === 'light') return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncThemeButton() {
    if (!themeBtn) return;
    var isDark = effectiveTheme() === 'dark';
    themeBtn.setAttribute('aria-pressed', String(isDark));
    themeBtn.setAttribute('aria-label', isDark ? 'Switch to light paper theme' : 'Switch to dark espresso theme');
    if (themeLabel) themeLabel.textContent = isDark ? 'Light' : 'Dark';
  }

  if (themeBtn) {
    syncThemeButton();
    themeBtn.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('tribu_site_theme', next);
      } catch (_) {}
      syncThemeButton();
    });
  }

  // Mobile menu
  var menuBtn = document.getElementById('menu-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', function () {
      var open = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-expanded', String(!open));
      mobileNav.hidden = open;
    });
    mobileNav.addEventListener('click', function (e) {
      if (e.target && e.target.closest('a')) {
        menuBtn.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !mobileNav.hidden) {
        menuBtn.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
        menuBtn.focus();
      }
    });
  }

  // Quiet media view switchers inside day stations
  document.querySelectorAll('[data-media-switch]').forEach(function (group) {
    var buttons = Array.prototype.slice.call(group.querySelectorAll('button[data-target]'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        buttons.forEach(function (b) {
          var active = b === btn;
          b.setAttribute('aria-pressed', String(active));
          var el = document.getElementById(b.getAttribute('data-target'));
          if (el) el.hidden = !active;
        });
        var shown = document.getElementById(targetId);
        if (shown) shown.hidden = false;
      });
    });
  });

  // Accessible tabs for server quick start
  document.querySelectorAll('[data-tabs]').forEach(function (container) {
    var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute('aria-controls'));
    });

    function activate(index, focusTab) {
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (panels[i]) panels[i].hidden = !selected;
      });
      if (focusTab) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        activate(i, false);
      });
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          activate((i + 1) % tabs.length, true);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          activate((i - 1 + tabs.length) % tabs.length, true);
        } else if (e.key === 'Home') {
          e.preventDefault();
          activate(0, true);
        } else if (e.key === 'End') {
          e.preventDefault();
          activate(tabs.length - 1, true);
        }
      });
    });
  });

  // Copy code button (copies active panel's code block inside its container)
  document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('[data-tabs]');
      var el = null;
      if (box) {
        var visiblePanel = box.querySelector('[role="tabpanel"]:not([hidden]) code');
        if (visiblePanel) el = visiblePanel;
      }
      if (!el) el = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!el) return;
      var text = el.textContent || '';
      var done = function () {
        var label = btn.getAttribute('data-label') || 'Copy';
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.textContent = label;
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
      }
    });
  });

  // Gentle scroll reveal + active time rail
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach(function (el) { revealObs.observe(el); });
  }

  var railLinks = Array.prototype.slice.call(document.querySelectorAll('.rail-link'));
  var stations = railLinks.map(function (link) {
    return document.getElementById(link.getAttribute('href').slice(1));
  }).filter(Boolean);

  if (railLinks.length && stations.length && 'IntersectionObserver' in window) {
    var railObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        railLinks.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '-35% 0px -45% 0px', threshold: 0.01 });
    stations.forEach(function (st) { railObs.observe(st); });
  }
})();
