# BarbShove

A two-player board game inspired by Barbudo, the González del Riego family card game. You bet how many of your own pieces will cross the board, then you have to make it happen: not one more, not one fewer.

The same rules also exist as a GamesmanPy game (`barbshove.py`), so the game can be solved exactly.

## The rules in one minute

- 5×4 board. Each player has 3 pieces ranked 1 to 3. You are blue and move up. The rival is red and moves down.
- **Bets come first.** You bet how many of your pieces will cross. The rival bets second and sees your bet. The two bets can't add up to 3.
- **Your turn:** advance one piece one step, or spend one of your 2 sidesteps.
- **Advance** into an empty square, or into an occupied square if your rank is higher than the piece there. Then choose:
  - **Shove ← or →:** that piece and the pieces touching it slide sideways. A piece shoved off the side is lost and counts for nobody. (Makes the rival fall short.)
  - **Swap through ⇅:** you take its square and it goes back to yours. (Pushes the rival's pieces toward their goal so they overshoot.)
- **Crossing:** a piece that lands on the far row crosses at once, +1 for its owner. That includes a rival piece you swap onto its own far row.
- **Sidestep:** move a piece one square left or right, into an empty square or swapping with one of your own pieces.
- Closest to your own bet wins. Same distance: the first bidder (you) wins.
- No legal move: you pass. Nobody can move: the pieces left on the board count for nobody.

## What the solver says

I solved the whole game, bets included, with GamesmanPy (3.78 million positions) and checked every bet pair against two other solvers. With perfect play:

| Blue's bet | Result |
| --- | --- |
| 0 | red wins |
| 1 | red wins |
| 2 | blue wins |
| 3 | blue wins |

The first player wins the whole game. The rival in this page picks its bet from that table and searches 8 turns ahead on the board, so it is strong but not perfect.

One honest limit: moves on the board change the result in only a minority of positions (about 8% of positions that have a real choice). Most of the game is in the bets. Making the board matter more is the next design problem.

## Files

| File | Job |
| --- | --- |
| `index.html` | The page |
| `style.css` | Colors, fonts, board and pieces |
| `game.js` | The rules and the rival's brain. No screen code |
| `ui.js` | Draws the board, handles clicks, runs the rival's turn |

## Try it on your computer

Open `index.html` in a browser, or from this folder run `python3 -m http.server 8000` and visit http://localhost:8000.

## Put it on its own branch on GitHub

Run these in your existing repo folder, one at a time:

```
git checkout -b barbshove
```

Copy the files from this folder over the old ones (`index.html`, `style.css`, `game.js`, `ui.js`, `README.md`), then:

```
git add .
git commit -m "BarbShove: bets first, swap through, forced crossing"
git push -u origin barbshove
```

Your `main` branch does not change. To publish it, either:

- **Replace the live game:** on GitHub open a pull request from `barbshove` into `main` and merge it. Render updates the site by itself after a minute or two.
- **Keep both:** on Render click **New +**, **Static Site**, pick the same repo, set **Branch** to `barbshove`, leave **Build Command** empty, set **Publish Directory** to `.`.


## Current rules (v3: shared exits)
5 rows x 4 columns, 3 pieces each, one exit per column shared by both players (first crossing closes it), bets can't add up to 4, 1 sidestep each, no swap-through, ties are ties. The rival searches 10 moves ahead and answers your bet with the best reply found by solving the board exactly.
