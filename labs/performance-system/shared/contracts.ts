export type Status = 'ACTIVE' | 'INACTIVE';
export type IndicatorStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type ConfigStatus = 'DRAFT' | 'READY' | 'ISSUED' | 'LOCKED';
export type CaseStatus =
  'PREPARING' | 'READY' | 'SELF_REVIEW' | 'REVIEWING' | 'CALCULATING' | 'COMPLETED' | 'LOCKED' | 'VOID';

export interface PageQuery {
  periodId?: string;
  organizationId?: string;
  keyword?: string;
  status?: string;
  employeeId?: string;
}

export interface SystemSnapshot {
  generatedAt: string;
  currentUser: { id: string; name: string; role: string };
  summary: {
    activeEmployees: number;
    publishedIndicators: number;
    issuedConfigs: number;
    openTasks: number;
    completedCases: number;
    blockers: number;
  };
  organizations: Array<Record<string, unknown>>;
  employees: Array<Record<string, unknown>>;
  periods: Array<Record<string, unknown>>;
  indicators: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  configs: Array<Record<string, unknown>>;
  actualData: Array<Record<string, unknown>>;
  cases: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: { requestId: string };
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string };
}
