import type { CSSProperties, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AXIOM_VAULT_ADDRESSES } from '../abi/addresses.js';
import { Card } from '../components/ui.js';

const NARRATIVE =
  'Axiom Protocol is the verifiable intelligence layer for DeFi. It lets an AI agent\u2019s intelligence \u2014 its model, weights, strategy, execution logic \u2014 be tokenized as an NFT, owned by a user, transferred with provable integrity, and run with cryptographic proof of correct execution.';

const heroStyle: CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px 48px',
};

const heroTitleStyle: CSSProperties = {
  fontSize: 40,
  fontWeight: 800,
  color: '#111827',
  margin: '0 0 16px',
  lineHeight: 1.2,
};

const heroSubtitleStyle: CSSProperties = {
  fontSize: 18,
  color: '#6b7280',
  maxWidth: 640,
  margin: '0 auto 32px',
  lineHeight: 1.6,
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
  flexWrap: 'wrap',
};

const ctaButtonBase: CSSProperties = {
  display: 'inline-block',
  padding: '10px 24px',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
  transition: 'opacity 0.15s',
};

const primaryCta: CSSProperties = {
  ...ctaButtonBase,
  background: '#1f2937',
  color: '#f9fafb',
};

const secondaryCta: CSSProperties = {
  ...ctaButtonBase,
  background: '#fff',
  color: '#111827',
  border: '1px solid #e5e7eb',
};

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  margin: '40px auto',
  maxWidth: 720,
};

const statCardStyle: CSSProperties = {
  textAlign: 'center',
  padding: 24,
};

const statNumberStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  color: '#111827',
  margin: '0 0 4px',
};

const statLabelStyle: CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
};

const stepsSectionStyle: CSSProperties = {
  maxWidth: 800,
  margin: '40px auto',
};

const stepsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 20,
};

const stepNumberStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: '#1f2937',
  color: '#f9fafb',
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 12,
};

export function HomePage(): ReactElement {
  const { isConnected } = useAccount();
  const vaultAddr = AXIOM_VAULT_ADDRESSES[0];

  return (
    <main>
      {/* Hero */}
      <section style={heroStyle}>
        <h1 style={heroTitleStyle}>Axiom Protocol</h1>
        <p style={heroSubtitleStyle}>{NARRATIVE}</p>
        <div style={ctaRowStyle}>
          <Link to={vaultAddr !== undefined ? `/vaults/${vaultAddr}` : '/agents'} style={primaryCta}>
            View Vaults
          </Link>
          <Link to="/agents" style={secondaryCta}>
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
          <div style={statLabelStyle}>Vaults Deployed</div>
        </Card>
        <Card style={statCardStyle}>
          <div style={statNumberStyle}>EIP-7857</div>
          <div style={statLabelStyle}>iNFT Standard</div>
        </Card>
        <Card style={statCardStyle}>
          <div style={statNumberStyle}>0G</div>
          <div style={statLabelStyle}>Storage &amp; Compute</div>
        </Card>
      </section>

      {/* How it works */}
      <section style={stepsSectionStyle}>
        <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>
          How it works
        </h2>
        <div style={stepsGridStyle}>
          <Card>
            <div style={stepNumberStyle}>1</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Mint an iNFT</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              Upload your encrypted strategy to 0G Storage and mint it as an ERC-7857 intelligent NFT with a TEE-sealed key.
            </p>
          </Card>
          <Card>
            <div style={stepNumberStyle}>2</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Transfer securely</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              Transfer ownership with cryptographic proof of integrity. The receiver unwraps the sealed key in a TEE.
            </p>
          </Card>
          <Card>
            <div style={stepNumberStyle}>3</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Execute on-chain</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              Run strategy ticks via 0G Compute inference. The vault settles buy/sell actions on-chain with verifiable proof.
            </p>
          </Card>
        </div>
      </section>
    </main>
  );
}

export default HomePage;
