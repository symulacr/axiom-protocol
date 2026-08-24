// Narrow ambient types for the Bun APIs we call, avoiding a @types/bun dependency in the frozen-deps tree.
declare namespace Bun {
  export interface BunFile {
    readonly size: number;
    exists(): Promise<boolean>;
    text(): Promise<string>;
  }
  export function file(path: string): BunFile;
  export function write(
    path: string,
    data: string | Uint8Array,
  ): Promise<number>;
}
