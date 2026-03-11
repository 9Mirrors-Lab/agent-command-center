import { useEffect, useRef } from "react";

interface Props {
  agentId: string;
  workDir: string;
}

/**
 * Terminal panel stub — full xterm.js + node-pty integration deferred.
 * For now shows a placeholder. To enable:
 * 1. npm install node-pty on the server
 * 2. Add PTY WebSocket endpoint at /ws/terminal/:agentId
 * 3. Connect xterm.js here
 */
export default function TerminalPanel({ agentId, workDir }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="flex items-center justify-center h-full bg-bg text-text-secondary text-xs">
      <div className="text-center">
        <div className="mb-1">Terminal</div>
        <div className="opacity-50">{workDir}</div>
        <div className="opacity-30 mt-2">xterm.js integration pending</div>
      </div>
    </div>
  );
}
