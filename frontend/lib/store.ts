import { create } from 'zustand';
import type { WalletState, PoolConfig, InvestorPosition } from './types';

const WALLET_KEY = 'astera_wallet_address';

export function getStoredWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(WALLET_KEY);
}

interface AsteraStore {
  wallet: WalletState;
  poolConfig: PoolConfig | null;
  position: InvestorPosition | null;

  setWallet: (wallet: WalletState) => void;
  setPoolConfig: (config: PoolConfig) => void;
  setPosition: (position: InvestorPosition | null) => void;
  disconnect: () => void;
}

export const useStore = create<AsteraStore>((set) => ({
  wallet: { address: null, connected: false, network: 'testnet' },
  poolConfig: null,
  position: null,

  setWallet: (wallet) => {
    if (typeof window !== 'undefined') {
      if (wallet.connected && wallet.address) {
        localStorage.setItem(WALLET_KEY, wallet.address);
      } else {
        localStorage.removeItem(WALLET_KEY);
      }
    }
    set({ wallet });
  },
  setPoolConfig: (poolConfig) => set({ poolConfig }),
  setPosition: (position) => set({ position }),
  disconnect: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WALLET_KEY);
    }
    set({ wallet: { address: null, connected: false, network: 'testnet' }, position: null });
  },
}));
