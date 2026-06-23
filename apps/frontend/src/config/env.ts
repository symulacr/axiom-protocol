// Axiom Protocol — environment configuration.
//
// Shared across all frontend modules. Import from here instead of
// re-declaring `import.meta.env.VITE_BACKEND_URL` in each file.

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';
