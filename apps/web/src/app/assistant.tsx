import { ArrowRight, ArrowUp, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAssistant } from './assistant-context';
import { ASSISTANT_TOPICS, matchTopic, type AssistantTopic } from './assistant-topics';

type Message =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'assistant'; text: string; action?: AssistantTopic['action'] };

const NO_MATCH =
  'I can only answer a few set questions for now, and that is not one of them. Pick one below, or open Docs from the sidebar.';

/** Header button that opens and closes the assistant. Renders nothing outside the shell. */
export function AssistantToggle() {
  const assistant = useAssistant();
  if (!assistant) return null;
  return (
    <Button
      aria-pressed={assistant.open}
      onClick={assistant.toggle}
      className={cn(
        '[&_svg]:text-primary',
        assistant.open && 'border-primary/40 bg-primary/[0.06] text-fg hover:bg-primary/10',
      )}
    >
      <Sparkles /> Assistant
    </Button>
  );
}

/**
 * The assistant itself: set questions with answers that link into the product, plus a box
 * for typed questions that are matched against the same list (assistant-topics.ts).
 * `onClose` is omitted where the container brings its own close button (the mobile sheet).
 */
export function AssistantPanel({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const ask = (question: string, topic: AssistantTopic | undefined = matchTopic(question)) => {
    setMessages((prev) => [
      ...prev,
      { id: prev.length, from: 'user', text: question },
      topic
        ? { id: prev.length + 1, from: 'assistant', text: topic.answer, action: topic.action }
        : { id: prev.length + 1, from: 'assistant', text: NO_MATCH },
    ]);
  };

  const submit = (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setDraft('');
    ask(question);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same rhythm as PageHeader, so the two strips line up across the panels. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle text-primary [&_svg]:size-4">
          <Sparkles aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-6 text-fg">Assistant</h2>
          <p className="truncate text-xs text-fg-muted">Guided answers about this workspace.</p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center text-center">
            <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-bg-subtle text-primary shadow-xs">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <p className="mt-4 max-w-64 text-sm text-fg-muted">
              Ask about your mailboxes, sends or webhooks.
            </p>
            <Suggestions onPick={(topic) => ask(topic.prompt, topic)} className="mt-6" />
          </div>
        ) : (
          <div className="space-y-4" aria-live="polite">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {messages.at(-1)?.text === NO_MATCH ? (
              <Suggestions onPick={(topic) => ask(topic.prompt, topic)} />
            ) : null}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="rounded-xl border border-border bg-bg shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            rows={2}
            aria-label="Ask the assistant"
            placeholder="What would you like to do?"
            className="block w-full resize-none bg-transparent px-3.5 pt-3 text-sm text-fg outline-none placeholder:text-fg-faint"
          />
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
            <span className="px-1 text-xs text-fg-muted">Preview · set questions only</span>
            <Button
              type="submit"
              variant="primary"
              size="icon-sm"
              className="rounded-full"
              aria-label="Send"
              disabled={!draft.trim()}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Suggestions({
  onPick,
  className,
}: {
  onPick: (topic: AssistantTopic) => void;
  className?: string;
}) {
  return (
    <ul className={cn('w-full space-y-2', className)}>
      {ASSISTANT_TOPICS.map((topic) => (
        <li key={topic.id}>
          <button
            type="button"
            onClick={() => onPick(topic)}
            className="flex w-full items-center gap-2.5 rounded-md border border-border bg-bg px-3 py-2.5 text-left text-sm text-fg shadow-xs transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <topic.icon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">{topic.prompt}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.from === 'user') {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-bg-muted px-3.5 py-2 text-sm text-fg">
        {message.text}
      </p>
    );
  }
  return (
    <div className="max-w-[92%] text-sm leading-6 text-fg">
      <p>{message.text}</p>
      {message.action ? (
        <Button asChild size="sm" className="mt-2.5">
          <Link to={message.action.to}>
            {message.action.label} <ArrowRight />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
