# Handoff: add the voiceover to Neev film C

Written 2026-10-28 for a fresh chat that adds the voice to film C ("सब ठीक है?",
the Neev intro). Everything is on branch `claude/bold-goodall-11ksuo` (pushed).
There is no PR; don't open one unless the founder asks.

## Where things stand

- **Film C is finished without a voice**, in `constructo/video/`:
  - picture in `src/films/c/scenes.tsx`
  - score in `scripts/audio/score.py` (`compose_c`)
  - cut sheet `"c"` in `src/films/cuts.json`
  - YouTube 1:40 (`NeevC-YouTube`) and Reel 0:46 (`NeevC-Reel`)
  - the founder has these renders; the words on screen carry the story
- **The voice script is written:** `src/films/c/vo.json`.
  - A narrator in warm, unhurried Indian English.
  - The opening exchange in Hindi, filtered to sound like a call:
    - the owner asks "काम कैसा चल रहा है?"
    - Ramesh, on site, answers "सब ठीक है, सर।"
  - Each line has a section, a start time `at` (seconds into that section) and an expected length `dur`.
- **The voice pipeline is built and dry-run tested:** `scripts/audio/vo.py` (`npm run vo -- …`). It speaks ElevenLabs (the default) and Google Cloud Text-to-Speech.
- **The founder chose ElevenLabs.** They start on the free plan (10,000 credits; the voiceover is about 1,500 characters, about 1 credit each with `eleven_multilingual_v2`). They also have a Claude startup program promo for a 12-month paid plan.
  - **Licence:** ElevenLabs' free plan doesn't include commercial use. Drafts are fine; before the film is published, the account must be on a paid plan (the promo). Say this once when you deliver.
- **Fallbacks:** Google TTS (`GOOGLE_TTS_API_KEY`, `--provider google`), or a recording of the founder, which drops in with `npm run vo -- duck`.

## Status, 2026-10-28 (audition done, waiting on picks and the paid plan)

- **The free plan can't make this voiceover at all.** Library voices return 402 `paid_plan_required` ("Free users cannot use library voices via the API") from any machine, whatever the library's `free_users_allowed` flag says; Voice Design is paid-only (403); the 21 premade voices are American, British or Australian. Credits aren't the issue: the script is 1,244 characters. Every Indian-English and Hindi voice needs a paid plan.
- **From cloud servers, the free plan is blocked outright too.** Every text-to-speech call returns 401 `detected_unusual_activity` ("Free Tier access has been disabled … proxy or VPN"), including premade voices. Library reads (`voices`, `shared-voices`) still work. `make` needs the account on a paid plan (the promo). `vo.py` now says this plainly when it happens.
- **Preview host:** about a third of the library's preview files live on `api.us.elevenlabs.io`, which is not on the network allowlist. The audition used only voices whose previews are on `storage.googleapis.com`. Allowing `api.us.elevenlabs.io` would widen the choice; nothing else needs it.
- **The audition was curated by hand**, not the stock `audition` command: 12 narrators (warm, narrative or commercial, Indian English; 6 men, 6 women) and 12 Hindi men (6 suggested for the owner, 6 for Ramesh, some with Bhojpuri or Bihari accents). Each Hindi voice was also played through the film's phone filter. Casting page: https://claude.ai/artifact/3Yj5XZwoSmUAu1pJE96oAv
- The samples are each voice's own library preview, not our lines. Once the plan is paid, have the picks read the real hook lines before the full `make`; it costs a few hundred credits.
- **Next:** take the founder's three numbers from the table below, then `npm run vo -- make --narrator <ref> --owner <ref> --site <ref>`.

Narrator (en-IN):

