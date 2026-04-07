interface Props {
  children: string;
  className?: string;
}

export function HebrewText({ children, className = "" }: Props) {
  return (
    <span
      dir="rtl"
      lang="he"
      className={`font-hebrew ${className}`}
      style={{ unicodeBidi: "embed" }}
    >
      {"\u202B"}{children}{"\u202C"}
    </span>
  );
}
