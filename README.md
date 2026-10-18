# Barbudo Empujones v2 (ranks and sidesteps)

A two-player game inspired by Barbudo, the Gonzalez del Riego family card game. You bet how many pieces you will knock off the board, and you want to hit that number exactly. Play it against a rival that thinks six turns ahead.

This is a plain website: HTML, CSS and JavaScript. No build step, no dependencies.


## What is new in v2

- **Ranks.** Every piece has a rank from 1 to 4, like cards. You can only enter an occupied square if your rank is higher than the piece standing there; with an equal or lower rank that piece is blocked.
- **Sidesteps.** Each player gets 3 in the whole game. A sidestep moves one of your pieces one square left or right, into an empty square or swapping places with another of your pieces. It is how you rearrange your ranks, and it is also a way to "pass" without advancing.
- **Deadlock.** If you have no legal move you pass. If nobody can move, every piece still on the board falls and scores for its owner.
- The game still has no loops: advancing is one-way and sidesteps run out, so it always ends. `game.js` is still the only file with rules.

## Putting v2 on its own branch (keeps your current site safe)

Run these inside the folder of your existing repo, one at a time:

```
git checkout -b v2-ranks
```

Now copy the files from this v2 folder over the old ones (`index.html`, `style.css`, `game.js`, `ui.js`, `README.md`), then:

```
git add .
git commit -m "v2: ranked pieces and sidesteps"
git push -u origin v2-ranks
```

Your `main` branch, and the site Render builds from it, do not change. To try v2 online, on Render click **New +**, then **Static Site**, pick the same repo, set **Branch** to `v2-ranks`, **Build Command** empty, **Publish Directory** `.`. When you like v2 more, merge it with a pull request on GitHub (a button on the branch page).

## What each file does

| File | Job |
| --- | --- |
| `index.html` | The page: where the board, scoreboard and rules go |
| `style.css` | Colors, fonts, board and pieces |
| `game.js` | The rules of the game and the rival's brain. No screen code in here |
| `ui.js` | Draws the board, handles clicks, runs the rival's turn |

Rules live in `game.js` and drawing lives in `ui.js` on purpose. If you later want to write a solver, or port the game to GamesmanClassic, `game.js` is the part you reuse.

## Try it on your computer

Open `index.html` in your browser. Or, from this folder:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Put it on GitHub

1. On github.com, click **New repository**. Name it `barbudo-empujones`. Leave "Add a README" **unchecked** (you already have one). Click **Create repository**.
2. In a terminal, go to this folder and run these one at a time, replacing `YOUR-USERNAME`:

```
git init
git add .
git commit -m "First version of Barbudo Empujones"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/barbudo-empujones.git
git push -u origin main
```

What those do: `git init` starts tracking this folder. `git add .` picks every file for the next save. `git commit` saves a snapshot with a message. `git remote add` tells git where your GitHub repo is. `git push` uploads the snapshot.

## Put it online with Render

1. Sign in at render.com (you can use your GitHub account).
2. Click **New +**, then **Static Site**.
3. Connect your GitHub account and pick the `barbudo-empujones` repo.
4. Fill in the form:
   - **Branch:** `main`
   - **Build Command:** leave empty
   - **Publish Directory:** `.` (a single dot)
5. Click **Create Static Site**. When it finishes you get a link like `https://barbudo-empujones.onrender.com`.

If the form insists on a build command, type `echo "no build needed"`.

## Changing the game later

Edit a file, then save and upload the change:

```
git add .
git commit -m "Describe what you changed"
git push
```

Render notices the push and updates the site by itself, usually within a minute or two.

## Ideas to try next

- In `game.js`, change the starting layout in `newBoard()`, or the rival's depth in `ui.js` (`RIVAL_DEPTH`).
- Add a "push strength" option so a shove moves the row two squares.
- Add the trump piece and the holes from the earlier prototypes.
- Write a solver that tries every possible game. The game has no loops, so it finishes.
