import type { DemoEquipmentInterest, DemoSource } from "./types";

export type DemoRequestFingerprintInput = {
  name: string;
  email: string;
  phone: string;
  propertyAddress: string;
  requestedStartAt: string;
  source: DemoSource;
  equipmentInterest: DemoEquipmentInterest;
};

const trim = (value: string) => value.trim();

export function demoRequestFingerprint(input: DemoRequestFingerprintInput) {
  return JSON.stringify({
    name: trim(input.name),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
    propertyAddress: trim(input.propertyAddress),
    requestedStartAt: trim(input.requestedStartAt),
    source: input.source,
    equipmentInterest: input.equipmentInterest,
  });
}
