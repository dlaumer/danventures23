import type { FormEvent } from "react";
import { X } from "lucide-react";
import { transportOptions } from "../constants";
import type { LegAttributeFormState } from "../types";
import { optionLabel } from "../utils";

type LegAttributesDialogProps = {
  form: LegAttributeFormState;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (update: Partial<LegAttributeFormState>) => void;
};

export function LegAttributesDialog({
  form,
  isSaving,
  onClose,
  onSubmit,
  onUpdate,
}: LegAttributesDialogProps) {
  return (
    <div className="leg-attributes-dialog" role="dialog" aria-modal="true">
      <form onSubmit={onSubmit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Leg</p>
            <h2>Edit leg</h2>
          </div>
          <button
            type="button"
            className="clear-button"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>From key</span>
            <input
              value={form.fromKey}
              onChange={(event) => onUpdate({ fromKey: event.target.value })}
            />
          </label>
          <label>
            <span>To key</span>
            <input
              value={form.toKey}
              onChange={(event) => onUpdate({ toKey: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>From name</span>
            <input
              value={form.fromName}
              onChange={(event) => onUpdate({ fromName: event.target.value })}
            />
          </label>
          <label>
            <span>To name</span>
            <input
              value={form.toName}
              onChange={(event) => onUpdate({ toName: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Transport</span>
            <select
              value={form.transport}
              onChange={(event) => onUpdate({ transport: event.target.value })}
            >
              {transportOptions.map((option) => (
                <option key={option} value={option}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Travel cost</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              type="text"
              value={form.travelCost}
              onChange={(event) => onUpdate({ travelCost: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Date</span>
            <input
              required
              type="date"
              value={form.travelDateTime.slice(0, 10)}
              onChange={(event) =>
                onUpdate({
                  travelDateTime: `${event.target.value}${form.travelDateTime.slice(
                    10,
                  )}`,
                })
              }
            />
          </label>
          <label>
            <span>Time</span>
            <input
              required
              step="1"
              type="time"
              value={form.travelDateTime.slice(11, 19)}
              onChange={(event) =>
                onUpdate({
                  travelDateTime: `${form.travelDateTime.slice(0, 10)}T${
                    event.target.value.length === 5
                      ? `${event.target.value}:00`
                      : event.target.value
                  }`,
                })
              }
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Route source</span>
            <input
              value={form.routeSource}
              onChange={(event) => onUpdate({ routeSource: event.target.value })}
            />
          </label>
          <label>
            <span>Route confidence</span>
            <input
              value={form.routeConfidence}
              onChange={(event) =>
                onUpdate({ routeConfidence: event.target.value })
              }
            />
          </label>
        </div>

        <div className="dialog-actions">
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save leg"}
          </button>
        </div>
      </form>
    </div>
  );
}
