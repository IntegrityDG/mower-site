import type {
  ProductConfigurationSelection,
  ProductOption,
  ProductOptionConfiguration,
  ProductOptionGroup,
  ProductOptionId,
} from "@/lib/products/types";

type ProductConfigurationProps = {
  productName: string;
  configuration: ProductOptionConfiguration;
  selection: ProductConfigurationSelection;
  onSelectConfiguration: (optionId: ProductOptionId) => void;
  onSelectSingleOption: (
    optionIds: ProductOptionId[],
    optionId: ProductOptionId
  ) => void;
  onToggleOption: (optionId: ProductOptionId) => void;
};

function statusLabel(group: ProductOptionGroup, option: ProductOption) {
  if (option.status === "included") return "Included";
  if (option.status === "coming-soon") return "Coming Soon";
  if (group.required) return "Required";
  return "Optional";
}

function optionIsSelected(
  group: ProductOptionGroup,
  option: ProductOption,
  selection: ProductConfigurationSelection
) {
  if (option.status === "included") {
    return selection.includedOptionIds.includes(option.id);
  }

  if (group.type === "required-single") {
    return selection.selectedConfigurationId === option.id;
  }

  return selection.selectedOptionIds.includes(option.id);
}

function groupStyle(group: ProductOptionGroup) {
  if (group.type === "included") {
    return "border-emerald-200 bg-emerald-50";
  }

  if (group.type === "coming-soon") {
    return "border-dashed border-slate-300 bg-slate-50";
  }

  return "border-slate-300 bg-white";
}

function groupBadgeLabel(group: ProductOptionGroup) {
  if (group.type === "included") return "Included";
  if (group.type === "coming-soon") return "Coming Soon";
  if (group.type === "multi-select") return "Optional Multi Select";
  if (group.type === "single-select") return "Optional Single Select";
  return "Required";
}

export default function ProductConfiguration({
  productName,
  configuration,
  selection,
  onSelectConfiguration,
  onSelectSingleOption,
  onToggleOption,
}: ProductConfigurationProps) {
  const groups: ProductOptionGroup[] = [
    ...configuration.requiredGroups,
    ...configuration.optionalGroups,
    ...configuration.includedEquipment,
    ...configuration.comingSoonGroups,
  ];

  function handleOptionClick(group: ProductOptionGroup, option: ProductOption) {
    if (option.status === "included" || option.status === "coming-soon") {
      return;
    }

    if (group.type === "required-single") {
      onSelectConfiguration(option.id);
      return;
    }

    if (group.type === "single-select") {
      onSelectSingleOption(
        group.options.map((groupOption) => groupOption.id),
        option.id
      );
      return;
    }

    if (group.type === "multi-select") {
      onToggleOption(option.id);
    }
  }

  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
        Product Configuration
      </p>

      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
        Configure {productName}.
      </h3>

      <p className="mt-4 max-w-3xl leading-7 text-slate-600">
        {configuration.intro}
      </p>

      <div className="mt-7 space-y-6">
        {groups.map((group) => (
          <div
            key={group.id}
            className={`rounded-[2rem] border p-5 md:p-6 ${groupStyle(group)}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  {group.required ? "Required Selection" : group.title}
                </p>

                <h4 className="mt-2 text-xl font-black text-slate-950">
                  {group.title}
                </h4>

                <p className="mt-3 leading-7 text-slate-600">
                  {group.description}
                </p>
              </div>

              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${
                  group.type === "coming-soon"
                    ? "bg-slate-300 text-slate-700"
                    : group.required
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-950 text-white"
                }`}
              >
                {groupBadgeLabel(group)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {group.options.map((option) => {
                const isSelected = optionIsSelected(group, option, selection);
                const isDisabled =
                  option.status === "included" ||
                  option.status === "coming-soon";

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleOptionClick(group, option)}
                    aria-pressed={isSelected}
                    disabled={isDisabled}
                    className={`rounded-2xl border p-5 text-left transition ${
                      isSelected
                        ? "border-emerald-700 bg-white shadow-lg"
                        : option.status === "coming-soon"
                          ? "border-dashed border-slate-300 bg-white text-slate-500"
                          : "border-slate-300 bg-white hover:-translate-y-1 hover:border-emerald-500 hover:shadow-lg"
                    } ${isDisabled ? "cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${
                        isSelected
                          ? "bg-emerald-700 text-white"
                          : option.status === "coming-soon"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-slate-950 text-white"
                      }`}
                    >
                      {statusLabel(group, option)}
                    </span>

                    <h5 className="mt-4 text-lg font-black text-slate-950">
                      {option.label}
                    </h5>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {option.description}
                    </p>

                    <p className="mt-5 text-sm font-bold text-emerald-700">
                      {isSelected
                        ? option.status === "included"
                          ? "Included in configured package"
                          : "Selected"
                        : option.status === "coming-soon"
                          ? "Not selectable yet"
                          : "Select option"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
