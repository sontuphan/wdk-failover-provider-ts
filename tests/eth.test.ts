import { describe } from 'noba'
import FailoverProvider from 'wdk-failover-provider'
import { JsonRpcProvider, BrowserProvider, AbstractProvider } from 'ethers'

const window = {
  ethereum: {
    request: async ({
      method,
    }: {
      method: string
      params?: unknown[] | object
    }) => {
      if (method === 'eth_chainId') return 1
      throw new Error('Provider disconnected')
    },
  },
}

describe('Ethereum providers', ({ test }) => {
  test('should accept polymorphism', async ({ expect }) => {
    const provider = new FailoverProvider<AbstractProvider>()
      .addProvider(new BrowserProvider(window.ethereum))
      .addProvider(
        new JsonRpcProvider(
          'https://mainnet.infura.io/v3/06da09cda4da458c9aafe71cf464f5e5',
        ),
      )
      .initialize()

    const blockNumber = await provider.getBlockNumber()

    expect(blockNumber > 0).to.be(true)
  })
})