| # | Voice | Reference |
|---|---|---|
| 1 | Rishab | `eleven:cc6a9ad637fc6a52899791952d7a4e5146ae59d2c5603a0801cb82126c5e590f/MTqBov4zzTaS7e2ZO6wS` |
| 2 | Santhi Prakash | `eleven:4396be8abbcff558973963f17ed5edbff27a7086a5f743c18caf250eec95f1c8/UCYikFhJ1MxdJf40ZcRX` |
| 3 | Aaditya | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/nz8zH5px6I7CAT1IHAwU` |
| 4 | Pranab | `eleven:ae76cffa9f2b7c2cd9dc13c588986b40fba3a679114686f181cc3a760f85e30c/niLTODfB1j2nXIbp3M14` |
| 5 | Lovekesh | `eleven:b385e1850cb0553c298ed71864fb4d8ad37073ccd72cd5e871dab2f48d4395d7/RdIqmYG6PHfQ62pRoH08` |
| 6 | Anuj Bhatia | `eleven:2ac60c98ccb58aee264181dfa21ae14964889c1d2e3831e7c661520be7f7fd43/nAXOV8RqzafF7mI2EBhz` |
| 7 | Ziina | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/N9mNpKpj7Er4N23jJ4W3` |
| 8 | Surabhi | `eleven:01cf590a1f2f2674cc8890788b11b821cf7b562d7b98d4fce1d7b58b93c6f24d/ch9J8IB6HKlEHQaWQFdk` |
| 9 | Rashi | `eleven:bccb356afd3d45b99fc27a4b56819e5321002fa4c0dc6efd706fe67ff72f86f7/gM97WcXnv5iYPHhVZJN8` |
| 10 | AB | `eleven:0e14a11061b46ffbb13ad97e3373b44386ed39b37e5c085c4c4589ff580d99fe/JSZ6mrlwqYAjKBo9OVaS` |
| 11 | Ria | `eleven:ae132125ec20aa5ff83cf87a80e8d22efe82bba057f13f8840e09ee4d0e9c0c5/M6udCbeLpbqc4ZtMMDGJ` |
| 12 | Veda | `eleven:3bbd830df794789c268c07cf375e7acdfee53deb66fa27ff738f91b084d40f88/pIhyYpeIfZjcBDvduSln` |

Owner / Ramesh (hi-IN):

| # | Voice | Reference |
|---|---|---|
| 1 | Rohit | `eleven:09231f1bca1a10b2c37dfcb26c2202e64eea6c0ff2735c07954123d5861f686f/SmpN7GDUWZlw5JBHA73U` |
| 2 | Pavan M | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/Py80426yZ0W2xj25PH5q` |
| 3 | Aarav R | `eleven:3b7fa88bdfd54c21402550e5b63123193b327e568a82394b51e74b9e55037bee/x9wViLHrpGxKBhkUybpR` |
| 4 | Avinash | `eleven:7515a67a8887ebf544e2925bf41b85d86b92f8eed50f32d1676c4705900c4631/KjB3pyRrta1C1C2zoshr` |
| 5 | Vyom | `eleven:1bd88d7943d155480db2469284ef55cbfc2aef7a6a7df38253f0d24a947947bc/zx1lYyhBlNDJZ76WzkhR` |
| 6 | Shivank S | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/JvXnN4vCCagzhSTjMMjl` |
| 7 | Hemant M | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/NhwTI3t2DXME1ogDNGJX` |
| 8 | Chandan | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/0LYOfRJKHz3pxHvP9Q2G` |
| 9 | Ravi | `eleven:6c7a6ede9b7054386b346e2c7e8d64b1cb96235826c55788c76b22202c84488b/jNTHBl47oA9XOWkV0KRe` |
| 10 | Guddu | `eleven:7398804d9eaf2f463899a907587c33a390591775784f87857b6d0e1e4e3e66f6/EYuRJHRGEiUhUtCLc33A` |
| 11 | Gajendra | `eleven:c0c7d01bfa452287ca8221ec9bd14fa49d2b95ac3fa4809ccb1293f84d1136c3/6xalENe4gtaDq8XTGd7G` |
| 12 | Amarjeet Chauhan | `eleven:b8e861ce368682622875d4768a192e7b7598b1df9ab8ea192da2a50e53f22f3d/z2K7IKTGiFuuLmVXQWKl` |

## What you need

- **The key.** `ELEVENLABS_API_KEY` must be set in this environment (an environment secret or variable), from ElevenLabs → profile → API Keys.
  - **Never print the key.** Never ask the founder to paste it into the chat.
  - If it's missing, tell them to add it via the cloud environment menu → Edit, and to start a new session.
