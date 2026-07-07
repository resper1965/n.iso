import React, { useState } from 'react';
import ReadinessDashboard from './components/ReadinessDashboard';
import SoAEditor from './components/SoAEditor';
import AuditPortalView from './components/AuditPortalView';
import ComplianceChat from './components/ComplianceChat';
import StakeholderChat from './components/StakeholderChat';

type ViewMode = 'Dashboard' | 'SoA' | 'Audit' | 'Discovery' | 'Interview';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('Dashboard');

  const NavItem = ({ mode, label, icon }: { mode: ViewMode, label: string, icon: string }) => (
    <button 
      onClick={() => setCurrentView(mode)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
        currentView === mode 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Sidebar Corporativa */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 p-6 flex flex-col">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold">n</div>
          <span className="text-2xl font-black tracking-tighter">nISO Portal</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem mode="Dashboard" label="Readiness Dashboard" icon="📊" />
          <NavItem mode="SoA" label="Statement of Applicability" icon="📜" />
          <NavItem mode="Discovery" label="Data Assessment" icon="🔍" />
          <NavItem mode="Interview" label="Stakeholder Interviews" icon="🎙️" />
          <div className="pt-4 mt-4 border-t border-slate-800">
             <NavItem mode="Audit" label="Audit Portal" icon="🕵️‍♂️" />
          </div>
        </nav>

        <div className="mt-auto bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500"></div>
             <div>
                <p className="text-xs font-bold">ness. labs</p>
                <p className="text-[10px] text-slate-500 uppercase">Organization</p>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {currentView === 'Dashboard' && <ReadinessDashboard />}
        {currentView === 'SoA' && <SoAEditor />}
        {currentView === 'Audit' && <AuditPortalView />}
        {currentView === 'Interview' && <StakeholderChat stakeholderRole="RH & Gestão de Pessoas" />}
        {currentView === 'Discovery' && (
          <div className="p-20 text-center">
            <h1 className="text-4xl font-bold mb-4">Data Assessment Engine</h1>
            <p className="text-slate-400">Phase 0: Intelligent Discovery in progress...</p>
          </div>
        )}
      </main>

      {/* Agente de Conformidade (Coluna Direita) */}
      <ComplianceChat />
    </div>
  );
}

export default App;
