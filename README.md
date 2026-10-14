# Bridge Bid Recorder

An iPhone web app for recording the auction on every board at a duplicate
bridge game, quickly enough to do at the table, so the bidding can be
reviewed afterwards.

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
- **Dealer and vulnerability** follow the board number on the standard
  16-board cycle, for any number of boards, and can be overridden.
- **Sessions** have a name, date, board count, pair number and partner.
  With a board count set, the next board after the last one is board 1,
  for games that start partway through the set.
- **Opens on today's session**, so at the table it's: wake the phone,
  tap New board.
- **Export** a session as CSV, JSON or PBN through the iOS share sheet
  (AirDrop, Mail, Save to Files), or back up every session as JSON.
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
3. Tap the calls in order, starting with the dealer's. **OK** goes back to
   the list; everything is saved as you tap.

In the board list, tap a board to edit it and swipe left to delete it.
On the bidding screen, ‹ › move between boards, while the board number
picker changes the number of the board on screen (for a board recorded
under the wrong number).

## Export formats

Only boards with at least one call are exported, in board number order,
with the closing passes filled in.

**CSV**: one row per board, for a spreadsheet.

```
session,date,pair,partner,board,dealer,vulnerability,we_sat,contract,declarer,auction
Evening Club,2026-10-14,3,Alex,13,N,All,NS,4H,N,1H X 4H Pass Pass Pass
```

**JSON**: sessions exactly as stored, plus each board's contract and
declarer, so it doubles as a backup. Calls use the app's own codes:
`P`, `X`, `XX`, and `1C` to `7N`.

**PBN**: [Portable Bridge Notation](https://www.tistis.nl/pbn/), with
each board's identifying tags and its `[Auction]`. Clubs typically
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
[Auction "N"]
1H X 4H Pass
Pass Pass
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
| `js/export.js` | CSV, JSON and PBN formatting |
| `js/store.js` | Storage on the phone (IndexedDB) |
| `js/app.js` | Screens and event handling |
| `sw.js`, `manifest.webmanifest` | Offline support and Home Screen install |
| `test/` | Unit tests for `auction.js` and `export.js` |
| `scripts/` | The dev server and the icon generator |
| `PLAN.md` | The design and the steps it was built in |

**Publishing:** GitHub Pages serves the `main` branch, so pushing `main`
publishes. Pages rebuilds in about a minute, and an installed app picks
up the new version the second time it's opened. When adding a file the
app loads, list it in `sw.js` and bump the cache version there.

## License

[MIT](LICENSE)
