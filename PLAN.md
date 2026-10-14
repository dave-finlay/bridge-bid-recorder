# Bridge Bid Recorder: plan

An iPhone web app (PWA) for recording the auction on each board at the
bridge table, so the boards can be reviewed later. It works offline and
exports to CSV, JSON or PBN.

We build it one step at a time. Each step ends with a review: read
the code, try it, and course-correct before moving on.

## Tech choices

- **Plain HTML, CSS and JavaScript (ES modules).** No framework and no
  build step. The app is small, and plain files are easy to read and
  host anywhere.
- **IndexedDB** to store sessions on the phone. It is more durable on iOS
  than `localStorage`.
- **Node.js** only for development: unit tests with the built-in
  `node --test`, plus a small local server for trying the app on the
  iPhone over Wi-Fi. No npm packages.
- **Service worker and manifest** so the app can be added to the home
  screen and runs offline.

## Layout

```
index.html             the single page
styles.css
manifest.webmanifest   PWA metadata (name, icons, colors)
sw.js                  service worker (offline cache)
js/auction.js          bridge rules, no UI code
js/export.js           CSV, JSON and PBN formatting, no UI code
js/store.js            IndexedDB storage
js/app.js              screens and event handling
test/                  unit tests for auction.js and export.js
icons/                 app icons
scripts/serve.mjs      local dev server
scripts/make-icons.swift  generates the icon PNGs
```

## Data model

```js
session = {
  id, name,            // e.g. "Evening Club"
  date,                // "2026-10-14"
  boardCount,          // e.g. 18, 21 or 24, or null if not known
  pairNumber,          // e.g. "3", as text in case a section letter is included
  partner,             // e.g. "Alex", defaults from the previous session
  createdAt,
  boards: [board, ...] // in the order played
}

board = {
  number,              // 1, 2, ...; unique within the session
  dealer,              // "N" | "E" | "S" | "W", defaults from number
  vulnerability,       // "None" | "NS" | "EW" | "All", defaults from number
  direction,           // "NS" | "EW": the side we sit, defaults from the previous board
  auction              // calls as entered, starting with dealer: ["1C", "P", "1H", "X", ...]
}
```

The auction is a list of *calls*. In bridge's Laws a call is any bid,
pass, double or redouble, while a *bid* means only a level and strain
such as 1♣ or 3NT. The code keeps that distinction, e.g. `isBid('P')` is
false. Calls are stored as `P` (pass), `X`, `XX`, or level plus strain
(`1C`, `3N` for 3NT). Display uses suit symbols, and exports use `Pass`
and `NT`.

## Rules and behavior (to confirm)

1. **Dealer and vulnerability** come from the board number using the
   standard 16-board cycle, and can be overridden. The cycle repeats from
   board 17, so there is no upper limit: games of 18, 21 and 24 boards
   are common.
2. **Legal calls:** any bid higher than the last bid. X only over an
   opponent's bid that has not already been doubled. XX only over an
   opponent's X. Pass is always legal. Everything else is grayed out.
3. **Implied passes:** we store what was entered and fill in the passes
   when displaying or exporting. After a bid, three passes end the
   auction. With no bid, it takes four passes. So entering a single Pass
   records a passed-out board.
4. **A board joins the session when its first call is entered.** Opening
   a board that hasn't been recorded shows a blank one, so browsing past
   boards or a mistaken New board leaves nothing behind. A board whose
   calls are all undone leaves the session when you move off it. Any
   empty board that remains (say the app was closed mid-board) is left
   out of exports.
5. **Undo** removes the last call entered, and can be repeated.
6. **Chevrons (‹ ›) move between boards** on the bidding screen, showing
   the next board's auction if recorded, or a blank board if not. **The
   board number picker sets this board's number:** on a blank board that
   amounts to jumping to the chosen board; a board with calls is
   renumbered (dealer and vulnerability follow the new number), unless
   the chosen board is already recorded. Changing the dealer, either way,
   keeps the calls and can't make any of them illegal: sides alternate
   around the table, so whether two calls were made by opponents depends
   only on their positions in the auction.
7. **The next board** defaults to the previous board's number plus one,
   wrapping to 1 after the last board when the session's board count is
   set (we often start partway through, e.g. at board 13 of 18). It also
   defaults to the previous board's direction (NS or EW). Direction belongs to each board,
   because some sessions mix NS and EW boards.
8. **The auction table** shows columns W N E S, as BBO does. Vulnerable
   seats are shown in red, our seats are marked "us", and the dealer is
   marked.
9. **Not in version 1:** alerts, notes, the result or score, and player
   names. These are easy to add later.

## Steps

### 1. Auction rules (`js/auction.js` + tests): done
Dealer and vulnerability by board, legal calls, auction complete,
implied passes, contract and declarer, and trimming the illegal calls
left after a dealer change.
**Review:** read the module and tests, and run `npm test`.

### 2. Storage (`js/store.js`): done
IndexedDB wrapper: list, get, save and delete sessions. Ask the browser
for persistent storage.
**Review:** a short read. It is hard to unit-test outside a browser, so
it gets exercised in step 3.

### 3. Board list and bidding screen (the core): done
The session's board list is home base: the boards played so far (a
toggle shows them most recent first or by board number; tap one to edit
it; swipe one left to reveal Delete) and a New board button. New board opens
the bidding screen: board number (tap it for a picker that sets this
board's number, with recorded boards ticked) and ‹ › to move one board, dealer and vulnerability, an
NS/EW toggle, the auction table, a 7×5 bidding box with illegal bids
grayed out, Pass, X, XX and Undo. Every tap saves, so OK just returns to
the list. Works on a single scratch session for now. Dev server so you
can open it on the iPhone.
**Review:** try it on the phone. This is the main ergonomics checkpoint.

### 4. Sessions and navigation: done
The common case: get to the club, set up the session, then for each
board turn on the phone and tap New board.
- **Opening the app** goes straight to today's session if there is one,
  otherwise to the session list.
- **Session list:** newest first, with New session; swipe left to delete.
- **Session form** (new, or Edit from the board list): name (suggesting
  previous names), date (today), board count, pair number, and partner
  (defaults to the last partner, suggesting previous ones). The first
  board and direction are set on the bidding screen, not in the form.
- **Board list** gets a link back to Sessions and an Edit button.
- The scratch session from development is dropped.
**Review:** run through a full mock session.

### 5. Export: done
From the board list: CSV (one row per board, for spreadsheets), JSON (the
session as stored, plus each board's contract), and PBN (each board's
tags and `[Auction]`, in the club's conventions: contracts like `4HX`,
dates like `2026.10.14`, CRLF line endings), to merge with the club's
hand records. Only boards with calls are exported, in board order, with
the closing passes filled in. Files go to the iOS share sheet (AirDrop,
Mail, Files); without HTTPS (the dev server) they download instead. The
session list has "Back up all sessions" (JSON). Formatting lives in
`js/export.js`, with unit tests.
**Review:** export a mock session and open the files.

### 6. PWA: works offline, installable
Manifest, icons and service worker. Add to Home Screen, then test in
airplane mode.
**Review:** install it on the phone.

### 7. Hosting
The service worker and share sheet need HTTPS, so the installed app has
to be hosted. GitHub Pages is free and the simplest option. This means
publishing the repo, so we confirm before doing it.
**Review:** install from the hosted URL on both phones.

### 8. Trial at the table, then iterate
Use it for a real session, note what is clunky, and fix it. Then decide
whether the PWA is good enough or SwiftUI is worth it.

## Working agreements

- At the end of each step, after your review, I commit that step if you
  want me to.
