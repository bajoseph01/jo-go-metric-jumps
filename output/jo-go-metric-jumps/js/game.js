/**
 * game.js — Jo⚡Go Metric Jumps
 * Session flow: stage state machine, adaptive question queue, targeted
 * corrective feedback, mastery recording, stage completion.
 */
(function (root) {
  'use strict';

  var M = root.JOGO.Math;
  var F = root.JOGO.Fmt;
  var Q = root.JOGO.Q;
  var Store = root.JOGO.Store;
  var Audio = root.JOGO.Audio;
  var UI = root.JOGO.UI;

  var session = null;

  var PRAISE = [
    'Correct! ⚡',
    'Nice thinking!',
    'Right direction!',
    'You caught it!',
    'Spot on!',
    'Comma power!',
    'Two zeroes = two jumps.'
  ];

  // ------------------------------------------------------------------
  // Session control
  // ------------------------------------------------------------------

  function startStage(stageId) {
    var stage = Q.stageById(stageId);
    if (!stage) return;
    session = {
      stageId: stageId,
      stage: stage,
      dimension: Store.getDimension(),
      done: 0,
      target: stage.target,
      streak: 0,
      q: null,
      sub: null,
      firstTry: true,
      attempts: 0,
      trackCtl: null,
      firstTryCount: 0,
      locked: false,
      showHint: false
    };
    Q.setDimension(session.dimension);
    Store.setLastStage(stageId);
    UI.show('screen-game');
    UI.renderGameHUD(session);
    UI.clearFeedback();
    // First-ever play: teach HOW the game works before the first question.
    var a = Store.activeLearner();
    if (a && !Store.seenIntro(a.id)) {
      UI.showIntroOverlay();
      return;
    }
    nextQuestion();
  }

  function quit() {
    if (session && session.trackCtl) session.trackCtl.destroy();
    session = null;
    UI.show('screen-home');
  }

  function nextQuestion() {
    session.locked = false;
    session.q = Q.generateQuestion(session.stageId, Math.random, Store.pairWeights());
    session.firstTry = true;
    session.attempts = 0;
    session.sub = null;
    session.trackCtl = null;
    session.showHint = false; // the ladder's pills/arrow re-hide every question
    UI.clearFeedback();
    renderCurrent();
  }

  function renderCurrent() {
    UI.renderGameHUD(session);
    UI.renderQuestion(session);
  }

  // ------------------------------------------------------------------
  // Handlers (called from UI)
  // ------------------------------------------------------------------

  function handleOpChoice(label) {
    if (session.locked) return;
    var q = session.q;
    session.attempts++;
    if (label === q.conv.opLabel) {
      if (session.stage.kinds[0] === 'op') {
        questionDone(true);
      } else {
        session.sub = 'jumps';
        UI.clearFeedback();
        UI.showPraise('Correct! ' + ruleLine(q), true);
        renderCurrent();
      }
    } else {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback(hintOp(q, label), false);
      renderCurrent();
    }
  }

  function handleJumpsChoice(n) {
    if (session.locked) return;
    var q = session.q;
    session.attempts++;
    if (n === q.conv.jumps) {
      if (session.stage.kinds[0] === 'jumps') {
        questionDone(true);
      } else {
        session.sub = 'drag';
        UI.clearFeedback();
        UI.showPraise('Correct! ' + ruleLine(q), true);
        renderCurrent();
      }
    } else {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback(hintJumps(q, n), false);
      renderCurrent();
    }
  }

  function handleDragSettle(gap, ok) {
    if (session.locked) return;
    if (ok) {
      questionDone(true);
    } else {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback(hintDrag(session.q, gap), false);
    }
  }

  function handleAnswer(text) {
    if (session.locked) return;
    var q = session.q;
    session.attempts++;
    var check = F.checkAnswer(q.expected, text);
    if (check.invalid || check.parsed === null) {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback('Hmm, that does not look like a number. Use digits and a comma, like 250 or 2,5.', false);
      return;
    }
    if (check.ok) {
      questionDone(true);
    } else {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback(hintInput(q, check.parsed), false);
    }
  }

  function handleJudge(choice) {
    if (session.locked) return;
    var q = session.q;
    session.attempts++;
    var saidOk = (choice === 'ok');
    if (saidOk === q.correct) {
      if (q.correct) {
        questionDone(true);
      } else {
        UI.clearFeedback();
        UI.showPraise('You caught it! Now fix it:', true);
        session.sub = 'fix';
        renderCurrent();
      }
    } else {
      session.firstTry = false;
      Audio.play('wrong');
      UI.showFeedback(hintSanityJudge(q, saidOk), false);
      renderCurrent();
    }
  }

  function handleFixAnswer(text) {
    handleAnswer(text);
  }

  // ------------------------------------------------------------------
  // Feedback copy
  // ------------------------------------------------------------------

  function ruleLine(q) {
    if (q.conv.op === '×') return q.conv.opLabel + ' moves the comma RIGHT.';
    return q.conv.opLabel + ' moves the comma LEFT.';
  }

  function smallerUnitExplanation(q) {
    var c = q.conv;
    if (c.op === '×') {
      return 'We are changing from ' + c.from + ' to the smaller ' + c.to +
        '. We need MORE ' + c.to + ', so the number must get bigger.';
    }
    return 'We are changing from ' + c.from + ' to the bigger ' + c.to +
      '. We need FEWER ' + c.to + ', so the number must get smaller.';
  }

  function hintOp(q, chosen) {
    var c = q.conv;
    var chosenOp = chosen.charAt(0);
    if (chosenOp !== c.op) {
      return smallerUnitExplanation(q) + ' That means ' + c.opLabel + '.';
    }
    return 'Right direction! But check the ladder: from ' + c.from + ' to ' + c.to +
      ' we jump ' + c.jumps + ' place' + (c.jumps > 1 ? 's' : '') +
      ', so the factor is ' + c.opLabel + '.';
  }

  function hintJumps(q, chosen) {
    var c = q.conv;
    return 'Look at ' + c.opLabel + ': how many zeroes can you see? ' +
      c.jumps + ' zero' + (c.jumps > 1 ? 'es' : '') + ' = ' + c.jumps +
      ' jump' + (c.jumps > 1 ? 's' : '') + '.';
  }

  function hintDrag(q, gap) {
    var c = q.conv;
    var dir = c.op === '×' ? 'RIGHT' : 'LEFT';
    if (c.op === '×') {
      if (gap < c.jumps) {
        return 'The comma must move ' + dir + '. ' + (c.jumps - gap) +
          ' more jump' + (c.jumps - gap > 1 ? 's' : '') + ' to go.';
      }
      return 'That is too far! ' + c.opLabel + ' moves the comma exactly ' +
        c.jumps + ' place' + (c.jumps > 1 ? 's' : '') + ' right.';
    }
    if (gap > c.jumps) {
      return 'The comma must move ' + dir + '. ' + (gap - c.jumps) +
        ' more jump' + (gap - c.jumps > 1 ? 's' : '') + ' to go.';
    }
    return 'That is too far! ' + c.opLabel + ' moves the comma exactly ' +
      c.jumps + ' place' + (c.jumps > 1 ? 's' : '') + ' left.';
  }

  function hintInput(q, parsed) {
    var c = q.conv;
    // If the typed answer is off by a power of ten, call out the comma.
    var rat = F.saToRational(parsed);
    if (rat) {
      var ratio = M.reduce(rat.num * q.expected.den, rat.den * q.expected.num);
      if (ratio.den === 1 && ratio.num !== 1 && isPowerOfTen(ratio.num)) {
        return 'Almost — your comma is in the wrong place! ' + c.opLabel +
          ' moves the comma ' + c.jumps + ' place' + (c.jumps > 1 ? 's' : '') +
          ' ' + (c.op === '×' ? 'right' : 'left') + '. Count the jumps again.';
      }
    }
    return smallerUnitExplanation(q) + ' So it is ' + c.opLabel +
      ': the comma jumps ' + c.jumps + ' place' + (c.jumps > 1 ? 's' : '') +
      ' ' + (c.op === '×' ? 'right' : 'left') + '.';
  }

  function isPowerOfTen(n) {
    if (n <= 0) return false;
    while (n % 10 === 0) n = n / 10;
    return n === 1;
  }

  function hintSanityJudge(q, saidOk) {
    if (q.correct && !saidOk) {
      return 'Careful — that one is actually correct! ' + q.sourceSA + ' ' + q.from +
        ' really is ' + q.expectedSA + ' ' + q.to + '. The unit changed, not the length.';
    }
    return 'Hmm, check the size! ' + q.from + ' is much bigger than ' + q.to +
      ', so the answer in ' + q.to + ' must be a much bigger number. Look at the comma again.';
  }

  // ------------------------------------------------------------------
  // Completion
  // ------------------------------------------------------------------

  function questionDone(ok) {
    if (session.locked) return;   // ignore rapid double-taps while the result shows
    session.locked = true;
    var q = session.q;
    var category = session.stage.category;
    var pairKey = q.from + '>' + q.to;
    var firstTryOk = ok && session.firstTry;

    Store.recordAnswer(category, pairKey, firstTryOk);
    if (firstTryOk) session.firstTryCount++;

    if (firstTryOk) {
      session.streak++;
      Audio.play('correct');
    } else {
      session.streak = 0;
      Audio.play('correct');
    }
    Store.recordStreak(session.streak);

    session.done++;
    UI.renderGameHUD(session);

    // The child advances on their OWN tap (no timer, no pressure — the
    // same Next-button pacing as Tick⚡Tock): the streak celebration and
    // Next button appear with the result and stay until they're ready.
    var advance = function () {
      if (!session) return;
      if (session.done >= session.target) {
        stageComplete();
      } else {
        nextQuestion();
      }
    };

    // Stage 5 (Independent Conversion): replay the comma movement as
    // feedback so the learner sees why the answer is right.
    if (session && session.stageId === 5 && q.kind === 'input') {
      UI.playCommaFeedback(q, function () { UI.showNextButton(session, advance); });
    } else {
      UI.showResultLine(q, firstTryOk);
      UI.showNextButton(session, advance);
    }
  }

  function stageComplete() {
    var stageId = session.stageId;
    var unlockedNext = stageId < 8;
    Store.unlockUpTo(stageId + 1);
    Store.recordSession();
    Audio.play(unlockedNext ? 'unlock' : 'complete');
    var accuracy = session.done > 0 ? Math.round((session.firstTryCount / session.done) * 100) : 0;
    var payload = {
      stageId: stageId,
      stageName: session.stage.name,
      done: session.done,
      accuracy: accuracy,
      bestStreak: Store.get().bestStreak,
      unlockedNext: unlockedNext
    };
    session = null;
    UI.showDone(payload);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  var Game = {
    startStage: startStage,
    quit: quit,
    nextQuestion: nextQuestion,
    renderCurrent: renderCurrent,
    handleOpChoice: handleOpChoice,
    handleJumpsChoice: handleJumpsChoice,
    handleDragSettle: handleDragSettle,
    handleAnswer: handleAnswer,
    handleJudge: handleJudge,
    handleFixAnswer: handleFixAnswer,
    getSession: function () { return session; },
    stageComplete: stageComplete
  };

  root.JOGO = root.JOGO || {};
  root.JOGO.Game = Game;
})(typeof self !== 'undefined' ? self : this);
