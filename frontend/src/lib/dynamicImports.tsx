import dynamic from 'next/dynamic';

export const DynamicMonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[200px] bg-[var(--bg-muted)] rounded-lg animate-pulse" />
    ),
  }
);

export const DynamicCopilotPanel = dynamic(
  () => import('@/components/CopilotPanel').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <CopilotPanelSkeleton />,
  }
);

export const DynamicWorkflowEditorModal = dynamic(
  () => import('@/components/WorkflowEditorModal').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <WorkflowEditorSkeleton />,
  }
);

function CopilotPanelSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] animate-pulse">
      <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-muted)]" />
          <div className="w-24 h-4 rounded bg-[var(--bg-muted)]" />
        </div>
        <div className="flex gap-2">
          <div className="w-16 h-6 rounded bg-[var(--bg-muted)]" />
          <div className="w-16 h-6 rounded bg-[var(--bg-muted)]" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            <div className={`rounded-xl p-3 ${i % 2 === 0 ? 'bg-[var(--bg-muted)]' : 'bg-[var(--bg-surface)]'} w-3/4`}>
              <div className="h-3 bg-[var(--bg-muted)] rounded w-full mb-2" />
              <div className="h-3 bg-[var(--bg-muted)] rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <div className="h-10 bg-[var(--bg-muted)] rounded-lg" />
      </div>
    </div>
  );
}

function WorkflowEditorSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] animate-pulse">
      <div className="flex-1 flex">
        <div className="flex-1 p-4">
          <div className="h-full bg-[var(--bg-muted)] rounded-lg" />
        </div>
        <div className="w-80 border-l border-[var(--border-subtle)] p-4">
          <div className="h-6 bg-[var(--bg-muted)] rounded w-1/2 mb-4" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-[var(--bg-muted)] rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { CopilotPanelSkeleton, WorkflowEditorSkeleton };
