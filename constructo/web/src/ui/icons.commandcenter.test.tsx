import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  ScaleIcon, BuildingIcon, ChartBarIcon, ShieldIcon, UsersIcon,
  CompassIcon, SunIcon, MoonIcon, MonitorIcon, PanelLeftIcon,
} from './icons'

const icons = {
  ScaleIcon, BuildingIcon, ChartBarIcon, ShieldIcon, UsersIcon,
  CompassIcon, SunIcon, MoonIcon, MonitorIcon, PanelLeftIcon,
}

describe('command-center icons', () => {
  it.each(Object.entries(icons))('%s renders an svg and honours the title a11y prop', (_n, Icon) => {
    const { container } = render(<Icon title="x" />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.querySelector('title')?.textContent).toBe('x')
  })
})
