"use client";

import { useState } from "react";

type Mode = "test" | "segment";

export function SendNudgePanel({
  feature,
  featureLabel,
  emailableCount,
  configured,
}: {
  feature: string;
  featureLabel: string;
  emailableCount: number;
  configured: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const canCompose = subject.trim().length > 0 && message.trim().length > 0;

  async function send(mode: Mode) {
    if (mode === "segment") {
      if (emailableCount === 0) return;
      if (!confirm(`Send this email to ${emailableCount} opted-in ${featureLabel} non-user${emailableCount === 1 ? "" : "s"}? This sends to real people and can't be undone.`)) {
        return;
      }
    }
    setBusy(mode);
    setStatus(null);
    try {
      const res = await fetch("/api/marketing/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, feature, subject, message, testEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, text: data.error ?? res.statusText });
      } else if (mode === "test") {
        setStatus({ ok: data.sent > 0, text: data.sent > 0 ? `Test sent to ${testEmail}.` : `Test failed: ${data.errors?.join(", ") ?? "unknown"}` });
      } else {
        setStatus({ ok: data.failed === 0, text: `Sent ${data.sent}, failed ${data.failed}${data.errors?.length ? ` — ${data.errors.join(", ")}` : ""}.` });
      }
    } catch {
      setStatus({ ok: false, text: "Network error" });
    } finally {
      setBusy(null);
    }
  }

  const input = "w-full rounded-lg border border-[var(--wo-border)] bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-3">
      {!configured ? (
        <p className="rounded-lg bg-[var(--wo-bg)] p-3 text-xs text-[var(--wo-muted)]">
          Email sending is not configured. Set <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code>,{" "}
          <code>MARKETING_PHYSICAL_ADDRESS</code>, and <code>PUBLIC_BASE_URL</code> in Vercel to enable sending.
        </p>
      ) : null}

      <input
        className={input}
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={!configured}
      />
      <textarea
        className={`${input} min-h-28`}
        placeholder={`Message to users who haven't tried ${featureLabel}…`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={!configured}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} max-w-xs flex-1`}
          placeholder="you@example.com"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          disabled={!configured}
        />
        <button
          onClick={() => send("test")}
          disabled={!configured || !canCompose || !testEmail.trim() || busy !== null}
          className="rounded-lg border border-[var(--wo-border)] px-3 py-2 text-sm font-medium text-[var(--wo-text)] disabled:opacity-40"
        >
          {busy === "test" ? "Sending…" : "Send test"}
        </button>
        <button
          onClick={() => send("segment")}
          disabled={!configured || !canCompose || emailableCount === 0 || busy !== null}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--wo-blue)" }}
        >
          {busy === "segment" ? "Sending…" : `Send to ${emailableCount} emailable`}
        </button>
      </div>

      {status ? (
        <p className={`text-sm ${status.ok ? "text-[var(--wo-green)]" : "text-red-600"}`}>{status.text}</p>
      ) : null}
      <p className="text-xs text-[var(--wo-muted)]">
        Always send a test to yourself first. Every email includes a one-click unsubscribe and your postal address.
      </p>
    </div>
  );
}
