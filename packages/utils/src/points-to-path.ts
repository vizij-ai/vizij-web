export function pointsToPath(points: [number, number][], close?: boolean): string {
  if (close) {
    return [
      points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toString()} ${p[1].toString()}`)
        .join(" "),
      " Z",
    ].join(" ") as string;
  } else {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toString()} ${p[1].toString()}`)
      .join(" ") as string;
  }
}
