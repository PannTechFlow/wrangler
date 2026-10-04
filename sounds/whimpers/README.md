# Whimper clips

Audio played when the whip hits the agent, like a punch-the-boss toy. Each
hit plays one clip, then the agent whispers a line.

Name clips by intensity (`.mp3`, `.wav`, `.m4a` or `.ogg`):

| Prefix | Plays on | Example |
|---|---|---|
| `1-` | first hit | `1-ow-quiet.m4a` — a whispered "ow…" |
| `2-` | second quick hit | `2-yelp.m4a` — "OW! hey!" |
| `3-` | third+ quick hit | `3-scream.m4a` — full scream |

Hits less than 2.5 s apart escalate; pause and it calms back down to `1-`.
A missing level falls back to the next quieter one. Clips are picked up
without restarting.

Only add recordings you made yourself or that are licensed for redistribution.
