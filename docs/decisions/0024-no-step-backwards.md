# 0024: No step backwards

Status: proposed 7 November 2026, after 1.1.1. Sam approves it.

## What happened

A user wrote that Octet 1.1.1 took away the motion of Clean Up and similar commands. The code of the glide (FEEL-38:
Clean Up, Rotate 180°, Flip, a turn of 15° or more, Align, Distribute and Line up) was the same in 1.1.0 and 1.1.1.
The motion was lost in a different way:

- The glide's clock was the page's animation timeline (`tween` in `src/motion.tsx`). That timeline keeps the time
  its frame began, while the command does its work. Clean Up does its work and starts the glide in the same task,
  so the time Clean Up took was counted as part of the 180 ms glide. After 150 ms of work, only the last 30 ms were
  painted. After 180 ms or more, there was no glide.
- 1.1.1 made Clean Up give the same result each time (`src/clean2d.ts`: a fixed amount of work, not 100 ms per
  pass) and move labels off bonds. Clean Up is slower in 1.1.1: taxol 148 ms to 255 ms, caffeine 8 ms to 11 ms in
  Node on the same computer; cholesterol 381 ms to 678 ms in the app with the computer 4 times slower.
- So on many computers, Clean Up went past 180 ms in 1.1.1 and the glide was gone. Measured on a production build
  with the computer 4 times slower: 1.1.0 and 1.1.1 show no glide for aspirin or cholesterol. With the fix, both glide.

Nothing in the checks looked at the experience: they read code and data, not what a user sees. No check compared a
release with the one before it.

## The fix

`src/tween.ts` measures the glide with the computer's clock, from the first frame that runs. The work before a glide
no longer shortens it. Each glide shows all its 180 ms, whatever Clean Up took.

Clean Up is as quick as in 1.1.0 again, or quicker, and still gives the same result each time (`src/clean2d.ts`):

- The gradient is worked out exactly in one sweep, not measured by moving each group of atoms four ways.
- The line search stops once the energy climbs again, not after all 21 step sizes.
- Once a structure settles, each step follows L-BFGS, not conjugate gradients, so far fewer rounds are needed.
- A round makes one list of close pairs, each pair once.
- The editor runs a few small clean-ups that nobody sees soon after start, so the browser has Clean Up's code
  compiled before the first click.

In the app, from a real click, against 1.1.0 (headless Chrome, as `scripts/experience.mjs` measures):

| Clean Up | 1.1.0 | Now |
| --- | --- | --- |
| Cholesterol | 146 ms, glide 70 ms | 45 ms, glide 210 ms |
| Taxol | 235 ms, glide 16 ms | 81 ms, glide 212 ms |
| A 245-atom peptide | 228 ms, glide 22 ms | 193 ms, glide 199 ms |
| Cholesterol, computer 4 times slower | 309 ms | 191 ms |
| Taxol, computer 4 times slower | 365 ms | 390 ms |
| The peptide, computer 4 times slower | 526 ms | 672 ms |

On a slow computer 1.1.0 stopped each pass after 100 ms, so its large structures came out less tidy, and differently
from run to run. A large structure on a very slow computer is the one case still slower than 1.1.0 (within the
experience check's 25%), and it now glides.

## Decision

A release never takes away or makes worse something users had in the release before it, unless Sam approves that
one thing in [docs/removals.md](../removals.md), with the reason. Three checks hold this rule. Each one compares
this commit with the last release tag, so the baseline is always what users have now.

1. `src/tween.check.ts` (in `npm test`): a glide keeps its whole time and its frames when the work before it is
   slow, and no other file makes a motion clock of its own.
2. `src/inventory.check.ts` (in `npm test`): every menu item and its shortcut, Actions panel command, setting,
   template, animation (`@keyframes`), overlay exit motion and glide of the last release is still there.
3. `scripts/experience.mjs` (CI job "Experience"): builds the last release and this commit on the same computer,
   opens each in headless Chrome, and runs the scenarios in `scripts/experience.json` as they are and with the
   computer 4 times slower. A glide must show (at least 120 ms), a button must still be there, and a command may
   not be more than 25% (plus 30 ms) slower than in the last release.

The release workflow runs the checks first, so a release that fails one has no installers.

Rules for the checks themselves:

- Never weaken a check or remove a scenario to make a release pass. Add a scenario for each motion or command a user
  would miss. A new feature adds its scenario in the same commit.
- An entry in `docs/removals.md` names the check's key, says why, and says "Approved by Sam" with the date. Only
  Sam writes "Approved by Sam".
- A user's report of something lost is a bug of the highest priority. Find the commit, add a check that fails on
  it, then fix it.

## Why these, and not others

- Comparing with the last release, built on the same computer in the same run, makes speed checks fair on GitHub's
  slow machines: both builds are equally slow.
- The CPU throttling stands in for a user's slower computer. The 1.1.1 loss did not show on the computer that built
  it.
- The inventory reads the source, so it is fast and runs on every push. It cannot see behaviour, so the experience
  check covers that.

## Open

- Issue #55: 1.1.1 pastes into Word 7.5 times too large on Windows (the EMF's 720 dpi reference). That is another
  step backwards from 1.1.0. Its check belongs in `src-tauri/src/vector.rs`: the frame and the bounds of the
  clipboard's EMF give the same size.
- Other motions made with `element.animate()` (the camera, the shake) use the same timeline. They start from the
  pointer, not after long work, so they were not lost. Move them to the same clock if one is.
- The checks cannot see the Mac, Windows and Linux web views. `scripts/drive/drive.mjs` could add one glide step on
  Windows and Linux.
