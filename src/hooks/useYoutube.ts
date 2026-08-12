import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  disconnectChannel,
  getAnalytics,
  getYoutubeStatus,
  listPlaylists,
  listUploadJobs,
  listVideos,
  startYoutubeOAuth,
  syncChannel,
} from "@/lib/youtube.functions";

export function useYoutubeStatus() {
  const fn = useServerFn(getYoutubeStatus);
  return useQuery({ queryKey: ["youtube", "status"], queryFn: () => fn() });
}

export function useVideos(search: string) {
  const fn = useServerFn(listVideos);
  return useQuery({
    queryKey: ["youtube", "videos", search],
    queryFn: () => fn({ data: { search } }),
    retry: false,
  });
}

export function usePlaylists() {
  const fn = useServerFn(listPlaylists);
  return useQuery({ queryKey: ["youtube", "playlists"], queryFn: () => fn(), retry: false });
}

export function useAnalytics(days: number) {
  const fn = useServerFn(getAnalytics);
  return useQuery({
    queryKey: ["youtube", "analytics", days],
    queryFn: () => fn({ data: { days } }),
    retry: false,
  });
}

export function useUploadJobs() {
  const fn = useServerFn(listUploadJobs);
  return useQuery({ queryKey: ["youtube", "jobs"], queryFn: () => fn() });
}

/** Opens the Google consent screen in a popup and refreshes state when it completes. */
export function useConnectYoutube() {
  const start = useServerFn(startYoutubeOAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { authUrl } = await start({ data: { origin: window.location.origin } });
      const popup = window.open(authUrl, "tubepilot-oauth", "width=520,height=680");
      if (!popup) {
        window.location.href = authUrl;
        return;
      }
      await new Promise<void>((resolve) => {
        const onMessage = (event: MessageEvent) => {
          if (event.data?.source !== "tubepilot-oauth") return;
          window.removeEventListener("message", onMessage);
          clearInterval(timer);
          if (event.data.ok) toast.success(event.data.message);
          else toast.error(event.data.message);
          resolve();
        };
        window.addEventListener("message", onMessage);
        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            window.removeEventListener("message", onMessage);
            resolve();
          }
        }, 700);
      });
      await queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSyncChannel() {
  const fn = useServerFn(syncChannel);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: () => {
      toast.success("Channel data refreshed");
      queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDisconnectChannel() {
  const fn = useServerFn(disconnectChannel);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelRowId: string) => fn({ data: { channelRowId } }),
    onSuccess: () => {
      toast.success("Channel disconnected");
      queryClient.invalidateQueries({ queryKey: ["youtube"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
