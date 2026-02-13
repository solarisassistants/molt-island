"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ScrollArea } from "./ui/scroll-area";

export function SkillMdViewer() {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/SKILL.md")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load SKILL.md");
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-dim text-xs font-mono">LOADING SKILL.MD...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-400 text-xs font-mono">ERROR: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-bg-panel">
        <h1 className="text-sm md:text-base font-bold tracking-wider">
          SKILL.MD - API DOCUMENTATION
        </h1>
        <a
          href="/SKILL.md"
          download="SKILL.md"
          className="text-[10px] text-accent hover:underline"
        >
          DOWNLOAD RAW
        </a>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6">
          <article className="prose prose-invert prose-sm max-w-none skill-md-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Code blocks with syntax highlighting
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;

                  if (isInline) {
                    return (
                      <code
                        className="bg-black/50 px-1.5 py-0.5 text-accent text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  return (
                    <div className="relative group">
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: "1rem",
                          fontSize: "0.75rem",
                          background: "rgba(0,0,0,0.5)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                      <CopyButton text={String(children)} />
                    </div>
                  );
                },
                // Tables
                table({ children }) {
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border border-border">
                        {children}
                      </table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="bg-black/50 px-3 py-2 text-left text-text-dim font-normal border-b border-border">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="px-3 py-2 border-b border-border/50">
                      {children}
                    </td>
                  );
                },
                // Headings
                h1({ children }) {
                  return (
                    <h1 className="text-xl font-bold text-accent mt-8 mb-4 pb-2 border-b border-border">
                      {children}
                    </h1>
                  );
                },
                h2({ children }) {
                  return (
                    <h2 className="text-lg font-bold text-text-primary mt-6 mb-3">
                      {children}
                    </h2>
                  );
                },
                h3({ children }) {
                  return (
                    <h3 className="text-sm font-bold text-text-primary mt-4 mb-2">
                      {children}
                    </h3>
                  );
                },
                // Blockquotes
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-2 border-accent pl-4 my-4 text-text-secondary italic">
                      {children}
                    </blockquote>
                  );
                },
                // Lists
                ul({ children }) {
                  return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>;
                },
                // Horizontal rule
                hr() {
                  return <hr className="border-border my-6" />;
                },
                // Links
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {children}
                    </a>
                  );
                },
                // Paragraphs
                p({ children }) {
                  return <p className="my-2 text-text-secondary">{children}</p>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </ScrollArea>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-[9px] bg-black/50 border border-border text-text-dim hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? "COPIED!" : "COPY"}
    </button>
  );
}
