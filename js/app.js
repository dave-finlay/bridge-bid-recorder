// The app's screens and event handling. For now the app works on a single
// scratch session; the list of sessions comes in step 4 of the plan.
//
// The URL hash says which screen to show:
//   #/s/<session id>             the session's board list
//   #/s/<session id>/b/<number>  the bidding screen for one board
// Moving between screens replaces the URL instead of adding to browser
// history: the app's own buttons are the way around.
//
// Board numbers are unique within a session. Opening a board that hasn't
// been recorded shows a blank "draft" board, which joins the session only
// when its first call is entered. So browsing past boards adds nothing.

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
  sideOf,
  vulnerabilityForBoard,
} from './auction.js';
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
const PICKER_BOARDS = 36; // boards offered by the picker when the board count isn't known
const SCRATCH_ID = 'scratch';
const ORDER_KEY = 'boardListOrder';
const DELETE_WIDTH = 88; // px a row slides left to show its Delete button

let session; // the session on screen, kept in step with storage
let number = null; // the board number on the bidding screen, or null on the list
let draft = null; // a board on screen that hasn't been recorded yet
let listOrder = readListOrder(); // 'recent' or 'number'

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

function newScratchSession() {
  return {
    id: SCRATCH_ID,
    name: 'Scratch',
    date: today(),
    boardCount: null,
    createdAt: new Date().toISOString(),
    boards: [],
  };
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

// The contract, assuming the closing passes: "4♥X by North" or "Passed out".
function resultHTML(board) {
  if (board.auction.length === 0) return 'No calls';
  const final = contract(board.dealer, board.auction);
  if (!final) return 'Passed out';
  const bid = `${final.level}${final.strain}`;
  return `${callHTML(bid)}${final.doubled} by ${SEAT_NAMES[final.declarer]}`;
}

function options(values, selected) {
  return values
    .map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`)
    .join('');
}

function renderBoardList() {
  const boards = listOrder === 'number'
    ? [...session.boards].sort((a, b) => a.number - b.number)
    : [...session.boards].reverse(); // most recently recorded first

  // Each row has a Delete button underneath, shown by swiping the row left.
  // Delete goes by position in session.boards, so it removes exactly this
  // row even if two boards somehow share a number.
  const rows = boards
    .map((board) => `
      <li class="swipe-row">
        <button class="delete" data-action="delete" data-index="${session.boards.indexOf(board)}" tabindex="-1">Delete</button>
        <button class="row" data-action="open" data-number="${board.number}">
          <span class="number">${board.number}</span>
          <span class="summary">
            <span class="result">${resultHTML(board)}</span>
            <span class="details">Dealer ${board.dealer} · Vul ${board.vulnerability} · We sit ${board.direction}</span>
          </span>
        </button>
      </li>`)
    .join('');

  const orderButton = (order, label) =>
    `<button class="${listOrder === order ? 'on' : ''}" data-action="order" data-order="${order}">${label}</button>`;

  app.className = 'list-screen';
  app.innerHTML = `
    <h1>${escapeHTML(session.name)}</h1>
    <button class="primary" data-action="new">New board · ${nextBoardNumber()}</button>
    ${rows ? `
      <div class="toggle list-order" role="group" aria-label="Order">
        ${orderButton('recent', 'Recent')}${orderButton('number', 'Board #')}
      </div>
      <ul class="boards">${rows}</ul>` : '<p class="empty">No boards yet.</p>'}`;
}

function renderBoard(board) {
  const { dealer, auction } = board;
  const legal = legalCalls(dealer, auction);
  const toAct = isComplete(auction) ? null : nextToAct(dealer, auction);

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

  // The board picker: every board in the session, with recorded ones ticked.
  // Not the board on screen, whose option is also the picker's closed label.
  const lastBoard = session.boardCount
    || Math.max(PICKER_BOARDS, board.number, ...session.boards.map((b) => b.number));
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
          <select data-navigate="board" aria-label="Board">${boardOptions}</select>${CHEVRON_DOWN}
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
    <p class="status">${status}</p>
    <div class="box">${BIDS.map(bidButton).join('')}</div>
    <div class="specials">
      ${callButton('P', 'Pass', 'pass')}
      ${callButton('X', 'X', 'double')}
      ${callButton('XX', 'XX', 'redouble')}
      <button class="undo" data-action="undo"${auction.length ? '' : ' disabled'}>Undo</button>
    </div>`;

  const calls = app.querySelector('.calls');
  calls.scrollTop = calls.scrollHeight;
}

function render() {
  if (number === null) renderBoardList();
  else renderBoard(findBoard(number) ?? draft);
}

// What each button does. Board actions get the board on screen. An action
// returns true if it changed that board, which then gets saved and redrawn.
// Navigation returns nothing and lets the hashchange redraw.
const actions = {
  // Board list
  new() {
    openBoard(nextBoardNumber(), session.boards.at(-1)?.direction ?? 'NS');
  },
  open(button) {
    // Tapping a row that is showing Delete just closes it.
    if (closeSwipedRows()) return;
    openBoard(Number(button.dataset.number));
  },
  delete(button) {
    session.boards.splice(Number(button.dataset.index), 1);
    save();
    render();
  },
  order(button) {
    writeListOrder(button.dataset.order);
    render();
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
    return true;
  },
  direction(button, board) {
    board.direction = button.dataset.direction;
    return true;
  },
};

app.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  // A swipe can end with a click on the row; it shouldn't open the board.
  if (swipedThisGesture) {
    swipedThisGesture = false;
    return;
  }
  const board = number === null ? null : (findBoard(number) ?? draft);

  let changed;
  if (button.dataset.call) {
    board.auction.push(button.dataset.call);
    changed = true;
  } else {
    changed = actions[button.dataset.action]?.(button, board);
  }
  if (changed) {
    commit(board);
    render();
  }
});

app.addEventListener('change', (event) => {
  const board = findBoard(number) ?? draft;
  if (event.target.dataset.navigate === 'board') {
    leaveBoard();
    openBoard(Number(event.target.value), board.direction);
    return;
  }
  const field = event.target.dataset.field;
  if (!field) return;
  board[field] = event.target.value;
  commit(board);
  render();
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

async function route() {
  // '#/s/scratch/b/17' → ['s', 'scratch', 'b', '17']
  const [, id, , boardNumber] = location.hash.slice(2).split('/');
  if (id !== SCRATCH_ID) return go(`#/s/${SCRATCH_ID}`);

  if (session?.id !== id) session = (await store.getSession(id)) ?? newScratchSession();

  if (boardNumber === undefined) {
    number = null;
  } else {
    number = Number(boardNumber);
    // Arriving without openBoard(), e.g. by reloading on a new board.
    if (!findBoard(number) && draft?.number !== number) {
      draft = newBoard(number, session.boards.at(-1)?.direction ?? 'NS');
    }
  }
  render();
}

window.addEventListener('hashchange', () => {
  route().catch((error) => showError(error.message));
});
store.requestPersistence();
route().catch((error) => showError(`Couldn't start: ${error.message}`));
