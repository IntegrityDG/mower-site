"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
type DateProps = {
  value: string;
  dateOnly?: boolean;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
};

export function formatLocalizedDate(
  { value, dateOnly, locale, options }: DateProps,
  server = false,
) {
  const date = new Date(dateOnly ? `${value}T12:00:00${server ? "Z" : ""}` : value);
  return date.toLocaleDateString(server ? locale ?? "en-US" : locale, {
    ...options,
    ...(server ? { timeZone: "UTC" } : {}),
  });
}

/** Stable initial HTML, followed by the existing visitor-local date display. */
export default function LocalizedDate(props: DateProps) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatLocalizedDate(props),
    () => formatLocalizedDate(props, true),
  );
  return <time dateTime={props.value}>{text}</time>;
}
