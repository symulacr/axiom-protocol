// Minimal ambient types for the Bun APIs used in this package's source.
// Bun 1.4.0 canary — intentionally narrow (only what we call) to avoid
// dependency on @types/bun in the frozen-deps tree.
declare namespace Bun {
	export interface BunFile {
		readonly size: number;
		exists(): Promise<boolean>;
		text(): Promise<string>;
	}
	export function file(path: string): BunFile;
	export function write(path: string, data: string | Uint8Array): Promise<number>;
}
