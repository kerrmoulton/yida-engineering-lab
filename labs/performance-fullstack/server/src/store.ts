import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  ActualsInput,
  AuditView,
  ConfigurationInput,
  EmployeeInput,
  EmployeeView,
  IndicatorDefinitionInput,
  IndicatorDefinitionView,
  IndicatorView,
  OrganizationInput,
  OrganizationView,
  PerformanceStage,
  PerformanceWorkspace,
  ReviewsInput,
  ReviewerView,
  SelfReviewInput,
} from '../../shared/performance-contract.ts';
import {
  DomainError,
  ensureConfigWeight,
  gradeFor,
  roundHalfUp,
  systemItemScore,
  weightedReviewerScore,
} from './domain.ts';

const SCENARIO_ID = 'SYN-PERF-2026-Q3';
const NOW = '2026-08-30T08:00:00.000Z';

const SEED_INDICATORS = [
  ['SYN-DEF-REVENUE', 'IND-001', '周期目标达成率', '经营结果', 'SYSTEM', '%', 40, 100],
  ['SYN-DEF-QUALITY', 'IND-002', '交付质量', '交付质量', 'MANUAL', '分', 35, 95],
  ['SYN-DEF-COLLAB', 'IND-003', '协作与改进', '组织能力', 'MANUAL', '分', 25, 90],
] as const;

const SEED_REVIEWERS = [
  ['SYN-REV-LEAD', '合成直属评价人', 50],
  ['SYN-REV-PARTNER', '合成协作评价人', 30],
  ['SYN-REV-MATRIX', '合成矩阵评价人', 20],
] as const;

interface ScenarioRow {
  stage: PerformanceStage;
  assessment_status: string;
  config_status: string;
  final_score: number | null;
  grade: string | null;
}

interface IndicatorRow {
  id: string;
  definition_id: string | null;
  code: string;
  name: string;
  mode: 'SYSTEM' | 'MANUAL';
  weight: number;
  target: number;
  actual: number | null;
  raw_score: number | null;
  self_score: number | null;
  final_score: number | null;
}

interface ReviewerRow {
  id: string;
  name: string;
  weight: number;
  completed: number;
}

interface AuditRow {
  id: number;
  action: string;
  detail: string;
  created_at: string;
}

interface ReviewerScoreRow {
  reviewer_id: string;
  indicator_id: string;
  score: number;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new DomainError('INVALID_INPUT', `${label}不能为空`);
  return value.trim();
}

function requireNumber(value: unknown, label: string, minimum = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)
    throw new DomainError('INVALID_INPUT', `${label}必须是大于等于 ${minimum} 的数字`);
  return value;
}

function nextAction(stage: PerformanceStage) {
  const actions: Record<PerformanceStage, PerformanceWorkspace['nextAction']> = {
    CONFIGURATION: {
      key: 'submit-configuration',
      title: '提交个人配置',
      description: '校验三项指标权重合计 100，并固化配置版本。',
    },
    DATA_ENTRY: {
      key: 'submit-actuals',
      title: '填写并提交实际数据',
      description: '填写每项实际完成值，系统指标由后端计算原始分。',
    },
    SELF_REVIEW: {
      key: 'submit-self-review',
      title: '提交员工自评',
      description: '为每个指标写入参考自评分，不直接计入最终分。',
    },
    REVIEW: {
      key: 'submit-reviewers',
      title: '填写并提交多方评价',
      description: '每位评价人逐项评分，后端按评价人权重计算人工指标得分。',
    },
    CALCULATION: {
      key: 'calculate-and-settle',
      title: '核算并结算',
      description: '计算单项分、总分和等级，随后锁定全部执行快照。',
    },
    LOCKED: { key: null, title: '周期已锁定', description: '结果只读，配置变更不会追溯影响本周期。' },
  };
  return actions[stage];
}

