export type NotificationShippingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

export function shippingAddressLines(address: NotificationShippingAddress | null) {
  if (!address) return ["SHIPPING ADDRESS", "Not supplied"];
  const region = [clean(address.state), clean(address.postal_code)].filter(Boolean).join(" ");
  const locality = [clean(address.city), region || null].filter(Boolean).join(", ");
  const lines = [clean(address.line1), clean(address.line2), locality || null, clean(address.country)]
    .filter((line): line is string => Boolean(line));
  return ["SHIPPING ADDRESS", ...(lines.length ? lines : ["Not supplied"])];
}
