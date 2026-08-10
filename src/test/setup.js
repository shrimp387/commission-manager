import '@testing-library/jest-dom'

// Reset localStorage before each test
beforeEach(() => {
  localStorage.clear()
})

// Silence React act() warnings in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('act(') || args[0].includes('ReactDOM.render'))
    ) {
      return
    }
    originalError(...args)
  }
})
afterAll(() => {
  console.error = originalError
})
