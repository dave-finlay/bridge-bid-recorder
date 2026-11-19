// Turns sessions into files to share: CSV for spreadsheets, JSON as a
// complete copy (also the backup format), and PBN to merge with the club's
// hand records. No UI code, so it can be unit-tested with Node.
//
// Only recorded boards (at least one call) are exported, in board order,
// with the closing passes filled in.

import { SEATS, completeAuction, contract, legalCalls, seatAfter } from './auction.js';
import { ourScore } from './score.js';

const CRLF = '\r\n'; // CSV and the club's PBN files both use Windows line endings

// 'P' → 'Pass', '3N' → '3NT'; X, XX and suit bids are unchanged.
export function exportCall(call) {
  if (call === 'P') return 'Pass';
  return call.replace(/N$/, 'NT');
}

function recordedBoards(session) {
  return session.boards
    .filter((board) => board.auction.length > 0)
    .sort((a, b) => a.number - b.number);
}

// The contract as PBN writes it: '4HX', '3NT', or 'Pass' when passed out.
// The declarer is a seat letter, or '' when passed out.
export function contractFields(board) {
  const final = contract(board.dealer, board.auction);
  if (!final) return { contract: 'Pass', declarer: '' };
  return {
    contract: `${exportCall(`${final.level}${final.strain}`)}${final.doubled}`,
    declarer: final.declarer,
  };
}

