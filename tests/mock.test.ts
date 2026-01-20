import { describe } from 'noba'
import FailoverProvider from 'wdk-failover-provider'

class Animal {
  constructor(
    public readonly sound: string = '...',
    public readonly pace: number = 300,
  ) {}

  speak = async (log = console.log) => {
    await new Promise((r) => setTimeout(r, this.pace))
    log(this.sound)
    return true
  }
}

describe('Mocked providers', ({ test }) => {
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

  test('should accept polymorphism', async ({ log, expect }) => {
    const animal = new FailoverProvider<Animal>()
      .addProvider(new Cat())
      .addProvider(new Dog())
      .initialize()

    const spoke = await animal.speak(log)
    expect(spoke).to.be(true)
  })

  test('should switch provider', async ({ log, expect }) => {
    const animal = new FailoverProvider<Animal>()
      .addProvider(new Cockroach())
      .addProvider(new Cat())
      .addProvider(new Dog())
      .initialize()

    const spoke = await animal.speak(log)
    expect(spoke).to.be(true)
  })

  test('should retry 1 times and fail', async ({ log, expect }) => {
    const animal = new FailoverProvider<Animal>({ retries: 1 })
      .addProvider(new Cockroach())
      .addProvider(new Cockroach())
      .addProvider(new Cat())
      .addProvider(new Dog())
      .initialize()

    expect(async () => {
      await animal.speak(log)
    }).rejects("doesn't speak")
  })
})
