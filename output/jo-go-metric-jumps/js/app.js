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

  /** Pick who's playing first — never silently default to Learner 1. */
  function requireLearner() {
    if (Store.activeLearner()) return true;
    UI.renderLearners();
    return false;
  }

  function wireHome() {
    $('btn-play').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      if (!requireLearner()) return;
      UI.updateLearnerChip();
      var st = Store.get();
      var stage = Math.min(st.unlocked, 8);
      Game.startStage(stage);
    });

    $('btn-practice').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      if (!requireLearner()) return;
      UI.updateLearnerChip();
      UI.renderPractice();
    });

    $('btn-progress').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      if (!requireLearner()) return;
      UI.updateLearnerChip();
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

    $('btn-learner').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      UI.renderLearners();
    });

    var printBtn = $('btn-report-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        Audio.play('click');
        root.print();
      });
    }

    var reportPdfBtn = $('btn-report-pdf');
    if (reportPdfBtn) {
      reportPdfBtn.addEventListener('click', function () {
        Audio.play('click');
        UI.exportReportPdf();
      });
    }

    var wsPrintBtn = $('btn-ws-print');
    if (wsPrintBtn) {
      wsPrintBtn.addEventListener('click', function () {
        Audio.play('click');
        root.print();
      });
    }

    var wsPdfBtn = $('btn-ws-pdf');
    if (wsPdfBtn) {
      wsPdfBtn.addEventListener('click', function () {
        Audio.play('click');
        UI.exportWorksheetPdf();
      });
    }

    var scalesBtn = $('btn-scales');
    if (scalesBtn) {
      scalesBtn.addEventListener('click', function () {
        Audio.unlock();
        Audio.play('click');
        if (!requireLearner()) return;
        UI.renderScales();
      });
    }
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
    $('btn-learner-hud').addEventListener('click', function () {
      Audio.unlock();
      Audio.play('click');
      Game.quit();
      UI.renderLearners();
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

  var teacherFired = false;

  function wireTeacherTrigger() {
    var logo = $('brand-logo');
    var timer = null;
    var tapCount = 0;
    var tapTimer = null;

    function fire() {
      if (!Teacher.unlocked && teacherFired) return; // locked: one prompt attempt
      teacherFired = true;
      Teacher.open();
    }

    function pressStart() {
      if (!Teacher.unlocked && teacherFired) return;
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
      if (!Teacher.unlocked && teacherFired) return;
      tapCount++;
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { tapCount = 0; }, 800);
      if (tapCount >= 5) { fire(); tapCount = 0; }
    });

    root.addEventListener('keydown', function (e) {
      if (!Teacher.unlocked && teacherFired) return;
      var active = document.querySelector('.screen--active');
      if (active && active.id === 'screen-home' && (e.key === 't' || e.key === 'T')) {
        fire();
      }
    });
  }


  // ------------------------------------------------------------------
  // Teacher mode: PIN-gated access to the teacher panel and to practice of
  // every level (locked ones included). The PIN is a light classroom lock,
  // not real security — it lives in client-side code only.
  // ------------------------------------------------------------------

  var Teacher = {
    PIN: '5241',
    unlocked: false,
    open: function () {
      if (Teacher.unlocked) { UI.renderTeacher(); return; }
      UI.showPin(Teacher.PIN, function () {
        Teacher.unlocked = true;
        UI.renderTeacher();
      });
    },
    lock: function () {
      Teacher.unlocked = false;
      teacherFired = false;   // re-arm the logo/tap/T triggers
    }
  };
  root.JOGO = root.JOGO || {};
  root.JOGO.Teacher = Teacher;

  function registerServiceWorker() {
    if ('serviceWorker' in root.navigator && root.location.protocol.indexOf('http') === 0) {
      root.navigator.serviceWorker.register('sw.js').catch(function () { /* offline optional */ });
    }
  }
  function boot() {
    // Check BEFORE anything calls Store.get() (which lazily activates a
    // default learner) so a fresh device routes to the learner picker.
    var firstLaunch = !Store.activeLearner();
    Audio.init();
    UI.setSoundIcons();
    wireHome();
    wireHud();
    wireBack();
    wireModal();
    wireTeacherTrigger();
    UI.renderHomeLadders();
    UI.renderLadder($('how-ladder'));
    UI.renderDimensionPills();
    registerServiceWorker();
    UI.updateLearnerChip();
    if (firstLaunch) {
      UI.renderLearners();  // first launch: pick who's playing
    } else {
      UI.show('screen-home');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof self !== 'undefined' ? self : this);
