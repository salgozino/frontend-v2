import { useCallback } from 'react'

import { BigNumber } from '@ethersproject/bignumber'
import { JsonRpcBatchProvider } from '@ethersproject/providers'
import useSWR from 'swr'

import { AgaveProtocolTokenType, agaveTokens } from '@/src/config/agaveTokens'
import { ZERO_BN } from '@/src/constants/bigNumber'
import { TOKEN_DATA_RETRIEVAL_REFRESH_INTERVAL } from '@/src/constants/common'
import { contracts } from '@/src/contracts/contracts'
import { useRewardTokenData } from '@/src/hooks/symmetrics/useRewardTokenData'
import { useWeb3Connection } from '@/src/providers/web3ConnectionProvider'
import { isSameAddress } from '@/src/utils/isSameAddress'
import {
  getIncentiveRate as calculateIncentiveRate,
  getMarketSize as calculateMarketSize,
  getPriceShares,
} from '@/src/utils/markets'
import { ChainsValues } from '@/types/chains'
import {
  AaveOracle__factory,
  AaveProtocolDataProvider,
  AaveProtocolDataProvider__factory,
  BaseIncentivesController__factory,
} from '@/types/generated/typechain'
import { isFulfilled } from '@/types/utils'

/**
 * TYPES
 */
export type IncentiveData = {
  agTokenEmissionPerSeconds: BigNumber
  variableDebtEmissionPerSeconds: BigNumber
}

export type AgaveMarketData = {
  tokenAddress: string
  priceData: BigNumber
  reserveData: Awaited<ReturnType<AaveProtocolDataProvider['getReserveData']>>
  assetData: Awaited<ReturnType<AaveProtocolDataProvider['getReserveConfigurationData']>>
  incentiveData: IncentiveData
}

/**
 * FETCHERS
 */
const fetchTokenPrice = async (
  tokenAddress: string,
  provider: JsonRpcBatchProvider,
  chainId: ChainsValues,
) => {
  const contract = AaveOracle__factory.connect(contracts.AaveOracle.address[chainId], provider)
  return { priceData: await contract.getAssetPrice(tokenAddress), tokenAddress }
}

const fetchReserveData = async (
  tokenAddress: string,
  provider: JsonRpcBatchProvider,
  chainId: ChainsValues,
) => {
  return {
    reserveData: await AaveProtocolDataProvider__factory.connect(
      contracts.AaveProtocolDataProvider.address[chainId],
      provider,
    ).getReserveData(tokenAddress),
    tokenAddress,
  }
}

const fetchAssetConfigurationData = async (
  tokenAddress: string,
  provider: JsonRpcBatchProvider,
  chainId: ChainsValues,
) => {
  return {
    assetData: await AaveProtocolDataProvider__factory.connect(
      contracts.AaveProtocolDataProvider.address[chainId],
      provider,
    ).getReserveConfigurationData(tokenAddress),
    tokenAddress,
  }
}

const fetchAssetIncentiveData = async (
  tokenAddress: string,
  provider: JsonRpcBatchProvider,
  chainId: ChainsValues,
) => {
  const relatedTokens = agaveTokens.getRelatedTokensByAddress(tokenAddress)

  const agToken = relatedTokens.find(({ type }) => type === 'ag')
  const variableDebtToken = relatedTokens.find(({ type }) => type === 'variableDebt')

  if (!agToken || !variableDebtToken) {
    throw Error('Error on getting agToken/variableDebtToken')
  }

  const contract = BaseIncentivesController__factory.connect(
    contracts.BaseIncentivesController.address[chainId],
    provider,
  )

  const agTokenIncentiveData = await contract.getAssetData(agToken.address)
  const variableDebtIncentiveData = await contract.getAssetData(variableDebtToken.address)

  return {
    incentiveData: {
      // TODO should stableDebtToken has incentiveData?
      agTokenEmissionPerSeconds: agTokenIncentiveData[1],
      variableDebtEmissionPerSeconds: variableDebtIncentiveData[1],
    },
    tokenAddress,
  }
}

/**
 * Takes an array of token addresses, and returns an object with AgaveMarketData for each token
 */
const fetchAgaveMarketsData = async ({
  chainId,
  provider,
  reserveTokensAddresses,
}: {
  chainId: ChainsValues
  provider: JsonRpcBatchProvider
  reserveTokensAddresses: string[]
}) => {
  const pricesDataPromises: ReturnType<typeof fetchTokenPrice>[] = []
  const reserveDataPromises: ReturnType<typeof fetchReserveData>[] = []
  const assetDataPromises: ReturnType<typeof fetchAssetConfigurationData>[] = []
  const incentiveDataPromises: ReturnType<typeof fetchAssetIncentiveData>[] = []

  reserveTokensAddresses.forEach(async (tokenAddress) => {
    pricesDataPromises.push(fetchTokenPrice(tokenAddress, provider, chainId))
    reserveDataPromises.push(fetchReserveData(tokenAddress, provider, chainId))
    assetDataPromises.push(fetchAssetConfigurationData(tokenAddress, provider, chainId))
    incentiveDataPromises.push(fetchAssetIncentiveData(tokenAddress, provider, chainId))
  })

  const combinedPromisesResolved = await Promise.allSettled([
    ...pricesDataPromises,
    ...reserveDataPromises,
    ...assetDataPromises,
    ...incentiveDataPromises,
  ])

  const rawResults = combinedPromisesResolved.filter(isFulfilled).map(({ value }) => value)

  /* Merge the results of the promises by reserve token address. */
  const tokensData = reserveTokensAddresses.map((reserveAddress) => {
    // Find all occurrences by reserveAddress
    const rawDataByReserveToken = rawResults.filter(({ tokenAddress }) =>
      isSameAddress(reserveAddress, tokenAddress),
    )

    let tokenData: AgaveMarketData = {} as AgaveMarketData

    rawDataByReserveToken.forEach((item) => {
      tokenData = { ...tokenData, ...item }
    })

    return tokenData
  })

  return tokensData
}

