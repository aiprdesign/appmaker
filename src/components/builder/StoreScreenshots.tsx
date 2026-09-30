"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Download, ImageIcon, Loader2, Moon, Sparkles, Sun, Trash2 } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Preview } from "@/components/Preview";
import { aiChoiceFor, getAiSettings } from "@/lib/ai/settings";
import { findClaims, DEFAULT_WORDING } from "@/lib/claims";
import { downloadBlob, renderIcon, slugify } from "@/lib/export";
import { uid } from "@/lib/storage";
import { loadShots, saveShots } from "@/lib/shots-store";
import {
  captureFrame,
  defaultCaptions,
  MAX_SHOTS,
  renderFeatureGraphic,
  renderPlain,
  renderShot,
  SHOT_SIZES,
  toBlob,
  type Shot,
  type ShotStyle,
} from "@/lib/store-shots";
import type { Project } from "@/lib/types";

const field = "min-h-9 w-full rounded-lg border border-line bg-background px-2.5 text-sm text-foreground outline-none focus:border-violet-500/60";

/** One listing image, drawn at display size from the full-size render. */
function ShotPreview({ shot, style, brand, platform }: { shot: Shot; style: ShotStyle; brand: string; platform: "ios" | "android" }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const size = platform === "ios" ? SHOT_SIZES.apple : SHOT_SIZES.google;
      const canvas = await renderShot(shot, size, style, brand, platform).catch(() => null);
      if (live && canvas) setSrc(canvas.toDataURL("image/jpeg", 0.8));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [shot, style, brand, platform]);
  const ratio = platform === "ios" ? "1290 / 2796" : "1080 / 1920";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`Store image: ${shot.title}`} className="w-full rounded-xl border border-line" style={{ aspectRatio: ratio }} />
  ) : (
    <div className="grid w-full place-items-center rounded-xl border border-line bg-surface-2" style={{ aspectRatio: ratio }}>
      <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Drawing" />
    </div>
  );
}

/**
 * Store screenshots: tap through the live app, capture screens, and get
 * finished listing images (headline, subheading, phone frame) at the sizes
 * Apple and Google ask for, plus Google Play's feature graphic.
 */
