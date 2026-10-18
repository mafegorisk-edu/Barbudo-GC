/*
  Barbudo Pushers v3: your score is how many of YOUR pieces make it across.
  Rules and the rival's brain. No screen code in here, so it can be tested
  with Node and reused later for a solver.

  Players: 'A' = the person at the keyboard (blue, moves up the board)
           'B' = the rival (red, moves down the board)

  A cell is null or a string like 'A3' = owner 'A', rank 3.
  A state is { board, tokens: { A, B } }  (tokens = sidesteps left).

  Rules in short:
  - 4x4 board, 4 pieces each, ranks 1-4, face to face.
  - On your turn you move one piece forward one square, or spend a sidestep.
  - Moving into an occupied square needs a HIGHER rank than the piece there.
    You shove that piece and the pieces touching it sideways. A piece shoved
    off the side is LOST: it scores for nobody.
  - A piece that walks off the far edge has ARRIVED: +1 for its owner.
  - Before playing, each player bids how many of their own pieces will arrive.
    Closest to the bid wins. The bids may not add up to FORBIDDEN_SUM.
  - If a player cannot move they pass. If nobody can move, the pieces left
    on the board are stuck and score for nobody.
*/
(function (root) {
  'use strict';

  const ROWS = 4;
  const COLS = 4;
  const PIECES_EACH = 4;
  const START_TOKENS = 3;
  const FORBIDDEN_SUM = 4; // the two bids may not add up to this

  function newState() {
    const board = [];
    for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(null));
    const blue = [1, 2, 3, 4];
    const red = [2, 1, 4, 3];
    for (let c = 0; c < COLS; c++) {
      board[2][c] = 'A' + blue[c];
      board[1][c] = 'B' + red[c];
    }
    return { board: board, tokens: { A: START_TOKENS, B: START_TOKENS } };
  }

  function forward(p) { return p === 'A' ? -1 : 1; }
  function other(p) { return p === 'A' ? 'B' : 'A'; }
  function rankOf(cell) { return Number(cell[1]); }

  function countPieces(board, p) {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c] && (!p || board[r][c][0] === p)) n++;
    return n;
  }

  function cloneState(st) {
    return {
      board: st.board.map(function (row) { return row.slice(); }),
      tokens: { A: st.tokens.A, B: st.tokens.B }
    };
  }

  // Moves:
  //  { type:'fwd',  r, c, shove }   shove 0 = free square or far edge; -1 / +1 = shove that way
  //  { type:'side', r, c, dir }     dir -1 or +1, costs one token
  function legalMoves(st, p) {
    const board = st.board;
    const moves = [];
    const f = forward(p);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell || cell[0] !== p) continue;
        const ahead = r + f;
        if (ahead < 0 || ahead >= ROWS || !board[ahead][c]) {
          moves.push({ type: 'fwd', r: r, c: c, shove: 0 });
        } else if (rankOf(cell) > rankOf(board[ahead][c])) {
          moves.push({ type: 'fwd', r: r, c: c, shove: -1 });
          moves.push({ type: 'fwd', r: r, c: c, shove: 1 });
        }
        if (st.tokens[p] > 0) {
          [-1, 1].forEach(function (d) {
            const nc = c + d;
            if (nc < 0 || nc >= COLS) return;
            const t = board[r][nc];
            if (!t || t[0] === p) moves.push({ type: 'side', r: r, c: c, dir: d });
          });
        }
      }
    }
    return moves;
  }

  // Returns { state, arrived, lost, kind, chain, dir, piece, other, beaten }
  //   kind:    'step' | 'arrive' | 'shove' | 'slide' | 'swap'
  //   arrived: true if the moving piece walked off the far edge (+1 for p)
  //   lost:    owners of pieces shoved off the side (score for nobody)
  function applyMove(st, p, move) {
    const ns = cloneState(st);
    const nb = ns.board;
    const r = move.r, c = move.c;
    const piece = nb[r][c];

    if (move.type === 'side') {
      const nc = c + move.dir;
      const target = nb[r][nc];
      nb[r][nc] = piece;
      nb[r][c] = target;
      ns.tokens[p] -= 1;
      return { state: ns, arrived: false, lost: [], kind: target ? 'swap' : 'slide', chain: 0, dir: move.dir, piece: piece, other: target };
    }

    const ahead = r + forward(p);
    const s = move.shove;
    nb[r][c] = null;

    if (ahead < 0 || ahead >= ROWS) {
      return { state: ns, arrived: true, lost: [], kind: 'arrive', chain: 0, dir: 0, piece: piece };
    }
    if (!nb[ahead][c]) {
      nb[ahead][c] = piece;
      return { state: ns, arrived: false, lost: [], kind: 'step', chain: 0, dir: 0, piece: piece };
    }

    const line = [];
    let x = c;
    while (x >= 0 && x < COLS && nb[ahead][x]) {
      line.push({ x: x, cell: nb[ahead][x] });
      x += s;
    }
    line.forEach(function (q) { nb[ahead][q.x] = null; });
    const lost = [];
    line.forEach(function (q) {
      const nx = q.x + s;
      if (nx < 0 || nx >= COLS) lost.push(q.cell[0]);
      else nb[ahead][nx] = q.cell;
    });
    nb[ahead][c] = piece;
    return { state: ns, arrived: false, lost: lost, kind: 'shove', chain: line.length, dir: s, piece: piece, beaten: line[0].cell };
  }

  // Who moves after `p` has just moved?
  //   { turn }                  normal (may be p again if the other side is stuck)
  //   { done: true, stuck }     board empty, or total deadlock (stuck = pieces left, scoring nothing)
  function next(st, p) {
    if (countPieces(st.board) === 0) return { done: true, stuck: 0 };
    const o = other(p);
    if (legalMoves(st, o).length) return { turn: o };
    if (legalMoves(st, p).length) return { turn: p };
    return { done: true, stuck: countPieces(st.board) };
  }

  function validRivalBids(a) {
    const valid = [];
    for (let b = 0; b <= PIECES_EACH; b++) if (a + b !== FORBIDDEN_SUM) valid.push(b);
    return valid;
  }

  // Whoever ends closest to their own bid wins. Same distance is a draw.
  function outcome(a, b, ca, cb) {
    const errA = Math.abs(a - ca);
    const errB = Math.abs(b - cb);
    let winner = 'draw';
    if (errA < errB) winner = 'A';
    else if (errB < errA) winner = 'B';
    return { errA: errA, errB: errB, winner: winner };
  }

  // ---- Exact solver (used offline to study the game, and for the rival's bid) ----
  function solve(a, b, limitStates, opts) {
    opts = opts || {};
    const memo = new Map();
    let over = false;
    function key(st, t, ca, cb) {
      return st.board.map(function (r) { return r.map(function (c) { return c || '..'; }).join(''); }).join('/') +
        t + st.tokens.A + st.tokens.B + ca + cb;
    }
    function go(st, t, ca, cb) {
      if (over) return 0;
      let mover = t, ms = legalMoves(st, mover);
      if (!ms.length) {
        mover = other(t); ms = legalMoves(st, mover);
        if (!ms.length) {
          const o = outcome(a, b, ca, cb);
          return o.winner === 'A' ? 1 : (o.winner === 'B' ? -1 : 0);
        }
      }
      const k = key(st, mover, ca, cb);
      if (memo.has(k)) return memo.get(k);
      if (memo.size > limitStates) { over = true; return 0; }
      let best = mover === 'A' ? -2 : 2;
      for (let i = 0; i < ms.length; i++) {
        const r = applyMove(st, mover, ms[i]);
        const v = go(r.state, other(mover), ca + (mover === 'A' && r.arrived ? 1 : 0), cb + (mover === 'B' && r.arrived ? 1 : 0));
        if (mover === 'A') { if (v > best) best = v; if (best === 1) break; }
        else { if (v < best) best = v; if (best === -1) break; }
      }
      memo.set(k, best);
      return best;
    }
    const st0 = newState();
    if (opts.tokens) st0.tokens = { A: opts.tokens.A, B: opts.tokens.B };
    const v = go(st0, opts.first || 'A', 0, 0);
    return { value: over ? null : v, states: memo.size };
  }

  // ---- The rival's brain: minimax + alpha-beta ----

  function finalValue(bids, ca, cb) {
    const o = outcome(bids.a, bids.b, ca, cb);
    return o.winner === 'B' ? 1000 : (o.winner === 'A' ? -1000 : 0);
  }

  // Rough guess when the search runs out of depth: how far each side is from its bid,
  // counting pieces that could still arrive.
  function guessValue(bids, st, ca, cb) {
    const left = function (p) { return countPieces(st.board, p); };
    function dist(bid, have, remaining) {
      if (have > bid) return have - bid;
      if (have + remaining < bid) return bid - have - remaining;
      return 0;
    }
    return (dist(bids.a, ca, left('A')) - dist(bids.b, cb, left('B'))) * 10;
  }

  function search(bids, st, toMove, depth, ca, cb, alpha, beta) {
    let mover = toMove;
    let moves = legalMoves(st, mover);
    if (!moves.length) {
      mover = other(toMove);
      moves = legalMoves(st, mover);
      if (!moves.length) return finalValue(bids, ca, cb);
    }
    if (depth === 0) return guessValue(bids, st, ca, cb);
    let best = mover === 'B' ? -1e9 : 1e9;
    for (let i = 0; i < moves.length; i++) {
      const res = applyMove(st, mover, moves[i]);
      const v = search(bids, res.state, other(mover), depth - 1,
        ca + (mover === 'A' && res.arrived ? 1 : 0), cb + (mover === 'B' && res.arrived ? 1 : 0), alpha, beta);
      if (mover === 'B') { if (v > best) best = v; alpha = Math.max(alpha, best); }
      else { if (v < best) best = v; beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  // bids = { a, b }, scores = { ca, cb }
  function chooseRivalMove(st, bids, scores, depth) {
    const moves = legalMoves(st, 'B');
    let best = -1e9, pick = moves[0];
    moves.forEach(function (m) {
      const res = applyMove(st, 'B', m);
      const v = search(bids, res.state, 'A', (depth || 6) - 1, scores.ca, scores.cb + (res.arrived ? 1 : 0), -1e9, 1e9)
        + Math.random() * 0.05;
      if (v > best) { best = v; pick = m; }
    });
    return pick;
  }

  // Simple default; the page can replace this with a smarter choice.
  function chooseRivalBid(a) {
    const valid = validRivalBids(a);
    const mid = valid.filter(function (b) { return b >= 1 && b <= 3; });
    const pool = mid.length ? mid : valid;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const api = {
    ROWS: ROWS, COLS: COLS, PIECES_EACH: PIECES_EACH, START_TOKENS: START_TOKENS, FORBIDDEN_SUM: FORBIDDEN_SUM,
    newState: newState, other: other, rankOf: rankOf, countPieces: countPieces,
    legalMoves: legalMoves, applyMove: applyMove, next: next,
    validRivalBids: validRivalBids, chooseRivalBid: chooseRivalBid,
    outcome: outcome, solve: solve, chooseRivalMove: chooseRivalMove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
