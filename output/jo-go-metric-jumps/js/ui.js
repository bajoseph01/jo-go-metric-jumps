/**
 * ui.js — Jo⚡Go Metric Master
 * Screen routing and rendering. All dynamic content is rendered here;
 * game logic lives in game.js. Uses semantic buttons everywhere.
 */
(function (root) {
  'use strict';

  var M = root.JOGO.Math;
  var F = root.JOGO.Fmt;
  var Q = root.JOGO.Q;
  var WS = root.JOGO.WS;
  var PDF = root.JOGO.PDF;
  var Scales = root.JOGO.Scales;
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
  // Ladder widget (dimension-aware)
  // ------------------------------------------------------------------

  /**
   * Build the ladder markup for a dimension (top to bottom). If from/to are
   * given, highlight that conversion. Gap labels come from the math engine.
   * When interactive (the in-game ladder), rungs become real buttons and a
   * relationship note appears beneath: tapping a unit shows how it connects
   * to the live question — a passive visual becomes a practice aid.
   */
  function ladderHtml(dim, from, to, interactive) {
    var rungs = M.ladderRungs(dim || 'length');
    var html = '<div class="ladder">';
    for (var i = 0; i < rungs.length; i++) {
      var unit = rungs[i];
      var cls = 'rung' + (unit === from ? ' rung--active' : '');
      if (interactive) {
        html += '<button type="button" class="' + cls + '" data-unit="' + unit + '">' + unit + '</button>';
      } else {
        html += '<div class="' + cls + '" data-unit="' + unit + '">' + unit + '</div>';
      }
      if (i < rungs.length - 1) {
        var gapKey = rungs[i] + '>' + rungs[i + 1];
        var active = (from === rungs[i] && to === rungs[i + 1]) ||
                     (from === rungs[i + 1] && to === rungs[i]);
        html += '<div class="ladder-gap' + (active ? ' ladder-gap--active' : '') + '" data-gap="' + gapKey + '">' +
          '<span class="ladder-gap-f">' + esc(M.conversion(rungs[i], rungs[i + 1]).opLabel) + '</span>' +
          '<span class="ladder-gap-arrow" aria-hidden="true">' +
            (active && from === rungs[i + 1] ? '↑' : (active ? '↓' : '')) +
          '</span></div>';
      }
    }
    if (interactive) {
      html += '<p class="rung-note" data-role="rung-note" aria-live="polite">Tap a unit to see how it connects to this question.</p>';
    }
    html += '</div>';
    return html;
  }

  /**
   * Render the unit ladder for a dimension. If from/to given, highlight that
   * conversion. Gap labels are derived from the math engine (×1000 etc.).
   */
  function renderLadder(container, from, to, dim, interactive) {
    if (!container) return;
    container.innerHTML = ladderHtml(dim, from, to, interactive);
  }

  /** Kid-language relationship between a tapped rung and the live question. */
  function rungRelationship(unit, q) {
    if (!q || !q.from || !q.to || !q.conv) return '';
    var plural = q.conv.jumps > 1 ? 's' : '';
    if (unit === q.from) {
      return 'Start unit! To turn ' + q.from + ' into ' + q.to +
        ', the comma moves ' + (q.conv.op === '×' ? 'RIGHT' : 'LEFT') + ' ' +
        q.conv.jumps + ' place' + plural + '.';
    }
    if (unit === q.to) {
      return 'Answer unit! From ' + q.from + ', the comma moves ' +
        (q.conv.op === '×' ? 'RIGHT' : 'LEFT') + ' ' + q.conv.jumps +
        ' place' + plural + ' to land here.';
    }
    var eFrom = M.UNITS[q.from] && M.UNITS[q.from].exp;
    var eUnit = M.UNITS[unit] && M.UNITS[unit].exp;
    if (typeof eFrom !== 'number' || typeof eUnit !== 'number') return '';
    if (eUnit > eFrom) return '1 ' + unit + ' = ' + Math.pow(10, eUnit - eFrom) + ' ' + q.from + '.';
    return '1 ' + q.from + ' = ' + Math.pow(10, eFrom - eUnit) + ' ' + unit + '.';
  }

  // One-line "what does this measure" memory notes, shown under each ladder
  // on the home screen in small print.
  var DIM_NOTES = {
    length: 'how long · far · tall something is',
    mass: 'how heavy something is',
    volume: 'how much space something holds'
  };

  /**
   * Render the three dimension ladders side by side on the home screen, each
   * with its small-print memory note. The ladder for the currently selected
   * dimension is highlighted so the graphic mirrors the chosen category.
   */
  function renderHomeLadders() {
    var box = $('home-ladders');
    if (!box) return;
    var dim = Store.getDimension();
    var html = '';
    for (var i = 0; i < M.DIMENSION_NAMES.length; i++) {
      var d = M.DIMENSION_NAMES[i];
      var on = d === dim;
      html += '<div class="ladder-col' + (on ? ' ladder-col--on' : '') + '" data-dim="' + d + '">' +
        ladderHtml(d, null, null) +
        '<p class="ladder-note">' + esc(DIM_NOTES[d]) + '</p></div>';
    }
    box.innerHTML = html;
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
    var na = $('next-area');
    if (na) { na.innerHTML = ''; na.hidden = true; }
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

  /**
   * Kid-language method line shown on every question card (playbook rule 10:
   * teach the skill, never assume it). Static per stage — it teaches the
   * method for THIS kind of question without ever stating the live answer.
   */
  function kidRuleLine(stage) {
    if (!stage || !stage.kidRule) return '';
    return '<p class="kid-rule" role="note">💡 ' + esc(stage.kidRule) + '</p>';
  }

  function questionShell(session, inner, opts) {
    opts = opts || {};
    var html = '<div class="card question-card">';
    if (opts.rule !== false && session.q) {
      html += kidRuleLine(session.stage);
    }
    html += inner;
    if (session.stage.ladder && session.q && session.q.from) {
      // The ladder's factor pills and direction arrow would give the
      // answer away — they stay hidden until the child taps Show hint.
      html += '<div class="ladder-wrap' + (session.showHint ? '' : ' ladder-wrap--hint') + '" data-role="ladder"></div>';
      if (!session.showHint) {
        html += '<div class="hint-row"><button type="button" class="btn btn--mini btn--hint" id="btn-show-hint">💡 Show hint</button></div>';
      }
    }
    html += '</div>';
    $('gameBody').innerHTML = html;
    if (session.stage.ladder && session.q && session.q.from) {
      var lc = $('gameBody').querySelector('[data-role="ladder"]');
      renderLadder(lc, session.q.from, session.q.to, session.dimension, true);
      // tapping a rung highlights it and explains its link to the question
      var rungs = lc.querySelectorAll('.rung');
      for (var ri = 0; ri < rungs.length; ri++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            Audio.play('click');
            for (var j = 0; j < rungs.length; j++) rungs[j].classList.remove('rung--active');
            btn.classList.add('rung--active');
            var note = lc.querySelector('[data-role="rung-note"]');
            if (note) note.textContent = rungRelationship(btn.getAttribute('data-unit'), session.q);
          });
        })(rungs[ri]);
      }
      var hintBtn = $('btn-show-hint');
      if (hintBtn) {
        hintBtn.addEventListener('click', function () {
          Audio.play('click');
          session.showHint = true;
          var wrap = $('gameBody').querySelector('[data-role="ladder"]');
          if (wrap) wrap.classList.remove('ladder-wrap--hint');
          hintBtn.hidden = true;
        });
      }
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
      '<p class="step-hint">Move the comma with your finger, mouse or pencil.</p>';
    questionShell(session, inner);
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
    questionShell(session, inner);
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
    // Op/jumps questions carry no concrete number (there is no source
    // value yet) — show the conversion itself instead of a blank value.
    var eq;
    if (q.kind === 'op') {
      eq = q.from + ' → ' + q.to + ' uses ' + q.conv.opLabel;
    } else if (q.kind === 'jumps') {
      eq = q.from + ' → ' + q.to + ' = ' + q.conv.opLabel + ' (' + q.conv.jumps + ' jump' + (q.conv.jumps > 1 ? 's' : '') + ')';
    } else {
      eq = q.sourceSA + ' ' + q.from + ' ' + q.conv.opLabel + ' = ' + q.expectedSA + ' ' + q.to;
    }
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
      if (done) done(); // Next button appears right after the animation
    });
  }

  /**
   * The pause moment after a correct answer (Tick⚡Tock's pacing): a
   * gentle streak pill plus a Next button that stays until the child taps
   * — no timer, no fading. Label flips to "Finish" on the last question.
   */
  function showNextButton(session, advance) {
    var area = $('next-area');
    if (!area) { if (advance) advance(); return; }
    var last = session.done >= session.target;
    var celeb = '';
    if (session.streak >= 2) {
      var words = session.streak >= 10 ? 'in a row — unstoppable! 🏆' :
        session.streak >= 5 ? 'in a row — you are on fire! 🔥' :
        session.streak >= 3 ? 'in a row — keep going! ⭐' : 'in a row! 🌟';
      celeb = '<div class="streak-pill" aria-live="polite">' + session.streak + ' ' + words + '</div>';
    }
    area.innerHTML = celeb + '<button type="button" class="btn btn--next" id="btn-next-question">' +
      (last ? 'Finish — see results →' : 'Next question →') + '</button>';
    area.hidden = false;
    var b = $('btn-next-question');
    if (b) b.addEventListener('click', function () {
      Audio.play('click');
      advance();
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
      var badge = locked
        ? '<span class="stage-badge stage-badge--locked">🔒 Locked</span>'
        : (acc === null
            ? '<span class="stage-badge stage-badge--new">New</span>'
            : (acc >= 80
                ? '<span class="stage-badge stage-badge--mastered">✓ Mastered</span>'
                : '<span class="stage-badge stage-badge--progress">In progress · ' + acc + '%</span>'));
      html += '<div class="stage-card' + (locked ? ' stage-card--locked' : '') + '">' +
        '<div class="stage-num' + (acc !== null && acc >= 80 ? ' stage-num--mastered' : '') + '">' +
          (acc !== null && acc >= 80 ? '✓' : stage.id) + '</div>' +
        '<div class="stage-info">' +
          '<h3 class="stage-name">' + esc(stage.name) + '</h3>' +
          badge +
          (acc !== null && !locked ? '<div class="stage-bar"><div class="stage-bar-fill" style="width:' + acc + '%"></div></div>' : '') +
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

  /** Human-readable mastery label (from masteryFor). */
  function masteryPretty(label) {
    return { new: 'New', mastered: 'Mastered', 'getting-there': 'Getting there', 'needs-practice': 'Needs practice' }[label] || label;
  }

  /** Coloured status pill for a mastery label (from masteryFor). */
  function masteryBadge(label) {
    var cls = label === 'mastered' ? ' m-badge--mastered'
      : (label === 'getting-there' ? ' m-badge--progress'
      : (label === 'needs-practice' ? ' m-badge--warn' : ' m-badge--new'));
    return '<span class="m-badge' + cls + '">' + esc(masteryPretty(label)) + '</span>';
  }

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
        '<button type="button" class="btn btn--primary" data-action="worksheets">Worksheet pack</button>' +
        '<button type="button" class="btn btn--ghost" data-action="report">Print report</button>' +
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
    var wb = panel.querySelector('[data-action="worksheets"]');
    if (wb) {
      wb.addEventListener('click', function () {
        Audio.play('click');
        closeTeacher();
        renderWorksheets();
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
    var rp = panel.querySelector('[data-action="report"]');
    if (rp) {
      rp.addEventListener('click', function () {
        Audio.play('click');
        closeTeacher();
        renderReport();
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
  // First-play teaching overlay
  // ------------------------------------------------------------------

  /** Open the one-time "meet the ladder" overlay for a fresh learner. */
  function showIntroOverlay() {
    var box = $('intro-ladder');
    if (box) box.innerHTML = ladderHtml('length', null, null);
    var ov = $('intro-backdrop');
    if (ov) ov.classList.add('overlay--show');
  }

  function closeIntroOverlay() {
    var ov = $('intro-backdrop');
    if (ov) ov.classList.remove('overlay--show');
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
      if (nm) { nm.textContent = name; nm.style.color = a ? a.color : ''; }
      chip.setAttribute('aria-label', a ? 'Choose who is playing — currently ' + name : 'Choose who is playing');
    }
    var hud = $('btn-learner-hud');
    if (hud) {
      hud.textContent = avatar;
      hud.setAttribute('aria-label', a ? 'Switch learner — ' + name : 'Switch learner');
    }
  }

  var editingLearnerId = null;
  var reportLearnerId = null;

  /** First avatar not already taken by a learner (fallback: the fox). */
  function firstFreeAvatar() {
    var used = {};
    Store.learners().forEach(function (l) { used[l.emoji] = true; });
    for (var i = 0; i < Store.AVATARS.length; i++) {
      if (!used[Store.AVATARS[i]]) return Store.AVATARS[i];
    }
    return Store.AVATARS[0];
  }

  /** First colour not already claimed (fallback: the blue). */
  function firstFreeColor() {
    var used = {};
    Store.learners().forEach(function (l) { used[l.color] = true; });
    for (var i = 0; i < Store.LEARNER_COLORS.length; i++) {
      if (!used[Store.LEARNER_COLORS[i]]) return Store.LEARNER_COLORS[i];
    }
    return Store.LEARNER_COLORS[0];
  }

  function renderLearners() {
    show('screen-learners');
    var body = $('learners-body');
    var active = Store.activeLearner();
    var roster = Store.learners();
    var editing = null;
    for (var ei = 0; ei < roster.length; ei++) {
      if (roster[ei].id === editingLearnerId) editing = roster[ei];
    }
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
          '<h3 class="learner-name" style="color:' + l.color + '">' + esc(l.name) + '</h3>' +
          '<p class="learner-meta">Stage ' + l.unlocked + ' · ' + l.totalAnswered + ' questions</p>' +
        '</div>' +
        (isActive
          ? '<span class="learner-badge">Playing</span>'
          : '<button type="button" class="btn btn--small" data-learn="' + l.id + '">Play as</button>') +
        '<button type="button" class="btn-icon learner-edit" data-edit="' + l.id + '" aria-label="Rename ' + esc(l.name) + '">✎</button>' +
        '<button type="button" class="btn-icon learner-del" data-del="' + l.id + '" aria-label="Remove">✕</button>' +
      '</div>';
    }
    html += '</div>';

    var formTitle = editing ? 'Edit ' + esc(editing.name) : 'Add a learner';
    var submitLabel = editing ? 'Save changes' : 'Add learner';
    var inputValue = editing ? esc(editing.name) : '';
    // For a brand-new learner, suggest an avatar nobody else uses yet so two
    // kids never look identical in the picker.
    var chosenEmoji = editing ? editing.emoji : firstFreeAvatar();
    var chosenColor = editing ? editing.color : firstFreeColor();
    html += '<form class="learner-add" id="learner-add" novalidate>' +
      '<h3 class="learner-add-title">' + formTitle + '</h3>' +
      '<input type="text" class="answer-input learner-name-input" id="learner-name-input" maxlength="18" placeholder="First name" autocomplete="off" enterkeyhint="done" aria-label="Learner name" value="' + inputValue + '" />' +
      '<div class="learner-emojis" role="radiogroup" aria-label="Pick an avatar">';
    for (var e = 0; e < Store.AVATARS.length; e++) {
      var selected = Store.AVATARS[e] === chosenEmoji;
      html += '<button type="button" class="learner-emoji' + (selected ? ' learner-emoji--selected' : '') + '" data-emoji="' + Store.AVATARS[e] + '" role="radio" aria-checked="' + selected + '" aria-label="Avatar">' + Store.AVATARS[e] + '</button>';
    }
    html += '</div>' +
      '<div class="learner-color-label">Pick a colour for your name</div>' +
      '<div class="learner-colors" role="radiogroup" aria-label="Pick a colour">';
    for (var co = 0; co < Store.LEARNER_COLORS.length; co++) {
      var csel = Store.LEARNER_COLORS[co] === chosenColor;
      // Named swatches so a screen reader announces which colour this is
      // (AC-004). Same palette as storage.LEARNER_COLORS.
      var cname = COLOR_NAMES[Store.LEARNER_COLORS[co]] || 'Colour';
      html += '<button type="button" class="learner-color' + (csel ? ' learner-color--selected' : '') + '" data-color="' + Store.LEARNER_COLORS[co] + '" role="radio" aria-checked="' + csel + '" aria-label="' + cname + ' colour" style="background:' + Store.LEARNER_COLORS[co] + '">' + (csel ? '✓' : '') + '</button>';
    }
    html += '</div>' +
      '<div class="learner-add-actions">' +
        '<button type="submit" class="btn btn--primary">' + submitLabel + '</button>' +
        (editing ? '<button type="button" class="btn btn--ghost" data-cancel-edit="1">Cancel</button>' : '') +
      '</div>' +
    '</form>';

    body.innerHTML = html;

    var plays = body.querySelectorAll('[data-learn]');
    for (var p = 0; p < plays.length; p++) {
      plays[p].addEventListener('click', function () {
        Audio.play('click');
        editingLearnerId = null;
        Store.setActiveLearner(this.getAttribute('data-learn'));
        updateLearnerChip();
        show('screen-home');
      });
    }

    var edits = body.querySelectorAll('[data-edit]');
    for (var ed = 0; ed < edits.length; ed++) {
      edits[ed].addEventListener('click', function () {
        Audio.play('click');
        editingLearnerId = this.getAttribute('data-edit');
        renderLearners();
      });
    }

    var cancels = body.querySelectorAll('[data-cancel-edit]');
    for (var cn = 0; cn < cancels.length; cn++) {
      cancels[cn].addEventListener('click', function () {
        Audio.play('click');
        editingLearnerId = null;
        renderLearners();
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
          if (editingLearnerId === id) editingLearnerId = null;
          updateLearnerChip();
          renderLearners();
        });
      });
    }

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

    var colors = body.querySelectorAll('.learner-color');
    for (var cw = 0; cw < colors.length; cw++) {
      colors[cw].addEventListener('click', function () {
        chosenColor = this.getAttribute('data-color');
        var all = body.querySelectorAll('.learner-color');
        for (var ca = 0; ca < all.length; ca++) {
          all[ca].classList.toggle('learner-color--selected', all[ca] === this);
          all[ca].textContent = all[ca] === this ? '✓' : '';
          all[ca].setAttribute('aria-checked', all[ca] === this);
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
      if (editing) {
        Store.renameLearner(editing.id, name, chosenEmoji, chosenColor);
        editingLearnerId = null;
      } else {
        Store.addLearner(name, chosenEmoji, chosenColor);
      }
      updateLearnerChip();
      renderLearners();
    });

    if (!('ontouchstart' in root)) {
      setTimeout(function () { var i = $('learner-name-input'); if (i) i.focus(); }, 50);
    }
  }

  // ------------------------------------------------------------------
  // Printable per-learner report
  // ------------------------------------------------------------------

  function pct(rec) {
    if (!rec || !rec.attempts) return '—';
    return Math.round((rec.firstTry / rec.attempts) * 100) + '%';
  }

  function recentPct(rec) {
    if (!rec || !rec.recent || !rec.recent.length) return '—';
    return Math.round((Store.recentAccuracy(rec) * 100)) + '%';
  }

  function masteryFor(rec) {
    var acc = rec && rec.attempts ? rec.firstTry / rec.attempts : null;
    if (acc === null) return 'new';
    if (acc >= 0.8) return 'mastered';
    if (acc >= 0.5) return 'getting-there';
    return 'needs-practice';
  }

  function renderReport() {
    show('screen-report');
    var body = $('report-body');
    var roster = Store.learners();
    if (!roster.length) {
      body.innerHTML = '<p class="learners-empty">No learners yet — add a learner first.</p>';
      return;
    }
    var current = reportLearnerId && Store.progressOf(reportLearnerId) ? reportLearnerId : (Store.activeLearner() || roster[0]).id;
    reportLearnerId = current;
    var l = roster.filter(function (x) { return x.id === current; })[0];
    var prog = Store.progressOf(current);

    var html = '<div class="report-picker" role="group" aria-label="Choose a learner">';
    for (var i = 0; i < roster.length; i++) {
      var on = roster[i].id === current;
      html += '<button type="button" class="report-chip' + (on ? ' report-chip--on' : '') + '" style="color:' + roster[i].color + '" data-report-learner="' + roster[i].id + '">' + roster[i].emoji + ' ' + esc(roster[i].name) + '</button>';
    }
    html += '</div>';

    var firstTryPct = prog.totalAnswered ? Math.round((prog.totalFirstTry / prog.totalAnswered) * 100) : 0;
    var stageDots = '';
    for (var sd = 1; sd <= Q.STAGES.length; sd++) {
      stageDots += '<span class="report-dot' + (sd <= prog.unlocked ? ' report-dot--on' : '') + '"></span>';
    }
    html += '<div class="report print-area">' +
      '<h2 class="report-head">' + l.emoji + ' <span style="color:' + l.color + '">' + esc(l.name) + '</span> — Metric Master Report</h2>' +
      '<p class="report-sub">' + prog.totalAnswered + ' questions · ' +
        firstTryPct + '% first-try · best streak 🔥 ' + prog.bestStreak + '</p>' +
      '<div class="report-stages" aria-label="Stage ' + prog.unlocked + ' of ' + Q.STAGES.length + ' unlocked">' + stageDots + '</div>' +
      '<h3 class="report-sec">Mastery by category</h3>' +
      '<table class="tbl report-tbl"><thead><tr><th>Category</th><th>Tries</th><th>First-try</th><th>Recent</th><th>Status</th></tr></thead><tbody>';
    for (var c = 0; c < Store.CATEGORIES.length; c++) {
      var key = Store.CATEGORIES[c];
      var rec = prog.categories[key];
      html += '<tr><td>' + esc(Store.CATEGORY_LABELS[key]) + '</td><td>' + rec.attempts + '</td>' +
        '<td>' + pct(rec) + '</td><td>' + recentPct(rec) + '</td>' +
        '<td>' + masteryBadge(masteryFor(rec)) + '</td></tr>';
    }
    html += '</tbody></table>';

    var pairKeys = Object.keys(prog.pairs).sort();
    html += '<h3 class="report-sec">Conversion pairs</h3>';
    if (!pairKeys.length) {
      html += '<p class="report-none">No conversions answered yet.</p>';
    } else {
      html += '<table class="tbl report-tbl"><thead><tr><th>Conversion</th><th>Tries</th><th>First-try</th><th>Recent</th></tr></thead><tbody>';
      for (var pk = 0; pk < pairKeys.length; pk++) {
        var pr = prog.pairs[pairKeys[pk]];
        var parts = pairKeys[pk].split('>');
        html += '<tr><td>' + esc(parts[0] + ' → ' + parts[1]) + '</td><td>' + pr.attempts + '</td>' +
          '<td>' + pct(pr) + '</td><td>' + recentPct(pr) + '</td></tr>';
      }
      html += '</tbody></table>';
    }

    var sc = prog.scales;
    var anyScale = sc && (sc.ruler.attempts || sc.kitchen.attempts || sc.jug.attempts);
    if (anyScale) {
      html += '<h3 class="report-sec">Scales</h3>' +
        '<table class="tbl report-tbl"><thead><tr><th>Scale</th><th>Tries</th><th>First-try</th><th>Recent</th></tr></thead><tbody>';
      for (var si = 0; si < Store.SCALE_INSTRUMENTS.length; si++) {
        var srec = sc[Store.SCALE_INSTRUMENTS[si]];
        html += '<tr><td>' + esc(SCALE_LABELS[Store.SCALE_INSTRUMENTS[si]]) + '</td><td>' + srec.attempts + '</td>' +
          '<td>' + pct(srec) + '</td><td>' + recentPct(srec) + '</td></tr>';
      }
      html += '</tbody></table>';
    }
    html += '<p class="report-foot">Jo⚡Go Metric Master · ' + new Date().toLocaleDateString() + '</p>' +
      '</div>';

    body.innerHTML = html;

    var chips = body.querySelectorAll('[data-report-learner]');
    for (var ch = 0; ch < chips.length; ch++) {
      chips[ch].addEventListener('click', function () {
        Audio.play('click');
        reportLearnerId = this.getAttribute('data-report-learner');
        renderReport();
      });
    }
  }

  // ------------------------------------------------------------------
  // Dimension pills (home screen)
  // ------------------------------------------------------------------

  function renderDimensionPills() {
    var box = $('dim-pills');
    if (!box) return;
    var dim = Store.getDimension();
    var html = '';
    for (var i = 0; i < M.DIMENSION_NAMES.length; i++) {
      var d = M.DIMENSION_NAMES[i];
      var on = d === dim;
      html += '<button type="button" class="dim-pill' + (on ? ' dim-pill--on' : '') + '" data-dim="' + d + '" aria-pressed="' + on + '">' + M.DIMENSIONS[d].name + '</button>';
    }
    box.innerHTML = html;
    var btns = box.querySelectorAll('[data-dim]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        Audio.play('click');
        Store.setDimension(this.getAttribute('data-dim'));
        wsState.items = {};   // worksheets are dimension-specific
        renderDimensionPills();
        renderHomeLadders(); // the top graphic mirrors the chosen dimension
      });
    }
  }

  // ------------------------------------------------------------------
  // Scales Lab: read physical scales (ruler, kitchen scale, measuring jug)
  // ------------------------------------------------------------------

  var SCALE_LABELS = { ruler: 'Ruler', kitchen: 'Kitchen scale', jug: 'Measuring jug' };

  // Kid-friendly names for the learner name-colour palette (AC-004).
  // Keys are the current (WCAG-readable) hexes; legacy bright hexes map
  // through LEGACY_LEARNER_COLORS in storage.
  var COLOR_NAMES = {
    '#2B62EB': 'Blue', '#B92727': 'Red', '#127D40': 'Green', '#A8520A': 'Orange',
    '#6D3FD6': 'Purple', '#C2257A': 'Pink', '#0B6E73': 'Teal', '#8A5A10': 'Brown'
  };

  var scalesSession = { instrument: 'ruler', done: 0, target: 10, q: null, firstTry: true, locked: false, correct: 0 };

  function renderScales() {
    show('screen-scales');
    var body = $('scales-body');
    var order = ['ruler', 'kitchen', 'jug'];
    var html = '<div class="scales-tabs" role="tablist" aria-label="Choose a scale">';
    for (var i = 0; i < order.length; i++) {
      var on = order[i] === scalesSession.instrument;
      html += '<button type="button" class="scales-tab' + (on ? ' scales-tab--on' : '') + '" data-scale="' + order[i] + '" role="tab" aria-selected="' + on + '">' + Scales.SCALE_SPECS[order[i]].label + '</button>';
    }
    html += '<button type="button" class="scales-tab scales-tab--challenge" data-scale="challenge" aria-label="Scales challenge">⚡ Challenge</button>' +
      '</div><div class="scales-stage" id="scales-stage"></div>';
    body.innerHTML = html;
    var tabs = body.querySelectorAll('[data-scale]');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function () {
        Audio.play('click');
        if (this.getAttribute('data-scale') === 'challenge') { startScalesChallenge(); return; }
        scalesSession = { instrument: this.getAttribute('data-scale'), done: 0, target: 10, q: null, firstTry: true, locked: false, correct: 0 };
        renderScales();
      });
    }
    nextScaleQuestion();
  }

  /**
   * A mixed-instrument challenge (10 readings) whose instrument mix adapts
   * to the learner: unmastered scales appear more, and a mastered ruler
   * gives way to dials and jugs. Weights come from the reading stats AND
   * the learner's weak conversion pairs (length/mass/volume), so the
   * challenge leans into whichever scales they still need.
   */
  function startScalesChallenge() {
    var lr = Store.activeLearner();
    var stats = {}, pairs = {};
    ['ruler', 'kitchen', 'jug'].forEach(function (ins) {
      stats[ins] = lr ? Store.scaleStats(lr.id, ins) : null;
    });
    if (lr && lr.pairs) pairs = lr.pairs;
    var seq = Scales.challengeSequence(stats, pairs, null, 10);
    scalesSession = { instrument: seq[0], seq: seq, done: 0, target: seq.length, q: null, firstTry: true, locked: false, correct: 0, mode: 'challenge', per: { ruler: { n: 0, ok: 0 }, kitchen: { n: 0, ok: 0 }, jug: { n: 0, ok: 0 } } };
    renderScales();
  }

  function nextScaleQuestion() {
    var s = scalesSession;
    s.locked = false;
    // a challenge walks its pre-built sequence; `done` is the count of
    // answered questions, which is exactly the index of the next one
    if (s.mode === 'challenge' && s.seq) s.instrument = s.seq[s.done];
    s.q = Scales.question(s.instrument);
    s.firstTry = true;
    var spec = Scales.SCALE_SPECS[s.instrument];
    // The ruler always shows the scale the child can actually read: a
    // beginner gets a mm-numbered ruler where the arrow IS the answer;
    // only a mastered reader (see Scales.rulerLevel) earns the harder
    // cm-numbered ruler with its ×10 conversion. Question one is always mm.
    var level = 'mm';
    var levelUp = '';
    if (s.instrument === 'ruler') {
      var lr = Store.activeLearner();
      var lst = lr ? Store.scaleStats(lr.id, 'ruler') : null;
      level = Scales.rulerLevel(lst);
      if (level === 'cm' && lr && !(lst && lst.advanced)) {
        Store.markScaleAdvanced(lr.id, 'ruler');
        levelUp = '<p class="scales-level-up" role="status">🎉 You mastered the mm ruler! Now the big numbers are cm — every cm is 10 mm. Read the arrow, then ×10 for your answer in mm.</p>';
      }
    }
    var howTo = s.instrument === 'ruler' ? spec.howTo[level] : spec.howTo;
    var svg = s.instrument === 'ruler' ? Scales.rulerSVG(s.q.answer, level)
      : (s.instrument === 'kitchen' ? Scales.kitchenSVG(s.q.answer) : Scales.jugSVG(s.q.answer));
    var chal = s.mode === 'challenge'
      ? '<p class="scales-chal" role="status">⚡ Challenge ' + (s.done + 1) + ' of ' + s.target + ' — ' + SCALE_LABELS[s.instrument] + '</p>'
      : '';
    var stage = $('scales-stage');
    stage.innerHTML = '<div class="scales-q">' +
      chal +
      '<p class="scales-prompt">Question ' + (s.done + 1) + ' of ' + s.target + '. Read the scale. How many <strong>' + spec.ask + '</strong>?</p>' +
      '<p class="scales-how" role="note">💡 ' + esc(howTo) + '</p>' +
      levelUp +
      svg +
      '<form class="scales-answer" id="scales-form" novalidate>' +
        '<label for="scales-input" class="scales-label">Answer:</label>' +
        '<input type="text" inputmode="decimal" class="answer-input scales-input" id="scales-input" autocomplete="off" aria-label="Your answer" />' +
        '<span class="scales-unit">' + spec.unit + '</span>' +
        '<button type="submit" class="btn btn--primary">Check</button>' +
      '</form>' +
      '<div class="feedback" id="scales-feedback" role="status"></div>' +
    '</div>';
    $('scales-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitScale();
    });
    var input = $('scales-input');
    setTimeout(function () { if (input) input.focus(); }, 60);
  }

  function submitScale() {
    var s = scalesSession;
    if (s.locked) return;
    var input = $('scales-input');
    var fb = $('scales-feedback');
    var val = Scales.parseInput(input.value);
    if (val === null) {
      Audio.play('wrong');
      fb.textContent = 'Type a number, e.g. 137 or 2,5.';
      fb.className = 'feedback feedback--warn';
      return;
    }
    s.locked = true;
    if (s.per && s.per[s.instrument]) s.per[s.instrument].n++;
    if (val === s.q.answer) {
      if (s.firstTry) s.correct++;
      if (s.per && s.per[s.instrument]) s.per[s.instrument].ok++;
      Audio.play('correct');
      fb.textContent = 'Correct! It reads ' + F.scaledToSA(s.q.answer, 1) + ' ' + s.q.unit + '.';
      fb.className = 'feedback feedback--ok';
      Store.recordScale(s.instrument, true);
      s.done++;
      setTimeout(afterScaleAnswer, 1000);
    } else {
      s.firstTry = false;
      Audio.play('wrong');
      fb.textContent = 'Not quite — count the marks carefully. It reads ' + F.scaledToSA(s.q.answer, 1) + ' ' + s.q.unit + '.';
      fb.className = 'feedback feedback--warn';
      Store.recordScale(s.instrument, false);
      s.locked = false;
      input.focus();
      input.select();
    }
  }

  function afterScaleAnswer() {
    if (scalesSession.done >= scalesSession.target) {
      renderScalesDone();
    } else {
      nextScaleQuestion();
    }
  }

  function renderScalesDone() {
    var s = scalesSession;
    var pct2 = Math.round((s.correct / s.target) * 100);
    var stage = $('scales-stage');
    var againLabel = s.mode === 'challenge' ? 'Another challenge' : 'Read more';
    var summary = '';
    if (s.mode === 'challenge' && s.per) {
      var rows = '', worst = null, worstPct = 1.01;
      ['ruler', 'kitchen', 'jug'].forEach(function (ins) {
        var rec = s.per[ins];
        if (!rec || !rec.n) return;
        var p = Math.round((rec.ok / rec.n) * 100);
        rows += '<span class="chal-ins chal-ins--' + ins + '">' + SCALE_LABELS[ins] + ' ' + rec.ok + '/' + rec.n + '</span>';
        if (p < worstPct) { worstPct = p; worst = ins; }
      });
      summary = '<div class="scales-chal-summary" aria-label="Challenge results by scale">' + rows + '</div>' +
        (worst ? '<p class="scales-chal-nudge">🧭 ' + SCALE_LABELS[worst] + ' needs the most practice — another challenge will grow it!</p>' : '');
    }
    stage.innerHTML = '<div class="card done-card">' +
      '<h2 class="done-title">' + (pct2 === 100 ? 'Perfect reading! ⚡' : pct2 >= 60 ? 'Great reading!' : 'Keep practising!') + '</h2>' +
      '<p class="done-score">You read ' + s.correct + ' of ' + s.target + ' scales correctly.</p>' +
      summary +
      '<div class="done-actions">' +
        '<button type="button" class="btn btn--primary" id="btn-scales-again">' + againLabel + '</button>' +
        '<button type="button" class="btn btn--ghost" id="btn-scales-switch">Pick a different scale</button>' +
      '</div></div>';
    $('btn-scales-again').addEventListener('click', function () {
      Audio.play('click');
      if (s.mode === 'challenge') { startScalesChallenge(); return; }
      scalesSession = { instrument: s.instrument, done: 0, target: 10, q: null, firstTry: true, locked: false, correct: 0 };
      nextScaleQuestion();
    });
    $('btn-scales-switch').addEventListener('click', function () {
      Audio.play('click');
      scalesSession = { instrument: s.instrument, done: 0, target: 10, q: null, firstTry: true, locked: false, correct: 0 };
      renderScales();
    });
  }

  // ------------------------------------------------------------------
  // Worksheet pack (teacher mode) + PDF export
  // ------------------------------------------------------------------

  var wsState = { ids: null, withKey: true, items: {}, scaleItems: {}, mode: 'conv', classSet: false };

  /** Item-store key for one learner's conversion sheet (shared when class-set). */
  function convItemsFor(l, dim) {
    var key = wsState.classSet ? '__class__:' + dim : l.id + ':' + dim;
    if (!wsState.items[key]) {
      wsState.items[key] = WS.buildItems(wsState.classSet ? {} : Store.progressOf(l.id), null, 8, 2, dim);
    }
    return wsState.items[key];
  }

  /** Item-store key for one learner's scale sheet (shared when class-set). */
  function scaleItemsFor(l) {
    var key = wsState.classSet ? '__class__' : l.id;
    if (!wsState.scaleItems[key]) {
      wsState.scaleItems[key] = Scales.worksheetItems(null, null);
      if (!wsState.classSet) {
        // Each child's sheet matches their reading level: mastered readers
        // get the cm-numbered ruler (×10 conversion), everyone else the mm
        // ruler where the arrow is the answer. Class-set stays on mm so the
        // whole class reads the same, beginner-friendly ruler.
        var lvl = Scales.rulerLevel(Store.scaleStats(l.id, 'ruler'));
        wsState.scaleItems[key].forEach(function (it) {
          if (it.instrument === 'ruler') it.level = lvl;
        });
      }
    }
    return wsState.scaleItems[key];
  }

  function safeFilename(s) {
    var out = String(s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return out || 'learner';
  }

  function wsLine(item, n) {
    if (item.type === 'conv') {
      return '<div class="ws-q"><span class="ws-num">' + n + '.</span> ' + esc(item.text) +
        ' <span class="ws-from">' + esc(item.from) + '</span> = <span class="ws-blank"></span> ' +
        '<span class="ws-to">' + esc(item.to) + '</span></div>';
    }
    return '<div class="ws-q ws-q--word"><span class="ws-num">' + n + '.</span> <span class="ws-word-text">' +
      esc(item.text) + '</span><span class="ws-word-answer"><span>Answer:</span>' +
      '<span class="ws-blank ws-blank--wide"></span></span></div>';
  }

  /** Instrument SVG preview for a worksheet item. The visible label stays
   *  generic (no answer), but a screen-reader <desc> describes the pointer
   *  position relative to a labelled mark so the reading can be worked out
   *  — the accessible equivalent of seeing the scale (AC-003). */
  function wsScaleSVG(item) {
    var cmds, vb, aria;
    if (item.instrument === 'ruler') {
      cmds = Scales.rulerPDF(item.answer, item.level || 'mm'); vb = { w: 465, h: 96 }; aria = 'Ruler with arrow';
    } else if (item.instrument === 'kitchen') {
      cmds = Scales.kitchenPDF(item.answer); vb = { w: 380, h: 380 }; aria = 'Kitchen scale with needle';
    } else {
      cmds = Scales.jugPDF(item.answer); vb = { w: 260, h: 360 }; aria = 'Measuring jug with liquid';
    }
    return Scales.svgFromCommands(cmds, vb.w, vb.h, aria, Scales.scaleDescription(item));
  }

  /** Draw a command set into a PDF at (x, y from top) with a scale factor. */
  function scalePDFToDoc(doc, cmds, x, y, scale) {
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.t === 'line') {
        doc.line(x + c.x1 * scale, y + c.y1 * scale, x + c.x2 * scale, y + c.y2 * scale, { width: (c.w || 1) * scale, color: c.color });
      } else if (c.t === 'rect') {
        doc.rect(x + c.x * scale, y + c.y * scale, c.w * scale, c.h * scale, { fill: c.fill, stroke: c.stroke, sw: (c.sw || 1) * scale });
      } else if (c.t === 'circle') {
        doc.circle(x + c.cx * scale, y + c.cy * scale, c.r * scale, { fill: c.fill, stroke: c.stroke, sw: (c.sw || 1) * scale });
      } else if (c.t === 'poly') {
        doc.poly(c.pts.map(function (p) { return [x + p[0] * scale, y + p[1] * scale]; }), c.fill);
      } else if (c.t === 'text') {
        doc.textAt(x + c.x * scale, y + c.y * scale, c.str, c.size * scale, c.bold, c.color, c.anchor);
      }
    }
  }

  /** Scale-reading sheets for the selected learners (answers hidden). On
   *  screen each item gets a type-in box + per-sheet Check button; printing
   *  swaps the boxes for plain answer lines. */
  function scaleSheetsHTML(sel, date) {
    var html = '';
    for (var s = 0; s < sel.length; s++) {
      var l = sel[s];
      var items = scaleItemsFor(l);
      html += '<div class="ws-sheet print-area" data-learner="' + l.id + '">' +
        '<div class="ws-head"><div class="ws-brand">Jo⚡Go Metric Master — Read the Scales</div>' +
        '<div class="ws-who">For: ' + l.emoji + ' ' + esc(l.name) + ' · ' + date + '</div></div>' +
        '<p class="ws-instruct">Read each scale and type your answer, then press Check my answers.</p><div class="ws-qs">';
      for (var i = 0; i < items.length; i++) {
        html += '<div class="ws-scale-item">' +
          '<div class="ws-q ws-q--scale"><span class="ws-num">' + (i + 1) + '.</span>' + wsScaleSVG(items[i]) + '</div>' +
          '<div class="ws-word-answer"><span>Answer:</span>' +
          '<input class="ws-scale-input" inputmode="decimal" autocomplete="off" aria-label="Answer ' + (i + 1) + '" />' +
          '<span class="ws-blank ws-blank--wide ws-scale-blank"></span>' +
          '<span class="ws-scale-unit">' + items[i].unit + '</span><span class="ws-scale-mark"></span></div>' +
        '</div>';
      }
      html += '</div><div class="ws-scale-actions">' +
        '<button type="button" class="btn btn--small" data-ws-check="' + l.id + '">Check my answers</button>' +
        '<span class="ws-scale-result" hidden></span></div></div>';
    }
    return html;
  }

  function scaleKeyHTML(sel) {
    var groups = wsState.classSet
      ? [{ name: 'Class set — same for everyone', items: wsState.scaleItems['__class__'] }]
      : sel.map(function (l) {
          return { name: l.emoji + ' ' + esc(l.name), items: wsState.scaleItems[l.id] };
        });
    var html = '';
    for (var g = 0; g < groups.length; g++) {
      html += '<div class="ws-key-learner"><h3>' + groups[g].name + '</h3><ol class="ws-key-list">';
      for (var a = 0; a < groups[g].items.length; a++) {
        html += '<li>' + esc(F.scaledToSA(groups[g].items[a].answer, 1)) + ' ' + groups[g].items[a].unit + '</li>';
      }
      html += '</ol></div>';
    }
    return html;
  }

  /** Teacher worksheet pack: one sheet per selected learner, plus key. */
  function renderWorksheets() {
    chalStopTimer();
    show('screen-worksheets');
    var body = $('worksheets-body');
    var roster = Store.learners();
    if (!roster.length) {
      body.innerHTML = '<p class="learners-empty">No learners yet — add a learner first.</p>';
      return;
    }
    if (!wsState.ids) wsState.ids = roster.map(function (l) { return l.id; });

    var html = '<div class="ws-options">' +
      '<div class="ws-mode" role="tablist" aria-label="Worksheet type">' +
        '<button type="button" class="ws-mode-tab' + (wsState.mode === 'conv' ? ' ws-mode-tab--on' : '') + '" data-ws-mode="conv" role="tab" aria-selected="' + (wsState.mode === 'conv') + '">Conversions</button>' +
        '<button type="button" class="ws-mode-tab' + (wsState.mode === 'scales' ? ' ws-mode-tab--on' : '') + '" data-ws-mode="scales" role="tab" aria-selected="' + (wsState.mode === 'scales') + '">Read the Scales</button>' +
      '</div>';
    for (var i = 0; i < roster.length; i++) {
      var on = wsState.ids.indexOf(roster[i].id) >= 0;
      html += '<label class="ws-opt"><input type="checkbox" data-ws-learner="' + roster[i].id + '"' +
        (on ? ' checked' : '') + '> ' + roster[i].emoji + ' ' + esc(roster[i].name) + '</label>';
    }
    html += '<label class="ws-opt ws-opt--key"><input type="checkbox" id="ws-class-on"' +
      (wsState.classSet ? ' checked' : '') + '> Class set — same sheet for everyone</label>' +
      '<label class="ws-opt ws-opt--key"><input type="checkbox" id="ws-key-on"' +
      (wsState.withKey ? ' checked' : '') + '> Include answer key</label>' +
      '<button type="button" class="btn btn--small" id="btn-ws-regenerate">New questions</button>' +
      (wsState.mode === 'scales' ? '<button type="button" class="btn btn--small" id="btn-ws-challenge">⚡ Start timed challenge</button>' : '') +
      '</div>';

    var sel = roster.filter(function (l) { return wsState.ids.indexOf(l.id) >= 0; });
    var date = new Date().toLocaleDateString();

    if (wsState.mode === 'scales') {
      html += '<p class="ws-note">' + (wsState.classSet
        ? 'Class scale worksheet: everyone reads the same scales. Type answers on screen and press Check my answers to mark them.'
        : 'Scale worksheets: read the ruler, kitchen scale and measuring jug. Type answers on screen and press Check my answers to mark them.') +
        '</p>';
      html += scaleSheetsHTML(sel, date);
      if (wsState.withKey && sel.length) {
        html += '<div class="ws-answers print-area"><h2 class="report-sec">Answer Key</h2>' + scaleKeyHTML(sel) + '</div>';
      }
    } else {
      var dim = Store.getDimension();
      var dimName = M.DIMENSIONS[dim].name;
      html += '<p class="ws-note">' + (wsState.classSet
        ? 'Class ' + dimName + ' worksheet: everyone gets the same questions.'
        : dimName + ' worksheets: each drills the learner\u2019s weakest conversion pairs, plus 2 word problems.') +
        ' Answers come from the same engine the game uses.</p>';
      for (var s = 0; s < sel.length; s++) {
        var l = sel[s];
        var items = convItemsFor(l, dim);
        var convs = items.filter(function (it) { return it.type === 'conv'; });
        var words = items.filter(function (it) { return it.type === 'word'; });
        html += '<div class="ws-sheet print-area" data-learner="' + l.id + '">' +
          '<div class="ws-head"><div class="ws-brand">Jo⚡Go Metric Master — ' + dimName + ' Worksheet</div>' +
          '<div class="ws-who">For: ' + l.emoji + ' ' + esc(l.name) + ' · ' + date + '</div></div>' +
          '<p class="ws-instruct">Convert these. Write your answer in the box.</p><div class="ws-qs">';
        for (var c = 0; c < convs.length; c++) {
          html += wsLine(convs[c], c + 1);
        }
        html += '</div><p class="ws-instruct ws-instruct--words">Word problems.</p><div class="ws-qs">';
        for (var w = 0; w < words.length; w++) {
          html += wsLine(words[w], convs.length + w + 1);
        }
        html += '</div></div>';
      }
      if (wsState.withKey && sel.length) {
        html += '<div class="ws-answers print-area"><h2 class="report-sec">Answer Key</h2>';
        var keyGroups = wsState.classSet
          ? [{ name: 'Class set — same for everyone', items: wsState.items['__class__:' + dim] }]
          : sel.map(function (l2) {
              return { name: l2.emoji + ' ' + esc(l2.name), items: wsState.items[l2.id + ':' + dim] };
            });
        for (var k = 0; k < keyGroups.length; k++) {
          html += '<div class="ws-key-learner"><h3>' + keyGroups[k].name + '</h3><ol class="ws-key-list">';
          for (var a = 0; a < keyGroups[k].items.length; a++) {
            html += '<li>' + esc(keyGroups[k].items[a].answer) +
              (keyGroups[k].items[a].type === 'word' ? ' <span class="ws-key-unit">(' + esc(keyGroups[k].items[a].from) + ' → ' + esc(keyGroups[k].items[a].to) + ')</span>' : '') +
              '</li>';
          }
          html += '</ol></div>';
        }
        html += '</div>';
      }
    }

    body.innerHTML = html;

    var modeBtns = body.querySelectorAll('[data-ws-mode]');
    for (var mb = 0; mb < modeBtns.length; mb++) {
      modeBtns[mb].addEventListener('click', function () {
        Audio.play('click');
        if (this.getAttribute('data-ws-mode') === wsState.mode) return;
        wsState.mode = this.getAttribute('data-ws-mode');
        wsState.items = {};
        wsState.scaleItems = {};
        renderWorksheets();
      });
    }
    var boxes = body.querySelectorAll('[data-ws-learner]');
    for (var b = 0; b < boxes.length; b++) {
      boxes[b].addEventListener('change', function () {
        var id = this.getAttribute('data-ws-learner');
        var idx = wsState.ids.indexOf(id);
        if (this.checked && idx < 0) wsState.ids.push(id);
        if (!this.checked && idx >= 0) wsState.ids.splice(idx, 1);
        renderWorksheets();
      });
    }
    var keyBox = $('ws-key-on');
    if (keyBox) {
      keyBox.addEventListener('change', function () {
        wsState.withKey = this.checked;
        renderWorksheets();
      });
    }
    var classBox = $('ws-class-on');
    if (classBox) {
      classBox.addEventListener('change', function () {
        wsState.classSet = this.checked;
        wsState.items = {};
        wsState.scaleItems = {};
        renderWorksheets();
      });
    }
    var regen = $('btn-ws-regenerate');
    if (regen) {
      regen.addEventListener('click', function () {
        Audio.play('click');
        wsState.items = {};
        wsState.scaleItems = {};
        renderWorksheets();
      });
    }
    var chalBtn = $('btn-ws-challenge');
    if (chalBtn) {
      chalBtn.addEventListener('click', function () {
        Audio.play('click');
        if (!wsState.classSet) {
          wsState.classSet = true;
          wsState.items = {};
          wsState.scaleItems = {};
          var cb = $('ws-class-on');
          if (cb) cb.checked = true;
        }
        chalState.items = Scales.worksheetItems(null, null);
        chalState.results = [];
        chalState.done = {};
        chalState.learnerId = null;
        renderChallenge();
      });
    }
    var checks = body.querySelectorAll('[data-ws-check]');
    for (var ck = 0; ck < checks.length; ck++) {
      checks[ck].addEventListener('click', function () {
        Audio.play('click');
        var lId = this.getAttribute('data-ws-check');
        var sheet = this.closest('.ws-sheet');
        var items = wsState.scaleItems[wsState.classSet ? '__class__' : lId];
        var inputs = sheet.querySelectorAll('.ws-scale-input');
        var marks = sheet.querySelectorAll('.ws-scale-mark');
        var score = 0, answered = 0;
        for (var j = 0; j < inputs.length; j++) {
          var parsed = Scales.parseInput(inputs[j].value);
          var ok = parsed !== null && parsed === items[j].answer;
          if (parsed !== null) {
            answered++;
            Store.recordScaleFor(lId, items[j].instrument, ok);
            if (ok) score++;
            if (!ok) inputs[j].value = F.scaledToSA(items[j].answer, 1);
          }
          inputs[j].disabled = true;
          inputs[j].classList.add(ok ? 'ws-scale-input--ok' : 'ws-scale-input--bad');
          marks[j].textContent = parsed === null ? '—' : (ok ? '✓' : '✗');
          marks[j].className = 'ws-scale-mark ws-scale-mark--' + (parsed === null ? 'none' : (ok ? 'ok' : 'bad'));
        }
        var res = sheet.querySelector('.ws-scale-result');
        res.hidden = false;
        res.textContent = score + '/' + inputs.length + ' correct' + (answered < inputs.length ? ' · ' + (inputs.length - answered) + ' left blank' : '');
        this.disabled = true;
        this.textContent = 'Marked';
        Audio.play(score === inputs.length ? 'correct' : 'pop');
      });
    }
  }

  // ------------------------------------------------------------------
  // Timed class-set challenge (teacher mode, scales sheets)
  // ------------------------------------------------------------------

  var chalState = {
    learnerId: null,   // who is playing right now
    items: null,       // one shared scale sheet for everyone
    qIndex: 0,
    correct: 0,
    answeredCount: 0,
    startTs: 0,
    deadline: 0,
    duration: 90,
    results: [],       // [{ learner, correct, answered, seconds }] this session
    done: {},          // learnerId -> true once they have played
    submitted: false,
    finished: false,
    timer: null
  };

  function chalStopTimer() {
    if (chalState.timer) { clearInterval(chalState.timer); chalState.timer = null; }
  }

  function chalClockLabel() {
    var s = Math.max(0, Math.ceil((chalState.deadline - Date.now()) / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function chalAccuracy(correct, answered) {
    return answered ? Math.round((correct / answered) * 100) : 0;
  }

  /** Phase pick: choose the time limit, then who is playing next. */
  function renderChallengePick(body) {
    body = body || $('challenge-body');
    var roster = Store.learners();
    var remaining = roster.filter(function (l) { return !chalState.done[l.id]; });
    if (!remaining.length && chalState.results.length) { renderChallengeBoard(body); return; }
    var html = '<div class="chal-card chal-pick">' +
      '<h2 class="chal-h">⚡ Timed Challenge</h2>' +
      '<p class="chal-sub">One shared sheet, ' + chalState.items.length +
      ' scale readings, ' + chalState.duration + 's, one try each — ' +
      'first-try accuracy builds the leaderboard.</p>' +
      '<div class="chal-duration"><span class="chal-dur-label">Time per learner</span>' +
      [60, 90, 120].map(function (d) {
        return '<button type="button" class="btn btn--small chal-dur' + (chalState.duration === d ? ' chal-dur--on' : '') +
          '" data-chal-dur="' + d + '">' + d + 's</button>';
      }).join('') + '</div>' +
      '<div class="chal-who-title">Who is playing?</div>' +
      '<div class="chal-learners">';
    if (!remaining.length) {
      html += '<p class="chal-empty">Everyone has played — start a fresh challenge or see the board.</p>';
    } else {
      html += remaining.map(function (l) {
        return '<button type="button" class="chal-learner" data-chal-learner="' + l.id + '">' +
          '<span class="chal-learner-emoji">' + l.emoji + '</span>' +
          '<span class="chal-learner-name" style="color:' + l.color + '">' + esc(l.name) + '</span></button>';
      }).join('');
    }
    html += '</div><div class="chal-board-actions">';
    if (chalState.results.length) {
      html += '<button type="button" class="btn btn--small" id="btn-chal-board">See the leaderboard</button>';
    }
    html += '</div></div>';
    body.innerHTML = html;
    var durBtns = body.querySelectorAll('[data-chal-dur]');
    for (var d = 0; d < durBtns.length; d++) {
      durBtns[d].addEventListener('click', function () {
        Audio.play('click');
        chalState.duration = Number(this.getAttribute('data-chal-dur'));
        renderChallenge();
      });
    }
    var learners = body.querySelectorAll('[data-chal-learner]');
    for (var lg = 0; lg < learners.length; lg++) {
      learners[lg].addEventListener('click', function () {
        Audio.play('click');
        chalStart(this.getAttribute('data-chal-learner'));
      });
    }
    var boardBtn = $('btn-chal-board');
    if (boardBtn) {
      boardBtn.addEventListener('click', function () { Audio.play('click'); renderChallengeBoard(body); });
    }
  }

  /** Phase play: the clock runs while the learner answers each reading once. */
  function renderChallengePlay(body) {
    body = body || $('challenge-body');
    var item = chalState.items[chalState.qIndex];
    var learner = Store.learners().filter(function (l) { return l.id === chalState.learnerId; })[0];
    body.innerHTML = '<div class="chal-play">' +
      '<div class="chal-top">' +
        '<div class="chal-clock" id="chal-clock" aria-live="off">' + chalClockLabel() + '</div>' +
        '<div class="chal-progress">Item ' + (chalState.qIndex + 1) + ' of ' + chalState.items.length +
          (learner ? ' · ' + learner.emoji + ' ' + esc(learner.name) : '') + '</div>' +
      '</div>' +
      '<div class="scales-q chal-item">' +
        '<p class="scales-prompt">Read the scale. How many ' + Scales.SCALE_SPECS[item.instrument].ask + '?</p>' +
        wsScaleSVG(item) +
        '<div class="scales-answer chal-answer">' +
          '<input class="answer-input scales-input chal-input" id="chal-input" inputmode="decimal" autocomplete="off" aria-label="Your answer" />' +
          '<span class="scales-unit">' + item.unit + '</span>' +
          '<button type="button" class="btn btn--primary" id="btn-chal-check">Check</button>' +
        '</div>' +
        '<p class="chal-fb" id="chal-fb" role="status"></p>' +
      '</div>' +
    '</div>';
    var input = $('chal-input');
    if (input) {
      input.focus();
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); chalSubmit(); }
      });
    }
    var check = $('btn-chal-check');
    if (check) check.addEventListener('click', function () { chalSubmit(); });
    chalState.timer = setInterval(function () {
      var clk = $('chal-clock');
      if (clk) {
        var leftMs = chalState.deadline - Date.now();
        clk.textContent = chalClockLabel();
        clk.classList.toggle('chal-clock--warn', leftMs > 0 && leftMs <= 10000);
      }
      if (Date.now() >= chalState.deadline) chalFinish();
    }, 200);
  }

  function renderChallenge() {
    show('screen-challenge');
    chalStopTimer();
    if (!chalState.items) chalState.items = Scales.worksheetItems(null, null);
    var body = $('challenge-body');
    if (!chalState.learnerId) renderChallengePick(body);
    else renderChallengePlay(body);
  }

  function chalStart(learnerId) {
    // One dialog, one run at a time: ignore rapid repeat taps (double-tap
    // on a shared classroom iPad) that would stack intro overlays or start
    // two races. AC-001 guard.
    if (document.querySelector('.chal-intro-overlay')) return;
    if (chalState.learnerId || chalState.finished) return;
    if (!Store.challengeIntroSeen(learnerId)) {
      showChallengeIntro(learnerId);
      return;
    }
    chalBegin(learnerId);
  }

  function chalBegin(learnerId) {
    // Heal any leftover intro dialogs (e.g. stacked before this guard
    // existed) so their "let's go" buttons can never restart a run.
    var stale = document.querySelectorAll('.chal-intro-overlay');
    for (var i = 0; i < stale.length; i++) stale[i].remove();
    chalState.learnerId = learnerId;
    chalState.qIndex = 0;
    chalState.correct = 0;
    chalState.answeredCount = 0;
    chalState.submitted = false;
    chalState.finished = false;
    chalState.startTs = Date.now();
    chalState.deadline = chalState.startTs + chalState.duration * 1000;
    renderChallenge();
  }

  /** First-time overlay, spoken in kid language. */
  function showChallengeIntro(learnerId) {
    var overlay = el('div', 'overlay chal-intro-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'How the timed challenge works');
    overlay.innerHTML =
      '<div class="overlay-panel chal-intro" role="document">' +
        '<div class="chal-intro-emoji">🏁</div>' +
        '<h2 class="chal-intro-title">Ready, set, GO!</h2>' +
        '<p class="chal-intro-sub">Here is how the race works:</p>' +
        '<ul class="chal-intro-list">' +
          '<li>🧐 <strong>Read</strong> each scale carefully.</li>' +
          '<li>⌨️ <strong>Type</strong> the number, then press Check.</li>' +
          '<li>⏱️ One try each — <strong>no second chances</strong>!</li>' +
          '<li>🏆 Beat the clock and climb the <strong>leaderboard</strong>.</li>' +
        '</ul>' +
        '<button type="button" class="btn btn--primary chal-intro-go">Got it — let\'s go!</button>' +
      '</div>';
    document.body.appendChild(overlay);
    // Show synchronously instead of waiting for the next animation frame:
    // in throttled-frame environments (background tabs, some webviews,
    // energy saver) the frame callback may never fire, leaving the dialog
    // invisible and the learner tap looking dead. AC-001 hardening.
    overlay.classList.add('overlay--show');
    var go = overlay.querySelector('.chal-intro-go');
    go.addEventListener('click', function () {
      Audio.play('click');
      Store.markChallengeIntro(learnerId);
      overlay.classList.remove('overlay--show');
      setTimeout(function () { overlay.remove(); }, 250);
      chalBegin(learnerId);
    });
  }

  function chalSubmit() {
    if (chalState.submitted || chalState.finished) return;
    chalState.submitted = true;
    var input = $('chal-input');
    var fb = $('chal-fb');
    var item = chalState.items[chalState.qIndex];
    var parsed = Scales.parseInput(input.value);
    var ok = parsed !== null && parsed === item.answer;
    Store.recordScaleFor(chalState.learnerId, item.instrument, ok);
    if (ok) chalState.correct++;
    chalState.answeredCount++;
    fb.textContent = ok
      ? '✓ Correct! It reads ' + item.answer + ' ' + item.unit + '.'
      : '✗ Not quite — it reads ' + item.answer + ' ' + item.unit + '.';
    fb.className = 'chal-fb ' + (ok ? 'chal-fb--ok' : 'chal-fb--bad');
    input.disabled = true;
    var check = $('btn-chal-check');
    if (check) check.disabled = true;
    Audio.play(ok ? 'correct' : 'wrong');
    var last = chalState.qIndex >= chalState.items.length - 1;
    setTimeout(function () {
      chalState.submitted = false;
      if (last) { chalFinish(); return; }
      chalState.qIndex++;
      renderChallenge();
    }, ok ? 650 : 1100);
  }

  /** Time up or all items done: record the run and show the score card. */
  function chalFinish() {
    if (chalState.finished) return;
    chalState.finished = true;
    chalStopTimer();
    var answered = chalState.answeredCount;
    var seconds = Math.max(1, Math.round((Date.now() - chalState.startTs) / 1000));
    var learner = Store.learners().filter(function (l) { return l.id === chalState.learnerId; })[0] || {};
    var result = {
      learner: chalState.learnerId,
      name: learner.name || 'Learner',
      emoji: learner.emoji || '',
      correct: chalState.correct,
      total: chalState.items.length,
      answered: answered,
      seconds: seconds
    };
    Store.recordChallenge(result.learner, result.correct, result.total, result.answered, result.seconds);
    chalState.results.push(result);
    chalState.done[result.learner] = true;
    chalState.learnerId = null;
    renderChallengeDone(result);
  }

  /** Phase done: score card, then hand the device to the next learner. */
  function renderChallengeDone(result) {
    show('screen-challenge');
    var body = $('challenge-body');
    var roster = Store.learners();
    var remaining = roster.filter(function (l) { return !chalState.done[l.id]; });
    var allDone = !remaining.length;
    var acc = chalAccuracy(result.correct, result.answered);
    var tier = acc >= 100 ? '🌟' : (acc >= 80 ? '🎉' : (acc >= 50 ? '👍' : '💪'));
    body.innerHTML = '<div class="chal-card chal-done">' +
      '<h2 class="chal-h">' + (allDone ? 'Everyone has played!' : 'Great run!') + '</h2>' +
      '<div class="chal-score">' + result.emoji + ' ' + esc(result.name) + '</div>' +
      '<div class="chal-score-big">' + result.correct + ' <span>/</span> ' + result.total + '</div>' +
      '<div class="chal-score-tier">' + tier + '</div>' +
      '<p class="chal-sub">' + result.answered + ' answered · ' + acc +
      '% first-try · ' + result.seconds + 's</p>' +
      '<div class="chal-board-actions">' +
      (allDone
        ? '<button type="button" class="btn btn--primary" id="btn-chal-board">See the leaderboard</button>'
        : '<button type="button" class="btn btn--primary" id="btn-chal-next">Next learner</button>' +
          '<button type="button" class="btn btn--small" id="btn-chal-board2">Leaderboard</button>') +
      '</div></div>';
    var next = $('btn-chal-next');
    if (next) {
      next.addEventListener('click', function () { Audio.play('click'); renderChallenge(); });
    }
    var board = $('btn-chal-board') || $('btn-chal-board2');
    if (board) {
      board.addEventListener('click', function () { Audio.play('click'); renderChallengeBoard(body); });
    }
  }

  /** Phase board: rank this session's runs by first-try accuracy. */
  function renderChallengeBoard(body) {
    body = body || $('challenge-body');
    var roster = Store.learners();
    var ranked = Store.challengeRank(chalState.results.map(function (r) {
      var l = roster.filter(function (x) { return x.id === r.learner; })[0];
      return {
        learner: r.learner,
        name: (l ? l.emoji + ' ' + l.name : '?'),
        color: l ? l.color : '',
        correct: r.correct,
        answered: r.answered,
        seconds: r.seconds
      };
    }));
    var medals = ['🥇', '🥈', '🥉'];
    var html = '<div class="chal-card chal-board">' +
      '<h2 class="chal-h">🏆 Leaderboard</h2>' +
      '<p class="chal-sub">Ranked by first-try accuracy, then more answered, then time.</p>' +
      '<div class="chal-rows">';
    if (!ranked.length) {
      html += '<p class="chal-empty">No results yet — start a challenge!</p>';
    }
    for (var i = 0; i < ranked.length; i++) {
      var r = ranked[i];
      html += '<div class="chal-row' + (i < 3 ? ' chal-row--top' : '') + '">' +
        '<span class="chal-rank">' + (medals[i] || (i + 1)) + '</span>' +
        '<span class="chal-name" style="color:' + r.color + '">' + r.name + '</span>' +
        '<span class="chal-acc">' + chalAccuracy(r.correct, r.answered) + '%</span>' +
        '<span class="chal-stats">' + r.correct + '/' + r.answered + ' · ' + r.seconds + 's</span>' +
      '</div>';
    }
    html += '</div><div class="chal-board-actions">' +
      '<button type="button" class="btn btn--primary" id="btn-chal-restart">New challenge</button>' +
      '<button type="button" class="btn btn--small" data-chal-done="1">Done</button>' +
      '</div></div>';
    body.innerHTML = html;
    var restart = $('btn-chal-restart');
    if (restart) {
      restart.addEventListener('click', function () {
        Audio.play('click');
        chalState.items = Scales.worksheetItems(null, null);
        chalState.results = [];
        chalState.done = {};
        chalState.learnerId = null;
        renderChallenge();
      });
    }
    var doneBtn = body.querySelector('[data-chal-done]');
    if (doneBtn) {
      doneBtn.addEventListener('click', function () { Audio.play('click'); show('screen-worksheets'); });
    }
  }

  /** Compose the per-learner report as a PDF (mirrors the print layout). */
  function reportPdf(l, prog) {
    var doc = PDF.createDoc({});
    doc.title(l.name + ' — Metric Master Report');
    var firstTryPct = prog.totalAnswered ? Math.round((prog.totalFirstTry / prog.totalAnswered) * 100) : 0;
    doc.subtitle('Stage ' + prog.unlocked + ' unlocked · ' + prog.totalAnswered + ' questions · ' +
      firstTryPct + '% first-try · best streak ' + prog.bestStreak);
    doc.section('Mastery by category');
    var rows = [];
    for (var c = 0; c < Store.CATEGORIES.length; c++) {
      var key = Store.CATEGORIES[c];
      var rec = prog.categories[key];
      rows.push([Store.CATEGORY_LABELS[key], String(rec.attempts), pct(rec), recentPct(rec), masteryPretty(masteryFor(rec))]);
    }
    doc.table([
      { label: 'Category', w: 190 },
      { label: 'Tries', w: 55 },
      { label: 'First-try', w: 75 },
      { label: 'Recent', w: 75 },
      { label: 'Status', w: 100 }
    ], rows);
    doc.section('Conversion pairs');
    var pairKeys = Object.keys(prog.pairs).sort();
    if (!pairKeys.length) {
      doc.para('No conversions answered yet.', { color: '0.42' });
    } else {
      var prs = [];
      for (var p = 0; p < pairKeys.length; p++) {
        var pr = prog.pairs[pairKeys[p]];
        var parts = pairKeys[p].split('>');
        prs.push([parts[0] + ' -> ' + parts[1], String(pr.attempts), pct(pr), recentPct(pr)]);
      }
      doc.table([
        { label: 'Conversion', w: 200 },
        { label: 'Tries', w: 70 },
        { label: 'First-try', w: 80 },
        { label: 'Recent', w: 80 }
      ], prs);
    }
    var sc = prog.scales;
    var anyScale = sc && (sc.ruler.attempts || sc.kitchen.attempts || sc.jug.attempts);
    if (anyScale) {
      doc.section('Scales');
      var srows = [];
      for (var si = 0; si < Store.SCALE_INSTRUMENTS.length; si++) {
        var ins = Store.SCALE_INSTRUMENTS[si];
        var srec = sc[ins];
        srows.push([SCALE_LABELS[ins], String(srec.attempts), pct(srec), recentPct(srec)]);
      }
      doc.table([
        { label: 'Scale', w: 200 },
        { label: 'Tries', w: 70 },
        { label: 'First-try', w: 80 },
        { label: 'Recent', w: 80 }
      ], srows);
    }
    return doc;
  }

  /** Download the current report as a PDF. */
  function exportReportPdf() {
    var roster = Store.learners();
    if (!roster.length) return;
    var current = reportLearnerId && Store.progressOf(reportLearnerId)
      ? reportLearnerId
      : (Store.activeLearner() || roster[0]).id;
    var l = roster.filter(function (x) { return x.id === current; })[0];
    var doc = reportPdf(l, Store.progressOf(current));
    PDF.download(doc.build(), 'Metric-Jumps-Report-' + safeFilename(l.name) + '.pdf');
  }

  /** Download the whole selected worksheet pack as one PDF. */
  function exportWorksheetPdf() {
    var roster = Store.learners();
    var sel = roster.filter(function (l) { return wsState.ids && wsState.ids.indexOf(l.id) >= 0; });
    if (!sel.length) return;
    var date = new Date().toLocaleDateString();
    var doc = PDF.createDoc({});

    if (wsState.mode === 'scales') {
      // Two-column flow: rulers span the full width, kitchen/jug fill the
      // shorter column so a 10-instrument sheet packs into ~2 pages.
      var colX = [44, 44 + 252];
      for (var s = 0; s < sel.length; s++) {
        if (s > 0) doc.pageBreak();
        var l2 = sel[s];
        var sitems = scaleItemsFor(l2);
        doc.title('Metric Master — Read the Scales');
        doc.subtitle('For: ' + l2.name + '  ·  ' + date);
        doc.para('Read each scale and write your answer on the line.', { bold: true });
        doc.blankLine(1);
        var colY = [doc.getY(), doc.getY()];
        for (var q = 0; q < sitems.length; q++) {
          var it = sitems[q];
          var cmds, vbw, vbh, sc;
          if (it.instrument === 'ruler') {
            cmds = Scales.rulerPDF(it.answer, it.level || 'mm'); vbw = 465; vbh = 96; sc = 0.58;
          } else if (it.instrument === 'kitchen') {
            cmds = Scales.kitchenPDF(it.answer); vbw = 380; vbh = 380; sc = 0.42;
          } else {
            cmds = Scales.jugPDF(it.answer); vbw = 260; vbh = 360; sc = 0.42;
          }
          var h = vbh * sc;
          if (it.instrument === 'ruler') {
            var rowY = Math.max(colY[0], colY[1]);
            if (rowY + h + 30 > 790) { doc.pageBreak(); rowY = doc.getY(); colY[0] = colY[1] = rowY; }
            doc.textAt(22, rowY + 6, (q + 1) + '.', 10.5, true, '0.13', 'end');
            scalePDFToDoc(doc, cmds, 44, rowY, sc);
            doc.setY(rowY + h + 4);
            doc.para('Answer: ____________ ' + it.unit, { indent: 40, gap: 2, color: '0.35' });
            colY[0] = colY[1] = rowY + h + 26;
          } else {
            var c = colY[0] <= colY[1] ? 0 : 1;
            if (colY[c] + h + 30 > 790) {
              c = 1 - c;
              if (colY[c] + h + 30 > 790) {
                doc.pageBreak();
                colY[0] = colY[1] = doc.getY();
                c = 0;
              }
            }
            doc.textAt(colX[c] - 22, colY[c] + 6, (q + 1) + '.', 10.5, true, '0.13', 'end');
            scalePDFToDoc(doc, cmds, colX[c], colY[c], sc);
            doc.setY(colY[c] + h + 4);
            doc.para('Answer: ____________ ' + it.unit, { indent: colX[c] - 44 + 4, gap: 2, color: '0.35' });
            colY[c] += h + 30;
          }
        }
      }
      if (wsState.withKey) {
        doc.pageBreak();
        doc.title('Answer Key');
        var sGroups = wsState.classSet
          ? [{ name: 'Class set — same for everyone', items: wsState.scaleItems['__class__'] }]
          : sel.map(function (l3) {
              return { name: l3.name, items: wsState.scaleItems[l3.id] };
            });
        for (var kg = 0; kg < sGroups.length; kg++) {
          doc.section(sGroups[kg].name);
          var kline = [];
          for (var ki = 0; ki < sGroups[kg].items.length; ki++) {
            kline.push((ki + 1) + '. ' + F.scaledToSA(sGroups[kg].items[ki].answer, 1) + ' ' + sGroups[kg].items[ki].unit);
          }
          doc.para(kline.join('    '), { gap: 8 });
        }
      }
      PDF.download(doc.build(), 'Metric-Jumps-Scale-Worksheet-Pack.pdf');
      return;
    }

    var dim = Store.getDimension();
    var dimName = M.DIMENSIONS[dim].name;
    var first = true;
    for (var i = 0; i < sel.length; i++) {
      var l = sel[i];
      if (!first) doc.pageBreak();
      first = false;
      var items = convItemsFor(l, dim);
      var convs = items.filter(function (it) { return it.type === 'conv'; });
      var words = items.filter(function (it) { return it.type === 'word'; });
      doc.title('Metric Master — ' + dimName + ' Worksheet');
      doc.subtitle('For: ' + l.name + '  ·  ' + date);
      doc.para('Convert these. Write your answer in the box.', { bold: true });
      doc.blankLine(2);
      for (var c = 0; c < convs.length; c++) {
        doc.para((c + 1) + '.  ' + convs[c].text + ' ' + convs[c].from + ' = ________ ' + convs[c].to, { gap: 10 });
      }
      doc.blankLine(4);
      doc.para('Word problems.', { bold: true });
      doc.blankLine(2);
      for (var w = 0; w < words.length; w++) {
        doc.para((convs.length + w + 1) + '.  ' + words[w].text, { gap: 2 });
        doc.para('Answer: ____________________', { indent: 22, gap: 12, color: '0.35' });
      }
    }
    if (wsState.withKey) {
      doc.pageBreak();
      doc.title('Answer Key');
      var cGroups = wsState.classSet
        ? [{ name: 'Class set — same for everyone', items: wsState.items['__class__:' + dim] }]
        : sel.map(function (l4) {
            return { name: l4.name, items: wsState.items[l4.id + ':' + dim] };
          });
      for (var k = 0; k < cGroups.length; k++) {
        doc.section(cGroups[k].name);
        var ans = cGroups[k].items.map(function (it) { return it.answer; });
        for (var a = 0; a < ans.length; a += 5) {
          doc.para(ans.slice(a, a + 5).map(function (x, j) { return (a + j + 1) + '. ' + x; }).join('    '), { gap: 8 });
        }
      }
    }
    PDF.download(doc.build(), 'Metric-Jumps-Worksheet-Pack.pdf');
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
    showNextButton: showNextButton,
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
    renderReport: renderReport,
    renderWorksheets: renderWorksheets,
    renderChallenge: renderChallenge,
    exportReportPdf: exportReportPdf,
    exportWorksheetPdf: exportWorksheetPdf,
    renderDimensionPills: renderDimensionPills,
    renderHomeLadders: renderHomeLadders,
    ladderHtml: ladderHtml,
    renderScales: renderScales,
    setSoundIcons: setSoundIcons,
    showIntroOverlay: showIntroOverlay,
    closeIntroOverlay: closeIntroOverlay
  };

  root.JOGO = root.JOGO || {};
  root.JOGO.UI = UI;
})(typeof self !== 'undefined' ? self : this);
