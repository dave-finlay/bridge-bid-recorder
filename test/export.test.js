import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardAlerts, contractFields, exportCall, fileName, toCSV, toJSON, toPBN } from '../js/export.js';

const board = (number, dealer, vulnerability, direction, auction) =>
  ({ number, dealer, vulnerability, direction, auction: auction ? auction.split(' ') : [] });

const session = {
  id: 'abc',
  name: 'Evening Club',
  date: '2026-10-14',
  boardCount: 18,
  pairNumber: '3',
  partner: 'Alex',
  createdAt: '2026-10-14T19:00:00.000Z',
  // In the order played; board 2 has no calls, so it isn't exported.
  boards: [
    board(14, 'E', 'None', 'NS', '1N P 3N'),
    board(13, 'N', 'All', 'NS', '1H X 4H'),
    board(2, 'E', 'NS', 'EW', ''),
    board(15, 'S', 'NS', 'EW', 'P'),
  ],
};

test('exportCall spells out pass and notrump', () => {
  assert.deepEqual(['P', 'X', 'XX', '1C', '3N', '7N'].map(exportCall),
    ['Pass', 'X', 'XX', '1C', '3NT', '7NT']);
});

test('contractFields', () => {
  assert.deepEqual(contractFields(board(1, 'N', 'None', 'NS', '1H X 4H X')),
    { contract: '4HX', declarer: 'N' });
  assert.deepEqual(contractFields(board(1, 'N', 'None', 'NS', '1N P 3N')),
    { contract: '3NT', declarer: 'N' });
  assert.deepEqual(contractFields(board(1, 'N', 'None', 'NS', 'P')),
    { contract: 'Pass', declarer: '' });
});

test('fileName uses the date and a tidy version of the name', () => {
  assert.equal(fileName(session, 'csv'), '2026-10-14-evening-club.csv');
  assert.equal(fileName({ ...session, name: 'Wed, Oct 14!' }, 'pbn'), '2026-10-14-wed-oct-14.pbn');
  assert.equal(fileName({ ...session, name: '♠♠' }, 'json'), '2026-10-14.json');
});

test('CSV: one row per recorded board, in board order, passes filled in', () => {
  assert.equal(toCSV(session), [
    'session,date,pair,partner,board,dealer,vulnerability,we_sat,contract,declarer,auction,alerts',
    'Evening Club,2026-10-14,3,Alex,13,N,All,NS,4H,N,1H X 4H Pass Pass Pass,',
    'Evening Club,2026-10-14,3,Alex,14,E,None,NS,3NT,E,1NT Pass 3NT Pass Pass Pass,1NT Announce: 15 to 17 (opponents)',
    'Evening Club,2026-10-14,3,Alex,15,S,NS,EW,Pass,,Pass Pass Pass Pass,',
    '',
  ].join('\r\n'));
});

test('CSV quotes fields with commas or quotes', () => {
  const tricky = { ...session, name: 'Club "A", evening', boards: [board(1, 'N', 'None', 'NS', 'P')] };
  assert.match(toCSV(tricky), /^"Club ""A"", evening",/m);
});

test('JSON keeps the stored data, adds contracts, and drops unrecorded boards', () => {
  const data = JSON.parse(toJSON([session]));
  assert.equal(data.format, 'bridge-bid-recorder');
  assert.equal(data.version, 1);
  assert.equal(data.sessions[0].partner, 'Alex');
  assert.deepEqual(data.sessions[0].boards.map((b) => b.number), [13, 14, 15]);
  assert.deepEqual(data.sessions[0].boards[0], {
    number: 13, dealer: 'N', vulnerability: 'All', direction: 'NS',
    auction: ['1H', 'X', '4H'], contract: '4H', declarer: 'N', alerts: [],
  });
  assert.deepEqual(data.sessions[0].boards[1].alerts,
    [{ index: 0, call: '1N', kind: 'announce', text: '15 to 17', side: 'them' }]);
});

test('PBN: tags and auction for each board, four calls to a line', () => {
  assert.equal(toPBN(session), [
    '% PBN 2.1',
    '% EXPORT',
    '',
    '[Event "Evening Club"]',
    '[Date "2026.10.14"]',
    '[Board "13"]',
    '[Dealer "N"]',
    '[Vulnerable "All"]',
    '[Declarer "N"]',
    '[Contract "4H"]',
    '[Auction "N"]',
    '1H X 4H Pass',
    'Pass Pass',
    '',
    '[Event "Evening Club"]',
    '[Date "2026.10.14"]',
    '[Board "14"]',
    '[Dealer "E"]',
    '[Vulnerable "None"]',
    '[Declarer "E"]',
    '[Contract "3NT"]',
    '[Auction "E"]',
    '1NT =1= Pass 3NT Pass',
    'Pass Pass',
    '[Note "1:Announce: 15 to 17 (opponents)"]',
    '',
    '[Event "Evening Club"]',
    '[Date "2026.10.14"]',
    '[Board "15"]',
    '[Dealer "S"]',
    '[Vulnerable "NS"]',
    '[Declarer ""]',
    '[Contract "Pass"]',
    '[Auction "S"]',
    'Pass Pass Pass Pass',
    '',
  ].join('\r\n'));
});

test('PBN escapes quotes in tag values', () => {
  const quoted = { ...session, name: 'The "Club"', boards: [board(1, 'N', 'None', 'NS', 'P')] };
  assert.match(toPBN(quoted), /\[Event "The \\"Club\\""\]/);
});

test('boardAlerts marks our calls and theirs', () => {
  // We sit NS: North opens 1NT and South transfers; East's double isn't marked.
  const ours = board(5, 'N', 'NS', 'NS', '1N X 2D P 2H');
  assert.deepEqual(boardAlerts(ours).map((a) => `${a.call} ${a.kind} ${a.side}`),
    ['1N announce us', '2D announce us']);
  // The same auction, sitting EW: both calls are theirs.
  assert.deepEqual(boardAlerts({ ...ours, direction: 'EW' }).map((a) => a.side), ['them', 'them']);
});
