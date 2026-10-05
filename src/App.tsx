import { useMemo, useState } from 'react';
import { useStore } from './store';
import { calcProject } from './lib/calc';
import { TopBar } from './components/TopBar';
import { PlanView } from './components/PlanView';
import { MatrixView } from './components/MatrixView';
import { CableLibrary, FixtureLibrary } from './components/Library';
import { SettingsView } from './components/SettingsView';
import { IssueDock } from './components/IssueList';
import { OutletModal } from './components/OutletModal';
import { useCloudSync } from './lib/useCloudSync';

type Tab = 'plan' | 'matrix' | 'fixtures' | 'cables' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'matrix', label: 'Tabelle' },
  { id: 'fixtures', label: 'Verbraucher' },
  { id: 'cables', label: 'Kabel' },
  { id: 'settings', label: 'Einstellungen' },
];

export default function App() {
  useCloudSync();
  const project = useStore((s) => s.project);
  const [tab, setTab] = useState<Tab>('plan');
  const result = useMemo(() => calcProject(project), [project]);

  return (
    <div className="app">
      <TopBar result={result} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'plan' && <PlanView result={result} />}
        {tab === 'matrix' && <MatrixView result={result} />}
        {tab === 'fixtures' && <FixtureLibrary result={result} />}
        {tab === 'cables' && <CableLibrary />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <OutletModal />
      {(tab === 'plan' || tab === 'matrix') && <IssueDock issues={result.issues} />}
    </div>
  );
}
