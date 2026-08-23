export function normalizeRequestedBrandName(input: unknown) {
  if (typeof input !== "string") return null;
  const requestedName = input.trim().replace(/\s+/g, " ");
  if (
    requestedName.length < 2 ||
    requestedName.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(requestedName) ||
    !/[\p{L}\p{N}]/u.test(requestedName)
  )
    return null;
  return {
    requestedName,
    normalizedName: requestedName.toLocaleLowerCase("en-US"),
  };
}
