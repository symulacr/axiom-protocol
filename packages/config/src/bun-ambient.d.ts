// Narrow ambient types for the Bun APIs we call, avoiding a @types/bun dependency in the frozen-deps tree (mirrors apps/backend/src/bun-ambient.d.ts).
declare namespace Bun {
  export function write(
    path: string,
    data: string | Uint8Array,
  ): Promise<number>;
}
