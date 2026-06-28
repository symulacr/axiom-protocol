// @fix F2-A1: Remove — zero imports across entire codebase
// @audit-ref: V1-A5 confirmed dead (no barrel re-exports, no dynamic imports, no test references)

import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactElement } from 'react';
import { Input } from './ui.js';

/** Monospace input for hex data (addresses, keys, hashes). */
export const MonoInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function MonoInput(
  { style, ...rest },
  ref,
): ReactElement {
  return (
    <Input
      ref={ref}
      {...rest}
      style={{
        fontFamily: 'var(--font-mono)',
        ...style,
      }}
    />
  );
});
