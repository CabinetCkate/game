Brain Show soundtrack in the studio
==================================

The six MP3 recordings selected by the user come from the [Brain Show (2023) album on KHInsider](https://downloads.khinsider.com/game-soundtracks/album/brain-show-gamerip-2023). The game is credited to Simplicity Games on that page. Local files and per-track source pages are recorded in `Frontend/public/audio/brain-show/source.json`.

| Recording | Studio use |
| --- | --- |
| Menu | Entering the studio and the solo show introduction |
| Character Selection | Selecting a character and waiting in a room |
| Other Music | Television presentation, answering and round feedback |
| Final Round | Final question and awards background |
| Jingle | Show opening and the first-place reveal |
| Short jingle | Correct-answer feedback |

Music is served from the same website, without a runtime dependency on the source site. A user gesture unlocks playback. Music and jingles follow the existing sound button and volume control; jingles temporarily lower background music. Scene transitions stop old clips, and leaving the studio clears recordings and award timers. Original correct/wrong tones and the timed podium drum rolls remain in place. If a recording cannot play, the procedural question music remains available as a fallback.

The 3D navigation link unlocks the audio synchronously during its click, before routing, API calls or model loading. The studio takes ownership of that same player before its first asynchronous import. Loading no longer requires a second click on Solo or Online to start music. Leaving or failing to enter the route clears pending playback; repeated visits create one fresh player per visit. Reloads without a navigation gesture can unlock through the studio controls. Saved mute and volume preferences still apply.

To retrieve the same files again, run `node scripts/download-brain-show.mjs` from the repository root. The script checks MP3 headers and stores source metadata alongside the recordings.
