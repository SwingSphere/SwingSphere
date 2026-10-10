import React from 'react';
import { AlertTriangle, Check, ChevronRight, Circle, HelpCircle, Sparkles } from 'lucide-react';
import type { StepperStep, StepperStepStatus } from './types';

interface BuildingInspectorStepperProps {
  steps: StepperStep[];
}

const STATUS_ICONS: Record<StepperStepStatus, React.ReactNode> = {
  complete: <Check className="h-3 w-3 text-emerald-400" />,
  warning: <AlertTriangle className="h-3 w-3 text-amber-400" />,
  info: <Sparkles className="h-3 w-3 text-sky-400" />,
  ready: <Check className="h-3 w-3 text-emerald-300 animate-pulse" />,
  blocked: <Circle className="h-2.5 w-2.5 text-zinc-500" />,
  pending: <Circle className="h-2.5 w-2.5 text-zinc-600" />,
};

const STATUS_CLASSES: Record<StepperStepStatus, string> = {
  complete: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  ready: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100 shadow-[0_0_12px_rgba(55,217,122,0.25)]',
  blocked: 'border-white/5 bg-white/[0.02] text-zinc-500',
  pending: 'border-white/5 bg-white/[0.02] text-zinc-500',
};

export const BuildingInspectorStepper: React.FC<BuildingInspectorStepperProps> = ({ steps }) => {
  return (
    <nav aria-label="Workflow Stepper" className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const icon = STATUS_ICONS[step.status];
        const statusClass = STATUS_CLASSES[step.status];

        return (
          <React.Fragment key={step.id}>
            <div
              className={`group relative flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${statusClass}`}
              title={step.detail ?? step.label}
            >
              <span className="flex shrink-0 items-center justify-center">
                {icon}
              </span>
              <span className="truncate max-w-[120px] font-medium">
                {step.shortLabel}
              </span>

              {/* Tooltip on hover */}
              {step.detail && (
                <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#0a0b0f] px-2 py-1 text-[10px] text-zinc-300 shadow-xl opacity-0 transition-opacity group-hover:opacity-100">
                  {step.detail}
                </div>
              )}
            </div>

            {!isLast && (
              <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default BuildingInspectorStepper;
