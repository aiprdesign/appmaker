import { Apple, Globe, MessageSquareText, Play, Wand2 } from "lucide-react";

function Tile({ icon: Icon, label }: { icon: typeof Globe; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-violet-200 shadow-lg shadow-black/30 sm:h-16 sm:w-16">
        <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
      </span>
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
    </div>
  );
}

function Connector() {
  return <span className="flow-line h-1 w-5 shrink-0 self-center sm:w-12 md:w-16" />;
}

/** A small phone with an app on it: brand header and a few rows. */
function MiniPhone() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-24 w-[3.25rem] flex-col gap-1 rounded-[0.9rem] border-2 border-white/25 bg-[#12121a] p-1.5 shadow-xl shadow-violet-900/40 sm:h-32 sm:w-[4.25rem] sm:gap-1.5 sm:p-2">
        <div className="h-5 rounded-md bg-gradient-to-r from-violet-500 to-pink-500 sm:h-7" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[4px] bg-violet-400/60 sm:h-3.5 sm:w-3.5" />
            <span className="h-1.5 flex-1 rounded-full bg-white/20" />
          </div>
        ))}
        <div className="mt-auto flex justify-around">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i ? "bg-white/25" : "bg-pink-400"}`} />
          ))}
        </div>
      </div>
      <span className="text-[11px] text-muted sm:text-xs">Native app</span>
    </div>
  );
}

/** The idea in one picture: an idea or a website goes in, a store-ready app comes out. */
export function ConceptFlow() {
  return (
    <div
      role="img"
      aria-label="Your idea or your website goes into Appmaker, which makes a native app for the App Store and Google Play"
      className="mx-auto mb-10 flex max-w-3xl items-center justify-center"
    >
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Tile icon={MessageSquareText} label="Your idea" />
        <Tile icon={Globe} label="Your website" />
      </div>
      <Connector />
      <div className="flex flex-col items-center gap-1.5" aria-hidden="true">
        <span className="float grid h-20 w-20 place-items-center rounded-[1.75rem] bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-2xl shadow-violet-600/50 ring-1 ring-white/20 sm:h-28 sm:w-28 sm:rounded-[2.25rem]">
          <Wand2 className="h-10 w-10 sm:h-14 sm:w-14" />
        </span>
        <span className="text-[11px] font-medium text-foreground/90 sm:text-xs">Appmaker</span>
      </div>
      <Connector />
      <div aria-hidden="true">
        <MiniPhone />
      </div>
      <Connector />
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Tile icon={Apple} label="App Store" />
        <Tile icon={Play} label="Google Play" />
      </div>
    </div>
  );
}
