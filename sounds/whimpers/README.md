# Whimper clips

Played when the whip hits the agent, like a punch-the-boss toy. Each hit
plays one clip from this folder.

Clips are named by intensity (`.mp3`, `.wav`, `.m4a` or `.ogg`):

| Prefix | Plays on | Volume |
|---|---|---|
| `1-` | first hit | 50% |
| `2-` | second quick hit | 80% |
| `3-` | third+ quick hit | 100% |

Hits less than 2.5 s apart escalate; pause and it calms back down to `1-`.
A missing level falls back to the next quieter one. Clips are picked up
without restarting, so you can add your own recordings (e.g. a begged
"please, mercy!") alongside or instead of these.

## Credits

The bundled clips (`*-hurt-*`, `*-no-*`, `*-scream-*`) are from
["Voice Clip Pack - Male Adventurer RPG"](https://opengameart.org/content/voice-clip-pack-male-adventurer-rpg)
by Brandon Song (wolfwoot), released under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/), re-encoded to AAC
and sorted by intensity.
