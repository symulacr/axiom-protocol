import { useCallback, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { parseAbi, parseEther } from 'viem';
import { toast } from 'sonner';
import { getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';
import { useVaultData } from './useVaultData.js';

const abi = parseAbi(axiomStrategyVaultAbi);

export function useDeposit(tokenId: bigint, onSuccess?: () => void) {
  const vd = useVaultData(tokenId);
  const vaultAddr = getAxiomStrategyVaultAddress();
  const [depositAmount, setDepositAmount] = useState('');

  const { writeContract: doDeposit, isPending: isDepositing } = useWriteContract({
    mutation: {
      onSuccess() {
        toast.success('Deposit successful');
        setDepositAmount('');
        vd.refetch();
        onSuccess?.();
      },
    },
  });

  const handleDeposit = useCallback(() => {
    if (!depositAmount) return;
    doDeposit({
      address: vaultAddr,
      abi,
      functionName: 'deposit',
      args: [tokenId],
      value: parseEther(depositAmount),
    });
  }, [depositAmount, vaultAddr, tokenId, doDeposit]);

  const isValidDeposit =
    depositAmount.trim() !== '' &&
    !isNaN(Number(depositAmount)) &&
    Number(depositAmount) > 0;

  return {
    depositAmount,
    setDepositAmount,
    isDepositing,
    isValidDeposit,
    handleDeposit,
    vaultData: vd,
  };
}
