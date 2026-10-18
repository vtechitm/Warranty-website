"use client";

import { cn } from "@/lib/cn";

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

/** Molars are drawn wider than incisors so the chart reads like an arch. */
function width(n: number) {
  const pos = n % 10;
  // Uniform on phones (quadrants are stacked), arch-like proportions from sm up.
  return pos >= 6 ? "w-8 sm:w-10" : pos >= 4 ? "w-8 sm:w-9" : "w-8";
}

function Tooth({ n, selected, onToggle, readOnly, accent }: { n: number; selected: boolean; onToggle?: (n: number) => void; readOnly?: boolean; accent: string }) {
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onToggle?.(n)}
      aria-pressed={selected}
      aria-label={`Răng ${n}`}
      className={cn(
        "flex h-11 shrink-0 items-center justify-center rounded-[10px] border text-[11px] font-bold transition sm:h-12 sm:text-xs",
        width(n),
        selected ? "border-transparent text-white shadow-md" : "border-line bg-white text-slate-500",
        !readOnly && !selected && "hover:border-navy-700 hover:text-navy-900 active:scale-95",
        readOnly && "cursor-default",
      )}
      style={selected ? { background: accent } : undefined}
    >
      {n}
    </button>
  );
}

function Row({ left, right, labels, ...p }: { left: number[]; right: number[]; labels: [string, string]; selected: Set<number>; onToggle?: (n: number) => void; readOnly?: boolean; accent: string }) {
  const quad = (teeth: number[], label: string) => (
    <div>
      <div className="mb-0.5 text-center text-[10px] text-muted sm:hidden">{label}</div>
      <div className="flex justify-center gap-0.5 sm:gap-1">{teeth.map((n) => <Tooth key={n} n={n} selected={p.selected.has(n)} onToggle={p.onToggle} readOnly={p.readOnly} accent={p.accent} />)}</div>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-0">
      {quad(left, labels[0])}
      <div className="hidden w-px self-stretch bg-line sm:mx-1.5 sm:block" />
      {quad(right, labels[1])}
    </div>
  );
}

/** FDI tooth chart. Interactive for labs, read-only for the passport. */
export function ToothChart({
  selected,
  onToggle,
  readOnly,
  showPrimary,
  accent = "#0B1F3A",
}: {
  selected: number[];
  onToggle?: (n: number) => void;
  readOnly?: boolean;
  showPrimary?: boolean;
  accent?: string;
}) {
  const set = new Set(selected);
  const props = { selected: set, onToggle, readOnly, accent };
  return (
    <div className="overflow-x-auto">
      <div className="mx-auto space-y-1.5 py-1 sm:w-max">
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Hàm trên<span className="hidden sm:inline"> · Phải ⟷ Trái</span></div>
        <Row left={UPPER_RIGHT} right={UPPER_LEFT} labels={["Trên phải (1x)", "Trên trái (2x)"]} {...props} />
        {showPrimary && <Row left={PRIMARY_UPPER.slice(0, 5)} right={PRIMARY_UPPER.slice(5)} labels={["Sữa trên phải", "Sữa trên trái"]} {...props} />}
        <div className="mx-auto h-px w-2/3 bg-line" />
        {showPrimary && <Row left={PRIMARY_LOWER.slice(0, 5)} right={PRIMARY_LOWER.slice(5)} labels={["Sữa dưới phải", "Sữa dưới trái"]} {...props} />}
        <Row left={LOWER_RIGHT} right={LOWER_LEFT} labels={["Dưới phải (4x)", "Dưới trái (3x)"]} {...props} />
        <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Hàm dưới</div>
      </div>
    </div>
  );
}

export const QUICK_SELECTIONS: { label: string; teeth: number[] }[] = [
  { label: "4 răng cửa trên", teeth: [12, 11, 21, 22] },
  { label: "6 răng trước trên", teeth: [13, 12, 11, 21, 22, 23] },
  { label: "4 răng cửa dưới", teeth: [42, 41, 31, 32] },
  { label: "6 răng trước dưới", teeth: [43, 42, 41, 31, 32, 33] },
];
