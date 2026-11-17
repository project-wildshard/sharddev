import { render } from 'preact'

import { App } from './app.tsx'

const container = document.querySelector('#root')
if (container === null) {
  throw new Error('sharddev: #root element is missing')
}

render(<App />, container)
