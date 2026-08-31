import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from '../src/PerformanceDashboard.canvas.tsx';
import MasterData from '../src/PerformanceMasterData.canvas.tsx';
import IndicatorLibrary from '../src/PerformanceIndicatorLibrary.canvas.tsx';
import IndicatorDelivery from '../src/PerformanceIndicatorDelivery.canvas.tsx';
import PersonalConfig from '../src/PerformancePersonalConfig.canvas.tsx';
import MyIndicators from '../src/PerformanceMyIndicators.canvas.tsx';
import MyDataEntry from '../src/PerformanceMyDataEntry.canvas.tsx';
import DataEntryAdmin from '../src/PerformanceDataEntryAdmin.canvas.tsx';
import MyTasks from '../src/PerformanceMyTasks.canvas.tsx';
import CaseManagement from '../src/PerformanceCaseManagement.canvas.tsx';
import PeriodOperations from '../src/PerformancePeriodOperations.canvas.tsx';
import Results from '../src/PerformanceResults.canvas.tsx';
import Audit from '../src/PerformanceAudit.canvas.tsx';

const pages = {
  dashboard: Dashboard,
  masterData: MasterData,
  indicatorLibrary: IndicatorLibrary,
  indicatorDelivery: IndicatorDelivery,
  personalConfig: PersonalConfig,
  myIndicators: MyIndicators,
  myDataEntry: MyDataEntry,
  dataEntryAdmin: DataEntryAdmin,
  myTasks: MyTasks,
  caseManagement: CaseManagement,
  periodOperations: PeriodOperations,
  results: Results,
  audit: Audit,
};
const key = new URLSearchParams(window.location.search).get('page') || 'dashboard';
const Selected = pages[key as keyof typeof pages] || Dashboard;
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Selected />
  </React.StrictMode>,
);
