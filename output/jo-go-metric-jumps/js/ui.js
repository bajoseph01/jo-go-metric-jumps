/**
 * ui.js — Jo⚡Go Metric Jumps
 * Screen routing and rendering. All dynamic content is rendered here;
 * game logic lives in game.js. Uses semantic buttons everywhere.
 */
(function (root) {
  'use strict';

  var M = root.JOGO.Math;
  var F = root.JOGO.Fmt;
  var Q = root.JOGO.Q;
  var Store = root.JOGO.Store;
  var Audio = root.JOGO.Audio;
  var Input = root.JOGO.Input;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------------
  // Screen routing
  // ------------------------------------------------------------------

  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('screen--active', screens[i].id === name);
    }
    document.body.scrollTop = 0;
    var el = $(name);
    if (el) el.scrollTop = 0;
  }

  // ------------------------------------------------------------------
  // Ladder widget
  // ------------------------------------------------------------------

  var RUNG_ORDER = ['km', 'm', 'cm', 'mm'];
  var GAP_LABELS = { 'km>m': '×1000', 'm>cm': '×100', 'cm>mm': '×10' };

  /**
   * Render the unit ladder. If from/to given, highlight that conversion.
   */
  function renderLadder(container, from, to) {
    if (!container) return;
    var html = '<div class="ladder">';
    for (var i = 0; i < RUNG_ORDER.length; i++) {
      var unit = RUNG_ORDER[i];
      html += '<div class="rung' + (unit === from ? ' rung--active' : '') + '" data-unit="' + unit + '">' + unit + '</div>';
      if (i < RUNG_ORDER.length - 1) {
        var gapKey = RUNG_ORDER[i] + '>' + RUNG_ORDER[i + 1];
        var active = (from === RUNG_ORDER[i] && to === RUNG_ORDER[i + 1]) ||
                     (from === RUNG_ORDER[i + 1] && to === RUNG_ORDER[i]);
        html += '<div class="ladder-gap' + (active ? ' ladder-gap--active' : '') + '" data-gap="' + gapKey + '">' +
          '<span class="ladder-gap-f">' + GAP_LABELS[gapKey] + '</span>' +
          '<span class="ladder-gap-arrow" aria-hidden="true">' +
            (active && from === RUNG_ORDER[i + 1] ? '↑' : (active ? '↓' : '')) +
          '</span></div>';
      }
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------

  function soundIcon() {
    // settings() avoids lazily activating a learner on a fresh device
    var s = (Store.settings ? Store.settings() : Store.get());
    return s.soundOn ? '🔊' : '🔇';
  }

  function setSoundIcons() {
    var els = document.querySelectorAll('[data-role="sound-icon"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = soundIcon();
  }

  function renderGameHUD(session) {
    var stageEl = $('hud-stage');
    if (stageEl) stageEl.textContent = 'Stage ' + session.stageId + ' · ' + session.stage.name;
    var dots = '';
    for (var i = 0; i < session.target; i++) {
      dots += '<span class="prog-dot' + (i < session.done ? ' prog-dot--done' : '') + '"></span>';
    }
    var prog = $('hud-progress');
    if (prog) prog.innerHTML = dots;
    var streak = $('hud-streak');
    if (streak) {
      streak.textContent = '🔥 ' + session.streak;
      streak.classList.toggle('streak--hot', session.streak >= 3);
    }
    setSoundIcons();
  }

  // ------------------------------------------------------------------
  // Feedback
  // ------------------------------------------------------------------

  function clearFeedback() {
    var fb = $('feedback');
    if (fb) { fb.textContent = ''; fb.className = 'feedback'; }
    var rl = $('result-line');
    if (rl) { rl.textContent = ''; rl.className = 'result-line'; }
  }

  function showFeedback(text, ok) {
    var fb = $('feedback');
    if (!fb) return;
    fb.textContent = text;
    fb.className = 'feedback ' + (ok ? 'feedback--ok' : 'feedback--warn');
    fb.setAttribute('role', 'status');
  }

  function showPraise(text, ok) {
    showFeedback(text, ok);
  }

  // ------------------------------------------------------------------
  // Equation card
  // ------------------------------------------------------------------

  function equationHTML(q, blankLabel) {
    var from = q.sourceSA !== undefined ? q.sourceSA + ' ' + q.from : q.from;
    return '<div class="equation">' +
      '<span class="eq-source">' + esc(from) + '</span>' +
      '<span class="eq-op">=</span>' +
      '<span class="eq-blank">' + esc(blankLabel || '___ ' + q.to) + '</span>' +
    '</div>';
  }

  function ruleChip(q) {
    return '<div class="rule-chip">× = RIGHT &nbsp;·&nbsp; ÷ = LEFT &nbsp;·&nbsp; ZEROES = JUMPS</div>';
  }

  function questionShell(session, inner, opts) {
    opts = opts || {};
    var html = '<div class="card question-card">';
    if (session.stage.rule && opts.rule !== false && session.q && session.q.kind !== 'sanity') {
      html += ruleChip(session.q);
    }
    html += inner;
    if (session.stage.ladder && session.q && session.q.from) {
      html += '<div class="ladder-wrap" data-role="ladder"></div>';
    }
    html += '</div>';
    $('gameBody').innerHTML = html;
    if (session.stage.ladder && session.q && session.q.from) {
      var lc = $('gameBody').querySelector('[data-role="ladder"]');
      renderLadder(lc, session.q.from, session.q.to);
    }
  }

  // ------------------------------------------------------------------
  // Question renderers
  // ------------------------------------------------------------------

  function renderOpChoice(session) {
    var q = session.q;
    var full = session.stage.ops === 6;
    var inner = '<h2 class="question-prompt">' + esc(q.from + ' → ' + q.to) + '</h2>' +
      '<p class="question-ask">Which operation turns ' + esc(q.from) + ' into ' + esc(q.to) + '?</p>' +
      '<div class="option-grid option-grid--ops">';
    var labels = full
      ? ['×10', '×100', '×1000', '÷10', '÷100', '÷1000']
      : q.options;
    for (var i = 0; i < labels.length; i++) {
      inner += '<button type="button" class="btn btn--op" data-value="' + esc(labels[i]) + '">' + esc(labels[i]) + '</button>';
    }
    inner += '</div>';
    questionShell(session, inner);
    var btns = $('gameBody').querySelectorAll('.btn--op');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        Audio.play('click');
        root.JOGO.Game.handleOpChoice(this.getAttribute('data-value'));
      });
    }
  }

  function renderJumpsChoice(session) {
    var q = session.q;
    var inner = '<h2 class="question-prompt">' + esc(q.opLabel + ' · ' + q.from + ' → ' + q.to) + '</h2>' +
      '<p class="question-ask">How many jumps does the comma make?</p>' +
      '<div class="option-grid option-grid--jumps">' +
        '<button type="button" class="btn btn--jump" data-value="1">1 jump</button>' +
        '<button type="button" class="btn btn--jump" data-value="2">2 jumps</button>' +
        '<button type="button" class="btn btn--jump" data-value="3">3 jumps</button>' +
      '</div>';
    questionShell(session, inner);
    var btns = $('gameBody').querySelectorAll('.btn--jump');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        Audio.play('click');
        root.JOGO.Game.handleJumpsChoice(Number(this.getAttribute('data-value')));
      });
    }
  }

  function renderPipeline(session) {
    var q = session.q;
    if (!session.sub || session.sub === 'op') {
      renderOpChoice(session);
      return;
    }
    if (session.sub === 'jumps') {
      renderJumpsChoice(session);
      return;
    }
    // drag step
    if (!q.track) q.track = M.buildTrack(q.source.scaled, q.source.scale, q.conv);
    var inner = equationHTML(q, '___ ' + q.to) +
      '<div class="track-host" data-role="track"></div>' +
      '<p class="step-hint">Step 3 · Move the comma with your finger, mouse or pencil.</p>';
    questionShell(session, inner, { rule: false });
    var host = $('gameBody').querySelector('[data-role="track"]');
    var ctl = Input.createTrack(host, q.track, {
      markers: session.stage.markers,
      onSettle: function (gap, ok) { root.JOGO.Game.handleDragSettle(gap, ok); }
    });
    session.trackCtl = ctl;
    // focus for keyboard users (not on touch)
    if (!('ontouchstart' in root)) ctl.focus();
  }

  function renderInput(session, opts) {
    opts = opts || {};
    var q = session.q;
    var inner = '';
    if (opts.transfer) {
      inner += '<h2 class="question-prompt question-prompt--text">' + esc(q.text) + '</h2>' +
        '<p class="question-ask">Answer in ' + esc(q.to) + ':</p>';
    } else if (session.sub === 'fix') {
      inner += equationHTML(q) +
        '<p class="question-ask">What is the correct answer?</p>';
    } else {
      inner += equationHTML(q) +
        '<p class="question-ask">Type the answer in ' + esc(q.to) + ':</p>';
    }
    inner += '<div class="keypad-host" data-role="keypad"></div>';
    questionShell(session, inner, { rule: false });
    var host = $('gameBody').querySelector('[data-role="keypad"]');
    var ctl = Input.createKeypad(host, {
      onSubmit: function (value) {
        if (session.sub === 'fix') root.JOGO.Game.handleFixAnswer(value);
        else root.JOGO.Game.handleAnswer(value);
      }
    });
    session.keypad = ctl;
    if (!('ontouchstart' in root)) setTimeout(function () { ctl.focus(); }, 50);
  }

  function renderJudge(session) {
    var q = session.q;
    var inner = '<h2 class="question-prompt">Does this make sense?</h2>' +
      '<div class="equation equation--judge">' +
        '<span class="eq-source">' + esc(q.sourceSA + ' ' + q.from) + '</span>' +
        '<span class="eq-op">=</span>' +
        '<span class="eq-blank">' + esc(q.shownSA + ' ' + q.to) + '</span>' +
      '</div>' +
      '<div class="option-grid option-grid--judge">' +
        '<button type="button" class="btn btn--judge btn--judge-ok" data-value="ok">✓ Makes sense</button>' +
        '<button type="button" class="btn btn--judge btn--judge-bad" data-value="wrong">✗ Something is wrong</button>' +
      '</div>';
    questionShell(session, inner, { rule: false });
    var btns = $('gameBody').querySelectorAll('.btn--judge');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        Audio.play('click');
        root.JOGO.Game.handleJudge(this.getAttribute('data-value'));
      });
    }
  }

  /**
   * Main dispatch — render the current question.
   */
  function renderQuestion(session) {
    var q = session.q;
    if (!q) return;
    if (session.keypad) { session.keypad = null; }
    if (session.trackCtl) { session.trackCtl = null; }

    if (q.kind === 'op') { renderOpChoice(session); return; }
    if (q.kind === 'jumps') { renderJumpsChoice(session); return; }
    if (q.kind === 'pipeline') { renderPipeline(session); return; }
    if (q.kind === 'transfer') { renderInput(session, { transfer: true }); return; }
    if (q.kind === 'sanity') {
      if (session.sub === 'fix') renderInput(session, {});
      else renderJudge(session);
      return;
    }
    renderInput(session, {});
  }

  // ------------------------------------------------------------------
  // Result + comma feedback animation
  // ------------------------------------------------------------------

  function showResultLine(q, firstTryOk) {
    var rl = $('result-line');
    if (!rl) return;
    var eq = q.sourceSA + ' ' + q.from + ' ' + q.conv.opLabel + ' = ' + q.expectedSA + ' ' + q.to;
    rl.textContent = eq;
    rl.className = 'result-line result-line--show';
    var fb = $('feedback');
    if (fb) {
      fb.textContent = firstTryOk
        ? (q.kind === 'sanity'
            ? (q.correct ? 'Yes! The unit changed, not the length.' : 'You caught it — that was wrong!')
            : 'Correct!')
        : 'Good work — you got there!';
      fb.className = 'feedback feedback--ok';
    }
  }

  /**
   * Stage 5 feedback: animate the comma, then reveal the equation.
   */
  function playCommaFeedback(q, done) {
    var html = '<div class="card question-card">' +
      equationHTML(q, '___ ' + q.to) +
      '<div class="track-host" data-role="track"></div>' +
      '</div>';
    $('gameBody').innerHTML = html;
    var host = $('gameBody').querySelector('[data-role="track"]');
    if (!q.track) q.track = M.buildTrack(q.source.scaled, q.source.scale, q.conv);
    Input.animateTrack(host, q.track, function () {
      showResultLine(q, true);
      setTimeout(function () { if (done) done(); }, 900);
    });
  }

  // ------------------------------------------------------------------
  // Done screen
  // ------------------------------------------------------------------

  function starsFor(accuracy) {
    var n = accuracy >= 80 ? 3 : (accuracy >= 50 ? 2 : 1);
    var s = '';
    for (var i = 0; i < 3; i++) {
      s += '<span class="star' + (i < n ? ' star--on' : '') + '" aria-hidden="true">★</span>';
    }
    return s;
  }

  function showDone(payload) {
    show('screen-done');
    var body = $('done-body');
    body.innerHTML =
      '<div class="done-card card">' +
        '<div class="done-stars">' + starsFor(payload.accuracy) + '</div>' +
        '<h2 class="done-title">Stage complete!</h2>' +
        '<p class="done-sub">' + esc(payload.stageName) + '</p>' +
        '<div class="done-stats">' +
          '<div class="stat"><span class="stat-num">' + payload.accuracy + '%</span><span class="stat-label">first-try accuracy</span></div>' +
          '<div class="stat"><span class="stat-num">🔥 ' + payload.bestStreak + '</span><span class="stat-label">best streak</span></div>' +
        '</div>' +
        (payload.unlockedNext
          ? '<p class="done-note">New stage unlocked! ⚡</p>'
          : '<p class="done-note">You have mastered every stage. Well done! 🏆</p>') +
        '<div class="done-actions">' +
          (payload.unlockedNext
            ? '<button type="button" class="btn btn--primary" data-action="next">Next stage</button>'
            : '<button type="button" class="btn btn--primary" data-action="replay">Play again</button>') +
          '<button type="button" class="btn btn--ghost" data-action="practice">Practice</button>' +
          '<button type="button" class="btn btn--ghost" data-action="home">Home</button>' +
        '</div>' +
      '</div>';
    var buttons = body.querySelectorAll('button[data-action]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        Audio.play('click');
        var a = this.getAttribute('data-action');
        if (a === 'next') root.JOGO.Game.startStage(payload.stageId + 1);
        else if (a === 'replay') root.JOGO.Game.startStage(payload.stageId);
        else if (a === 'practice') show('screen-practice');
        else show('screen-home');
      });
    }
  }

  // ------------------------------------------------------------------
  // Practice screen
  // ------------------------------------------------------------------

  function renderPractice(all) {
    show('screen-practice');
    $('practice-title').textContent = all ? 'Teacher Practice' : 'Practice';
    var body = $('practice-body');
    var st = Store.get();
    var html = all
      ? '<p class="practice-note">All levels are unlocked for teacher practice.</p>'
      : '';
    html += '<div class="stage-list">';
    for (var i = 0; i < Q.STAGES.length; i++) {
      var stage = Q.STAGES[i];
      var locked = !all && stage.id > st.unlocked;
      var cat = st.categories[stage.category];
      var acc = cat && cat.attempts ? Math.round((cat.firstTry / cat.attempts) * 100) : null;
      var status = locked ? 'Locked'
        : (acc === null ? 'New' : (acc >= 80 ? 'Mastered' : 'In progress'));
      html += '<div class="stage-card' + (locked ? ' stage-card--locked' : '') + '">' +
        '<div class="stage-num">' + stage.id + '</div>' +
        '<div class="stage-info">' +
          '<h3 class="stage-name">' + esc(stage.name) + '</h3>' +
          '<p class="stage-status">' + status + (acc !== null ? ' · ' + acc + '%' : '') + '</p>' +
        '</div>' +
        (locked
          ? '<span class="stage-lock" aria-hidden="true">🔒</span>'
          : '<button type="button" class="btn btn--small" data-stage="' + stage.id + '">Play</button>') +
      '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    var buttons = body.querySelectorAll('button[data-stage]');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener('click', function () {
        Audio.play('click');
        root.JOGO.Game.startStage(Number(this.getAttribute('data-stage')));
      });
    }
  }

  // ------------------------------------------------------------------
  // Progress screen
  // ------------------------------------------------------------------

  function masteryBar(attempts, firstTry) {
    var pct = attempts ? Math.round((firstTry / attempts) * 100) : 0;
    return '<div class="mbar"><div class="mbar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="mbar-label">' + pct + '%</span>';
  }

  function renderProgress() {
    show('screen-progress');
    var body = $('progress-body');
    var st = Store.get();
    var html = '<div class="card">' +
      '<h2 class="panel-title">My Progress</h2>' +
      '<div class="mastery-list">';
    for (var i = 0; i < Store.CATEGORIES.length; i++) {
      var cat = Store.CATEGORIES[i];
      var rec = st.categories[cat];
      html += '<div class="mastery-row">' +
        '<span class="mastery-name">' + esc(Store.CATEGORY_LABELS[cat]) + '</span>' +
        masteryBar(rec.attempts, rec.firstTry) +
        '<span class="mastery-count">' + rec.attempts + ' tries</span>' +
      '</div>';
    }
    html += '</div></div>';

    // weak conversions
    var weak = [];
    for (var key in st.pairs) {
      if (!Object.prototype.hasOwnProperty.call(st.pairs, key)) continue;
      var pr = st.pairs[key];
      var acc = pr.attempts ? pr.firstTry / pr.attempts : 1;
      if (acc < 0.7) weak.push({ key: key, acc: Math.round(acc * 100) });
    }
    weak.sort(function (a, b) { return a.acc - b.acc; });
    html += '<div class="card"><h2 class="panel-title">Needs Practice</h2>';
    if (!weak.length) {
      html += '<p class="panel-empty">No weak conversions — nice work! ⚡</p>';
    } else {
      html += '<ul class="weak-list">';
      for (var w = 0; w < weak.length && w < 6; w++) {
        var parts = weak[w].key.split('>');
        html += '<li><span class="weak-conv">' + esc(parts[0] + ' → ' + parts[1]) + '</span>' +
          '<span class="weak-pct">' + weak[w].acc + '%</span></li>';
      }
      html += '</ul>';
    }
    html += '</div>';

    html += '<div class="card stats-card">' +
      '<h2 class="panel-title">Overall</h2>' +
      '<div class="overall-grid">' +
        '<div class="stat"><span class="stat-num">' + st.totalAnswered + '</span><span class="stat-label">questions answered</span></div>' +
        '<div class="stat"><span class="stat-num">' + st.sessions + '</span><span class="stat-label">sessions</span></div>' +
        '<div class="stat"><span class="stat-num">🔥 ' + st.bestStreak + '</span><span class="stat-label">best streak</span></div>' +
      '</div>' +
      '<button type="button" class="btn btn--danger" data-action="reset">Reset my progress</button>' +
    '</div>';
    body.innerHTML = html;

    var resetBtn = body.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        showModal('Reset all progress?', 'This clears your mastery and unlocks on this device.', function () {
          Store.reset();
          renderProgress();
        });
      });
    }
  }

  // ------------------------------------------------------------------
  // Teacher panel
  // ------------------------------------------------------------------

  function renderTeacher() {
    var panel = $('teacher-panel');
    var st = Store.get();
    var html = '<div class="teacher-head"><h2>Teacher Panel</h2>' +
      '<button type="button" class="btn-icon" data-action="close" aria-label="Close">✕</button></div>' +
      '<p class="teacher-note">Local classroom helper — no accounts, no data leaves this device.</p>' +
      '<div class="teacher-section"><h3>Mastery by category</h3><table class="tbl">' +
      '<thead><tr><th>Category</th><th>Tries</th><th>First-try</th><th>Recent</th><th>Status</th></tr></thead><tbody>';
    for (var i = 0; i < Store.CATEGORIES.length; i++) {
      var cat = Store.CATEGORIES[i];
      var rec = st.categories[cat];
      var acc = rec.attempts ? Math.round((rec.firstTry / rec.attempts) * 100) : 0;
      var recent = rec.recent.length ? Math.round(Store.recentAccuracy(rec) * 100) : null;
      html += '<tr><td>' + esc(Store.CATEGORY_LABELS[cat]) + '</td><td>' + rec.attempts + '</td>' +
        '<td>' + acc + '%</td><td>' + (recent === null ? '—' : recent + '%') + '</td>' +
        '<td>' + esc(Store.masteryLevel(cat)) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    var pairKeys = Object.keys(st.pairs).sort();
    if (pairKeys.length) {
      html += '<div class="teacher-section"><h3>Conversion pairs</h3><table class="tbl">' +
        '<thead><tr><th>Conversion</th><th>Tries</th><th>First-try</th><th>Recent</th></tr></thead><tbody>';
      for (var p = 0; p < pairKeys.length; p++) {
        var pr = st.pairs[pairKeys[p]];
        var parts = pairKeys[p].split('>');
        var pa = pr.attempts ? Math.round((pr.firstTry / pr.attempts) * 100) : 0;
        var prr = pr.recent.length ? Math.round(Store.recentAccuracy(pr) * 100) : null;
        html += '<tr><td>' + esc(parts[0] + ' → ' + parts[1]) + '</td><td>' + pr.attempts + '</td>' +
          '<td>' + pa + '%</td><td>' + (prr === null ? '—' : prr + '%') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }

    var act = Store.activeLearner();
    html += '<div class="teacher-section"><h3>Learner</h3><ul class="teacher-stats">' +
      '<li>Active: ' + (act ? act.emoji + ' ' + esc(act.name) : 'none selected') + '</li>' +
      '<li>Questions answered: ' + st.totalAnswered + '</li>' +
      '<li>Sessions: ' + st.sessions + '</li>' +
      '<li>Best streak: ' + st.bestStreak + '</li>' +
      '<li>Unlocked up to stage: ' + st.unlocked + '</li>' +
      '</ul></div>' +
      '<div class="teacher-actions">' +
        '<button type="button" class="btn btn--primary" data-action="practice-all">Practice all levels</button>' +
        '<button type="button" class="btn btn--ghost" data-action="learners">Manage learners</button>' +
        '<button type="button" class="btn btn--ghost" data-action="lock">Lock teacher mode</button>' +
        '<button type="button" class="btn btn--danger" data-action="reset">Reset this learner</button>' +
      '</div>';

    panel.innerHTML = html;
    $('teacher-backdrop').classList.add('overlay--show');

    panel.querySelector('[data-action="close"]').addEventListener('click', closeTeacher);
    var pa = panel.querySelector('[data-action="practice-all"]');
    if (pa) {
      pa.addEventListener('click', function () {
        Audio.play('click');
        closeTeacher();
        renderPractice(true);
      });
    }
    var lk = panel.querySelector('[data-action="lock"]');
    if (lk) {
      lk.addEventListener('click', function () {
        Audio.play('click');
        closeTeacher();
        if (root.JOGO.Teacher) root.JOGO.Teacher.lock();
      });
    }
    var mg = panel.querySelector('[data-action="learners"]');
    if (mg) {
      mg.addEventListener('click', function () {
        Audio.play('click');
        closeTeacher();
        renderLearners();
      });
    }
    var r = panel.querySelector('[data-action="reset"]');
    if (r) {
      r.addEventListener('click', function () {
        var act2 = Store.activeLearner();
        var who = act2 ? act2.name + "'s" : 'the active learner';
        showModal('Reset ' + (act2 ? act2.name + '?' : 'progress?'), 'This clears ' + who + ' mastery and unlocks on this device.', function () {
          Store.reset();
          renderTeacher();
        });
      });
    }
  }

  function closeTeacher() {
    $('teacher-backdrop').classList.remove('overlay--show');
  }

  // ------------------------------------------------------------------
  // Learner profiles
  // ------------------------------------------------------------------

  function updateLearnerChip() {
    var a = Store.activeLearner();
    var avatar = a ? a.emoji : '🎒';
    var name = a ? a.name : 'Pick a learner';
    var chip = $('btn-learner');
    if (chip) {
      var av = $('learner-chip-avatar');
      var nm = $('learner-chip-name');
      if (av) av.textContent = avatar;
      if (nm) nm.textContent = name;
      chip.setAttribute('aria-label', a ? 'Choose who is playing — currently ' + name : 'Choose who is playing');
    }
    var hud = $('btn-learner-hud');
    if (hud) {
      hud.textContent = avatar;
      hud.setAttribute('aria-label', a ? 'Switch learner — ' + name : 'Switch learner');
    }
  }

  function renderLearners() {
    show('screen-learners');
    var body = $('learners-body');
    var active = Store.activeLearner();
    var roster = Store.learners();
    var html = '<div class="learners-list">';
    if (!roster.length) {
      html += '<p class="learners-empty">No learners yet — add the first one below.</p>';
    }
    for (var i = 0; i < roster.length; i++) {
      var l = roster[i];
      var isActive = active && l.id === active.id;
      html += '<div class="learner-card' + (isActive ? ' learner-card--active' : '') + '">' +
        '<span class="learner-avatar" aria-hidden="true">' + l.emoji + '</span>' +
        '<div class="learner-info">' +
          '<h3 class="learner-name">' + esc(l.name) + '</h3>' +
          '<p class="learner-meta">Stage ' + l.unlocked + ' · ' + l.totalAnswered + ' questions</p>' +
        '</div>' +
        (isActive
          ? '<span class="learner-badge">Playing</span>'
          : '<button type="button" class="btn btn--small" data-learn="' + l.id + '">Play as</button>') +
        '<button type="button" class="btn-icon learner-del" data-del="' + l.id + '" aria-label="Remove">✕</button>' +
      '</div>';
    }
    html += '</div>';

    html += '<form class="learner-add" id="learner-add" novalidate>' +
      '<h3 class="learner-add-title">Add a learner</h3>' +
      '<input type="text" class="answer-input learner-name-input" id="learner-name-input" maxlength="18" placeholder="First name" autocomplete="off" enterkeyhint="done" aria-label="Learner name" />' +
      '<div class="learner-emojis" role="radiogroup" aria-label="Pick an avatar">';
    for (var e = 0; e < Store.AVATARS.length; e++) {
      html += '<button type="button" class="learner-emoji' + (e === 0 ? ' learner-emoji--selected' : '') + '" data-emoji="' + Store.AVATARS[e] + '" role="radio" aria-checked="' + (e === 0) + '" aria-label="Avatar">' + Store.AVATARS[e] + '</button>';
    }
    html += '</div>' +
      '<button type="submit" class="btn btn--primary">Add learner</button>' +
    '</form>';

    body.innerHTML = html;

    var plays = body.querySelectorAll('[data-learn]');
    for (var p = 0; p < plays.length; p++) {
      plays[p].addEventListener('click', function () {
        Audio.play('click');
        Store.setActiveLearner(this.getAttribute('data-learn'));
        updateLearnerChip();
        show('screen-home');
      });
    }

    var dels = body.querySelectorAll('[data-del]');
    for (var d = 0; d < dels.length; d++) {
      dels[d].addEventListener('click', function () {
        Audio.play('click');
        var id = this.getAttribute('data-del');
        var nm = (Store.learners().filter(function (x) { return x.id === id; })[0] || {}).name || 'this learner';
        showModal('Remove ' + nm + '?', 'This deletes ' + nm + '\'s progress on this device.', function () {
          Store.removeLearner(id);
          updateLearnerChip();
          renderLearners();
        });
      });
    }

    var chosenEmoji = Store.AVATARS[0];
    var emojis = body.querySelectorAll('.learner-emoji');
    for (var q = 0; q < emojis.length; q++) {
      emojis[q].addEventListener('click', function () {
        chosenEmoji = this.getAttribute('data-emoji');
        var all = body.querySelectorAll('.learner-emoji');
        for (var a = 0; a < all.length; a++) {
          all[a].classList.toggle('learner-emoji--selected', all[a] === this);
        }
      });
    }

    var form = $('learner-add');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      Audio.play('click');
      var input = $('learner-name-input');
      var name = input.value.trim();
      if (!name) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.focus();
        return;
      }
      Store.addLearner(name, chosenEmoji);
      updateLearnerChip();
      renderLearners();
    });

    if (!('ontouchstart' in root)) {
      setTimeout(function () { var i = $('learner-name-input'); if (i) i.focus(); }, 50);
    }
  }

  /**
   * Teacher PIN prompt. On a correct entry closes itself and calls onSuccess.
   * Wrong entries shake the panel, clear the dots and show a hint.
   */
  function showPin(expectedPin, onSuccess) {
    var modal = $('pin-modal');
    var dots = $('pin-dots');
    var error = $('pin-error');
    var panel = modal.querySelector('.pin-panel');
    var entered = '';

    function renderDots() {
      dots.innerHTML = '';
      for (var i = 0; i < 4; i++) {
        dots.appendChild(el('span', 'pin-dot' + (i < entered.length ? ' pin-dot--filled' : '')));
      }
    }

    function fail() {
      panel.classList.remove('pin-panel--shake');
      void panel.offsetWidth;
      panel.classList.add('pin-panel--shake');
      entered = '';
      renderDots();
      error.textContent = 'Incorrect PIN — try again.';
    }

    function key(d) {
      if (entered.length >= 4) return;
      entered += d;
      error.textContent = '';
      renderDots();
      if (entered.length === 4) {
        if (entered === expectedPin) {
          modal.classList.remove('overlay--show');
          if (onSuccess) onSuccess();
        } else {
          fail();
        }
      }
    }

    error.textContent = '';
    entered = '';
    renderDots();
    modal.classList.add('overlay--show');

    var keys = modal.querySelectorAll('.pin-key');
    for (var i = 0; i < keys.length; i++) {
      keys[i].addEventListener('click', function () {
        Audio.play('click');
        var d = this.getAttribute('data-pin');
        if (d) { key(d); return; }
        var a = this.getAttribute('data-action');
        if (a === 'clear') { entered = ''; renderDots(); error.textContent = ''; }
        else if (a === 'cancel') { modal.classList.remove('overlay--show'); }
      });
    }
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ------------------------------------------------------------------
  // Confirm modal
  // ------------------------------------------------------------------

  function showModal(title, message, onConfirm) {
    var m = $('confirm-modal');
    m.querySelector('.modal-title').textContent = title;
    m.querySelector('.modal-text').textContent = message;
    m.classList.add('overlay--show');
    var yes = m.querySelector('[data-action="yes"]');
    var no = m.querySelector('[data-action="no"]');
    var clean = function () { m.classList.remove('overlay--show'); };
    yes.onclick = function () { clean(); if (onConfirm) onConfirm(); };
    no.onclick = clean;
    no.focus();
  }

  var UI = {
    show: show,
    esc: esc,
    renderLadder: renderLadder,
    renderGameHUD: renderGameHUD,
    clearFeedback: clearFeedback,
    showFeedback: showFeedback,
    showPraise: showPraise,
    renderQuestion: renderQuestion,
    showResultLine: showResultLine,
    playCommaFeedback: playCommaFeedback,
    showDone: showDone,
    renderPractice: renderPractice,
    renderProgress: renderProgress,
    renderTeacher: renderTeacher,
    closeTeacher: closeTeacher,
    showPin: showPin,
    showModal: showModal,
    renderLearners: renderLearners,
    updateLearnerChip: updateLearnerChip,
    setSoundIcons: setSoundIcons
  };

  root.JOGO = root.JOGO || {};
  root.JOGO.UI = UI;
})(typeof self !== 'undefined' ? self : this);
