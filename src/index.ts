export type FailoverProviderConfig = {
  retries?: number
}

export type ProviderProxy<T> = {
  provider: T
  // The last response duration
  ms: number
}

export default class FailoverProvider<T extends object> {
  private activeProvider: number = 0
  public providers: Array<ProviderProxy<T>> = []

  private readonly retries: number

  constructor({ retries = 3 }: FailoverProviderConfig = {}) {
    this.retries = retries
  }

  /**
   * Add a provider into the list of candidates
   * @param provider Provider
   * @returns The instance of FailoverProvider
   */
  addProvider = <P extends T>(provider: P) => {
    this.providers.push({ provider, ms: 0 })
    return this
  }

  /**
   * The FailoverProvider factory
   * @returns The instance of FailoverProvider
   */
  initialize = () => {
    if (!this.providers.length)
      throw new Error(
        'Cannot initialize an empty provider. Call `addProvider` before this function.',
      )

    const [{ provider }] = this.providers

    return new Proxy(provider, {
      get: (_, p, receiver) => {
        return this.proxy(this.providers[this.activeProvider], p, receiver)
      },
    })
  }

  /**
   * Switch to the next candidate provider by round robin
   * @returns The new candidate provider
   */
  private switch = () => {
    this.activeProvider = (this.activeProvider + 1) % this.providers.length
    return this.providers[this.activeProvider]
  }

  /**
   * Store the response time of the latest request
   * @param target - The provider proxy
   * @returns The benchmark close
   */
  private benchmark = (target: ProviderProxy<T>) => {
    const start = performance.now()
    return () => {
      target.ms = Math.round(performance.now() - start)
    }
  }

  /**
   * Proxy handler will keep retry until a response or throw the latest error.
   * @param target The current active provider
   * @param p The method name
   * @param receiver The JS Proxy
   * @param retries The number of retries
   * @returns
   */
  private proxy = (
    target: ProviderProxy<T>,
    p: string | symbol,
    receiver: any,
    retries: number = this.retries,
  ) => {
    return (...args: any[]): any => {
      const record = this.benchmark(target)
      let re: any | Promise<any>

      // Retry on sync functions
      try {
        const prop = Reflect.get(target.provider, p, receiver)
        if (typeof prop !== 'function') return prop

        re = prop.apply(target.provider, args)
        if (!re?.then) {
          record()
          return re
        }
      } catch (er: unknown) {
        record()
        if (retries <= 0) throw er
        return this.proxy(this.switch(), p, receiver, retries - 1)
      }

      // Retry on async functions
      return re
        .then((re: any) => {
          record()
          return re
        })
        .catch((er: unknown) => {
          record()
          if (retries <= 0) throw er
          return this.proxy(this.switch(), p, receiver, retries - 1)(...args)
        })
    }
  }
}
