import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/builder/Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("chat markdown", () => {
  it("links only to Appmaker's own pages", () => {
    expect(html("You're out of credits. [Buy credits](/credits) to keep building.")).toContain(
      '<a class="font-medium text-violet-300 underline underline-offset-2" href="/credits">Buy credits</a>',
    );
    // Anything else stays plain text, so AI replies can't carry links elsewhere.
    expect(html("[Click me](/admin)")).not.toContain("<a");
    expect(html("[Click me](https://evil.example)")).not.toContain("<a");
    expect(html("**bold** and `code`")).toBe('<div class="prose-chat"><p><strong>bold</strong> and <code>code</code></p></div>');
  });
});
