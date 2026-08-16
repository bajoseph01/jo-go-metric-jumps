/**
 * app.js — Jo⚡Go Metric Jumps
 * Boot: wires the static chrome (home, HUD, sound, back buttons), the
 * discreet teacher access, and starts the app on the home screen.
 */
(function (root) {
  'use strict';

  var UI = root.JOGO.UI;
  var Game = root.JOGO.Game;
  var Store = root.JOGO.Store;
  var Audio = root.JOGO.Audio;

  function $(id) { return document.getElementById(id); }

  var isTouch = ('ontouchstart' in root) || (root.navigator && root.navigator.maxTouchPoints > 0);

  function toggleSound() {
    var on = !Store.get().soundOn;
    Store.setSoundOn(on);
    Audio.setMuted(!on);
    UI.setSoundIcons();
    Audio.play('click');
  }

  function wireHome() {
    $('btn-play').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      var st = Store.get();
      var stage = Math.min(st.unlocked, 8);
      Game.startStage(stage);
    });

    $('btn-practice').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      UI.renderPractice();
    });

    $('btn-progress').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      UI.renderProgress();
    });

    $('btn-how').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      UI.show('screen-how');
    });

    $('home-sound').addEventListener('click', function () {
      Audio.unlock();
      toggleSound();
    });
  }

  function wireHud() {
    $('btn-home').addEventListener('click', function () {
      Audio.play('click');
      Game.quit();
    });
    $('btn-sound').addEventListener('click', function () {
      Audio.unlock();
      toggleSound();
    });
  }

  function wireBack() {
    var backs = document.querySelectorAll('[data-back]');
    for (var i = 0; i < backs.length; i++) {
      backs[i].addEventListener('click', function () {
        Audio.play('click');
        UI.show(this.getAttribute('data-back'));
      });
    }
  }

  function wireModal() {
    var modal = $('confirm-modal');
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('overlay--show');
    });
  }

  // ------------------------------------------------------------------
  // Discreet teacher access: long-press (700ms) or 5 quick taps on the
  // Jo⚡Go logo on the home screen, or press "T" on the home screen.
  // ------------------------------------------------------------------

  function wireTeacherTrigger() {
    var logo = $('brand-logo');
    var timer = null;
    var tapCount = 0;
    var tapTimer = null;
    var fired = false;

    function fire() {
      if (fired) return;
      fired = true;
      UI.renderTeacher();
    }

    function pressStart(e) {
      if (fired) return;
      timer = setTimeout(fire, 700);
    }
    function pressEnd() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    logo.addEventListener('pointerdown', pressStart);
    logo.addEventListener('pointerup', pressEnd);
    logo.addEventListener('pointercancel', pressEnd);
    logo.addEventListener('pointerleave', pressEnd);

    logo.addEventListener('click', function () {
      if (fired) return;
      tapCount++;
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { tapCount = 0; }, 800);
      if (tapCount >= 5) { fire(); tapCount = 0; }
    });

    root.addEventListener('keydown', function (e) {
      if (fired) return;
      var active = document.querySelector('.screen--active');
      if (active && active.id === 'screen-home' && (e.key === 't' || e.key === 'T')) {
        fire();
      }
    });
  }


  function registerServiceWorker() {
    if ('serviceWorker' in root.navigator && root.location.protocol.indexOf('http') === 0) {
      root.navigator.serviceWorker.register('sw.js').catch(function () { /* offline optional */ });
    }
  }
  function boot() {
    Audio.init();
    UI.setSoundIcons();
    wireHome();
    wireHud();
    wireBack();
    wireModal();
    wireTeacherTrigger();
    UI.renderLadder($('home-ladder'));
    UI.renderLadder($('how-ladder'));
    registerServiceWorker();
    UI.show('screen-home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof self !== 'undefined' ? self : this);
