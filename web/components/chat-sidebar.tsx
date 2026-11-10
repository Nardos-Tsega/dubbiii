"use client";

import { Check, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { SessionStatusDot } from "@/components/session-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { StoredChat } from "@/lib/chats";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

type ChatSidebarProps = {
  chats: StoredChat[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  className?: string;
};

export function ChatSidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  className,
}: ChatSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(chat: StoredChat) {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  }

  function commitRename() {
    if (!renamingId) return;
    const next = renameValue.trim();
    if (next) onRenameChat(renamingId, next);
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  return (
    <aside
      className={cn(
        "flex h-full w-[260px] flex-col border-r border-[var(--border)] bg-[var(--sidebar)] text-[var(--foreground)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold tracking-tight">
            {strings.appName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {strings.appTagline}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SessionStatusDot />
          <ThemeToggle />
        </div>
      </div>

      <div className="px-3 pb-3">
        <Button className="w-full justify-start gap-2" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          {strings.newChat}
        </Button>
      </div>

      <Separator />

      <div className="px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          {strings.pastChats}
        </p>
      </div>

      <ScrollArea className="flex-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">
            {strings.noPastChats}
          </p>
        ) : (
          <ul className="space-y-1 pb-4">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              const renaming = renamingId === chat.id;

              return (
                <li key={chat.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-lg px-2 py-1.5",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    {renaming ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") cancelRename();
                          }}
                          aria-label={strings.renamePrompt}
                          className="h-8"
                          autoFocus
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={commitRename}
                          aria-label={strings.renameSave}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={cancelRename}
                          aria-label={strings.renameCancel}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectChat(chat.id)}
                          className="min-w-0 flex-1 truncate px-1 py-1 text-left text-sm"
                          title={chat.title}
                        >
                          {chat.title || strings.untitledChat}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              aria-label={strings.renameChat}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startRename(chat)}>
                              <Pencil />
                              {strings.renameChat}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-[var(--danger)] focus:text-[var(--danger)]"
                              onClick={() => {
                                if (window.confirm(strings.deleteConfirm)) {
                                  onDeleteChat(chat.id);
                                }
                              }}
                            >
                              <Trash2 />
                              {strings.deleteChat}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
