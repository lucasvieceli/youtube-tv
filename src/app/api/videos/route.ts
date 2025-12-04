import type { NextRequest } from "next/server";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    thumbnails?: {
      high?: { url?: string };
      default?: { url?: string };
    };
  };
};

type Video = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
};

type ApiResponse = {
  videosByChannel: Record<string, Video[]>;
  errors?: string[];
};

const YOUTUBE_SEARCH_URL =
  "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=10";

export async function POST(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Defina YOUTUBE_API_KEY no arquivo .env.local" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const channels: string[] | undefined = body?.channels;

  if (!Array.isArray(channels) || channels.length === 0) {
    return Response.json(
      { error: "Envie pelo menos um canal na requisição." },
      { status: 400 }
    );
  }

  const videosByChannel: ApiResponse["videosByChannel"] = {};
  const errors: string[] = [];

  await Promise.all(
    channels.map(async (channelId) => {
      try {
        const url = `${YOUTUBE_SEARCH_URL}&channelId=${encodeURIComponent(
          channelId
        )}&key=${apiKey}`;

        const response = await fetch(url, { next: { revalidate: 60 } });

        if (!response.ok) {
          throw new Error(`YouTube retornou ${response.status}`);
        }

        const data = await response.json();
        const items: YouTubeSearchItem[] = data?.items ?? [];

        const videos: Video[] = items
          .map((item) => {
            const id = item.id?.videoId;
            if (!id) return null;

            const snippet = item.snippet ?? {};
            const thumbnail =
              snippet.thumbnails?.high?.url ??
              snippet.thumbnails?.default?.url ??
              "";

            return {
              id,
              title: snippet.title ?? "Vídeo sem título",
              channelId: snippet.channelId ?? channelId,
              channelTitle: snippet.channelTitle ?? "Canal",
              thumbnail,
            } satisfies Video;
          })
          .filter(Boolean) as Video[];

        videosByChannel[channelId] = videos;
      } catch (error) {
        errors.push(
          `Falha ao buscar vídeos do canal ${channelId}: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`
        );
        videosByChannel[channelId] = [];
      }
    })
  );

  return Response.json({ videosByChannel, errors } satisfies ApiResponse);
}
