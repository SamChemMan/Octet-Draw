# Feedback button switch (1.1.3)

Asked for by a user on an offline Linux cluster, where the round Feedback button opens a mail app that is not there.
ChemDraw has no feedback button on its canvas (ChemDraw 22.2 menus, read live), so there is nothing to match.

## What it must do, and how each part is tested

1. Settings > Pro has a "Feedback button" switch, on by default.
   Test: moreformats.check.ts (the Settings > Pro check) finds the row in SettingsWindow.tsx and the memo's deps.
2. A new user has it on. A saved false stays false after a restart (loadSettings).
   Test: moreformats.check.ts asserts `feedbackButton: true` in DEFAULTS and `feedbackButton: saved.feedbackButton !== false` in loadSettings.
3. Off: the button goes from every open window at once. Every window (Home, drawing windows, the Home window's own
   drawing) is an Editor, and each Editor already reloads settings on the storage event, so one condition on the
   `<FeedbackLink>` covers all of them.
   Test: the check asserts the condition on the render. By hand in the browser build: two tabs, switch off in one,
   the other loses the button.
4. Launched with OCTET_FEEDBACK=0 in the environment, the button is hidden whatever the switch says. A
   `#[tauri::command] feedback_off` in main.rs reads the variable; each Editor asks once on load (Tauri only).
   Test: the check asserts the command, its place in generate_handler!, and the Editor's one call. cargo check.
5. While the environment hides it, the Settings switch shows off and cannot be changed.
   Test: the check asserts `on={p.feedbackButton && !p.feedbackOff}` and `disabled={p.feedbackOff}`.
6. Help > Report a Problem… is unchanged. Test: no edit to its menu item or to open_link "issues".

## Design

- settings.ts: `feedbackButton: boolean`, true in DEFAULTS, read as `saved.feedbackButton !== false`.
- main.rs: `fn feedback_off() -> bool { std::env::var("OCTET_FEEDBACK").as_deref() == Ok("0") }`. The same name as
  the build switch (build.rs), so one name means no feedback.
- Editor.tsx: `const [feedbackOff, setFeedbackOff] = useState(false)`, set once from `invoke("feedback_off")` when
  TAURI. Render `{settings.feedbackButton && !feedbackOff && <FeedbackLink … />}`. Pass `feedbackButton`,
  `onFeedbackButton` and `feedbackOff` to Settings beside moreFormats.
- SettingsWindow.tsx: `d("pro", "Window", "Feedback button", …, <Switch …/>)` after the File menu rows.
- No hot path changes: the render gains one boolean test.
- MCP: none needed (settings are not MCP ops in 1.1.3).
