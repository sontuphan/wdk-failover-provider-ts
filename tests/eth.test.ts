import { describe } from 'noba'
import FailoverProvider from 'wdk-failover-provider'
import { shims } from './config'
import { parseEther, Wallet, ZeroAddress, type AbstractProvider } from 'ethers'

const { JsonRpcProvider, BrowserProvider } = await import('ethers', {
  with: shims,
})

/**
 * A dummy in-page provider
 */
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

describe('Ethereum providers', ({ describe, test }) => {
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

  test('should retry 1 time and fail', async ({ expect }) => {
    const provider = new FailoverProvider<AbstractProvider>()
      .addProvider(new BrowserProvider(window.ethereum))
      .addProvider(new BrowserProvider(window.ethereum))
      .addProvider(
        new JsonRpcProvider(
          'https://mainnet.infura.io/v3/06da09cda4da458c9aafe71cf464f5e5',
          {
            name: 'mainnet',
            chainId: 1,
          },
        ),
      )
      .initialize()

    const blockNumber = await provider.getBlockNumber()

    expect(blockNumber > 0).to.be(true)
  })

  describe('shouldRetryOn config', ({ test }) => {
    test('should not retry on insufficient balance error', async ({
      expect,
    }) => {
      const provider = new FailoverProvider<AbstractProvider>({
        shouldRetryOn: (error) => {
          if (error instanceof Error && 'code' in error) {
            return error.code !== 'INSUFFICIENT_FUNDS'
          }
          return true
        },
      })
        .addProvider(
          new JsonRpcProvider(
            'https://mainnet.infura.io/v3/06da09cda4da458c9aafe71cf464f5e5',
            {
              name: 'mainnet',
              chainId: 1,
            },
          ),
        )
        .addProvider(new BrowserProvider(window.ethereum))
        .initialize()

      const wallet = Wallet.createRandom(provider)

      expect(async () => {
        await wallet.sendTransaction({
          to: ZeroAddress,
          value: parseEther('1'),
        })
      }).rejects(/insufficient funds/)
    })

    test('should be failed on the default shouldRetryOn', async ({
      expect,
    }) => {
      const provider = new FailoverProvider<AbstractProvider>({
        retries: 1,
      })
        .addProvider(
          new JsonRpcProvider(
            'https://mainnet.infura.io/v3/06da09cda4da458c9aafe71cf464f5e5',
            {
              name: 'mainnet',
              chainId: 1,
            },
          ),
        )
        .addProvider(new BrowserProvider(window.ethereum))
        .initialize()

      const wallet = Wallet.createRandom(provider)

      expect(async () => {
        await wallet.sendTransaction({
          to: ZeroAddress,
          value: parseEther('1'),
        })
      }).rejects(/missing revert data/)
    })
  })
})
