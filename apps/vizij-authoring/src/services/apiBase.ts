const ENV_KEY = "VITE_API_URL";
const DEFAULT_API_BASE =
  "https://us-central1-semio-vizij.cloudfunctions.net/api";

export const getApiBase = (): string | undefined => {
  const value = import.meta.env.VITE_API_URL;
  if (typeof value !== "string") {
    return DEFAULT_API_BASE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_API_BASE;
};

export const requireApiBase = (): string => {
  const base = getApiBase();
  if (!base) {
    throw new Error(
      `Missing ${ENV_KEY} environment variable. Please set ${ENV_KEY} in your app environment to the base URL of the Vizij API.`,
    );
  }
  return base;
};
