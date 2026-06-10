"use client";

import { pathCardsByKey, pathLabels } from "@/lib/customer-paths/path-content";
import {
  getRegionOptionsForState,
  isLocalServiceEligible,
} from "@/lib/customer-paths/service-eligibility";
import type {
  CustomerPath,
  PathCard,
  Region,
} from "@/lib/customer-paths/types";

type LocationPathSelectorProps = {
  selectedState: string;
  selectedRegion: Region;
  selectedPath: CustomerPath | "";
  onStateChange: (state: string) => void;
  onRegionChange: (region: Region) => void;
  onPathSelect: (path: CustomerPath) => void;
};

const states = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

export default function LocationPathSelector({
  selectedState,
  selectedRegion,
  selectedPath,
  onStateChange,
  onRegionChange,
  onPathSelect,
}: LocationPathSelectorProps) {
  const locationComplete = Boolean(selectedState && selectedRegion);

  const localServiceEligible = isLocalServiceEligible(
    selectedState,
    selectedRegion
  );

  const availableRegions = selectedState
    ? getRegionOptionsForState(selectedState)
    : [];

  const pathCards: PathCard[] = [
    pathCardsByKey.nationwide,

    ...(localServiceEligible
      ? [pathCardsByKey["local-services"]]
      : []),

    pathCardsByKey.recommendation,
  ];

  return (
    <section
      id="choose-path"
      className="border-y border-slate-300 bg-slate-100 px-6 py-20 md:px-10"
    >
      <div className="mx-auto max-w-7xl">
        {/* LOCATION HEADING */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
            Start Here
          </p>

          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Where is your property located?
          </h2>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            Your location helps determine which purchasing, installation,
            setup, and support options are available.
          </p>
        </div>

        {/* LOCATION SELECTION */}
        <div className="mx-auto mt-12 max-w-4xl rounded-[2rem] border border-slate-300 bg-white p-6 shadow-lg md:p-10">
          <div>
            <label
              htmlFor="property-state"
              className="text-base font-bold text-slate-950"
            >
              Select your state
            </label>

            <select
              id="property-state"
              value={selectedState}
              onChange={(event) => onStateChange(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Choose a state</option>

              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-8">
            <p className="text-base font-bold text-slate-950">
              Which region of the state is the property located in?
            </p>

            {selectedState ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {availableRegions.map((region) => {
                  const isSelected = selectedRegion === region;

                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => onRegionChange(region)}
                      aria-pressed={isSelected}
                      className={`rounded-2xl border px-4 py-4 text-sm font-bold transition ${
                        isSelected
                          ? "border-emerald-700 bg-emerald-700 text-white shadow-md"
                          : "border-slate-300 bg-slate-50 text-slate-700 hover:border-emerald-500 hover:bg-white"
                      }`}
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Select your state before choosing a region.
              </p>
            )}
          </div>
        </div>

        {/* CUSTOMER PATH OPTIONS */}
        {locationComplete && (
          <div className="mt-14">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Choose Your Path
              </p>

              <h3 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                How would you like to continue?
              </h3>

              <p className="mt-4 text-base leading-7 text-slate-600">
                The options below are based on the location you selected.
              </p>

              <p className="mt-3 text-base font-bold text-slate-900">
                Select one of the options below to continue.
              </p>
            </div>

            {/* SERVICE ELIGIBILITY NOTICE */}
            {localServiceEligible ? (
              <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-5 text-sm leading-7 text-emerald-950">
                <p className="font-bold">
                  Your property is located within the IDS hands-on service
                  region.
                </p>

                <p className="mt-2">
                  Nationwide purchasing, guided product selection, professional
                  setup, installation, and ongoing local support options are
                  available.
                </p>
              </div>
            ) : (
              <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-amber-300 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-950">
                <p className="font-bold">
                  Hands-on IDS services are not currently available in your
                  selected region.
                </p>

                <p className="mt-2">
                  You may still purchase equipment nationwide and request
                  remote setup guidance. We can also help locate an authorized
                  dealer or service provider near you when one is available.
                </p>
              </div>
            )}

            {/* PATH CARDS */}
            <div
              className={`mx-auto mt-8 grid max-w-6xl gap-6 ${
                localServiceEligible
                  ? "lg:grid-cols-3"
                  : "md:grid-cols-2"
              }`}
            >
              {pathCards.map((path) => {
                const isSelected = selectedPath === path.key;

                return (
                  <button
                    key={path.key}
                    type="button"
                    onClick={() => onPathSelect(path.key)}
                    aria-pressed={isSelected}
                    className={`group rounded-[2rem] border p-7 text-left transition ${
                      isSelected
                        ? "border-emerald-700 bg-emerald-50 shadow-xl"
                        : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
                    }`}
                  >
                    <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                      {path.badge}
                    </span>

                    <h4 className="mt-5 text-2xl font-black text-slate-950">
                      {path.title}
                    </h4>

                    <p className="mt-4 leading-7 text-slate-600">
                      {path.description}
                    </p>

                    <div className="mt-7 flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-700">
                        {isSelected ? "Selected" : "Select this path"}
                      </span>

                      <span
                        aria-hidden="true"
                        className="text-xl text-emerald-700 transition group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* PATH CONFIRMATION */}
            {selectedPath && (
              <div className="mx-auto mt-8 max-w-4xl rounded-2xl bg-slate-950 px-6 py-5 text-center text-white shadow-lg">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Selected Path
                </p>

                <p className="mt-2 text-lg font-bold">
                  {pathLabels[selectedPath]}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
