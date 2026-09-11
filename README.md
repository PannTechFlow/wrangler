# Wrangler

A menu-bar toy for your terminal. Spawn a physics-simulated whip that follows
your cursor; crack it hard enough and it sends `Ctrl-C` plus a typed phrase to
whatever app was focused before you clicked the tray — handy for interrupting
an agent that's gone off the rails. Or switch to pat mode and send it some
encouragement instead.

There's no mockup or fake target on screen — the whip's real target is
whatever's actually focused, your terminal running Claude Code (or any other
CLI agent) most of the time. Wire up the hooks below and the whip can
auto-spawn on its own once a prompt's been running slow enough, so you don't
even have to reach for the tray.

## Features

- **Physics-based whip** — a 36-link verlet-simulated rope with real bend
  limits, tapered mass, and wall collisions. It swings and cracks like an
  actual whip, not a canned animation.
- **Crack vs. strike** — flicking it fast cracks it (sparks, sound, a
  shockwave ring) for free. Clicking within the crack's strike window is what
  actually sends the interrupt — so you can play with it without spamming
  your terminal.
- **Real interrupt, real phrase** — a strike sends `Ctrl-C` plus a random
  line (`"Less thinking, more typing"`, `"Compile or perish"`, ...) to
  whatever app was focused right before you grabbed the tray.
- **Pat mode** — same tray, same shortcuts, opposite energy: a hand follows
  your cursor, pats send encouragement instead of an interrupt, no `Ctrl-C`.
- **Auto-trigger** — hook Claude Code's (or any CLI agent's) lifecycle events
  up to a small status file and the whip auto-spawns once a prompt has been
  running slow enough, without you touching the tray.
- **Ambient tray status** — the menu-bar icon itself changes (busy → done →
  idle) as your agent works, so you get a glance-able "is it done yet" even
  if you never touch the whip.
- **Menu-bar only** — no Dock icon, no Cmd+Tab entry, no window chrome. The
  tray icon is the only visible trace of it until you summon the whip.
- Cross-platform: macOS, Windows, Linux.

## Install

**Download, no cloning or Node required:** grab the installer for your OS
from the [Releases](../../releases) page — a `.dmg` for macOS, `.exe` for
Windows, `.AppImage` for Linux.

These builds are unsigned (no paid developer certificate), so on first
launch:

- **macOS:** Gatekeeper will block it — right-click the app → **Open**, or run
  `xattr -cr /Applications/Wrangler.app`.
- **Windows:** SmartScreen will warn — click **More info** → **Run anyway**.

Linux also needs `xdotool` for keyboard automation: `sudo apt install xdotool`.

### From source

```bash
npm install
npm start
```

Or install the `agentwrangler` command globally from this folder:

```bash
npm install -g .
agentwrangler
```

### Building your own installer

```bash
npm install
npm run dist        # builds for your current OS by default
```

`electron-builder` config lives in `package.json` under `"build"`. CI
(`.github/workflows/release.yml`) builds all three platforms and attaches
them to a GitHub Release whenever a `vX.Y.Z` tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Controls

The app runs menu-bar only — no Dock icon, no Cmd+Tab entry. The tray icon is
the only visible trace of it.

**macOS:** press and hold the tray icon — the whip appears already attached to
your cursor, no separate spawn step. Move the cursor to swing it; let go of the
mouse button and it drops immediately. `Alt+Shift+W` toggles it on/off the same
way if you'd rather use the keyboard. Right-click the tray icon for the menu
(pat mode, quit).

**Windows/Linux:** click the tray icon, or `Alt+Shift+W`, to spawn the whip
(Electron's press-and-hold tray gesture is macOS-only, so it's click-to-toggle
there); click or press the shortcut again to drop it.

Once it's out:

- Flick the whip, then click while it's still snapping (within ~300ms of a fast
  crack): that's a strike — sends the interrupt + a phrase.
- A click with a still whip does nothing; fast flicks alone crack with sound and
  sparks but never type.
- Right-click: drop the whip (macOS: same as releasing the tray icon).
- Scroll wheel or middle-click: switch between whip and pat mode.

### Pat on the shoulder

`Alt+Shift+P` (`Option+Shift+P` on macOS), or pick it from the tray's right-click
menu: a hand follows your cursor. Left-click pats and sends a kind word (no
interrupt, just the message + Enter) with some floating hearts. Right-click
waves goodbye. Scroll or middle-click swaps back to the whip.

From the CLI, `agentwrangler pat` opens straight into pat mode and
`agentwrangler whip` into whip mode; plain `agentwrangler` reopens whichever
you used last.

## How it works

The rope is 36 verlet-integrated point masses, solved with 20 constraint
iterations per step. Bend limits stiffen toward the handle (60°) and loosen
toward the tip (45°) so it swings like a real whip instead of tangling into
noodles; mass tapers toward the tip so the last few links can move fast
enough to crack.

Only the last two links' speed counts toward a crack:

| Threshold | Value | What happens |
|---|---|---|
| Crack speed | 340px/frame (scaled to screen size) | Sparks, a shockwave ring, a sound — free, no macro sent |
| Strike speed | 180px/frame | "Arms" a click — the whip is fast enough that clicking now counts |
| Strike window | 300ms | How long after a fast flick a click still registers as a strike |
| Strike cooldown | 450ms | Minimum gap between cracks, so a sustained fast swing doesn't spam |

