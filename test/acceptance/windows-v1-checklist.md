# Moyu VS Code V1 Windows Acceptance Checklist

Run this checklist in an isolated Extension Development Host after the automated
current and minimum-version lanes pass. Record observations for the exact build
being accepted; do not use a user's normal global storage as test data.

## Environment

- [ ] Windows version: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Architecture: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Current VS Code version: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Minimum lane result for VS Code 1.96.0: PASS / FAIL
- [ ] Moyu commit: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Fixture root: **\*\*\*\***\_\_\_\_**\*\*\*\***

## Core flow

- [ ] Activity Bar Moyu entry opens the Sidebar.
- [ ] Sidebar exposes Home / Books, 2048, and Settings as lightweight routes.
- [ ] `moyu.openBooks`, `moyu.open2048`, and `moyu.openSettings` reveal one
      existing main WebviewPanel rather than opening duplicates.
- [ ] TXT import uses the native picker, reads the fixture, and preserves the
      source file in its original location.
- [ ] EPUB import shows ordered text-only chapter content and does not execute
      or load active/remote content.
- [ ] Closing/restoring the panel retains the saved 2048 board and score.
- [ ] Two VS Code windows observe conflict-safe bookshelf, reader, settings,
      and game writes; temporary visual staleness is resolved at the next
      documented refresh point.

## Boss Mode and accessibility

- [ ] With a visible Moyu panel, `Ctrl+M` enters and exits Boss Mode without
      replacing the reader/game controller or changing real editor tabs.
- [ ] With no visible Moyu panel, `Ctrl+M` is a no-op.
- [ ] The default keybinding can be reassigned in Keyboard Shortcuts.
- [ ] Panel title and focus return to the normal state after exit.
- [ ] Light theme: PASS / FAIL
- [ ] Dark theme: PASS / FAIL
- [ ] High Contrast theme: PASS / FAIL
- [ ] Keyboard-only navigation and visible focus: PASS / FAIL

## Notes

Record failures with the VS Code version, theme, command, fixture, and the
smallest reproducible sequence. Never paste private source paths or novel
content into an issue or log.
