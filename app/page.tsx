"use client";

import { FormEvent, useMemo, useState } from "react";

type InterestOption =
  | "Quote"
  | "Product recommendation"
  | "Install"
  | "Setup"
  | "Service / repair"
  | "Property management solution";

type TerrainOption =
  | "Mostly flat"
  | "Moderate slopes"
  | "Steep slopes"
  | "Rough / uneven ground"
  | "Obstacles / trees / landscaping"
  | "Open wide area";

type PriorityOption =
  | "Lowest maintenance"
  | "Best cut quality"
  | "Handles slopes well"
  | "Commercial durability"
  | "Quiet operation"
  | "Saves labor time"
  | "Modern curb appeal";

type ProductOption =
  | "Luba 3 AWD"
  | "Lymow One Plus"
  | "Yarbo Modular System"
  | "PandaG G1 Commercial"
  | "Not sure / need recommendation";

const interestOptions: InterestOption[] = [
  "Quote",
  "Product recommendation",
  "Install",
  "Setup",
  "Service / repair",
  "Property management solution",
];

const terrainOptions: TerrainOption[] = [
  "Mostly flat",
  "Moderate slopes",
  "Steep slopes",
  "Rough / uneven ground",
  "Obstacles / trees / landscaping",
  "Open wide area",
];

const priorityOptions: PriorityOption[] = [
  "Lowest maintenance",
  "Best cut quality",
  "Handles slopes well",
  "Commercial durability",
  "Quiet operation",
  "Saves labor time",
  "Modern curb appeal",
];

const productOptions: ProductOption[] = [
  "Luba 3 AWD",
  "Lymow One Plus",
  "Yarbo Modular System",
  "PandaG G1 Commercial",
  "Not sure / need recommendation",
];

function toggleArrayValue<T extends string>(
  value: T,
  setter: React.Dispatch<React.SetStateAction<T[]>>
) {
  setter((prev) =>
    prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
  );
}

type RecommendationInput = {
  propertyType: string;
  propertySize: string;
  terrain: string[];
  obstacleLevel: string;
  fenceRow: string;
  priorities: string[];
  productInterest: string[];
  purchaseType: string;
};

