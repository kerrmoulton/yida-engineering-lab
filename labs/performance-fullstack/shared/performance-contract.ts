export const PERFORMANCE_STAGES = [
  'CONFIGURATION',
  'DATA_ENTRY',
  'SELF_REVIEW',
  'REVIEW',
  'CALCULATION',
  'LOCKED',
] as const;

export type PerformanceStage = (typeof PERFORMANCE_STAGES)[number];
export type IndicatorMode = 'SYSTEM' | 'MANUAL';
export type MasterDataStatus = 'ACTIVE' | 'INACTIVE';

export interface OrganizationView {
  id: string;
  code: string;
  name: string;
  manager: string;
  status: MasterDataStatus;
}

export interface EmployeeView {
  id: string;
  employeeNo: string;
  name: string;
  position: string;
  organizationId: string;
  organizationName: string;
  status: MasterDataStatus;
}

export interface IndicatorDefinitionView {
  id: string;
  code: string;
  name: string;
  category: string;
  mode: IndicatorMode;
  unit: string;
  defaultWeight: number;
  defaultTarget: number;
  status: MasterDataStatus;
}

export interface IndicatorView {
  id: string;
  definitionId: string;
  code: string;
  name: string;
  mode: IndicatorMode;
  weight: number;
  target: number;
  actual: number | null;
  rawScore: number | null;
  selfScore: number | null;
  finalScore: number | null;
}

export interface ReviewerView {
  id: string;
  name: string;
  weight: number;
  completed: boolean;
}

export interface ReviewerScoreView {
  reviewerId: string;
  indicatorId: string;
  score: number;
}

export interface ConfigurationInput {
  employeeId: string;
  indicators: Array<Pick<IndicatorView, 'definitionId' | 'weight' | 'target'>>;
  reviewers: Array<Pick<ReviewerView, 'id' | 'name' | 'weight'>>;
}

export type OrganizationInput = Omit<OrganizationView, 'id'> & { id?: string };
export type EmployeeInput = Omit<EmployeeView, 'id' | 'organizationName'> & { id?: string };
export type IndicatorDefinitionInput = Omit<IndicatorDefinitionView, 'id'> & { id?: string };

export interface ActualsInput {
  values: Record<string, number>;
}

export interface SelfReviewInput {
  scores: Record<string, number>;
}

export interface ReviewsInput {
  scores: ReviewerScoreView[];
}

export interface AuditView {
  id: number;
  action: string;
  detail: string;
  createdAt: string;
}

export interface PerformanceWorkspace {
  scenarioId: string;
  period: string;
  employee: { id: string; name: string; organization: string };
  stage: PerformanceStage;
  assessmentStatus: string;
  configStatus: string;
  configWeight: number;
  submittedActuals: number;
  totalActuals: number;
  finalScore: number | null;
  grade: string | null;
  organizations: OrganizationView[];
  employees: EmployeeView[];
  indicatorDefinitions: IndicatorDefinitionView[];
  nextAction: { key: string | null; title: string; description: string };
  indicators: IndicatorView[];
  reviewers: ReviewerView[];
  reviewerScores: ReviewerScoreView[];
  audits: AuditView[];
}

export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
  meta: ApiMeta;
}

export function isWorkspace(value: unknown): value is PerformanceWorkspace {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.scenarioId === 'string' &&
    typeof row.period === 'string' &&
    typeof row.stage === 'string' &&
    PERFORMANCE_STAGES.includes(row.stage as PerformanceStage) &&
    Array.isArray(row.organizations) &&
    Array.isArray(row.employees) &&
    Array.isArray(row.indicatorDefinitions) &&
    Array.isArray(row.indicators) &&
    Array.isArray(row.reviewers) &&
    Array.isArray(row.audits)
  );
}
