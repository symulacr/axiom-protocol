/**
 * Integrated brand imagery (Grok Imagine assets under public/brand).
 * Paths are absolute from the Vite public root.
 */
export const BRAND = {
  heroSeal: "/brand/hero-seal-512.jpg",
  heroSealFull: "/brand/hero-seal.jpg",
  agentLattice: "/brand/agent-lattice-480.jpg",
  chatAvatar: "/brand/chat-avatar-128.jpg",
  chatAvatarFull: "/brand/chat-avatar.jpg",
  emptyAgents: "/brand/empty-agents-960.jpg",
  emptyAgentsFull: "/brand/empty-agents.jpg",
  ogBanner: "/brand/og-1200.jpg",
} as const;

export type BrandAssetKey = keyof typeof BRAND;
