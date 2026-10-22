// The app's screens and event handling.
//
// The URL hash says which screen to show:
//   (none)                       on opening: today's session, or the list
//   #/sessions                   the list of sessions
//   #/new                        the form for a new session
//   #/s/<session id>             the session's board list
//   #/s/<session id>/edit        the form for editing the session
//   #/s/<session id>/b/<number>  the bidding screen for one board
// Moving between screens replaces the URL instead of adding to browser
// history: the app's own buttons are the way around.
//
// Board numbers are unique within a session. Opening a board that hasn't
// been recorded shows a blank "draft" board, which joins the session only
// when its first call is entered. So browsing past boards adds nothing.
//
// On the bidding screen the chevrons move between boards, while the board
// picker sets the number of the board on screen. For a blank board those
// come to the same thing; a board with calls is renumbered.

import {
  BIDS,
  SEATS,
  boardAfter,
  boardBefore,
  contract,
  dealerForBoard,
  isComplete,
  isVulnerable,
  legalCalls,
  nextToAct,
  seatAfter,
  sideOf,
  vulnerabilityForBoard,
} from './auction.js';
import { fileName, toCSV, toJSON, toPBN } from './export.js';
import * as store from './store.js';

const app = document.getElementById('app');

// Columns of the auction table, as on BBO.
const TABLE_ORDER = ['W', 'N', 'E', 'S'];
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const VULNERABILITIES = ['None', 'NS', 'EW', 'All'];
// U+FE0E asks iOS to draw the suit as text rather than as a color emoji.
const SYMBOLS = { C: '♣︎', D: '♦︎', H: '♥︎', S: '♠︎', N: 'NT' };
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const CHEVRON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const MAX_BOARDS = 36; // boards offered by pickers when the board count isn't known
const ORDER_KEY = 'boardListOrder';
const DELETE_WIDTH = 88; // px a row slides left to show its Delete button

// Export formats for one session: the file type and how to write it.
const FORMATS = {
  csv: { type: 'text/csv', write: (s) => toCSV(s) },
  json: { type: 'application/json', write: (s) => toJSON([s]) },
  pbn: { type: 'text/plain', write: (s) => toPBN(s) },
};

let screen; // 'sessions', 'new', 'edit', 'boards' or 'board'
let sessions = []; // all sessions, newest first, on the list and form screens
let session; // the session on screen, kept in step with storage
let number = null; // the board number on the bidding screen
let draft = null; // a board on screen that hasn't been recorded yet
let listOrder = readListOrder(); // 'recent' or 'number'
let leadPicker = null; // { rank } while choosing the opening lead; rank is null until tapped

// The list order is a per-phone preference, so it lives in localStorage.
// Private browsing can make localStorage throw; the default is fine then.
function readListOrder() {
  try {
    return localStorage.getItem(ORDER_KEY) ?? 'recent';
  } catch {
    return 'recent';
  }
}

function writeListOrder(order) {
  listOrder = order;
  try {
    localStorage.setItem(ORDER_KEY, order);
  } catch {
    // Not remembered; it still applies until the app is closed.
  }
}

function newBoard(boardNumber, direction) {
  return {
    number: boardNumber,
    dealer: dealerForBoard(boardNumber),
    vulnerability: vulnerabilityForBoard(boardNumber),
    direction,
    auction: [],
  };
}

function findBoard(boardNumber) {
  return session.boards.find((board) => board.number === boardNumber);
}

