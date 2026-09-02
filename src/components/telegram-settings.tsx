import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useTelegramLinkCode,
  useTelegramStatus,
  useUnlinkTelegram,
  useVerifyTelegramLink,
} from "@/hooks/useTelegram";

const STATE_LABEL: Record<string, string> = {
  waiting: "Waiting for Telegram confirmation…",
  expired: "Code expired — generate a new one",
  invalid: "Invalid code — generate a new one",
  already_used: "Code already used — generate a new one",
  bot_unreachable: "Telegram bot not reachable",
  connected: "Connected ✓",
};

/** Links a Telegram chat to the account so videos can be imported server-side. */
export function TelegramSettings() {
  const [code, setCode] = useState<string | null>(null);
  const status = useTelegramStatus(Boolean(code));
  const createCode = useTelegramLinkCode();
  const verify = useVerifyTelegramLink();
  const unlink = useUnlinkTelegram();

  const botUsername = createCode.data?.botUsername ?? status.data?.botUsername ?? "@S_Q_O_M_Bot";
  const botLink = `https://t.me/${botUsername.replace(/^@/, "")}`;
  const connected = status.data?.connected || verify.data?.state === "connected";

  // Automatic detection: while a code is pending, the status query polls the
  // server. Once it reports a link, stop showing the pending code block.
  useEffect(() => {
    if (connected) setCode(null);
  }, [connected]);

  const verifyState = verify.isPending ? "Checking…" : verify.data ? STATE_LABEL[verify.data.state] : null;

  return (
    <Card className="glass-panel">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">Telegram import</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Forward a video to {botUsername} and import it straight to YouTube. The file is
            transferred entirely by our servers — never through your device.
          </p>
        </div>

        {connected ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="text-emerald-400">Connected ✓</span> to{" "}
              <span className="font-medium">
                {status.data?.link?.username
                  ? `@${status.data.link.username}`
                  : "your Telegram chat"}
              </span>{" "}
              via {botUsername}
            </p>
            {status.data?.latestMessage ? (
              <p className="text-xs text-muted-foreground">
                Latest message:{" "}
                {status.data.latestMessage.has_video
                  ? `${status.data.latestMessage.file_name} · ${(
                      (status.data.latestMessage.file_size ?? 0) /
                      1024 /
                      1024
                    ).toFixed(1)} MB`
                  : "no video attached"}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => verify.mutate(undefined)}>
                {verify.isPending ? "Checking…" : "Verify connection"}
              </Button>
              <Button variant="ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
                Disconnect Telegram
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="secondary"
              disabled={createCode.isPending}
              onClick={() => {
                verify.reset();
                createCode.mutate(undefined, { onSuccess: (result) => setCode(result.code) });
              }}
            >
              {createCode.isPending ? "Generating…" : code ? "Generate a new code" : "Generate link code"}
            </Button>

            {code ? (
              <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3 text-sm">
                <p>Open {botUsername} in Telegram and send this exact command:</p>
                <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                  /start {code}
                </code>
                <p className="text-xs text-muted-foreground">
                  The code is single-use, tied to your account, and expires in 15 minutes.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="default">
                    <a href={botLink} target="_blank" rel="noreferrer">
                      Open {botUsername}
                    </a>
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate(code)}
                  >
                    {verify.isPending ? "Checking…" : "Verify connection"}
                  </Button>
                </div>
                <p
                  className={`text-xs ${
                    verify.data?.state === "connected"
                      ? "text-emerald-400"
                      : verify.data && verify.data.state !== "waiting"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {verifyState ?? "Waiting for Telegram confirmation…"}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
