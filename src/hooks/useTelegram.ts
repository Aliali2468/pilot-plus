import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createTelegramLinkCode,
  getTelegramStatus,
  unlinkTelegram,
  verifyTelegramLink,
} from "@/lib/telegram.functions";

export function useTelegramStatus(pollWhileWaiting = false) {
  const fn = useServerFn(getTelegramStatus);
  return useQuery({
    queryKey: ["telegram", "status"],
    queryFn: () => fn(),
    retry: false,
    refetchInterval: pollWhileWaiting ? 4000 : false,
  });
}

export function useTelegramLinkCode() {
  const fn = useServerFn(createTelegramLinkCode);
  return useMutation({
    mutationFn: () => fn(),
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Server-side truth check — never trusts a frontend flag. */
export function useVerifyTelegramLink() {
  const fn = useServerFn(verifyTelegramLink);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code?: string) => fn({ data: code ? { code } : {} }),
    onSuccess: (result) => {
      if (result.state === "connected") {
        queryClient.invalidateQueries({ queryKey: ["telegram"] });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUnlinkTelegram() {
  const fn = useServerFn(unlinkTelegram);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: () => {
      toast.success("Telegram disconnected");
      queryClient.invalidateQueries({ queryKey: ["telegram"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
