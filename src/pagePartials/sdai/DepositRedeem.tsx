import styled from 'styled-components'

import { withGenericSuspense } from '@/src/components/helpers/SafeSuspense'
import { SkeletonLoading } from '@/src/components/loading/SkeletonLoading'
import { Tabs as BaseTabs, Tab } from '@/src/components/tabs/Tabs'
import { Deposit } from '@/src/pagePartials/sdai/deposit/Deposit'
import { Redeem } from '@/src/pagePartials/sdai/redeem/Redeem'
import { DepositRedeemTabs } from '@/types/modal'
import { Token } from '@/types/token'

const Tabs = styled(BaseTabs)`
  margin: 32px auto;
`

interface Props {
  activeTab?: DepositRedeemTabs
  onTokenSelect: (token: Token) => void
  setTab: (tab: DepositRedeemTabs) => void
  token: Token | null
}

export const DepositRedeem: React.FC<Props> = withGenericSuspense(
  ({ activeTab, onTokenSelect, setTab, token }) => {
    const depositActive = activeTab === 'deposit'
    const redeemActive = activeTab === 'redeem'

    return (
      <>
        <Tabs>
          <Tab isActive={depositActive} onClick={() => setTab('deposit')}>
            Deposit
          </Tab>
          <Tab isActive={redeemActive} onClick={() => setTab('redeem')}>
            Redeem
          </Tab>
        </Tabs>
        {depositActive && token && (
          <Deposit onTokenSelect={onTokenSelect} tokenAddress={token.address} />
        )}
        {redeemActive && token && (
          <Redeem onTokenSelect={onTokenSelect} tokenAddress={token.address} />
        )}
      </>
    )
  },
  () => (
    <>
      <SkeletonLoading style={{ height: '48px', margin: '0 0 44px' }} />
      <SkeletonLoading
        style={{
          borderRadius: '16px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'grid', rowGap: '6px' }}>
          {Array.from({ length: 6 }).map((item, index) => (
            <SkeletonLoading
              animate={false}
              key={`list_${index}`}
              style={{ height: '53px', borderRadius: '6px' }}
            />
          ))}
        </div>
      </SkeletonLoading>
      <Tabs style={{ height: '89px', maxWidth: 'none', width: '244px' }} />
      <SkeletonLoading
        style={{
          borderRadius: '16px',
          height: '200px',
        }}
      />
    </>
  ),
)
