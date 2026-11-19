// The help panel for each screen, opened by its ⓘ button: what the screen
// is for and what each action does, including the ones you can't see
// (swipe to delete, long-press to flag). Keep it in step with the README.

export const HELP = {
  sessions: `
    <h2>Sessions</h2>
    <p>Every game you've recorded, newest first. The app opens straight
      to today's session when there is one.</p>
    <h3>Actions</h3>
    <ul>
      <li><b>New session</b> starts recording a game.</li>
      <li><b>Tap a session</b> to see its boards.</li>
      <li><b>Swipe a session left</b> to delete it.</li>
      <li><b>Back up all sessions</b> saves every session to one JSON file,
        through the share sheet (AirDrop, Save to Files). Do this now and
        then: removing the app from the Home Screen deletes its data.</li>
      <li><b>Import a session</b> opens a JSON export: a session your
        partner sent you, or a backup. To receive one, accept the AirDrop,
        save it to Files, then tap Import and pick it. Importing the same
        session again replaces your copy.</li>
    </ul>`,

  form: `
    <h2>Session details</h2>
    <p>Only the date is needed; the rest helps later.</p>
    <ul>
      <li><b>Name</b>, e.g. the club. Left blank, it's the date.</li>
      <li><b>Boards</b>: how many the session has. With it set, New board
        goes from the last board back to 1, for games that start partway
        through the set.</li>
      <li><b>Pair number</b> finds your row in the club's results.</li>
      <li><b>Partner</b> starts as your last partner.</li>
    </ul>
    <p>You can change these later with <b>Edit</b> on the board list.</p>`,

  boards: `
    <h2>Boards</h2>
    <p>The boards recorded in this session, with the contract, result,
      lead and score if entered. A flag marks a board flagged for review.</p>
    <h3>Actions</h3>
    <ul>
      <li><b>New board</b> opens the board after the last one you recorded,
        with you sitting the same way.</li>
      <li><b>Tap a board</b> to see or change it.</li>
      <li><b>Swipe a board left</b> to delete it.</li>
      <li><b>Recent / Board #</b> sorts the list by when recorded or by
        board number.</li>
      <li><b>Edit</b> changes the session's name, date, boards, pair number
        or partner.</li>
    </ul>
    <h3>Export</h3>
    <p>Each goes to the share sheet (AirDrop, Mail, Save to Files):</p>
    <ul>
      <li><b>CSV</b>: a row per board, for a spreadsheet.</li>
      <li><b>JSON</b>: everything, to share with your partner (they import
        it) or to keep as a backup.</li>
      <li><b>PBN</b>: to read alongside the club's hand records.</li>
    </ul>`,

  board: `
    <h2>Recording a board</h2>
    <p>Everything is saved as you tap, and the screen stays on here.</p>
    <h3>Bidding</h3>
    <ul>
      <li><b>Tap the calls in order</b>, starting with the dealer's.
        Calls that aren't legal are grayed out.</li>
      <li><b>Stop after the last bid</b> (or double): the three closing
        passes are assumed. A passed-out board needs one Pass.</li>
      <li><b>Undo</b> removes the last call.</li>
      <li><b>Long-press a call</b> in the auction to flag it for review.
        Long-press again to clear the flag.</li>
    </ul>
    <h3>After the auction</h3>
    <ul>
      <li><b>Lead</b>: tap the rank, then the suit.</li>
      <li><b>Result</b>: as on the Bridgemate, the level made (3, 4 … for
        3NT) or the undertricks (−1 …). The score is shown from your side.</li>
    </ul>
    <h3>The board</h3>
    <ul>
      <li><b>‹ ›</b> move to the previous or next board.</li>
      <li><b>Tap the board number</b> to pick another. On a blank board
        that opens the board you pick; on a board with calls it
        <i>renumbers</i> it, for an auction recorded under the wrong
        number.</li>
      <li><b>Dealer</b> and <b>Vul</b> follow the board number; change them
        only if the board says otherwise.</li>
      <li><b>NS / EW</b>: which way you sat on this board.</li>
      <li><b>The flag</b> beside NS / EW flags the whole board for review.</li>
      <li><b>OK</b> goes back to the board list.</li>
    </ul>`,
};
