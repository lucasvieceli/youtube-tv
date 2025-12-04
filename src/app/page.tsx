"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube from "react-youtube";

type Channel = {
  id: string;
  label: string;
};

type Video = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
};

type VideosByChannel = Record<string, Video[]>;

type LayoutMode = "plain" | "ticker";
type PlaybackMode = "main" | "ad";

type YouTubePlayer = {
  getCurrentTime?: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo?: () => void;
};

const STORAGE_KEY_CHANNELS = "yt-rotator-channels";
const STORAGE_KEY_ADS = "yt-rotator-ads";
const STORAGE_KEY_LAYOUT = "yt-rotator-layout";
const presetChannels: Channel[] = [
  { id: "UC_x5XG1OV2P6uZZ5FSM9Ttw", label: "Google Developers" },
  { id: "UCVHFbqXqoYvEWM1Ddxl0QDg", label: "Vercel" },
  { id: "UCX6OQ3DkcsbYNE6H8uQQuVA", label: "Marques Brownlee" },
];

function shuffle<T>(items: T[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function extractVideoId(input: string) {
  const cleaned = input.trim();
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
    // not a URL, fallback to raw input
  }

  return cleaned;
}

function buildRoundRobinQueue(
  channels: Channel[],
  videosByChannel: VideosByChannel
) {
  const pools = channels.map((channel) => ({
    channelId: channel.id,
    videos: shuffle(videosByChannel[channel.id] ?? []),
  }));

  const queue: Video[] = [];
  let added = true;

  while (added) {
    added = false;
    for (const pool of pools) {
      const nextVideo = pool.videos.shift();
      if (nextVideo) {
        queue.push(nextVideo);
        added = true;
      }
    }
  }

  return queue;
}

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>(presetChannels);
  const [queue, setQueue] = useState<Video[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [channelUrlInput, setChannelUrlInput] = useState("");
  const [channelIdInput, setChannelIdInput] = useState("");
  const [channelLabelInput, setChannelLabelInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const playerContainerRef = useRef<HTMLElement | null>(null);
  const mainPlayerRef = useRef<YouTubePlayer | null>(null);
  const resumePositionRef = useRef<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("plain");
  const [tickerText, setTickerText] = useState(
    "Publicidade: personalize esta faixa aqui"
  );
  const [tickerFontSize, setTickerFontSize] = useState(16);
  const [tickerSpeed, setTickerSpeed] = useState(18); // segundos por loop
  const [tickerBg, setTickerBg] = useState("#0f172a");
  const [tickerColor, setTickerColor] = useState("#a7f3d0");
  const [tickerPosition, setTickerPosition] = useState<"top" | "bottom">(
    "bottom"
  );
  const [playerNonce, setPlayerNonce] = useState(0);
  const [ads, setAds] = useState<string[]>([]);
  const [adInput, setAdInput] = useState("");
  const [adIntervalMinutes, setAdIntervalMinutes] = useState(5);
  const [adIndex, setAdIndex] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("main");
  const [currentAdId, setCurrentAdId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedChannels = window.localStorage.getItem(STORAGE_KEY_CHANNELS);
    if (savedChannels) {
      try {
        const parsed = JSON.parse(savedChannels) as Channel[];
        if (parsed.length) {
          setChannels(parsed);
        }
      } catch {
        // ignore parse errors and keep presets
      }
    }

    const savedAds = window.localStorage.getItem(STORAGE_KEY_ADS);
    if (savedAds) {
      try {
        const parsed = JSON.parse(savedAds) as string[];
        if (parsed.length) setAds(parsed);
      } catch {
        // ignore
      }
    }

    const savedLayout = window.localStorage.getItem(STORAGE_KEY_LAYOUT);
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout) as {
          layoutMode?: LayoutMode;
          tickerText?: string;
          tickerFontSize?: number;
          tickerSpeed?: number;
          tickerBg?: string;
          tickerColor?: string;
          tickerPosition?: "top" | "bottom";
          adIntervalMinutes?: number;
        };
        if (parsed.layoutMode) setLayoutMode(parsed.layoutMode);
        if (parsed.tickerText) setTickerText(parsed.tickerText);
        if (parsed.tickerFontSize) setTickerFontSize(parsed.tickerFontSize);
        if (parsed.tickerSpeed) setTickerSpeed(parsed.tickerSpeed);
        if (parsed.tickerBg) setTickerBg(parsed.tickerBg);
        if (parsed.tickerColor) setTickerColor(parsed.tickerColor);
        if (parsed.tickerPosition) setTickerPosition(parsed.tickerPosition);
        if (parsed.adIntervalMinutes)
          setAdIntervalMinutes(parsed.adIntervalMinutes);
      } catch {
        // ignore
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY_CHANNELS, JSON.stringify(channels));
    if (channels.length === 0) {
      setQueue([]);
      setCurrentIndex(0);
      return;
    }
    fetchVideos(channels);
  }, [channels, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY_ADS, JSON.stringify(ads));
  }, [ads, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY_LAYOUT,
      JSON.stringify({
        layoutMode,
        tickerText,
        tickerFontSize,
        tickerSpeed,
        tickerBg,
        tickerColor,
        tickerPosition,
        adIntervalMinutes,
      })
    );
  }, [
    layoutMode,
    tickerText,
    tickerFontSize,
    tickerSpeed,
    tickerBg,
    tickerColor,
    tickerPosition,
    adIntervalMinutes,
    hydrated,
  ]);

  const currentVideo = useMemo(
    () => queue[currentIndex] ?? null,
    [queue, currentIndex]
  );

  async function fetchVideos(channelList: Channel[]) {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: channelList.map((c) => c.id) }),
      });

      if (!response.ok) {
        throw new Error("Não foi possível buscar vídeos agora.");
      }

      const payload = (await response.json()) as {
        videosByChannel: VideosByChannel;
        errors?: string[];
      };

      const nextQueue = buildRoundRobinQueue(
        channelList,
        payload.videosByChannel
      );
      setQueue(nextQueue);
      setCurrentIndex(0);

      if (payload.errors?.length) {
        setError(payload.errors.join(" | "));
      }
      setStatus(
        `Lista atualizada às ${new Date().toLocaleTimeString("pt-BR")}`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro inesperado ao buscar vídeos."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAddChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const rawInput = channelUrlInput.trim() || channelIdInput.trim();
    if (!rawInput) return;

    try {
      const response = await fetch("/api/resolve-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: rawInput }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Não foi possível identificar o canal.");
      }

      const payload = (await response.json()) as {
        channelId: string;
        label?: string;
      };

      const alreadyExists = channels.some(
        (channel) =>
          channel.id.toLowerCase() === payload.channelId.toLowerCase()
      );
      if (alreadyExists) {
        setError("Esse canal já está na lista.");
        return;
      }

      const label =
        channelLabelInput.trim() ||
        payload.label ||
        `Canal ${channels.length + 1}`;

      const nextChannels = [...channels, { id: payload.channelId, label }];
      setChannels(nextChannels);
      setChannelUrlInput("");
      setChannelIdInput("");
      setChannelLabelInput("");
      setStatus("Canal adicionado com sucesso.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o canal."
      );
    }
  }

  function handleAddAd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = extractVideoId(adInput);
    if (!videoId) {
      setError("Informe um link ou ID de vídeo para a propaganda.");
      return;
    }
    if (ads.includes(videoId)) {
      setError("Esse vídeo de propaganda já está na lista.");
      return;
    }
    setAds((prev) => [...prev, videoId]);
    setAdInput("");
  }

  function handleRemoveAd(videoId: string) {
    setAds((prev) => prev.filter((id) => id !== videoId));
    setAdIndex(0);
  }

  function handleRemoveChannel(id: string) {
    const nextChannels = channels.filter((channel) => channel.id !== id);
    setChannels(nextChannels);
  }

  function handleNextVideo() {
    if (queue.length === 0) return;
    const reachedEnd = currentIndex === queue.length - 1;
    setCurrentIndex((prev) => (prev + 1) % queue.length);

    // Quando atingir o fim da fila, buscamos novamente os vídeos
    if (reachedEnd && !loading) {
      void fetchVideos(channels);
    }
  }

  const triggerAdBreak = useCallback(() => {
    if (!ads.length || !currentVideo) return;
    const currentTime = mainPlayerRef.current?.getCurrentTime?.() ?? 0;
    resumePositionRef.current = currentTime;
    const nextAdId = ads[adIndex % ads.length];
    setAdIndex((prev) => (prev + 1) % Math.max(ads.length, 1));
    setCurrentAdId(nextAdId);
    mainPlayerRef.current = null;
    setPlayerNonce((n) => n + 1);
    setPlaybackMode("ad");
  }, [ads, adIndex, currentVideo]);

  // Programar interrupção para propaganda
  useEffect(() => {
    if (playbackMode !== "main") return;
    if (!ads.length) return;
    if (!currentVideo) return;

    const ms = Math.max(1, adIntervalMinutes) * 60 * 1000;
    const timeoutId = window.setTimeout(() => {
      triggerAdBreak();
    }, ms);

    return () => window.clearTimeout(timeoutId);
  }, [
    playbackMode,
    ads.length,
    adIntervalMinutes,
    currentVideo,
    triggerAdBreak,
  ]);

  // Se por algum motivo o onReady não aplicar o seek, garante retomada assim que voltar ao modo "main"
  useEffect(() => {
    if (
      playbackMode === "main" &&
      resumePositionRef.current != null &&
      mainPlayerRef.current
    ) {
      const resumeAt = resumePositionRef.current;
      mainPlayerRef.current.seekTo?.(resumeAt, true);
      mainPlayerRef.current.playVideo?.();
      resumePositionRef.current = null;
    }
  }, [playbackMode, currentVideo]);

  function handleAdEnd() {
    setPlayerNonce((n) => n + 1);
    setPlaybackMode("main");
    setCurrentAdId(null);
  }

  async function handleFullscreen() {
    const el = playerContainerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível alternar para tela cheia."
      );
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="flex flex-col gap-6 bg-slate-900/50 p-6 lg:rounded-r-3xl lg:border-r lg:border-white/10">
          <header className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              Rotação de canais
            </p>
            <h1 className="text-3xl font-semibold leading-tight text-white">
              Player contínuo do YouTube
            </h1>
            <p className="text-sm text-slate-300">
              Cadastre canais, busque os vídeos mais recentes e deixe o player
              escolher automaticamente o próximo vídeo.
            </p>
          </header>

          <form
            onSubmit={handleAddChannel}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-emerald-500/5"
          >
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                Link do canal ou @handle
              </label>
              <input
                value={channelUrlInput}
                onChange={(event) => setChannelUrlInput(event.target.value)}
                placeholder="Ex: https://www.youtube.com/@GoogleDevs"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                ID do canal (opcional se já colou o link)
              </label>
              <input
                value={channelIdInput}
                onChange={(event) => setChannelIdInput(event.target.value)}
                placeholder="Ex: UC_x5XG1OV2P6uZZ5FSM9Ttw"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                Nome curto (opcional)
              </label>
              <input
                value={channelLabelInput}
                onChange={(event) => setChannelLabelInput(event.target.value)}
                placeholder="Ex: Google Devs"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Adicionar canal
            </button>
          </form>

          <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Layout</h2>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={layoutMode === "plain"}
                    onChange={() => setLayoutMode("plain")}
                    className="accent-emerald-400"
                  />
                  Sem barra
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={layoutMode === "ticker"}
                    onChange={() => setLayoutMode("ticker")}
                    className="accent-emerald-400"
                  />
                  Barra correndo
                </label>
              </div>
            </div>

            {layoutMode === "ticker" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Texto da barra
                  </label>
                  <textarea
                    value={tickerText}
                    onChange={(event) => setTickerText(event.target.value)}
                    className="min-h-[72px] w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Fonte (px)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={48}
                    value={tickerFontSize}
                    onChange={(event) =>
                      setTickerFontSize(Number(event.target.value) || 16)
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Velocidade (segundos por loop)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={60}
                    value={tickerSpeed}
                    onChange={(event) =>
                      setTickerSpeed(Number(event.target.value) || 18)
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Cor do texto
                  </label>
                  <input
                    type="color"
                    value={tickerColor}
                    onChange={(event) => setTickerColor(event.target.value)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-slate-800 p-1"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Cor do fundo
                  </label>
                  <input
                    type="color"
                    value={tickerBg}
                    onChange={(event) => setTickerBg(event.target.value)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-slate-800 p-1"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Posição
                  </label>
                  <select
                    value={tickerPosition}
                    onChange={(event) =>
                      setTickerPosition(event.target.value as "top" | "bottom")
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="top">Topo</option>
                    <option value="bottom">Rodapé</option>
                  </select>
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">
                Propagandas (YouTube)
              </h2>
              <div className="text-xs text-slate-300">
                Intervalo:{" "}
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={adIntervalMinutes}
                  onChange={(event) =>
                    setAdIntervalMinutes(Number(event.target.value) || 1)
                  }
                  className="w-14 rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-right text-xs text-white focus:border-emerald-400 focus:outline-none"
                />{" "}
                min
              </div>
            </div>
            <form className="flex flex-col gap-2" onSubmit={handleAddAd}>
              <input
                value={adInput}
                onChange={(event) => setAdInput(event.target.value)}
                placeholder="Link ou ID do vídeo de propaganda"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300/60 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
              >
                Adicionar propaganda
              </button>
            </form>
            {ads.length === 0 ? (
              <p className="text-xs text-slate-300">
                Cadastre vídeos de propaganda para serem inseridos a cada{" "}
                {adIntervalMinutes} minutos.
              </p>
            ) : (
              <div className="flex flex-col gap-2 text-xs text-slate-200">
                {ads.map((videoId, idx) => (
                  <div
                    key={videoId}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-3 py-2"
                  >
                    <span className="font-mono text-[11px] text-emerald-100">
                      {idx + 1}. {videoId}
                    </span>
                    <button
                      onClick={() => handleRemoveAd(videoId)}
                      className="text-red-300 hover:text-red-200"
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Canais cadastrados ({channels.length})
              </h2>
              <button
                onClick={() => fetchVideos(channels)}
                className="text-xs font-semibold text-emerald-300 underline-offset-4 hover:underline"
              >
                Atualizar lista
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {channels.length === 0 ? (
                <p className="text-sm text-slate-300">
                  Adicione pelo menos um canal para começar.
                </p>
              ) : (
                channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {channel.label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {channel.id}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveChannel(channel.id)}
                      className="text-xs font-semibold text-red-300 hover:text-red-200"
                    >
                      Remover
                    </button>
                  </div>
                ))
              )}
            </div>
            {status && (
              <p className="text-xs text-emerald-200/90">
                {status}
                {queue.length > 0
                  ? ` • ${queue.length} vídeos prontos`
                  : " • Nenhum vídeo carregado"}
              </p>
            )}
            {loading && (
              <p className="text-sm text-emerald-200">Buscando vídeos...</p>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
          </section>

          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Fila</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-emerald-200">
                {queue.length} vídeos
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {queue.slice(0, 12).map((video) => (
                <span
                  key={`${video.channelId}-${video.id}`}
                  className="rounded-full border border-white/10 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                >
                  {video.channelTitle}
                </span>
              ))}
              {queue.length > 12 && (
                <span className="text-xs text-slate-400">
                  +{queue.length - 12} vídeos
                </span>
              )}
              {queue.length === 0 && (
                <span className="text-xs text-slate-400">
                  Nenhum vídeo carregado ainda.
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={handleNextVideo}
                disabled={!currentVideo}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300/60 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              >
                Pular para o próximo vídeo
              </button>
              <button
                onClick={handleFullscreen}
                disabled={!currentVideo}
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              >
                Tela cheia
              </button>
            </div>
          </div>
        </aside>

        <main
          ref={playerContainerRef}
          className="relative min-h-screen overflow-hidden rounded-l-3xl bg-black"
        >
          <div className="absolute inset-0 opacity-40 blur-3xl">
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/30" />
          </div>
          <div className="relative z-10 flex h-full flex-col">
            {layoutMode === "ticker" && tickerPosition === "top" && (
              <TickerBar
                text={tickerText}
                fontSize={tickerFontSize}
                speedSeconds={tickerSpeed}
                bgColor={tickerBg}
                textColor={tickerColor}
              />
            )}

            {playbackMode === "ad" && !currentAdId ? (
              <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-900 to-black">
                <p className="text-sm text-slate-200">
                  Sem vídeo de propaganda disponível.
                </p>
              </div>
            ) : playbackMode === "main" && !currentVideo ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-900 to-black">
                <div className="rounded-full border border-dashed border-white/20 p-6">
                  <div className="h-16 w-16 rounded-full bg-emerald-400/20" />
                </div>
                <p className="text-lg font-semibold text-white">
                  Adicione canais para começar a tocar em sequência
                </p>
                <p className="max-w-md text-center text-sm text-slate-300">
                  Buscamos automaticamente os vídeos mais recentes de cada canal
                  e alternamos em rodízio para evitar repetição.
                </p>
              </div>
            ) : (
              <div className="relative flex-1">
                {(() => {
                  const videoIdToPlay =
                    playbackMode === "ad"
                      ? currentAdId ?? ""
                      : currentVideo?.id ?? "";
                  if (!videoIdToPlay) {
                    return (
                      <div className="flex h-full items-center justify-center bg-black text-sm text-slate-200">
                        Nenhum vídeo para tocar agora.
                      </div>
                    );
                  }
                  return (
                    <YouTube
                      key={`${playbackMode}-${videoIdToPlay}-${playerNonce}`}
                      videoId={videoIdToPlay}
                      className="h-full w-full"
                      iframeClassName="h-full w-full"
                      onReady={(event) => {
                        const player = event?.target as YouTubePlayer;
                        if (playbackMode === "ad") {
                          player.playVideo?.();
                        } else {
                          mainPlayerRef.current = player;
                          if (resumePositionRef.current != null) {
                            const resumeAt = resumePositionRef.current;
                            player.seekTo?.(resumeAt, true);
                            resumePositionRef.current = null;
                          }
                          player.playVideo?.();
                        }
                      }}
                      onEnd={
                        playbackMode === "ad" ? handleAdEnd : handleNextVideo
                      }
                      onError={
                        playbackMode === "ad" ? handleAdEnd : handleNextVideo
                      }
                      opts={{
                        playerVars: {
                          autoplay: 1,
                          controls: 0,
                          rel: 0,
                          modestbranding: 1,
                          fs: 1,
                          playsinline: 1,
                          ...(playbackMode === "main" &&
                          resumePositionRef.current != null
                            ? { start: Math.floor(resumePositionRef.current) }
                            : {}),
                        },
                      }}
                    />
                  );
                })()}
                {/* <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" /> */}
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-8">
                  {/* <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                      {playbackMode === "ad" ? "Propaganda" : "Reproduzindo"}
                    </span>
                    {playbackMode === "ad" && ads.length > 0 ? (
                      <span className="text-xs text-white/80">
                        {((adIndex - 1 + ads.length) % ads.length) + 1} / {ads.length}
                      </span>
                    ) : (
                      <span className="text-xs text-white/80">
                        {currentIndex + 1} / {queue.length}
                      </span>
                    )}
                  </div>
                  <div className="max-w-3xl space-y-3 rounded-2xl bg-black/50 p-4 backdrop-blur">
                    <p className="text-sm uppercase tracking-[0.2em] text-emerald-200">
                      {playbackMode === "ad"
                        ? "Anúncio do YouTube"
                        : currentVideo?.channelTitle}
                    </p>
                    <h2 className="text-3xl font-semibold text-white">
                      {playbackMode === "ad"
                        ? currentAdId
                        : currentVideo?.title}
                    </h2>
                    {playbackMode === "main" && (
                      <p className="text-xs text-slate-300">
                        O player fica em tela cheia e muda sozinho ao fim de
                        cada vídeo. Use o botão acima para pular manualmente.
                      </p>
                    )}
                    {playbackMode === "ad" && (
                      <p className="text-xs text-slate-300">
                        Propaganda toca e, ao finalizar, retomamos o vídeo do
                        ponto em que parou.
                      </p>
                    )}
                  </div> */}
                </div>
              </div>
            )}

            {layoutMode === "ticker" && tickerPosition === "bottom" && (
              <TickerBar
                text={tickerText}
                fontSize={tickerFontSize}
                speedSeconds={tickerSpeed}
                bgColor={tickerBg}
                textColor={tickerColor}
              />
            )}
          </div>
        </main>
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

type TickerProps = {
  text: string;
  fontSize: number;
  speedSeconds: number;
  bgColor: string;
  textColor: string;
};

function TickerBar({
  text,
  fontSize,
  speedSeconds,
  bgColor,
  textColor,
}: TickerProps) {
  const height = Math.max(fontSize + 16, 32);
  const duration = Math.max(speedSeconds, 4);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: bgColor, height }}
    >
      <div
        className="absolute inset-0 flex items-center"
        aria-label="Barra de mensagem"
      >
        <div
          className="whitespace-nowrap"
          style={{
            fontSize,
            color: textColor,
            animation: `marquee ${duration}s linear infinite`,
          }}
        >
          {text || "Sua mensagem aqui"}
        </div>
      </div>
    </div>
  );
}
