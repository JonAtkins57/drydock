import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface WorkflowState {
  id: string;
  stateKey: string;
  displayName: string;
  sortOrder: number;
  isInitial: boolean;
  isTerminal: boolean;
}

interface WorkflowTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  transitionKey: string;
  displayName: string;
}

interface WorkflowDefinition {
  id: string;
  entityType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

const ENTITY_TYPES = ['lead', 'opportunity', 'customer', 'vendor', 'project', 'journal_entry'];

export default function Workflows() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadWorkflows();
  }, [user, navigate]);

  const loadWorkflows = async () => {
    const results: WorkflowDefinition[] = [];
    for (const et of ENTITY_TYPES) {
      try {
        const wf = await api<WorkflowDefinition>(`/workflows/${et}`);
        results.push(wf);
      } catch {
        // Entity type may not have a workflow — skip
      }
    }
    setWorkflows(results);
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">Workflows</h1>
          <p className="text-drydock-text-dim text-sm mt-1">{workflows.length} workflow definitions</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-drydock-card border border-drydock-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12 text-drydock-steel">No workflows configured</div>
        ) : (
          <div className="space-y-4">
            {workflows.map((wf) => (
              <div key={wf.id} className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === wf.id ? null : wf.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-drydock-bg/30 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium text-drydock-text">{wf.name}</span>
                    <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-drydock-accent/10 text-drydock-accent border border-drydock-accent/20">
                      {wf.entityType}
                    </span>
                    {wf.description && (
                      <p className="text-xs text-drydock-steel mt-1">{wf.description}</p>
                    )}
                  </div>
                  <span className="text-drydock-steel text-sm">{expanded === wf.id ? '-' : '+'}</span>
                </button>

                {expanded === wf.id && (
                  <div className="px-5 pb-5 border-t border-drydock-border">
                    {/* State flow visualization */}
                    <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                      {[...wf.states]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((state, idx, arr) => (
                          <div key={state.id} className="flex items-center gap-2 shrink-0">
                            <div
                              className={`px-4 py-2 rounded-lg border text-sm ${
                                state.isInitial
                                  ? 'bg-blue-900/30 border-blue-700/50 text-blue-300'
                                  : state.isTerminal
                                    ? 'bg-green-900/30 border-green-700/50 text-green-300'
                                    : 'bg-drydock-bg border-drydock-border text-drydock-text-dim'
                              }`}
                            >
                              <div className="font-medium">{state.displayName}</div>
                              <div className="text-[10px] mt-0.5 opacity-60">{state.stateKey}</div>
                            </div>
                            {idx < arr.length - 1 && (
                              <svg className="w-6 h-6 text-drydock-steel shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14m-7-7 7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Transitions table */}
                    {wf.transitions.length > 0 && (
                      <div className="mt-4">
                        <h3 className="text-xs text-drydock-steel uppercase tracking-wider mb-2">Transitions</h3>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {wf.transitions.map((t) => {
                            const fromState = wf.states.find((s) => s.id === t.fromStateId);
                            const toState = wf.states.find((s) => s.id === t.toStateId);
                            return (
                              <div key={t.id} className="bg-drydock-bg rounded px-3 py-2 border border-drydock-border/50">
                                <span className="text-drydock-text-dim">{fromState?.displayName ?? '?'}</span>
                                <span className="text-drydock-steel mx-1">&rarr;</span>
                                <span className="text-drydock-text">{toState?.displayName ?? '?'}</span>
                                <span className="block text-drydock-accent mt-0.5">{t.displayName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
