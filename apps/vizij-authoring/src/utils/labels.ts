/**
 * Shortens a label if it repeats group context.
 * Useful for displaying property names within a group without redundant prefixing.
 */
export const cleanLabel = (label: string, groupLabel: string): string => {
  if (groupLabel === "Unassigned") return label;

  const groupWords = groupLabel.toLowerCase().split(/[_\s]+/);
  const labelWords = label.toLowerCase().split(/[_\s]+/);

  let matchCount = 0;
  for (let i = 0; i < Math.min(groupWords.length, labelWords.length); i++) {
    if (
      groupWords[i] === labelWords[i] ||
      (groupWords[i].length > 2 && labelWords[i].startsWith(groupWords[i])) ||
      (labelWords[i].length > 2 && groupWords[i].startsWith(labelWords[i]))
    ) {
      matchCount++;
    } else {
      break;
    }
  }

  if (matchCount > 0) {
    const originalWords = label.split(/[\s_]+/);
    const remaining = originalWords.slice(matchCount);
    if (remaining.length > 0) return remaining.join(" ");
  }

  return label;
};
