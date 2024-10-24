export function overlappingSegments(original: [number, number][]): [number, number][] {
  const output: [number, number][] = [];
  original
    .toSorted((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
    .forEach(([start, end]) => {
      const lastIndex = output.length - 1;
      if (output.length > 0 && output[lastIndex][1] >= start) {
        output[lastIndex][1] = Math.max(output[lastIndex][1], end);
      } else {
        output.push([start, end]);
      }
    });

  return output;
}
