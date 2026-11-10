"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ChatImage, ChatMessage } from "@/lib/chats";
import { strings } from "@/lib/strings";

type ExportFormat = "docx" | "pdf" | "md" | "txt";

type SelectedFile = {
  id: string;
  file: File;
};

type ChatProps = {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
];
const ACCEPTED_TYPES = ACCEPTED_EXTENSIONS.join(",");

const QUICK_ACTIONS = [
  {
    id: "summarize",
    label: strings.quickSummarize,
    prompt: "Faayiloota kana cuunfaa salphaa taasisuun naaf ibsi.",
  },
  {
    id: "plan",
    label: strings.quickPlan,
    prompt: "Faayiloota kana irratti hundaa'uun karoora salphaa naaf qopheessi.",
  },
  {
    id: "report",
    label: strings.quickReport,
    prompt: "Faayiloota kana irratti hundaa'uun gabaasa qophaa'aa barreessi.",
  },
] as const;

const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: "docx", label: strings.exportWord },
  { format: "pdf", label: strings.exportPdf },
  { format: "md", label: strings.exportMarkdown },
  { format: "txt", label: strings.exportText },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) {
    return strings.errorPptx;
  }
  if (file.size > MAX_FILE_SIZE) {
    return strings.errorFileTooLarge(file.name);
  }
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return strings.errorFileType;
  }
  return null;
}

function toDisplayImageUrl(url: string) {
  if (url.startsWith("/files/")) {
    return `/api/files/${encodeURIComponent(url.slice("/files/".length))}`;
  }
  return url;
}

function titleFromText(text: string, fallback: string) {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean) || fallback;
  return firstLine.slice(0, 80);
}

async function downloadExport(
  text: string,
  format: ExportFormat,
  title: string,
): Promise<string | null> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text, format, title }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return data?.error ?? strings.errorExportFailed;
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = utfMatch
    ? decodeURIComponent(utfMatch[1])
    : plainMatch?.[1] || `deebii.${format}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return null;
}

function buildConversationMarkdown(messages: ChatMessage[]) {
  const parts = [`# ${strings.appName}`, ""];
  for (const message of messages) {
    const who = message.role === "user" ? strings.you : strings.assistant;
    parts.push(`## ${who}`);
    parts.push("");
    parts.push(message.text || `_(${strings.imageOnlyPlaceholder})_`);
    parts.push("");
  }
  return parts.join("\n");
}

