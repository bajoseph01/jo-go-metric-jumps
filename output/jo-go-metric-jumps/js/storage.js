/**
 * storage.js — Jo⚡Go Metric Jumps
 * Local persistence of learner profiles, mastery, streaks, settings and unlocks.
 *
 * Device settings (sound, reduced motion) are global. Each learner's progress
 * (unlocks, categories, pairs, streaks, totals) is tracked separately so a
 * shared classroom device keeps every child's data apart.
 *
 * No data leaves the device. The storage adapter is pluggable so the same
 * logic can be unit-tested in Node with an in-memory store.
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

  var AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐢', '🦉'];
  var DEFAULT_NAME = 'Learner 1';

  function freshCategories() {
    var cats = {};
    for (var i = 0; i < CATEGORIES.length; i++) {
      cats[CATEGORIES[i]] = { attempts: 0, firstTry: 0, recent: [] };
    }
    return cats;
  }

  function freshProgress() {
    return {
      unlocked: 1,          // highest unlocked stage id
      lastStage: 1,         // stage used by "Play"
      categories: freshCategories(),
      pairs: {},            // 'km>m': { attempts, firstTry, recent }
      bestStreak: 0,
      sessions: 0,
      totalAnswered: 0,
      totalFirstTry: 0
    };
  }

  function freshDevice() {
    // A brand-new device gets one default learner (unselected) so the game is
    // immediately usable, but the app still prompts for a learner at boot.
    var first = sanitizeLearner({ id: genId(), name: DEFAULT_NAME, emoji: AVATARS[0] });
    return {
      version: 2,
      soundOn: true,
      reducedMotion: false,
      activeLearnerId: null,
      learners: [first]
    };
  }

  function genId() {
    return 'l' + Math.random().toString(36).slice(2, 10);
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function sanitizeLearner(l) {
    if (!l || typeof l !== 'object') l = {};
    var cats = freshCategories();
    var src = (l.categories && typeof l.categories === 'object') ? l.categories : {};
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      var rc = src[c];
      if (rc && typeof rc.attempts === 'number') {
        cats[c] = {
          attempts: rc.attempts,
          firstTry: typeof rc.firstTry === 'number' ? rc.firstTry : 0,
          recent: Array.isArray(rc.recent) ? rc.recent.slice(-10) : []
        };
      }
    }
    return {
      id: typeof l.id === 'string' && l.id ? l.id : genId(),
      name: typeof l.name === 'string' && l.name.trim() ? l.name.trim().slice(0, 18) : DEFAULT_NAME,
      emoji: AVATARS.indexOf(l.emoji) >= 0 ? l.emoji : AVATARS[0],
      unlocked: typeof l.unlocked === 'number' ? Math.min(8, Math.max(1, Math.round(l.unlocked))) : 1,
      lastStage: typeof l.lastStage === 'number' ? Math.min(8, Math.max(1, Math.round(l.lastStage))) : 1,
      categories: cats,
      pairs: (l.pairs && typeof l.pairs === 'object') ? l.pairs : {},
      bestStreak: typeof l.bestStreak === 'number' ? l.bestStreak : 0,
      sessions: typeof l.sessions === 'number' ? l.sessions : 0,
      totalAnswered: typeof l.totalAnswered === 'number' ? l.totalAnswered : 0,
      totalFirstTry: typeof l.totalFirstTry === 'number' ? l.totalFirstTry : 0
    };
  }

  /**
   * Migrate raw persisted data into the v2 device shape. v1 (a single flat
   * state object) is wrapped into one default learner so existing progress
   * is not lost.
   */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return freshDevice();
    var dev = {
      version: 2,
      soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : true,
      reducedMotion: !!raw.reducedMotion,
      activeLearnerId: null,
      learners: []
    };
    if (Array.isArray(raw.learners) && raw.learners.length) {
      dev.activeLearnerId = typeof raw.activeLearnerId === 'string' ? raw.activeLearnerId : null;
      dev.learners = raw.learners.map(sanitizeLearner);
    } else if (raw.categories) {
      // v1 flat shape → single default learner carrying the old progress
      var first = sanitizeLearner({
        id: genId(),
        name: DEFAULT_NAME,
        emoji: AVATARS[0],
        unlocked: raw.unlocked,
        lastStage: raw.lastStage,
        categories: raw.categories,
        pairs: raw.pairs,
        bestStreak: raw.bestStreak,
        sessions: raw.sessions,
        totalAnswered: raw.totalAnswered,
        totalFirstTry: raw.totalFirstTry
      });
      dev.learners = [first];
      dev.activeLearnerId = first.id;
    } else {
      return freshDevice();
    }
    return dev;
  }

  function createStore(adapter) {
    function rawLoad() {
      try {
        var s = adapter.getItem(KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    }

    var device = migrate(rawLoad());
    // Persist the migrated shape immediately so a v1 payload is not re-read.
    save();

    function save() {
      try { adapter.setItem(KEY, JSON.stringify(device)); } catch (e) { /* storage full / private mode */ }
    }

    function learnerById(id) {
      for (var i = 0; i < device.learners.length; i++) {
        if (device.learners[i].id === id) return device.learners[i];
      }
      return null;
    }

    /**
     * The active learner. When `lazy` is true (progress reads/writes) the
     * first learner is activated automatically so a fresh store behaves like
     * a single-user app until a profile is explicitly chosen.
     */
    function active(lazy) {
      var l = learnerById(device.activeLearnerId);
      if (!l && lazy && device.learners.length) {
        l = device.learners[0];
        device.activeLearnerId = l.id;
        save();
      }
      return l;
    }

    function learnerSummary(l) {
      return { id: l.id, name: l.name, emoji: l.emoji, unlocked: l.unlocked, totalAnswered: l.totalAnswered };
    }

    function progressOfLearner(l) {
      return {
        unlocked: l.unlocked,
        lastStage: l.lastStage,
        categories: l.categories,
        pairs: l.pairs,
        bestStreak: l.bestStreak,
        sessions: l.sessions,
        totalAnswered: l.totalAnswered,
        totalFirstTry: l.totalFirstTry
      };
    }

    /** Merged view: device settings + active learner's progress. */
    function get() {
      var view = { version: device.version, soundOn: device.soundOn, reducedMotion: device.reducedMotion };
      var l = active(true);
      if (l) {
        var p = progressOfLearner(l);
        for (var k in p) view[k] = p[k];
        view.activeLearner = { id: l.id, name: l.name, emoji: l.emoji };
      } else {
        var d = freshProgress();
        for (var k2 in d) view[k2] = d[k2];
      }
      return view;
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

    function mutateLearner(fn) {
      var l = active(true);
      if (!l) return;
      fn(l);
      save();
    }

    /** Record one answered question. ok = first-try correct. */
    function recordAnswer(category, pairKey, ok) {
      mutateLearner(function (l) {
        l.totalAnswered++;
        if (ok) l.totalFirstTry++;
        var cat = l.categories[category] || (l.categories[category] = { attempts: 0, firstTry: 0, recent: [] });
        cat.attempts++;
        if (ok) cat.firstTry++;
        pushRecent(cat.recent, ok);

        if (pairKey) {
          var pr = l.pairs[pairKey] || (l.pairs[pairKey] = { attempts: 0, firstTry: 0, recent: [] });
          pr.attempts++;
          if (ok) pr.firstTry++;
          pushRecent(pr.recent, ok);
        }
      });
    }

    function recordStreak(streak) {
      mutateLearner(function (l) {
        if (streak > l.bestStreak) l.bestStreak = streak;
      });
    }

    function recordSession() {
      mutateLearner(function (l) { l.sessions++; });
    }

    function unlockUpTo(stageId) {
      mutateLearner(function (l) {
        if (stageId > l.unlocked) l.unlocked = stageId;
      });
    }

    function setLastStage(id) {
      mutateLearner(function (l) { l.lastStage = id; });
    }

    function reset() {
      // Resets the ACTIVE learner's progress; the profile itself stays.
      mutateLearner(function (l) {
        var p = freshProgress();
        for (var k in p) l[k] = p[k];
      });
    }

    function masteryLevel(category) {
      var l = active(true);
      if (!l) return 'new';
      var acc = accuracyOf(l.categories[category]);
      if (acc === null) return 'new';
      if (acc >= 0.8) return 'mastered';
      if (acc >= 0.5) return 'getting-there';
      return 'needs-practice';
    }

    /** Adaptive weights: weak conversions get asked more often. */
    function pairWeights() {
      var w = {};
      var l = active(true);
      if (!l) return w;
      for (var key in l.pairs) {
        if (!Object.prototype.hasOwnProperty.call(l.pairs, key)) continue;
        var acc = recentAccuracy(l.pairs[key]);
        if (acc === null) { w[key] = 1; continue; }
        // 0.6 (strong) .. 3.0 (very weak)
        w[key] = 0.6 + (1 - acc) * 2.4;
      }
      return w;
    }

    function setSoundOn(on) { device.soundOn = !!on; save(); }
    function setReducedMotion(on) { device.reducedMotion = !!on; save(); }

    /** Device settings only — never lazily activates a learner. */
    function settings() {
      return { soundOn: device.soundOn, reducedMotion: device.reducedMotion };
    }

    // ------------------------------------------------------------------
    // Learner roster API
    // ------------------------------------------------------------------

    function learners() { return device.learners.map(learnerSummary); }

    /** Currently selected learner, or null (never auto-activates). */
    function activeLearner() {
      var l = learnerById(device.activeLearnerId);
      return l ? learnerSummary(l) : null;
    }

    function setActiveLearner(id) {
      if (learnerById(id)) {
        device.activeLearnerId = id;
        save();
      }
    }

    function addLearner(name, emoji) {
      var learner = sanitizeLearner({ id: genId(), name: name, emoji: emoji });
      device.learners.push(learner);
      device.activeLearnerId = learner.id;
      save();
      return learnerSummary(learner);
    }

    function removeLearner(id) {
      var idx = -1;
      for (var i = 0; i < device.learners.length; i++) {
        if (device.learners[i].id === id) { idx = i; break; }
      }
      if (idx < 0) return false;
      device.learners.splice(idx, 1);
      if (device.activeLearnerId === id) {
        device.activeLearnerId = device.learners.length ? device.learners[0].id : null;
      }
      save();
      return true;
    }

    /** Rename / re-avatar a learner; progress is untouched. */
    function renameLearner(id, name, emoji) {
      var l = learnerById(id);
      if (!l) return false;
      if (typeof name === 'string' && name.trim()) l.name = name.trim().slice(0, 18);
      if (AVATARS.indexOf(emoji) >= 0) l.emoji = emoji;
      save();
      return true;
    }

    /** Full progress of a specific learner (for reports). */
    function progressOf(id) {
      var l = learnerById(id);
      if (!l) return null;
      return progressOfLearner(l);
    }

    return {
      get: get,
      save: save,
      reset: reset,
      recordAnswer: recordAnswer,
      recordStreak: recordStreak,
      recordSession: recordSession,
      unlockUpTo: unlockUpTo,
      setLastStage: setLastStage,
      setSoundOn: setSoundOn,
      setReducedMotion: setReducedMotion,
      settings: settings,
      masteryLevel: masteryLevel,
      pairWeights: pairWeights,
      accuracyOf: accuracyOf,
      recentAccuracy: recentAccuracy,
      mutate: function (fn) { fn(device); save(); },
      learners: learners,
      activeLearner: activeLearner,
      setActiveLearner: setActiveLearner,
      addLearner: addLearner,
      removeLearner: removeLearner,
      renameLearner: renameLearner,
      progressOf: progressOf,
      AVATARS: AVATARS,
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
    AVATARS: AVATARS,
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
    setSoundOn: singleton.setSoundOn,
    setReducedMotion: singleton.setReducedMotion,
    setLastStage: singleton.setLastStage,
    settings: singleton.settings,
    learners: singleton.learners,
    activeLearner: singleton.activeLearner,
    setActiveLearner: singleton.setActiveLearner,
    addLearner: singleton.addLearner,
    removeLearner: singleton.removeLearner,
    renameLearner: singleton.renameLearner,
    progressOf: singleton.progressOf
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Store; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Store = Store;
})(typeof self !== 'undefined' ? self : this);
