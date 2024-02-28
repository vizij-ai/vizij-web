export function pairwise<T>(arr: T[]): [T, T][] {
  return arr.slice(1).map((_, i) => [arr[i], arr[i + 1]]);
}