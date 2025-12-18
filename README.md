# STACKERS: Five & Slide

A lightweight Vite + React + TypeScript implementation of the abstract game. Includes a pure rules engine with Vitest coverage and a clickable UI.

## Getting started

Install dependencies:

```bash
npm install
```

Run the dev server (binds to `0.0.0.0:4173` for the preview):

```bash
npm run dev
```

Run tests:

```bash
npm test
```

### How to play in this preview
- Click a stack that has your color on top to select it, pick direction and segment size, then press **Move**.
- **Place** drops a new token into the lowest legal space (obeying the special slot rules).
- **Bubble Up** becomes available only when you cannot move or place; click it then choose one of your pinned tokens to lift it to the top.
- Exiting 5 of your tokens (moving forward off space 8) wins immediately.

## Rules summary (implemented in engine)
- Board spaces 1–8 each hold a bottom→top stack (array index 0 is bottom). Exit is beyond space 8.
- On your turn take exactly one action: **move** a top stack segment one space (with Five & Slide), **place** a new token, or **bubble up** if you are stuck.
- Move: only your contiguous top tokens may move, distance exactly 1 forward/backward. Landing on opponents pins them. If destination has 5 tokens, slide forward past any 5-stacks; sliding is always forward. Landing stacks may never exceed 5 tokens. Moving forward off space 8 exits tokens and counts toward victory.
- Place: into the lowest empty space; if spaces 2–7 are filled and space 1 is empty you must place there; if spaces 1–7 are filled you may place in space 8. Forced to place when you have unplaced tokens, an empty space, and no legal moves.
- Bubble Up: only when you have no legal move and cannot place; choose one of your pinned tokens to move it to the top of its stack.
- Red starts; turn passes unless a winning exit occurs.
