import { useState } from "react";
import type { YarboPackageGroup, YarboPackageGroupKey } from "@/lib/catalog/yarbo";

export default function YarboPackageGroupSelector({ groups, selectedGroup, onSelectGroup }: {
  groups: YarboPackageGroup[];
  selectedGroup: YarboPackageGroupKey | undefined;
  onSelectGroup: (group: YarboPackageGroupKey) => void;
}) {
  const [attentionActive, setAttentionActive] = useState(true);

  return (
    <div className="mt-6 rounded-2xl border-2 border-orange-300 bg-orange-50/70 p-4 sm:p-5">
      <h5 className="text-lg font-black uppercase tracking-wide text-slate-950">
        Choose a package type
      </h5>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
        More Yarbo packages are available — select a category below.
      </p>
      <div role="group" aria-label="Yarbo package type" className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {groups.map((group) => {
          const selected = selectedGroup === group.key;
          return (
            <button
              key={group.key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setAttentionActive(false);
                onSelectGroup(group.key);
              }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setAttentionActive(false);
              }}
              className={`min-h-24 w-full min-w-0 rounded-2xl border-2 px-5 py-4 text-left transition-colors focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${
                selected
                  ? "border-slate-950 bg-slate-950 text-white shadow-md"
                  : "border-orange-600 bg-white text-slate-950 shadow-[0_0_0_3px_rgba(234,88,12,0.12)] hover:border-orange-700 hover:bg-orange-50"
              } ${attentionActive && !selected ? "yarbo-package-type-attention" : ""}`}
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-lg font-black">{group.label}</span>
                {group.key === "core-utility" && (
                  <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-orange-900">
                    More options
                  </span>
                )}
              </span>
              <span className={`mt-2 block text-sm font-bold ${selected ? "text-slate-200" : "text-slate-700"}`}>
                {selected ? "Selected" : "View packages →"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
