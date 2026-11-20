import Link from "next/link";

const linkClass = "rounded-sm font-semibold text-emerald-800 underline decoration-emerald-600 underline-offset-4 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800";

export default function HomepageExplore() {
  return (
    <section className="border-b border-emerald-900/10 bg-white px-5 py-10 sm:px-8 sm:py-14" aria-labelledby="homepage-mower-heading">
      <div className="mx-auto grid max-w-7xl gap-7 lg:grid-cols-[minmax(0,4fr)_minmax(0,3fr)] lg:gap-16">
        <div>
          <h1 id="homepage-mower-heading" className="max-w-2xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Robotic Mower Sales &amp; Regional Service
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-700">
            Based in Southeast Missouri, Integrity Distribution Systems sells robotic mowers nationwide. Demos, installation, setup and hands-on service are regional only. Check availability for your address. Remote Support is available nationwide to eligible customers.
          </p>
          <p className="mt-4 max-w-xl leading-7 text-slate-700">
            <Link href="/equipment" className={linkClass} prefetch={false}>Browse robotic mower equipment</Link>, including <Link href="/equipment/yarbo" className={linkClass} prefetch={false}>Yarbo</Link> and <Link href="/equipment/lymow-one-plus" className={linkClass} prefetch={false}>Lymow One Plus</Link>.
          </p>
        </div>
        <div className="grid content-start gap-4 text-sm leading-7 text-slate-700 sm:text-base">
          <p>
            <Link href="/robot-mowers" className={linkClass} prefetch={false}>Robotic mowers by property type</Link>
            {" · "}<Link href="/commercial-robot-mowers" className={linkClass} prefetch={false}>Commercial robotic mowing guide</Link>
            {" · "}<Link href="/robot-mower-guides" className={linkClass} prefetch={false}>Mower comparisons and planning guides</Link>
          </p>
          <p>
            <Link href="/service" className={linkClass} prefetch={false}>Service and repair options</Link>
            {" · "}<Link href="/reviews" className={linkClass} prefetch={false}>Customer reviews</Link>
            {" · "}<Link href="/ids-in-action" className={linkClass} prefetch={false}>See IDS in action</Link>
          </p>
          <div>
            <h2 className="font-extrabold text-slate-950">Regional coverage guides</h2>
            <p className="mt-1">
              <Link href="/robot-mowers/missouri" className={linkClass} prefetch={false}>Missouri</Link>
              {" · "}<Link href="/robot-mowers/southern-illinois" className={linkClass} prefetch={false}>Southern Illinois</Link>
              {" · "}<Link href="/robot-mowers/northeast-arkansas" className={linkClass} prefetch={false}>Northeast Arkansas</Link>
              {" · "}<Link href="/robot-mowers/western-kentucky" className={linkClass} prefetch={false}>Western Kentucky</Link>
              {" · "}<Link href="/robot-mowers/western-tennessee" className={linkClass} prefetch={false}>Western Tennessee</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
