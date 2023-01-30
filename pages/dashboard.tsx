import type { NextPage } from 'next'
import styled from 'styled-components'

import { BaseCard } from '@/src/components/common/BaseCard'
import { SimpleGrid } from '@/src/components/layout/SimpleGrid'
import { UserBorrows } from '@/src/pagePartials/dashboard/UserBorrows'
import { UserDeposits } from '@/src/pagePartials/dashboard/UserDeposits'

const Grid = styled(SimpleGrid)`
  align-items: flex-start;
  > * {
    flex: 1;
    text-align: center;
  }
`

const Dashboard: NextPage = () => {
  return (
    <>
      <BaseCard>
        <Grid>
          <UserBorrows />
          <UserDeposits />
        </Grid>
      </BaseCard>
    </>
  )
}

export default Dashboard