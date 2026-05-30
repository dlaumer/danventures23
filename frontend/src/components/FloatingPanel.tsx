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
  return (
    <section className={`floating-panel ${className} ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        className="floating-panel-toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{title}</span>
        <ChevronDown size={17} />
      </button>
      {isOpen && <div className="floating-panel-body">{children}</div>}
    </section>
  );
}
