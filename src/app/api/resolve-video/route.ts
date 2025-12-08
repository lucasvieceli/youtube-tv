import type { NextRequest } from "next/server";

type VideoSnippet = {
  title?: string;
  channelId?: string;
  channelTitle?: string;
  thumbnails?: {
    high?: { url?: string };
    default?: { url?: string };
  };
};

type VideoResponseItem = {
  id?: string;
  snippet?: VideoSnippet;
};

function extractVideoId(raw: string) {
  const cleaned = raw.trim();
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned);
    const v = url.searchParams.get("v");
    if (v) return v;

    const path = url.pathname;
    if (path.startsWith("/shorts/")) {
      return path.split("/shorts/")[1]?.split("/")[0] ?? "";
    }
    const segments = path.split("/").filter(Boolean);
    if (segments.length) {
      return segments[segments.length - 1];
    }
  } catch {
    // not a URL, fall through
  }

  return cleaned;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return new Response("Defina YOUTUBE_API_KEY no .env.local", {
      status: 500,
    });
  }

  const body = await request.json();
  const input: string | undefined = body?.input;

  const videoId = input ? extractVideoId(input) : "";
  if (!videoId) {
    return new Response("Envie um link ou ID de vídeo.", { status: 400 });
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(
    videoId
  )}&key=${apiKey}`;

  try {
    const response = await fetch(url, { next: { revalidate: 120 } });
    if (!response.ok) {
      throw new Error(`YouTube retornou ${response.status}`);
    }

    const data = await response.json();
    if (!data?.items?.length) {
      return new Response("Vídeo não encontrado.", { status: 404 });
    }

    const item = (data.items[0] ?? {}) as VideoResponseItem;

    const snippet = item.snippet ?? {};
    const thumbnail =
      snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? "";

    return Response.json({
      id: videoId,
      title: snippet.title ?? "Vídeo sem título",
      channelId: snippet.channelId ?? "",
      channelTitle: snippet.channelTitle ?? "Canal",
      thumbnail,
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Falha ao resolver o vídeo.",
      { status: 400 }
    );
  }
}
