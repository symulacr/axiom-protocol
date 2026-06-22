import { Contract, type ContractRunner } from "ethers";

/**
 * TypedContract — ONE `as unknown as T` in constructor, zero per-method casts.
 * T is an interface of method name → signature, e.g. `{ balanceOf: (user: string) => Promise<bigint> }`
 */
export class TypedContract<T> {
  /** The typed proxy — access methods directly: `contract.balanceOf(addr)` */
  readonly contract: T;
  /** Raw ethers Contract for advanced use (event parsing, interface). */
  readonly raw: Contract;

  constructor(address: string, abi: string[] | readonly string[], runner: ContractRunner | null) {
    this.raw = new Contract(address, abi, runner);
    this.contract = this.raw as unknown as T; // ← THE ONE sanctioned as for contracts
  }

  get iface() { return this.raw.interface; }
}
