import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ourScore, resultLabel, score, tricksNeeded } from '../js/score.js';

const c = (text) => {
  const [, level, strain, doubled] = text.match(/^(\d)([CDHSN])(X{0,2})$/);
  return { level: Number(level), strain, doubled };
};

test('tricksNeeded and resultLabel', () => {
  assert.equal(tricksNeeded(1), 7);
  assert.equal(tricksNeeded(7), 13);
  assert.equal(resultLabel(3, 9), '=');
  assert.equal(resultLabel(3, 10), '+1');
  assert.equal(resultLabel(4, 7), '-3');
  assert.equal(resultLabel(1, 13), '+6');
  assert.equal(resultLabel(7, 0), '-13');
});

test('part-scores and games', () => {
  assert.equal(score(c('1N'), false, 9), 150);
  assert.equal(score(c('2S'), false, 8), 110);
  assert.equal(score(c('3C'), true, 9), 110);
  assert.equal(score(c('3N'), true, 9), 600);
  assert.equal(score(c('4H'), false, 10), 420);
  assert.equal(score(c('5D'), true, 12), 620);
});

test('slams', () => {
  assert.equal(score(c('6S'), true, 12), 1430);
  assert.equal(score(c('6N'), false, 13), 1020);
  assert.equal(score(c('7N'), false, 13), 1520);
  assert.equal(score(c('7C'), true, 13), 2140);
});

test('doubled and redoubled contracts that make', () => {
  assert.equal(score(c('2HX'), false, 8), 470);
  assert.equal(score(c('4HX'), false, 10), 590);
  assert.equal(score(c('1NX'), true, 8), 380);
  assert.equal(score(c('1NXX'), true, 7), 760);
  assert.equal(score(c('1CXX'), false, 9), 630);
});

test('undertricks', () => {
  assert.equal(score(c('4S'), false, 9), -50);
  assert.equal(score(c('4S'), true, 8), -200);
  assert.equal(score(c('3NX'), false, 6), -500);
  assert.equal(score(c('4SX'), false, 6), -800);
  assert.equal(score(c('2HX'), true, 6), -500);
  assert.equal(score(c('3DX'), true, 5), -1100);
  assert.equal(score(c('1NXX'), false, 6), -200);
  assert.equal(score(c('2SXX'), true, 6), -1000);
});

test('ourScore is signed from our side, using the declarer\'s vulnerability', () => {
  // South deals board 3 (EW vulnerable): 1H P 4H, South declares.
  const board = { dealer: 'S', vulnerability: 'EW', direction: 'NS', auction: ['1H', 'P', '4H'] };
  assert.equal(ourScore(board), null);
  assert.equal(ourScore({ ...board, tricks: 10 }), 420);
  assert.equal(ourScore({ ...board, tricks: 9 }), -50);
  assert.equal(ourScore({ ...board, direction: 'EW', tricks: 9 }), 50);
  assert.equal(ourScore({ ...board, auction: ['P'], tricks: 7 }), null);
});