// '2026-10-14', 'Evening Club', 'csv' → '2026-10-14-evening-club.csv'
export function fileName(session, extension) {
  const slug = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${session.date}${slug ? `-${slug}` : ''}.${extension}`;
}

function csvField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// One row per board. The auction is the calls from the dealer on,
// separated by spaces: '1H Pass 2H Pass Pass Pass'. The lead is a card
// as PBN writes it ('SK', 'HT'). Tricks are declarer's, and our score is
// signed from our side. Each is blank if not entered. Calls flagged for
// review are starred ('2D*'), and flagged is 'yes' for a flagged board.
export function toCSV(session) {
  const header = [
    'session', 'date', 'pair', 'partner', 'board', 'dealer', 'vulnerability',
    'we_sat', 'contract', 'declarer', 'auction', 'lead', 'tricks', 'our_score', 'flagged',
  ];
  const rows = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    const auction = completeAuction(board.auction)
      .map((call, i) => `${exportCall(call)}${board.flaggedCalls?.includes(i) ? '*' : ''}`);
    return [
      session.name, session.date, session.pairNumber, session.partner,
      board.number, board.dealer, board.vulnerability, board.direction,
      text, declarer, auction.join(' '), board.lead,
      board.tricks, ourScore(board), board.flagged ? 'yes' : '',
    ];
  });
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join(CRLF) + CRLF;
}

// The sessions as stored, so the file can serve as a backup, with each
// board's contract, declarer and (if the result is entered) our score
// added for convenience. Calls keep the
// app's own codes: 'P', 'X', 'XX', '1C' ... '7N'. The auction is as
// entered; the closing passes are implied.
export function toJSON(sessions) {
  const data = {
    format: 'bridge-bid-recorder',
    version: 1,
    sessions: sessions.map((session) => ({
      ...session,
      boards: recordedBoards(session).map((board) => {
        const points = ourScore(board);
        return { ...board, ...contractFields(board), ...(points !== null && { ourScore: points }) };
      }),
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

// Reads a JSON export (one session or a full backup) back into sessions
// to store, for sharing with a partner or restoring a backup. Everything
// is checked, auctions included, and only stored fields are kept (the
// contract, declarer and score added on export are dropped). Throws an
// Error with a message fit to show if the file isn't a valid export.
export function fromJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Bridge Bid Recorder export (JSON).');
  }
  if (data?.format !== 'bridge-bid-recorder' || !Array.isArray(data.sessions)) {
    throw new Error('That file isn’t a Bridge Bid Recorder export (JSON).');
  }
  if (data.version !== 1) {
    throw new Error('That file was made by a newer version of the app. Reopen the app to update it, then try again.');
  }
  return data.sessions.map(readSession);
}

function readSession(s) {
  const check = (ok, what) => {
    if (!ok) throw new Error(`Couldn’t import “${s?.name ?? 'a session'}”: ${what}.`);
  };
  check(typeof s?.id === 'string' && s.id, 'it has no id');
  check(typeof s.name === 'string', 'it has no name');
  check(/^\d{4}-\d{2}-\d{2}$/.test(s.date), 'its date is missing');
  check(s.boardCount == null || Number.isInteger(s.boardCount), 'its board count is wrong');
  check(Array.isArray(s.boards), 'it has no boards');
  return {
    id: s.id,
    name: s.name,
    date: s.date,
    boardCount: s.boardCount ?? null,
    pairNumber: String(s.pairNumber ?? ''),
    partner: String(s.partner ?? ''),
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
    boards: s.boards.map((b) => readBoard(b, (ok, what) => check(ok, `board ${b?.number}: ${what}`))),
  };
}

function readBoard(b, check) {
  check(Number.isInteger(b?.number) && b.number > 0, 'bad board number');
  check(SEATS.includes(b.dealer), 'bad dealer');
  check(['None', 'NS', 'EW', 'All'].includes(b.vulnerability), 'bad vulnerability');
  check(b.direction === 'NS' || b.direction === 'EW', 'bad direction');
  check(Array.isArray(b.auction), 'no auction');
  b.auction.forEach((call, i) => check(legalCalls(b.dealer, b.auction.slice(0, i)).has(call), `illegal call ${call}`));
  const board = {
    number: b.number,
    dealer: b.dealer,
    vulnerability: b.vulnerability,
    direction: b.direction,
    auction: [...b.auction],
  };
  if (b.lead != null) {
    check(/^[CDHS][2-9TJQKA]$/.test(b.lead), 'bad lead');
    board.lead = b.lead;
  }
  if (b.tricks != null) {
    check(Number.isInteger(b.tricks) && b.tricks >= 0 && b.tricks <= 13, 'bad result');
    board.tricks = b.tricks;
  }
  if (b.flagged) board.flagged = true;
  if (b.flaggedCalls?.length) {
    check(b.flaggedCalls.every((i) => Number.isInteger(i) && i >= 0 && i < b.auction.length), 'bad flags');
    board.flaggedCalls = [...b.flaggedCalls];
  }
  return board;
}

function pbnTag(name, value) {
  return `[${name} "${String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

// PBN (Portable Bridge Notation) in import format: the tags that identify
// each board, then its auction, four calls to a line, starting with the
// dealer. Calls flagged for review get a note ('2D =1=' with
// [Note "1:Flagged for review"]), and a flagged board a {comment}. An
// opening lead is the first trick of a play section, with the other three
// cards unknown ('-') and '*' marking where the record stops. Boards are
// separated by a blank line.
export function toPBN(session) {
  const games = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    const flagged = board.flaggedCalls ?? [];
    const calls = completeAuction(board.auction)
      .map((call, i) => `${exportCall(call)}${flagged.includes(i) ? ` =${flagged.indexOf(i) + 1}=` : ''}`);
    const notes = flagged.map((_, n) => pbnTag('Note', `${n + 1}:Flagged for review`));
    const lines = [];
    for (let i = 0; i < calls.length; i += 4) lines.push(calls.slice(i, i + 4).join(' '));
    return [
      pbnTag('Event', session.name),
      pbnTag('Date', session.date.replaceAll('-', '.')),
      pbnTag('Board', board.number),
      pbnTag('Dealer', board.dealer),
      pbnTag('Vulnerable', board.vulnerability),
      pbnTag('Declarer', declarer),
      pbnTag('Contract', text),
      ...(board.tricks != null && declarer ? [pbnTag('Result', board.tricks)] : []),
      pbnTag('Auction', board.dealer),
      ...lines,
      ...notes,
      ...(board.lead ? [pbnTag('Play', seatAfter(declarer)), `${board.lead} - - -`, '*'] : []),
      ...(board.flagged ? ['{Flagged for review}'] : []),
    ].join(CRLF);
  });
  return ['% PBN 2.1', '% EXPORT', '', games.join(CRLF + CRLF), ''].join(CRLF);
}
