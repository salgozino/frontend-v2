import { useCallback } from 'react'

import { agaveTokens } from '@/src/config/agaveTokens'
import { usePageModeParam } from '@/src/hooks/presentation/usePageModeParam'
import useGetUserAccountData from '@/src/hooks/queries/useGetUserAccountData'
import { useGetUserReservesData } from '@/src/hooks/queries/useGetUserReservesData'
import { useContractInstance } from '@/src/hooks/useContractInstance'
import useTransaction from '@/src/hooks/useTransaction'
import { StepWithActions, useStepStates } from '@/src/pagePartials/markets/stepper'
import { useWeb3ConnectedApp } from '@/src/providers/web3ConnectionProvider'
import { AgaveLending__factory, WETHGateway__factory } from '@/types/generated/typechain'

export const useBorrowStepBorrow = ({
  amount,
  tokenAddress,
}: {
  amount: string
  tokenAddress: string
}) => {
  const interestRateMode = usePageModeParam()
  const { address: userAddress } = useWeb3ConnectedApp()

  const wrappedNativeGateway = useContractInstance(WETHGateway__factory, 'WETHGateway')
  const agaveLending = useContractInstance(AgaveLending__factory, 'AgaveLendingPool')
  const sendTx = useTransaction()

  const { mutate: refetchUserReservesData } = useGetUserReservesData()
  const [, refetchUserAccountData] = useGetUserAccountData(userAddress)

  const borrow = useCallback(async () => {
    const tokenInfo = agaveTokens.getTokenByAddress(tokenAddress)
    let tx

    if (tokenInfo.extensions.isNative) {
      tx = await sendTx(() => wrappedNativeGateway.borrowETH(amount, interestRateMode, 0))
    } else {
      tx = await sendTx(() =>
        agaveLending.borrow(tokenAddress, amount, interestRateMode, 0, userAddress),
      )
    }

    const receipt = await tx.wait()

    await refetchUserReservesData()
    await refetchUserAccountData()

    return receipt.transactionHash
  }, [
    tokenAddress,
    refetchUserReservesData,
    refetchUserAccountData,
    sendTx,
    wrappedNativeGateway,
    amount,
    interestRateMode,
    agaveLending,
    userAddress,
  ])

  return useStepStates({
    title: 'Borrow',
    description: 'Submit to borrow',
    status: 'idle',
    actionText: 'Borrow',
    async mainAction() {
      this.loading()

      try {
        const txHash = await borrow()
        this.nextStep(txHash)
      } catch (e) {
        this.failed()
      }
    },
  } as StepWithActions)
}
