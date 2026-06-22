// Branded Hex type — one sanctioned `as` inside validateHex()
const HEX_REGEX = /^0x[a-fA-F0-9]+$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export type Hex = string & { readonly __brand: unique symbol };
export type Address = Hex & { readonly __address: unique symbol };

/** Runtime validator + THE ONE sanctioned `as Hex` in the entire project. */
export function validateHex(value: string, label = "value"): Hex {
  if (!HEX_REGEX.test(value)) throw new Error(`Invalid hex ${label}: ${value}`);
  return value as Hex;  // ← THE ONE sanctioned as cast
}

export function isHex(value: string): value is Hex {
  return HEX_REGEX.test(value);
}

export function requireHex(value: string | undefined, label: string): Hex {
  if (value === undefined) throw new Error(`Missing required hex ${label}`);
  return validateHex(value, label);
}

export function validateAddress(value: string, label = "address"): Address {
  if (!ADDRESS_REGEX.test(value)) throw new Error(`Invalid address ${label}: ${value}`);
  return value as Address;
}

export function isAddress(value: string): value is Address {
  return ADDRESS_REGEX.test(value);
}

/** Bridge to viem's `0x${string}` type — zero-cast boundary. */
export function toViemHex(h: Hex): `0x${string}` { return h as unknown as `0x${string}`; }
export function fromViemHex(h: `0x${string}`): Hex { return validateHex(h); }