export class PerformanceStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = ':memory:') {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
    this.seedMasterData();
    this.backfillDefinitionIds();
    if (!this.database.prepare('SELECT 1 FROM scenarios WHERE id = ?').get(SCENARIO_ID)) this.reset();
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY, period TEXT NOT NULL, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL,
        organization TEXT NOT NULL, stage TEXT NOT NULL, assessment_status TEXT NOT NULL,
        config_status TEXT NOT NULL, final_score REAL, grade TEXT
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        manager TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY, employee_no TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        position TEXT NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id), status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS indicator_definitions (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL,
        mode TEXT NOT NULL, unit TEXT NOT NULL, default_weight REAL NOT NULL,
        default_target REAL NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS indicators (
        id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        code TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL, weight REAL NOT NULL, target REAL NOT NULL,
        actual REAL, raw_score REAL, self_score REAL, final_score REAL
      );
      CREATE TABLE IF NOT EXISTS reviewers (
        id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        name TEXT NOT NULL, weight REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS reviewer_scores (
        reviewer_id TEXT NOT NULL REFERENCES reviewers(id) ON DELETE CASCADE,
        indicator_id TEXT NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
        score REAL NOT NULL, PRIMARY KEY (reviewer_id, indicator_id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    const indicatorColumns = this.database.prepare('PRAGMA table_info(indicators)').all() as Array<{
      name: string;
    }>;
    if (!indicatorColumns.some((column) => column.name === 'definition_id'))
      this.database.exec('ALTER TABLE indicators ADD COLUMN definition_id TEXT');
  }

  private seedMasterData() {
    if (!this.database.prepare('SELECT 1 FROM organizations LIMIT 1').get()) {
      this.database
        .prepare('INSERT INTO organizations VALUES (?, ?, ?, ?, ?)')
        .run('SYN-ORG-RD', 'ORG-RD', '合成产品研发中心', '合成负责人', 'ACTIVE');
      this.database
        .prepare('INSERT INTO organizations VALUES (?, ?, ?, ?, ?)')
        .run('SYN-ORG-MKT', 'ORG-MKT', '合成市场运营中心', '合成运营负责人', 'ACTIVE');
    }
    if (!this.database.prepare('SELECT 1 FROM employees LIMIT 1').get()) {
      const insert = this.database.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?)');
      insert.run('SYN-EMP-001', 'E0001', '合成员工一号', '前端工程师', 'SYN-ORG-RD', 'ACTIVE');
      insert.run('SYN-EMP-002', 'E0002', '合成员工二号', '产品经理', 'SYN-ORG-RD', 'ACTIVE');
      insert.run('SYN-EMP-003', 'E0003', '合成员工三号', '运营专员', 'SYN-ORG-MKT', 'ACTIVE');
    }
    if (!this.database.prepare('SELECT 1 FROM indicator_definitions LIMIT 1').get()) {
      const insert = this.database.prepare(
        'INSERT INTO indicator_definitions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const item of SEED_INDICATORS) insert.run(...item, 'ACTIVE');
    }
  }

  private backfillDefinitionIds() {
    this.database.exec(`
      UPDATE indicators
      SET definition_id = (
        SELECT id FROM indicator_definitions d WHERE d.code = indicators.code
      )
      WHERE definition_id IS NULL
    `);
  }

  reset() {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM scenarios WHERE id = ?').run(SCENARIO_ID);
      const employee = this.database
        .prepare(
          `SELECT e.id, e.name, o.name AS organization
           FROM employees e JOIN organizations o ON o.id = e.organization_id
           WHERE e.status = 'ACTIVE' ORDER BY e.employee_no LIMIT 1`,
        )
        .get() as { id: string; name: string; organization: string } | undefined;
      if (!employee) throw new DomainError('MASTER_DATA_EMPTY', '请先维护至少一名在职人员');
      this.database
        .prepare(`INSERT INTO scenarios VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .run(
          SCENARIO_ID,
          '2026-Q3',
          employee.id,
          employee.name,
          employee.organization,
          'CONFIGURATION',
          'PREPARING',
          'DRAFT',
        );
      const insertIndicator = this.database.prepare(
        `INSERT INTO indicators
        (id, scenario_id, definition_id, code, name, mode, weight, target)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const definitions = this.database
        .prepare(
          `SELECT id, code, name, mode, default_weight, default_target
           FROM indicator_definitions WHERE status = 'ACTIVE' ORDER BY code LIMIT 3`,
        )
        .all() as Array<{
        id: string;
        code: string;
        name: string;
        mode: 'SYSTEM' | 'MANUAL';
        default_weight: number;
        default_target: number;
      }>;
      if (!definitions.length) throw new DomainError('MASTER_DATA_EMPTY', '请先维护至少一个启用指标');
      for (const indicator of definitions)
        insertIndicator.run(
          `SYN-PLAN-${indicator.id}`,
          SCENARIO_ID,
          indicator.id,
          indicator.code,
          indicator.name,
          indicator.mode,
          indicator.default_weight,
          indicator.default_target,
        );
      const insertReviewer = this.database.prepare(
        'INSERT INTO reviewers (id, scenario_id, name, weight) VALUES (?, ?, ?, ?)',
      );
      for (const reviewer of SEED_REVIEWERS)
        insertReviewer.run(reviewer[0], SCENARIO_ID, reviewer[1], reviewer[2]);
      this.audit('SCENARIO_RESET', '已恢复确定性合成场景，未写入任何宜搭业务数据。');
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.workspace();
  }

  private audit(action: string, detail: string) {
    this.database
      .prepare('INSERT INTO audit_events (scenario_id, action, detail, created_at) VALUES (?, ?, ?, ?)')
      .run(SCENARIO_ID, action, detail, NOW);
  }

  private scenario() {
    const row = this.database.prepare('SELECT * FROM scenarios WHERE id = ?').get(SCENARIO_ID) as
      | (ScenarioRow & { period: string; employee_id: string; employee_name: string; organization: string })
      | undefined;
    if (!row) throw new DomainError('SCENARIO_NOT_FOUND', '合成场景不存在');
    return row;
  }

  organizations(): OrganizationView[] {
    return (
      this.database
        .prepare('SELECT id, code, name, manager, status FROM organizations ORDER BY code')
        .all() as Array<{
        id: string;
        code: string;
        name: string;
        manager: string;
        status: 'ACTIVE' | 'INACTIVE';
      }>
    ).map((row) => row);
  }

  employees(): EmployeeView[] {
    return (
      this.database
        .prepare(
          `SELECT e.id, e.employee_no, e.name, e.position, e.organization_id,
                  o.name AS organization_name, e.status
           FROM employees e JOIN organizations o ON o.id = e.organization_id
           ORDER BY e.employee_no`,
        )
        .all() as Array<{
        id: string;
        employee_no: string;
        name: string;
        position: string;
        organization_id: string;
        organization_name: string;
        status: 'ACTIVE' | 'INACTIVE';
      }>
    ).map((row) => ({
      id: row.id,
      employeeNo: row.employee_no,
      name: row.name,
      position: row.position,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      status: row.status,
    }));
  }

  indicatorDefinitions(): IndicatorDefinitionView[] {
    return (
      this.database
        .prepare(
          `SELECT id, code, name, category, mode, unit, default_weight,
                  default_target, status FROM indicator_definitions ORDER BY code`,
        )
        .all() as Array<{
        id: string;
        code: string;
        name: string;
        category: string;
        mode: 'SYSTEM' | 'MANUAL';
        unit: string;
        default_weight: number;
        default_target: number;
        status: 'ACTIVE' | 'INACTIVE';
      }>
    ).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      mode: row.mode,
      unit: row.unit,
      defaultWeight: row.default_weight,
      defaultTarget: row.default_target,
      status: row.status,
    }));
  }

  workspace(): PerformanceWorkspace {
    const scenario = this.scenario();
    const indicatorRows = this.database
      .prepare('SELECT * FROM indicators WHERE scenario_id = ? ORDER BY code')
      .all(SCENARIO_ID) as unknown as IndicatorRow[];
    const reviewerRows = this.database
      .prepare('SELECT * FROM reviewers WHERE scenario_id = ? ORDER BY weight DESC')
      .all(SCENARIO_ID) as unknown as ReviewerRow[];
    const reviewerScoreRows = this.database
      .prepare(
        `SELECT rs.reviewer_id, rs.indicator_id, rs.score
         FROM reviewer_scores rs
         JOIN reviewers r ON r.id = rs.reviewer_id
         WHERE r.scenario_id = ?
         ORDER BY rs.reviewer_id, rs.indicator_id`,
      )
      .all(SCENARIO_ID) as unknown as ReviewerScoreRow[];
    const audits = this.database
      .prepare('SELECT * FROM audit_events WHERE scenario_id = ? ORDER BY id DESC LIMIT 8')
      .all(SCENARIO_ID) as unknown as AuditRow[];
    const indicators: IndicatorView[] = indicatorRows.map((row) => ({
      id: row.id,
      definitionId: row.definition_id || '',
      code: row.code,
      name: row.name,
      mode: row.mode,
      weight: row.weight,
      target: row.target,
      actual: row.actual,
      rawScore: row.raw_score,
      selfScore: row.self_score,
      finalScore: row.final_score,
    }));
    const reviewers: ReviewerView[] = reviewerRows.map((row) => ({
      id: row.id,
      name: row.name,
      weight: row.weight,
      completed: Boolean(row.completed),
    }));
    return {
      scenarioId: SCENARIO_ID,
      period: scenario.period,
      employee: {
        id: scenario.employee_id,
        name: scenario.employee_name,
        organization: scenario.organization,
      },
      stage: scenario.stage,
      assessmentStatus: scenario.assessment_status,
      configStatus: scenario.config_status,
      configWeight: roundHalfUp(indicators.reduce((sum, item) => sum + item.weight, 0)),
      submittedActuals: indicators.filter((item) => item.actual !== null).length,
      totalActuals: indicators.length,
      finalScore: scenario.final_score,
      grade: scenario.grade,
      organizations: this.organizations(),
      employees: this.employees(),
      indicatorDefinitions: this.indicatorDefinitions(),
      nextAction: nextAction(scenario.stage),
      indicators,
      reviewers,
      reviewerScores: reviewerScoreRows.map((row) => ({
        reviewerId: row.reviewer_id,
        indicatorId: row.indicator_id,
        score: row.score,
      })),
      audits: audits.map((row) => ({
        id: row.id,
        action: row.action,
        detail: row.detail,
        createdAt: row.created_at,
      })) as AuditView[],
    };
  }

  saveOrganization(input: OrganizationInput) {
    if (!input) throw new DomainError('INVALID_INPUT', '组织信息不能为空');
    const id = input.id || `SYN-ORG-${randomUUID()}`;
    const code = requireText(input.code, '组织编码').toUpperCase();
    const name = requireText(input.name, '组织名称');
    const manager = requireText(input.manager, '组织负责人');
    const status = input.status === 'ACTIVE' || input.status === 'INACTIVE' ? input.status : null;
    if (!status) throw new DomainError('INVALID_INPUT', '组织状态无效');
    const duplicate = this.database
      .prepare('SELECT id FROM organizations WHERE code = ? AND id <> ?')
      .get(code, id);
    if (duplicate) throw new DomainError('ORGANIZATION_CODE_EXISTS', '组织编码已存在');
    if (status === 'INACTIVE') {
      const activeEmployees = this.database
        .prepare("SELECT COUNT(*) AS count FROM employees WHERE organization_id = ? AND status = 'ACTIVE'")
        .get(id) as { count: number };
      if (activeEmployees.count > 0)
        throw new DomainError('ORGANIZATION_IN_USE', '组织下仍有在职人员，不能停用');
    }
    this.database
      .prepare(
        `INSERT INTO organizations (id, code, name, manager, status) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name,
           manager = excluded.manager, status = excluded.status`,
      )
      .run(id, code, name, manager, status);
    this.audit(input.id ? 'ORGANIZATION_UPDATED' : 'ORGANIZATION_CREATED', `${code} ${name}`);
    return this.workspace();
  }

  saveEmployee(input: EmployeeInput) {
    if (!input) throw new DomainError('INVALID_INPUT', '人员信息不能为空');
    const id = input.id || `SYN-EMP-${randomUUID()}`;
    const employeeNo = requireText(input.employeeNo, '工号').toUpperCase();
    const name = requireText(input.name, '人员姓名');
    const position = requireText(input.position, '岗位');
    const organizationId = requireText(input.organizationId, '所属组织');
    const status = input.status === 'ACTIVE' || input.status === 'INACTIVE' ? input.status : null;
    if (!status) throw new DomainError('INVALID_INPUT', '人员状态无效');
    const organization = this.database
      .prepare('SELECT status FROM organizations WHERE id = ?')
      .get(organizationId) as { status: string } | undefined;
    if (!organization) throw new DomainError('ORGANIZATION_NOT_FOUND', '所属组织不存在');
    if (status === 'ACTIVE' && organization.status !== 'ACTIVE')
      throw new DomainError('ORGANIZATION_INACTIVE', '不能把在职人员分配到停用组织');
    const duplicate = this.database
      .prepare('SELECT id FROM employees WHERE employee_no = ? AND id <> ?')
      .get(employeeNo, id);
    if (duplicate) throw new DomainError('EMPLOYEE_NO_EXISTS', '工号已存在');
    this.database
      .prepare(
        `INSERT INTO employees (id, employee_no, name, position, organization_id, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET employee_no = excluded.employee_no, name = excluded.name,
           position = excluded.position, organization_id = excluded.organization_id, status = excluded.status`,
      )
      .run(id, employeeNo, name, position, organizationId, status);
    this.audit(input.id ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED', `${employeeNo} ${name}`);
    return this.workspace();
  }

  saveIndicatorDefinition(input: IndicatorDefinitionInput) {
    if (!input) throw new DomainError('INVALID_INPUT', '指标信息不能为空');
    const id = input.id || `SYN-DEF-${randomUUID()}`;
    const code = requireText(input.code, '指标编码').toUpperCase();
    const name = requireText(input.name, '指标名称');
    const category = requireText(input.category, '指标分类');
    const unit = requireText(input.unit, '指标单位');
    const mode = input.mode === 'SYSTEM' || input.mode === 'MANUAL' ? input.mode : null;
    const status = input.status === 'ACTIVE' || input.status === 'INACTIVE' ? input.status : null;
    if (!mode || !status) throw new DomainError('INVALID_INPUT', '指标计分方式或状态无效');
    const duplicate = this.database
      .prepare('SELECT id FROM indicator_definitions WHERE code = ? AND id <> ?')
      .get(code, id);
    if (duplicate) throw new DomainError('INDICATOR_CODE_EXISTS', '指标编码已存在');
    this.database
      .prepare(
        `INSERT INTO indicator_definitions
          (id, code, name, category, mode, unit, default_weight, default_target, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name,
           category = excluded.category, mode = excluded.mode, unit = excluded.unit,
           default_weight = excluded.default_weight, default_target = excluded.default_target,
           status = excluded.status`,
      )
      .run(
        id,
        code,
        name,
        category,
        mode,
        unit,
        requireNumber(input.defaultWeight, '默认权重', 0.01),
        requireNumber(input.defaultTarget, '默认目标', 0.01),
        status,
      );
    this.audit(input.id ? 'INDICATOR_UPDATED' : 'INDICATOR_CREATED', `${code} ${name}`);
    return this.workspace();
  }

  performAction(action: string, payload?: unknown) {
    const scenario = this.scenario();
    const expectedAction = nextAction(scenario.stage).key;
    if (!expectedAction) throw new DomainError('SCENARIO_LOCKED', '周期已经结算锁定');
    if (action !== expectedAction) {
      throw new DomainError('ACTION_NOT_ALLOWED', `当前阶段只允许执行 ${expectedAction}`);
    }
    this.database.exec('BEGIN IMMEDIATE');
    try {
      if (action === 'submit-configuration') this.submitConfiguration(payload as ConfigurationInput);
      else if (action === 'submit-actuals') this.submitActuals(payload as ActualsInput);
      else if (action === 'submit-self-review') this.submitSelfReview(payload as SelfReviewInput);
      else if (action === 'submit-reviewers') this.submitReviews(payload as ReviewsInput);
      else if (action === 'calculate-and-settle') this.calculateAndSettle();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.workspace();
  }

  private submitConfiguration(input: ConfigurationInput) {
    if (!input || !Array.isArray(input.indicators) || !Array.isArray(input.reviewers))
      throw new DomainError('INVALID_INPUT', '请提交完整的个人配置');
    const currentReviewers = this.database
      .prepare('SELECT id FROM reviewers WHERE scenario_id = ? ORDER BY weight DESC')
      .all(SCENARIO_ID) as Array<{ id: string }>;
    if (!input.indicators.length || input.reviewers.length !== currentReviewers.length)
      throw new DomainError('INVALID_INPUT', '至少选择一个指标，并提交完整评价关系');
    ensureConfigWeight(input.indicators.map((item) => requireNumber(item.weight, '指标权重', 0.01)));
    ensureConfigWeight(input.reviewers.map((item) => requireNumber(item.weight, '评价人权重', 0.01)));
    const employee = this.database
      .prepare(
        `SELECT e.id, e.name, e.status, o.name AS organization
         FROM employees e JOIN organizations o ON o.id = e.organization_id WHERE e.id = ?`,
      )
      .get(requireText(input.employeeId, '考核人员')) as
      { id: string; name: string; status: string; organization: string } | undefined;
    if (!employee || employee.status !== 'ACTIVE')
      throw new DomainError('EMPLOYEE_NOT_ACTIVE', '只能为在职人员配置绩效方案');
    const definitionIds = input.indicators.map((item) => item.definitionId);
    if (new Set(definitionIds).size !== definitionIds.length)
      throw new DomainError('DUPLICATE_INDICATOR', '同一指标不能重复选择');
    const selectedDefinitions = definitionIds.map((definitionId) => {
      const definition = this.database
        .prepare('SELECT id, code, name, mode, status FROM indicator_definitions WHERE id = ?')
        .get(definitionId) as
        { id: string; code: string; name: string; mode: 'SYSTEM' | 'MANUAL'; status: string } | undefined;
      if (!definition || definition.status !== 'ACTIVE')
        throw new DomainError('INDICATOR_NOT_ACTIVE', '只能选择启用指标');
      return definition;
    });
    this.database
      .prepare(
        'DELETE FROM reviewer_scores WHERE indicator_id IN (SELECT id FROM indicators WHERE scenario_id = ?)',
      )
      .run(SCENARIO_ID);
    this.database.prepare('DELETE FROM indicators WHERE scenario_id = ?').run(SCENARIO_ID);
    const insertIndicator = this.database.prepare(
      `INSERT INTO indicators
       (id, scenario_id, definition_id, code, name, mode, weight, target)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.indicators.forEach((indicator, index) => {
      const definition = selectedDefinitions[index];
      insertIndicator.run(
        `SYN-PLAN-${definition.id}`,
        SCENARIO_ID,
        definition.id,
        definition.code,
        definition.name,
        definition.mode,
        requireNumber(indicator.weight, '指标权重', 0.01),
        requireNumber(indicator.target, '指标目标值', 0.01),
      );
    });
    const reviewerIds = new Set(currentReviewers.map((item) => item.id));
    for (const reviewer of input.reviewers) {
      if (!reviewerIds.has(reviewer.id)) throw new DomainError('INVALID_INPUT', '包含未知评价人');
      this.database
        .prepare('UPDATE reviewers SET name = ?, weight = ? WHERE id = ?')
        .run(
          requireText(reviewer.name, '评价人名称'),
          requireNumber(reviewer.weight, '评价人权重', 0.01),
          reviewer.id,
        );
    }
    this.database
      .prepare(
        "UPDATE scenarios SET employee_id = ?, employee_name = ?, organization = ?, stage = 'DATA_ENTRY', assessment_status = 'READY', config_status = 'SUBMITTED' WHERE id = ?",
      )
      .run(employee.id, employee.name, employee.organization, SCENARIO_ID);
    this.audit('CONFIG_SUBMITTED', '个人配置、指标和评价人权重校验通过并固化为执行快照。');
  }

  private submitActuals(input: ActualsInput) {
    if (!input || !input.values || typeof input.values !== 'object')
      throw new DomainError('INVALID_INPUT', '请填写全部指标实际值');
    const rows = this.database
      .prepare('SELECT id, mode, weight, target FROM indicators ORDER BY code')
      .all() as Array<{
      id: string;
      mode: 'SYSTEM' | 'MANUAL';
      weight: number;
      target: number;
    }>;
    rows.forEach((row) => {
      const actual = requireNumber(input.values[row.id], '指标实际值');
      const raw = row.mode === 'SYSTEM' ? roundHalfUp((actual / row.target) * row.weight) : null;
      this.database
        .prepare('UPDATE indicators SET actual = ?, raw_score = ? WHERE id = ?')
        .run(actual, raw, row.id);
    });
    this.database
      .prepare("UPDATE scenarios SET stage = 'SELF_REVIEW', assessment_status = 'SELF_REVIEW' WHERE id = ?")
      .run(SCENARIO_ID);
    this.audit('ACTUALS_SUBMITTED', '全部指标实际数据已提交，系统指标生成原始分。');
  }

  private submitSelfReview(input: SelfReviewInput) {
    if (!input || !input.scores || typeof input.scores !== 'object')
      throw new DomainError('INVALID_INPUT', '请填写全部指标自评分');
    const rows = this.database.prepare('SELECT id, weight FROM indicators ORDER BY code').all() as Array<{
      id: string;
      weight: number;
    }>;
    rows.forEach((row) => {
      const score = requireNumber(input.scores[row.id], '指标自评分');
      if (score > row.weight) throw new DomainError('SELF_SCORE_OUT_OF_RANGE', '自评分不能超过指标权重');
      this.database.prepare('UPDATE indicators SET self_score = ? WHERE id = ?').run(score, row.id);
    });
    this.database
      .prepare("UPDATE scenarios SET stage = 'REVIEW', assessment_status = 'ASSESSING' WHERE id = ?")
      .run(SCENARIO_ID);
    this.audit('SELF_REVIEW_SUBMITTED', '员工自评已提交，仅作为评价参考。');
  }

  private submitReviews(input: ReviewsInput) {
    if (!input || !Array.isArray(input.scores)) throw new DomainError('INVALID_INPUT', '请填写完整评价矩阵');
    const reviewers = this.database.prepare('SELECT id FROM reviewers ORDER BY weight DESC').all() as Array<{
      id: string;
    }>;
    const indicators = this.database
      .prepare('SELECT id, weight FROM indicators ORDER BY code')
      .all() as Array<{
      id: string;
      weight: number;
    }>;
    this.database
      .prepare(
        'DELETE FROM reviewer_scores WHERE reviewer_id IN (SELECT id FROM reviewers WHERE scenario_id = ?)',
      )
      .run(SCENARIO_ID);
    reviewers.forEach((reviewer) => {
      indicators.forEach((indicator) => {
        const submitted = input.scores.find(
          (score) => score.reviewerId === reviewer.id && score.indicatorId === indicator.id,
        );
        if (!submitted) throw new DomainError('INVALID_INPUT', '评价矩阵存在未填写单元格');
        const score = requireNumber(submitted.score, '评价分数');
        if (score > indicator.weight) throw new DomainError('REVIEW_SCORE_OUT_OF_RANGE', '评价分数越界');
        this.database
          .prepare('INSERT INTO reviewer_scores VALUES (?, ?, ?)')
          .run(reviewer.id, indicator.id, score);
      });
      this.database.prepare('UPDATE reviewers SET completed = 1 WHERE id = ?').run(reviewer.id);
    });
    this.database
      .prepare("UPDATE scenarios SET stage = 'CALCULATION', assessment_status = 'CALCULATED' WHERE id = ?")
      .run(SCENARIO_ID);
    this.audit('REVIEWS_SUBMITTED', '三位合成评价人已按 50/30/20 完成逐项评分。');
  }

  private calculateAndSettle() {
    const reviewers = this.database
      .prepare('SELECT id, weight FROM reviewers ORDER BY weight DESC')
      .all() as Array<{
      id: string;
      weight: number;
    }>;
    ensureConfigWeight(reviewers.map((row) => row.weight));
    const indicators = this.database
      .prepare('SELECT id, mode, weight, raw_score FROM indicators ORDER BY code')
      .all() as Array<{
      id: string;
      mode: 'SYSTEM' | 'MANUAL';
      weight: number;
      raw_score: number | null;
    }>;
    let total = 0;
    for (const indicator of indicators) {
      let finalScore: number;
      if (indicator.mode === 'SYSTEM') {
        if (indicator.raw_score === null) throw new DomainError('RAW_SCORE_MISSING', '系统原始分缺失');
        finalScore = systemItemScore(indicator.raw_score, indicator.weight);
      } else {
        const scores = this.database
          .prepare('SELECT reviewer_id, score FROM reviewer_scores WHERE indicator_id = ?')
          .all(indicator.id) as Array<{ reviewer_id: string; score: number }>;
        finalScore = weightedReviewerScore(
          scores.map((score) => ({
            score: score.score,
            reviewerWeight: reviewers.find((reviewer) => reviewer.id === score.reviewer_id)?.weight || 0,
          })),
          indicator.weight,
        );
      }
      total += finalScore;
      this.database
        .prepare('UPDATE indicators SET final_score = ? WHERE id = ?')
        .run(finalScore, indicator.id);
    }
    total = roundHalfUp(total);
    this.database
      .prepare(
        "UPDATE scenarios SET stage = 'LOCKED', assessment_status = 'LOCKED', final_score = ?, grade = ? WHERE id = ?",
      )
      .run(total, gradeFor(total), SCENARIO_ID);
    this.audit('ASSESSMENT_LOCKED', `核算完成，总分 ${total.toFixed(2)}，执行快照已锁定。`);
  }

  close() {
    this.database.close();
  }
}