// TODO warning with the number of batch calls.
// If the array of token is too big, we can split the tokens array into smaller chunks (such as pagination)
const useMarketsDataQuery = (reserveTokensAddresses: string[]) => {
  const { appChainId, batchProvider } = useWeb3Connection()

  // Simple cacheKey to get the cache data in other uses.
  const { data } = useSWR(
    reserveTokensAddresses?.length ? [`agave-tokens-data`, reserveTokensAddresses] : null,
    () => {
      if (!reserveTokensAddresses?.length) {
        return
      }
      const fetcherParams = {
        reserveTokensAddresses,
        provider: batchProvider,
        chainId: appChainId,
      }
      return fetchAgaveMarketsData(fetcherParams)
    },
    {
      refreshInterval: TOKEN_DATA_RETRIEVAL_REFRESH_INTERVAL,
    },
  )

  return data
}

/**
 * Returns the AgaveMarketData for a given array of reserve tokens addresses.
 * @param {String} reserveTokensAddresses
 */
export const useAgaveMarketsData = (reserveTokensAddresses?: string[]) => {
  /* If reserveTokensAddresses is empty, then it will return the address of all the reserve tokens. */
  const marketAddresses = !reserveTokensAddresses?.length
    ? agaveTokens.reserveTokens.map(({ address }) => address)
    : reserveTokensAddresses

  const agaveMarketsData = useMarketsDataQuery(marketAddresses)
  const rewardTokenData = useRewardTokenData()?.pools[0]

  /* Get the market data for a given token address. */
  const getMarket = useCallback(
    (address: string) => {
      const marketFound = agaveMarketsData?.find(({ tokenAddress }) =>
        isSameAddress(address, tokenAddress),
      )
      if (!marketFound) {
        throw Error(`Market not found for token ${address}`)
      }

      return marketFound
    },
    [agaveMarketsData],
  )

  /* Returns the market size of a token. */
  const getMarketSize = useCallback(
    (tokenAddress: string) => {
      try {
        const marketData = getMarket(tokenAddress)
        const { availableLiquidity, totalVariableDebt } = marketData.reserveData

        return calculateMarketSize({
          tokenAddress,
          totalSupply: totalVariableDebt.add(availableLiquidity),
          price: marketData.priceData,
        })
      } catch (e) {
        console.error(e)
        return ZERO_BN
      }
    },
    [getMarket],
  )

  const getTotalBorrowed = useCallback(
    (tokenAddress: string) => {
      try {
        const marketData = getMarket(tokenAddress)
        const { totalStableDebt, totalVariableDebt } = marketData.reserveData

        return totalStableDebt.add(totalVariableDebt)
      } catch (e) {
        console.error(e)
        return ZERO_BN
      }
    },
    [getMarket],
  )

  const getDepositAPY = useCallback(
    (tokenAddress: string) => {
      try {
        const marketData = getMarket(tokenAddress)

        return marketData.reserveData.liquidityRate
      } catch (e) {
        console.error(e)
        return ZERO_BN
      }
    },
    [getMarket],
  )

  const getBorrowRate = useCallback(
    (tokenAddress: string) => {
      try {
        const marketData = getMarket(tokenAddress)
        const { stableBorrowRate, variableBorrowRate } = marketData.reserveData

        return {
          stable: stableBorrowRate,
          variable: variableBorrowRate,
        }
      } catch (e) {
        console.error(e)
        return {
          stable: ZERO_BN,
          variable: ZERO_BN,
        }
      }
    },
    [getMarket],
  )

  const getIncentiveRate = useCallback(
    (tokenAddress: string, tokenType: AgaveProtocolTokenType) => {
      if (!rewardTokenData) {
        return ZERO_BN
      }

      try {
        const marketData = getMarket(tokenAddress)
        const {
          incentiveData,
          priceData: tokenPrice,
          reserveData: { availableLiquidity, totalVariableDebt },
        } = marketData

        const emissionPerSeconds =
          tokenType === 'ag'
            ? incentiveData.agTokenEmissionPerSeconds
            : tokenType === 'variableDebt'
            ? incentiveData.variableDebtEmissionPerSeconds
            : ZERO_BN

        const tokenSupply =
          tokenType === 'ag'
            ? totalVariableDebt.add(availableLiquidity)
            : tokenType === 'variableDebt'
            ? totalVariableDebt
            : ZERO_BN

        return calculateIncentiveRate({
          emissionPerSeconds,
          tokenSupply,
          priceShares: getPriceShares(rewardTokenData),
          tokenAddress,
          tokenPrice,
        })
      } catch (e) {
        console.error(e)
        return ZERO_BN
      }
    },
    [getMarket, rewardTokenData],
  )

  return {
    agaveMarketsData,
    getIncentiveRate,
    getMarket,
    getMarketSize,
    getTotalBorrowed,
    getDepositAPY,
    getBorrowRate,
  }
}