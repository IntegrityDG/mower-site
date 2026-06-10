import { pathContent } from "@/lib/customer-paths/path-content";
import type { CustomerPath, Region } from "@/lib/customer-paths/types";

import SelectionSummary from "./shared/SelectionSummary";

type CustomerPathStageProps = {
  selectedState: string;
  selectedRegion: Region;
  selectedPath: CustomerPath | "";
};

export default function CustomerPathStage({
  selectedState,
  selectedRegion,
  selectedPath,
}: CustomerPathStageProps) {
  const activePath = selectedPath ? pathContent[selectedPath] : null;

  return (
    <section
      id="selected-path-section"
      className="scroll-mt-6 px-6 py-20 md:px-10"
    >
      <div className="mx-auto max-w-6xl">
        {activePath ? (
          <div className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-xl">
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8 md:p-12">
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                  {activePath.eyebrow}
                </p>

                <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  {activePath.title}
                </h2>

                <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                  {activePath.description}
                </p>

                <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
                  Your selected state, region, and customer path will carry
                  forward into the next stage of the website.
                </div>
              </div>

              <div className="bg-slate-950 p-8 text-white md:p-12">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">
                  Current Selection
                </p>

                <SelectionSummary
                  selectedState={selectedState}
                  selectedRegion={selectedRegion}
                  customerPathName={activePath.eyebrow}
                />

                <button
                  type="button"
                  disabled
                  className="mt-9 w-full cursor-not-allowed rounded-2xl bg-white px-5 py-4 font-bold text-slate-950 opacity-60"
                >
                  Continue — Next Section Coming
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-slate-400 bg-white px-8 py-14 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
              Choose Your Starting Point
            </p>

            <h2 className="mt-3 text-3xl font-black text-slate-950">
              Select your location and preferred path above.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
              The next stage changes depending on whether you want to purchase
              nationwide, request regional IDS services, or receive a guided
              equipment recommendation.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
