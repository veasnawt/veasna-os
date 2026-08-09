import React, { useState } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

// A handful of common languages registered up front (the "light" build) rather than the full
// bundle — keeps this out of the main chunk's weight; anything unregistered just renders as plain
// (unhighlighted) text instead of erroring.
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--os-border)]">
      <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 text-[10px] text-[var(--os-text-muted)]">
        <span>{language || "text"}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded px-1.5 py-0.5 transition hover:bg-white/10 hover:text-[var(--os-text)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: "10px 12px", fontSize: "11px", background: "rgba(0,0,0,0.25)" }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--os-accent-text)] underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--os-text)]">{children}</strong>,
  h1: ({ children }) => <h1 className="mt-2 text-sm font-semibold text-[var(--os-text)]">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-2 text-sm font-semibold text-[var(--os-text)]">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 text-xs font-semibold text-[var(--os-text)]">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--os-border)] pl-3 text-[var(--os-text-muted)]">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="my-1 w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-[var(--os-border)] px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-[var(--os-border)] px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-[var(--os-border)]" />,
  code(props) {
    const { children, className } = props;
    // remark-gfm/react-markdown only puts a `language-xxx` className on FENCED (```) code blocks —
    // plain `inline code` never gets one. That distinction (not a since-removed `inline` prop —
    // react-markdown v9+ no longer passes one) is what separates the two renderings here.
    const match = /language-(\w+)/.exec(className || "");
    if (!className) {
      return <code className="rounded bg-[var(--os-surface)] px-1 py-0.5 text-[11px] text-[var(--os-accent-text)]">{children}</code>;
    }
    return <CodeBlock language={match?.[1] || ""} code={String(children).replace(/\n$/, "")} />;
  },
};

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
