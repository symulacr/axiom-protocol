// Branded Hex type — one sanctioned `as` inside validateHex()
const HEX_REGEX = /^0x[a-fA-F0-9]+$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export type Hex = string & { readonly __brand: unique symbol };
export type Address = Hex & { readonly __address: unique symbol };

/** Runtime validator + THE ONE sanctioned `as Hex` in the entire project. */
export function validateHex(value: string, label = "value"): Hex {
  if (!HEX_REGEX.test(value)) throw new Error(`Invalid hex ${label}: ${value}`);
  return value as Hex;
}

export function validateAddress(value: string, label = "address"): Address {
  if (!ADDRESS_REGEX.test(value)) throw new Error(`Invalid address ${label}: ${value}`);
  return value as Address;
}

/** Bridge to viem's `0x${string}` type — zero-cast boundary. */
export function toViemHex(h: Hex): `0x${string}` { return h as unknown as `0x${string}`; }
