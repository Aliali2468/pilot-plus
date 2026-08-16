import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTelegramLinkCode, useTelegramStatus, useUnlinkTelegram } from "@/hooks/useTelegram";

/** Links a Telegram chat to the account so videos can be imported server-side. */
export function TelegramSettings() {
  const status = useTelegramStatus();
  const createCode = useTelegramLinkCode();
  const unlink = useUnlinkTelegram();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null>(null);

  const botUsername = createCode.data?.botUsername ?? status.data?.botUsername ?? null;

  return (
    <Card className="glass-panel">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">Telegram import</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Forward a video to the TubePilot bot and import it straight to YouTube. The file is
            transferred entirely by our servers — never through your device.
          </p>
        </div>

        {status.data?.connected ? (
          <div className="space-y-3">
            <p className="text-sm">
              Connected to{" "}
              <span className="font-medium">
                {status.data.link?.username ? `@${status.data.link.username}` : "your Telegram chat"}
              </span>
              {botUsername ? ` via ${botUsername}` : null}
            </p>
            {status.data.latestMessage ? (
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
            <Button variant="ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              Disconnect Telegram
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="secondary"
              disabled={createCode.isPending}
              onClick={() =>
                createCode.mutate(undefined, {
                  onSuccess: (result) => setCode(result.code),
                })
              }
            >
              {createCode.isPending ? "Generating…" : "Generate link code"}
            </Button>
            {code ? (
              <div className="rounded-xl border border-border bg-card/60 p-3 text-sm">
                <p>
                  Open {botUsername ?? "the TubePilot bot"} in Telegram and send:
                </p>
                <code className="mt-2 block rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                  /start {code}
                </code>
                <Button
                  className="mt-3"
                  variant="ghost"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["telegram"] })}
                >
                  I've sent it — check connection
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
