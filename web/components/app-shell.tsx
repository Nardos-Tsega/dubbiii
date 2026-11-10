"use client";

import { Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChatSidebar } from "@/components/chat-sidebar";
import {
  SessionExpiredPanel,
  SessionStatusDot,
} from "@/components/session-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createChatId,
  loadChats,
  saveChats,
  titleFromMessages,
  type ChatMessage,
  type StoredChat,
} from "@/lib/chats";
import { strings } from "@/lib/strings";

type AppShellProps = {
  children: (ctx: {
    activeChat: StoredChat | null;
    messages: ChatMessage[];
    onMessagesChange: (messages: ChatMessage[]) => void;
    onRequestNewChat: () => Promise<void> | void;
  }) => React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadChats();
    setChats(stored);
    setActiveChatId(stored[0]?.id ?? null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveChats(chats);
  }, [chats, hydrated]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  function upsertChat(next: StoredChat) {
    setChats((prev) => {
      const without = prev.filter((chat) => chat.id !== next.id);
      return [next, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    setActiveChatId(next.id);
  }

  async function handleNewChat() {
    try {
      await fetch("/api/reset", { method: "POST" });
    } catch {
      // Local new chat still proceeds; Chat UI can surface server errors later.
    }

    const now = Date.now();
    const chat: StoredChat = {
      id: createChatId(),
      title: strings.untitledChat,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    upsertChat(chat);
    setMobileOpen(false);
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setMobileOpen(false);
  }

  function handleRenameChat(id: string, title: string) {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === id
          ? { ...chat, title, updatedAt: Date.now() }
          : chat,
      ),
    );
  }

  function handleDeleteChat(id: string) {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id);
      if (activeChatId === id) {
        setActiveChatId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  function handleMessagesChange(messages: ChatMessage[]) {
    const now = Date.now();
    if (!activeChat) {
      const chat: StoredChat = {
        id: createChatId(),
        title: titleFromMessages(messages, strings.untitledChat),
        messages,
        createdAt: now,
        updatedAt: now,
      };
      upsertChat(chat);
      return;
    }

    upsertChat({
      ...activeChat,
      title:
        activeChat.title === strings.untitledChat || !activeChat.title
          ? titleFromMessages(messages, strings.untitledChat)
          : activeChat.title,
      messages,
      updatedAt: now,
    });
  }

  const sidebar = (
    <ChatSidebar
      chats={chats}
      activeChatId={activeChatId}
      onNewChat={handleNewChat}
      onSelectChat={handleSelectChat}
      onRenameChat={handleRenameChat}
      onDeleteChat={handleDeleteChat}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="hidden md:flex">{sidebar}</div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur md:hidden pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={strings.openMenu}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{strings.appName}</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {activeChat?.title || strings.untitledChat}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SessionStatusDot />
            <ThemeToggle />
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{strings.pastChats}</SheetTitle>
            </SheetHeader>
            {sidebar}
          </SheetContent>
        </Sheet>

        <main className="flex min-h-0 flex-1 justify-center overflow-hidden">
          <div className="flex h-full w-full max-w-[720px] flex-col">
            <SessionExpiredPanel />
            {children({
              activeChat,
              messages: activeChat?.messages ?? [],
              onMessagesChange: handleMessagesChange,
              onRequestNewChat: handleNewChat,
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
