# Thinking State

A minimal shimmering label that signals the agent is processing before it answers.

- Category: Thinking & Reasoning
- Source: AICSS (https://www.aicss.dev/components/thinking-state)
- Author: @kvnkld (https://x.com/kvnkld)
- Styling: Self-contained CSS with CSS custom properties (design tokens). Theme-aware via [data-theme] (light/dark).

## Instructions

Add this component to the project. Keep the styling self-contained. Map the design tokens (CSS custom properties) to the project's theme if they are not already defined.

## Code

### React - `ThinkingState.tsx`

```tsx
"use client";

import styles from "./ThinkingState.module.css";

export function ThinkingState() {
  return <span className={styles.shimmer}>Thinking</span>;
}

```

### React - `ThinkingState.module.css`

```css
.shimmer {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(
    90deg,
    #a1a1a1 0%, #a1a1a1 30%,
    rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%,
    #a1a1a1 70%, #a1a1a1 100%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: label-shine 2.25s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
}
@keyframes label-shine {
  0%, 18% { background-position: 100% 0; }
  82%, 100% { background-position: 0% 0; }
}
@media (prefers-color-scheme: dark) {
  .shimmer { background: linear-gradient(90deg, #a1a1a1 0%, #a1a1a1 30%, rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%, #a1a1a1 70%, #a1a1a1 100%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; }
}

```

### Vue - `ThinkingState.vue`

```vue
<template>
  <span class="shimmer">Thinking</span>
</template>

<style scoped>
.shimmer {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(
    90deg,
    #a1a1a1 0%, #a1a1a1 30%,
    rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%,
    #a1a1a1 70%, #a1a1a1 100%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: label-shine 2.25s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
}
@keyframes label-shine {
  0%, 18% { background-position: 100% 0; }
  82%, 100% { background-position: 0% 0; }
}
@media (prefers-color-scheme: dark) {
  .shimmer { background: linear-gradient(90deg, #a1a1a1 0%, #a1a1a1 30%, rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%, #a1a1a1 70%, #a1a1a1 100%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; }
}
</style>
```

### Svelte - `ThinkingState.svelte`

```svelte
<span class="shimmer">Thinking</span>

<style>
.shimmer {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(
    90deg,
    #a1a1a1 0%, #a1a1a1 30%,
    rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%,
    #a1a1a1 70%, #a1a1a1 100%
  );
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: label-shine 2.25s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
}
@keyframes label-shine {
  0%, 18% { background-position: 100% 0; }
  82%, 100% { background-position: 0% 0; }
}
@media (prefers-color-scheme: dark) {
  .shimmer { background: linear-gradient(90deg, #a1a1a1 0%, #a1a1a1 30%, rgba(161, 161, 161, 0.45) 45%, rgba(161, 161, 161, 0.45) 55%, #a1a1a1 70%, #a1a1a1 100%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; }
}
</style>
```
