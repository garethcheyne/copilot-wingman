"use client";

import { useState, useCallback } from "react";
import { MarkdownHooks as ReactMarkdown } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy code"
      className="absolute top-2 right-2 p-1.5 rounded-md bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/code:opacity-100"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Code blocks
        pre({ children, ...props }) {
          // Extract text content for copy button
          const codeText = extractText(children);
          return (
            <div className="group/code relative my-3 -mx-1">
              <pre
                className="overflow-x-auto rounded-md border border-border/70 bg-secondary/50 p-4 text-[13px] leading-relaxed"
                {...props}
              >
                {children}
              </pre>
              <CopyButton text={codeText} />
            </div>
          );
        },
        // Inline code
        code({ className, children, ...props }) {
          const isBlock = className?.includes("hljs");
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="rounded-[4px] border border-border/50 bg-secondary/60 px-1.5 py-0.5 text-[13px] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        // Paragraphs
        p({ children, ...props }) {
          return (
            <p className="mb-3 last:mb-0 leading-relaxed" {...props}>
              {children}
            </p>
          );
        },
        // Headings
        h1({ children, ...props }) {
          return <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0" {...props}>{children}</h1>;
        },
        h2({ children, ...props }) {
          return <h2 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props}>{children}</h2>;
        },
        h3({ children, ...props }) {
          return <h3 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props}>{children}</h3>;
        },
        // Lists
        ul({ children, ...props }) {
          return <ul className="list-disc pl-5 mb-3 space-y-1" {...props}>{children}</ul>;
        },
        ol({ children, ...props }) {
          return <ol className="list-decimal pl-5 mb-3 space-y-1" {...props}>{children}</ol>;
        },
        li({ children, ...props }) {
          return <li className="leading-relaxed" {...props}>{children}</li>;
        },
        // Links
        a({ children, href, ...props }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              {...props}
            >
              {children}
            </a>
          );
        },
        // Blockquotes
        blockquote({ children, ...props }) {
          return (
            <blockquote
              className="border-l-2 border-primary/40 pl-4 my-3 text-muted-foreground italic"
              {...props}
            >
              {children}
            </blockquote>
          );
        },
        // Tables
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-3 rounded-md border border-border/70">
              <table className="w-full text-sm" {...props}>{children}</table>
            </div>
          );
        },
        thead({ children, ...props }) {
          return <thead className="bg-secondary/40 border-b border-border/70" {...props}>{children}</thead>;
        },
        th({ children, ...props }) {
          return <th className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider" {...props}>{children}</th>;
        },
        td({ children, ...props }) {
          return <td className="px-3 py-2 border-t border-border/40" {...props}>{children}</td>;
        },
        // Horizontal rule
        hr(props) {
          return <hr className="my-4 border-border/50" {...props} />;
        },
        // Strong / em
        strong({ children, ...props }) {
          return <strong className="font-semibold text-foreground" {...props}>{children}</strong>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** Recursively extract text from React children for copy-to-clipboard */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as React.ReactElement).props.children);
  }
  return "";
}
