/* LeziBench site.js — 只有一个功能：明暗主题切换。
   无追踪、无外部请求、无依赖。localStorage 不可用时静默降级。
   默认是深色（品牌主形态），用户点一次即切到浅色并记住。 */
(function () {
  'use strict';

  var KEY = 'lezi-theme';
  var root = document.documentElement;
  var btn = document.querySelector('[data-theme-toggle]');

  function current() {
    var set = root.getAttribute('data-theme');
    return set === 'light' ? 'light' : 'dark';
  }

  function label() {
    if (!btn) return;
    var next = current() === 'dark' ? 'LIGHT' : 'DARK';
    btn.textContent = next;
    btn.setAttribute('aria-label', '切换到' + (next === 'LIGHT' ? '浅色' : '深色') + '主题');
    btn.setAttribute('title', '切换到' + (next === 'LIGHT' ? '浅色' : '深色') + '主题');
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) { /* 隐私模式：只在本次会话生效 */ }
    label();
  }

  if (btn) {
    label();
    btn.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark');
    });
  }
})();