export default function Chat({ messages, onMessagesChange }: ChatProps) {
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const next: SelectedFile[] = [];
    for (const file of incoming) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      next.push({ id: makeId(), file });
    }

    setError(null);
    setSelectedFiles((prev) => {
      const existingKeys = new Set(
        prev.map(
          (item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
        ),
      );
      const unique = next.filter(
        (item) =>
          !existingKeys.has(
            `${item.file.name}:${item.file.size}:${item.file.lastModified}`,
          ),
      );
      return [...prev, ...unique];
    });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function removeFile(id: string) {
    setSelectedFiles((prev) => prev.filter((item) => item.id !== id));
  }

  function clearSelectedFiles() {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!loading) setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (loading) return;
    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  async function postChatText(text: string) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = (await response.json().catch(() => null)) as {
      text?: string;
      images?: ChatImage[];
      error?: string;
    } | null;

    return { response, data };
  }

  async function postChatFiles(files: File[], text: string) {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file, file.name);
    }
    formData.append("text", text);

    const response = await fetch("/api/chat-file", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json().catch(() => null)) as {
      text?: string;
      images?: ChatImage[];
      error?: string;
    } | null;

    return { response, data };
  }

  async function handleSend(promptText: string, files: File[]) {
    const text = promptText.trim();
    if (loading) return;
    if (!text && files.length === 0) return;

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    const fileNames = files.map((file) => file.name).join(", ");
    const displayText =
      files.length > 0
        ? `${fileNames}\n\n${text || strings.defaultFilePrompt}`
        : text;

    setError(null);
    setInput("");
    setLoading(true);
    setOpenMenuId(null);
    setConversationMenuOpen(false);

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: makeId(), role: "user", text: displayText },
    ];
    onMessagesChange(nextMessages);

    try {
      const { response, data } =
        files.length > 0
          ? await postChatFiles(files, text || strings.defaultFilePrompt)
          : await postChatText(text);

      if (!response.ok) {
        setError(data?.error ?? strings.errorGeneric);
        return;
      }

      const reply = data?.text?.trim() ?? "";
      const images = data?.images ?? [];
      if (!reply && images.length === 0) {
        setError(strings.errorEmptyReply);
        return;
      }

      onMessagesChange([
        ...nextMessages,
        {
          id: makeId(),
          role: "assistant",
          text: reply,
          images,
        },
      ]);
      clearSelectedFiles();
    } catch {
      setError(strings.errorServerDown);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    await handleSend(
      input,
      selectedFiles.map((item) => item.file),
    );
  }

  async function runQuickAction(prompt: string) {
    if (selectedFiles.length === 0) {
      setError(strings.errorNeedFileFirst);
      return;
    }
    await handleSend(
      prompt,
      selectedFiles.map((item) => item.file),
    );
  }

  async function exportMessage(message: ChatMessage, format: ExportFormat) {
    setOpenMenuId(null);
    const err = await downloadExport(
      message.text || strings.imageOnlyPlaceholder,
      format,
      titleFromText(message.text, "Deebii_Dubbii"),
    );
    if (err) setError(err);
  }

  async function exportConversation(format: ExportFormat) {
    setConversationMenuOpen(false);
    if (messages.length === 0) {
      setError(strings.errorNeedMessages);
      return;
    }
    const err = await downloadExport(
      buildConversationMarkdown(messages),
      format,
      "Haasaa_Dubbii",
    );
    if (err) setError(err);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(event);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="hidden items-center justify-between gap-2 px-4 py-3 md:flex">
        <div>
          <p className="text-sm font-semibold tracking-tight">{strings.appName}</p>
          <p className="text-xs text-[var(--muted)]">{strings.appTagline}</p>
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setConversationMenuOpen((open) => !open);
              setOpenMenuId(null);
            }}
            disabled={loading || messages.length === 0}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {strings.downloadConversation}
          </button>
          {conversationMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  type="button"
                  onClick={() => void exportConversation(option.format)}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
            <p className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              {strings.emptyStateTitle}
            </p>
            <p className="max-w-sm text-center text-sm leading-6 text-[var(--muted)]">
              {strings.emptyState}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div className="max-w-[85%]">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap ${
                      message.role === "user"
                        ? "rounded-br-md bg-[var(--user-bubble)] text-[var(--user-bubble-fg)]"
                        : "rounded-bl-md border border-[var(--border)] bg-[var(--assistant-bubble)] text-[var(--foreground)]"
                    }`}
                  >
                    {message.text}
                  </div>

                  {message.role === "assistant" &&
                    (message.images?.length ?? 0) > 0 && (
                      <div className="mt-2 grid gap-2">
                        {message.images!.map((image) => (
                          <div
                            key={image.id}
                            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={toDisplayImageUrl(image.url)}
                              alt={image.alt || image.title}
                              className="max-h-72 w-full object-contain bg-[var(--surface-muted)]"
                            />
                            <div className="flex items-center justify-between gap-2 px-3 py-2">
                              <p className="truncate text-xs text-[var(--muted)]">
                                {image.title}
                              </p>
                              <a
                                href={toDisplayImageUrl(image.url)}
                                download
                                className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
                              >
                                {strings.downloadImage}
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {message.role === "assistant" && message.text && (
                    <div className="relative mt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId((current) =>
                            current === message.id ? null : message.id,
                          )
                        }
                        className="rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)]"
                      >
                        {strings.download} ▾
                      </button>
                      {openMenuId === message.id && (
                        <div className="absolute left-0 z-20 mt-1 w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
                          {EXPORT_OPTIONS.map((option) => (
                            <button
                              key={option.format}
                              type="button"
                              onClick={() =>
                                void exportMessage(message, option.format)
                              }
                              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--muted)]">
                  {strings.loading}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--composer-bg)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => void runQuickAction(action.prompt)}
              disabled={loading}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>

        {selectedFiles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedFiles.map((item) => (
              <div
                key={item.id}
                className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.file.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatFileSize(item.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  disabled={loading}
                  aria-label={`${item.file.name} ${strings.removeFile}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--danger)] transition hover:bg-[var(--danger)]/10 disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={sendMessage}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={onFileChange}
            className="hidden"
          />

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-xl border border-dashed p-2 transition ${
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--border)] bg-[var(--background)]"
            }`}
          >
            <p className="mb-2 px-1 text-xs text-[var(--muted)]">
              {strings.composerHint}
            </p>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="h-11 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {strings.attach}
              </button>
              <label htmlFor="chat-input" className="sr-only">
                {strings.placeholder}
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={strings.placeholder}
                disabled={loading}
                className="max-h-36 min-h-11 flex-1 resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm leading-5 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && selectedFiles.length === 0)}
                className="h-11 shrink-0 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {strings.send}
              </button>
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}
