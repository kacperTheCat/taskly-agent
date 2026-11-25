import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { describeProgress } from './progress'

const done = { ...todoFixture, completed: true }
const active = { ...todoFixture, completed: false }

it.each([
  [[], 'No tasks yet.'],
  [[done, done], 'All 2 tasks done.'],
  [[done, active, active], '1 of 3 tasks done.'],
  [[active], '0 of 1 tasks done.'],
])('describes progress for %j', (todos, expected) => {
  expect(describeProgress(todos)).toBe(expected)
})
