import { extractPinterestUrls } from './pin_paste.util'

describe('extractPinterestUrls', () => {
  test('pulls only pinterest/pin.it URLs out of a mixed blob, skipping other hosts', () => {
    const blob = [
      'Check these out:',
      'https://pin.it/abc123',
      'https://www.instagram.com/p/xyz/',
      'https://www.pinterest.com/pin/456789/',
    ].join('\n')
    expect(extractPinterestUrls(blob)).toEqual([
      'https://pin.it/abc123',
      'https://www.pinterest.com/pin/456789/',
    ])
  })

  test('caps at 10 even when 12 valid pin links are pasted', () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://pin.it/pin${i}`)
    const result = extractPinterestUrls(urls.join('\n'))
    expect(result).toHaveLength(10)
    expect(result).toEqual(urls.slice(0, 10))
  })

  test('returns [] for an empty string', () => {
    expect(extractPinterestUrls('')).toEqual([])
  })

  test('returns [] when there are no pinterest links at all', () => {
    expect(extractPinterestUrls('just some text with no links')).toEqual([])
  })

  test('splits on whitespace, newlines, and commas', () => {
    const blob = 'https://pin.it/a,https://pin.it/b\nhttps://pin.it/c https://pin.it/d'
    expect(extractPinterestUrls(blob)).toEqual([
      'https://pin.it/a',
      'https://pin.it/b',
      'https://pin.it/c',
      'https://pin.it/d',
    ])
  })

  test('dedupes while preserving first-seen order', () => {
    const blob = 'https://pin.it/a https://pin.it/b https://pin.it/a'
    expect(extractPinterestUrls(blob)).toEqual(['https://pin.it/a', 'https://pin.it/b'])
  })

  test('skips unparsable tokens without throwing', () => {
    const blob = 'not a url, https://pin.it/ok, ,,,'
    expect(extractPinterestUrls(blob)).toEqual(['https://pin.it/ok'])
  })

  test('accepts pinterest subdomain hosts (e.g. www., in.)', () => {
    const blob = 'https://in.pinterest.com/pin/111/ https://www.pinterest.co.uk/pin/222/'
    expect(extractPinterestUrls(blob)).toEqual([
      'https://in.pinterest.com/pin/111/',
      'https://www.pinterest.co.uk/pin/222/',
    ])
  })

  test('rejects a host with "pinterest" as a prefix of another word (not a subdomain)', () => {
    // Mirrors the backend host rule exactly: "notpinterest.com" does not match
    // (^|\.)(pinterest\.[a-z.]+|pin\.it)$ since "pinterest." isn't preceded by
    // start-of-string or a dot boundary here — "not" abuts it directly.
    const blob = 'https://notpinterest.com/pin/1/'
    expect(extractPinterestUrls(blob)).toEqual([])
  })
})
