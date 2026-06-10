import type { SetupPreferenceKey } from "@/lib/products/types";

type SetupPreferenceProps = {
  selectedPreference: SetupPreferenceKey | "";
  onSelectPreference: (preference: SetupPreferenceKey) => void;
};

const setupOptions: {
  key: SetupPreferenceKey;
  title: string;
  description: string;
}[] = [
  {
    key: "self-setup",
    title: "Self setup",
    description:
      "Plan to receive the equipment and handle setup directly after delivery.",
  },

  {
    key: "remote-guidance",
    title: "Remote setup guidance",
    description:
      "Request optional remote guidance to help with setup planning after purchase.",
  },

  {
    key: "dealer-provider-help",
    title: "Help locating an authorized dealer or service provider",
    description:
      "Ask for help locating an authorized dealer or service provider near the property, when available.",
  },
];

export default function SetupPreference({
  selectedPreference,
  onSelectPreference,
}: SetupPreferenceProps) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Setup Preference
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Choose your preferred setup path.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        Hands-on IDS installation is limited to the IDS regional service area,
        but nationwide customers can still choose self setup or request remote
        setup guidance.
      </p>

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {setupOptions.map((option) => {
          const isSelected = selectedPreference === option.key;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectPreference(option.key)}
              aria-pressed={isSelected}
              className={`rounded-[2rem] border p-6 text-left transition ${
                isSelected
                  ? "border-emerald-700 bg-emerald-50 shadow-xl"
                  : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
              }`}
            >
              <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                Setup
              </span>

              <h4 className="mt-5 text-xl font-black text-slate-950">
                {option.title}
              </h4>

              <p className="mt-4 leading-7 text-slate-600">
                {option.description}
              </p>

              <p className="mt-6 text-sm font-bold text-emerald-700">
                {isSelected ? "Selected" : "Select this preference"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
