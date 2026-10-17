// Turns sessions into files to share: CSV for spreadsheets, JSON as a
// complete copy (also the backup format), and PBN to merge with the club's
// hand records. No UI code, so it can be unit-tested with Node.
//
// Only recorded boards (at least one call) are exported, in board order,
// with the closing passes filled in.

import { alertsFor } from './alerts.js';
import { completeAuction, contract, seatOfCall, sideOf } from './auction.js';

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

// The board's alerted and announced calls, by our agreements, with the
// side that made each: 'us' (the direction we sat) or 'them'.
export function boardAlerts(board) {
  return [...alertsFor(board.dealer, board.auction)].map(([index, { kind, text }]) => ({
    index,
    call: board.auction[index],
    kind,
    text,
    side: sideOf(seatOfCall(board.dealer, index)) === board.direction ? 'us' : 'them',
  }));
}

// 'Announce: Transfer', with '(opponents)' added for their calls.
function alertNote({ kind, text, side }) {
  const label = kind === 'alert' ? 'Alert' : 'Announce';
  return `${label}: ${text}${side === 'them' ? ' (opponents)' : ''}`;
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
// separated by spaces: '1H Pass 2H Pass Pass Pass'. Alerts lists the
// marked calls: '2D Announce: Transfer; ...'.
export function toCSV(session) {
  const header = [
    'session', 'date', 'pair', 'partner', 'board', 'dealer', 'vulnerability',
    'we_sat', 'contract', 'declarer', 'auction', 'alerts',
  ];
  const rows = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    return [
      session.name, session.date, session.pairNumber, session.partner,
      board.number, board.dealer, board.vulnerability, board.direction,
      text, declarer, completeAuction(board.auction).map(exportCall).join(' '),
      boardAlerts(board).map((a) => `${exportCall(a.call)} ${alertNote(a)}`).join('; '),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join(CRLF) + CRLF;
}

// The sessions as stored, so the file can serve as a backup, with each
// board's contract, declarer and alerts added for convenience. Calls keep the
// app's own codes: 'P', 'X', 'XX', '1C' ... '7N'. The auction is as
// entered; the closing passes are implied.
export function toJSON(sessions) {
  const data = {
    format: 'bridge-bid-recorder',
    version: 1,
    sessions: sessions.map((session) => ({
      ...session,
      boards: recordedBoards(session).map((board) => ({
        ...board,
        ...contractFields(board),
        alerts: boardAlerts(board),
      })),
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function pbnTag(name, value) {
  return `[${name} "${String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

// PBN (Portable Bridge Notation) in import format: the tags that identify
// each board, then its auction, four calls to a line, starting with the
// dealer. An alerted or announced call is followed by a note reference,
// '2D =1=', explained by a [Note "1:Announce: Transfer"] tag after the
// auction. Boards are separated by a blank line.
export function toPBN(session) {
  const games = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    const alerts = boardAlerts(board);
    const calls = completeAuction(board.auction).map((call, i) => {
      const note = alerts.findIndex((a) => a.index === i);
      return note < 0 ? exportCall(call) : `${exportCall(call)} =${note + 1}=`;
    });
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
      pbnTag('Auction', board.dealer),
      ...lines,
      ...alerts.map((a, n) => pbnTag('Note', `${n + 1}:${alertNote(a)}`)),
    ].join(CRLF);
  });
  return ['% PBN 2.1', '% EXPORT', '', games.join(CRLF + CRLF), ''].join(CRLF);
}
