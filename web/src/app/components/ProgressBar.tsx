"use client";

interface ProgressBarProps {
  progress: number;
  visible: boolean;
}

export default function ProgressBar({ progress, visible }: ProgressBarProps) {
  if (!visible) return null;

  return (
    <div className="mb-4 w-full h-[3px] bg-neutral-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-black rounded-full transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
