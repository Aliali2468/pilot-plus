import { Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConnectYoutube } from "@/hooks/useYoutube";

export function ConnectChannel({ compact = false }: { compact?: boolean }) {
  const connect = useConnectYoutube();

  return (
    <Card className="glass-panel">
      <CardContent className={compact ? "py-6" : "py-12"}>
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Youtube className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Connect your YouTube channel</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Authorise TubePilot with Google to upload videos, edit metadata, manage playlists and
            read analytics. You can revoke access at any time.
          </p>
          <Button
            className="mt-6"
            size="lg"
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
          >
            {connect.isPending ? "Waiting for Google…" : "Connect with Google"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
