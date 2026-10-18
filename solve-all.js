// Exact solver run: who wins each pair of bids with perfect play?
// Usage:  node solve-all.js        (takes a few minutes; some pairs are big)
// Value is from the first player's point of view:
//   1 = the first player (blue) wins, -1 = the second player (red) wins, 0 = draw, null = too big to finish.
const G = require('./game.js');
const LIMIT = 6e6; // states to explore per pair before giving up
for (let a = 0; a <= G.PIECES_EACH; a++) {
  for (let b = 0; b <= G.PIECES_EACH; b++) {
    if (a + b === G.FORBIDDEN_SUM) continue; // not a legal pair of bids
    const t = Date.now();
    const r = G.solve(a, b, LIMIT);
    console.log('blue bids ' + a + ', red bids ' + b + ' -> ' + r.value +
      '   (' + r.states + ' positions, ' + (Date.now() - t) + ' ms)');
  }
}
