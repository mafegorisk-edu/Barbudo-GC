/*
  Barbudo Empujones v2: ranks and sidesteps.
  Rules and the rival's brain. No screen code in here, so it can be tested
  with Node and reused later for a solver.

  Players: 'A' = the person at the keyboard (blue, moves up the board)
           'B' = the rival (red, moves down the board)

  A cell is null or a string like 'A3' = owner 'A', rank 3.
  A state is { board, tokens: { A, B } }  (tokens = sidesteps left).

  New in v2:
  - Every piece has a rank 1-4. You can only enter an occupied square if
    your rank is HIGHER than the piece standing there.
  - Each player has SIDESTEPS (3 tokens). A sidestep moves one of your pieces
    one square left or right: into an empty square, or swapping places with
    another piece of yours.
  - Deadlock: a player with no legal move passes. If neither can move, every
    piece still on the board falls and scores for its owner.
*/
(function (root) {
  'use strict';

  const ROWS = 4;
  const COLS = 4;
  const TOTAL_PIECES = 8;
  const START_TOKENS = 3;

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
  //  { type:'fwd',  r, c, shove }   shove 0 = free square / exit; -1 or +1 = push the row that way
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

  // Returns { state, falls, kind, chain, dir, piece, other, beaten }
  //   kind: 'step' | 'exit' | 'shove' | 'slide' | 'swap'
  function applyMove(st, p, move) {
    const ns = cloneState(st);
    const nb = ns.board;
    const r = move.r, c = move.c;
    const piece = nb[r][c];

    if (move.type === 'side') {
      const nc = c + move.dir;
      const target = nb[r][nc];
      nb[r][nc] = piece;
      nb[r][c] = target; // null for an empty square, or our own piece for a swap
      ns.tokens[p] -= 1;
      return { state: ns, falls: [], kind: target ? 'swap' : 'slide', chain: 0, dir: move.dir, piece: piece, other: target };
    }

    const ahead = r + forward(p);
    const s = move.shove;
    nb[r][c] = null;

    if (ahead < 0 || ahead >= ROWS) {
      return { state: ns, falls: [p], kind: 'exit', chain: 0, dir: 0, piece: piece };
    }
    if (!nb[ahead][c]) {
      nb[ahead][c] = piece;
      return { state: ns, falls: [], kind: 'step', chain: 0, dir: 0, piece: piece };
    }

    const line = [];
    let x = c;
    while (x >= 0 && x < COLS && nb[ahead][x]) {
      line.push({ x: x, cell: nb[ahead][x] });
      x += s;
    }
    line.forEach(function (q) { nb[ahead][q.x] = null; });
    const falls = [];
    line.forEach(function (q) {
      const nx = q.x + s;
      if (nx < 0 || nx >= COLS) falls.push(q.cell[0]);
      else nb[ahead][nx] = q.cell;
    });
    nb[ahead][c] = piece;
    return { state: ns, falls: falls, kind: 'shove', chain: line.length, dir: s, piece: piece, beaten: line[0].cell };
  }

  // Who moves after `p` has just moved?
  //   { turn }                              normal (may be p again if the other side is stuck)
  //   { done: true, leftover: {A, B} }      board empty, or total deadlock (leftovers score for their owners)
  function next(st, p) {
    if (countPieces(st.board) === 0) return { done: true, leftover: { A: 0, B: 0 } };
    const o = other(p);
    if (legalMoves(st, o).length) return { turn: o };
    if (legalMoves(st, p).length) return { turn: p };
    return { done: true, leftover: { A: countPieces(st.board, 'A'), B: countPieces(st.board, 'B') } };
  }

  function validRivalBids(a) {
    const valid = [];
    for (let b = 0; b <= TOTAL_PIECES; b++) if (a + b !== TOTAL_PIECES) valid.push(b);
    return valid;
  }

  function chooseRivalBid(a) {
    const valid = validRivalBids(a);
    const near = valid.filter(function (b) { return Math.abs(b - 4) <= 2; });
    const pool = near.length ? near : valid;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function outcome(a, b, ca, cb) {
    const errA = Math.abs(a - ca);
    const errB = Math.abs(b - cb);
    let winner = 'draw';
    if (errA < errB) winner = 'A';
    else if (errB < errA) winner = 'B';
    return { errA: errA, errB: errB, winner: winner };
  }

  // ---- The rival's brain: minimax + alpha-beta ----

  function finalValue(bids, ca, cb) {
    const o = outcome(bids.a, bids.b, ca, cb);
    return o.winner === 'B' ? 1000 : (o.winner === 'A' ? -1000 : 0);
  }

  function guessValue(bids, st, ca, cb) {
    const projA = ca + countPieces(st.board, 'A');
    const projB = cb + countPieces(st.board, 'B');
    return (Math.abs(bids.a - projA) - Math.abs(bids.b - projB)) * 10;
  }

  // `toMove` is whose turn it nominally is; if they are stuck the other side goes.
  function search(bids, st, toMove, depth, ca, cb, alpha, beta) {
    let mover = toMove;
    let moves = legalMoves(st, mover);
    if (!moves.length) {
      mover = other(toMove);
      moves = legalMoves(st, mover);
      if (!moves.length) {
        return finalValue(bids, ca + countPieces(st.board, 'A'), cb + countPieces(st.board, 'B'));
      }
    }
    if (depth === 0) return guessValue(bids, st, ca, cb);
    let best = mover === 'B' ? -1e9 : 1e9;
    for (let i = 0; i < moves.length; i++) {
      const res = applyMove(st, mover, moves[i]);
      const k = res.falls.length;
      const v = search(bids, res.state, other(mover), depth - 1,
        ca + (mover === 'A' ? k : 0), cb + (mover === 'B' ? k : 0), alpha, beta);
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
      const v = search(bids, res.state, 'A', (depth || 5) - 1, scores.ca, scores.cb + res.falls.length, -1e9, 1e9)
        + Math.random() * 0.05;
      if (v > best) { best = v; pick = m; }
    });
    return pick;
  }

  const api = {
    ROWS: ROWS, COLS: COLS, TOTAL_PIECES: TOTAL_PIECES, START_TOKENS: START_TOKENS,
    newState: newState, other: other, rankOf: rankOf, countPieces: countPieces,
    legalMoves: legalMoves, applyMove: applyMove, next: next,
    validRivalBids: validRivalBids, chooseRivalBid: chooseRivalBid,
    outcome: outcome, chooseRivalMove: chooseRivalMove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
