import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError, ensureConfigWeight, systemItemScore, weightedReviewerScore } from '../src/domain.ts';

test('system score clamps raw score to the indicator weight', () => {
  assert.equal(systemItemScore(44.8, 40), 40);
  assert.equal(systemItemScore(-2, 40), 0);
});

test('reviewer scores use exact reviewer weights', () => {
  assert.equal(
    weightedReviewerScore(
      [
        { score: 32, reviewerWeight: 50 },
        { score: 31, reviewerWeight: 30 },
        { score: 33, reviewerWeight: 20 },
      ],
      35,
    ),
    31.9,
  );
});

test('invalid weights and out-of-range scores fail deterministically', () => {
  assert.throws(() => ensureConfigWeight([40, 35, 20]), DomainError);
  assert.throws(() => weightedReviewerScore([{ score: 36, reviewerWeight: 100 }], 35), /评价分数必须/);
});
