import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createTelegramLinkCode,
  getTelegramStatus,
  unlinkTelegram,
} from "@/lib/telegram.functions";

export function useTelegramStatus() {
  const fn = useServerFn(getTelegramStatus);
  return useQuery({ queryKey: ["telegram", "status"], queryFn: () => fn(), retry: false });
}

export function useTelegramLinkCode() {
  const fn = useServerFn(createTelegramLinkCode);
  return useMutation({
    mutationFn: () => fn(),
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
