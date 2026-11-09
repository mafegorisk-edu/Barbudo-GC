/*
  BarbShove: the screen.
  Draws the board and the scoreboard, reacts to clicks, and asks game.js
  for the rules and for the rival's moves. All rules live in game.js.
*/
(function () {
  'use strict';

  const G = window.Game;
  const RIVAL_DEPTH = 10;     // how many turns ahead the rival thinks
  const RIVAL_DELAY_MS = 800; // pause so you can see what happened

  // ---- State ----
  let S;
  let MODE = 'bot'; // 'bot' = play the rival, 'two' = two people on one screen

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

  function isHuman(p) { return MODE === 'two' || p === 'A'; }
  function colorName(p) { return p === 'A' ? 'Blue' : 'Red'; }
  // Names used in messages. Against the bot: "You" / "Rival". Two players: "Blue" / "Red".
  function nameOf(p) { return MODE === 'two' ? colorName(p) : (p === 'A' ? 'You' : 'Rival'); }
  function theirOf(p) { return MODE === 'two' ? colorName(p) + '\u2019s' : (p === 'A' ? 'your' : 'their'); }
  function fwd(p) { return p === 'A' ? -1 : 1; }

  // ---- Messages ----
  function lostText(lost) {
    if (!lost.length) return '';
    const a = lost.filter(function (o) { return o === 'A'; }).length;
    const b = lost.length - a;
    const parts = [];
    if (a) parts.push(a + ' ' + (MODE === 'two' ? 'blue' : 'of yours'));
    if (b) parts.push(b + ' ' + (MODE === 'two' ? 'red' : 'of the rival\u2019s'));
    return ' ' + parts.join(' and ') + ' ' + (lost.length > 1 ? 'are' : 'is') + ' shoved off the side and lost.';
  }

  // Who crossed on this move (and which exit closed).
  function crossText(p, res) {
    if (!res.crossed[p]) return '';
    const who = MODE === 'two' ? colorName(p) : (p === 'A' ? 'you' : 'the rival');
    return ' A piece crosses the board: +1 for ' + who + '. That exit is now closed for everybody.';
  }

  function describe(p, res) {
    const name = nameOf(p);
    const their = theirOf(p);
    const rank = G.rankOf(res.piece);
    const dirWord = res.dir < 0 ? 'left' : 'right';
    if (res.kind === 'arrive') return name + ': ' + their + ' ' + rank + ' steps onto the far row.' + crossText(p, res);
    if (res.kind === 'step') return name + ': ' + their + ' ' + rank + ' steps forward.';
    if (res.kind === 'slide') return name + ': ' + their + ' ' + rank + ' sidesteps ' + dirWord + '.';
    if (res.kind === 'swap') return name + ': ' + their + ' ' + rank + ' swaps places with ' + their + ' ' + G.rankOf(res.other) + '.';
    const base = name + ': ' + their + ' ' + rank + ' beats a ' + G.rankOf(res.beaten) + ' and shoves ' +
      res.chain + ' ' + plural(res.chain, 'piece', 'pieces') + ' ' + dirWord + '.';
    return base + (res.lost.length ? lostText(res.lost) : ' Nobody is lost.') + crossText(p, res);
  }

  function needText(count, bid, remaining, owner) {
    const two = MODE === 'two';
    const isYou = !two && owner === 'A';
    const subj = two ? colorName(owner) : (isYou ? 'You' : 'The rival');
    const have = isYou ? 'have' : 'has';
    const poss = two ? colorName(owner) + '\u2019s' : (isYou ? 'your' : 'their');
    if (count > bid) return { text: subj + ' ' + have + ' already gone over by ' + (count - bid) + '.', cls: 'over' };
    if (count === bid) {
      return { text: isYou ? 'Exactly on your bid. Don\u2019t cross any more.' : subj + ' ' + (two ? 'is' : 'is') + ' exactly on ' + (two ? 'the' : 'their') + ' bid.', cls: 'exact' };
    }
    const need = bid - count;
    if (remaining < need) {
      return { text: subj + ' ' + (isYou ? 'can' : 'can') + ' no longer reach ' + poss + ' bid: only ' + remaining + ' ' + plural(remaining, 'exit or piece is', 'exits or pieces are') + ' left.', cls: 'over' };
    }
    return { text: subj + ' ' + (isYou ? 'need' : 'needs') + ' ' + need + ' more to cross.', cls: '' };
  }

  // ---- Drawing ----
  function renderBoard() {
    const board = $('board');
    board.textContent = '';
    const myTurn = S.phase === 'play' && isHuman(S.turn);
    const mover = S.turn;
    const mine = myTurn ? G.legalMoves(S.st, mover) : [];
    const cellEls = [];

    for (let r = 0; r < G.ROWS; r++) {
      cellEls.push([]);
      for (let c = 0; c < G.COLS; c++) {
        const cell = el('div', 'cell' + ((r === 0 || r === G.ROWS - 1) && S.st.closed[c] ? ' shut' : ''));
        cellEls[r].push(cell);
        const v = S.st.board[r][c];
        if (v) {
          const isYou = v[0] === mover;
          const piece = el('button', 'piece ' + (v[0] === 'A' ? 'blue' : 'red'), v[1]);
          piece.type = 'button';
          piece.setAttribute('aria-label',
            (v[0] === 'A' ? 'Blue piece' : 'Red piece') + ', rank ' + v[1] + ', row ' + (r + 1) + ', column ' + (c + 1));
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
    renderArrows(cellEls);
  }

  function renderExits() {
    ['exits-top', 'exits-bottom'].forEach(function (id) {
      const box = $(id);
      box.textContent = '';
      for (let c = 0; c < G.COLS; c++) {
        const closed = S.st.closed[c];
        const lamp = el('span', 'lamp' + (closed ? ' closed' : ''), closed ? '\u2715' : '\u25cb');
        lamp.title = closed ? 'This exit is closed' : 'This exit is open';
        box.appendChild(lamp);
      }
    });
    const open = G.openExits(S.st);
    $('exits-count').textContent = open + ' of ' + G.COLS + ' exits open. Each column has one exit, shared by both players.';
  }

  // Arrows drawn on the board, on the square each move leads to.
  function renderArrows(cellEls) {
    if (!(S.phase === 'play' && isHuman(S.turn) && S.sel)) return;
    const sel = S.sel;
    const P = S.turn, F = fwd(P);
    const moves = G.legalMoves(S.st, P).filter(function (m) { return m.r === sel.r && m.c === sel.c; });
    moves.forEach(function (m) {
      const res = G.applyMove(S.st, P, m);
      let target, cls = 'arrow', glyph;
      if (m.type === 'side') {
        target = [m.r, m.c + m.dir];
        cls += ' side' + (res.kind === 'swap' ? ' swap' : '');
        glyph = res.kind === 'swap' ? '\u21c4' : (m.dir < 0 ? '\u2190' : '\u2192');
      } else if (res.kind === 'arrive' || res.kind === 'step') {
        target = [m.r + F, m.c];
        cls += ' go';
        glyph = '\u2191';
      } else {
        target = [m.r + F, m.c];
        cls += ' go shove ' + (m.shove < 0 ? 'left' : 'right');
        glyph = m.shove < 0 ? '\u2190' : '\u2192';
      }
      const label = moveLabel(m, res, P);
      const btn = el('button', cls, glyph);
      btn.type = 'button';
      btn.setAttribute('aria-label', label);
      btn.title = label;
      if (res.lost && res.lost.length) {
        const badge = el('span', 'badge', '\u2212' + res.lost.length);
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      if (res.crossed && res.crossed[P]) {
        const badge = el('span', 'badge good', '+' + res.crossed[P]);
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      btn.addEventListener('click', function () { play(P, m); });
      btn.addEventListener('mouseenter', function () { showHint(label); });
      btn.addEventListener('focus', function () { showHint(label); });
      btn.addEventListener('mouseleave', renderActions);
      btn.addEventListener('blur', renderActions);
      cellEls[target[0]][target[1]].appendChild(btn);
    });
  }

  function showHint(text) {
    const box = $('actions');
    box.textContent = '';
    box.appendChild(el('p', 'blocked-note', text));
  }

  function renderScoreCard(id, name, swatch, bid, count, owner) {
    const isYou = MODE !== 'two' && owner === 'A';
    const card = $(id);
    card.textContent = '';
    if (S.phase === 'bid' || S.phase === 'bid2') { card.hidden = true; return; }
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
    const need = needText(count, bid, Math.min(onBoard, G.openExits(S.st)), owner);
    card.appendChild(el('p', 'need ' + need.cls, need.text));

    card.appendChild(el('p', 'tokens',
      onBoard + ' on the board · ' + S.lost[owner] + ' lost · ' +
      S.st.tokens[owner] + ' of ' + G.START_TOKENS + ' sidestep left'));
  }

  function moveLabel(m, res, p) {
    const two = MODE === 'two';
    const own = two ? colorName(p) + '\u2019s' : 'your';
    const gain = two ? colorName(p) : 'you';
    if (m.type === 'side') {
      const arrow = m.dir < 0 ? '\u2190' : '\u2192';
      if (res.kind === 'swap') return arrow + ' Swap places with ' + own + ' ' + G.rankOf(res.other) + ' (uses the sidestep)';
      return arrow + ' Sidestep into the empty square (uses the sidestep)';
    }
    if (res.kind === 'arrive') return '\u2191 Step forward and cross the board (+1 for ' + gain + ', closes this exit for both)';
    if (res.kind === 'step') return '\u2191 Step forward';
    const arrow = m.shove < 0 ? '\u2190' : '\u2192';
    let label = '\u2191 Beat the ' + G.rankOf(res.beaten) + ' and shove ' + arrow + ' ';
    if (!res.lost.length) label += '(nobody lost)';
    else {
      const mineLost = res.lost.filter(function (o) { return o === p; }).length;
      const theirsLost = res.lost.length - mineLost;
      const parts = [];
      if (mineLost) parts.push(mineLost + (two ? ' of ' + colorName(p).toLowerCase() : ' of yours') + ' lost');
      if (theirsLost) parts.push(theirsLost + (two ? ' of ' + colorName(p === 'A' ? 'B' : 'A').toLowerCase() : ' of theirs') + ' lost');
      label += '(' + parts.join(', ') + ')';
    }
    return label + (res.crossed[p] ? ' (+' + res.crossed[p] + ' for ' + gain + ', closes that exit)' : '');
  }

  function renderActions() {
    const box = $('actions');
    box.textContent = '';
    if (!(S.phase === 'play' && isHuman(S.turn) && S.sel)) return;
    const sel = S.sel;
    const P = S.turn;
    const mine = G.legalMoves(S.st, P).filter(function (m) { return m.r === sel.r && m.c === sel.c; });
    const hasFwd = mine.some(function (m) { return m.type === 'fwd'; });
    if (!hasFwd) {
      const ahead = S.st.board[sel.r + fwd(P)] && S.st.board[sel.r + fwd(P)][sel.c];
      box.appendChild(el('p', 'blocked-note',
        'This ' + S.st.board[sel.r][sel.c][1] + ' can\u2019t advance: ' +
        (ahead ? 'the ' + ahead[1] + ' in front has the same rank or higher.' : 'it is blocked.')));
    }
    box.appendChild(el('p', 'blocked-note',
      'Tap an arrow on the board. Gold arrows move forward; outlined arrows are the sidestep (' +
      S.st.tokens[P] + ' left). A red \u2212 means pieces would be lost; a green + means that piece crosses and closes that exit.'));
  }

  function renderStatus() {
    let text = '';
    const two = MODE === 'two';
    if (S.phase === 'bid') text = two ? 'Blue bets first. Red will see the bet before it bets. Blue moves first on the board.'
      : 'Place your bet first. The rival will see it before it bets. You move first on the board.';
    else if (S.phase === 'bid2') text = 'Red\u2019s turn to bet. Blue has bet ' + S.a + '.';
    else if (S.phase === 'play' && isHuman(S.turn)) {
      const who = two ? colorName(S.turn) + '\u2019s turn. ' : 'Your turn. ';
      text = S.sel ? 'Choose how to move it.' : who + 'Tap one of ' + (two ? colorName(S.turn).toLowerCase() : 'your blue') + ' pieces.';
    }
    else if (S.phase === 'play') text = 'The rival is thinking\u2026';
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
    const two = MODE === 'two';
    const o = G.outcome(S.a, S.b, S.ca, S.cb);
    const title = o.winner === 'T' ? 'Tie'
      : (two ? colorName(o.winner) + ' wins' : (o.winner === 'A' ? 'You win' : 'You lose'));
    function ending(p, err, count, bid) {
      const who = two ? colorName(p) : (p === 'A' ? 'you' : 'the rival');
      if (err === 0) return who + ' hit ' + (two || p === 'B' ? 'their' : 'your') + ' bid exactly';
      return who + (count > bid ? ' went over by ' : ' fell short by ') + err;
    }
    box.appendChild(el('h2', '', title));
    let msg = ending('A', o.errA, S.ca, S.a) + ' and ' + ending('B', o.errB, S.cb, S.b) + '.';
    msg = msg.charAt(0).toUpperCase() + msg.slice(1);
    if (o.sameDistance) msg += ' Same distance from the bet: a tie.';
    if (S.stuck) msg += ' Nobody could move, so ' + S.stuck + ' ' + plural(S.stuck, 'piece stayed', 'pieces stayed') + ' on the board and counted for nobody.';
    box.appendChild(el('p', '', msg));
  }

  function render() {
    $('bid-box').hidden = S.phase !== 'bid' && S.phase !== 'bid2';
    renderExits();
    renderBoard();
    renderScoreCard('you', MODE === 'two' ? 'Blue' : 'You (blue)', 'blue', S.a, S.ca, 'A');
    renderScoreCard('rival', MODE === 'two' ? 'Red' : 'Rival (red)', 'red', S.b, S.cb, 'B');
    renderActions();
    renderResult();
    renderStatus();
    renderLog();
  }

  // ---- Actions ----
  function selectPiece(r, c) {
    if (S.phase !== 'play' || !isHuman(S.turn)) return;
    S.sel = (S.sel && S.sel.r === r && S.sel.c === c) ? null : { r: r, c: c };
    render();
  }

  function play(p, move) {
    const res = G.applyMove(S.st, p, move);
    S.st = res.state;
    S.ca += res.crossed.A;
    S.cb += res.crossed.B;
    res.lost.forEach(function (owner) { S.lost[owner]++; });
    S.log.unshift(describe(p, res));
    S.sel = null;

    const nx = G.next(S.st, p);
    if (nx.done) {
      S.phase = 'end';
      S.stuck = nx.stuck;
      if (nx.stuck) S.log.unshift('Nobody can move. The ' + nx.stuck + ' pieces left on the board count for nobody.');
    } else {
      if (nx.turn === p) S.log.unshift(MODE === 'two' ? (p === 'A' ? 'Red' : 'Blue') + ' has no moves and passes.' : (p === 'A' ? 'The rival has no moves and passes.' : 'You have no moves and pass.'));
      S.turn = nx.turn;
    }
    render();
    if (S.phase === 'play' && S.turn === 'B' && MODE === 'bot') scheduleRival();
  }

  function scheduleRival() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      const move = G.chooseRivalMove(S.st, { a: S.a, b: S.b }, { ca: S.ca, cb: S.cb }, RIVAL_DEPTH);
      play('B', move);
    }, RIVAL_DELAY_MS);
  }

  function startGame() {
    const v = Number($('bid-range').value);
    if (MODE === 'two') {
      if (S.phase === 'bid') {
        S.a = v;
        S.phase = 'bid2';
        $('bid-range').value = Math.min(G.PIECES_EACH, 1);
        updateForbidden();
        render();
        return;
      }
      if (S.a + v === G.FORBIDDEN_SUM) return;
      S.b = v;
      S.phase = 'play';
      S.turn = 'A';
      S.log = ['Blue bet ' + S.a + '. Red saw it and bet ' + S.b + '.'];
      render();
      return;
    }
    S.a = v;
    S.b = G.chooseRivalBid(S.a);
    S.phase = 'play';
    S.turn = 'A';
    S.log = ['You bet ' + S.a + '. The rival saw it and bets ' + S.b + '.'];
    render();
  }

  function updateForbidden() {
    const v = Number($('bid-range').value);
    $('bid-value').textContent = String(v);
    const two = MODE === 'two';
    const red = two && S && S.phase === 'bid2';
    const hint = $('bid-hint');
    const go = $('bid-go');
    const sum = G.FORBIDDEN_SUM;
    go.disabled = false;
    if (red) {
      $('bid-label').textContent = 'Red: how many of your 3 pieces will cross the board?';
      const bad = sum - S.a;
      const badOk = bad >= 0 && bad <= G.PIECES_EACH;
      hint.textContent = 'Blue bet ' + S.a + '.' + (badOk ? ' Red can\u2019t bet ' + bad + ', because the two bets can\u2019t add up to ' + sum + '.' : '');
      if (S.a + v === sum) { go.disabled = true; hint.textContent += ' (Pick a different number.)'; }
      go.textContent = 'Place Red\u2019s bet and start';
    } else {
      $('bid-label').textContent = (two ? 'Blue: h' : 'H') + 'ow many of your 3 pieces will cross the board?';
      const bad = sum - v;
      const badOk = bad >= 0 && bad <= G.PIECES_EACH;
      hint.textContent = (two ? 'Blue bets first and Red sees the bet. ' : 'You bet first and the rival sees your bet. ') +
        (badOk ? (two ? 'Red' : 'The rival') + ' can\u2019t bet ' + bad + ', because the two bets can\u2019t add up to ' + sum + ' (the number of exits).' : '');
      go.textContent = two ? 'Place Blue\u2019s bet' : 'Place bet and start';
    }
  }

  function setMode(m) {
    MODE = m;
    $('mode-bot').setAttribute('aria-pressed', String(m === 'bot'));
    $('mode-two').setAttribute('aria-pressed', String(m === 'two'));
    $('mode-bot').classList.toggle('on', m === 'bot');
    $('mode-two').classList.toggle('on', m === 'two');
    $('board-note').textContent = m === 'two'
      ? 'Blue moves up and goes first. Red moves down. Pass the device back and forth. The number on each piece is its rank: only a higher rank can push a piece out of the way.'
      : 'You are blue and move up. The rival is red and moves down. The number on each piece is its rank: only a higher rank can push a piece out of the way.';
    newGame();
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
  $('mode-bot').addEventListener('click', function () { setMode('bot'); });
  $('mode-two').addEventListener('click', function () { setMode('two'); });

  setMode('bot');
})();
