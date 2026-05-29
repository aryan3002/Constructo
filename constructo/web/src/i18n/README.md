# i18n — internationalization scaffolding

Lightweight, dependency-free i18n (English + Hindi) for the Constructo web app.
Feature agents add **keys**, never hardcoded user-facing strings.

## Usage

```tsx
import { useT, useLanguage } from '../i18n'

function ApproveButton() {
  const t = useT()
  return <Button>{t('action.approve')}</Button>          // "Approve" / "मंज़ूर करें"
}

function LangToggle() {
  const { lang, setLanguage } = useLanguage()
  return <button onClick={() => setLanguage(lang === 'en' ? 'hi' : 'en')}>{t('language.label')}</button>
}
```

Interpolation uses `{placeholder}`:

```tsx
t('common.all_sites', { count: 3 })   // "All Sites (3)"
```

The provider is already mounted at the app root (`main.tsx`), so any component
can call `useT()` / `useLanguage()`.

## Adding strings (the convention)

1. Add the key to **`en.ts` first** — it is the source of truth and defines the
   `TranslationKey` type.
2. Mirror the key in **`hi.ts`**. `hi` is typed `Record<TranslationKey, string>`,
   so a missing key is a **compile error** (`npm run build` fails). Untranslated
   values may temporarily duplicate the English string; at runtime an absent key
   falls back to English, then to the raw key.

### Key naming

| Prefix      | Use for                                  | Example                     |
|-------------|------------------------------------------|-----------------------------|
| `app.*`     | product-level strings                    | `app.name`                  |
| `nav.*`     | bottom-tab / navigation labels           | `nav.approvals`             |
| `action.*`  | buttons / verbs                          | `action.approve`            |
| `common.*`  | shared words (loading, error, counts)    | `common.loading`            |
| `<feature>.*` | everything owned by one feature screen | `payments.title`, `permits.status.applied` |

Keys are flat, dot-separated strings (`feature.element[.modifier]`). Group a
feature's strings under its own prefix so bundles stay navigable.

## Language persistence

`setLanguage(lang)`:
1. updates React state (immediate re-render),
2. writes `localStorage['cstk.lang']`,
3. sets `<html lang>`,
4. **best-effort** `PATCH /api/v1/users/me { language }` (fire-and-forget).

Initial language = `localStorage['cstk.lang']` → else browser language (`hi*` →
Hindi) → else `en`.

### Backend hook (for a feature agent)

The `language` column already exists on `users` (Phase B0 migration, default
`'en'`). The remote-persist call targets `PATCH /api/v1/users/me` with body
`{ "language": "hi" }`. That endpoint does **not exist yet** — the call is
wrapped in try/catch and silently no-ops until a feature agent adds it. When you
add the endpoint, language sync starts working with no frontend change.
