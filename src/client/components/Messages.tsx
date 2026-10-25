/** Non-error notes after an import ("skipped…", "too large…"). */
export function Messages({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <ul role="status" className="my-3 list-disc rounded-lg border border-line bg-surface py-2 pr-3 pl-8 text-sm">
      {messages.map((m) => <li key={m}>{m}</li>)}
    </ul>
  );
}
