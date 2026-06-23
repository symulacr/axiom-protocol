import type { CSSProperties, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AXIOM_VAULT_ADDRESSES } from '../abi/addresses.js';
import { Card, COLORS } from '../components/ui.js';

const NARRATIVE =
  'Tokenize AI intelligence as an NFT. Own it, transfer it with cryptographic proof, and execute strategies on-chain with verifiable integrity.';

const heroSectionStyle: CSSProperties = {
  textAlign: 'center',
  padding: '80px 24px 56px',
  animation: 'axiom-fade-in 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
};

const heroTitleStyle: CSSProperties = {
  fontSize: 52,
  fontWeight: 800,
  color: COLORS.text,
  margin: '0 0 20px',
  lineHeight: 1.1,
  letterSpacing: '-0.03em',
};

const heroAccentStyle: CSSProperties = {
  color: COLORS.bronzeLight,
};

const heroSubtitleStyle: CSSProperties = {
  fontSize: 18,
  color: COLORS.textMuted,
  maxWidth: 580,
  margin: '0 auto 40px',
  lineHeight: 1.7,
  fontWeight: 300,
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  gap: 14,
  justifyContent: 'center',
  flexWrap: 'wrap',
};

const ctaBase: CSSProperties = {
  display: 'inline-block',
  padding: '12px 28px',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
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

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
  margin: '48px auto',
  maxWidth: 760,
};

const statCardStyle: CSSProperties = {
  textAlign: 'center',
  padding: '28px 20px',
};

const statNumberStyle: CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: COLORS.bronzeLight,
  margin: '0 0 6px',
  letterSpacing: '-0.02em',
};

const statLabelStyle: CSSProperties = {
  fontSize: 12,
  color: COLORS.textDim,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontWeight: 500,
};

const stepsSectionStyle: CSSProperties = {
  maxWidth: 820,
  margin: '56px auto 80px',
};

const stepsHeadingStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.textDim,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  textAlign: 'center',
  marginBottom: 32,
};

const stepsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 20,
};

const stepNumberStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: COLORS.bronzeBg,
  border: `1px solid ${COLORS.bronzeBorder}`,
  color: COLORS.bronzeLight,
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 16,
};

const stepTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: COLORS.text,
  margin: '0 0 10px',
  letterSpacing: '-0.01em',
};

const stepBodyStyle: CSSProperties = {
  fontSize: 14,
  color: COLORS.textMuted,
  margin: 0,
  lineHeight: 1.65,
  fontWeight: 300,
};

export function HomePage(): ReactElement {
  const { isConnected } = useAccount();
  const vaultAddr = AXIOM_VAULT_ADDRESSES[0];

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
            to={vaultAddr !== undefined ? `/vaults/${vaultAddr}` : '/agents'}
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
      <section style={statsGridStyle}>
        <Card style={statCardStyle}>
          <div style={statNumberStyle}>{AXIOM_VAULT_ADDRESSES.length}</div>
          <div style={statLabelStyle}>Vaults Live</div>
        </Card>
        <Card style={statCardStyle}>
          <div style={statNumberStyle}>7857</div>
          <div style={statLabelStyle}>iNFT Standard</div>
        </Card>
        <Card style={statCardStyle}>
          <div style={statNumberStyle}>0G</div>
          <div style={statLabelStyle}>Storage &amp; Compute</div>
        </Card>
      </section>

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
