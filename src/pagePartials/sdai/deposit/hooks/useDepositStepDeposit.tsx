import { useCallback } from 'react'

import { useGetTokenInfo } from '@/src/hooks/queries/useGetSavingsData'
import { useGetBalance } from '@/src/hooks/queries/useGetSavingsUserData'
import { useContractInstance } from '@/src/hooks/useContractInstance'
import useTransaction from '@/src/hooks/useTransaction'
import { StepWithActions, useStepStates } from '@/src/pagePartials/markets/stepper'
import { useWeb3ConnectedApp } from '@/src/providers/web3ConnectionProvider'
import { SavingsXDaiAdapter__factory, SavingsXDai__factory } from '@/types/generated/typechain'

export const useDepositStepDeposit = ({
  amount,
  tokenAddress,
}: {
  amount: string
  tokenAddress: string
}) => {
  const tokenInfo = useGetTokenInfo(tokenAddress)
  const { address: userAddress } = useWeb3ConnectedApp()
  const adapter = useContractInstance(SavingsXDaiAdapter__factory, 'SavingsXDaiAdapter', true)
  const sdai = useContractInstance(SavingsXDai__factory, 'SavingsXDai', true)
  const sendTx = useTransaction()

  const { refetch: refetchSourceBalance } = useGetBalance(userAddress, tokenAddress)
  const { refetch: refetchTargetBalance } = useGetBalance(userAddress, sdai.address)

  const deposit = useCallback(async () => {
    const tx = await sendTx(() => {
      if (tokenInfo.symbol == 'XDAI') {
        return adapter.depositXDAI(userAddress, { value: amount })
      }
      return adapter.deposit(amount, userAddress)
    })
    const receipt = await tx.wait()
    refetchSourceBalance()
    refetchTargetBalance()
    return receipt.transactionHash
  }, [tokenInfo, refetchSourceBalance, refetchTargetBalance, sendTx, userAddress, amount, adapter])

  return useStepStates({
    title: 'Deposit',
    description: 'Submit to deposit',
    status: 'idle',
    actionText: 'Deposit',
    async mainAction() {
      this.loading()

      try {
        const txHash = await deposit()
        this.nextStep(txHash)
      } catch (e) {
        this.failed()
      }
    },
  } as StepWithActions)
}
