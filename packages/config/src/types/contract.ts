import { Contract, type ContractRunner } from "ethers";

export class TypedContract<T> {
  readonly contract: T;
  readonly raw: Contract;

  constructor(
    address: string,
    abi: string[] | readonly string[],
    runner: ContractRunner | null,
  ) {
    this.raw = new Contract(address, abi, runner);
    this.contract = this.raw as unknown as T; // the one sanctioned `as` cast in this codebase — typed contract access
  }

  get iface() {
    return this.raw.interface;
  }
}

export type AgentNFTMethods = {
  intelligentDatasOf(
    tokenId: bigint,
  ): Promise<{ dataDescription: string; dataHash: string }[]>;
  creatorOf(tokenId: bigint): Promise<string>;
};
