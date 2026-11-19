# Bridge Bid Recorder

An iPhone web app that makes it quick to write down the auction and
opening lead on every board at a duplicate bridge game: one tap per call.
It's faster and less distracting than pen and paper, and afterwards the
session is easy to review with the club's hand records or to share with
your partner.

**Use it:** <https://dave-finlay.github.io/bridge-bid-recorder/>

<img src="icons/icon-180.png" alt="" width="60" align="right">

## Features

- **One tap per call.** A 7×5 bidding box plus Pass, X and XX. Calls that
  aren't legal at that point are grayed out, including doubles of
  partner and redoubles without a double.
- **Undo** steps back one call at a time.
- **Closing passes are assumed.** Enter the auction up to the last bid
  (or double) and the three passes that end it are filled in. A passed-out
  board needs just one Pass.
- **Opening lead**, optional: tap **Lead**, then a rank and a suit. The
  app works out who led (declarer's left-hand opponent).
- **Result and score**, optional: tap **Result** and pick from every
  possible outcome, entered as on a Bridgemate: the level made (3, 4 …
  for 3NT) or the undertricks (−1 …). The duplicate score is shown signed
  from our side: +420 if we made it, −50 if we went down.
- **Flag for review.** Long-press a call in the auction to flag it
  (again to clear it), or tap the flag by NS / EW to flag the whole
  board. Flagged boards show a flag in the board list.
- **Keeps the screen on** while you're entering an auction, so the phone
  doesn't lock mid-auction. The board list lets it sleep again.
- **Dealer and vulnerability** follow the board number on the standard
  16-board cycle, for any number of boards, and can be overridden.
- **Sessions** have a name, date, board count, pair number and partner.
  With a board count set, the next board after the last one is board 1,
  for games that start partway through the set.
- **Opens on today's session**, so at the table it's: wake the phone,
  tap New board.
- **Export** a session as CSV, JSON or PBN through the iOS share sheet
  (AirDrop, Mail, Save to Files), or back up every session as JSON.
- **Share with a partner.** Send them the session's JSON export by
  AirDrop; they save it to Files, then tap **Import a session** on the
  sessions list. Sending the same session again replaces their copy.
  Imported sessions are as recorded, so "us" and the scores are from
  the sender's side. Import also restores a backup.
- **Works offline** once installed, and keeps everything on the phone.
  There is no server and no account.

## Install on iPhone

1. Open <https://dave-finlay.github.io/bridge-bid-recorder/> in **Safari**.
2. Tap **Share**, then **Add to Home Screen**. The app appears as **Bids**.
3. Always open it from the Home Screen icon. The installed app keeps its
   own storage, separate from Safari's.

Exports are the backup: deleting the app from the Home Screen, or
clearing Safari's website data, deletes the sessions stored in it.

## Using it

1. **New session** at the start of the game. The partner defaults to the
   last one, and names you've used before are suggested.
2. For each board, **New board**. It offers the next board number and the
   direction you sat on the last board. Tap the board number to pick
   another, or **NS / EW** to change direction.
3. Tap the calls in order, starting with the dealer's. When the opening
   lead is known, tap **Lead** to record it; after play, tap **Result**.
   Each replaces the bidding box until you pick or cancel. **OK** goes
   back to the list; everything is saved as you tap.

Every screen has an **ⓘ** button with help on what it's for and what
each action does, including the ones you can't see.

In the board list, tap a board to edit it and swipe left to delete it.
**Recent / Board #** orders the list; each session opens on Recent.
On the bidding screen, ‹ › move between boards, while the board number
picker changes the number of the board on screen (for a board recorded
under the wrong number).

## Export formats

Only boards with at least one call are exported, in board number order,
with the closing passes filled in.

**CSV**: one row per board, for a spreadsheet. Flagged calls are
starred in the auction, and `flagged` is `yes` for a flagged board.

```
session,date,pair,partner,board,dealer,vulnerability,we_sat,contract,declarer,auction,lead,tricks,our_score,flagged
Evening Club,2026-10-14,3,Alex,13,N,All,NS,4H,N,1H X 4H* Pass Pass Pass,ST,9,-100,yes
```

**JSON**: sessions exactly as stored, plus each board's contract and
declarer, so it doubles as a backup. Calls use the app's own codes:
`P`, `X`, `XX`, and `1C` to `7N`. A lead is a card such as `ST` (the
ten of spades), `tricks` are declarer's, and `ourScore` is added when
the result is entered. Flags are `flagged: true` on the board and
`flaggedCalls`, the positions of flagged calls in the auction (from 0).

**PBN**: [Portable Bridge Notation](https://www.tistis.nl/pbn/), with
each board's identifying tags, its `[Auction]`, the `[Result]` (tricks
taken by declarer) and the lead as the first trick of a `[Play]`
section, if entered. A flagged call gets a note (`4H =1=` with
`[Note "1:Flagged for review"]`), and a flagged board the comment
`{Flagged for review}`. Clubs typically
publish a PBN hand record with the deals and results but no auctions;
this one can be read alongside it, board by board.

```
[Event "Evening Club"]
[Date "2026.10.14"]
[Board "13"]
[Dealer "N"]
[Vulnerable "All"]
[Declarer "N"]
[Contract "4H"]
[Result "9"]
[Auction "N"]
1H X 4H Pass
Pass Pass
[Play "E"]
ST - - -
*
```

## Development

Plain HTML, CSS and JavaScript modules: no framework, no build step and
no dependencies. Node.js is used only to run the tests and a local
server.

```sh
npm test        # unit tests for the bridge rules and the export formats
npm start       # serves the app on this computer and the local network
npm run icons   # redraws the app icons (macOS, uses Swift)
```

`npm start` prints an address to open on a phone on the same Wi-Fi. Over
plain HTTP, offline mode and the share sheet are unavailable, so exports
download instead.

| Path | What's in it |
|---|---|
| `index.html`, `styles.css` | The page and its styles |
| `js/auction.js` | Bridge rules: dealer, vulnerability, legal calls, end of auction, contract |
| `js/score.js` | Duplicate scoring |
| `js/export.js` | CSV, JSON and PBN formatting, and reading JSON back in |
| `js/help.js` | The text of each screen's help panel |
| `js/store.js` | Storage on the phone (IndexedDB) |
| `js/app.js` | Screens and event handling |
| `sw.js`, `manifest.webmanifest` | Offline support and Home Screen install |
| `test/` | Unit tests for `auction.js`, `score.js` and `export.js` |
| `scripts/` | The dev server and the icon generator |
| `PLAN.md` | The design and the steps it was built in |

**Publishing:** GitHub Pages serves the `main` branch, so pushing `main`
publishes. Pages rebuilds in about a minute, and an installed app picks
up the new version the second time it's opened. When adding a file the
app loads, list it in `sw.js` and bump the cache version there.

## License

[MIT](LICENSE)
