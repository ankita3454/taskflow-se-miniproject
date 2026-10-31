export const THEME_STORAGE_KEY = "taskflow.theme";

export function readTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    // Appearance must not prevent using the app when browser storage is blocked.
    return "light";
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Switching still works for this visit; persistence is best-effort.
  }
}
