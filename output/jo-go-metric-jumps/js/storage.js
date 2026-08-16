/**
 * storage.js — Jo⚡Go Metric Jumps
 * Local persistence of mastery, streaks, settings and unlocks.
 *
 * No learner data leaves the device. The storage adapter is pluggable so the
 * same logic can be unit-tested in Node with an in-memory store.
 */
(function (root) {
  'use strict';

  var KEY = 'jogo-metric-jumps.v1';

  var CATEGORIES = [
    'conversion_direction',
    'jump_count',
    'guided_comma',
    'independent_conversion',
    'reasonableness_check',
    'mixed_conversion',
    'transfer'
  ];

  var CATEGORY_LABELS = {
    conversion_direction: 'Which operation?',
    jump_count: 'How many jumps?',
    guided_comma: 'Moving the comma',
    independent_conversion: 'Independent conversion',
    reasonableness_check: 'Does it make sense?',
    mixed_conversion: 'Mixed challenge',
    transfer: 'Word problems'
  };

  function defaultState() {
    var cats = {};
    for (var i = 0; i < CATEGORIES.length; i++) {
      cats[CATEGORIES[i]] = { attempts: 0, firstTry: 0, recent: [] };
    }
    return {
      version: 1,
      soundOn: true,
      reducedMotion: false,
      unlocked: 1,            // highest unlocked stage id
      lastStage: 1,           // stage used by "Play"
      categories: cats,
      pairs: {},              // 'km>m': { attempts, firstTry, recent }
      bestStreak: 0,
      sessions: 0,
      totalAnswered: 0,
      totalFirstTry: 0
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function createStore(adapter) {
    function rawLoad() {
      try {
        var s = adapter.getItem(KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    }

    var state = rawLoad() || defaultState();
    // Migrate/repair any missing keys.
    if (!state.version) state.version = 1;
    if (typeof state.soundOn !== 'boolean') state.soundOn = true;
    if (typeof state.reducedMotion !== 'boolean') state.reducedMotion = false;
    if (typeof state.unlocked !== 'number') state.unlocked = 1;
    if (typeof state.lastStage !== 'number') state.lastStage = 1;
    if (typeof state.bestStreak !== 'number') state.bestStreak = 0;
    if (typeof state.sessions !== 'number') state.sessions = 0;
    if (typeof state.totalAnswered !== 'number') state.totalAnswered = 0;
    if (typeof state.totalFirstTry !== 'number') state.totalFirstTry = 0;
    state.categories = state.categories || {};
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      if (!state.categories[c] || typeof state.categories[c].attempts !== 'number') {
        state.categories[c] = { attempts: 0, firstTry: 0, recent: [] };
      }
    }
    state.pairs = state.pairs || {};

    function save() {
      try { adapter.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full / private mode */ }
    }

    function pushRecent(list, ok) {
      list.push(ok ? 1 : 0);
      if (list.length > 10) list.shift();
    }

    function accuracyOf(rec) {
      if (!rec || !rec.attempts) return null;
      return rec.firstTry / rec.attempts;
    }

    function recentAccuracy(rec) {
      if (!rec || !rec.recent || !rec.recent.length) return null;
      var sum = 0;
      for (var i = 0; i < rec.recent.length; i++) sum += rec.recent[i];
      return sum / rec.recent.length;
    }

    /** Record one answered question. ok = first-try correct. */
    function recordAnswer(category, pairKey, ok) {
      state.totalAnswered++;
      if (ok) state.totalFirstTry++;
      var cat = state.categories[category] || (state.categories[category] = { attempts: 0, firstTry: 0, recent: [] });
      cat.attempts++;
      if (ok) cat.firstTry++;
      pushRecent(cat.recent, ok);

      if (pairKey) {
        var pr = state.pairs[pairKey] || (state.pairs[pairKey] = { attempts: 0, firstTry: 0, recent: [] });
        pr.attempts++;
        if (ok) pr.firstTry++;
        pushRecent(pr.recent, ok);
      }
      save();
    }

    function recordStreak(streak) {
      if (streak > state.bestStreak) {
        state.bestStreak = streak;
        save();
      }
    }

    function recordSession() {
      state.sessions++;
      save();
    }

    function unlockUpTo(stageId) {
      if (stageId > state.unlocked) {
        state.unlocked = stageId;
        save();
      }
    }

    function masteryLevel(category) {
      var acc = accuracyOf(state.categories[category]);
      if (acc === null) return 'new';
      if (acc >= 0.8) return 'mastered';
      if (acc >= 0.5) return 'getting-there';
      return 'needs-practice';
    }

    /** Adaptive weights: weak conversions get asked more often. */
    function pairWeights() {
      var w = {};
      for (var key in state.pairs) {
        if (!Object.prototype.hasOwnProperty.call(state.pairs, key)) continue;
        var acc = recentAccuracy(state.pairs[key]);
        if (acc === null) { w[key] = 1; continue; }
        // 0.6 (strong) .. 3.0 (very weak)
        w[key] = 0.6 + (1 - acc) * 2.4;
      }
      return w;
    }

    function reset() {
      state = defaultState();
      save();
    }

    function get() { return clone(state); }

    return {
      get: get,
      save: save,
      reset: reset,
      recordAnswer: recordAnswer,
      recordStreak: recordStreak,
      mutate: function (fn) { fn(state); save(); },
      recordSession: recordSession,
      unlockUpTo: unlockUpTo,
      masteryLevel: masteryLevel,
      pairWeights: pairWeights,
      accuracyOf: accuracyOf,
      recentAccuracy: recentAccuracy,
      categoryLabels: CATEGORY_LABELS,
      categories: CATEGORIES,
      KEY: KEY
    };
  }

  /** Browser adapter backed by localStorage (safe to call before DOM ready). */
  function browserAdapter() {
    try {
      var ls = root.localStorage;
      if (ls) {
        var probe = '__jogo_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
        return {
          getItem: function (k) { return ls.getItem(k); },
          setItem: function (k, v) { ls.setItem(k, v); }
        };
      }
    } catch (e) { /* private mode or denied */ }
    // Fallback: in-memory only
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = v; }
    };
  }

  var singleton = createStore(browserAdapter());

  var Store = {
    createStore: createStore,
    browserAdapter: browserAdapter,
    CATEGORIES: CATEGORIES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    get: singleton.get,
    save: singleton.save,
    reset: singleton.reset,
    recordAnswer: singleton.recordAnswer,
    recordStreak: singleton.recordStreak,
    recordSession: singleton.recordSession,
    unlockUpTo: singleton.unlockUpTo,
    masteryLevel: singleton.masteryLevel,
    pairWeights: singleton.pairWeights,
    accuracyOf: singleton.accuracyOf,
    recentAccuracy: singleton.recentAccuracy,
    setSoundOn: function (on) { singleton.mutate(function (s) { s.soundOn = !!on; }); },
    setReducedMotion: function (on) { singleton.mutate(function (s) { s.reducedMotion = !!on; }); },
    setLastStage: function (id) { singleton.mutate(function (s) { s.lastStage = id; }); }
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Store; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Store = Store;
})(typeof self !== 'undefined' ? self : this);
