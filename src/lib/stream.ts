// Livestream links: which service, and how to play it inside the app.

export type StreamInfo = {
  /** e.g. "YouTube", shown on the "Open in …" button. */
  platform: string;
  /** Player URL for an <iframe>, or null when the service can't be embedded. */
  embedUrl: string | null;
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  const v = u.searchParams.get("v");
  if (v) return v;
  const m = u.pathname.match(/^\/(?:live|embed|shorts)\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function streamInfo(raw: string, parentHost?: string): StreamInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { platform: "the stream", embedUrl: null };
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, "");

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id = youtubeId(u);
    return {
      platform: "YouTube",
      embedUrl:
        id && YT_ID.test(id)
          ? `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`
          : null,
    };
  }
  if (host === "twitch.tv") {
    const channel = u.pathname.split("/")[1];
    return {
      platform: "Twitch",
      embedUrl:
        channel && parentHost && /^\w+$/.test(channel)
          ? `https://player.twitch.tv/?channel=${channel}&parent=${parentHost}&autoplay=true`
          : null,
    };
  }
  if (host === "facebook.com" || host === "fb.watch") {
    return {
      platform: "Facebook",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false&autoplay=true`,
    };
  }
  if (host === "tiktok.com") return { platform: "TikTok", embedUrl: null };
  if (host === "instagram.com") return { platform: "Instagram", embedUrl: null };
  return { platform: "the stream", embedUrl: null };
}
