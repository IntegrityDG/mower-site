export async function applyConsistentAdminProfileUpdate<T>(
  routeMemberId: string,
  profileSourceMemberId: unknown,
  profile: unknown,
  update: (memberId: string, value: unknown) => Promise<T>,
) {
  if (profileSourceMemberId !== routeMemberId)
    return { stale: true as const };
  return {
    stale: false as const,
    result: await update(routeMemberId, profile),
  };
}
