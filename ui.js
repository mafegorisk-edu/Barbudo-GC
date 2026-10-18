/*
  Barbudo Shove v3: the screen.
  Draws the board and the scoreboard, reacts to clicks, and asks game.js
  for the rules and for the rival's moves. All rules live in game.js.
*/
(function () {
  'use strict';

  const G = window.Game;
  const RIVAL_DEPTH = 8;      // how many turns ahead the rival thinks
  const RIVAL_DELAY_MS = 800; // pause so you can see what happened

  // ---- State ----
  let S;

  function freshState() {
    return {
      st: G.newState(),   // { board, tokens }
      a: 0, b: 0,         // bids: yours and the rival's
      ca: 0, cb: 0,       // pieces that have crossed, you and the rival
      lost: { A: 0, B: 0 }, // pieces shoved off the side
      turn: 'A',
      phase: 'bid',       // 'bid' -> 'play' -> 'end'
      sel: null,          // selected piece { r, c }
      stuck: 0,           // pieces left on the board when nobody could move
      log: [],
      timer: null
    };
  }

  // ---- Small helpers ----
  const $ = function (id) { return document.getElementById(id); };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  // ---- Messages ----
  function lostText(lost) {
    if (!lost.length) return '';
    const yours = lost.filter(function (o) { return o === 'A'; }).length;
    const theirs = lost.length - yours;
    const parts = [];
    if (yours) parts.push(yours + ' of yours');
    if (theirs) parts.push(theirs + ' of the rival’s');
    return ' ' + parts.join(' and ') + ' ' + (lost.length > 1 ? 'are' : 'is') + ' shoved off the side and lost.';
  }

  function describe(p, res) {
    const name = p === 'A' ? 'You' : 'Rival';
    const their = p === 'A' ? 'your' : 'their';
    const rank = G.rankOf(res.piece);
    const dirWord = res.dir < 0 ? 'left' : 'right';
    if (res.kind === 'arrive') return name + ': ' + their + ' ' + rank + ' crosses the board. +1 for ' + (p === 'A' ? 'you' : 'the rival') + '.';
    if (res.kind === 'step') return name + ': ' + their + ' ' + rank + ' steps forward.';
    if (res.kind === 'slide') return name + ': ' + their + ' ' + rank + ' sidesteps ' + dirWord + '.';
    if (res.kind === 'swap') return name + ': ' + their + ' ' + rank + ' swaps places with ' + their + ' ' + G.rankOf(res.other) + '.';
    const base = name + ': ' + their + ' ' + rank + ' beats a ' + G.rankOf(res.beaten) + ' and shoves ' +
      res.chain + ' ' + plural(res.chain, 'piece', 'pieces') + ' ' + dirWord + '.';
    return base + (res.lost.length ? lostText(res.lost) : ' Nobody is lost.');
  }

  function needText(count, bid, remaining, isYou) {
    const subj = isYou ? 'You' : 'The rival';
    const have = isYou ? 'have' : 'has';
    if (count > bid) return { text: subj + ' ' + have + ' already gone over by ' + (count - bid) + '.', cls: 'over' };
    if (count === bid) {
      return { text: isYou ? 'Exactly on your bid. Don’t cross any more.' : 'Exactly on their bid.', cls: 'exact' };
    }
    const need = bid - count;
    if (remaining < need) {
      return { text: (isYou ? 'You can' : 'They can') + ' no longer reach ' + (isYou ? 'your' : 'their') + ' bid: only ' + remaining + ' ' + plural(remaining, 'piece is', 'pieces are') + ' left.', cls: 'over' };
    }
    return { text: (isYou ? 'You need ' : 'They need ') + need + ' more to cross.', cls: '' };
  }

  // ---- Drawing ----
  function renderBoard() {
    const board = $('board');
    board.textContent = '';
    const myTurn = S.phase === 'play' && S.turn === 'A';
    const mine = myTurn ? G.legalMoves(S.st, 'A') : [];

    for (let r = 0; r < G.ROWS; r++) {
      for (let c = 0; c < G.COLS; c++) {
        const cell = el('div', 'cell');
        const v = S.st.board[r][c];
        if (v) {
          const isYou = v[0] === 'A';
          const piece = el('button', 'piece ' + (isYou ? 'blue' : 'red'), v[1]);
          piece.type = 'button';
          piece.setAttribute('aria-label',
            (isYou ? 'Blue piece' : 'Red piece') + ', rank ' + v[1] + ', row ' + (r + 1) + ', column ' + (c + 1));
          const movable = isYou && mine.some(function (m) { return m.r === r && m.c === c; });
          if (movable) {
            piece.classList.add('can-move');
            piece.addEventListener('click', function () { selectPiece(r, c); });
          } else {
            piece.disabled = true;
            if (isYou && myTurn) piece.classList.add('stuck');
          }
          if (S.sel && S.sel.r === r && S.sel.c === c) {
            piece.classList.add('selected');
            piece.setAttribute('aria-pressed', 'true');
          }
          cell.appendChild(piece);
        }
        board.appendChild(cell);
      }
    }
  }

  function renderScoreCard(id, name, swatch, bid, count, owner) {
    const isYou = owner === 'A';
    const card = $(id);
    card.textContent = '';
    if (S.phase === 'bid') { card.hidden = true; return; }
    card.hidden = false;

    const head = el('div', 'score-head');
    head.appendChild(el('span', 'swatch ' + swatch));
    head.appendChild(el('span', '', name));
    card.appendChild(head);

    const main = el('div', 'score-main');
    main.appendChild(el('span', 'score-bid', String(bid)));
    main.appendChild(el('span', 'score-label', 'bid · ' + count + ' crossed'));
    card.appendChild(main);

    const pips = el('div', 'pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < G.PIECES_EACH; i++) {
      const pip = el('span', 'pip');
      if (i < count) {
        pip.classList.add('filled', isYou ? 'you-pip' : 'rival-pip');
        if (i >= bid) pip.classList.add('over');
      }
      if (bid > 0 && i === bid - 1) pip.classList.add('target');
      pips.appendChild(pip);
    }
    card.appendChild(pips);

    const onBoard = G.countPieces(S.st.board, owner);
    const need = needText(count, bid, onBoard, isYou);
    card.appendChild(el('p', 'need ' + need.cls, need.text));

    card.appendChild(el('p', 'tokens',
      onBoard + ' on the board · ' + S.lost[owner] + ' lost · ' +
      S.st.tokens[owner] + ' of ' + G.START_TOKENS + ' sidesteps left'));
  }

  function moveLabel(m, res) {
    if (m.type === 'side') {
      const arrow = m.dir < 0 ? '←' : '→';
      if (res.kind === 'swap') return arrow + ' Swap places with your ' + G.rankOf(res.other) + ' (uses 1 sidestep)';
      return arrow + ' Sidestep into the empty square (uses 1 sidestep)';
    }
    if (res.kind === 'arrive') return '↑ Cross the board (+1 for you)';
    if (res.kind === 'step') return '↑ Step forward';
    const arrow = m.shove < 0 ? '←' : '→';
    let label = '↑ Beat the ' + G.rankOf(res.beaten) + ' and shove ' + arrow + ' ';
    if (!res.lost.length) label += '(nobody lost)';
    else {
      const yours = res.lost.filter(function (o) { return o === 'A'; }).length;
      const theirs = res.lost.length - yours;
      const parts = [];
      if (yours) parts.push(yours + ' of yours lost');
      if (theirs) parts.push(theirs + ' of theirs lost');
      label += '(' + parts.join(', ') + ')';
    }
    return label;
  }

  function renderActions() {
    const box = $('actions');
    box.textContent = '';
    if (!(S.phase === 'play' && S.turn === 'A' && S.sel)) return;
    const sel = S.sel;
    const mine = G.legalMoves(S.st, 'A').filter(function (m) { return m.r === sel.r && m.c === sel.c; });
    const hasFwd = mine.some(function (m) { return m.type === 'fwd'; });
    if (!hasFwd) {
      const ahead = S.st.board[sel.r - 1] && S.st.board[sel.r - 1][sel.c];
      box.appendChild(el('p', 'blocked-note',
        'This ' + S.st.board[sel.r][sel.c][1] + ' can’t advance: ' +
        (ahead ? 'the ' + ahead[1] + ' in front has the same rank or higher.' : 'it is blocked.')));
    }
    mine.forEach(function (m) {
      const res = G.applyMove(S.st, 'A', m);
      const btn = el('button', '', moveLabel(m, res));
      btn.type = 'button';
      btn.addEventListener('click', function () { play('A', m); });
      box.appendChild(btn);
    });
  }

  function renderStatus() {
    let text = '';
    if (S.phase === 'bid') text = 'Choose your bid to start. You move first.';
    else if (S.phase === 'play' && S.turn === 'A') text = S.sel ? 'Choose how to move it.' : 'Your turn. Tap one of your blue pieces.';
    else if (S.phase === 'play') text = 'The rival is thinking…';
    else text = 'Game over.';
    $('status').textContent = text;
  }

  function renderLog() {
    const list = $('log');
    list.textContent = '';
    S.log.slice(0, 6).forEach(function (msg) { list.appendChild(el('li', '', msg)); });
  }

  function renderResult() {
    const box = $('result');
    box.textContent = '';
    if (S.phase !== 'end') { box.hidden = true; return; }
    box.hidden = false;
    const o = G.outcome(S.a, S.b, S.ca, S.cb);
    const title = o.winner === 'A' ? 'You win' : (o.winner === 'B' ? 'You lose' : 'Draw');
    const youEnd = o.errA === 0 ? 'You hit your bid exactly'
      : (S.ca > S.a ? 'You went over by ' + o.errA : 'You fell short by ' + o.errA);
    const rivalEnd = o.errB === 0 ? 'the rival hit theirs exactly'
      : (S.cb > S.b ? 'the rival went over by ' + o.errB : 'the rival fell short by ' + o.errB);
    box.appendChild(el('h2', '', title));
    let msg = youEnd + ' and ' + rivalEnd + '.';
    if (S.stuck) msg += ' Nobody could move, so ' + S.stuck + ' ' + plural(S.stuck, 'piece stayed', 'pieces stayed') + ' on the board and counted for nobody.';
    box.appendChild(el('p', '', msg));
  }

  function render() {
    $('bid-box').hidden = S.phase !== 'bid';
    renderBoard();
    renderScoreCard('you', 'You (blue)', 'blue', S.a, S.ca, 'A');
    renderScoreCard('rival', 'Rival (red)', 'red', S.b, S.cb, 'B');
    renderActions();
    renderResult();
    renderStatus();
    renderLog();
  }

  // ---- Actions ----
  function selectPiece(r, c) {
    if (S.phase !== 'play' || S.turn !== 'A') return;
    S.sel = { r: r, c: c };
    render();
  }

  function play(p, move) {
    const res = G.applyMove(S.st, p, move);
    S.st = res.state;
    if (res.arrived) { if (p === 'A') S.ca++; else S.cb++; }
    res.lost.forEach(function (owner) { S.lost[owner]++; });
    S.log.unshift(describe(p, res));
    S.sel = null;

    const nx = G.next(S.st, p);
    if (nx.done) {
      S.phase = 'end';
      S.stuck = nx.stuck;
      if (nx.stuck) S.log.unshift('Nobody can move. The ' + nx.stuck + ' pieces left on the board count for nobody.');
    } else {
      if (nx.turn === p) S.log.unshift(p === 'A' ? 'The rival has no moves and passes.' : 'You have no moves and pass.');
      S.turn = nx.turn;
    }
    render();
    if (S.phase === 'play' && S.turn === 'B') scheduleRival();
  }

  function scheduleRival() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      const move = G.chooseRivalMove(S.st, { a: S.a, b: S.b }, { ca: S.ca, cb: S.cb }, RIVAL_DEPTH);
      play('B', move);
    }, RIVAL_DELAY_MS);
  }

  function startGame() {
    S.a = Number($('bid-range').value);
    S.b = G.chooseRivalBid(S.a);
    S.phase = 'play';
    S.turn = 'A';
    S.log = ['Bids: you ' + S.a + ', rival ' + S.b + '.'];
    render();
  }

  function updateForbidden() {
    const v = Number($('bid-range').value);
    $('bid-value').textContent = String(v);
    $('forbidden').textContent = String(G.FORBIDDEN_SUM - v);
  }

  function newGame() {
    if (S) clearTimeout(S.timer);
    S = freshState();
    $('bid-range').value = 2;
    updateForbidden();
    render();
  }

  // ---- Wire up the page ----
  $('bid-range').addEventListener('input', updateForbidden);
  $('bid-go').addEventListener('click', startGame);
  $('new-game').addEventListener('click', newGame);

  newGame();
})();
