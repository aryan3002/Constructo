// Issue-report photos are attached to the request (T6). Under src/ only.
import { photoUploadMessage, sendIssueReport } from '../screens/homeowner/issue_photos.util'

describe('sendIssueReport', () => {
  it('sends only the ids that uploaded, with the real count in the detail', async () => {
    const upload = jest.fn(async (p: string) => {
      if (p === 'b') throw new Error('network')
      return { id: `id-${p}` }
    })
    const send = jest.fn(async (body: { detail: string | undefined; photo_ids: string[] }) => body)
    const { result, warning } = await sendIssueReport({
      photos: ['a', 'b', 'c'],
      upload,
      buildDetail: (n) => `Leak [${n} photos attached]`,
      send,
      lang: 'en',
    })
    expect(upload).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ detail: 'Leak [2 photos attached]', photo_ids: ['id-a', 'id-c'] })
    expect(warning).toBe("1 of 3 photos didn't upload. Your report was sent with 2.")
  })

  it('has no warning when every photo uploads', async () => {
    const { result, warning } = await sendIssueReport({
      photos: ['a', 'b'],
      upload: async (p) => ({ id: p }),
      buildDetail: () => undefined,
      send: async (body) => body.photo_ids,
      lang: 'en',
    })
    expect(result).toEqual(['a', 'b'])
    expect(warning).toBeNull()
  })

  it('still sends the report when every upload fails', async () => {
    const { result, warning } = await sendIssueReport({
      photos: ['a', 'b'],
      upload: async () => {
        throw new Error('x')
      },
      buildDetail: (n) => String(n),
      send: async (body) => body,
      lang: 'hi',
    })
    expect(result).toEqual({ detail: '0', photo_ids: [] })
    expect(warning).toBe('कोई फ़ोटो अपलोड नहीं हुई। आपकी रिपोर्ट बिना फ़ोटो के भेजी गई।')
  })

  it('sends a report with no photos without uploading anything', async () => {
    const upload = jest.fn()
    const { result, warning } = await sendIssueReport({
      photos: [],
      upload,
      buildDetail: () => 'x',
      send: async (body) => body.photo_ids,
      lang: 'en',
    })
    expect(upload).not.toHaveBeenCalled()
    expect(result).toEqual([])
    expect(warning).toBeNull()
  })
})

describe('photoUploadMessage', () => {
  it('words partial and total failures in both languages', () => {
    expect(photoUploadMessage({ total: 3, attached: 2 }, 'en')).toBe(
      "1 of 3 photos didn't upload. Your report was sent with 2.",
    )
    expect(photoUploadMessage({ total: 1, attached: 0 }, 'en')).toBe(
      "Your photo didn't upload. Your report was sent without it.",
    )
    expect(photoUploadMessage({ total: 3, attached: 0 }, 'en')).toBe(
      'None of your 3 photos uploaded. Your report was sent without photos.',
    )
    expect(photoUploadMessage({ total: 3, attached: 2 }, 'hi')).toBe(
      '3 में से 1 फ़ोटो अपलोड नहीं हुई। आपकी रिपोर्ट 2 फ़ोटो के साथ भेजी गई।',
    )
    expect(photoUploadMessage({ total: 2, attached: 2 }, 'hi')).toBeNull()
  })
})
