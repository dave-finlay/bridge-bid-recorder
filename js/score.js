// Duplicate bridge scoring. No UI code, so it can be unit-tested with Node.
//
// A result is the tricks declarer took (0 to 13), as PBN's [Result] tag
// has it. It's shown as a Bridgemate takes it: the level made ('4' for
// ten tricks) when it made, or the undertricks ('-1') when it went down.

import { contract, isVulnerable, sideOf } from './auction.js';

const TRICK_VALUE = { C: 20, D: 20, H: 30, S: 30, N: 30 };

// The tricks a contract needs: 7 for a 1-level contract, 13 for a grand.
export function tricksNeeded(level) {
  return level + 6;
}

// 9 tricks in 3NT → '3', 10 → '4', 7 → '-2'.
export function resultLabel(level, tricks) {
  const over = tricks - tricksNeeded(level);
  return over >= 0 ? `${tricks - 6}` : `${over}`;
}

// Declarer's score: positive if it made, negative if it went down.
// contract is { level, strain, doubled } with doubled '', 'X' or 'XX'.
export function score({ level, strain, doubled }, vulnerable, tricks) {
  const multiplier = { '': 1, X: 2, XX: 4 }[doubled];
  const over = tricks - tricksNeeded(level);

  if (over < 0) {
    const down = -over;
    if (!doubled) return -down * (vulnerable ? 100 : 50);
    // Doubled: 100, then 200 each for the 2nd and 3rd, then 300 each
    // not vulnerable; 200, then 300 each vulnerable. Redoubled is twice that.
    let penalty = 0;
    for (let n = 1; n <= down; n++) {
      if (vulnerable) penalty += n === 1 ? 200 : 300;
      else penalty += n === 1 ? 100 : n <= 3 ? 200 : 300;
    }
    return -penalty * (multiplier / 2);
  }

  const contractPoints = (level * TRICK_VALUE[strain] + (strain === 'N' ? 10 : 0)) * multiplier;
  let total = contractPoints;
  total += contractPoints >= 100 ? (vulnerable ? 500 : 300) : 50; // game or part-score
  if (level === 6) total += vulnerable ? 750 : 500;
  if (level === 7) total += vulnerable ? 1500 : 1000;
  if (doubled) total += doubled === 'X' ? 50 : 100; // for making it doubled
  total += over * (doubled ? (vulnerable ? 100 : 50) * multiplier : TRICK_VALUE[strain]);
  return total;
}

// A board's score from our side (board.direction), or null when it has no
// contract or no result recorded.
export function ourScore(board) {
  const final = contract(board.dealer, board.auction);
  if (!final || board.tricks == null) return null;
  const points = score(final, isVulnerable(final.declarer, board.vulnerability), board.tricks);
  return sideOf(final.declarer) === board.direction ? points : -points;
}