export function StoreScreenshots({ project }: { project: Project }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<ShotStyle>("brand");
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [busy, setBusy] = useState<"capture" | "ai" | "zip" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const phone = useRef<HTMLDivElement>(null);
  const brand = project.listing.primaryColor;

  useEffect(() => {
    let live = true;
    loadShots(project.id).then((s) => {
      if (!live) return;
      setShots(s);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [project.id]);
  useEffect(() => {
    if (loaded) void saveShots(project.id, shots);
  }, [shots, loaded, project.id]);

  const capture = async () => {
    const frame = phone.current?.querySelector<HTMLIFrameElement>('iframe[title="App preview"]');
    if (!frame) return;
    setBusy("capture");
    setNote(null);
    try {
      const { dataUrl, text } = await captureFrame(frame);
      const [caption] = defaultCaptions(project.listing, shots.length + 1).slice(-1);
      setShots((s) => [...s, { id: uid(), screen: dataUrl, text, ...caption }]);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't capture the screen." });
    } finally {
      setBusy(null);
    }
  };

  const update = (id: string, patch: Partial<Shot>) => setShots((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setShots((s) => {
      const next = [...s];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x);
      return next;
    });

  const writeHeadlines = async () => {
    setBusy("ai");
    setNote(null);
    try {
      const res = await fetch("/api/captions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listing: project.listing,
          screens: shots.map((s) => s.text),
          ai: aiChoiceFor(getAiSettings()),
          wording: project.wording ?? DEFAULT_WORDING,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't write headlines.");
      const captions = data.captions as { title: string; subtitle: string }[];
      setShots((s) => s.map((x, i) => (captions[i] ? { ...x, title: captions[i].title, subtitle: captions[i].subtitle } : x)));
      setNote({ ok: true, text: "Headlines written. Check each one says what the screen really does, and edit freely." });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't write headlines." });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    setBusy("zip");
    setNote(null);
    try {
      const zip = new JSZip();
      const name = slugify(project.listing.name || project.name);
      for (const [i, shot] of shots.entries()) {
        const n = String(i + 1).padStart(2, "0");
        zip.file(`app-store/${n}.png`, await toBlob(await renderShot(shot, SHOT_SIZES.apple, style, brand, "ios")));
        zip.file(`google-play/${n}.png`, await toBlob(await renderShot(shot, SHOT_SIZES.google, style, brand, "android")));
        zip.file(`plain/app-store-${n}.png`, await toBlob(await renderPlain(shot, SHOT_SIZES.apple)));
        zip.file(`plain/google-play-${n}.png`, await toBlob(await renderPlain(shot, SHOT_SIZES.google)));
      }
      const icon = URL.createObjectURL(await renderIcon(project.listing, 512, project.icon));
      try {
        zip.file("google-play/feature-graphic.png", await toBlob(await renderFeatureGraphic(project.listing, icon, style, shots[0])));
      } finally {
        URL.revokeObjectURL(icon);
      }
      zip.file(
        "README.txt",
        [
          `Store images for ${project.listing.name}`,
          "",
          `app-store/  ${SHOT_SIZES.apple.w}×${SHOT_SIZES.apple.h}: upload to App Store Connect, iPhone 6.9" display (up to 10).`,
          `google-play/  ${SHOT_SIZES.google.w}×${SHOT_SIZES.google.h}: Google Play Console, Phone screenshots (2 to 8), plus feature-graphic.png (1024×500, required).`,
          "plain/  the same screens without headlines, if you prefer plain screenshots.",
          "",
          "Check every image shows the app as it really is: the stores reject screenshots that don't.",
        ].join("\n"),
      );
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${name}-store-images.zip`);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't make the images." });
    } finally {
      setBusy(null);
    }
  };

  const claims = (project.wording ?? DEFAULT_WORDING) === "claim-safe" ? shots.flatMap((s) => findClaims(`${s.title} ${s.subtitle}`).map((c) => c.phrase)) : [];
  const segment = (active: boolean) =>
    `min-h-8 rounded-md px-3 text-xs ${active ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"}`;

  return (
    <section className="@container rounded-2xl border border-line bg-surface p-5" aria-labelledby="shots-title">
      <h2 id="shots-title" className="flex items-center gap-2 font-semibold">
        <ImageIcon className="h-4 w-4 text-violet-300" /> Store screenshots
      </h2>
      <p className="mt-1 text-sm text-muted">
        Tap through your app on the phone below and capture the screens you want to show. Appmaker turns them into listing images with headlines, at the sizes
        the App Store and Google Play ask for, plus Google Play&apos;s feature graphic.
      </p>

      <div className="mt-4 grid gap-5 @3xl:grid-cols-[260px_1fr]">
        <div className="mx-auto w-full max-w-[260px]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-lg border border-line bg-background p-0.5" role="group" aria-label="Phone">
              <button className={segment(platform === "ios")} aria-pressed={platform === "ios"} onClick={() => setPlatform("ios")}>
                iPhone
              </button>
              <button className={segment(platform === "android")} aria-pressed={platform === "android"} onClick={() => setPlatform("android")}>
                Android
              </button>
            </div>
            <button
              onClick={() => setScheme((m) => (m === "dark" ? "light" : "dark"))}
              aria-pressed={scheme === "dark"}
              aria-label="Capture in dark mode"
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-foreground"
            >
              {scheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
          <div ref={phone} className="mt-2 h-[480px]">
            <PhoneFrame platform={platform}>
              <Preview files={project.files} platform={platform} reloadKey={0} scheme={scheme} />
            </PhoneFrame>
          </div>
          <button
            onClick={capture}
            disabled={!!busy || shots.length >= MAX_SHOTS || !Object.keys(project.files).length}
            className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-black disabled:opacity-50"
          >
            {busy === "capture" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {shots.length >= MAX_SHOTS ? `${MAX_SHOTS} screens captured` : "Capture this screen"}
          </button>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-background p-0.5" role="radiogroup" aria-label="Background">
              {(["brand", "light", "dark"] as const).map((s) => (
                <button key={s} role="radio" aria-checked={style === s} className={segment(style === s)} onClick={() => setStyle(s)}>
                  {s === "brand" ? "Brand color" : s === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
            {shots.length > 0 && (
              <>
                <button
                  onClick={writeHeadlines}
                  disabled={!!busy}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-white/20 disabled:opacity-50"
                >
                  {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Write headlines with AI
                </button>
                <button
                  onClick={downloadAll}
                  disabled={!!busy}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-50"
                >
                  {busy === "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download all images
                </button>
              </>
            )}
          </div>
          {note && (
            <p role={note.ok ? "status" : "alert"} className={`mt-2 text-xs ${note.ok ? "text-emerald-300" : "text-amber-200"}`}>
              {note.text}
            </p>
          )}
          {claims.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Claim-safe wording: rewrite{" "}
              {claims
                .slice(0, 3)
                .map((c) => `“${c}”`)
                .join(", ")}{" "}
              in your headlines.
            </p>
          )}
          {shots.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              No screens yet. Open the screens that show off your app best (up to {MAX_SHOTS}; Google Play needs at least 2) and press Capture this screen.
            </p>
          ) : (
            <ol className="mt-4 grid grid-cols-2 gap-4 @xl:grid-cols-3 @4xl:grid-cols-4">
              {shots.map((shot, i) => (
                <li key={shot.id} className="space-y-2">
                  <ShotPreview shot={shot} style={style} brand={brand} platform={platform} />
                  <label className="block text-xs text-muted">
                    Headline {i + 1}
                    <input className={`${field} mt-1`} value={shot.title} maxLength={60} onChange={(e) => update(shot.id, { title: e.target.value })} />
                  </label>
                  <label className="block text-xs text-muted">
                    Subheading
                    <input className={`${field} mt-1`} value={shot.subtitle} maxLength={80} onChange={(e) => update(shot.id, { subtitle: e.target.value })} />
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move screenshot ${i + 1} earlier`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === shots.length - 1}
                      aria-label={`Move screenshot ${i + 1} later`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShots((s) => s.filter((x) => x.id !== shot.id))}
                      aria-label={`Remove screenshot ${i + 1}`}
                      className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-muted">
            Screenshots are kept in this browser. The stores reject images that don&apos;t show the app as it really is, so capture real screens and keep the
            headlines true.
          </p>
        </div>
      </div>
    </section>
  );
}
