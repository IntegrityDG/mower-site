type SelectionSummaryProps = {
  selectedState: string;
  selectedRegion: string;
  customerPathName: string;
};

export default function SelectionSummary({
  selectedState,
  selectedRegion,
  customerPathName,
}: SelectionSummaryProps) {
  return (
    <div className="mt-7 space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          State
        </p>

        <p className="mt-1 text-xl font-black">{selectedState}</p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          Region
        </p>

        <p className="mt-1 text-xl font-black">{selectedRegion}</p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          Customer Path
        </p>

        <p className="mt-1 text-xl font-black">{customerPathName}</p>
      </div>
    </div>
  );
}
