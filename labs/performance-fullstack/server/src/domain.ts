export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function roundHalfUp(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function systemItemScore(rawScore: number, weight: number) {
  return roundHalfUp(Math.max(0, Math.min(rawScore, weight)));
}

export function weightedReviewerScore(
  scores: Array<{ score: number; reviewerWeight: number }>,
  indicatorWeight: number,
) {
  const totalWeight = scores.reduce((sum, item) => sum + item.reviewerWeight, 0);
  if (totalWeight !== 100) {
    throw new DomainError('REVIEWER_WEIGHT_INVALID', '评价人权重之和必须等于 100');
  }
  for (const item of scores) {
    if (item.score < 0 || item.score > indicatorWeight) {
      throw new DomainError('REVIEW_SCORE_OUT_OF_RANGE', '评价分数必须在 0 到指标权重之间');
    }
  }
  return roundHalfUp(scores.reduce((sum, item) => sum + item.score * (item.reviewerWeight / 100), 0));
}

export function ensureConfigWeight(weights: number[]) {
  const total = roundHalfUp(weights.reduce((sum, value) => sum + value, 0));
  if (total !== 100) {
    throw new DomainError('CONFIG_WEIGHT_INVALID', '个人配置权重之和必须等于 100');
  }
  return total;
}

export function gradeFor(score: number) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}
