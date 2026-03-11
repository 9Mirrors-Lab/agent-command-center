import { useState } from "react";

interface Props {
  onBroadcast: (message: string) => void;
}

export default function BroadcastBar({ onBroadcast }: Props) {
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onBroadcast(message.trim());
    setMessage("");
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <div className="px-4 py-1 border-b border-border">
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-text-secondary hover:text-accent transition-colors"
        >
          Broadcast to all agents...
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex border-b border-border">
      <div className="px-3 py-2 text-xs text-accent font-medium flex items-center">ALL</div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message all active agents..."
        className="flex-1 bg-bg px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-secondary"
        autoFocus
        onBlur={() => !message && setExpanded(false)}
      />
      <button
        type="submit"
        className="px-4 py-2 text-xs bg-accent/20 text-accent font-medium hover:bg-accent/30 transition-colors"
      >
        Broadcast
      </button>
    </form>
  );
}
