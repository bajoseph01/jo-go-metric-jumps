/**
 * input.js — Jo⚡Go Metric Jumps
 * Touch/mouse/Pencil input: the on-screen keypad and the place-value comma
 * track (drag or tap). Pointer Events only — no hover required anywhere.
 */
(function (root) {
  'use strict';

  var F = root.JOGO.Fmt;
  var M = root.JOGO.Math;
  var Audio = root.JOGO.Audio;

  var reducedMotion = (typeof matchMedia !== 'undefined') &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = ('ontouchstart' in root) || (root.navigator && root.navigator.maxTouchPoints > 0);

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ==================================================================
  // On-screen keypad
  // ==================================================================

  /**
   * Build a keypad inside container.
   * opts: { onSubmit(value) }
   * The visible <input> also accepts the native keyboard.
   */
  function createKeypad(container, opts) {
    container.innerHTML = '';
    var wrap = el('div', 'keypad');
    wrap.innerHTML =
      '<div class="answer-row">' +
        '<input class="answer-input" inputmode="decimal" enterkeyhint="done" ' +
          'autocomplete="off" autocapitalize="off" spellcheck="false" ' +
          'aria-label="Type your answer" placeholder="Type here">' +
      '</div>' +
      '<div class="keypad-grid">' +
        '<button type="button" class="key" data-key="1">1</button>' +
        '<button type="button" class="key" data-key="2">2</button>' +
        '<button type="button" class="key" data-key="3">3</button>' +
        '<button type="button" class="key" data-key="4">4</button>' +
        '<button type="button" class="key" data-key="5">5</button>' +
        '<button type="button" class="key" data-key="6">6</button>' +
        '<button type="button" class="key" data-key="7">7</button>' +
        '<button type="button" class="key" data-key="8">8</button>' +
        '<button type="button" class="key" data-key="9">9</button>' +
        '<button type="button" class="key" data-key=","> , </button>' +
        '<button type="button" class="key" data-key="0">0</button>' +
        '<button type="button" class="key key--del" data-key="back" aria-label="Backspace">⌫</button>' +
        '<button type="button" class="key key--clear" data-key="clear" aria-label="Clear">C</button>' +
        '<button type="button" class="key key--submit" data-key="submit" aria-label="Submit answer">Check ✓</button>' +
      '</div>';
    container.appendChild(wrap);

    var input = wrap.querySelector('.answer-input');
    var keys = wrap.querySelectorAll('.key');

    function value() { return input.value; }

    function doSubmit() {
      if (!input.value.trim()) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      if (opts.onSubmit) opts.onSubmit(value());
    }

    keys.forEach(function (k) {
      k.addEventListener('pointerdown', function (e) { e.preventDefault(); });
      k.addEventListener('click', function () {
        Audio.play('click');
        var key = k.getAttribute('data-key');
        if (key === 'back') {
          input.value = input.value.slice(0, -1);
        } else if (key === 'clear') {
          input.value = '';
        } else if (key === 'submit') {
          doSubmit();
          return;
        } else {
          var v = input.value;
          if (v.length >= 12) return;
          if (key === ',') {
            if (v.indexOf(',') !== -1) return;
            if (!v) return; // no leading comma
          } else if (v === '0') {
            input.value = key;
            return;
          }
          input.value = v + key;
        }
        if (!isTouch) input.focus();
        input.dispatchEvent(new Event('input'));
      });
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSubmit(); }
    });

    return {
      container: wrap,
      input: input,
      value: value,
      clear: function () { input.value = ''; },
      focus: function () { input.focus(); }
    };
  }

  // ==================================================================
  // Place-value comma track
  // ==================================================================

  /**
   * Build the comma track.
   * track: data from JOGO.Math.buildTrack()
   * opts: { markers, onSettle(gap, ok), onMove(gap) }
   */
  function createTrack(container, track, opts) {
    container.innerHTML = '';
    var n = track.cells.length;
    var gap = track.startGap;
    var lastGood = gap;
    var settled = false;

    var wrap = el('div', 'track');
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', 'Move the comma to the answer');
    wrap.setAttribute('aria-valuemin', '0');
    wrap.setAttribute('aria-valuemax', String(n));

    var opDir = track.op === '×' ? 'right →' : '← left';
    var top = el('div', 'track-top');
    top.appendChild(el('span', 'track-op',
      '<span class="track-op-symbol">' + track.op + '</span> <span class="track-op-dir">' + opDir + '</span>'));
    var readout = el('span', 'track-readout');
    top.appendChild(readout);
    wrap.appendChild(top);

    var stage = el('div', 'track-stage');
    var row = el('div', 'track-row');
    track.cells.forEach(function (cell, i) {
      row.appendChild(el('span', 'cell' + (cell.ghost ? ' cell--ghost' : ''), String(cell.d)));
    });
    var handle = el('button', 'comma-handle', ',');
    handle.setAttribute('type', 'button');
    handle.setAttribute('aria-label', 'Comma — drag it to the answer');
    row.appendChild(handle);
    stage.appendChild(row);

    var gaps = el('div', 'track-gaps');
    var spotEls = [];
    for (var g = 0; g <= n; g++) {
      var spot = el('button', 'gap-spot' + (g === track.startGap ? ' gap-spot--start' : ''));
      spot.setAttribute('type', 'button');
      spot.setAttribute('tabindex', '-1');
      spot.setAttribute('aria-hidden', 'true');
      spot.setAttribute('data-gap', String(g));
      if (opts.markers && g !== track.startGap && isOnPath(g)) {
        var markerNum = g > track.startGap ? g - track.startGap : track.startGap - g;
        spot.appendChild(el('span', 'gap-marker', String(markerNum)));
      }
      gaps.appendChild(spot);
      spotEls.push(spot);
    }
    stage.appendChild(gaps);
    wrap.appendChild(stage);

    wrap.appendChild(el('p', 'track-help', opts.markers
      ? 'Drag the comma — or tap where it must land.'
      : 'Move the comma to the correct place.'));
    container.appendChild(wrap);

    function isOnPath(g) {
      var lo = Math.min(track.startGap, track.targetGap);
      var hi = Math.max(track.startGap, track.targetGap);
      return g >= lo && g <= hi;
    }

    function cellWidth() {
      var rect = row.getBoundingClientRect();
      return rect.width / n;
    }

    function layout() {
      var w = cellWidth();
      row.style.height = (w + 14) + 'px';
      var hw = Math.min(w * 0.8, 50);   // rounded-rect comma badge, narrower than a cell
      var hh = Math.round(hw * 0.66);
      handle.style.width = hw + 'px';
      handle.style.height = hh + 'px';
      handle.style.left = (track.startGap * w - hw / 2) + 'px';
      spotEls.forEach(function (s, i) {
        s.style.left = (i * w - w / 2) + 'px';
        s.style.width = w + 'px';
        s.style.height = (w + 14) + 'px';
      });
      setHandleGap(gap, false);
    }

    function updateGhosts(g) {
      track.cells.forEach(function (cell, i) {
        var c = row.children[i];
        if (!cell.ghost) return;
        c.classList.toggle('cell--solid', M.ghostIsSolid(track, i, g));
      });
    }

    function readoutText(g) {
      return F.trackValueSA(track, g) + ' ' + track.to;
    }

    function setReadout(g) {
      readout.textContent = readoutText(g);
      updateGhosts(g);
    }

    function setHandleGap(g, animate) {
      var w = cellWidth();
      handle.style.transition = animate ? 'transform 0.25s cubic-bezier(.2,.9,.3,1.4)' : 'none';
      handle.style.transform = 'translateX(' + ((g - track.startGap) * w) + 'px)';
      wrap.setAttribute('aria-valuenow', String(g));
      wrap.setAttribute('aria-valuetext', readoutText(g));
      setReadout(g);
    }

    function moveTo(g, animate, silent) {
      g = Math.max(0, Math.min(n, g));
      var changed = g !== gap;
      gap = g;
      setHandleGap(gap, animate);
      if (changed && !silent) Audio.play('jump');
      if (opts.onMove) opts.onMove(g);
    }

    function settle(g) {
      if (settled) return;
      g = Math.max(0, Math.min(n, g));
      var ok = M.isTargetGap(track, g);
      if (ok) {
        settled = true;
        moveTo(g, true);
        Audio.play('pop');
        updateGhosts(g);
        wrap.classList.add('track--settled');
        if (opts.onSettle) opts.onSettle(g, true);
      } else {
        Audio.play('wrong');
        wrap.classList.remove('track--shake');
        void wrap.offsetWidth;
        wrap.classList.add('track--shake');
        var self = this;
        setTimeout(function () {
          wrap.classList.remove('track--shake');
          moveTo(lastGood, true);
          if (opts.onSettle) opts.onSettle(g, false);
        }, 450);
      }
    }

    // ---- pointer interaction ----
    var dragging = false;
    var pointerId = null;

    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (settled) return;
      dragging = true;
      pointerId = e.pointerId;
      try { handle.setPointerCapture(pointerId); } catch (err) {}
      handle.classList.add('comma-handle--drag');
      lastGood = gap;
    });

    wrap.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      var rect = row.getBoundingClientRect();
      var w = cellWidth();
      var g = Math.round((e.clientX - rect.left) / w);
      moveTo(g, false, true);
    });

    function endDrag(e) {
      if (!dragging) return;
      if (e.pointerId !== pointerId) return;
      dragging = false;
      handle.classList.remove('comma-handle--drag');
      settle(gap);
    }
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);

    // tap a landing spot
    spotEls.forEach(function (s) {
      s.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (settled) return;
        var g = Number(s.getAttribute('data-gap'));
        if (g !== track.startGap) {
          moveTo(g, true);
          settle(g);
        }
      });
    });

    // keyboard
    wrap.addEventListener('keydown', function (e) {
      if (settled) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(gap - 1, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(gap + 1, true); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); settle(gap); }
    });

    layout();
    var onResize = function () { layout(); };
    root.addEventListener('resize', onResize);

    return {
      wrap: wrap,
      getGap: function () { return gap; },
      setGap: function (g, animate) { moveTo(g, animate); },
      settle: settle,
      focus: function () { wrap.focus(); },
      destroy: function () {
        root.removeEventListener('resize', onResize);
        container.innerHTML = '';
      },
      readout: function () { return readoutText(gap); }
    };
  }

  /**
   * Auto-play the comma movement (feedback after typed answers).
   * Steps the comma from start to target, then calls onDone().
   */
  function animateTrack(container, track, onDone) {
    container.innerHTML = '';
    var ctl = createTrack(container, track, { markers: false, onSettle: null });
    var gap = track.startGap;
    var step = track.op === '×' ? 1 : -1;
    var end = track.targetGap;
    var delay = reducedMotion ? 0 : 420;
    function next() {
      gap += step;
      if (step > 0 && gap > end) gap = end;
      if (step < 0 && gap < end) gap = end;
      ctl.setGap(gap, true);
      ctl.wrap.classList.add('track--auto');
      if (gap === end) {
        Audio.play('pop');
        ctl.wrap.classList.add('track--settled');
        setTimeout(onDone, delay);
        return;
      }
      setTimeout(next, delay);
    }
    setTimeout(next, reducedMotion ? 0 : 350);
    return ctl;
  }

  var Input = {
    createKeypad: createKeypad,
    createTrack: createTrack,
    animateTrack: animateTrack
  };

  root.JOGO = root.JOGO || {};
  root.JOGO.Input = Input;
})(typeof self !== 'undefined' ? self : this);
