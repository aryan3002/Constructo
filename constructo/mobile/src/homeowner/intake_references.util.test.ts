// Intake reference photos are really uploaded (T6). Under src/ only.
import {
  saveStylePicks,
  uploadIntakeReference,
} from '../screens/homeowner/intake_references.util'

describe('uploadIntakeReference', () => {
  it('posts the uploaded key, never the device URI', async () => {
    const upload = jest.fn(async () => ({ image_url: 'homeowner/site-1/design/abc.jpg' }))
    const create = jest.fn(async () => ({}))
    const key = await uploadIntakeReference(
      { uri: 'file:///var/mobile/picker/IMG_1.jpg', fileName: 'IMG_1.jpg', mimeType: 'image/png' },
      { upload, create },
    )
    expect(upload).toHaveBeenCalledWith({
      uri: 'file:///var/mobile/picker/IMG_1.jpg',
      name: 'IMG_1.jpg',
      type: 'image/png',
    })
    expect(create).toHaveBeenCalledWith({ image_url: 'homeowner/site-1/design/abc.jpg', source: 'upload' })
    expect(JSON.stringify(create.mock.calls)).not.toContain('file://')
    expect(key).toBe('homeowner/site-1/design/abc.jpg')
  })

  it('never creates a reference when the upload fails', async () => {
    const create = jest.fn()
    await expect(
      uploadIntakeReference(
        { uri: 'file:///x.jpg' },
        {
          upload: async () => {
            throw new Error('offline')
          },
          create,
        },
      ),
    ).rejects.toThrow('offline')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('saveStylePicks', () => {
  it('reports failures and skips picks already saved', async () => {
    const post = jest.fn(async (c: string) => {
      if (c === 'boho') throw new Error('500')
    })
    const out = await saveStylePicks(['modern', 'boho', 'classic'], new Set(['classic']), post)
    expect(post).toHaveBeenCalledTimes(2)
    expect(out).toEqual({ saved: ['modern'], failed: ['boho'] })
  })
})
