import { Download } from "lucide-react";

interface Props {
  href: string;
  label?: string;
  className?: string;
}

export function DownloadButton({ href, label = "다운로드", className = "" }: Props) {
  return (
    <a
      href={href}
      download
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold text-sm rounded-lg transition-colors ${className}`}
    >
      <Download size={14} />
      {label}
    </a>
  );
}
