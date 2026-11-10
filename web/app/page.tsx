"use client";

import Chat from "@/app/components/Chat";
import { AppShell } from "@/components/app-shell";

export default function Home() {
  return (
    <AppShell>
      {({ messages, onMessagesChange }) => (
        <Chat messages={messages} onMessagesChange={onMessagesChange} />
      )}
    </AppShell>
  );
}
