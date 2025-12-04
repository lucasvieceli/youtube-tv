import type { NextRequest } from "next/server";

type ChannelSearchItem = {
  id?: { channelId?: string };
  snippet?: { title?: string };
};

type ResolvedChannel = {
  channelId: string;
  label?: string;
};

const SEARCH_BASE =
  "https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1";
const CHANNELS_BASE =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet";

function normalizeInput(raw: string) {
  const cleaned = raw.trim();
  try {
    const url = new URL(cleaned);
    const path = url.pathname;

    if (path.includes("/channel/")) {
      const id = path.split("/channel/")[1]?.split("/")[0];
      if (id) return { channelId: id };
    }

    if (path.includes("/user/")) {
      const username = path.split("/user/")[1]?.split("/")[0];
      if (username) return { username };
    }

    if (path.includes("/c/")) {
      const custom = path.split("/c/")[1]?.split("/")[0];
      if (custom) return { handleLike: custom };
    }

    const atHandle = path.match(/@([^/]+)/);
    if (atHandle?.[1]) {
      return { handle: atHandle[1] };
    }
  } catch {
    // not a URL, fall through
  }

  if (cleaned.startsWith("@")) {
    return { handle: cleaned.slice(1) };
  }

  if (cleaned.startsWith("UC")) {
    return { channelId: cleaned };
  }

  return { handleLike: cleaned };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube retornou ${res.status}`);
  }
  return res.json();
}

async function resolveByChannelId(
  apiKey: string,
  channelId: string
): Promise<ResolvedChannel> {
  const url = `${CHANNELS_BASE}&id=${encodeURIComponent(
    channelId
  )}&key=${apiKey}`;
  const data = await fetchJson(url);
  const item = data?.items?.[0];
  const label = item?.snippet?.title as string | undefined;
  return { channelId, label };
}

async function resolveByUsername(
  apiKey: string,
  username: string
): Promise<ResolvedChannel> {
  const url = `${CHANNELS_BASE}&forUsername=${encodeURIComponent(
    username
  )}&key=${apiKey}`;
  const data = await fetchJson(url);
  const item = data?.items?.[0];
  const channelId = item?.id as string | undefined;
  if (!channelId) throw new Error("Canal não encontrado para esse usuário.");
  const label = item?.snippet?.title as string | undefined;
  return { channelId, label };
}

async function resolveBySearch(
  apiKey: string,
  query: string
): Promise<ResolvedChannel> {
  const url = `${SEARCH_BASE}&q=${encodeURIComponent(query)}&key=${apiKey}`;
  const data = await fetchJson(url);
  const item = data?.items?.[0] as ChannelSearchItem | undefined;
  const channelId = item?.id?.channelId;
  if (!channelId) throw new Error("Canal não encontrado.");
  const label = item?.snippet?.title;
  return { channelId, label };
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

  if (!input?.trim()) {
    return new Response("Envie um link, @handle ou ID do canal.", {
      status: 400,
    });
  }

  const parsed = normalizeInput(input);

  try {
    if (parsed.channelId) {
      const result = await resolveByChannelId(apiKey, parsed.channelId);
      return Response.json(result);
    }

    if (parsed.username) {
      const result = await resolveByUsername(apiKey, parsed.username);
      return Response.json(result);
    }

    if (parsed.handle) {
      const result = await resolveBySearch(apiKey, `@${parsed.handle}`);
      return Response.json(result);
    }

    if (parsed.handleLike) {
      const result = await resolveBySearch(apiKey, parsed.handleLike);
      return Response.json(result);
    }

    return new Response("Não foi possível resolver o canal.", { status: 400 });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Falha ao resolver o canal.",
      { status: 400 }
    );
  }
}
