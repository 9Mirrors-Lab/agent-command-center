interface Props {
  connected: boolean;
}

export default function ConnectionStatus({ connected }: Props) {
  if (connected) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-error/90 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-50 animate-pulse">
      Disconnected — reconnecting...
    </div>
  );
}