function getRecommendations(data: RecommendationInput) {
  const scores = {
    luba: 0,
    lymow: 0,
    yarbo: 0,
    pandag: 0,
  };

  // 1. PROPERTY TYPE
  // User said ALL for all four, so give all a neutral baseline.
  scores.luba += 1;
  scores.lymow += 1;
  scores.yarbo += 1;
  scores.pandag += 1;

  // 2. PROPERTY SIZE
  if (data.propertySize === "Under 1 acre") {
    scores.luba += 2;
    scores.lymow += 3;
    scores.yarbo += 1;
  }

  if (data.propertySize === "1–3 acres") {
    scores.luba += 3;
    scores.lymow += 3;
    scores.yarbo += 2;
  }

  if (data.propertySize === "3–5 acres") {
    scores.luba += 3;
    scores.lymow += 3;
    scores.yarbo += 2;
  }

  if (data.propertySize === "5–10 acres") {
    scores.yarbo += 3;
    scores.luba += 1;
  }

  if (data.propertySize === "10+ acres") {
    scores.pandag += 3;
    scores.yarbo += 2;
  }

  // 3. TERRAIN
  if (data.terrain.includes("Open wide area")) {
    scores.luba += 3;
  }

  if (data.terrain.includes("Steep slopes")) {
    scores.luba += 3;
  }

  if (data.terrain.includes("Moderate slopes")) {
    scores.luba += 3;
  }

  if (data.terrain.includes("Mostly flat")) {
    scores.luba += 3;
  }

  // Lymow = ALL
  if (data.terrain.length > 0) {
    scores.lymow += 1;
    scores.yarbo += 1;
    scores.pandag += 1;
  }

  // 4. OBSTACLES TO WEEDEAT AROUND
  if (data.obstacleLevel === "Couple") {
    scores.luba += 3;
    scores.lymow += 3;
    scores.yarbo += 3;
    scores.pandag += 3;
  }

  if (data.obstacleLevel === "Few") {
    scores.luba += 3;
    scores.lymow += 3;
    scores.yarbo += 3;
    scores.pandag += 3;
  }

  if (data.obstacleLevel === "Many") {
    scores.yarbo += 3;
    scores.pandag += 3;
  }

  // 5. FENCE ROW
  if (data.fenceRow === "No") {
    scores.luba += 3;
    scores.lymow += 3;
  }

  if (data.fenceRow === "Yes") {
    scores.yarbo += 3;
    scores.pandag += 3;
  }

  // 6. PRIORITIES (best to worst per user)
  data.priorities.forEach((priority) => {
    switch (priority) {
      case "Lowest maintenance":
        scores.lymow += 3;
        scores.luba += 2;
        scores.yarbo += 1;
        break;

      case "Best cut quality":
        scores.luba += 3;
        scores.yarbo += 2;
        scores.lymow += 1;
        break;

      case "Handles slopes well":
        scores.pandag += 3;
        scores.lymow += 2;
        scores.yarbo += 1;
        break;

      case "Commercial durability":
        scores.pandag += 3;
        scores.yarbo += 2;
        scores.lymow += 1;
        scores.luba += 0;
        break;

      case "Quiet operation":
        scores.luba += 3;
        scores.lymow += 2;
        scores.yarbo += 1;
        break;

      case "Saves labor time":
        scores.yarbo += 3;
        scores.pandag += 2;
        scores.lymow += 1;
        break;

      case "Modern curb appeal":
        scores.yarbo += 3;
        scores.luba += 2;
        scores.lymow += 1;
        break;
    }
  });

  // 7. PRODUCT INTEREST (minor influence)
  data.productInterest.forEach((product) => {
    if (product === "Luba 3 AWD") scores.luba += 1;
    if (product === "Lymow One Plus") scores.lymow += 1;
    if (product === "Yarbo Modular System") scores.yarbo += 1;
    if (product === "PandaG G1 Commercial") scores.pandag += 1;
  });

  // 8. PURCHASE VS FINANCE = no scoring influence

  const machineNames = {
    luba: "Luba 3 AWD",
    lymow: "Lymow One Plus",
    yarbo: "Yarbo Modular System",
    pandag: "PandaG G1 Commercial",
  } as const;

  const ranked = (Object.entries(scores) as Array<
    [keyof typeof scores, number]
  >).sort((a, b) => b[1] - a[1]);

  const topFit = machineNames[ranked[0][0]];
  const secondFit = machineNames[ranked[1][0]];
  const thirdFit = machineNames[ranked[2][0]];

  const why: string[] = [];

  if (data.propertySize) why.push(`property size: ${data.propertySize}`);
  if (data.obstacleLevel) why.push(`obstacle level: ${data.obstacleLevel}`);
  if (data.fenceRow) why.push(`fence row: ${data.fenceRow}`);
  if (data.terrain.length) why.push(`terrain: ${data.terrain.join(", ")}`);
  if (data.priorities.length) why.push(`priorities: ${data.priorities.join(", ")}`);

  const salesNote =
    data.purchaseType === "Finance"
      ? "This lead is likely worth a financing conversation early."
      : data.purchaseType === "Purchase"
      ? "This lead is likely worth a direct purchase pricing conversation early."
      : "";

  return {
    topFit,
    secondFit,
    thirdFit,
    scores,
    why,
    salesNote,
  };
}