// The board for New board: one on from the most recently recorded board.
function nextBoardNumber() {
  const last = session.boards.at(-1);
  return last ? boardAfter(last.number, session.boardCount) : 1;
}

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// '2026-10-14' → 'Wed, Oct 14, 2026' (in the phone's own style).
function formatDate(date) {
  return new Date(`${date}T12:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function save() {
  store.saveSession(session).catch((error) => showError(`Couldn't save: ${error.message}`));
}

// Saves a change to the board on screen. A draft joins the session once
// it has a call; until then there is nothing worth saving.
function commit(board) {
  if (board === draft) {
    if (board.auction.length === 0) return;
    session.boards.push(board);
    draft = null;
  }
  save();
}

function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Hands a file to the share sheet (AirDrop, Mail, Save to Files, ...).
// Browsers only allow sharing over HTTPS, so on the development server the
// file is downloaded instead. Must be called straight from a tap: browsers
// refuse to share otherwise.
async function shareFile(name, type, text) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') throw error; // AbortError: closed the sheet
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function go(hash) {
  location.replace(hash); // fires hashchange, which calls route()
}

// Shows a board, starting a draft if it hasn't been recorded. The draft
// sits the same way as the board we came from.
function openBoard(boardNumber, direction) {
  if (!findBoard(boardNumber)) draft = newBoard(boardNumber, direction);
  go(`#/s/${session.id}/b/${boardNumber}`);
}

// Called when moving off the bidding screen. A board whose calls were all
// undone is no longer recorded, so it leaves the session.
function leaveBoard() {
  const board = findBoard(number);
  if (board && board.auction.length === 0) {
    session.boards.splice(session.boards.indexOf(board), 1);
    save();
  }
  draft = null;
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const isRed = (call) => call[1] === 'H' || call[1] === 'D';

function bidLabel(bid) {
  return `${bid[0]}${SYMBOLS[bid[1]]}`;
}

function callHTML(call) {
  if (call === 'P') return '<span class="pass">Pass</span>';
  if (call === 'X') return '<span class="double">X</span>';
  if (call === 'XX') return '<span class="redouble">XX</span>';
  return `<span class="${isRed(call) ? 'red' : ''}">${bidLabel(call)}</span>`;
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const rankLabel = (rank) => (rank === 'T' ? '10' : rank);

// A card as PBN writes it, 'SK' or 'HT', shown as ♠K or ♥10.
function cardHTML(card) {
  const suit = card[0];
  const red = suit === 'H' || suit === 'D';
  return `<span class="${red ? 'red' : ''}">${SYMBOLS[suit]}${rankLabel(card[1])}</span>`;
}

// The contract, assuming the closing passes: "4♥X by North" or "Passed out".
function resultHTML(board) {
  if (board.auction.length === 0) return 'No calls';
  const final = contract(board.dealer, board.auction);
  if (!final) return 'Passed out';
  const bid = `${final.level}${final.strain}`;
  return `${callHTML(bid)}${final.doubled} by ${SEAT_NAMES[final.declarer]}`;
}

// 'Wed, Oct 14, 2026 · 5 of 18 boards · Pair 3 · with Alex'
function sessionDetailsHTML(s) {
  const recorded = s.boards.length;
  const boards = s.boardCount
    ? `${recorded} of ${s.boardCount} boards`
    : `${recorded} board${recorded === 1 ? '' : 's'}`;
  const parts = [formatDate(s.date), boards];
  if (s.pairNumber) parts.push(`Pair ${s.pairNumber}`);
  if (s.partner) parts.push(`with ${s.partner}`);
  return escapeHTML(parts.join(' · '));
}

function options(values, selected) {
  return values
    .map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`)
    .join('');
}

// Distinct non-empty values of a session field, most recent first.
function previous(field) {
  return [...new Set(sessions.map((s) => s[field]).filter(Boolean))];
}

// A list row that slides left to reveal a Delete button underneath.
function swipeRowHTML({ deleteAction, deleteData, openAction, openData, content }) {
  return `
    <li class="swipe-row">
      <button class="delete" data-action="${deleteAction}" ${deleteData} tabindex="-1">Delete</button>
      <button class="row" data-action="${openAction}" ${openData}>${content}</button>
    </li>`;
}

function renderSessionList() {
  const rows = sessions
    .map((s) => swipeRowHTML({
      deleteAction: 'delete-session',
      deleteData: `data-id="${s.id}"`,
      openAction: 'open-session',
      openData: `data-id="${s.id}"`,
      content: `
        <span class="summary">
          <span class="title">${escapeHTML(s.name)}</span>
          <span class="details">${sessionDetailsHTML(s)}</span>
        </span>`,
    }))
    .join('');

  app.className = 'list-screen';
  app.innerHTML = `
    <h1>Sessions</h1>
    <button class="primary" data-action="new-session">New session</button>
    ${rows ? `
      <ul class="list">${rows}</ul>
      <button class="secondary" data-action="backup">Back up all sessions (JSON)</button>` : '<p class="empty">No sessions yet.</p>'}`;
}

// The form for a new session, or for editing the one on screen.
function renderSessionForm() {
  const editing = screen === 'edit';
  const values = editing
    ? session
    : { name: '', date: today(), boardCount: null, pairNumber: '', partner: previous('partner')[0] ?? '' };
  const suggestions = (field) =>
    previous(field).map((value) => `<option value="${escapeHTML(value)}">`).join('');
  const boardCounts = Array.from({ length: MAX_BOARDS }, (_, i) => i + 1)
    .map((n) => `<option value="${n}"${n === values.boardCount ? ' selected' : ''}>${n}</option>`)
    .join('');

  app.className = 'list-screen';
  app.innerHTML = `
    <header class="list-bar">
      <button class="link" data-action="cancel">Cancel</button>
    </header>
    <h1>${editing ? 'Edit session' : 'New session'}</h1>
    <form class="form">
      <label>Name
        <input name="name" list="names" value="${escapeHTML(values.name)}" placeholder="e.g. Evening Club" autocomplete="off">
      </label>
      <datalist id="names">${suggestions('name')}</datalist>
      <label>Date
        <input name="date" type="date" value="${values.date}" required>
      </label>
      <div class="form-row">
        <label>Boards
          <select name="boardCount"><option value="">Not set</option>${boardCounts}</select>
        </label>
        <label>Pair number
          <input name="pairNumber" value="${escapeHTML(values.pairNumber ?? '')}" autocomplete="off">
        </label>
      </div>
      <label>Partner
        <input name="partner" list="partners" value="${escapeHTML(values.partner ?? '')}" autocomplete="off">
      </label>
      <datalist id="partners">${suggestions('partner')}</datalist>
      <button class="primary" type="submit">${editing ? 'Save' : 'Start'}</button>
    </form>`;
}

function renderBoardList() {
  const boards = listOrder === 'number'
    ? [...session.boards].sort((a, b) => a.number - b.number)
    : [...session.boards].reverse(); // most recently recorded first

  // Delete goes by position in session.boards, so it removes exactly this
  // row even if two boards somehow share a number.
  const rows = boards
    .map((board) => swipeRowHTML({
      deleteAction: 'delete-board',
      deleteData: `data-index="${session.boards.indexOf(board)}"`,
      openAction: 'open-board',
      openData: `data-number="${board.number}"`,
      content: `
        <span class="number">${board.number}</span>
        <span class="summary">
          <span class="title">${resultHTML(board)}${board.lead ? ` · ${cardHTML(board.lead)} lead` : ''}</span>
          <span class="details">Dealer ${board.dealer} · Vul ${board.vulnerability} · We sit ${board.direction}</span>
        </span>`,
    }))
    .join('');

  const orderButton = (order, label) =>
    `<button class="${listOrder === order ? 'on' : ''}" data-action="order" data-order="${order}">${label}</button>`;

  app.className = 'list-screen';
  app.innerHTML = `
    <header class="list-bar">
      <button class="link" data-action="sessions">${CHEVRON_LEFT}Sessions</button>
      <button class="link" data-action="edit-session">Edit</button>
    </header>
    <h1>${escapeHTML(session.name)}</h1>
    <p class="subtitle">${sessionDetailsHTML(session)}</p>
    <button class="primary" data-action="new-board">New board · ${nextBoardNumber()}</button>
    ${rows ? `
      <div class="toggle list-order" role="group" aria-label="Order">
        ${orderButton('recent', 'Recent')}${orderButton('number', 'Board #')}
      </div>
      <ul class="list">${rows}</ul>
      <h2>Export</h2>
      <div class="export">
        <button class="secondary" data-action="export" data-format="csv">CSV</button>
        <button class="secondary" data-action="export" data-format="json">JSON</button>
        <button class="secondary" data-action="export" data-format="pbn">PBN</button>
      </div>` : '<p class="empty">No boards yet.</p>'}`;
}

function renderBoard(board) {
  const { dealer, auction } = board;
  const legal = legalCalls(dealer, auction);
  const final = contract(dealer, auction);
  // A lead (or choosing one) means the auction is over, even if the closing
  // passes weren't entered.
  const over = isComplete(auction) || Boolean(board.lead || leadPicker);
  const toAct = over ? null : nextToAct(dealer, auction);

  const seats = TABLE_ORDER.map((seat) => {
    const classes = ['seat'];
    if (isVulnerable(seat, board.vulnerability)) classes.push('vul');
    if (seat === toAct) classes.push('to-act');
    const tags = [];
    if (sideOf(seat) === board.direction) tags.push('us');
    if (seat === dealer) tags.push('dealer');
    return `<div class="${classes.join(' ')}">${seat}<small>${tags.join(' · ')}</small></div>`;
  }).join('');

  const cells = [];
  for (let i = 0; i < TABLE_ORDER.indexOf(dealer); i++) cells.push('<div></div>');
  for (const call of auction) cells.push(`<div>${callHTML(call)}</div>`);
  if (toAct) cells.push('<div class="cursor">?</div>');

  const status = toAct
    ? `${SEAT_NAMES[toAct]} to call`
    : `<strong>${resultHTML(board)}</strong>`;

  const bidButton = (bid) =>
    `<button class="${isRed(bid) ? 'red' : ''}" data-call="${bid}"${legal.has(bid) ? '' : ' disabled'}>${bidLabel(bid)}</button>`;
  const callButton = (call, label, className) =>
    `<button class="${className}" data-call="${call}"${legal.has(call) ? '' : ' disabled'}>${label}</button>`;
  const directionButton = (direction) =>
    `<button class="${board.direction === direction ? 'on' : ''}" data-action="direction" data-direction="${direction}">${direction}</button>`;
  const hasPrevious = board.number > 1 || session.boardCount;

  // The board number picker: every board in the session, recorded ones ticked.
  // Not the board on screen, whose option is also the picker's closed label.
  const recorded = session.boards.map((b) => b.number);
  const lastBoard = Math.max(session.boardCount || MAX_BOARDS, board.number, ...recorded);
  const boardOptions = Array.from({ length: lastBoard }, (_, i) => {
    const n = i + 1;
    const tick = n !== board.number && findBoard(n) ? ' ✓' : '';
    return `<option value="${n}"${n === board.number ? ' selected' : ''}>Board ${n}${tick}</option>`;
  }).join('');

  app.className = 'board-screen';
  app.innerHTML = `
    <header class="board-bar">
      <div class="stepper">
        <button data-action="previous" aria-label="Previous board"${hasPrevious ? '' : ' disabled'}>${CHEVRON_LEFT}</button>
        <label class="board-picker">
          <select data-renumber aria-label="Board number">${boardOptions}</select>${CHEVRON_DOWN}
        </label>
        <button data-action="next" aria-label="Next board">${CHEVRON_RIGHT}</button>
      </div>
      <button class="ok" data-action="ok">OK</button>
    </header>
    <div class="settings">
      <label>Dealer <select data-field="dealer">${options(SEATS, dealer)}</select></label>
      <label>Vul <select data-field="vulnerability">${options(VULNERABILITIES, board.vulnerability)}</select></label>
      <div class="toggle" role="group" aria-label="We sit">${directionButton('NS')}${directionButton('EW')}</div>
    </div>
    <section class="auction">
      <div class="seats">${seats}</div>
      <div class="calls">${cells.join('')}</div>
    </section>
    <div class="status-row">
      <p class="status">${status}</p>
      <button class="lead" data-action="lead"${final && !leadPicker ? '' : ' disabled'}>Lead${board.lead ? ` ${cardHTML(board.lead)}` : ''}</button>
    </div>
    ${leadPicker ? leadPickerHTML(board, final) : `
    <div class="box">${BIDS.map(bidButton).join('')}</div>
    <div class="specials">
      ${callButton('P', 'Pass', 'pass')}
      ${callButton('X', 'X', 'double')}
      ${callButton('XX', 'XX', 'redouble')}
      <button class="undo" data-action="undo"${auction.length ? '' : ' disabled'}>Undo</button>
    </div>`}`;

  const calls = app.querySelector('.calls');
  calls.scrollTop = calls.scrollHeight;
}

// Takes the bidding box's place while choosing the lead: a rank, then a
// suit, which saves it ("10 of spades"). Both run low to high, as in the
// bidding box. The current lead, if any, is highlighted.
function leadPickerHTML(board, final) {
  const leader = seatAfter(final.declarer);
  const rankButton = (rank) =>
    `<button class="${rank === leadPicker.rank ? 'on' : ''}" data-action="lead-rank" data-rank="${rank}">${rankLabel(rank)}</button>`;
  const suitButton = (suit) => {
    const classes = [suit === 'H' || suit === 'D' ? 'red' : '', board.lead === `${suit}${leadPicker.rank}` ? 'on' : ''];
    return `<button class="${classes.join(' ').trim()}" data-action="lead-suit" data-suit="${suit}"${leadPicker.rank ? '' : ' disabled'}>${SYMBOLS[suit]}</button>`;
  };
  return `
    <div class="lead-picker">
      <p>${SEAT_NAMES[leader]} leads against ${resultHTML(board)}</p>
      <div class="ranks">${RANKS.map(rankButton).join('')}</div>
      <div class="suits">${['C', 'D', 'H', 'S'].map(suitButton).join('')}</div>
      <div class="lead-actions">
        ${board.lead ? '<button class="secondary" data-action="remove-lead">Remove lead</button>' : ''}
        <button class="secondary" data-action="cancel-lead">Cancel</button>
      </div>
    </div>`;
}

function render() {
  switch (screen) {
    case 'sessions': return renderSessionList();
    case 'new':
    case 'edit': return renderSessionForm();
    case 'boards': return renderBoardList();
    case 'board': return renderBoard(findBoard(number) ?? draft);
  }
}

// What each button does. Board actions get the board on screen. An action
// returns true if it changed that board, which then gets saved and redrawn.
// Navigation returns nothing and lets the hashchange redraw.
const actions = {
  // Session list
  'new-session'() {
    go('#/new');
  },
  'open-session'(button) {
    // Tapping a row that is showing Delete just closes it.
    if (closeSwipedRows()) return;
    go(`#/s/${button.dataset.id}`);
  },
  async 'delete-session'(button) {
    const doomed = sessions.find((s) => s.id === button.dataset.id);
    const boards = doomed.boards.length;
    const what = `“${doomed.name}” (${formatDate(doomed.date)})`;
    if (boards && !confirm(`Delete ${what} and its ${boards} board${boards === 1 ? '' : 's'}?`)) return;
    await store.deleteSession(doomed.id);
    sessions = sessions.filter((s) => s !== doomed);
    if (session?.id === doomed.id) session = null;
    render();
  },

  backup() {
    return shareFile(`bridge-bids-backup-${today()}.json`, 'application/json', toJSON(sessions));
  },

  // Session form
  cancel() {
    go(screen === 'edit' ? `#/s/${session.id}` : '#/sessions');
  },

  // Board list
  sessions() {
    go('#/sessions');
  },
  'edit-session'() {
    go(`#/s/${session.id}/edit`);
  },
  'new-board'() {
    openBoard(nextBoardNumber(), session.boards.at(-1)?.direction ?? 'NS');
  },
  'open-board'(button) {
    if (closeSwipedRows()) return;
    openBoard(Number(button.dataset.number));
  },
  'delete-board'(button) {
    session.boards.splice(Number(button.dataset.index), 1);
    save();
    render();
  },
  order(button) {
    writeListOrder(button.dataset.order);
    render();
  },
  export(button) {
    const { format } = button.dataset;
    const { type, write } = FORMATS[format];
    return shareFile(fileName(session, format), type, write(session));
  },

  // Bidding screen
  ok() {
    leaveBoard();
    go(`#/s/${session.id}`);
  },
  previous(button, board) {
    leaveBoard();
    openBoard(boardBefore(board.number, session.boardCount), board.direction);
  },
  next(button, board) {
    leaveBoard();
    openBoard(boardAfter(board.number, session.boardCount), board.direction);
  },
  undo(button, board) {
    board.auction.pop();
    // Undoing back past the last bid leaves no contract, so nothing to lead against.
    if (!contract(board.dealer, board.auction)) delete board.lead;
    return true;
  },
  direction(button, board) {
    board.direction = button.dataset.direction;
    return true;
  },
  lead(button, board) {
    leadPicker = { rank: board.lead?.[1] ?? null };
    render();
  },
  'lead-rank'(button) {
    leadPicker.rank = button.dataset.rank;
    render();
  },
  'lead-suit'(button, board) {
    board.lead = `${button.dataset.suit}${leadPicker.rank}`;
    leadPicker = null;
    return true;
  },
  'remove-lead'(button, board) {
    delete board.lead;
    leadPicker = null;
    return true;
  },
  'cancel-lead'() {
    leadPicker = null;
    render();
  },
};

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.form && button.type === 'submit') return; // the submit handler has it
  // A swipe can end with a click on the row; it shouldn't open anything.
  if (swipedThisGesture) {
    swipedThisGesture = false;
    return;
  }
  const board = screen === 'board' ? (findBoard(number) ?? draft) : null;

  let changed;
  if (button.dataset.call) {
    board.auction.push(button.dataset.call);
    changed = true;
  } else {
    try {
      changed = await actions[button.dataset.action]?.(button, board);
    } catch (error) {
      showError(error.message);
    }
  }
  if (changed) {
    commit(board);
    render();
  }
});

