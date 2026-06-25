import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Company } from '../../api/auth'

const getCompany = vi.fn()
const updateCompany = vi.fn()
const presignCompanyLogo = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    getCompany: (...a: unknown[]) => getCompany(...a),
    updateCompany: (...a: unknown[]) => updateCompany(...a),
    presignCompanyLogo: (...a: unknown[]) => presignCompanyLogo(...a),
  },
}))

const { CompanyProfile } = await import('./CompanyProfile')

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'co-1',
    name: 'Verma Builders',
    gstin: null,
    address: null,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    logo_url: null,
    ...over,
  }
}

function renderForm(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <CompanyProfile />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('CompanyProfile (RHF + Zod)', () => {
  beforeEach(() => {
    getCompany.mockReset()
    updateCompany.mockReset()
    presignCompanyLogo.mockReset()
    getCompany.mockResolvedValue(company())
    updateCompany.mockImplementation((patch) => Promise.resolve(company(patch)))
  })

  it('prefills the current company name + currency for an owner', async () => {
    getCompany.mockResolvedValue(company({ currency: 'USD' }))
    renderForm('owner')
    expect(await screen.findByDisplayValue('Verma Builders')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('USD')).toBeInTheDocument()
  })

  it('blocks an empty name and does not call the API', async () => {
    renderForm('owner')
    const input = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i)
    expect(updateCompany).not.toHaveBeenCalled()
  })

  it('saves the full profile, sending empty optionals as null', async () => {
    renderForm('owner')
    const name = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(name)
    await userEvent.type(name, 'Rao Constructions')
    await userEvent.type(screen.getByLabelText(/GST number/i), '29ABCDE1234F1Z5')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateCompany).toHaveBeenCalled())
    expect(updateCompany.mock.calls[0][0]).toEqual({
      name: 'Rao Constructions',
      gstin: '29ABCDE1234F1Z5',
      address: null, // left blank → null, not ""
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    })
    expect(await screen.findByText(/company saved/i)).toBeInTheDocument()
  })

  it('is read-only for a non-owner (no inputs, no save)', async () => {
    getCompany.mockResolvedValue(company({ gstin: '29ABCDE1234F1Z5' }))
    renderForm('pm')
    // Company name appears in both the letterhead preview and the read-only dl
    expect((await screen.findAllByText('Verma Builders')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('29ABCDE1234F1Z5').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Helper: simulate a file-input change. fireEvent.change with a target.files
// array is the correct JSDOM approach (mirrors ChatComposer.test.tsx).
// ---------------------------------------------------------------------------
function triggerFileInput(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

// ---------------------------------------------------------------------------
// Logo uploader
// ---------------------------------------------------------------------------

describe('CompanyProfile — logo uploader', () => {
  beforeEach(() => {
    getCompany.mockReset()
    updateCompany.mockReset()
    presignCompanyLogo.mockReset()
    getCompany.mockResolvedValue(company())
    updateCompany.mockImplementation((patch) => Promise.resolve(company(patch)))
  })

  it('owner sees the Upload logo button', async () => {
    renderForm('owner')
    expect(await screen.findByRole('button', { name: /upload logo/i })).toBeInTheDocument()
  })

  it('with logo_url set, renders the img and Remove button', async () => {
    getCompany.mockResolvedValue(company({ logo_url: 'https://example.com/logo.png' }))
    renderForm('owner')
    await screen.findByRole('button', { name: /upload logo/i })
    // Images use alt="" (decorative) so role is "presentation" not "img"
    const imgs = document.querySelectorAll('img[src="https://example.com/logo.png"]')
    expect(imgs.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('successful upload calls presignCompanyLogo then updateCompany with logo_key', async () => {
    const putUrl = 'https://r2.example.com/put?sig=abc'
    const logoKey = 'branding/co-1/logo.png'
    presignCompanyLogo.mockResolvedValue({
      key: logoKey,
      put_url: putUrl,
      upload_mode: 'presigned',
    })
    updateCompany.mockImplementation((patch) =>
      Promise.resolve(company({ logo_url: 'https://example.com/logo.png', ...patch })),
    )
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    renderForm('owner')
    await screen.findByRole('button', { name: /upload logo/i })

    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' })
    triggerFileInput(file)

    await waitFor(() => expect(presignCompanyLogo).toHaveBeenCalledWith({ content_type: 'image/png' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        putUrl,
        expect.objectContaining({ method: 'PUT', body: file }),
      ),
    )
    await waitFor(() => expect(updateCompany).toHaveBeenCalledWith({ logo_key: logoKey }))

    vi.unstubAllGlobals()
  })

  it('upload_mode=unavailable shows the unavailable note', async () => {
    presignCompanyLogo.mockResolvedValue({
      key: 'branding/mock/logo.png',
      put_url: null,
      upload_mode: 'unavailable',
    })

    renderForm('owner')
    await screen.findByRole('button', { name: /upload logo/i })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bytes'], 'logo.png', { type: 'image/png' })
    // Wrap in act to flush async state updates (setLogoErr) after the presign mock resolves.
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(presignCompanyLogo).toHaveBeenCalledWith({ content_type: 'image/png' })
    expect(screen.getByRole('alert')).toHaveTextContent(/available in this environment/i)
  })

  it('non-owner does not see the Upload logo button', async () => {
    renderForm('pm')
    // Wait for the component to fully render (letterhead preview is always shown)
    await screen.findByText(/how your reports will look/i)
    expect(screen.queryByRole('button', { name: /upload logo/i })).not.toBeInTheDocument()
  })
})
