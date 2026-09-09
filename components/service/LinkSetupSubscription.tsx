"use client";
import { Field, formValues, serviceButton, serviceFetch, useServiceTask } from "./ui";
export default function LinkSetupSubscription({ token }: { token: string }) {
  const task = useServiceTask();
  return <form className="space-y-4 rounded-xl border p-4" onSubmit={event => { const data = formValues(event); void task.run(async () => {
    const address = new URL(String(data.get("installationLink")));
    const match = address.pathname.match(/^\/professional-installation\/([0-9a-f-]{36})\/?$/i);
    if (address.origin !== window.location.origin || !match) throw new Error("Use your private IDS Installation / Setup link from this website.");
    const result = await serviceFetch<{ eligible: boolean }>(`/api/remote-support/manage/${encodeURIComponent(token)}`, { action: "link_installation", installationToken: match[1] });
    if (!result.eligible) throw new Error("Your request is linked. The discount becomes available only while your website subscription is active and paid.");
  }, "Your Installation / Setup request is linked to your active subscription. IDS applies eligibility under the separate Setup terms."); }}><h2 className="text-xl font-bold">Link an Installation / Setup request</h2><p className="text-sm leading-6">If you have a private Installation / Setup link, connect it to this subscription so IDS can verify the eligible Setup discount. This does not change the separate Installation or Setup prices or payment policy.</p><Field name="installationLink" label="Your private Installation / Setup link" type="url" required />{task.status}<button className={serviceButton} disabled={task.busy}>Link my request</button></form>;
}