app.addEventListener('change', (event) => {
  if (screen !== 'board') return;
  const board = findBoard(number) ?? draft;
  if ('renumber' in event.target.dataset) {
    renumber(board, Number(event.target.value));
    return;
  }
  const field = event.target.dataset.field;
  if (!field) return;
  board[field] = event.target.value;
  commit(board);
  render();
});

// Sets the number of the board on screen. A blank board just becomes the
// chosen board (opening it if it's recorded). A board with calls moves to
// the new number, unless that board is already recorded.
function renumber(board, target) {
  if (board.auction.length === 0) {
    leaveBoard();
    openBoard(target, board.direction);
    return;
  }
  if (findBoard(target)) {
    showError(`Board ${target} already has an auction. To move this one there, delete board ${target} first.`);
    render(); // puts the picker back
    return;
  }
  board.number = target;
  board.dealer = dealerForBoard(target);
  board.vulnerability = vulnerabilityForBoard(target);
  save();
  go(`#/s/${session.id}/b/${target}`);
}

// The session form: Start creates a session, Save updates the one on screen.
app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const date = form.get('date') || today();
  const details = {
    name: form.get('name').trim() || formatDate(date),
    date,
    boardCount: Number(form.get('boardCount')) || null,
    pairNumber: form.get('pairNumber').trim(),
    partner: form.get('partner').trim(),
  };
  if (screen === 'edit') {
    Object.assign(session, details);
  } else {
    session = { id: store.newId(), ...details, createdAt: new Date().toISOString(), boards: [] };
  }
  try {
    await store.saveSession(session);
    go(`#/s/${session.id}`);
  } catch (error) {
    showError(`Couldn't save: ${error.message}`);
  }
});

