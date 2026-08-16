/**
 * app.js — Tick⚡Tock (mini-app experiment)
 * Boot: wire the UI, sync sound, register the offline service worker,
 * and — on a fresh device — ask who is playing instead of defaulting.
 */
(function (root) {
  'use strict';

  function boot() {
    var Store = root.JOGO.Store;
    var Audio = root.JOGO.Audio;
    var UI = root.JOGO.UI;
    var store = Store.createStore();

    Audio.setMuted(!store.sound());
    UI.setSoundIcons();
    UI.wire();
    UI.renderHome();

    if (root.navigator && root.navigator.serviceWorker) {
      root.navigator.serviceWorker.register('sw.js').catch(function () { /* offline optional */ });
    }

    if (!store.activeLearner()) UI.renderLearners(); // never silently default
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof self !== 'undefined' ? self : this);
