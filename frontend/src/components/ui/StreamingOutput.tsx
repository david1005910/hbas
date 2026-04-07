interface Props {
  content: string;
  isStreaming: boolean;
  placeholder?: string;
}

export function StreamingOutput({ content, isStreaming, placeholder }: Props) {
  return (
    <div className="relative">
      <pre className="bg-ink-light border border-gold/20 rounded-lg p-4 text-parchment font-body text-sm whitespace-pre-wrap min-h-32 max-h-96 overflow-y-auto leading-relaxed">
        {content || (
          <span className="text-parchment/30">{placeholder || "생성 결과가 여기에 표시됩니다..."}</span>
        )}
        {isStreaming && <span className="animate-pulse text-gold">▌</span>}
      </pre>
    </div>
  );
}
