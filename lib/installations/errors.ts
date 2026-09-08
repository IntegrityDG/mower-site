export function installationReadError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const notInitialized = ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code);
  return {
    status: 503,
    body: {
      code: notInitialized ? "installation_not_initialized" : "installation_unavailable",
      error: notInitialized
        ? "Installation records are not initialized. Database setup requires IDS approval."
        : "Installation records could not be loaded. Please try again; this is not an empty record list.",
    },
  };
}