A **strike** (crack + a click inside the window) is what actually sends
`Ctrl-C` plus a random phrase to whatever was focused when you grabbed the
tray. A crack on its own never sends anything.

## Auto-trigger setup

Wrangler polls `~/.agent-wrangler/claude-status.json` once a second. If it
reads `{"status":"busy","since":<ms epoch>}` and that timestamp is older than
the slow threshold, the whip auto-spawns (sliding in from off-screen) without
you touching the tray.

Point any agent's lifecycle hooks at that file. For Claude Code, add this to
`~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command",
        "command": "mkdir -p ~/.agent-wrangler && printf '{\"status\":\"busy\",\"since\":%s}' \"$(date +%s000)\" > ~/.agent-wrangler/claude-status.json" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command",
        "command": "mkdir -p ~/.agent-wrangler && printf '{\"status\":\"idle\"}' > ~/.agent-wrangler/claude-status.json" }] }
    ]
  }
}
```

Any other tool that can run a shell command on "started working" /
"finished" events can write the same two-line JSON file and get the same
auto-trigger and tray-status behavior — Wrangler doesn't care what wrote it.

### Ambient tray status

Independent of the whip, the tray icon itself reflects that same status
file: a neutral mark at rest, an amber-badged icon while the agent is busy,
and a brief green-badged flash right after it finishes — so you get a
glance-able "is it done yet" without ever swinging the whip. (macOS/Linux
only — Windows keeps its standard icon.)

### Configuration

Environment variables, set before launching:

| Variable | Default | Effect |
|---|---|---|
| `WRANGLER_SLOW_THRESHOLD_MS` | `20000` | How long the status file must read "busy" before the whip auto-spawns |
| `WRANGLER_DISABLE_AUTOTRIGGER` | unset | Set to `1` to disable the auto-spawn entirely (tray status badge still works) — useful while developing/testing Wrangler itself, since the auto-spawned overlay captures real clicks on your real screen |

## macOS setup

Typing into the focused app needs Accessibility access. The first time it
tries, macOS will prompt — open **System Settings → Privacy & Security →
Accessibility** and enable **Wrangler**. Running `agentwrangler` builds a small
`Wrangler.app` wrapper (a renamed, re-signed copy of the bundled Electron
runtime with the whip icon) so macOS attributes the permission to "Wrangler"
rather than your terminal.

## Troubleshooting

- **Nothing happens when I strike** — you likely clicked too late, or too
  early. The whip has to actually be past crack speed *when you click*; a
  slow flick followed by a click does nothing.
- **No text ever appears, only sparks** — that's a crack, not a strike. See
  [How it works](#how-it-works) — you need to click within the window, not
  just flick fast.
- **macOS says the app is damaged / can't be opened** — it's unsigned, not
  actually damaged. Right-click → Open, or `xattr -cr /Applications/Wrangler.app`.
- **Keystrokes never reach my terminal (macOS)** — check **System Settings →
  Privacy & Security → Accessibility** and make sure Wrangler is enabled.
- **Keystrokes never reach my terminal (Linux)** — install `xdotool`
  (`sudo apt install xdotool`).
- **Auto-trigger never fires** — confirm `~/.agent-wrangler/claude-status.json`
  is actually being written (your hook command may need `mkdir -p` first,
  see [Auto-trigger setup](#auto-trigger-setup)), and that
  `WRANGLER_DISABLE_AUTOTRIGGER` isn't set to `1`.

## Project layout

```
main.js              Electron main process: tray, overlay window, global shortcuts
preload.js            contextBridge between main and the overlay renderer
src/
  keystroke.js         Cross-platform Ctrl-C + type-text automation
  phrases.js            Whip / kind-word phrase lists
  mac-app.js             Builds the Wrangler.app wrapper on macOS
bin/wrangler.js       CLI launcher
renderer/
  overlay.html          Transparent full-screen overlay shell
  state.js               Settings, shared mutable state, math helpers
  whip.js                 Rope physics, crack detection, crack FX
  hand.js                   Pat-on-the-shoulder mode
  app.js                     Input handling, main loop, IPC wiring
icon/, sounds/         App icons and crack sound effects
.github/workflows/    CI: builds + publishes installers on a version tag
```

## Contributing

Issues and pull requests are welcome. It's a small, single-purpose Electron
app — no build step for the renderer (plain `<script>` tags, no bundler), so
`npm start` after a clone is the whole dev loop.

## Credits

This is an independent rebuild of the whip/interrupt idea from
[GitFrog1111/OpenWhip](https://github.com/GitFrog1111/OpenWhip), following the
richer feature set (pat mode, bottle minigame, mode switching, macOS app
bundling) added in [shmulc8/OpenWhip](https://github.com/shmulc8/OpenWhip).
Icons and crack sound effects are reused from that fork under its MIT license.

Concept sparked by the "Developers with AI at 3AM" meme — cracking the whip
at a slow agent, for real, from your menu bar.

MIT licensed here too — see [LICENSE](LICENSE).
