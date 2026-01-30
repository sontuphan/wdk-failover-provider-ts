import { describe } from 'noba'
import FailoverProvider from 'wdk-failover-provider'

class Animal {
  constructor(
    public readonly sound: string = '...',
    public readonly pace: number = 300,
  ) {}

  speak = async () => {
    await new Promise((r) => setTimeout(r, this.pace))
    return this.sound
  }
}

describe('Mocked providers', ({ describe, test }) => {
  class Cat extends Animal {
    constructor() {
      super('meow')
    }
  }

  class Dog extends Animal {
    constructor() {
      super('woof')
    }
  }

  class Cockroach extends Animal {
    constructor() {
      super()
    }

    speak = async () => {
      throw new Error("A cockroach doesn't speak, it flies")
    }
  }

  test('should accept polymorphism', async ({ expect }) => {
    const animal = new FailoverProvider<Animal>()
      .addProvider(new Cat())
      .addProvider(new Dog())
      .initialize()

    const spoke = await animal.speak()
    expect(spoke).to.be('meow')
  })

  test('should switch provider', async ({ expect }) => {
    const animal = new FailoverProvider<Animal>()
      .addProvider(new Cockroach())
      .addProvider(new Dog())
      .addProvider(new Cat())
      .initialize()

    const spoke = await animal.speak()
    expect(spoke).to.be('woof')
  })

  test('should retry 1 times and fail', async ({ expect }) => {
    const animal = new FailoverProvider<Animal>({ retries: 1 })
      .addProvider(new Cockroach())
      .addProvider(new Cockroach())
      .addProvider(new Cat())
      .addProvider(new Dog())
      .initialize()

    expect(async () => {
      await animal.speak()
    }).rejects("doesn't speak")
  })

  describe('shouldRetryOn config', ({ test }) => {
    test('should not retry on custom shouldRetryOn', async ({ expect }) => {
      const animal = new FailoverProvider<Animal>({
        shouldRetryOn: (error) => {
          if (error instanceof Error) {
            return !/cockroach/.test(error.message)
          }
          return true
        },
      })
        .addProvider(new Cockroach())
        .addProvider(new Cat())
        .addProvider(new Dog())
        .initialize()

      expect(async () => {
        await animal.speak()
      }).rejects("doesn't speak")
    })

    test('should retry on the default shouldRetryOn', async ({ expect }) => {
      const animal = new FailoverProvider<Animal>()
        .addProvider(new Cockroach())
        .addProvider(new Cat())
        .addProvider(new Dog())
        .initialize()

      const spoken = await animal.speak()
      expect(spoken).to.be('meow')
    })
  })
})