// Swipe to delete, as in iOS lists. Pointer events cover touch and mouse.
// The rows allow only vertical panning (touch-action: pan-y in the CSS), so
// a vertical drag scrolls the list as usual and cancels the swipe, while a
// horizontal drag comes to us and slides the row.
let swipe = null; // the row being dragged, and where the drag started
let swipedThisGesture = false; // the current touch was a swipe, not a tap

// Closes any row showing its Delete button. Returns true if one was open.
function closeSwipedRows(except) {
  let closed = false;
  for (const row of app.querySelectorAll('.swipe-row.swiped')) {
    if (row === except) continue;
    row.classList.remove('swiped');
    closed = true;
  }
  return closed;
}

app.addEventListener('pointerdown', (event) => {
  const row = event.target.closest('.swipe-row');
  swipedThisGesture = false;
  if (!row || event.target.closest('.delete')) return;
  closeSwipedRows(row);
  swipe = {
    row,
    startX: event.clientX,
    wasOpen: row.classList.contains('swiped'),
    offset: 0,
    moved: false,
  };
});

app.addEventListener('pointermove', (event) => {
  if (!swipe) return;
  const dx = event.clientX - swipe.startX;
  if (!swipe.moved && Math.abs(dx) < 8) return; // a tap, so far
  swipe.moved = true;
  const start = swipe.wasOpen ? -DELETE_WIDTH : 0;
  swipe.offset = Math.min(0, Math.max(-DELETE_WIDTH * 1.5, start + dx));
  const content = swipe.row.querySelector('.row');
  content.style.transition = 'none';
  content.style.transform = `translateX(${swipe.offset}px)`;
});

