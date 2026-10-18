/*
  Barbudo Empujones: the screen.
  Draws the board and the scoreboard, reacts to clicks, and asks game.js
  for the rules and for the rival's moves. All rules live in game.js.
*/
(function () {
  'use strict';

  const G = window.Game;
  const RIVAL_DEPTH = 6;     // how many turns ahead the rival thinks
  const RIVAL_DELAY_MS = 700; // pause so you can see what happened

  // ---- State ----
  let S;

  function freshState() {
    return {
      board: G.newBoard(),
      a: 0, b: 0,        // bids: yours and the rival's
      ca: 0, cb: 0,      // falls each player has scored so far
      turn: 'A',
      phase: 'bid',      // 'bid' -> 'play' -> 'end'
      sel: null,         // selected piece { r, c }
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
    const name = p === 'A' ? 'Tú' : 'El rival';
    if (res.kind === 'exit') return name + ': saca una ficha por el fondo.' + fallsText(res.falls, p);
    if (res.kind === 'step') return name + ': avanza una ficha.';
    const side = res.dir < 0 ? 'la izquierda' : 'la derecha';
    const base = name + ': avanza y empuja ' + res.chain + ' ' + plural(res.chain, 'ficha', 'fichas') + ' hacia ' + side + '.';
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
    const mine = myTurn ? G.legalMoves(S.board, 'A') : [];

    for (let r = 0; r < G.ROWS; r++) {
      for (let c = 0; c < G.COLS; c++) {
        const cell = el('div', 'cell');
        const owner = S.board[r][c];
        if (owner) {
          const piece = el('button', 'piece ' + (owner === 'A' ? 'blue' : 'red'));
          piece.type = 'button';
          const label = (owner === 'A' ? 'Ficha azul' : 'Ficha roja') + ', fila ' + (r + 1) + ', columna ' + (c + 1);
          piece.setAttribute('aria-label', label);
          const movable = owner === 'A' && mine.some(function (m) { return m.r === r && m.c === c; });
          if (movable) {
            piece.classList.add('can-move');
            piece.addEventListener('click', function () { selectPiece(r, c); });
          } else {
            piece.disabled = true;
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
  }

  function renderActions() {
    const box = $('actions');
    box.textContent = '';
    if (!(S.phase === 'play' && S.turn === 'A' && S.sel)) return;
    const sel = S.sel;
    G.legalMoves(S.board, 'A').filter(function (m) {
      return m.r === sel.r && m.c === sel.c;
    }).forEach(function (m) {
      const res = G.applyMove(S.board, 'A', m);
      const k = res.falls.length;
      let label;
      if (res.kind === 'exit') {
        label = 'Salir del tablero (+1 para ti)';
      } else if (res.kind === 'step') {
        label = 'Avanzar';
      } else {
        const arrow = m.shove < 0 ? '←' : '→';
        const mineFalls = res.falls.filter(function (o) { return o === 'A'; }).length;
        label = 'Avanzar y empujar ' + arrow + ' ';
        if (!k) label += '(sin caídas)';
        else label += '(' + k + ' ' + plural(k, 'caída', 'caídas') +
          (mineFalls ? ', ' + mineFalls + ' ' + plural(mineFalls, 'tuya', 'tuyas') : '') + ': +' + k + ' para ti)';
      }
      const btn = el('button', '', label);
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
    box.appendChild(el('p', '', 'Cayeron las 8 fichas. ' + youEnd + ' y ' + rivalEnd + '.'));
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
    const res = G.applyMove(S.board, p, move);
    S.board = res.board;
    const k = res.falls.length;
    if (p === 'A') S.ca += k; else S.cb += k;
    S.log.unshift(describe(p, res));
    S.sel = null;

    const o = G.other(p);
    if (G.countPieces(S.board, 'A') + G.countPieces(S.board, 'B') === 0) {
      S.phase = 'end';
    } else if (G.legalMoves(S.board, o).length) {
      S.turn = o;
    } else {
      S.turn = p; // the other player has no pieces left: keep going
    }
    render();
    if (S.phase === 'play' && S.turn === 'B') scheduleRival();
  }

  function scheduleRival() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      const move = G.chooseRivalMove(S.board, { a: S.a, b: S.b, ca: S.ca, cb: S.cb }, RIVAL_DEPTH);
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
