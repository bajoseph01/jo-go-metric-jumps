/**
 * audio.js — Jo⚡Go Metric Master
 * Tiny WebAudio synth for subtle feedback sounds. No external files.
 * Sound is optional: everything works fully muted. Preference persists.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = true; // until the first user gesture unlocks audio

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
  }

  function tone(freq, start, dur, type, vol) {
    if (!ctx || !master) return;
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      var t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  var SOUNDS = {
    click: function () { tone(520, 0, 0.06, 'triangle', 0.25); },
    jump:  function () { tone(720, 0, 0.07, 'triangle', 0.4); tone(960, 0.05, 0.07, 'triangle', 0.25); },
    pop:   function () { tone(880, 0, 0.08, 'sine', 0.4); },
    correct: function () {
      tone(523.25, 0, 0.12, 'triangle', 0.5);
      tone(659.25, 0.09, 0.12, 'triangle', 0.5);
      tone(783.99, 0.18, 0.2, 'triangle', 0.45);
    },
    wrong: function () { tone(196, 0, 0.18, 'sine', 0.35); tone(155, 0.05, 0.22, 'sine', 0.3); },
    complete: function () {
      tone(523.25, 0, 0.12, 'triangle', 0.5);
      tone(659.25, 0.1, 0.12, 'triangle', 0.5);
      tone(783.99, 0.2, 0.12, 'triangle', 0.5);
      tone(1046.5, 0.3, 0.3, 'triangle', 0.5);
    },
    unlock: function () {
      tone(659.25, 0, 0.1, 'triangle', 0.45);
      tone(880, 0.09, 0.1, 'triangle', 0.45);
      tone(1174.66, 0.18, 0.25, 'triangle', 0.45);
    }
  };

  function play(name) {
    if (muted) return;
    ensure();
    var fn = SOUNDS[name];
    if (fn) fn();
  }

  /** Call on the first user gesture to unlock the AudioContext. */
  function unlock() { ensure(); }

  function init() {
    // settings() avoids lazily activating a learner on a fresh device
    var store = root.JOGO && root.JOGO.Store;
    var st = store ? (store.settings ? store.settings() : store.get()) : null;
    muted = !(st && st.soundOn);
  }

  function setMuted(b) {
    muted = !!b;
    if (!muted) ensure();
  }

  function isMuted() { return muted; }

  var Audio = {
    init: init,
    play: play,
    setMuted: setMuted,
    isMuted: isMuted,
    unlock: unlock
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Audio; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Audio = Audio;
})(typeof self !== 'undefined' ? self : this);
