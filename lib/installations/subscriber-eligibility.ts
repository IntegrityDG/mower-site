import "server-only";

/**
 * The sole runtime source of Remote Support discount eligibility for this job.
 * Remote Support has not launched, so every job is currently ineligible.
 * The upcoming subscription feature must resolve the job's verified customer
 * against the website's own active Remote Support subscriptions here. Missing
 * or unverifiable subscriptions must fail closed. Never use browser claims,
 * a manual flag, or an environment override as evidence of a subscription.
 */
export async function getRemoteSupportEligibility(installationId: string): Promise<boolean> {
  // Keep the server-resolved job identity as the future provider's lookup input.
  void installationId;
  return false;
}
