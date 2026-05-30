import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type FloatingPanelProps = {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
};

export function FloatingPanel({
  children,
  className = "",
  isOpen,
  onToggle,
  title,
}: FloatingPanelProps) {
  if (!isOpen) return null;

  return (
    <section className={`floating-panel ${className} open`}>
      <button
        type="button"
        className="floating-panel-toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
        title={title}
      >
        <span className="floating-panel-title">
          <span className="floating-panel-label">{title}</span>
        </span>
        <ChevronDown size={17} />
      </button>
      <div className="floating-panel-body">{children}</div>
    </section>
  );
}
