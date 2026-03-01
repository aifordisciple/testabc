'use client';

import { Play, CheckCircle } from 'lucide-react';

interface PlanCardProps {
  planDataStr: string;
  onConfirm: (planDataStr: string) => void;
}

export function PlanCard({ planDataStr, onConfirm }: PlanCardProps) {
  let plan;
  try {
    plan = JSON.parse(planDataStr);
  } catch {
    return null;
  }

  const planType = plan.type || 'single';
  const isMultiStep = planType === 'multi';

  return (
    <div className="mt-4 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-surface)] to-[var(--bg-muted)] border border-emerald-500/30 rounded-2xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-white">
              {isMultiStep ? `Multi-Step Analysis (${plan.steps?.length || 0} Steps)` : 'Analysis Strategy'}
            </h4>
            <p className="text-xs text-emerald-400">Review and confirm to execute</p>
          </div>
        </div>

        <div className="bg-[var(--bg-muted)]/50 rounded-xl p-4 mb-5 border border-[var(--border-subtle)]">
          <div className="flex items-start gap-2">
            <span className="text-lg">💡</span>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed flex-1">{plan.strategy}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onConfirm(planDataStr)}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 btn-press"
          >
            <Play className="w-5 h-5" />
            {isMultiStep ? 'Execute Task Chain' : 'Execute Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}
