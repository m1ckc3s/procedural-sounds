import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";

export const metadata = { title: "Third-party notices" };

// Renders THIRD-PARTY-NOTICES.md, the one attribution source of truth, with a purpose-built
// parser instead of a markdown dependency: the file uses five constructs (h1, h2, hr, code
// fence, paragraph) and nothing else.
interface Block {
  kind: "h1" | "h2" | "hr" | "code" | "p";
  text: string;
}

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let code: string[] | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const line of md.split("\n")) {
    if (code) {
      if (line.startsWith("```")) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    const t = line.trim();
    if (t.startsWith("```")) {
      flush();
      code = [];
    } else if (t.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: t.slice(3) });
    } else if (t.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: t.slice(2) });
    } else if (t === "---") {
      flush();
      blocks.push({ kind: "hr", text: "" });
    } else if (t === "") {
      flush();
    } else {
      para.push(t);
    }
  }
  flush();
  return blocks;
}

function Paragraph({ text }: { text: string }) {
  const url = text.match(/^https?:\/\/\S+$/)?.[0];
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {url.replace(/^https?:\/\//, "")}
      </a>
    );
  }
  return <p className="max-w-prose text-sm leading-6 text-muted-foreground">{text}</p>;
}

export default async function LicensesPage() {
  const md = await fs.readFile(path.join(process.cwd(), "THIRD-PARTY-NOTICES.md"), "utf8");
  const blocks = parse(md);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-2xl items-center justify-center px-6 py-6">
        <Link href="/" className="text-[18px] font-[450] tracking-tight">
          Back to the sounds
        </Link>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-6 pt-4 pb-20">
        {blocks.map((b, i) =>
          b.kind === "h1" ? (
            <h1 key={i} className="pb-2 text-[30px] leading-[1.1] font-normal tracking-[-0.04em]">
              {b.text}
            </h1>
          ) : b.kind === "h2" ? (
            <h2 key={i} className="pt-6 text-[15px] font-medium">
              {b.text}
            </h2>
          ) : b.kind === "hr" ? (
            <hr key={i} className="mt-8 border-border" />
          ) : b.kind === "code" ? (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
            >
              {b.text}
            </pre>
          ) : (
            <Paragraph key={i} text={b.text} />
          ),
        )}
      </main>
    </div>
  );
}