function endSwipe(event) {
  if (!swipe) return;
  const { row, moved, offset } = swipe;
  const content = row.querySelector('.row');
  content.style.transition = '';
  content.style.transform = '';
  // Settle open if dragged more than halfway; a cancelled drag (the list
  // scrolled instead) settles back where it was.
  if (moved && event.type === 'pointerup') {
    row.classList.toggle('swiped', offset < -DELETE_WIDTH / 2);
    swipedThisGesture = true;
  }
  swipe = null;
}

app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);

// Keep the screen on while bidding, so the phone doesn't lock mid-auction.
// The lock is held only on the bidding screen; the board list lets the
// phone sleep between hands. The browser drops the lock whenever the app
// is hidden, so it's asked for again on return, and on any tap in case a
// request without one was refused.
let wakeLock = null;

async function keepAwake() {
  const wanted = screen === 'board' && document.visibilityState === 'visible';
  if (!wanted) {
    if (wakeLock === 'pending') return; // settled once the request returns
    wakeLock?.release();
    wakeLock = null;
  } else if (!wakeLock && 'wakeLock' in navigator) {
    wakeLock = 'pending';
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
      wakeLock = lock;
      keepAwake(); // releases it if the board was left while waiting
    } catch {
      wakeLock = null;
    }
  }
}

