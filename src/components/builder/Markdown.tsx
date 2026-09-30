import { Fragment } from "react";
import Link from "next/link";

/** Links are only rendered to Appmaker's own pages, so AI replies can't carry links elsewhere. */
const SAFE_LINKS = new Set(["/credits", "/login", "/projects", "/status"]);

/** Minimal markdown for chat replies: paragraphs, bullet lists, **bold**, `code` and links to Appmaker pages. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]{1,60}\]\(\/[a-z]+\))/g);
  return parts.map((p, i) => {
    const link = /^\[([^\]]+)\]\((\/[a-z]+)\)$/.exec(p);
    if (link) {
      return SAFE_LINKS.has(link[2]) ? (
        <Link key={i} href={link[2]} className="font-medium text-violet-300 underline underline-offset-2">
          {link[1]}
        </Link>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      );
    }
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length}>
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="prose-chat">{blocks}</div>;
}
