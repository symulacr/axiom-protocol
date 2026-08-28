// TEMP mock (h3-b verify): EIP-1193 provider announced via EIP-6963 before app code runs.
const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const CHAIN_HEX = '0x40da'; // 16602 Galileo = dev APP_CHAIN_ID
const listeners = {};
const emit = (event, payload) => (listeners[event] || []).forEach((fn) => { try { fn(payload); } catch {} });
const provider = {
  on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
  removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); },
  request: async ({ method, params }) => {
    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return [ADDRESS];
      case 'eth_chainId':
        return CHAIN_HEX;
      case 'wallet_switchEthereumChain':
        setTimeout(() => emit('chainChanged', '0x40da'), 30);
        return null;
      case 'wallet_addEthereumChain':
        return null;
      case 'eth_sendTransaction':
        return '0x' + 'a'.repeat(64);
      case 'eth_getBalance':
        return '0x56bc75e2d63100000';
      case 'personal_sign':
      case 'eth_signTypedData_v4':
        return '0x' + 'c'.repeat(130);
      default:
        return null;
    }
  },
};
window.ethereum = provider;
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({
      info: { uuid: 'mock-wallet-uuid', name: 'Mock Wallet', icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>', rdns: 'com.mock.wallet' },
      provider,
    }),
  }));
});
window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
  detail: Object.freeze({
    info: { uuid: 'mock-wallet-uuid', name: 'Mock Wallet', icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>', rdns: 'com.mock.wallet' },
    provider,
  }),
}));
