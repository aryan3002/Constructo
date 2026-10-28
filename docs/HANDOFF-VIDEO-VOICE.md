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
