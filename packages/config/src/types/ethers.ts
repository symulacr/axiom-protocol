import { keccak256 as ethersKeccak, computeAddress as ethersCompute, hexlify as ethersHexlify } from "ethers";
import type { BytesLike } from "ethers";
import { validateHex, validateAddress, type Address, type Hex } from "./hex.js";

export function keccak256(data: BytesLike): Hex {
  return validateHex(ethersKeccak(data), "keccak256");
}

export function computeAddress(pubKey: string): Address {
  return validateAddress(ethersCompute(pubKey), "computeAddress");
}

export function hexlify(data: BytesLike): Hex {
  return validateHex(ethersHexlify(data), "hexlify");
}
