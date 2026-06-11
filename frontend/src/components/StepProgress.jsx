import { FileText, Wand2, Film } from 'lucide-react';

const steps = [
  { id: 1, label: 'Input & Expand', icon: FileText },
  { id: 2, label: 'Generate Media', icon: Wand2 },
  { id: 3, label: 'Preview', icon: Film },
];

export default function StepProgress({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-10">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;

        return (
          <div key={step.id} className="flex items-center gap-2 sm:gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex items-center justify-center w-11 h-11 rounded-2xl border-2 transition-all ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-8 sm:w-16 h-0.5 rounded ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
