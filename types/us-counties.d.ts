declare module "@nickgraffis/us-counties" {
  export const statesdata: [string, string][];
  export const countiesdata: [string, { n: string; s: string; c?: string }][];
}
