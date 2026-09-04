# Streaming Text

Typewriter-style streaming text with a blinking caret.

- Category: Text Outputs
- Source: AICSS (https://www.aicss.dev/components/streaming-text)
- Author: @kvnkld (https://x.com/kvnkld)
- Styling: Self-contained CSS with CSS custom properties (design tokens). Theme-aware via [data-theme] (light/dark).

## Instructions

Add this component to the project. Keep the styling self-contained. Map the design tokens (CSS custom properties) to the project's theme if they are not already defined.

## Code

### React - `StreamingText.tsx`

```tsx
"use client";

import styles from "./StreamingText.module.css";
import { useEffect, useState } from "react";

export function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 9);
    return () => clearInterval(id);
  }, [text]);
  const streaming = shown.length < text.length;
  return (
    <p className={styles.prose}>
      {shown}
      <span className={streaming ? styles.caret + " " + styles.caretSteady : styles.caret} />
    </p>
  );
}

```

### React - `StreamingText.module.css`

```css
/* Theme follows the nearest [data-theme] ancestor (preview switch),
   then .dark, then the OS when no data-theme is set. */
:global(:root),
:global([data-theme="light"]) {
  --st-fg: #1a1a1a;
  --st-caret: #0b0d12;
}
:global([data-theme="dark"]),
:global(.dark) {
  --st-fg: #f5f5f5;
  --st-caret: #f5f5f5;
}
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme])) {
    --st-fg: #f5f5f5;
    --st-caret: #f5f5f5;
  }
}

.prose { max-width: 100%; font-size: 14px; line-height: 19px; color: var(--st-fg, #1a1a1a); overflow-wrap: anywhere; }
.caret { display: inline-block; width: 8px; height: 1.05em; margin-left: 2px; background: var(--st-caret, #0b0d12); vertical-align: text-bottom; animation: caret-blink 1s step-end infinite; }
/* solid while streaming, blink only once idle (matches the live component) */
.caretSteady { animation: none; opacity: 1; }
@keyframes caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .caret { animation: none; } }

```

### Vue - `StreamingText.vue`

```vue
<template>
  <p class="prose">{{ shown }}<span :class="shown.length < (text?.length ?? 0) ? 'caret caret-steady' : 'caret'" /></p>
</template>

<script setup>
import { ref, onMounted } from "vue";
const props = defineProps({ text: String });
const shown = ref("");
onMounted(() => {
  let i = 0;
  const id = setInterval(() => {
    i += 2;
    shown.value = props.text.slice(0, i);
    if (i >= props.text.length) clearInterval(id);
  }, 9);
});
</script>

<style scoped>
/* Theme follows the nearest [data-theme] ancestor, then .dark, then the OS. */
:global(:root),
:global([data-theme="light"]) {
  --st-fg: #1a1a1a;
  --st-caret: #0b0d12;
}
:global([data-theme="dark"]),
:global(.dark) {
  --st-fg: #f5f5f5;
  --st-caret: #f5f5f5;
}
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme])) {
  --st-fg: #f5f5f5;
  --st-caret: #f5f5f5;
  }
}
.prose { max-width: 100%; font-size: 14px; line-height: 19px; color: var(--st-fg, #1a1a1a); overflow-wrap: anywhere; }
.caret { display: inline-block; width: 8px; height: 1.05em; margin-left: 2px; background: var(--st-caret, #0b0d12); vertical-align: text-bottom; animation: caret-blink 1s step-end infinite; }
/* solid while streaming, blink only once idle (matches the live component) */
.caret-steady { animation: none; opacity: 1; }
@keyframes caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
</style>
```

### Svelte - `StreamingText.svelte`

```svelte
<script>
  import { onMount } from "svelte";
  export let text = "";
  let shown = "";
  onMount(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      shown = text.slice(0, i);
      if (i >= text.length) clearInterval(id);
    }, 9);
    return () => clearInterval(id);
  });
</script>

<p class="prose">{shown}<span class="caret {shown.length < text.length ? 'caret-steady' : ''}" /></p>

<style>
/* Theme follows the nearest [data-theme] ancestor, then .dark, then the OS. */
:global(:root),
:global([data-theme="light"]) {
  --st-fg: #1a1a1a;
  --st-caret: #0b0d12;
}
:global([data-theme="dark"]),
:global(.dark) {
  --st-fg: #f5f5f5;
  --st-caret: #f5f5f5;
}
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme])) {
  --st-fg: #f5f5f5;
  --st-caret: #f5f5f5;
  }
}
.prose { max-width: 100%; font-size: 14px; line-height: 19px; color: var(--st-fg, #1a1a1a); overflow-wrap: anywhere; }
.caret { display: inline-block; width: 8px; height: 1.05em; margin-left: 2px; background: var(--st-caret, #0b0d12); vertical-align: text-bottom; animation: caret-blink 1s step-end infinite; }
/* solid while streaming, blink only once idle (matches the live component) */
.caret-steady { animation: none; opacity: 1; }
@keyframes caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .caret { animation: none; } }
</style>
```
