export type ChatRole = "user" | "assistant";

export type ChatImage = {
  id: string;
  title: string;
  alt: string;
  url: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  images?: ChatImage[];
};

export type StoredChat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  createdAt: number;
};

const STORAGE_KEY = "dubbii.chats.v1";
const LEGACY_STORAGE_KEY = "gemini-wrapper.chats.v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadChats(): StoredChat[] {
  if (!canUseStorage()) return [];
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChat[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveChats(chats: StoredChat[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

export function createChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessages(messages: ChatMessage[], fallback: string) {
  const firstUser = messages.find((message) => message.role === "user");
  const line =
    firstUser?.text
      .split("\n")
      .map((part) => part.trim())
      .find(Boolean) || fallback;
  return line.slice(0, 60);
}
