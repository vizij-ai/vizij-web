export function getLookup(namespace: string, id: string): string {
  return `${namespace === "default" ? "default." : `${namespace}.`}${id}`;
}

export function getNamespace(lookup: string): string {
  if (lookup.includes(".")) {
    return lookup.split(".")[0];
  } else return "default";
}

export function getId(lookup: string): string {
  if (lookup.includes(".")) {
    return lookup.split(".")[1];
  } else return lookup;
}
