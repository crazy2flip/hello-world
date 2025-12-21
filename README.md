# STACKERS: Five & Slide

A Vite + React + TypeScript implementation of the abstract game. The rules engine is pure and covered by Vitest; the UI supports tap-or-drag movement, multi-segment selection, and configurable local multiplayer with bots.

## Getting started

Install dependencies (from the repo root):

```bash
npm install
```

Run the dev server (binds to `0.0.0.0:5173` for the preview) and the WebSocket room relay (binds to `0.0.0.0:8787`):

```bash
# from /workspace/hello-world
npm run room-server &
npm run dev
```

Once it starts you will see a local URL such as `http://localhost:5173/`.
In this environment open the “Web 5173” preview to launch the app in your browser.

If you want clients on other devices or networks to reach the room server, expose it publicly (or on your LAN) and configure the
 front end with its address:

```bash
# examples
VITE_ROOM_SERVER_URL="ws://your.public.host:8787" npm run dev
VITE_ROOM_SERVER_HOST=192.168.1.10 VITE_ROOM_SERVER_PORT=8787 npm run dev
```

`VITE_ROOM_SERVER_URL` overrides everything; otherwise `VITE_ROOM_SERVER_HOST` and `VITE_ROOM_SERVER_PORT` override the defaults
 of `window.location.hostname` and `8787`.

Run tests:

```bash
npm test
```

## How to play in this preview
- Start at the setup menu: choose 1–8 players (human or bot), edit player names, and click **Start game**. The lineup locks until you return to setup.
- Tap/click a token you control or drag it; if multiple of your tokens are stacked on top, tapping deeper selects that token **and all above it**.
- All legal destination spaces (forward or backward) highlight automatically; tap or drop onto a highlight to move. Sliding resolves automatically. Dropping onto the Exit panel finishes an exiting move when available.
- To **place**, drag from your Start Zone (unplaced chips) to the glowing lowest empty space. Placement is forced when all your on-board tokens are pinned and an empty space exists.
- If you have no legal moves and cannot place, you may drag one of your pinned tokens upward in its stack to bubble it to the top.
- Configure 1–8 players (humans or bots). Bots auto-play with a brief delay. Solo host-only runs are supported for practice.

## Rules summary (implemented in engine)
- Board spaces 1–8 each hold a bottom→top stack (array index 0 is bottom). Exit is beyond space 8.
- On your turn take exactly one action: **move** a top stack segment one space (respecting Five & Slide), **place** a new token, or **bubble up** if you are stuck.
- Move: only your contiguous top tokens may move, distance exactly 1 forward/backward. Landing on opponents pins them. If the destination is a 5-stack, you slide in the **same direction as the attempted move**, skipping consecutive 5-stacks; sliding backward that would pass a full space 1 is illegal. Landing stacks may never exceed 5 tokens. Moving forward off space 8 exits tokens toward victory.
- Place: into the lowest empty space; if spaces 2–7 are filled and space 1 is empty you must place there; if spaces 1–7 are filled you may place in space 8. Forced to place when you have unplaced tokens, an empty space, and no legal moves.
- Bubble Up: only when you have no legal move and cannot place; choose one of your pinned tokens to move it to the top of its stack.
- Turn order rotates through all players; a player wins immediately upon exiting 5 tokens.
