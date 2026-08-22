export function browserGeolocationErrorMessage(code: number) {
  if (code === 1)
    return "Location permission is blocked or denied. Enable location permission for this site, or use ZIP or business location.";
  if (code === 2)
    return "Your device or browser could not determine your location. Use ZIP or business location instead.";
  if (code === 3)
    return "Locating your device timed out. Try again, or use ZIP or business location.";
  return "Your location could not be determined. Try again, or use ZIP or business location.";
}
