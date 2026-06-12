/**
 * Minimal ambient declaration for `react-test-renderer` so TypeScript does not
 * error on the missing types when `@types/react-test-renderer` is not installed.
 * Covers the `create` + `act` surface used by src/ui/*.test.tsx.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface ReactTestInstance {
    type: string | React.ComponentType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: any
    parent: ReactTestInstance | null
    children: Array<ReactTestInstance | string>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findByProps(props: Record<string, any>): ReactTestInstance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findAllByProps(props: Record<string, any>): ReactTestInstance[]
    findByType(type: React.ComponentType): ReactTestInstance
    findAllByType(type: React.ComponentType): ReactTestInstance[]
  }

  interface ReactTestRenderer {
    toJSON(): object | null
    root: ReactTestInstance
    update(element: ReactElement): void
    unmount(): void
  }

  function create(element: ReactElement): ReactTestRenderer
  function act(callback: () => void | Promise<void>): void
}
