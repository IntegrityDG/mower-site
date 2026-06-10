import type { Region } from "./types";

const defaultRegions: Region[] = [
  "Northern",
  "Central",
  "Southern",
  "Eastern",
  "Western",
];

const regionOptionsByState: Record<string, Region[]> = {
  Missouri: [
    "Northern Missouri",
    "Central Missouri",
    "Southern Missouri — East",
    "Southern Missouri — West",
  ],

  Arkansas: [
    "Northern Arkansas — East",
    "Northern Arkansas — West",
    "Central Arkansas",
    "Southern Arkansas",
  ],

  Kentucky: [
    "Western Kentucky",
    "Central Kentucky",
    "Eastern Kentucky",
  ],

  Tennessee: [
    "Western Tennessee",
    "Middle Tennessee",
    "Eastern Tennessee",
  ],

  Illinois: [
    "Northern Illinois",
    "Central Illinois",
    "Southern Illinois",
  ],
};

const eligibleLocations: Record<string, Region[]> = {
  Missouri: [
    "Southern Missouri — East",
    "Southern Missouri — West",
  ],

  Arkansas: [
    "Northern Arkansas — East",
    "Northern Arkansas — West",
  ],

  Kentucky: ["Western Kentucky"],

  Tennessee: ["Western Tennessee"],

  Illinois: ["Southern Illinois"],
};

export function getRegionOptionsForState(state: string) {
  return regionOptionsByState[state] ?? defaultRegions;
}

export function isLocalServiceEligible(state: string, region: Region) {
  return eligibleLocations[state]?.includes(region) ?? false;
}
