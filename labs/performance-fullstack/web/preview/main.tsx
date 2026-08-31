import React from 'react';
import ReactDOM from 'react-dom/client';
import PerformanceAssessment from '../src/PerformanceAssessment.canvas.tsx';
import PerformanceConfiguration from '../src/PerformanceConfiguration.canvas.tsx';
import PerformanceDataEntry from '../src/PerformanceDataEntry.canvas.tsx';
import PerformanceIndicators from '../src/PerformanceIndicators.canvas.tsx';
import PerformanceOverview from '../src/PerformanceOverview.canvas.tsx';
import PerformancePeople from '../src/PerformancePeople.canvas.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
const pages = {
  overview: PerformanceOverview,
  people: PerformancePeople,
  indicators: PerformanceIndicators,
  configuration: PerformanceConfiguration,
  dataEntry: PerformanceDataEntry,
  assessment: PerformanceAssessment,
};
const pageKey = new URLSearchParams(window.location.search).get('page') || 'overview';
const SelectedPage = pages[pageKey as keyof typeof pages] || PerformanceOverview;
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SelectedPage />
  </React.StrictMode>,
);
