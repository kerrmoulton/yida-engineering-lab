import React from 'react';
import { Empty } from 'antd';
import type { Task, TaskStatus } from '../../../shared/task-contract.ts';
import { TaskCard } from './TaskCard.tsx';

interface BoardColumnProps {
  definition: { key: TaskStatus; label: string };
  tasks: Task[];
  selectedId: string | null;
  busyTaskId: string | null;
  actions: {
    select: (id: string) => void;
    move: (id: string, status: TaskStatus) => void;
    remove: (id: string) => void;
  };
}

export function BoardColumn({ definition, tasks, selectedId, busyTaskId, actions }: BoardColumnProps) {
  return (
    <section className="flow-column" data-status={definition.key}>
      <header className="flow-column-heading">
        <span className="flow-column-dot" />
        <strong>{definition.label}</strong>
        <span>{tasks.length}</span>
      </header>
      <div className="flow-task-list">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              busy={busyTaskId === task.id}
              onSelect={actions.select}
              onMove={actions.move}
              onDelete={actions.remove}
            />
          ))
        ) : (
          <div className="flow-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前状态没有任务" />
          </div>
        )}
      </div>
    </section>
  );
}
