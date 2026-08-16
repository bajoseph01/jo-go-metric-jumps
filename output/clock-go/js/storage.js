/**
 * storage.js — Tick⚡Tock (mini-app experiment)
 * Per-learner persistence on a shared classroom device.
 *
 * Lessons inherited from the playbook: every record/read targets a learner
 * *id* (never the "active" learner), every learner gets a distinct name
 * colour with a stable derived fallback for migrated data, and everything
 * is sanitised on load so corrupt state can never crash the app.
 */
(function (root) {
  'use strict';

  var KEY = 'ticktock-v1';
  var PIN = '5241';

  var AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁'];
  var COLORS = ['#2F6BFF', '#FF8A1E', '#0E9CA3', '#E6459B', '#7A4FD0', '#3AA655'];
  var LEVEL_KEYS = ['whole', 'five', 'one'];

  function defaultState() {
    return { learners: [], activeId: null, sound: true };
  }

  /** Stable hash of an id → palette index (never collides on purpose). */
  function deriveColorIndex(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % COLORS.length;
  }

  function emptyRec() {
    return { attempts: 0, firstTry: 0 };
  }

  function sanitize(s) {
    s = s || defaultState();
    var seen = {};
    s.learners = (Array.isArray(s.learners) ? s.learners : []).map(function (l) {
      if (!l || typeof l.id !== 'string' || seen[l.id]) return null;
      seen[l.id] = true;
      var rec = {
        id: l.id,
        name: String(l.name || 'Learner').slice(0, 20) || 'Learner',
        emoji: AVATARS.indexOf(l.emoji) >= 0 ? l.emoji : AVATARS[0],
        color: (typeof l.color === 'string' && l.color.indexOf('#') === 0) ? l.color : COLORS[deriveColorIndex(l.id)]
      };
      rec.progress = {};
      for (var k = 0; k < LEVEL_KEYS.length; k++) {
        var key = LEVEL_KEYS[k];
        var p = (l.progress && l.progress[key]) || {};
        rec.progress[key] = {
          attempts: Math.max(0, Math.floor(p.attempts || 0)),
          firstTry: Math.max(0, Math.floor(p.firstTry || 0))
        };
      }
      rec.introSeen = !!l.introSeen;
      return rec;
    }).filter(Boolean);
    if (typeof s.activeId !== 'string' || !s.learners.some(function (l) { return l.id === s.activeId; })) {
      s.activeId = s.learners.length ? s.learners[0].id : null;
    }
    return s;
  }

  function createStore(mem) {
    var storage = mem || (typeof localStorage !== 'undefined' ? localStorage : null);

    function load() {
      try {
        var raw = storage.getItem(KEY);
        return sanitize(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return sanitize(null);
      }
    }
    function save(s) {
      try { storage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* full disk etc. */ }
    }

    function learners() { return load().learners; }
    function activeLearner() {
      var s = load();
      for (var i = 0; i < s.learners.length; i++) if (s.learners[i].id === s.activeId) return s.learners[i];
      return s.learners[0] || null;
    }
    function setActive(id) {
      var s = load();
      if (s.learners.some(function (l) { return l.id === id; })) { s.activeId = id; save(s); }
    }

    function nextAvatar() {
      var taken = {};
      learners().forEach(function (l) { taken[l.emoji] = true; });
      for (var i = 0; i < AVATARS.length; i++) if (!taken[AVATARS[i]]) return AVATARS[i];
      return AVATARS[0];
    }

    function addLearner(name, emoji, color) {
      var s = load();
      var id = 'l' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      var rec = {
        id: id,
        name: String(name || 'Learner').slice(0, 20) || 'Learner',
        emoji: AVATARS.indexOf(emoji) >= 0 ? emoji : nextAvatar(),
        color: (color && COLORS.indexOf(color) >= 0) ? color : COLORS[deriveColorIndex(id)]
      };
      rec.progress = {};
      for (var k = 0; k < LEVEL_KEYS.length; k++) rec.progress[LEVEL_KEYS[k]] = emptyRec();
      s.learners.push(rec);
      if (!s.activeId) s.activeId = rec.id;
      save(s);
      return rec;
    }

    function removeLearner(id) {
      var s = load();
      s.learners = s.learners.filter(function (l) { return l.id !== id; });
      if (s.activeId === id) s.activeId = s.learners.length ? s.learners[0].id : null;
      save(s);
    }

    function renameLearner(id, name, emoji, color) {
      var s = load();
      for (var i = 0; i < s.learners.length; i++) {
        if (s.learners[i].id === id) {
          var l = s.learners[i];
          if (name !== undefined && String(name).trim()) l.name = String(name).trim().slice(0, 20);
          if (emoji !== undefined && AVATARS.indexOf(emoji) >= 0) l.emoji = emoji;
          if (color !== undefined && COLORS.indexOf(color) >= 0) l.color = color;
          save(s);
          return l;
        }
      }
      return null;
    }

    /** Record an attempt against a specific learner id — never the active one. */
    function record(id, levelKey, firstTry) {
      var s = load();
      var hit = null;
      for (var i = 0; i < s.learners.length; i++) {
        if (s.learners[i].id === id) {
          var p = s.learners[i].progress[levelKey] || emptyRec();
          p.attempts++;
          if (firstTry) p.firstTry++;
          hit = s.learners[i];
          break;
        }
      }
      if (hit) save(s);
      return hit;
    }

    /** A level is unlocked when the previous level is mastered (>=5 first-tries). */
    function unlockedLevels(id) {
      var l = null;
      for (var i = 0; i < learners().length; i++) if (learners()[i].id === id) l = learners()[i];
      var out = { whole: true, five: false, one: false };
      if (l) {
        out.five = l.progress.whole.firstTry >= 5;
        out.one = l.progress.five.firstTry >= 5;
      }
      return out;
    }

    function progressOf(id) {
      for (var i = 0; i < learners().length; i++) if (learners()[i].id === id) return learners()[i].progress;
      return null;
    }

    function sound() {
      var s = load();
      return s.sound !== false;
    }
    function setSound(on) {
      var s = load();
      s.sound = !!on;
      save(s);
    }

    function seenIntro(id) {
      var s = load();
      for (var i = 0; i < s.learners.length; i++) if (s.learners[i].id === id) return s.learners[i].introSeen;
      return false;
    }
    function markIntro(id) {
      var s = load();
      for (var i = 0; i < s.learners.length; i++) {
        if (s.learners[i].id === id) { s.learners[i].introSeen = true; save(s); return true; }
      }
      return false;
    }

    function verifyPin(input) { return String(input) === PIN; }

    function reset() {
      save(defaultState());
    }

    return {
      learners: learners,
      activeLearner: activeLearner,
      setActive: setActive,
      addLearner: addLearner,
      removeLearner: removeLearner,
      renameLearner: renameLearner,
      record: record,
      unlockedLevels: unlockedLevels,
      progressOf: progressOf,
      seenIntro: seenIntro,
      markIntro: markIntro,
      sound: sound,
      setSound: setSound,
      verifyPin: verifyPin,
      reset: reset,
      AVATARS: AVATARS,
      COLORS: COLORS,
      LEVEL_KEYS: LEVEL_KEYS
    };
  }

  var Store = { createStore: createStore, AVATARS: AVATARS, COLORS: COLORS, LEVEL_KEYS: LEVEL_KEYS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Store; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Store = Store;
})(typeof self !== 'undefined' ? self : this);
