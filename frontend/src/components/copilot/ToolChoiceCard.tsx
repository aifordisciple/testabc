'use client';

import { FlaskConical, Check, Code } from 'lucide-react';

interface Tool {
  tool_id: string;
  tool_name: string;
  workflow_type: string;
  description?: string;
  match_score?: number;
  match_reason?: string;
  params_schema?: any;
  inferred_params?: Record<string, any>;
}

interface ToolChoiceCardProps {
  plan: {
    type: string;
    strategy?: string;
    matched_tools?: Tool[];
  };
  onSelectTool: (tool: Tool) => void;
  onCustomCode?: () => void;
}

export function ToolChoiceCard({ plan, onSelectTool, onCustomCode }: ToolChoiceCardProps) {
  const matchedTools = plan.matched_tools || [];
  const isHighConfidence = plan.type === 'tool_recommendation';

  return (
    <div className="mt-4 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-surface)] to-[var(--bg-muted)] border border-blue-500/30 rounded-2xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white">
              {isHighConfidence ? 'Recommended Tool' : 'Tool Options Available'}
            </h4>
            <p className="text-xs text-blue-400">
              {isHighConfidence ? 'High confidence match found' : 'Select a tool or use custom code'}
            </p>
          </div>
        </div>

        {plan.strategy && (
          <div className="bg-[var(--bg-muted)]/50 rounded-xl p-4 mb-5 border border-[var(--border-subtle)]">
            <div className="flex items-start gap-2">
              <span className="text-lg">💡</span>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed flex-1">{plan.strategy}</p>
            </div>
          </div>
        )}

        <div className="space-y-3 mb-5">
          {matchedTools.map((tool) => {
            const scorePercent = Math.round((tool.match_score || 0) * 100);
            const scoreColor =
              scorePercent >= 75
                ? 'text-emerald-400'
                : scorePercent >= 50
                ? 'text-yellow-400'
                : 'text-[var(--text-muted)]';

            return (
              <div
                key={tool.tool_id}
                className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 hover:bg-blue-500/15 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">🔧</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">{tool.tool_name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{tool.workflow_type}</div>
                    </div>
                  </div>
                  <div className={`text-right ${scoreColor}`}>
                    <div className="text-lg font-bold">{scorePercent}%</div>
                    <div className="text-xs">match</div>
                  </div>
                </div>

                {tool.description && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">{tool.description}</p>
                )}

                {tool.match_reason && (
                  <div className="text-xs text-blue-300 mb-3">
                    <span className="font-medium">Why: </span>
                    {tool.match_reason}
                  </div>
                )}

                {tool.params_schema && Object.keys(tool.params_schema.properties || {}).length > 0 && (
                  <details className="mb-3">
                    <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                      📋 View Parameters Schema ({Object.keys(tool.params_schema.properties || {}).length} params)
                    </summary>
                    <div className="mt-2 bg-[var(--bg-base)] rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      <pre className="text-[var(--text-secondary)]">
                        {JSON.stringify(tool.params_schema, null, 2)}
                      </pre>
                    </div>
                  </details>
                )}

                {tool.inferred_params && Object.keys(tool.inferred_params).length > 0 && (
                  <div className="text-xs text-[var(--text-muted)] mb-3">
                    <span className="font-medium">Suggested params: </span>
                    <span className="text-emerald-400">{JSON.stringify(tool.inferred_params)}</span>
                  </div>
                )}

                <button
                  onClick={() => onSelectTool(tool)}
                  className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 btn-press"
                >
                  <Check className="w-4 h-4" />
                  Use This Tool
                </button>
              </div>
            );
          })}
        </div>

        {!isHighConfidence && onCustomCode && (
          <button
            onClick={onCustomCode}
            className="w-full bg-[var(--bg-muted)] hover:bg-[var(--bg-surface)] text-white px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border border-[var(--border-default)] btn-press"
          >
            <Code className="w-4 h-4" />
            Generate Custom Code Instead
          </button>
        )}
      </div>
    </div>
  );
}
