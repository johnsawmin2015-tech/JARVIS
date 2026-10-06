"use client";

import { useRef, useState, type FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("automatic");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const conversationId = useRef<string | undefined>(undefined);
  const abortController = useRef<AbortController | undefined>(undefined);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setPending(true);
    abortController.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          conversationId.current
            ? { conversationId: conversationId.current, provider, messages: nextMessages }
            : { provider, messages: nextMessages },
        ),
        signal: abortController.current.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "JARVIS could not respond");
      }
      conversationId.current = response.headers.get("x-conversation-id") ?? undefined;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: answer }]);
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("Generation stopped.");
      } else {
        setError(caught instanceof Error ? caught.message : "JARVIS could not respond");
      }
    } finally {
      setPending(false);
      abortController.current = undefined;
    }
  }

  return (
    <section className="card">
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="eyebrow">Ready</p>
            <h2>What objective should we work on?</h2>
            <p className="muted">
              Ask a question here, or create a durable task from the Tasks workspace.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              {message.content || "Thinking…"}
            </div>
          ))
        )}
      </div>
      <form className="composer" onSubmit={(event) => void submit(event)}>
        <div className="stack" style={{ gap: 8 }}>
          <textarea
            aria-label="Message"
            className="input"
            placeholder="Give JARVIS an objective…"
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <select
            aria-label="Model provider"
            className="input"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="automatic">Automatic routing</option>
            <option value="gateway">AI Gateway</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          {error ? <span className="error">{error}</span> : null}
        </div>
        {pending ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => abortController.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button className="button" type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
