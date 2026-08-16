/**
 * ui.js — Tick⚡Tock (mini-app experiment)
 * Rendering + interaction. All screens are data-driven; the clock face is
 * drawn once as SVG geometry (screen) and reused as vector PDF commands
 * (print/export) — the "print/PDF first-class" lesson.
 */
(function (root) {
  'use strict';

  var C = root.JOGO.Clock;
  var Store = root.JOGO.Store;
  var PDF = root.JOGO.PDF;
  var Audio = root.JOGO.Audio;

  var store = Store.createStore();

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('screen--active', screens[i].id === name);
    }
    var el = $(name);
    if (el) el.scrollTop = 0;
  }

  function showOverlay(id) { $(id).classList.add('overlay--show'); }
  function closeOverlay(id) { $(id).classList.remove('overlay--show'); }
  function closeAllOverlays() {
    var o = document.querySelectorAll('.overlay');
    for (var i = 0; i < o.length; i++) o[i].classList.remove('overlay--show');
  }

  var session = { level: 'whole', q: null, done: 0, target: 10, correct: 0, firstTry: true, locked: false, practiceAll: false };

  // ------------------------------------------------------------------
  // Clock geometry — one source of truth for SVG and PDF
  // ------------------------------------------------------------------

  function pt(cx, cy, r, angleDeg) {
    var a = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  /**
   * Endpoints for a hand drawn as a THICK STROKED line with round caps.
   * Polygon hands degenerate to zero area at cardinal angles (12/3/6/9 —
   * exactly the Whole & Half minutes 0/15/30/45), so the minute hand was
   * invisible for the whole first level. Stroke width is applied
   * perpendicular to the path by the renderer, so it can never vanish.
   */
  function handLine(cx, cy, angleDeg, len, width) {
    var tip = pt(cx, cy, len, angleDeg);
    var tail = pt(cx, cy, -0.14 * len, angleDeg);
    return { x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y };
  }

  /** SVG string for a clock face (q = {h, m}). */
  function clockSvg(q, size) {
    size = size || 220;
    var cx = size / 2, cy = size / 2, r = size / 2 - 8;
    var s = '<svg class="clock-face" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="A clock showing a time">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff" stroke="#2B2A33" stroke-width="4"/>';
    // 60 minute ticks, 12 hour ticks
    for (var i = 0; i < 60; i++) {
      var big = i % 5 === 0;
      var a1 = pt(cx, cy, r - (big ? 12 : 5), i * 6);
      var a2 = pt(cx, cy, r - (big ? 4 : 1), i * 6);
      s += '<line x1="' + a1.x.toFixed(1) + '" y1="' + a1.y.toFixed(1) + '" x2="' + a2.x.toFixed(1) + '" y2="' + a2.y.toFixed(1) + '" stroke="#2B2A33" stroke-width="' + (big ? 3.5 : 1.5) + '"/>';
    }
    // numbers 12..11
    for (var n = 1; n <= 12; n++) {
      var p = pt(cx, cy, r - 20, n * 30);
      s += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + size * 0.028).toFixed(1) + '" text-anchor="middle" font-size="' + (size * 0.085).toFixed(1) + '" font-weight="800" fill="#2B2A33" font-family="inherit">' + n + '</text>';
    }
    var h = C.handsFor(q.h, q.m);
    // High-contrast hands: near-black hour, vivid RED minute (classroom
    // convention), drawn as round-capped strokes so they paint at ANY angle.
    var hh = handLine(cx, cy, h.hour, r * 0.52, r * 0.12);
    var mh = handLine(cx, cy, h.minute, r * 0.72, r * 0.08);
    s += '<line x1="' + hh.x1.toFixed(1) + '" y1="' + hh.y1.toFixed(1) + '" x2="' + hh.x2.toFixed(1) + '" y2="' + hh.y2.toFixed(1) + '" stroke="#1A1A1F" stroke-width="' + (r * 0.12).toFixed(1) + '" stroke-linecap="round"/>';
    s += '<line x1="' + mh.x1.toFixed(1) + '" y1="' + mh.y1.toFixed(1) + '" x2="' + mh.x2.toFixed(1) + '" y2="' + mh.y2.toFixed(1) + '" stroke="#E64545" stroke-width="' + (r * 0.08).toFixed(1) + '" stroke-linecap="round"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.06).toFixed(1) + '" fill="#1A1A1F"/>';
    s += '</svg>';
    return s;
  }

  /** Draw the same clock into a PDF doc at (cx, cy, r). */
  function clockPdf(doc, cx, cy, r, q) {
    doc.circle(cx, cy, r, { fill: '#ffffff', stroke: '0.2', sw: 1.1 });
    for (var i = 0; i < 60; i++) {
      var big = i % 5 === 0;
      var a1 = pt(cx, cy, r - (big ? 9 : 4), i * 6);
      var a2 = pt(cx, cy, r - (big ? 3 : 1), i * 6);
      doc.line(a1.x, a1.y, a2.x, a2.y, { color: '0.2', width: big ? 1.4 : 0.6 });
    }
    for (var n = 1; n <= 12; n++) {
      var p = pt(cx, cy, r - 15, n * 30);
      doc.textAt(p.x, p.y, String(n), 8.5, true, '0.2', 'middle');
    }
    var h = C.handsFor(q.h, q.m);
    // PDF hands match the screen: thick stroked lines (never degenerate),
    // near-black hour, red minute, dark hub.
    var hh = handLine(cx, cy, h.hour, r * 0.52, r * 0.12);
    var mh = handLine(cx, cy, h.minute, r * 0.72, r * 0.08);
    doc.line(hh.x1, hh.y1, hh.x2, hh.y2, { color: '0.04', width: r * 0.12 });
    doc.line(mh.x1, mh.y1, mh.x2, mh.y2, { color: '0.902 0.271 0.271', width: r * 0.08 });
    doc.circle(cx, cy, r * 0.06, { fill: '0.04' });
  }

  // ------------------------------------------------------------------
  // Home
  // ------------------------------------------------------------------

  function updateLearnerChip() {
    var a = store.activeLearner();
    var av = $('learner-chip-avatar'), nm = $('learner-chip-name'), hud = $('btn-learner-hud');
    if (av) av.textContent = a ? a.emoji : '🎒';
    if (nm) { nm.textContent = a ? a.name : 'Pick a learner'; nm.style.color = a ? a.color : ''; }
    if (hud) hud.textContent = a ? a.emoji : '🎒';
  }

  function renderHomeClock() {
    var box = $('home-clock');
    if (box) box.innerHTML = clockSvg({ h: 10, m: 10 }, 150);
    var how = $('how-clock');
    if (how) how.innerHTML = clockSvg({ h: 3, m: 45 }, 200);
  }

  function renderLevelPills() {
    var box = $('level-pills');
    if (!box) return;
    var a = store.activeLearner();
    var unlocked = a ? store.unlockedLevels(a.id) : { whole: true, five: true, one: true };
    var html = '';
    for (var i = 0; i < C.LEVELS.length; i++) {
      var lv = C.LEVELS[i];
      var on = lv.key === session.level;
      var open = session.practiceAll || unlocked[lv.key];
      html += '<button type="button" class="level-pill' + (on ? ' level-pill--on' : '') + (open ? '' : ' level-pill--locked') + '" data-level="' + lv.key + '"' + (open ? '' : ' disabled aria-disabled="true"') + '>' +
        esc(lv.name) + (open ? '' : ' 🔒') + '</button>';
    }
    box.innerHTML = html;
    var btns = box.querySelectorAll('[data-level]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        Audio.play('click');
        session.level = this.getAttribute('data-level');
        renderLevelPills();
      });
    }
  }

  function renderHome() {
    show('screen-home');
    updateLearnerChip();
    renderHomeClock();
    renderLevelPills();
  }

  function setSoundIcons() {
    var els = document.querySelectorAll('[data-role="sound-icon"]');
    var on = store.sound();
    for (var i = 0; i < els.length; i++) els[i].textContent = on ? '🔊' : '🔇';
  }

  // ------------------------------------------------------------------
  // Game
  // ------------------------------------------------------------------

  function ask() {
    session.q = C.generate(C.levelByKey(session.level));
    session.firstTry = true;
    buildKeypad(); // restore the digit keypad after the Next button
    var stage = $('clock-stage');
    if (stage) stage.innerHTML = clockSvg(session.q, 230);
    // The line under the clock TEACHES the reading rule for this level
    // (method only — never the answer). The format example lives in the
    // answer box's placeholder instead.
    var sub = $('q-sub');
    if (sub) sub.textContent = '💡 ' + C.hint(session.level);
    var hud = $('hud-stage');
    if (hud) hud.textContent = 'Level: ' + C.levelByKey(session.level).name;
    renderProgress();
    var disp = $('key-display');
    if (disp) updateDisplay();
    var fb = $('feedback');
    if (fb) { fb.hidden = true; fb.className = 'feedback'; }
  }
  function sample() {
    return session.q.m < 10 ? session.q.h + ':0' + session.q.m : session.q.h + ':' + session.q.m;
  }

  function renderProgress() {
    var box = $('hud-progress');
    if (!box) return;
    var dots = '';
    for (var i = 0; i < session.target; i++) dots += '<span class="prog-dot' + (i < session.done ? ' prog-dot--done' : '') + '"></span>';
    box.innerHTML = dots;
  }


  // ------------------------------------------------------------------
  // Keypad: digits build a buffer shown in a display; Check submits.
  // ------------------------------------------------------------------

  var answerBuffer = '';

  function buildKeypad() {
    var box = $('keypad');
    if (!box) return;
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ':', '0', '⌫'];
    var html = '<div class="answer-display" id="key-display" aria-live="polite">' + (answerBuffer || '&nbsp;') + '</div>';
    html += keys.map(function (k) {
      return '<button type="button" class="key" data-key="' + k + '">' + k + '</button>';
    }).join('');
    html += '<button type="button" class="key key--check" data-key="check">✓ Check</button>';
    box.innerHTML = html;
    var btns = box.querySelectorAll('[data-key]');
    for (var b = 0; b < btns.length; b++) btns[b].addEventListener('click', onKey);
  }

  function onKey() {
    if (session.locked) return; // awaiting the Next tap — the question is done
    var k = this.getAttribute('data-key');
    if (k === 'check') { submitAnswer(); return; }
    if (k === '⌫') { answerBuffer = answerBuffer.slice(0, -1); }
    else { answerBuffer = (answerBuffer + k).slice(0, 6); }
    updateDisplay();
    Audio.play('click');
  }

  function updateDisplay() {
    var d = $('key-display');
    if (!d) return;
    if (answerBuffer) {
      d.textContent = answerBuffer;
      d.classList.remove('answer-display--empty');
    } else {
      d.textContent = 'e.g. 3:45';
      d.classList.add('answer-display--empty');
    }
  }

  function startGame() {
    var a = store.activeLearner();
    if (!a) { renderLearners(); return; } // never silently default
    session.done = 0; session.correct = 0; session.locked = false;
    answerBuffer = '';
    // First-ever play: teach HOW to read a clock before the first question.
    if (showIntro()) return;
    beginRound();
  }

  function beginRound() {
    show('screen-game');
    ask();
  }

  /** Show the one-time teaching overlay for a learner; true if it showed. */
  function showIntro() {
    var a = store.activeLearner();
    if (!a || store.seenIntro(a.id)) return false;
    var box = $('intro-clock');
    if (box) box.innerHTML = clockSvg({ h: 3, m: 45 }, 150);
    showOverlay('intro-backdrop');
    return true;
  }

  function submitAnswer() {
    if (session.locked) return;
    var raw = answerBuffer;
    if (!raw) return;
    var a = store.activeLearner();
    var res = C.judge(session.q, raw);
    answerBuffer = ''; updateDisplay();
    if (res === 'invalid') {
      Audio.play('wrong');
      showFeedback('Hmm, that does not look like a time. Type it like 3:45.', false);
      return;
    }
    if (res === 'format-colon' || res === 'format-pad') {
      // Right time, wrong presentation — teach it, don't count it as a
      // wrong attempt and don't reveal a new question. The child retypes
      // (firstTry is left untouched: formatting is not comprehension).
      Audio.play('wrong');
      var msg = res === 'format-colon'
        ? 'So close! That is the right time — but something is missing: the little colon : between the hours and the minutes, like ' + sample() + '. Type it again!'
        : 'So close! That is the right time — but the minutes need two digits, like ' + sample() + '. Type it again!';
      showFeedback(msg, false);
      return;
    }
    if (res === 'wrong') {
      Audio.play('wrong');
      session.firstTry = false;
      showFeedback('Not quite — ' + C.feedback(session.q) + ' Try again!', false);
      return;
    }
    // correct
    store.record(a.id, session.level, session.firstTry);
    Audio.play('correct');
    session.correct++;
    showFeedback('Yes! ' + sample() + ' — ' + C.feedback(session.q), true);
    session.locked = true;
    showNext();
  }

  /** Replace the keypad with a Next button so the child can sit with the
   *  feedback as long as they need, then advance on their own tap. */
  function showNext() {
    var box = $('keypad');
    if (!box) return;
    box.innerHTML = '<button type="button" class="key key--next" data-key="next">Next question →</button>';
    var b = box.querySelector('[data-key="next"]');
    if (b) b.addEventListener('click', nextQuestion);
  }

  function nextQuestion() {
    if (!session.locked) return;
    session.done++;
    if (session.done >= session.target) { finishGame(); return; }
    session.locked = false;
    ask();
  }

  function showFeedback(msg, ok) {
    var fb = $('feedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.className = 'feedback ' + (ok ? 'feedback--ok' : 'feedback--no');
    fb.hidden = false;
  }

  function finishGame() {
    var a = store.activeLearner();
    var msg = a ? (a.emoji + ' ' + esc(a.name)) : '';
    showModal('Round complete!', msg + ' got ' + session.correct + ' of ' + session.target + ' on the first try. ' +
      (session.correct >= 8 ? 'Amazing — the clock is your friend! 🎉' : session.correct >= 5 ? 'Great reading! Keep going! 👍' : 'Practice makes perfect — have another go! 💪'),
      function () { renderHome(); });
    Audio.play('complete');
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------

  var modalCb = null;
  function showModal(title, text, cb) {
    modalCb = cb || null;
    $('modal-title').textContent = title;
    $('modal-text').textContent = text;
    showOverlay('modal-backdrop');
  }

  // ------------------------------------------------------------------
  // Learners
  // ------------------------------------------------------------------

  var editingId = null;
  var pickEmoji = Store.AVATARS[0];
  var pickColor = Store.COLORS[0];

  function renderLearners() {
    showOverlay('learners-backdrop');
    renderLearnersList();
    renderLearnerForm();
  }

  function renderLearnersList() {
    var box = $('learners-list');
    var roster = store.learners();
    var html = '';
    for (var i = 0; i < roster.length; i++) {
      var l = roster[i];
      html += '<div class="learner-row">' +
        '<span>' + l.emoji + '</span>' +
        '<span class="grow" style="color:' + l.color + '">' + esc(l.name) + '</span>' +
        '<button type="button" class="btn-icon" data-edit="' + l.id + '" aria-label="Rename ' + esc(l.name) + '">✎</button>' +
        '<button type="button" class="btn-icon" data-del="' + l.id + '" aria-label="Remove ' + esc(l.name) + '">🗑</button>' +
        '</div>';
    }
    box.innerHTML = html || '<p class="learners-empty">No learners yet — add one below.</p>';
    var edits = box.querySelectorAll('[data-edit]');
    for (var e = 0; e < edits.length; e++) {
      edits[e].addEventListener('click', function () {
        Audio.play('click');
        var id = this.getAttribute('data-edit');
        var l = store.learners().filter(function (x) { return x.id === id; })[0];
        editingId = id;
        $('learner-name-input').value = l.name;
        pickEmoji = l.emoji; pickColor = l.color;
        renderLearnerForm();
      });
    }
    var dels = box.querySelectorAll('[data-del]');
    for (var d = 0; d < dels.length; d++) {
      dels[d].addEventListener('click', function () {
        var id = this.getAttribute('data-del');
        var l = store.learners().filter(function (x) { return x.id === id; })[0];
        showModal('Remove ' + l.name + '?', 'Their progress is deleted on this device.', function () {
          store.removeLearner(id);
          closeOverlay('modal-backdrop');
          renderLearnersList();
          updateLearnerChip();
          renderLevelPills();
        });
      });
    }
    // tap a row to select that learner and dismiss the sheet
    var rows = box.querySelectorAll('.learner-row');
    for (var r = 0; r < rows.length; r++) {
      rows[r].addEventListener('click', function (ev) {
        if (ev.target.closest('[data-edit],[data-del]')) return;
        var name = this.querySelector('.grow').textContent;
        var l = store.learners().filter(function (x) { return x.name === name; })[0];
        if (l) { store.setActive(l.id); updateLearnerChip(); renderLevelPills(); closeOverlay('learners-backdrop'); }
      });
    }
  }

  function renderLearnerForm() {
    var form = $('learner-form');
    var emojis = $('learner-emojis');
    var colors = $('learner-colors');
    // suggest the first unused avatar
    var used = {};
    store.learners().forEach(function (l) { used[l.emoji] = true; });
    if (!editingId) {
      for (var i = 0; i < Store.AVATARS.length; i++) if (!used[Store.AVATARS[i]]) { pickEmoji = Store.AVATARS[i]; break; }
    }
    var eh = '';
    for (var e = 0; e < Store.AVATARS.length; e++) {
      var on = Store.AVATARS[e] === pickEmoji;
      eh += '<button type="button" class="learner-emoji' + (on ? ' learner-emoji--selected' : '') + '" data-emoji="' + Store.AVATARS[e] + '" role="radio" aria-checked="' + on + '">' + Store.AVATARS[e] + '</button>';
    }
    emojis.innerHTML = eh;
    var ch = '';
    for (var c = 0; c < Store.COLORS.length; c++) {
      var co = Store.COLORS[c] === pickColor;
      ch += '<button type="button" class="color-swatch' + (co ? ' color-swatch--selected' : '') + '" data-color="' + Store.COLORS[c] + '" style="background:' + Store.COLORS[c] + '" role="radio" aria-checked="' + co + '" aria-label="Colour ' + (c + 1) + '"></button>';
    }
    colors.innerHTML = ch;
    $('learner-add').textContent = editingId ? 'Save changes' : 'Add learner';
    var eb = emojis.querySelectorAll('[data-emoji]');
    for (var i2 = 0; i2 < eb.length; i2++) {
      eb[i2].addEventListener('click', function () {
        pickEmoji = this.getAttribute('data-emoji');
        renderLearnerForm();
      });
    }
    var cb = colors.querySelectorAll('[data-color]');
    for (var i3 = 0; i3 < cb.length; i3++) {
      cb[i3].addEventListener('click', function () {
        pickColor = this.getAttribute('data-color');
        renderLearnerForm();
      });
    }
  }

  // ------------------------------------------------------------------
  // Teacher mode (long-press the logo or press T)
  // ------------------------------------------------------------------

  function showPin() {
    $('pin-input').value = '';
    var err = $('pin-err');
    if (err) err.hidden = true;
    showOverlay('pin-backdrop');
  }

  function openTeacher() {
    closeOverlay('pin-backdrop');
    showOverlay('teacher-backdrop');
  }

  function closeTeacher() { closeOverlay('teacher-backdrop'); }

  /** Teacher guide: the first five minutes, exactly as a child sees them. */
  function openGuide() {
    closeTeacher();
    showOverlay('guide-backdrop');
  }

  // ------------------------------------------------------------------
  // Report
  // ------------------------------------------------------------------

  var reportLearnerId = null;

  function masteryOf(rec) {
    if (rec.firstTry >= 5) return { label: 'Mastered', cls: 'm-badge--mastered' };
    if (rec.attempts >= 3) return { label: 'Getting there', cls: 'm-badge--progress' };
    return { label: 'New', cls: 'm-badge--new' };
  }

  function renderReport() {
    show('screen-report');
    var body = $('report-body');
    var roster = store.learners();
    if (!roster.length) { body.innerHTML = '<p>No learners yet — add a learner first.</p>'; return; }
    if (!reportLearnerId || !store.progressOf(reportLearnerId)) reportLearnerId = (store.activeLearner() || roster[0]).id;
    var l = roster.filter(function (x) { return x.id === reportLearnerId; })[0];
    var prog = store.progressOf(reportLearnerId);

    var chips = '';
    for (var i = 0; i < roster.length; i++) {
      var on = roster[i].id === reportLearnerId;
      chips += '<button type="button" class="report-chip' + (on ? ' report-chip--on' : '') + '" style="color:' + roster[i].color + '" data-report="' + roster[i].id + '">' + roster[i].emoji + ' ' + esc(roster[i].name) + '</button>';
    }
    $('report-picker').innerHTML = chips;

    var rows = '';
    for (var k = 0; k < C.LEVELS.length; k++) {
      var lv = C.LEVELS[k];
      var rec = prog[lv.key];
      var pct = rec.attempts ? Math.round((rec.firstTry / rec.attempts) * 100) : 0;
      var m = masteryOf(rec);
      rows += '<tr><td>' + esc(lv.name) + '</td><td>' + rec.attempts + '</td><td>' + pct + '%</td>' +
        '<td><span class="m-badge ' + m.cls + '">' + m.label + '</span></td></tr>';
    }
    body.innerHTML = '<h2 style="color:' + l.color + '">' + l.emoji + ' ' + esc(l.name) + ' — Report</h2>' +
      '<table class="tbl"><thead><tr><th>Level</th><th>Tries</th><th>First-try</th><th>Status</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<p class="ws-label">Levels unlock: ' + esc(C.LEVELS[0].name) + ' → ' + esc(C.LEVELS[1].name) + ' → ' + esc(C.LEVELS[2].name) + ' (5 first-tries each).</p>';

    var chips2 = $('report-picker').querySelectorAll('[data-report]');
    for (var c = 0; c < chips2.length; c++) {
      chips2[c].addEventListener('click', function () {
        Audio.play('click');
        reportLearnerId = this.getAttribute('data-report');
        renderReport();
      });
    }
  }

  function exportReportPdf() {
    var l = store.learners().filter(function (x) { return x.id === reportLearnerId; })[0];
    if (!l) return;
    var prog = store.progressOf(l.id);
    var doc = PDF.createDoc();
    doc.title('TickTock — ' + l.name + ' report');
    doc.subtitle('Per-learner clock-reading progress · ' + new Date().toLocaleDateString());
    var rows = [];
    for (var k = 0; k < C.LEVELS.length; k++) {
      var rec = prog[C.LEVELS[k].key];
      var pct = rec.attempts ? Math.round((rec.firstTry / rec.attempts) * 100) : 0;
      rows.push([C.LEVELS[k].name, String(rec.attempts), pct + '%', masteryOf(rec).label]);
    }
    doc.table([{ label: 'Level', w: 120 }, { label: 'Tries', w: 70 }, { label: 'First-try', w: 90 }, { label: 'Status', w: 100 }], rows);
    PDF.download(doc.build(), 'TickTock-Report-' + l.name.replace(/[^a-z0-9]/gi, '') + '.pdf');
  }

  // ------------------------------------------------------------------
  // Worksheets
  // ------------------------------------------------------------------

  var wsState = { learners: [], level: 'whole', seed: 1, showKey: false, generated: false };

  function renderWorksheets() {
    show('screen-worksheets');
    var roster = store.learners();
    if (!roster.length) { $('ws-sheets').innerHTML = '<p>No learners yet — add a learner first.</p>'; return; }
    if (!wsState.learners.length) wsState.learners = roster.map(function (l) { return l.id; });
    renderWsControls(roster);
    if (wsState.generated) renderWsSheets();
  }

  function renderWsControls(roster) {
    var lbox = $('ws-learners');
    var html = '';
    for (var i = 0; i < roster.length; i++) {
      var l = roster[i];
      var on = wsState.learners.indexOf(l.id) >= 0;
      html += '<label class="ws-check"><input type="checkbox" data-wl="' + l.id + '"' + (on ? ' checked' : '') + '> ' + l.emoji + ' <span style="color:' + l.color + '">' + esc(l.name) + '</span></label>';
    }
    lbox.innerHTML = html;
    var cbs = lbox.querySelectorAll('[data-wl]');
    for (var c = 0; c < cbs.length; c++) {
      cbs[c].addEventListener('change', function () {
        var id = this.getAttribute('data-wl');
        if (this.checked && wsState.learners.indexOf(id) < 0) wsState.learners.push(id);
        if (!this.checked) wsState.learners = wsState.learners.filter(function (x) { return x !== id; });
      });
    }
    var vbox = $('ws-levels');
    var vhtml = '';
    for (var v = 0; v < C.LEVELS.length; v++) {
      var on2 = C.LEVELS[v].key === wsState.level;
      vhtml += '<button type="button" class="level-pill' + (on2 ? ' level-pill--on' : '') + '" data-wlvl="' + C.LEVELS[v].key + '">' + esc(C.LEVELS[v].name) + '</button>';
    }
    vbox.innerHTML = vhtml;
    var vbtns = vbox.querySelectorAll('[data-wlvl]');
    for (var b = 0; b < vbtns.length; b++) {
      vbtns[b].addEventListener('click', function () {
        wsState.level = this.getAttribute('data-wlvl');
        renderWsControls(roster);
        if (wsState.generated) renderWsSheets();
      });
    }
    $('ws-key-toggle').textContent = wsState.showKey ? 'Hide answer key' : 'Show answer key';
  }

  function generateSheet() {
    if (!wsState.learners.length) { showModal('Pick a learner', 'Tick at least one learner to make a sheet for.', null); return; }
    wsState.seed = (wsState.seed + 101) >>> 0;
    wsState.showKey = false;
    wsState.generated = true;
    renderWsSheets();
  }

  function renderWsSheets() {
    var box = $('ws-sheets');
    var level = C.levelByKey(wsState.level);
    var ws = C.worksheet(level, 6, wsState.seed);
    var roster = store.learners().filter(function (l) { return wsState.learners.indexOf(l.id) >= 0; });
    var html = '';
    for (var s = 0; s < roster.length; s++) {
      var l = roster[s];
      html += '<div class="ws-sheet">' +
        '<h3 style="color:' + l.color + '">' + l.emoji + ' ' + esc(l.name) + ' — Read the clocks (' + esc(level.name) + ')</h3>' +
        '<div class="ws-grid">';
      for (var i = 0; i < ws.items.length; i++) {
        html += '<div class="ws-item">' + clockSvg(ws.items[i], 120) +
          (wsState.showKey ? '<div class="ws-key">' + C.answerText(ws.items[i]) + '</div>' : '<div class="ws-answer-line"></div>') +
          '</div>';
      }
      html += '</div></div>';
    }
    if (wsState.showKey) {
      html += '<div class="ws-sheet"><h3>Answer key — ' + esc(level.name) + '</h3><p>' +
        ws.items.map(function (q) { return C.answerText(q); }).join(' · ') + '</p></div>';
    }
    box.innerHTML = html;
  }

  function exportWorksheetPdf() {
    var level = C.levelByKey(wsState.level);
    var ws = C.worksheet(level, 6, wsState.seed);
    var roster = store.learners().filter(function (l) { return wsState.learners.indexOf(l.id) >= 0; });
    var doc = PDF.createDoc({ margin: 40 });
    var cell = 130, gap = 28, x0 = 40, y0 = 110;
    for (var s = 0; s < roster.length; s++) {
      doc.title('TickTock — ' + roster[s].name + ' worksheet (' + level.name + ')');
      doc.subtitle('Read each clock and write the time.');
      for (var i = 0; i < ws.items.length; i++) {
        var col = i % 3, row = Math.floor(i / 3);
        var cx = x0 + col * (cell + gap) + cell / 2;
        var cy = y0 + row * (cell + 40);
        if (cy + cell > 740) { doc.pageBreak(); y0 = 90; row = 0; col = 0; cx = x0 + cell / 2; cy = y0; }
        doc.textAt(cx - 60, cy - 66, String(i + 1) + '.', 9, true, '0.3');
        clockPdf(doc, cx, cy, cell / 2, ws.items[i]);
        doc.line(cx - 45, cy + cell / 2 + 18, cx + 45, cy + cell / 2 + 18, { color: '0.35', width: 0.9 });
      }
      doc.pageBreak();
    }
    doc.title('Answer key — ' + level.name);
    for (var a = 0; a < ws.items.length; a++) {
      doc.textAt(40, 90 + a * 22, String(a + 1) + '.  ' + C.answerText(ws.items[a]), 12, true, '0.2');
    }
    PDF.download(doc.build(), 'TickTock-Worksheet-' + level.key + '.pdf');
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------

  function wire() {
    document.addEventListener('click', function () { Audio.unlock(); }, { once: true });

    $('btn-learner').addEventListener('click', function () { Audio.play('click'); renderLearners(); });
    var hud = $('btn-learner-hud');
    if (hud) hud.addEventListener('click', function () { Audio.play('click'); renderLearners(); });
    $('btn-play').addEventListener('click', function () { Audio.play('click'); startGame(); });
    $('btn-worksheets').addEventListener('click', function () { Audio.play('click'); renderWorksheets(); });
    $('btn-how').addEventListener('click', function () { Audio.play('click'); show('screen-how'); renderHomeClock(); });

    $('home-sound').addEventListener('click', function () {
      var on = !store.sound();
      store.setSound(on);
      Audio.setMuted(!on);
      setSoundIcons();
    });

    // back buttons
    var backs = document.querySelectorAll('[data-back]');
    for (var b = 0; b < backs.length; b++) {
      backs[b].addEventListener('click', function () { Audio.play('click'); show(this.getAttribute('data-back')); });
    }
    // overlay close buttons
    var closes = document.querySelectorAll('[data-close]');
    for (var c = 0; c < closes.length; c++) {
      closes[c].addEventListener('click', function () { Audio.play('click'); closeAllOverlays(); });
    }

    // learner form (add or save edit)
    $('learner-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = $('learner-name-input').value.trim();
      if (!name) return;
      var added = null;
      if (editingId) {
        store.renameLearner(editingId, name, pickEmoji, pickColor);
        editingId = null;
      } else {
        added = store.addLearner(name, pickEmoji, pickColor);
      }
      $('learner-name-input').value = '';
      // pick the new learner and dismiss the sheet so the child lands on home
      if (added) store.setActive(added.id);
      updateLearnerChip();
      renderLevelPills();
      renderLearnersList();
      renderLearnerForm();
      closeOverlay('learners-backdrop');
    });

    // PIN
    $('pin-go').addEventListener('click', tryPin);
    $('pin-input').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tryPin(); });

    // teacher panel
    var tacts = document.querySelectorAll('#teacher-backdrop [data-action]');
    for (var t = 0; t < tacts.length; t++) {
      tacts[t].addEventListener('click', function () {
        var act = this.getAttribute('data-action');
        Audio.play('click');
        if (act === 'guide') { openGuide(); }
        else if (act === 'practice') { session.practiceAll = true; closeTeacher(); renderHome(); }
        else if (act === 'report') { closeTeacher(); renderReport(); }
        else if (act === 'worksheets') { closeTeacher(); renderWorksheets(); }
        else if (act === 'learners') { closeTeacher(); renderLearners(); }
        else if (act === 'reset') {
          var who = store.activeLearner();
          showModal('Reset ' + (who ? who.name + '?' : 'progress?'), 'This clears their clock progress on this device.', function () {
            store.reset();
            closeOverlay('modal-backdrop');
            closeTeacher();
            renderHome();
          });
        }
        else if (act === 'lock') { session.practiceAll = false; closeTeacher(); renderHome(); }
      });
    }

    // first-play teaching overlay
    $('intro-go').addEventListener('click', function () {
      var a = store.activeLearner();
      if (a) store.markIntro(a.id);
      closeOverlay('intro-backdrop');
      Audio.play('unlock');
      beginRound();
    });

    // modal
    $('modal-ok').addEventListener('click', function () {
      closeOverlay('modal-backdrop');
      if (modalCb) { var cb = modalCb; modalCb = null; cb(); }
    });

    // report actions
    $('btn-report-print').addEventListener('click', function () { window.print(); });
    $('btn-report-pdf').addEventListener('click', function () { exportReportPdf(); });

    // worksheet actions
    $('ws-generate').addEventListener('click', function () { Audio.play('click'); generateSheet(); });
    $('ws-new').addEventListener('click', function () { Audio.play('click'); generateSheet(); });
    $('ws-key-toggle').addEventListener('click', function () {
      wsState.showKey = !wsState.showKey;
      if (wsState.generated) renderWsSheets();
      renderWsControls(store.learners());
    });
    $('ws-print').addEventListener('click', function () { window.print(); });
    $('ws-pdf').addEventListener('click', function () { exportWorksheetPdf(); });

    // teacher trigger: long-press the logo or press T
    var brand = $('brand-logo') || document.querySelector('.brand');
    if (brand) {
      var timer = null;
      brand.addEventListener('pointerdown', function () {
        timer = setTimeout(function () { timer = null; showPin(); }, 600);
      });
      brand.addEventListener('pointerup', function () { if (timer) { clearTimeout(timer); timer = null; } });
      brand.addEventListener('pointerleave', function () { if (timer) { clearTimeout(timer); timer = null; } });
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 't' || ev.key === 'T') { if (ev.target.tagName !== 'INPUT') showPin(); }
    });
  }

  function tryPin() {
    var ok = store.verifyPin($('pin-input').value);
    var err = $('pin-err');
    if (ok) {
      Audio.play('unlock');
      if (err) err.hidden = true;
      openTeacher();
    } else {
      Audio.play('wrong');
      $('pin-input').value = '';
      if (err) { err.textContent = 'Hmm, that is not the PIN. Try again.'; err.hidden = false; }
    }
  }

  var UI = {
    show: show,
    renderHome: renderHome,
    renderLearners: renderLearners,
    renderReport: renderReport,
    renderWorksheets: renderWorksheets,
    setSoundIcons: setSoundIcons,
    wire: wire,
    tryPin: tryPin,
    clockSvg: clockSvg,
    clockPdf: clockPdf
  };

  root.JOGO = root.JOGO || {};
  root.JOGO.UI = UI;
})(typeof self !== 'undefined' ? self : this);
