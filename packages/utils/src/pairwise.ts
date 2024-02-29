/*
@description
This function returns an array of tuples, where each tuple contains two adjacent elements from the input array.
@param arr - the array to be paired
@return - the array of tuples, containing n-1 items, where n is the length of the original array
*/
export function pairwise<T>(arr: T[]): [T, T][] {
  return arr.slice(1).map((_, i) => [arr[i], arr[i + 1]]);
}
