# Chat consistency audit — all roles (2026-06-28)

Audited every role's chat after the WhatsApp-ification (PRs #220 homeowner, #221
owner/architect/pm, #222 supervisor). All **thread** screens now render via the
shared `src/chat/MessageFeed.tsx`. This note records what's consistent, the gaps
found, what's fixed in this pass, and what's deliberately deferred.

## Thread screens (the chat itself)

| Role | Screen | Renders via MessageFeed |
|---|---|---|
| Homeowner | `app/(homeowner)/messages/[id].tsx` | ✓ |
| Owner | `app/(contractor)/owner/chat/[id].tsx` | ✓ |
| Architect, PM | re-export owner | ✓ |
| Supervisor | `app/(contractor)/supervisor/chat.tsx` | ✓ |
| Accountant, Mukadam | — | no chat screen (by design; internal roles) |

### Consistent across all three (PASS)
Bubbles + own/other tint · sender names + avatars on others · day separators ·
same-sender grouping · clustered timestamps · inverted/sticky scroll · delivery
ticks on own messages · capture cards kept inline · cache-first load + offline
error handling.

## Gaps found

### Fixed in this pass
1. **Quote-reply snippet missing (owner + homeowner).** Only supervisor passed
   `replySnippetFor` to MessageFeed, so only it rendered the quoted message above
   a reply bubble. Owner + homeowner support replying (composer banner) but the
   in-bubble quote was absent → inconsistent + un-WhatsApp. **Fix:** add a `byId`
   lookup + `replySnippetFor` to owner and homeowner.
2. **Owner couldn't send photos.** Homeowner + supervisor have a camera that
   pushes the photo-preview route; owner's composer had none → can't share a
   photo at all. **Fix:** add a camera button to owner's composer wired to the
   same photo-preview flow + a send-on-return effect.

### Deferred (noted, not built now)
- **Composer architectures differ** (homeowner ChatComposer kit vs owner/
  supervisor inline). Largely role-justified (supervisor = voice/slash/capture
  for the field; homeowner = camera/@ask; owner = simple). A future unification
  could share one composer, but the affordances genuinely differ. Not a bug.
- **Voice on owner.** Supervisor is voice-first (mukadam); owner is desk-bound.
  Photo parity matters more; voice can come later.
- **Product features WhatsApp has that we don't** (typing indicator, message
  search, reactions, forward, pin, edit/delete, multi-photo album). These are
  net-new features, not consistency gaps — out of scope for this pass.
- **Header participant avatars** only on homeowner (3-circle cluster). Owner/
  supervisor headers show title only. Minor; future polish.

## Verification
Code-level: `tsc --noEmit` + `npm test` + web/iOS bundle compile. On-device
verification of contractor roles still pending (needs per-role login).
