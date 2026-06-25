import type { CSSProperties, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Card, COLORS } from '../components/ui.js';

const NARRATIVE =
  'Tokenize AI intelligence as an NFT. Own it, transfer it with cryptographic proof, and execute strategies on-chain with verifiable integrity.';

const heroSectionStyle: CSSProperties = {
  textAlign: 'center',
  padding: 'var(--space-4xl) var(--space-xl) var(--space-3xl)',
  animation: 'axiom-fade-in 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
};

const heroTitleStyle: CSSProperties = {
  fontSize: 'var(--text-3xl)',
  fontWeight: 'var(--fw-bold)',
  color: COLORS.text,
  margin: '0 0 var(--space-lg)',
  lineHeight: 'var(--lh-tight)',
  letterSpacing: '-0.03em',
};

const heroAccentStyle: CSSProperties = {
  color: COLORS.bronzeLight,
};

const heroSubtitleStyle: CSSProperties = {
  fontSize: 'var(--text-lg)',
  color: COLORS.textMuted,
  maxWidth: '36rem',
  margin: '0 auto var(--space-2xl)',
  lineHeight: 'var(--lh-relaxed)',
  fontWeight: 'var(--fw-regular)',
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-sm)',
  justifyContent: 'center',
  flexWrap: 'wrap',
};

const ctaBase: CSSProperties = {
  display: 'inline-block',
  padding: '0.75rem 1.75rem',
  borderRadius: 'var(--radius-lg)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--fw-semibold)',
  textDecoration: 'none',
  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
  letterSpacing: '0.01em',
};

const primaryCtaStyle: CSSProperties = {
  ...ctaBase,
  background: COLORS.bronze,
  color: '#0f0f0f',
  border: `1px solid ${COLORS.bronze}`,
};

const secondaryCtaStyle: CSSProperties = {
  ...ctaBase,
  background: 'transparent',
  color: COLORS.textPrimary,
  border: `1px solid ${COLORS.borderStrong}`,
};

const stepsSectionStyle: CSSProperties = {
  maxWidth: '52rem',
  margin: 'var(--space-3xl) auto var(--space-4xl)',
};

const stepsHeadingStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--fw-semibold)',
  color: COLORS.textDim,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  textAlign: 'center',
  marginBottom: 'var(--space-2xl)',
};

const stepsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
  gap: 'var(--space-xl)',
};

const stepNumberStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.25rem',
  height: '2.25rem',
  borderRadius: '50%',
  background: COLORS.bronzeBg,
  border: `1px solid ${COLORS.bronzeBorder}`,
  color: COLORS.bronzeLight,
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--fw-bold)',
  marginBottom: 'var(--space-lg)',
};

const stepTitleStyle: CSSProperties = {
  fontSize: 'var(--text-lg)',
  fontWeight: 'var(--fw-semibold)',
  color: COLORS.text,
  margin: '0 0 0.625rem',
  letterSpacing: '-0.01em',
  lineHeight: 'var(--lh-snug)',
};

const stepBodyStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: COLORS.textMuted,
  margin: 0,
  lineHeight: 'var(--lh-normal)',
  fontWeight: 'var(--fw-regular)',
};

export function HomePage(): ReactElement {
  const { isConnected } = useAccount();

  return (
    <main>
      {/* Hero */}
      <section style={heroSectionStyle}>
        <h1 style={heroTitleStyle}>
          Axiom <span style={heroAccentStyle}>Protocol</span>
        </h1>
        <p style={heroSubtitleStyle}>{NARRATIVE}</p>
        <div style={ctaRowStyle}>
          <Link
            to="/vaults/0"
            style={primaryCtaStyle}
          >
            Explore Vaults
          </Link>
          <Link to="/agents" style={secondaryCtaStyle}>
            Browse Agents
          </Link>
          {!isConnected && (
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <ConnectButton />
            </span>
          )}
        </div>
      </section>

      {/* Stats */}
      <p style={{ fontSize: 'var(--text-sm)', color: COLORS.textMuted, textAlign: 'center', margin: 'var(--space-3xl) auto' }}>
        Powered by 0G Protocol
      </p>

      {/* How it works */}
      <section style={stepsSectionStyle}>
        <h2 style={stepsHeadingStyle}>How it works</h2>
        <div style={stepsGridStyle}>
          <Card>
            <div style={stepNumberStyle}>1</div>
            <h3 style={stepTitleStyle}>Mint an iNFT</h3>
            <p style={stepBodyStyle}>
              Upload your encrypted strategy to 0G Storage. The TEE oracle seals
              the encryption key and mints an ERC-7857 intelligent NFT to your
              wallet.
            </p>
          </Card>
          <Card>
            <div style={stepNumberStyle}>2</div>
            <h3 style={stepTitleStyle}>Transfer with proof</h3>
            <p style={stepBodyStyle}>
              Send the iNFT to any wallet with cryptographic proof of integrity.
              The receiver unwraps the sealed key inside a TEE — no trusted
              intermediary required.
            </p>
          </Card>
          <Card>
            <div style={stepNumberStyle}>3</div>
            <h3 style={stepTitleStyle}>Execute on-chain</h3>
            <p style={stepBodyStyle}>
              Run strategy ticks through 0G Compute inference. The vault settles
              buy and sell actions on-chain with a verifiable execution proof.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}

export default HomePage;
