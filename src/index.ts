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

  addProvider = <P extends T>(provider: P) => {
    this.providers.push({ provider, ms: 0 })
    return this
  }

  initialize = () => {
    if (!this.providers.length)
      throw new Error(
        'Cannot initialize an empty provider. Call `addProvider` before this function.',
      )

    const [{ provider }] = this.providers

    return new Proxy(provider, {
      get: (_, p, receiver) => {
        const target = this.providers[this.activeProvider]
        const prop = Reflect.get(target.provider, p, receiver)
        if (typeof prop !== 'function') return prop
        return this.proxy(target, prop)
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

  private benchmark = (target: ProviderProxy<T>) => {
    const start = performance.now()
    return () => {
      target.ms = Math.round(performance.now() - start)
    }
  }

  private proxy = (
    target: ProviderProxy<T>,
    prop: Function,
    retries: number = this.retries,
  ) => {
    return (...args: any[]): any => {
      const record = this.benchmark(target)
      let re: any | Promise<any>

      // Retry on sync functions
      try {
        re = prop.apply(target.provider, args)
        if (!re?.then) {
          record()
          return re
        }
      } catch (er: unknown) {
        record()
        if (retries <= 0) throw er
        return this.proxy(this.switch(), prop, retries - 1)
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
          return this.proxy(this.switch(), prop, retries - 1)(...args)
        })
    }
  }
}
