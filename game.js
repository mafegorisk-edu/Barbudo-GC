/*
  Barbudo Empujones: game rules and the rival's brain.
  This file knows nothing about the screen (no document, no buttons),
  so it can be tested on its own with Node:  node -e "require('./game.js')"

  Players: 'A' is the person at the keyboard (blue, moves up the board).
           'B' is the rival (red, moves down the board).
  A board is a 4x4 array. Each cell is null, 'A' or 'B'.
*/
(function (root) {
  'use strict';

  const ROWS = 4;
  const COLS = 4;
  const TOTAL_PIECES = 8; // 4 each. Every piece ends up falling, so there are 8 falls in total.

  function newBoard() {
    const board = [];
    for (let r = 0; r < ROWS; r++) board.push(new Array(COLS).fill(null));
    for (let c = 0; c < COLS; c++) {
      board[2][c] = 'A'; // blue starts on row 3 (index 2)
      board[1][c] = 'B'; // red starts on row 2 (index 1)
    }
    return board;
  }

  function forward(p) { return p === 'A' ? -1 : 1; }
  function other(p) { return p === 'A' ? 'B' : 'A'; }

  function countPieces(board, p) {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (board[r][c] === p) n++;
    return n;
  }

  // A move is { r, c, shove }.
  //   shove = 0   -> the square ahead is free (or off the board), no choice to make
  //   shove = -1  -> the square ahead is taken: push the row to the left
  //   shove = +1  -> the square ahead is taken: push the row to the right
  function legalMoves(board, p) {
    const moves = [];
    const f = forward(p);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] !== p) continue;
        const ahead = r + f;
        if (ahead < 0 || ahead >= ROWS || !board[ahead][c]) {
          moves.push({ r: r, c: c, shove: 0 });
        } else {
          moves.push({ r: r, c: c, shove: -1 });
          moves.push({ r: r, c: c, shove: 1 });
        }
      }
    }
    return moves;
  }

  // Returns { board, falls, kind, chain, dir }
  //   falls: list of owners ('A'/'B') of every piece that left the board
  //   kind:  'step' | 'exit' | 'shove'
  //   chain: how many pieces were pushed (shove only)
  function applyMove(board, p, move) {
    const nb = board.map(function (row) { return row.slice(); });
    const r = move.r, c = move.c, s = move.shove;
    const ahead = r + forward(p);
    nb[r][c] = null;

    if (ahead < 0 || ahead >= ROWS) {
      return { board: nb, falls: [p], kind: 'exit', chain: 0, dir: 0 };
    }
    if (!nb[ahead][c]) {
      nb[ahead][c] = p;
      return { board: nb, falls: [], kind: 'step', chain: 0, dir: 0 };
    }

    // Shove: the piece in front and every piece touching it in that
    // direction (no gaps) move one square sideways.
    const line = [];
    let x = c;
    while (x >= 0 && x < COLS && nb[ahead][x]) {
      line.push({ x: x, owner: nb[ahead][x] });
      x += s;
    }
    line.forEach(function (q) { nb[ahead][q.x] = null; });
    const falls = [];
    line.forEach(function (q) {
      const nx = q.x + s;
      if (nx < 0 || nx >= COLS) falls.push(q.owner);
      else nb[ahead][nx] = q.owner;
    });
    nb[ahead][c] = p;
    return { board: nb, falls: falls, kind: 'shove', chain: line.length, dir: s };
  }

  // Bids: the two bids can never add up to TOTAL_PIECES.
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

  // Whoever ends closest to their bid wins. Same distance is a draw.
  function outcome(a, b, ca, cb) {
    const errA = Math.abs(a - ca);
    const errB = Math.abs(b - cb);
    let winner = 'draw';
    if (errA < errB) winner = 'A';
    else if (errB < errA) winner = 'B';
    return { errA: errA, errB: errB, winner: winner };
  }

  // ---- The rival's brain: minimax with alpha-beta, looking a few turns ahead ----

  function finalValue(st, ca, cb) {
    const o = outcome(st.a, st.b, ca, cb);
    return o.winner === 'B' ? 1000 : (o.winner === 'A' ? -1000 : 0);
  }

  // If nobody pushed anyone, every piece would walk off and score for its owner.
  function guessValue(st, board, ca, cb) {
    const projA = ca + countPieces(board, 'A');
    const projB = cb + countPieces(board, 'B');
    return (Math.abs(st.a - projA) - Math.abs(st.b - projB)) * 10;
  }

  function search(st, board, p, depth, ca, cb, alpha, beta) {
    if (countPieces(board, 'A') + countPieces(board, 'B') === 0) return finalValue(st, ca, cb);
    if (depth === 0) return guessValue(st, board, ca, cb);
    const moves = legalMoves(board, p);
    if (!moves.length) return search(st, board, other(p), depth, ca, cb, alpha, beta);
    let best = p === 'B' ? -1e9 : 1e9;
    for (let i = 0; i < moves.length; i++) {
      const res = applyMove(board, p, moves[i]);
      const k = res.falls.length;
      const v = search(st, res.board, other(p), depth - 1,
        ca + (p === 'A' ? k : 0), cb + (p === 'B' ? k : 0), alpha, beta);
      if (p === 'B') { if (v > best) best = v; alpha = Math.max(alpha, best); }
      else { if (v < best) best = v; beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  // st = { a, b, ca, cb }: both bids and how many falls each player has so far.
  function chooseRivalMove(board, st, depth) {
    const moves = legalMoves(board, 'B');
    let best = -1e9, pick = moves[0];
    moves.forEach(function (m) {
      const res = applyMove(board, 'B', m);
      const v = search(st, res.board, 'A', depth || 4, st.ca, st.cb + res.falls.length, -1e9, 1e9)
        + Math.random() * 0.05; // tiny noise so games don't repeat exactly
      if (v > best) { best = v; pick = m; }
    });
    return pick;
  }

  const api = {
    ROWS: ROWS, COLS: COLS, TOTAL_PIECES: TOTAL_PIECES,
    newBoard: newBoard, other: other, countPieces: countPieces,
    legalMoves: legalMoves, applyMove: applyMove,
    validRivalBids: validRivalBids, chooseRivalBid: chooseRivalBid,
    outcome: outcome, chooseRivalMove: chooseRivalMove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
