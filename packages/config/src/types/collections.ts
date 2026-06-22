/** Branded NonEmptyArray — compile-time proof of ≥1 element. */
export type NonEmptyArray<T> = [T, ...T[]];

export function isNonEmpty<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

/** Safe first/last — returns undefined when empty. */
export function first<T>(arr: T[]): T | undefined { return arr[0]; }
export function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }

/** Safe checked access — THE ONE sanctioned `!` in the entire project.
 *  Throws RangeError if index is out of bounds. */
export function checkedAt<T>(arr: NonEmptyArray<T> | T[], index: number): T {
  if (index < 0 || index >= arr.length) throw new RangeError(`Index ${index} out of bounds for array length ${arr.length}`);
  return arr[index]!;  // ← THE ONE sanctioned non-null assertion
}
