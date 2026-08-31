import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DomainError, requiredNumber, requiredText, round } from './domain.ts';
import type { PageQuery, SystemSnapshot } from '../../shared/contracts.ts';

const NOW = '2026-08-31T08:00:00.000Z';
const CURRENT_USER = { id: 'SYN-EMP-001', name: '林澈', role: 'PERFORMANCE_ADMIN' };
type DbValue = string | number | null;
type DbRow = Record<string, DbValue>;

function json(value: unknown) {
  return JSON.stringify(value);
}

export class PerformanceSystemStore {
  private readonly db: DatabaseSync;

  constructor(databasePath = ':memory:') {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    this.migrate();
    this.seed();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, parent_id TEXT,
        level INTEGER NOT NULL, manager_name TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS periods (
        id TEXT PRIMARY KEY, year INTEGER NOT NULL, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY, employee_no TEXT UNIQUE NOT NULL, name TEXT NOT NULL, position TEXT NOT NULL,
        organization_id TEXT NOT NULL REFERENCES organizations(id), manager_id TEXT, role TEXT NOT NULL,
        status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS indicator_definitions (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
        source_type TEXT NOT NULL, unit TEXT NOT NULL, default_weight REAL NOT NULL, scoring_rule TEXT NOT NULL,
        owner_name TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS indicator_scopes (
        id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id),
        organization_id TEXT REFERENCES organizations(id), position_keyword TEXT, valid_from TEXT NOT NULL, valid_to TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS indicator_quantifications (
        id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id), period_id TEXT NOT NULL REFERENCES periods(id),
        target_value REAL NOT NULL, floor_value REAL NOT NULL, cap_score REAL NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS indicator_assignments (
        id TEXT PRIMARY KEY, indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id), period_id TEXT NOT NULL REFERENCES periods(id),
        organization_id TEXT NOT NULL REFERENCES organizations(id), status TEXT NOT NULL, assigned_count INTEGER NOT NULL,
        issued_at TEXT, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS personal_configs (
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), period_id TEXT NOT NULL REFERENCES periods(id),
        status TEXT NOT NULL, total_weight REAL NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(employee_id, period_id)
      );
      CREATE TABLE IF NOT EXISTS personal_config_items (
        id TEXT PRIMARY KEY, config_id TEXT NOT NULL REFERENCES personal_configs(id) ON DELETE CASCADE,
        indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id), weight REAL NOT NULL, target_value REAL NOT NULL,
        data_provider_id TEXT REFERENCES employees(id), reviewer_id TEXT REFERENCES employees(id)
      );
      CREATE TABLE IF NOT EXISTS actual_data (
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), period_id TEXT NOT NULL REFERENCES periods(id),
        indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id), value REAL, evidence TEXT, status TEXT NOT NULL,
        submitted_by TEXT, submitted_at TEXT, version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(employee_id, period_id, indicator_id)
      );
      CREATE TABLE IF NOT EXISTS period_plans (
        id TEXT PRIMARY KEY, period_id TEXT UNIQUE NOT NULL REFERENCES periods(id), status TEXT NOT NULL,
        preflight_json TEXT NOT NULL, generated_count INTEGER NOT NULL DEFAULT 0, last_run_at TEXT, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS performance_cases (
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), period_id TEXT NOT NULL REFERENCES periods(id),
        status TEXT NOT NULL, config_version INTEGER NOT NULL, total_score REAL, grade TEXT, locked_at TEXT,
        version INTEGER NOT NULL DEFAULT 1, UNIQUE(employee_id, period_id)
      );
      CREATE TABLE IF NOT EXISTS performance_case_items (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES performance_cases(id) ON DELETE CASCADE,
        indicator_id TEXT NOT NULL REFERENCES indicator_definitions(id), indicator_name TEXT NOT NULL,
        weight REAL NOT NULL, target_value REAL NOT NULL, actual_value REAL, self_score REAL, reviewer_score REAL, item_score REAL
      );
      CREATE TABLE IF NOT EXISTS assessment_tasks (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES performance_cases(id) ON DELETE CASCADE,
        assignee_id TEXT NOT NULL REFERENCES employees(id), task_type TEXT NOT NULL, status TEXT NOT NULL,
        due_date TEXT NOT NULL, score REAL, comment TEXT, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS result_records (
        id TEXT PRIMARY KEY, case_id TEXT UNIQUE NOT NULL REFERENCES performance_cases(id), employee_id TEXT NOT NULL,
        period_id TEXT NOT NULL, total_score REAL NOT NULL, grade TEXT NOT NULL, rank_no INTEGER, published_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_runs (
        id TEXT PRIMARY KEY, job_type TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL,
        processed INTEGER NOT NULL, succeeded INTEGER NOT NULL, failed INTEGER NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, object_type TEXT NOT NULL,
        object_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_case_period ON performance_cases(period_id, status);
      CREATE INDEX IF NOT EXISTS idx_task_assignee ON assessment_tasks(assignee_id, status);
      CREATE INDEX IF NOT EXISTS idx_actual_period ON actual_data(period_id, status);
    `);
  }

  private seed() {
    if (this.db.prepare('SELECT 1 FROM organizations LIMIT 1').get()) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const orgs = [
        ['ORG-GROUP', '集团', null, 1, '顾言'],
        ['ORG-TECH', '技术与产品中心', 'ORG-GROUP', 2, '周岚'],
        ['ORG-MKT', '市场与客户中心', 'ORG-GROUP', 2, '江维'],
        ['ORG-FE', '体验研发部', 'ORG-TECH', 3, '陆野'],
        ['ORG-DATA', '数据平台部', 'ORG-TECH', 3, '程远'],
        ['ORG-SALES', '行业销售部', 'ORG-MKT', 3, '叶青'],
      ];
      const insertOrg = this.db.prepare('INSERT INTO organizations VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
      orgs.forEach(([id, name, parentId, level, manager], index) =>
        insertOrg.run(id, `D${index + 1}`, name, parentId, level, manager, 'ACTIVE'),
      );

      const insertPeriod = this.db.prepare('INSERT INTO periods VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
      for (const year of [2025, 2026]) {
        for (let quarter = 1; quarter <= 4; quarter += 1) {
          const code = `${year}-Q${quarter}`;
          insertPeriod.run(
            `PER-${code}`,
            year,
            code,
            `${year} 年第 ${quarter} 季度`,
            `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`,
            `${year}-${String(quarter * 3).padStart(2, '0')}-${quarter === 1 || quarter === 4 ? '31' : '30'}`,
            code === '2026-Q3' ? 'RUNNING' : code < '2026-Q3' ? 'CLOSED' : 'PLANNED',
          );
        }
      }

      const names = [
        '林澈',
        '沈知行',
        '秦川',
        '许棠',
        '苏衡',
        '夏清',
        '闻舟',
        '宋言',
        '白露',
        '程宁',
        '顾川',
        '陆遥',
        '叶澄',
        '周禾',
        '江屿',
        '唐宁',
        '方简',
        '高远',
        '罗钦',
        '温然',
        '乔木',
        '景行',
        '陈墨',
        '宁安',
      ];
      const departments = ['ORG-FE', 'ORG-DATA', 'ORG-SALES'];
      const insertEmployee = this.db.prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)');
      names.forEach((name, index) => {
        const id = `SYN-EMP-${String(index + 1).padStart(3, '0')}`;
        const department = departments[index % departments.length];
        const managerId = index < 3 ? null : `SYN-EMP-${String((index % 3) + 1).padStart(3, '0')}`;
        const role =
          index === 0
            ? 'PERFORMANCE_ADMIN'
            : index < 3
              ? 'ORG_MANAGER'
              : index % 5 === 0
                ? 'DATA_PROVIDER'
                : 'EMPLOYEE';
        insertEmployee.run(
          id,
          `E${String(index + 1).padStart(4, '0')}`,
          name,
          index < 3 ? '部门负责人' : index % 2 ? '高级业务专家' : '业务专员',
          department,
          managerId,
          role,
          'ACTIVE',
        );
      });

      const indicatorNames = [
        ['IND-001', '年度经营目标达成率', '经营结果', 'SYSTEM', '%', 30],
        ['IND-002', '重点项目按期交付率', '项目交付', 'SYSTEM', '%', 20],
        ['IND-003', '客户满意度', '客户价值', 'SYSTEM', '分', 15],
        ['IND-004', '交付质量', '项目交付', 'MANUAL', '分', 15],
        ['IND-005', '团队协作', '组织能力', 'MANUAL', '分', 10],
        ['IND-006', '创新与改进', '组织能力', 'MANUAL', '分', 10],
        ['IND-007', '销售回款完成率', '经营结果', 'SYSTEM', '%', 25],
        ['IND-008', '新增标杆客户数', '客户价值', 'SYSTEM', '个', 20],
        ['IND-009', '平台稳定性', '技术质量', 'SYSTEM', '%', 25],
        ['IND-010', '缺陷逃逸率', '技术质量', 'SYSTEM', '%', 15],
        ['IND-011', '知识沉淀与分享', '组织能力', 'MANUAL', '次', 10],
        ['IND-012', '人才培养', '组织能力', 'MANUAL', '分', 10],
      ];
      const insertIndicator = this.db.prepare(
        'INSERT INTO indicator_definitions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
      );
      indicatorNames.forEach(([code, name, category, sourceType, unit, weight], index) =>
        insertIndicator.run(
          `DEF-${String(index + 1).padStart(3, '0')}`,
          code,
          name,
          category,
          sourceType,
          unit,
          weight,
          sourceType === 'SYSTEM' ? 'ACHIEVEMENT_RATE' : 'MANUAL_SCORE',
          index % 2 ? '周岚' : '林澈',
          index < 10 ? 'PUBLISHED' : 'DRAFT',
        ),
      );

      const insertScope = this.db.prepare('INSERT INTO indicator_scopes VALUES (?, ?, ?, ?, ?, ?)');
      const insertQuant = this.db.prepare(
        'INSERT INTO indicator_quantifications VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      );
      const insertAssignment = this.db.prepare(
        'INSERT INTO indicator_assignments VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      );
      for (let index = 1; index <= 10; index += 1) {
        const indicatorId = `DEF-${String(index).padStart(3, '0')}`;
        const organizationId = departments[index % departments.length];
        insertScope.run(`SCOPE-${index}`, indicatorId, organizationId, null, '2026-01-01', '2026-12-31');
        insertQuant.run(
          `QUANT-${index}`,
          indicatorId,
          'PER-2026-Q3',
          index === 8 ? 6 : 100,
          60,
          120,
          'READY',
        );
        insertAssignment.run(
          `ASSIGN-${index}`,
          indicatorId,
          'PER-2026-Q3',
          organizationId,
          index < 9 ? 'ISSUED' : 'DRAFT',
          8,
          index < 9 ? NOW : null,
        );
      }

      const insertConfig = this.db.prepare('INSERT INTO personal_configs VALUES (?, ?, ?, ?, ?, ?, 1)');
      const insertItem = this.db.prepare('INSERT INTO personal_config_items VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insertActual = this.db.prepare('INSERT INTO actual_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
      for (let employeeIndex = 1; employeeIndex <= 20; employeeIndex += 1) {
        const employeeId = `SYN-EMP-${String(employeeIndex).padStart(3, '0')}`;
        const configId = `CFG-${String(employeeIndex).padStart(3, '0')}`;
        const configStatus = employeeIndex <= 16 ? 'ISSUED' : employeeIndex <= 18 ? 'READY' : 'DRAFT';
        insertConfig.run(configId, employeeId, 'PER-2026-Q3', configStatus, 100, 'ASSIGNMENT');
        const selected = [1, 2, 4, 5, 6];
        selected.forEach((indicatorNo, itemIndex) => {
          const indicatorId = `DEF-${String(indicatorNo).padStart(3, '0')}`;
          insertItem.run(
            `${configId}-I${itemIndex + 1}`,
            configId,
            indicatorId,
            [30, 20, 20, 15, 15][itemIndex],
            100,
            'SYN-EMP-006',
            employeeIndex <= 3
              ? 'SYN-EMP-001'
              : `SYN-EMP-${String((employeeIndex % 3) + 1).padStart(3, '0')}`,
          );
          const actualStatus = employeeIndex <= 10 ? 'SUBMITTED' : employeeIndex <= 16 ? 'DRAFT' : 'MISSING';
          insertActual.run(
            `ACT-${employeeIndex}-${itemIndex + 1}`,
            employeeId,
            'PER-2026-Q3',
            indicatorId,
            actualStatus === 'MISSING' ? null : 82 + ((employeeIndex + itemIndex) % 17),
            actualStatus === 'SUBMITTED' ? '合成业务凭证已核验' : null,
            actualStatus,
            actualStatus === 'SUBMITTED' ? employeeId : null,
            actualStatus === 'SUBMITTED' ? NOW : null,
          );
        });
      }

      this.db
        .prepare('INSERT INTO period_plans VALUES (?, ?, ?, ?, ?, ?, 1)')
        .run(
          'PLAN-2026-Q3',
          'PER-2026-Q3',
          'RUNNING',
          json({ configReady: 16, configBlocked: 4, dataSubmitted: 10 }),
          12,
          NOW,
        );
      for (let employeeIndex = 1; employeeIndex <= 12; employeeIndex += 1) {
        const employeeId = `SYN-EMP-${String(employeeIndex).padStart(3, '0')}`;
        const caseId = `CASE-${String(employeeIndex).padStart(3, '0')}`;
        const states = ['READY', 'SELF_REVIEW', 'REVIEWING', 'CALCULATING', 'COMPLETED', 'LOCKED'];
        const status = states[(employeeIndex - 1) % states.length];
        const score = status === 'COMPLETED' || status === 'LOCKED' ? 82 + employeeIndex : null;
        const grade = score ? (score >= 92 ? 'A' : score >= 85 ? 'B+' : 'B') : null;
        this.db
          .prepare('INSERT INTO performance_cases VALUES (?, ?, ?, ?, 1, ?, ?, ?, 1)')
          .run(caseId, employeeId, 'PER-2026-Q3', status, score, grade, status === 'LOCKED' ? NOW : null);
        const rows = this.db
          .prepare('SELECT * FROM personal_config_items WHERE config_id = ?')
          .all(`CFG-${String(employeeIndex).padStart(3, '0')}`) as DbRow[];
        for (const item of rows) {
          const indicator = this.db
            .prepare('SELECT name FROM indicator_definitions WHERE id = ?')
            .get(item.indicator_id) as { name: string };
          this.db
            .prepare('INSERT INTO performance_case_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(
              randomUUID(),
              caseId,
              item.indicator_id,
              indicator.name,
              item.weight,
              item.target_value,
              score ? score - 3 : null,
              status === 'SELF_REVIEW' ? 88 : null,
              score,
              score,
            );
        }
        const taskStatus =
          status === 'COMPLETED' || status === 'LOCKED'
            ? 'DONE'
            : employeeIndex % 4 === 0
              ? 'OVERDUE'
              : 'OPEN';
        this.db
          .prepare('INSERT INTO assessment_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
          .run(
            `TASK-${employeeIndex}`,
            caseId,
            employeeIndex <= 3 ? 'SYN-EMP-001' : employeeId,
            status === 'SELF_REVIEW' ? 'SELF_REVIEW' : 'MANAGER_REVIEW',
            taskStatus,
            '2026-09-10',
            score,
            taskStatus === 'DONE' ? '合成评价已完成' : null,
          );
        if (score)
          this.db
            .prepare('INSERT INTO result_records VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(`RES-${employeeIndex}`, caseId, employeeId, 'PER-2026-Q3', score, grade, employeeIndex, NOW);
      }
      this.audit('SYSTEM', 'SEED_DATABASE', 'system', 'performance-v2', '初始化完整合成业务数据');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private audit(actor: string, action: string, objectType: string, objectId: string, detail: string) {
    this.db
      .prepare(
        'INSERT INTO audit_events(actor, action, object_type, object_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(actor, action, objectType, objectId, detail, new Date().toISOString());
  }

  private rows(sql: string, params: DbValue[] = []) {
    return this.db.prepare(sql).all(...params) as DbRow[];
  }

  snapshot(query: PageQuery = {}): SystemSnapshot {
    const filters: string[] = [];
    const params: DbValue[] = [];
    if (query.organizationId) {
      filters.push('e.organization_id = ?');
      params.push(query.organizationId);
    }
    if (query.keyword) {
      filters.push('(e.name LIKE ? OR e.employee_no LIKE ? OR e.position LIKE ?)');
      const keyword = `%${query.keyword}%`;
      params.push(keyword, keyword, keyword);
    }
    const employeeWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const periodId = query.periodId || 'PER-2026-Q3';
    const organizations = this.rows(
      'SELECT id, code, name, parent_id AS parentId, level, manager_name AS managerName, status, version FROM organizations ORDER BY level, code',
    );
    const employees = this.rows(
      `SELECT e.id, e.employee_no AS employeeNo, e.name, e.position, e.organization_id AS organizationId, o.name AS organizationName, e.manager_id AS managerId, e.role, e.status, e.version FROM employees e JOIN organizations o ON o.id=e.organization_id ${employeeWhere} ORDER BY e.employee_no`,
      params,
    );
    const periods = this.rows(
      'SELECT id, year, code, name, start_date AS startDate, end_date AS endDate, status, version FROM periods ORDER BY code DESC',
    );
    const indicators = this.rows(
      `SELECT d.id, d.code, d.name, d.category, d.source_type AS sourceType, d.unit, d.default_weight AS defaultWeight, d.scoring_rule AS scoringRule, d.owner_name AS ownerName, d.status, d.version, COUNT(DISTINCT s.organization_id) AS scopeCount, q.target_value AS targetValue, q.status AS quantificationStatus FROM indicator_definitions d LEFT JOIN indicator_scopes s ON s.indicator_id=d.id LEFT JOIN indicator_quantifications q ON q.indicator_id=d.id AND q.period_id=? GROUP BY d.id ORDER BY d.code`,
      [periodId],
    );
    const assignments = this.rows(
      `SELECT a.id, a.indicator_id AS indicatorId, d.name AS indicatorName, a.period_id AS periodId, p.name AS periodName, a.organization_id AS organizationId, o.name AS organizationName, a.status, a.assigned_count AS assignedCount, a.issued_at AS issuedAt, a.version FROM indicator_assignments a JOIN indicator_definitions d ON d.id=a.indicator_id JOIN organizations o ON o.id=a.organization_id JOIN periods p ON p.id=a.period_id WHERE a.period_id=? ORDER BY d.code`,
      [periodId],
    );
    const configs = this.rows(
      `SELECT c.id, c.employee_id AS employeeId, e.employee_no AS employeeNo, e.name AS employeeName, o.name AS organizationName, c.period_id AS periodId, c.status, c.total_weight AS totalWeight, c.source, c.version, COUNT(i.id) AS itemCount FROM personal_configs c JOIN employees e ON e.id=c.employee_id JOIN organizations o ON o.id=e.organization_id LEFT JOIN personal_config_items i ON i.config_id=c.id WHERE c.period_id=? GROUP BY c.id ORDER BY e.employee_no`,
      [periodId],
    );
    const actualData = this.rows(
      `SELECT a.id, a.employee_id AS employeeId, e.name AS employeeName, a.period_id AS periodId, a.indicator_id AS indicatorId, d.name AS indicatorName, d.unit, a.value, a.evidence, a.status, a.submitted_at AS submittedAt, a.version FROM actual_data a JOIN employees e ON e.id=a.employee_id JOIN indicator_definitions d ON d.id=a.indicator_id WHERE a.period_id=? ORDER BY e.employee_no, d.code`,
      [periodId],
    );
    const cases = this.rows(
      `SELECT c.id, c.employee_id AS employeeId, e.name AS employeeName, e.employee_no AS employeeNo, o.name AS organizationName, c.period_id AS periodId, c.status, c.total_score AS totalScore, c.grade, c.locked_at AS lockedAt, c.version FROM performance_cases c JOIN employees e ON e.id=c.employee_id JOIN organizations o ON o.id=e.organization_id WHERE c.period_id=? ORDER BY e.employee_no`,
      [periodId],
    );
    const tasks = this.rows(
      `SELECT t.id, t.case_id AS caseId, c.employee_id AS employeeId, e.name AS employeeName, t.assignee_id AS assigneeId, a.name AS assigneeName, t.task_type AS taskType, t.status, t.due_date AS dueDate, t.score, t.comment, t.version FROM assessment_tasks t JOIN performance_cases c ON c.id=t.case_id JOIN employees e ON e.id=c.employee_id JOIN employees a ON a.id=t.assignee_id WHERE c.period_id=? ORDER BY t.due_date, t.id`,
      [periodId],
    );
    const results = this.rows(
      `SELECT r.id, r.case_id AS caseId, r.employee_id AS employeeId, e.name AS employeeName, o.name AS organizationName, r.period_id AS periodId, r.total_score AS totalScore, r.grade, r.rank_no AS rankNo, r.published_at AS publishedAt FROM result_records r JOIN employees e ON e.id=r.employee_id JOIN organizations o ON o.id=e.organization_id WHERE r.period_id=? ORDER BY r.total_score DESC`,
      [periodId],
    );
    const jobs = this.rows(
      'SELECT id, job_type AS jobType, status, requested_by AS requestedBy, processed, succeeded, failed, detail, created_at AS createdAt FROM job_runs ORDER BY created_at DESC LIMIT 30',
    );
    const audits = this.rows(
      'SELECT id, actor, action, object_type AS objectType, object_id AS objectId, detail, created_at AS createdAt FROM audit_events ORDER BY id DESC LIMIT 80',
    );
    const summary = {
      activeEmployees: Number(
        (
          this.db.prepare("SELECT COUNT(*) AS value FROM employees WHERE status='ACTIVE'").get() as {
            value: number;
          }
        ).value,
      ),
      publishedIndicators: Number(
        (
          this.db
            .prepare("SELECT COUNT(*) AS value FROM indicator_definitions WHERE status='PUBLISHED'")
            .get() as { value: number }
        ).value,
      ),
      issuedConfigs: Number(
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS value FROM personal_configs WHERE period_id=? AND status IN ('ISSUED','LOCKED')",
            )
            .get(periodId) as { value: number }
        ).value,
      ),
      openTasks: Number(
        (
          this.db
            .prepare("SELECT COUNT(*) AS value FROM assessment_tasks WHERE status IN ('OPEN','OVERDUE')")
            .get() as { value: number }
        ).value,
      ),
      completedCases: Number(
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS value FROM performance_cases WHERE period_id=? AND status IN ('COMPLETED','LOCKED')",
            )
            .get(periodId) as { value: number }
        ).value,
      ),
      blockers: Number(
        (
          this.db
            .prepare("SELECT COUNT(*) AS value FROM actual_data WHERE period_id=? AND status='MISSING'")
            .get(periodId) as { value: number }
        ).value,
      ),
    };
    return {
      generatedAt: new Date().toISOString(),
      currentUser: CURRENT_USER,
      summary,
      organizations,
      employees,
      periods,
      indicators,
      assignments,
      configs,
      actualData,
      cases,
      tasks,
      results,
      jobs,
      audits,
    };
  }

  saveOrganization(input: Record<string, unknown>) {
    const id = typeof input.id === 'string' && input.id ? input.id : randomUUID();
    const existing = this.db.prepare('SELECT version FROM organizations WHERE id=?').get(id) as
      { version: number } | undefined;
    if (existing && input.version !== undefined && Number(input.version) !== existing.version)
      throw new DomainError('VERSION_CONFLICT', '组织数据已被其他操作更新，请刷新后重试');
    const values: DbValue[] = [
      requiredText(input.code, '组织编码'),
      requiredText(input.name, '组织名称'),
      typeof input.parentId === 'string' && input.parentId ? input.parentId : null,
      requiredNumber(Number(input.level), '组织层级', 1, 6),
      requiredText(input.managerName, '负责人'),
      input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    ];
    if (existing)
      this.db
        .prepare(
          'UPDATE organizations SET code=?, name=?, parent_id=?, level=?, manager_name=?, status=?, version=version+1 WHERE id=?',
        )
        .run(...values, id);
    else this.db.prepare('INSERT INTO organizations VALUES (?, ?, ?, ?, ?, ?, ?, 1)').run(id, ...values);
    this.audit(
      CURRENT_USER.name,
      existing ? 'UPDATE_ORGANIZATION' : 'CREATE_ORGANIZATION',
      'organization',
      id,
      `${values[1]}`,
    );
    return this.snapshot();
  }

  saveEmployee(input: Record<string, unknown>) {
    const id = typeof input.id === 'string' && input.id ? input.id : randomUUID();
    const organizationId = requiredText(input.organizationId, '所属组织');
    if (!this.db.prepare("SELECT 1 FROM organizations WHERE id=? AND status='ACTIVE'").get(organizationId))
      throw new DomainError('ORGANIZATION_UNAVAILABLE', '所属组织不存在或已停用');
    const existing = this.db.prepare('SELECT version FROM employees WHERE id=?').get(id) as
      { version: number } | undefined;
    if (existing)
      this.db
        .prepare(
          'UPDATE employees SET employee_no=?, name=?, position=?, organization_id=?, manager_id=?, role=?, status=?, version=version+1 WHERE id=?',
        )
        .run(
          requiredText(input.employeeNo, '工号'),
          requiredText(input.name, '姓名'),
          requiredText(input.position, '岗位'),
          organizationId,
          typeof input.managerId === 'string' && input.managerId ? input.managerId : null,
          requiredText(input.role, '角色'),
          input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          id,
        );
    else
      this.db
        .prepare('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run(
          id,
          requiredText(input.employeeNo, '工号'),
          requiredText(input.name, '姓名'),
          requiredText(input.position, '岗位'),
          organizationId,
          typeof input.managerId === 'string' && input.managerId ? input.managerId : null,
          requiredText(input.role, '角色'),
          'ACTIVE',
        );
    this.audit(
      CURRENT_USER.name,
      existing ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE',
      'employee',
      id,
      requiredText(input.name, '姓名'),
    );
    return this.snapshot();
  }

  saveIndicator(input: Record<string, unknown>) {
    const id = typeof input.id === 'string' && input.id ? input.id : randomUUID();
    const existing = this.db
      .prepare('SELECT status, version FROM indicator_definitions WHERE id=?')
      .get(id) as { status: string; version: number } | undefined;
    if (existing?.status === 'PUBLISHED' && input.status === 'DRAFT')
      throw new DomainError('INVALID_TRANSITION', '已发布指标不能退回草稿，可创建新版本或停用');
    const values: DbValue[] = [
      requiredText(input.code, '指标编码'),
      requiredText(input.name, '指标名称'),
      requiredText(input.category, '指标分类'),
      input.sourceType === 'MANUAL' ? 'MANUAL' : 'SYSTEM',
      requiredText(input.unit, '单位'),
      requiredNumber(Number(input.defaultWeight), '默认权重', 0, 100),
      requiredText(input.scoringRule || 'ACHIEVEMENT_RATE', '计分规则'),
      requiredText(input.ownerName || CURRENT_USER.name, '负责人'),
      typeof input.status === 'string' ? input.status : 'DRAFT',
    ];
    if (existing)
      this.db
        .prepare(
          'UPDATE indicator_definitions SET code=?, name=?, category=?, source_type=?, unit=?, default_weight=?, scoring_rule=?, owner_name=?, status=?, version=version+1 WHERE id=?',
        )
        .run(...values, id);
    else
      this.db
        .prepare('INSERT INTO indicator_definitions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .run(id, ...values);
    this.audit(
      CURRENT_USER.name,
      existing ? 'UPDATE_INDICATOR' : 'CREATE_INDICATOR',
      'indicator',
      id,
      `${values[1]}`,
    );
    return this.snapshot();
  }

  publishIndicator(id: string) {
    const row = this.db.prepare('SELECT * FROM indicator_definitions WHERE id=?').get(id) as
      DbRow | undefined;
    if (!row) throw new DomainError('NOT_FOUND', '指标不存在', 404);
    if (Number(row.default_weight) <= 0) throw new DomainError('PREFLIGHT_FAILED', '指标默认权重必须大于 0');
    this.db
      .prepare("UPDATE indicator_definitions SET status='PUBLISHED', version=version+1 WHERE id=?")
      .run(id);
    this.audit(CURRENT_USER.name, 'PUBLISH_INDICATOR', 'indicator', id, `${row.name}`);
    return this.snapshot();
  }

  issueAssignments(periodId: string) {
    const pending = this.rows("SELECT id FROM indicator_assignments WHERE period_id=? AND status='DRAFT'", [
      periodId,
    ]);
    this.db
      .prepare(
        "UPDATE indicator_assignments SET status='ISSUED', issued_at=?, version=version+1 WHERE period_id=? AND status='DRAFT'",
      )
      .run(new Date().toISOString(), periodId);
    this.recordJob(
      'ISSUE_ASSIGNMENTS',
      pending.length,
      pending.length,
      0,
      `下发 ${pending.length} 条组织指标`,
    );
    return this.snapshot({ periodId });
  }

  generateConfigs(periodId: string) {
    const employees = this.rows(
      "SELECT id FROM employees WHERE status='ACTIVE' AND id NOT IN (SELECT employee_id FROM personal_configs WHERE period_id=?)",
      [periodId],
    );
    let succeeded = 0;
    for (const employee of employees) {
      const configId = randomUUID();
      this.db
        .prepare("INSERT INTO personal_configs VALUES (?, ?, ?, 'DRAFT', 100, 'AUTO', 1)")
        .run(configId, String(employee.id), periodId);
      succeeded += 1;
    }
    this.recordJob(
      'GENERATE_CONFIGS',
      employees.length,
      succeeded,
      employees.length - succeeded,
      `生成 ${succeeded} 份配置`,
    );
    return this.snapshot({ periodId });
  }

  issueConfig(id: string) {
    const row = this.db
      .prepare('SELECT total_weight AS totalWeight, status FROM personal_configs WHERE id=?')
      .get(id) as { totalWeight: number; status: string } | undefined;
    if (!row) throw new DomainError('NOT_FOUND', '个人配置不存在', 404);
    if (round(row.totalWeight) !== 100) throw new DomainError('WEIGHT_INVALID', '指标权重合计必须等于 100');
    this.db.prepare("UPDATE personal_configs SET status='ISSUED', version=version+1 WHERE id=?").run(id);
    this.audit(CURRENT_USER.name, 'ISSUE_CONFIG', 'personal_config', id, '个人配置已下发');
    return this.snapshot();
  }

  submitActual(id: string, input: Record<string, unknown>) {
    const row = this.db.prepare('SELECT status FROM actual_data WHERE id=?').get(id) as
      { status: string } | undefined;
    if (!row) throw new DomainError('NOT_FOUND', '填报任务不存在', 404);
    if (row.status === 'LOCKED') throw new DomainError('DATA_LOCKED', '该数据已锁定，不能修改');
    const value = requiredNumber(Number(input.value), '实际值', 0);
    this.db
      .prepare(
        "UPDATE actual_data SET value=?, evidence=?, status='SUBMITTED', submitted_by=?, submitted_at=?, version=version+1 WHERE id=?",
      )
      .run(
        value,
        typeof input.evidence === 'string' ? input.evidence.trim() : '',
        CURRENT_USER.id,
        new Date().toISOString(),
        id,
      );
    this.audit(CURRENT_USER.name, 'SUBMIT_ACTUAL_DATA', 'actual_data', id, `提交值 ${value}`);
    return this.snapshot();
  }

  generateCases(periodId: string) {
    const configs = this.rows(
      "SELECT * FROM personal_configs WHERE period_id=? AND status IN ('ISSUED','LOCKED') AND employee_id NOT IN (SELECT employee_id FROM performance_cases WHERE period_id=?)",
      [periodId, periodId],
    );
    let succeeded = 0;
    for (const config of configs) {
      const caseId = randomUUID();
      this.db
        .prepare("INSERT INTO performance_cases VALUES (?, ?, ?, 'READY', ?, NULL, NULL, NULL, 1)")
        .run(caseId, String(config.employee_id), periodId, Number(config.version));
      const items = this.rows(
        'SELECT i.*, d.name FROM personal_config_items i JOIN indicator_definitions d ON d.id=i.indicator_id WHERE i.config_id=?',
        [String(config.id)],
      );
      for (const item of items)
        this.db
          .prepare('INSERT INTO performance_case_items VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)')
          .run(
            randomUUID(),
            caseId,
            String(item.indicator_id),
            String(item.name),
            Number(item.weight),
            Number(item.target_value),
          );
      this.db
        .prepare(
          "INSERT INTO assessment_tasks VALUES (?, ?, ?, 'SELF_REVIEW', 'OPEN', '2026-09-10', NULL, NULL, 1)",
        )
        .run(randomUUID(), caseId, String(config.employee_id));
      succeeded += 1;
    }
    this.db
      .prepare(
        'UPDATE period_plans SET generated_count=generated_count+?, last_run_at=?, version=version+1 WHERE period_id=?',
      )
      .run(succeeded, new Date().toISOString(), periodId);
    this.recordJob(
      'GENERATE_CASES',
      configs.length,
      succeeded,
      configs.length - succeeded,
      `生成 ${succeeded} 份绩效单`,
    );
    return this.snapshot({ periodId });
  }

  advanceCase(id: string, action: string, input: Record<string, unknown>) {
    const row = this.db.prepare('SELECT * FROM performance_cases WHERE id=?').get(id) as DbRow | undefined;
    if (!row) throw new DomainError('NOT_FOUND', '绩效单不存在', 404);
    const status = String(row.status);
    const transitions: Record<string, Record<string, string>> = {
      READY: { start: 'SELF_REVIEW', void: 'VOID' },
      SELF_REVIEW: { submitSelfReview: 'REVIEWING', void: 'VOID' },
      REVIEWING: { submitReview: 'CALCULATING', void: 'VOID' },
      CALCULATING: { calculate: 'COMPLETED', void: 'VOID' },
      COMPLETED: { lock: 'LOCKED', reopen: 'REVIEWING' },
    };
    const next = transitions[status]?.[action];
    if (!next) throw new DomainError('INVALID_TRANSITION', `${status} 状态下不能执行 ${action}`);
    if (action === 'submitSelfReview') {
      const score = requiredNumber(Number(input.score), '自评分', 0, 120);
      this.db.prepare('UPDATE performance_case_items SET self_score=? WHERE case_id=?').run(score, id);
      this.db
        .prepare(
          "UPDATE assessment_tasks SET status='DONE', score=?, comment=?, version=version+1 WHERE case_id=? AND task_type='SELF_REVIEW'",
        )
        .run(score, String(input.comment || ''), id);
      const reviewerId = String(row.employee_id) === 'SYN-EMP-001' ? 'SYN-EMP-002' : 'SYN-EMP-001';
      this.db
        .prepare(
          "INSERT INTO assessment_tasks VALUES (?, ?, ?, 'MANAGER_REVIEW', 'OPEN', '2026-09-15', NULL, NULL, 1)",
        )
        .run(randomUUID(), id, reviewerId);
    }
    if (action === 'submitReview') {
      const score = requiredNumber(Number(input.score), '评价分', 0, 120);
      this.db.prepare('UPDATE performance_case_items SET reviewer_score=? WHERE case_id=?').run(score, id);
      this.db
        .prepare(
          "UPDATE assessment_tasks SET status='DONE', score=?, comment=?, version=version+1 WHERE case_id=? AND task_type='MANAGER_REVIEW'",
        )
        .run(score, String(input.comment || ''), id);
    }
    let totalScore: number | null = row.total_score === null ? null : Number(row.total_score);
    let grade: string | null = row.grade === null ? null : String(row.grade);
    if (action === 'calculate') {
      const items = this.rows(
        'SELECT weight, COALESCE(reviewer_score, self_score, 0) AS score FROM performance_case_items WHERE case_id=?',
        [id],
      );
      totalScore = round(
        items.reduce((sum, item) => sum + (Number(item.weight) * Number(item.score)) / 100, 0),
      );
      grade =
        totalScore >= 92
          ? 'A'
          : totalScore >= 85
            ? 'B+'
            : totalScore >= 75
              ? 'B'
              : totalScore >= 60
                ? 'C'
                : 'D';
      this.db
        .prepare(
          'UPDATE performance_case_items SET item_score=COALESCE(reviewer_score, self_score, 0) WHERE case_id=?',
        )
        .run(id);
      this.db
        .prepare(
          'INSERT OR REPLACE INTO result_records VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT rank_no FROM result_records WHERE case_id=?), 999), ?)',
        )
        .run(
          `RES-${id}`,
          id,
          String(row.employee_id),
          String(row.period_id),
          totalScore,
          grade,
          id,
          new Date().toISOString(),
        );
    }
    this.db
      .prepare(
        'UPDATE performance_cases SET status=?, total_score=?, grade=?, locked_at=?, version=version+1 WHERE id=?',
      )
      .run(next, totalScore, grade, next === 'LOCKED' ? new Date().toISOString() : null, id);
    if (next === 'LOCKED')
      this.db
        .prepare(
          "UPDATE actual_data SET status='LOCKED', version=version+1 WHERE employee_id=? AND period_id=?",
        )
        .run(String(row.employee_id), String(row.period_id));
    this.audit(
      CURRENT_USER.name,
      `CASE_${action.toUpperCase()}`,
      'performance_case',
      id,
      `${status} -> ${next}`,
    );
    return this.snapshot({ periodId: String(row.period_id) });
  }

  retryJob(id: string) {
    const row = this.db.prepare('SELECT * FROM job_runs WHERE id=?').get(id) as DbRow | undefined;
    if (!row) throw new DomainError('NOT_FOUND', '运行任务不存在', 404);
    this.db
      .prepare(
        "UPDATE job_runs SET status='SUCCEEDED', failed=0, succeeded=processed, detail=detail || '；重试成功' WHERE id=?",
      )
      .run(id);
    this.audit(CURRENT_USER.name, 'RETRY_JOB', 'job_run', id, '人工重试完成');
    return this.snapshot();
  }

  private recordJob(type: string, processed: number, succeeded: number, failed: number, detail: string) {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO job_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        id,
        type,
        failed ? 'PARTIAL' : 'SUCCEEDED',
        CURRENT_USER.name,
        processed,
        succeeded,
        failed,
        detail,
        new Date().toISOString(),
      );
    this.audit(CURRENT_USER.name, type, 'job_run', id, detail);
  }
}
