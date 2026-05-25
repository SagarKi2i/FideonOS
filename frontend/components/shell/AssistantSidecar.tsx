'use client';
import { usePathname } from 'next/navigation';
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Sparkles,
  Send,
  Loader2,
  CornerDownLeft,
  ArrowUpRight,
  Wand2,
} from "lucide-react";
import { streamChat } from "@/lib/aiChat";
import { cn } from "@/lib/utils";

interface SidecarMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AssistantContext {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Open with a pre-filled prompt that sends immediately. */
  ask: (prompt: string) => void;
}

const Ctx = React.createContext<AssistantContext | null>(null);

export function useAssistant() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAssistant must be used within <AssistantProvider>");
  return ctx;
}

const SUGGESTED_PROMPTS = [
  { label: "Summarize what needs me today", icon: Sparkles },
  { label: "Show overdue renewals from Hartford", icon: ArrowUpRight },
  { label: "Draft a renewal email for ABC Hardware", icon: Wand2 },
  { label: "Triage the latest carrier email", icon: Send },
];

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<SidecarMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const pathname = usePathname();

  const ctx = React.useMemo<AssistantContext>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
      ask: (prompt: string) => {
        setInput(prompt);
        setOpen(true);
        // Defer send by one tick so the panel is mounted first
        setTimeout(() => sendMessage(prompt), 50);
      },
    }),
    [open], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cmd/Ctrl + / toggles the assistant
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    const userMsg: SidecarMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMsg: SidecarMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const pageContext = `[The user is currently on page: ${pathname}]`;
    const systemPrimer =
      `You are Fideon, an AI assistant inside the Fideon OS platform for insurance brokers. ` +
      `Be concise (max 4 short paragraphs or a bullet list of <=6 items). Use Markdown when helpful. ` +
      `When the user asks to do something (draft an email, run an agent, filter a view), describe ` +
      `the steps clearly — UI tool-calling is being added in a future release. ${pageContext}`;

    const apiMessages = [
      { role: "user" as const, content: systemPrimer + "\n\n---\n\n" + text },
    ];

    await streamChat({
      messages: apiMessages,
      onDelta: (delta) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m)),
        );
      },
      onDone: () => setStreaming(false),
      onError: (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `_Sorry — ${err}. Make sure ANTHROPIC_API_KEY is configured on the chat edge function._` }
              : m,
          ),
        );
        setStreaming(false);
      },
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {/* Floating launcher button (bottom right) */}
      <button
        type="button"
        aria-label="Open AI assistant"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-30 hidden md:inline-flex items-center gap-2",
          "h-11 px-4 rounded-full bg-gradient-primary text-primary-foreground",
          "shadow-glow hover:shadow-premium transition-all duration-200",
          "active:scale-95",
          open && "opacity-0 pointer-events-none",
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span className="font-semibold text-[13px]">Ask Fideon</span>
        <kbd className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono">⌘/</kbd>
      </button>

      {/* Side panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col p-0 gap-0 bg-card border-l-border"
        >
          <SheetTitle className="sr-only">Ask Fideon</SheetTitle>
          <SheetDescription className="sr-only">
            Context-aware assistant for your work — quotes, renewals, and agent activity.
          </SheetDescription>
          {/* Header — leaves space for the built-in close button on the right */}
          <div className="px-5 py-4 pr-12 border-b border-border flex items-center justify-between bg-gradient-hero">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
                <Sparkles className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="font-display text-[15px] font-bold tracking-tight">Ask Fideon</p>
                <p className="text-[11px] text-muted-foreground">Context-aware · your data only</p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="xs" onClick={reset}>New chat</Button>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-4">
              {messages.length === 0 ? (
                <div>
                  <p className="text-[13px] text-muted-foreground mb-3">
                    Ask anything about your work — quotes, renewals, agent activity. I have context on this page and your data.
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTED_PROMPTS.map((sp) => (
                      <button
                        key={sp.label}
                        onClick={() => sendMessage(sp.label)}
                        className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border border-border hover:border-border-strong hover:bg-accent/40 transition-colors group"
                      >
                        <sp.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-[13px] text-foreground/85 group-hover:text-foreground flex-1">
                          {sp.label}
                        </span>
                        <CornerDownLeft className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-accent text-foreground border border-primary/15 ml-6"
                        : "bg-muted/40 text-foreground/90 mr-6 border border-border/60",
                    )}
                  >
                    {m.content || (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Thinking…
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t border-border bg-card px-3 py-3">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything…"
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 pr-11 text-[13.5px] focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/15 transition-colors placeholder:text-muted-foreground/70"
              />
              <Button
                size="icon-sm"
                variant="primary"
                disabled={!input.trim() || streaming}
                onClick={() => sendMessage()}
                className="absolute bottom-2 right-2 h-7 w-7"
                aria-label="Send"
              >
                {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span>Press <kbd className="px-1 rounded bg-muted">Enter</kbd> to send · <kbd className="px-1 rounded bg-muted">⇧</kbd>+<kbd className="px-1 rounded bg-muted">Enter</kbd> for newline</span>
              <span>Fideon AI</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
