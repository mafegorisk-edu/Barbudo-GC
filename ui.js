/*
  Barbudo Empujones v2: the screen.
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
      st: G.newState(),  // { board, tokens }
      a: 0, b: 0,        // bids: yours and the rival's
      ca: 0, cb: 0,      // falls each player has scored so far
      turn: 'A',
      phase: 'bid',      // 'bid' -> 'play' -> 'end'
      sel: null,         // selected piece { r, c }
      leftover: 0,       // pieces that scored because of a deadlock
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
  function fallsText(falls, p) {
    const k = falls.length;
    if (!k) return '';
    const mine = falls.filter(function (o) { return o === 'A'; }).length;
    const theirs = k - mine;
    const parts = [];
    if (mine) parts.push(mine + ' ' + plural(mine, 'ficha tuya', 'fichas tuyas'));
    if (theirs) parts.push(theirs + ' ' + plural(theirs, 'ficha del rival', 'fichas del rival'));
    const who = p === 'A' ? 'ti' : 'el rival';
    return ' Cae' + (k > 1 ? 'n' : '') + ' ' + parts.join(' y ') + ': +' + k + ' para ' + who + '.';
  }

  function describe(p, res) {
    const you = p === 'A';
    const name = you ? 'Tú' : 'El rival';
    const rank = G.rankOf(res.piece);
    const dirWord = res.dir < 0 ? 'la izquierda' : 'la derecha';
    if (res.kind === 'exit') return name + ': saca su ' + rank + ' por el fondo.' + fallsText(res.falls, p);
    if (res.kind === 'step') return name + ': avanza su ' + rank + '.';
    if (res.kind === 'slide') return name + ': desliza su ' + rank + ' a ' + dirWord + '.';
    if (res.kind === 'swap') return name + ': cambia de lugar su ' + rank + ' con su ' + G.rankOf(res.other) + '.';
    const base = name + ': su ' + rank + ' vence a un ' + G.rankOf(res.beaten) + ' y empuja ' +
      res.chain + ' ' + plural(res.chain, 'ficha', 'fichas') + ' hacia ' + dirWord + '.';
    return base + (res.falls.length ? fallsText(res.falls, p) : ' Sin caídas.');
  }

  function needText(count, bid, isYou) {
    if (count < bid) {
      const n = bid - count;
      return { text: (isYou ? 'Te faltan ' : 'Le faltan ') + n + ' exacta' + (n > 1 ? 's' : '') + '.', cls: '' };
    }
    if (count === bid) {
      return { text: isYou ? '¡Justo! No sumes más.' : 'Está justo en su apuesta.', cls: 'exact' };
    }
    const over = count - bid;
    return { text: (isYou ? 'Ya te pasaste por ' : 'Ya se pasó por ') + over + '.', cls: 'over' };
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
            (isYou ? 'Ficha azul' : 'Ficha roja') + ' de rango ' + v[1] + ', fila ' + (r + 1) + ', columna ' + (c + 1));
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

  function renderScoreCard(id, name, swatch, bid, count, isYou) {
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
    main.appendChild(el('span', 'score-label', 'apuesta · ' + count + ' ' + plural(count, 'caída', 'caídas')));
    card.appendChild(main);

    const pips = el('div', 'pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < G.TOTAL_PIECES; i++) {
      const pip = el('span', 'pip');
      if (i < count) {
        pip.classList.add('filled', isYou ? 'you-pip' : 'rival-pip');
        if (i >= bid) pip.classList.add('over');
      }
      if (bid > 0 && i === bid - 1) pip.classList.add('target');
      pips.appendChild(pip);
    }
    card.appendChild(pips);

    const need = needText(count, bid, isYou);
    card.appendChild(el('p', 'need ' + need.cls, need.text));

    const t = S.st.tokens[isYou ? 'A' : 'B'];
    card.appendChild(el('p', 'tokens',
      'Pasos laterales: ' + t + ' de ' + G.START_TOKENS));
  }

  function moveLabel(m, res) {
    const k = res.falls.length;
    const rank = G.rankOf(res.piece);
    if (m.type === 'side') {
      const arrow = m.dir < 0 ? '←' : '→';
      if (res.kind === 'swap') return arrow + ' Cambiar de lugar con tu ' + G.rankOf(res.other) + ' (gasta 1 paso lateral)';
      return arrow + ' Deslizar a la casilla vacía (gasta 1 paso lateral)';
    }
    if (res.kind === 'exit') return '↑ Salir del tablero (+1 para ti)';
    if (res.kind === 'step') return '↑ Avanzar';
    const arrow = m.shove < 0 ? '←' : '→';
    const mineFalls = res.falls.filter(function (o) { return o === 'A'; }).length;
    let label = '↑ Vencer al ' + G.rankOf(res.beaten) + ' y empujar ' + arrow + ' ';
    if (!k) label += '(sin caídas)';
    else label += '(' + k + ' ' + plural(k, 'caída', 'caídas') +
      (mineFalls ? ', ' + mineFalls + ' ' + plural(mineFalls, 'tuya', 'tuyas') : '') + ': +' + k + ' para ti)';
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
      const note = el('p', 'blocked-note',
        'Este ' + S.st.board[sel.r][sel.c][1] + ' no puede avanzar: ' +
        (ahead ? 'el ' + ahead[1] + ' de enfrente tiene el mismo rango o más.' : 'está bloqueado.'));
      box.appendChild(note);
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
    if (S.phase === 'bid') text = 'Elige tu apuesta para empezar. Tú juegas primero.';
    else if (S.phase === 'play' && S.turn === 'A') text = S.sel ? 'Elige cómo moverla.' : 'Tu turno. Toca una ficha azul.';
    else if (S.phase === 'play') text = 'El rival está pensando…';
    else text = 'Partida terminada.';
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
    const title = o.winner === 'A' ? 'Ganaste' : (o.winner === 'B' ? 'Perdiste' : 'Empate');
    const youEnd = o.errA === 0 ? 'Tú clavaste tu apuesta'
      : (S.ca > S.a ? 'Tú te pasaste por ' + o.errA : 'Tú te quedaste corto por ' + o.errA);
    const rivalEnd = o.errB === 0 ? 'el rival clavó la suya'
      : (S.cb > S.b ? 'el rival se pasó por ' + o.errB : 'el rival se quedó corto por ' + o.errB);
    box.appendChild(el('h2', '', title));
    let msg = 'Cayeron las 8 fichas. ' + youEnd + ' y ' + rivalEnd + '.';
    if (S.leftover) msg += ' Hubo bloqueo: ' + S.leftover + ' ' + plural(S.leftover, 'ficha quedó', 'fichas quedaron') +
      ' en el tablero y cada quien se anotó las suyas.';
    box.appendChild(el('p', '', msg));
  }

  function render() {
    $('bid-box').hidden = S.phase !== 'bid';
    renderBoard();
    renderScoreCard('you', 'Tú (azul)', 'blue', S.a, S.ca, true);
    renderScoreCard('rival', 'Rival (rojo)', 'red', S.b, S.cb, false);
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
    const k = res.falls.length;
    if (p === 'A') S.ca += k; else S.cb += k;
    S.log.unshift(describe(p, res));
    S.sel = null;

    const nx = G.next(S.st, p);
    if (nx.done) {
      S.phase = 'end';
      S.ca += nx.leftover.A;
      S.cb += nx.leftover.B;
      S.leftover = nx.leftover.A + nx.leftover.B;
      if (S.leftover) {
        S.log.unshift('Nadie puede moverse. Las ' + S.leftover + ' fichas que quedan cuentan para su dueño.');
        S.st = { board: S.st.board.map(function (row) { return row.map(function () { return null; }); }), tokens: S.st.tokens };
      }
    } else {
      if (nx.turn === p) {
        S.log.unshift(p === 'A' ? 'El rival no tiene jugadas y pasa.' : 'No tienes jugadas y pasas.');
      }
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
    S.log = ['Apuestas: tú ' + S.a + ', rival ' + S.b + ' (suman ' + (S.a + S.b) + ' de 8).' +
      (S.a + S.b < 8 ? ' Regalando: sobran caídas que nadie quiere.' : ' Peleando: los dos quieren más de las que hay.')];
    render();
  }

  function newGame() {
    if (S) clearTimeout(S.timer);
    S = freshState();
    $('bid-range').value = 4;
    $('bid-value').textContent = '4';
    $('forbidden').textContent = '4';
    render();
  }

  // ---- Wire up the page ----
  $('bid-range').addEventListener('input', function () {
    const v = Number(this.value);
    $('bid-value').textContent = String(v);
    $('forbidden').textContent = String(G.TOTAL_PIECES - v);
  });
  $('bid-go').addEventListener('click', startGame);
  $('new-game').addEventListener('click', newGame);

  newGame();
})();