- **The host.** `api.elevenlabs.io` must be allowed under Network access (it was blocked before the founder changed it). If the voice previews' host is blocked, `audition` synthesizes the samples instead (about 120 credits a voice). Don't route around a blocked host; name it to the founder.

## Steps

```sh
cd constructo/video
npm install
export REMOTION_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell   # path in Claude's cloud containers
npm run audio                # sound effects + scores (the WAVs aren't committed)
npm run vo -- voices         # proves the key works; lists the account's voices
npm run vo -- audition       # Indian-English and Hindi voices from the library, numbered → out/vo/audition/en-IN.mp3, hi-IN.mp3
```

1. **Audition.** Send the founder the two audition MP3s with SendUserFile, with the numbered list the command printed, and ask them to pick by number:
   - **narrator** (from en-IN)
   - **owner**: the man who asks; he is called "sir" (from hi-IN)
   - **site**: Ramesh, who answers (from hi-IN, clearly different from the owner)
2. **Make.** Run `npm run vo -- make --narrator eleven:<owner>/<id> --owner … --site …`, using the `eleven:…` references the audition printed. The first use adds each library voice to the account.
   - It saves the cast to `vo.json`.
   - It writes `public/audio/vo/c-{youtube,reel}.wav`, the ducked scores, and `out/final/NeevC-*.srt`.
   - It prints a timing table. Fix every line flagged "overlaps" or "tight": nudge `at` in `vo.json`, try `--rate 1.05` for the narrator, or shorten the line. Then re-run `make`; synthesis is cached, so it's cheap.
   - A line may run a little past the end of its section, but must not run into the next line.
3. **Render and finish.**
   ```sh
   VO=1 node scripts/render.mjs NeevC-YouTube NeevC-Reel
   scripts/finish.sh out/films/NeevC-YouTube.mp4 out/films/NeevC-Reel.mp4
   ```
4. **Check before sending.**
   - The finished files read -14 LUFS integrated and at most -1 dBTP: `ffmpeg -i … -af ebur128=peak=true -f null -`.
   - Speech sits clearly over the music: the ducking is 9 dB.
   - Contact sheets show no change to the picture.
   - In the Reel, the opening lines land with the chat bubbles (0.2 s and 1.5 s), and "But is it?" lands with the slam (2.8 s).
5. **Deliver.**
   - Send `out/final/NeevC-YouTube.mp4`, `NeevC-Reel.mp4` and the `.srt` files.
   - Update the films page: https://claude.ai/artifact/PryTAmEjRyMn8y2fgjiaoc (read it first, then republish).
   - Commit code and `vo.json` changes only; the generated audio is gitignored.

## Picture marks the voice lines up with

| Cut | Mark | Time |
|---|---|---|
| YouTube | Question bubble | 0.27 s |
| YouTube | Answer bubble | 1.53 s |
| YouTube | "But is it?" | 5.33 s |
| YouTube | "WhatsApp.", "Calls.", "Voice notes.", "Promises." slams | noise + 2.3 s, 3.3 s, 4.3 s, 5.3 s |
| YouTube | "And most of it gets lost." | noise + 6.5 s |
| YouTube | "Neev" title | turn + 3.0 s |
| YouTube | Payoff "Same words." | payoff + 2.4 s |
| Reel | Question bubble | 0.13 s |
| Reel | Answer bubble | 1.47 s |
| Reel | "But is it?" | 2.8 s |
| Reel | Slams | noise + 0.33 s, 1.07 s, 1.8 s |
| Reel | "lost" | noise + 2.67 s |

Section starts are in `cuts.json` (a bar is 2.4 s at 100 bpm). The script
prints absolute times for every line.

## House rules

- Push only to `claude/bold-goodall-11ksuo`.
- Commit messages end with the session's attribution lines.
- No model names in commits or code.
- Never commit `.env` or `dump.rdb`.

## Paste this into the new chat

> Read `docs/HANDOFF-VIDEO-VOICE.md` on branch `claude/bold-goodall-11ksuo` of aryan3002/Constructo and add the ElevenLabs voiceover to Neev film C. I've added `ELEVENLABS_API_KEY` to this environment and allowed api.elevenlabs.io. Start with the voice audition and send me the samples so I can pick the voices.
