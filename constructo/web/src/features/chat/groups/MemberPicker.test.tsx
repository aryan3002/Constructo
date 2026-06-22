/**
 * MemberPicker — unit tests (web Phase C). A checkbox multi-select over the
 * group "addable users" list, reused by create + manage.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberPicker } from './MemberPicker'
import type { AddableUser } from '../../../api/groups'

const users: AddableUser[] = [
  { user_id: 'u1', name: 'Asha', role: 'supervisor', already_member: false },
  { user_id: 'u2', name: 'Ravi', role: 'accountant', already_member: true },
]

describe('MemberPicker', () => {
  it('lists users and toggles selection', () => {
    const onToggle = vi.fn()
    render(<MemberPicker users={users} selected={new Set()} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText(/Asha/))
    expect(onToggle).toHaveBeenCalledWith('u1')
  })

  it('renders an already-member as checked + disabled', () => {
    render(<MemberPicker users={users} selected={new Set()} onToggle={() => {}} />)
    const ravi = screen.getByLabelText(/Ravi/) as HTMLInputElement
    expect(ravi.checked).toBe(true)
    expect(ravi.disabled).toBe(true)
  })

  it('reflects the selected set', () => {
    render(<MemberPicker users={users} selected={new Set(['u1'])} onToggle={() => {}} />)
    expect((screen.getByLabelText(/Asha/) as HTMLInputElement).checked).toBe(true)
  })

  it('shows an empty hint when there is no one to add', () => {
    render(<MemberPicker users={[]} selected={new Set()} onToggle={() => {}} />)
    expect(screen.getByText(/no one to add/i)).toBeInTheDocument()
  })
})
