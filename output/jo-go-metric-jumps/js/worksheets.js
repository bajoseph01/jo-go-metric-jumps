/**
 * worksheets.js — Jo⚡Go Metric Jumps
 * Pure generation logic for the teacher's per-learner worksheet pack.
 *
 * Each worksheet drills the learner's WEAKEST conversion pairs first
 * (untried pairs count as weakest) plus a couple of word problems, so a
 * pack printed from the teacher panel targets exactly what each child
 * needs. Purely functional and DOM-free so it is unit-testable in Node.
 */
(function (root) {
  'use strict';

  var M = (typeof module !== 'undefined' && module.exports)
    ? require('./math.js')
    : root.JOGO.Math;
  var F = (typeof module !== 'undefined' && module.exports)
    ? require('./formatting.js')
    : root.JOGO.Fmt;
  var Q = (typeof module !== 'undefined' && module.exports)
    ? require('./questions.js')
    : root.JOGO.Q;

  /**
   * Per-pair weakness weights from a learner's progress, for one dimension
   * (length | mass | volume). Accuracy = firstTry / attempts; untried pairs
   * are neutral (0.5) and a mastered pair keeps a small floor so it still
   * appears occasionally. Weights are inverted so the weakest pair is picked
   * most often.
   */
  function pairWeights(progress, dim) {
    dim = dim || Q.getDimension();
    var weights = {};
    var pairs = (progress && progress.pairs) || {};
    var list = M.pairsFor(dim);
    for (var i = 0; i < list.length; i++) {
      var key = list[i][0] + '>' + list[i][1];
      var rec = pairs[key];
      var acc = (rec && rec.attempts) ? rec.firstTry / rec.attempts : 0.5;
      weights[key] = Math.max(0.15, 1 - acc);
    }
    return weights;
  }

  /**
   * One conversion question on a (weighted) pair:
   *   { type:'conv', from, to, text, answer }
   * text is the source value, answer the converted value, e.g.
   *   { type:'conv', from:'m', to:'km', text:'7 830', answer:'7,83' }
   */
  function conversionItem(rng, weights) {
    var pair = Q.weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    var source = Q.genSource(conv, rng);
    var base = Q.baseQuestion(conv, source, rng);
    return {
      type: 'conv',
      from: conv.from,
      to: conv.to,
      text: base.sourceSA,
      answer: base.expectedSA
    };
  }

  /**
   * One realistic word problem on a (weighted) pair:
   *   { type:'word', from, to, text, answer }
   */
  function wordItem(rng, weights) {
    var q = Q.transferQuestion(rng, weights);
    return {
      type: 'word',
      from: q.from,
      to: q.to,
      text: q.text,
      answer: q.expectedSA
    };
  }

  /**
   * Build a full worksheet for one learner in one dimension: `convCount`
   * conversion questions then `wordCount` word problems. Returns items.
   */
  function buildItems(progress, rng, convCount, wordCount, dim) {
    rng = rng || Math.random;
    convCount = convCount || 8;
    wordCount = wordCount === undefined ? 2 : wordCount;
    dim = dim || Q.getDimension();
    Q.setDimension(dim);
    var weights = pairWeights(progress, dim);
    var items = [];
    for (var i = 0; i < convCount; i++) items.push(conversionItem(rng, weights));
    for (var j = 0; j < wordCount; j++) items.push(wordItem(rng, weights));
    return items;
  }

  var WS = {
    pairWeights: pairWeights,
    conversionItem: conversionItem,
    wordItem: wordItem,
    buildItems: buildItems
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = WS; }
  root.JOGO = root.JOGO || {};
  root.JOGO.WS = WS;
})(typeof window !== 'undefined' ? window : globalThis);
