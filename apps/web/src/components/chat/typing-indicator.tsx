// TypingIndicator: 3 titik animasi saat AI sedang mengetik
export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <span className="text-xs font-medium">AI</span>
      </div>
      <div className="max-w-[75%] rounded-md px-4 py-3 bg-muted">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
