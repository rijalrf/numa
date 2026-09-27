import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView = React.memo(function MarkdownView({
  content,
  className = '',
}: MarkdownViewProps) {
  if (!content) return null;

  return (
    <div className={`prose-sm max-w-none text-foreground leading-relaxed space-y-3 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-6 mb-3 pb-2 border-b border-border/60">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground mt-5 mb-2.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm sm:text-base font-semibold text-foreground mt-4 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed my-2">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 text-xs sm:text-sm text-foreground/90 pl-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 text-xs sm:text-sm text-foreground/90 pl-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/60 pl-3 italic text-muted-foreground my-3 text-xs sm:text-sm">
              {children}
            </blockquote>
          ),
          code: ({ inline, className: codeClassName, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground border border-border/50" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre className="p-3.5 rounded-xl bg-muted/60 border border-border/60 overflow-x-auto my-3 font-mono text-xs text-foreground leading-relaxed">
                <code {...props}>{children}</code>
              </pre>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 border border-border/70 rounded-xl">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b border-border/70 text-foreground font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="py-2 px-3 text-xs font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="py-2 px-3 border-t border-border/40 text-xs text-foreground/90">
              {children}
            </td>
          ),
          hr: () => <hr className="my-5 border-border/60" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
