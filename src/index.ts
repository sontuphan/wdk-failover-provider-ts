export type FailoverProviderConfig = {
  stallTimeout?: number
  retries?: number
}

export type ProviderProxy<T> = {
  provider: T
  // Currently we use getBlockNumber or equivalence for health check
  ping: (provider: T) => Promise<string>
  // The last response duration
  ms: number
}

export default class FailoverProvider<T extends object> {
  private activeProvider: number = 0
  public providers: Array<ProviderProxy<T>> = []

  private readonly stallTimeout: number
  private readonly retries: number

  constructor({
    stallTimeout = 3000,
    retries = 3,
  }: FailoverProviderConfig = {}) {
    this.stallTimeout = stallTimeout
    this.retries = retries
  }

  addProvider = <P extends T>(provider: P, ping: () => Promise<string>) => {
    this.providers.push({ provider, ping, ms: 0 })
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

class Car {
  constructor(
    public readonly sound: string,
    public readonly duration: number,
  ) {}

  start = async () => {
    await new Promise((r) => setTimeout(r, this.duration))
    return true
  }

  run = (modification: string = '') => {
    console.log(modification || this.sound)
  }
}

class Subaru extends Car {
  constructor() {
    super('Subaru', 1000)
  }

  start = async () => {
    await new Promise((r) => setTimeout(r, this.duration))
    throw new Error('Broken engine')
  }
}

class Honda extends Car {
  constructor() {
    super('Honda', 3000)
  }

  start = async () => {
    await new Promise((r) => setTimeout(r, this.duration))
    throw new Error('Broken engine')
  }
}

;(async () => {
  const failover = new FailoverProvider<Car>()
  const provider = failover
    .addProvider(new Honda(), async () => '')
    .addProvider(new Subaru(), async () => '')
    .initialize()

  try {
    await provider.start()
  } catch {
    provider.run()
  } finally {
    console.log(failover.providers)
  }
})()
