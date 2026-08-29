import React from 'react';
import { Empty } from 'antd';
import { TaskCard } from './TaskCard.jsx';

export function BoardColumn({ definition, tasks, selectedId, busyTaskId, actions }) {
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
