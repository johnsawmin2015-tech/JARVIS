export function shouldUseDemoChat(demoMode: boolean, providerConfigured: boolean): boolean {
  return demoMode && !providerConfigured;
}

export function createDemoChatText(prompt: string): string {
  const boundedPrompt = prompt.trim().slice(0, 500);
  return [
    "DEMO OUTPUT — no AI model or external provider was called.",
    "",
    `Your message: ${boundedPrompt}`,
    "",
    "The local demo can exercise authentication, process-local conversations, tasks, plans, approvals, memory, activity, artifacts, and usage views.",
    "Demo data resets when the development server restarts. This response is deterministic and is not a model-generated answer.",
  ].join("\n");
}

export function createDemoTextStreamResponse(
  text: string,
  headers: Record<string, string>,
): Response {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,48}(?:\s|$)/gs) ?? [text];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-jarvis-demo": "true",
      ...headers,
    },
  });
}
