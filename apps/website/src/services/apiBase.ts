const ENV_KEY = "VITE_API_URL";

export const getApiBase = (): string | undefined => {
  const value = import.meta.env.VITE_API_URL;
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
