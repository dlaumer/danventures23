import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type FloatingPanelProps = {
  children: ReactNode;
  className?: string;
  icon: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
};

export function FloatingPanel({
  children,
  className = "",
  icon,
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
        title={title}
      >
        <span className="floating-panel-title">
          <span className="floating-panel-icon">{icon}</span>
          <span className="floating-panel-label">{title}</span>
        </span>
        <ChevronDown size={17} />
      </button>
      {isOpen && <div className="floating-panel-body">{children}</div>}
    </section>
  );
}
