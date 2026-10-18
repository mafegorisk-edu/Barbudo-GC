# Barbudo Shove (v3)

A two-player board game inspired by Barbudo, the Gonzalez del Riego family card game. Each player bets how many of their own pieces will cross the board, then has to make it happen: not one more, not one fewer.

Plain website: HTML, CSS and JavaScript. No build step, no dependencies.

## The rules in one minute

- 4x4 board, 4 pieces each, ranked 1 to 4. Two pieces start in the front row, face to face, and two start behind them on your own back border. Blue (you) moves up, red (the rival) moves down.
- Before playing, each player bets how many of their pieces will cross. The two bets can't add up to 4.
- On your turn: advance one piece one step, **or** spend one of your 3 sidesteps.
- Entering an occupied square needs a **higher rank**. You shove that piece and the pieces touching it sideways. A piece shoved off the side is **lost** and counts for nobody.
- A piece that walks off the far edge has **crossed**: +1 for its owner.
- Closest to your bet wins. Nobody moves backward, so the game always ends. If nobody can move, the pieces left are stuck and count for nobody.

## What changed from v2, and why

In v2 the exact solver showed that the sum of the two bets decided the winner, not the moves. The cause: 8 pieces always fall and the mover is credited, so your number depended on turn order, not on your decisions. In v3 your score is **your own pieces that cross**. You can hold pieces back, trade them away, or hurry them across, and your rival can shove your spare pieces off the side or leave you no safe moves.

## Honest note from the solver

`solve-all.js` solves every pair of bets exactly (`node solve-all.js`). I ran it on the first layout (all four pieces in one row): the **first player** won most pairs, for example blue wins whenever it bids 3 and red bids 0, 2, 3 or 4. The current layout (two pieces in front, two on the back border) has many more possible positions, and in my tests most pairs were too big for the solver to finish in a few minutes, so **I don't know yet how balanced it is**. Playing it is the best test for now, and the solver can still finish the smaller pairs if you give it more time or a bigger `LIMIT`. The rival on the page is not perfect (it looks 8 turns ahead with a rough guess beyond that), so the game is playable either way.

You can try other layouts by editing `START_LAYOUT` at the top of `game.js`: each entry is `[row, column, rank]` for blue, and red gets the same layout turned half a turn around.

## Files

| File | Job |
| --- | --- |
| `index.html` | The page |
| `style.css` | Colors, fonts, board and pieces |
| `game.js` | The rules, the rival's brain, and the exact solver. No screen code |
| `ui.js` | Draws the board, handles clicks, runs the rival's turn |
| `solve-all.js` | Runs the solver over every pair of bets |

## Try it on your computer

Open `index.html` in a browser, or from this folder run `python3 -m http.server 8000` and visit http://localhost:8000.

## Put v3 on its own branch on GitHub

Run these in your existing repo folder, one at a time:

```
git checkout -b v3-shove
```

Copy the files from this folder over the old ones (`index.html`, `style.css`, `game.js`, `ui.js`, `README.md`, plus the new `solve-all.js`), then:

```
git add .
git commit -m "v3: score your own crossings, English site"
git push -u origin v3-shove
```

Your `main` branch does not change. To publish v3, either:

- **Replace the live game:** on GitHub open a pull request from `v3-shove` into `main` and merge it. Render updates the site by itself after a minute or two.
- **Keep both:** on Render click **New +**, **Static Site**, pick the same repo, set **Branch** to `v3-shove`, leave **Build Command** empty, set **Publish Directory** to `.`.