export default function Page() {
  const services = [
    {
      title: "Sales",
      desc: "We help match the right robotic mower to the property, layout, budget, and long-term goals.",
    },
    {
      title: "Install & Setup",
      desc: "Professional property mapping, boundary setup, app configuration, and first-run dialing so the system starts right.",
    },
    {
      title: "Service & Support",
      desc: "Ongoing troubleshooting, adjustments, seasonal support, and real help when something needs attention.",
    },
    {
      title: "Property Management",
      desc: "Scalable autonomous mowing solutions for residential, commercial, development, and larger managed properties.",
    },
  ];

  const benefits = [
    "Cleaner, more consistent cuts",
    "Lower labor demand",
    "Reduced fuel and routine mowing costs",
    "Quiet operation",
    "Modern curb appeal",
    "Smarter long-term property management",
  ];

  const markets = [
    "Residential Properties",
    "Subdivisions & Developments",
    "Commercial Properties",
    "Large Estates",
    "Property Managers",
    "Specialty Sites",
  ];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    "Call" | "Text" | "Email" | ""
  >("");

  const [propertyType, setPropertyType] = useState<
    | "Residential"
    | "Commercial"
    | "Subdivision / HOA"
    | "Large Estate"
    | "Development / Builder"
    | "Other"
    | ""
  >("");

  const [interests, setInterests] = useState<InterestOption[]>([]);
  const [propertySize, setPropertySize] = useState<
    "Under 1 acre" | "1–3 acres" | "3–5 acres" | "5–10 acres" | "10+ acres" | ""
  >("");
  const [terrain, setTerrain] = useState<TerrainOption[]>([]);
  const [obstacleLevel, setObstacleLevel] = useState<"Couple" | "Few" | "Many" | "">("");
  const [fenceRow, setFenceRow] = useState<"Yes" | "No" | "">("");
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [productInterest, setProductInterest] = useState<ProductOption[]>([]);
  const [purchaseType, setPurchaseType] = useState<"Purchase" | "Finance" | "">("");
  const [extraNotes, setExtraNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const recommendation = useMemo(() => {
    return getRecommendations({
      propertyType,
      propertySize,
      terrain,
      obstacleLevel,
      fenceRow,
      priorities,
      productInterest,
      purchaseType,
    });
  }, [
    propertyType,
    propertySize,
    terrain,
    obstacleLevel,
    fenceRow,
    priorities,
    productInterest,
    purchaseType,
  ]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          phone,
          email,
          preferredContactMethod,
          propertyType,
          interests,
          propertySize,
          terrain,
          obstacleLevel,
          fenceRow,
          priorities,
          productInterest,
          purchaseType,
          extraNotes,
          autoSuggestion: [
            recommendation.topFit,
            recommendation.secondFit,
            recommendation.thirdFit,
          ],
        }),
      });

      const text = await res.text();
      let data: { error?: string; success?: boolean } = {};

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned invalid response: ${text.slice(0, 140)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to send request.");
      }

      setMessage("Quote request sent successfully.");
      setName("");
      setPhone("");
      setEmail("");
      setPreferredContactMethod("");
      setPropertyType("");
      setInterests([]);
      setPropertySize("");
      setTerrain([]);
      setObstacleLevel("");
      setFenceRow("");
      setPriorities([]);
      setProductInterest([]);
      setPurchaseType("");
      setExtraNotes("");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Something went wrong.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Integrity Distribution Systems Logo"
              className="h-24 md:h-40 w-auto object-contain"
            />
            <div>
              <p className="text-xl font-black tracking-tight text-slate-900">
                Integrity Distribution Systems
              </p>
              <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">
                Autonomous Lawn Care Solutions
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            <a
              href="#services"
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Services
            </a>
            <a
              href="#brands"
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Brands
            </a>
            <a
              href="#benefits"
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Benefits
            </a>
            <a
              href="#contact"
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Contact
            </a>
          </nav>

          <a
            href="#contact"
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:scale-[1.02]"
          >
            Request Info
          </a>
        </div>
      </header>

      <section id="services" className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
            What we do
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
            We don’t just sell robotic mowers. We guide you step by step to taking back your time and reducing your costs.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            A mower in a box is not a solution. The solution is proper planning,
            correct setup, real support, and knowing what system actually fits
            the property.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {services.map((service) => (
            <div
              key={service.title}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <h3 className="text-xl font-bold">{service.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {service.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="brands" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
              Equipment Options
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              The right system depends on the property.
            </h2>
            <p className="mt-5 text-lg text-slate-600">
              Not all robotic mowers are built for the same job. We help match
              the right equipment based on property type, terrain, and
              performance expectations.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Residential Solutions
              </p>
              <h3 className="mt-3 text-2xl font-black">
                Designed for homeowners and private properties
              </h3>
              <p className="mt-4 text-slate-600">
                Ideal for residential lawns, estates, and properties where
                consistent appearance and low maintenance effort are the priority.
              </p>

              <div className="mt-6 space-y-3 text-lg font-semibold text-slate-900">
                <p>Luba 3 AWD</p>
                <p>Lymow One Plus</p>
                <p>Yarbo Modular System</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Commercial Solutions
              </p>
              <h3 className="mt-3 text-2xl font-black">
                Built for larger properties and higher demand use
              </h3>
              <p className="mt-4 text-slate-600">
                Designed for commercial sites, developments, and larger-scale
                mowing where durability, coverage, and scalability matter.
              </p>

              <div className="mt-6 space-y-3 text-lg font-semibold text-slate-900">
                <p>Yarbo Modular System</p>
                <p>PandaG G1 Commercial</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="benefits" className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
              Why property owners are paying attention
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              Better consistency, less hassle, and a cleaner long-term approach.
            </h2>
            <p className="mt-5 text-lg text-slate-600">
              Autonomous mowing is not just a gadget. When it is matched and set
              up correctly, it becomes a practical upgrade in how a property is
              maintained and presented.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div
                key={benefit}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-base font-semibold">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="grid gap-8 rounded-[2rem] bg-slate-100 px-8 py-10 md:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
              Request information
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              Give us real answers and we’ll stop guessing.
            </h2>
            <p className="mt-5 max-w-3xl text-lg text-slate-600">
              This form is designed to narrow down fit fast, not waste your time with
              vague yard descriptions and bad assumptions.
            </p>

            <div className="mt-8 rounded-[1.5rem] bg-slate-950 p-6 text-white shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">
                Auto suggestion
              </p>
              <p className="mt-3 text-lg font-semibold">
                Top Fit: {recommendation.topFit}
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Also Consider: {recommendation.secondFit}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Third Option: {recommendation.thirdFit}
              </p>

              <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm">
                <p className="font-semibold text-white">Why:</p>
                {recommendation.why.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-slate-300">
                    {recommendation.why.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-slate-400">
                    Fill out more of the form and the recommendation will tighten up.
                  </p>
                )}
              </div>

              {recommendation.salesNote && (
                <p className="mt-4 text-sm text-amber-300">{recommendation.salesNote}</p>
              )}
            </div>

            <div className="mt-6 space-y-2 text-base text-slate-700">
              <p>
                <span className="font-bold text-slate-900">Company:</span>{" "}
                Integrity Distribution Systems
              </p>
              <p>
                <span className="font-bold text-slate-900">Service Area:</span>{" "}
                Southeast Missouri Region
              </p>
              <p>
                <span className="font-bold text-slate-900">Phone:</span>{" "}
                (573) 971-7197
              </p>
              <p>
                <span className="font-bold text-slate-900">Email:</span>{" "}
                IntegrityDistributionSystems@gmail.com
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-white p-6 shadow-sm">
            <form className="space-y-8" onSubmit={handleSubmit}>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Contact Information</h3>
                <div className="mt-4 grid gap-4">
                  <input
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none placeholder:text-slate-400"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none placeholder:text-slate-400"
                    placeholder="Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <input
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none placeholder:text-slate-400"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Preferred contact method
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3 text-sm text-slate-700">
                      {["Call", "Text", "Email"].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="preferredContactMethod"
                            value={option}
                            checked={preferredContactMethod === option}
                            onChange={(e) =>
                              setPreferredContactMethod(
                                e.target.value as "Call" | "Text" | "Email"
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Property Details</h3>
                <div className="mt-4 space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">Property type</p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {[
                        "Residential",
                        "Commercial",
                        "Subdivision / HOA",
                        "Large Estate",
                        "Development / Builder",
                        "Other",
                      ].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="propertyType"
                            value={option}
                            checked={propertyType === option}
                            onChange={(e) =>
                              setPropertyType(
                                e.target.value as
                                  | "Residential"
                                  | "Commercial"
                                  | "Subdivision / HOA"
                                  | "Large Estate"
                                  | "Development / Builder"
                                  | "Other"
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      What are you interested in? (check all that apply)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {interestOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={interests.includes(option)}
                            onChange={() => toggleArrayValue(option, setInterests)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Approximate property size
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {[
                        "Under 1 acre",
                        "1–3 acres",
                        "3–5 acres",
                        "5–10 acres",
                        "10+ acres",
                      ].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="propertySize"
                            value={option}
                            checked={propertySize === option}
                            onChange={(e) =>
                              setPropertySize(
                                e.target.value as
                                  | "Under 1 acre"
                                  | "1–3 acres"
                                  | "3–5 acres"
                                  | "5–10 acres"
                                  | "10+ acres"
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Site Conditions</h3>
                <div className="mt-4 space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Terrain (check all that apply)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {terrainOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={terrain.includes(option)}
                            onChange={() => toggleArrayValue(option, setTerrain)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Obstacles to weed eat around
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3 text-sm text-slate-700">
                      {["Couple", "Few", "Many"].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="obstacleLevel"
                            value={option}
                            checked={obstacleLevel === option}
                            onChange={(e) =>
                              setObstacleLevel(
                                e.target.value as "Couple" | "Few" | "Many"
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Fence row to weed eat along?
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {["Yes", "No"].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="fenceRow"
                            value={option}
                            checked={fenceRow === option}
                            onChange={(e) =>
                              setFenceRow(e.target.value as "Yes" | "No")
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Product Fit</h3>
                <div className="mt-4 space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Priorities (check all that apply)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {priorityOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={priorities.includes(option)}
                            onChange={() => toggleArrayValue(option, setPriorities)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Product interest (check all that apply)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {productOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={productInterest.includes(option)}
                            onChange={() => toggleArrayValue(option, setProductInterest)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      Looking to purchase or finance?
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                      {["Purchase", "Finance"].map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="purchaseType"
                            value={option}
                            checked={purchaseType === option}
                            onChange={(e) =>
                              setPurchaseType(
                                e.target.value as "Purchase" | "Finance"
                              )
                            }
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Additional Notes</h3>
                <textarea
                  className="mt-4 h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none placeholder:text-slate-400"
                  placeholder="Anything else we should know?"
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                />
              </div>

              {message && (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {message}
                </p>
              )}

              {errorMessage && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Sending..." : "Send Request"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-slate-600 md:flex-row md:items-center md:justify-between md:px-10">
          <div>
            <p className="text-base font-black text-slate-900">
              Integrity Distribution Systems
            </p>
            <p>Advanced autonomous lawn care solutions for modern properties.</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <span>Sales</span>
            <span>Install</span>
            <span>Setup</span>
            <span>Service</span>
            <span>Property Management</span>
          </div>
        </div>
      </footer>
    </div>
  );
}