document.addEventListener('visibilitychange', keepAwake);
app.addEventListener('pointerdown', keepAwake);

async function route() {
  // '#/s/abc/b/17' → ['s', 'abc', 'b', '17']
  const [kind, id, part, boardNumber] = location.hash.slice(2).split('/');
  leadPicker = null;

  if (kind === 's') {
    if (session?.id !== id) {
      session = await store.getSession(id);
      draft = null;
    }
    if (!session) return go('#/sessions');

    if (part === 'edit') {
      screen = 'edit';
      sessions = await store.listSessions();
    } else if (part === 'b') {
      screen = 'board';
      number = Number(boardNumber);
      // Arriving without openBoard(), e.g. by reloading on a new board.
      if (!findBoard(number) && draft?.number !== number) {
        draft = newBoard(number, session.boards.at(-1)?.direction ?? 'NS');
      }
    } else {
      screen = 'boards';
    }
  } else if (kind === 'sessions' || kind === 'new') {
    screen = kind;
    sessions = await store.listSessions();
  } else {
    // Opening the app: go straight to today's session if there is one.
    const todays = (await store.listSessions()).find((s) => s.date === today());
    return go(todays ? `#/s/${todays.id}` : '#/sessions');
  }
  render();
  keepAwake();
}

window.addEventListener('hashchange', () => {
  route().catch((error) => showError(error.message));
});
store.requestPersistence();
// Offline support (sw.js). Browsers only allow it over HTTPS, so it runs on
// the hosted app; it's skipped on localhost, where a cached copy would hide
// each change until a second reload.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch((error) => showError(`Offline mode unavailable: ${error.message}`));
}
// The scratch session from development is no longer used.
store.deleteSession('scratch').catch(() => {});
route().catch((error) => showError(`Couldn't start: ${error.message}`));
