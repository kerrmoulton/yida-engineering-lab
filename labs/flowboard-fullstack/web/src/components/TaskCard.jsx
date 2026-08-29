import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { ArrowLeft, ArrowRight, Trash2, UserRound } from 'lucide-react';

const PRIORITY_LABELS = { low: '低', medium: '中', high: '高' };
const PRIORITY_COLORS = { low: 'default', medium: 'gold', high: 'red' };
const STATUS_ORDER = ['backlog', 'in_progress', 'done'];

export function TaskCard({ task, selected, busy, onSelect, onMove, onDelete }) {
  const statusIndex = STATUS_ORDER.indexOf(task.status);
  return (
    <article
      className={`flow-task ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(task.id)}
      data-task-id={task.id}
    >
      <div className="flow-task-heading">
        <Tag color={PRIORITY_COLORS[task.priority]}>{PRIORITY_LABELS[task.priority]}优先级</Tag>
        <Button
          type="text"
          danger
          size="small"
          icon={<Trash2 size={15} />}
          loading={busy}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
          aria-label="删除任务"
        />
      </div>
      <strong>{task.title}</strong>
      <p>{task.description || '未填写任务说明'}</p>
      <div className="flow-task-footer">
        <span className="flow-assignee">
          <UserRound size={14} />
          {task.assignee || '未分配'}
        </span>
        <div className="flow-task-actions">
          <Tooltip title="移到上一状态">
            <Button
              type="text"
              size="small"
              icon={<ArrowLeft size={15} />}
              disabled={busy || statusIndex === 0}
              onClick={(event) => {
                event.stopPropagation();
                onMove(task.id, STATUS_ORDER[statusIndex - 1]);
              }}
              aria-label="移到上一状态"
            />
          </Tooltip>
          <Tooltip title="移到下一状态">
            <Button
              type="text"
              size="small"
              icon={<ArrowRight size={15} />}
              disabled={busy || statusIndex === STATUS_ORDER.length - 1}
              onClick={(event) => {
                event.stopPropagation();
                onMove(task.id, STATUS_ORDER[statusIndex + 1]);
              }}
              aria-label="移到下一状态"
            />
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
