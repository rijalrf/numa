// ChatBubble: bubble pesan user atau assistant
import { User, Bot } from 'lucide-react';
import type { ChatMessage } from '@/pages/chat';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Content bubble */}
      <div
        className={`max-w-[75%] rounded-md px-4 py-3 whitespace-pre-wrap ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
