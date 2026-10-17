// Feedback (Sam, 17 October 2026; for testing, to be taken out before release). ⌘1, ⌘2 and ⌘3 within 1.5 s (Ctrl
// on Windows and Linux) take a picture of the window, then open this box. Send opens an email to Sam in the
// mail app with the note and the picture attached; the tester sends it from there.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog } from "./Dialog";

export function Feedback({ picture, onClose, onSent, onError }: { picture?: string; onClose: () => void; onSent: () => void; onError: (message: string) => void }) {
  const [note, setNote] = useState("");
  const send = () => void invoke("send_feedback", { note, picture: picture ?? null }).then(onSent, (e) => onError(String(e)));
  return (
    <Dialog title="Feedback" action="Send" onClose={onClose} onAction={send}>
      <textarea className="feedback-note" value={note} rows={5} maxLength={20000} aria-label="Feedback" placeholder="What happened, and what did you expect?" onChange={(e) => setNote(e.target.value)} />
      {picture && <img className="feedback-picture" src={`data:image/png;base64,${picture}`} alt="The window when you opened Feedback" />}
    </Dialog>
  );
}
