// Turns sessions into files to share: CSV for spreadsheets, JSON as a
// complete copy (also the backup format), and PBN to merge with the club's
// hand records. No UI code, so it can be unit-tested with Node.
//
// Only recorded boards (at least one call) are exported, in board order,
// with the closing passes filled in.

import { completeAuction, contract, seatAfter } from './auction.js';

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
// as PBN writes it ('SK', 'HT'), or blank.
export function toCSV(session) {
  const header = [
    'session', 'date', 'pair', 'partner', 'board', 'dealer', 'vulnerability',
    'we_sat', 'contract', 'declarer', 'auction', 'lead',
  ];
  const rows = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    return [
      session.name, session.date, session.pairNumber, session.partner,
      board.number, board.dealer, board.vulnerability, board.direction,
      text, declarer, completeAuction(board.auction).map(exportCall).join(' '), board.lead,
    ];
  });
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join(CRLF) + CRLF;
}

// The sessions as stored, so the file can serve as a backup, with each
// board's contract and declarer added for convenience. Calls keep the
// app's own codes: 'P', 'X', 'XX', '1C' ... '7N'. The auction is as
// entered; the closing passes are implied.
export function toJSON(sessions) {
  const data = {
    format: 'bridge-bid-recorder',
    version: 1,
    sessions: sessions.map((session) => ({
      ...session,
      boards: recordedBoards(session).map((board) => ({ ...board, ...contractFields(board) })),
    })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function pbnTag(name, value) {
  return `[${name} "${String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

// PBN (Portable Bridge Notation) in import format: the tags that identify
// each board, then its auction, four calls to a line, starting with the
// dealer. An opening lead is the first trick of a play section, with the
// other three cards unknown ('-') and '*' marking where the record stops.
// Boards are separated by a blank line.
export function toPBN(session) {
  const games = recordedBoards(session).map((board) => {
    const { contract: text, declarer } = contractFields(board);
    const calls = completeAuction(board.auction).map(exportCall);
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
      ...(board.lead ? [pbnTag('Play', seatAfter(declarer)), `${board.lead} - - -`, '*'] : []),
    ].join(CRLF);
  });
  return ['% PBN 2.1', '% EXPORT', '', games.join(CRLF + CRLF), ''].join(CRLF);
}
