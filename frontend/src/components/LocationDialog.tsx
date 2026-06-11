import type { ChangeEvent, FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import { sleepCategoryOptions, transportOptions } from "../constants";
import type { FeatureCollection, LocationFormState } from "../types";
import {
  isFreeTransport,
  optionLabel,
  suggestedDateTimeForDate,
} from "../utils";

function readPictureFile(file: File) {
  return new Promise<LocationFormState["pictures"][number]>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read image file."));
        return;
      }

      resolve({
        dataUrl: reader.result,
        mimeType: file.type,
        name: file.name,
      });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

type LocationDialogProps = {
  editingLocationId: number | null;
  isSavingLocation: boolean;
  locationForm: LocationFormState;
  locations: FeatureCollection | null;
  onClose: () => void;
  onDelete: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (update: Partial<LocationFormState>) => void;
};

export function LocationDialog({
  editingLocationId,
  isSavingLocation,
  locationForm,
  locations,
  onClose,
  onDelete,
  onSubmit,
  onUpdate,
}: LocationDialogProps) {
  const isSleepPoint = locationForm.pointtype === "sleep";
  const isBoatTransport = locationForm.transport === "boat";
  const isPaidTransport = !isFreeTransport(locationForm.transport);
  const isPaidSleep =
    locationForm.pointtype === "sleep" &&
    ["airbnb", "hostel", "renting", "campingPaid"].includes(
      locationForm.sleepcategory,
    );
  const updatePictures = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    event.target.value = "";
    if (files.length === 0) return;

    const pictures = await Promise.all(files.map(readPictureFile));
    onUpdate({ pictures: [...locationForm.pictures, ...pictures] });
  };

  return (
    <div className="location-dialog" role="dialog" aria-modal="true">
      <form onSubmit={onSubmit}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Location</p>
            <h2>{editingLocationId ? "Edit point" : "New point"}</h2>
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

        <label>
          <span>Name</span>
          <input
            required
            value={locationForm.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
        </label>

        <div className="form-grid">
          <label>
            <span>Transport</span>
            <select
              value={locationForm.transport}
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
            <span>Point type</span>
            <select
              value={locationForm.pointtype}
              onChange={(event) =>
                onUpdate({
                  pointtype: event.target.value as "waypoint" | "sleep",
                })
              }
            >
              <option value="waypoint">waypoint</option>
              <option value="sleep">sleep</option>
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Date</span>
            <input
              required
              type="date"
              value={locationForm.travelDateTime.slice(0, 10)}
              onChange={(event) => {
                const suggested = suggestedDateTimeForDate(
                  event.target.value,
                  locations,
                );
                onUpdate({ travelDateTime: suggested });
              }}
            />
          </label>

          <label>
            <span>Time</span>
            <input
              required
              step="1"
              type="time"
              value={locationForm.travelDateTime.slice(11, 19)}
              onChange={(event) =>
                onUpdate({
                  travelDateTime: `${locationForm.travelDateTime.slice(0, 10)}T${
                    event.target.value.length === 5
                      ? `${event.target.value}:00`
                      : event.target.value
                  }`,
                })
              }
            />
          </label>
        </div>

        <label>
          <span>Waiting time (min)</span>
          <input
            min="0"
            step="1"
            type="number"
            value={locationForm.waitingtime}
            onChange={(event) => onUpdate({ waitingtime: event.target.value })}
          />
        </label>

        <label>
          <span>People</span>
          <input
            value={locationForm.people}
            onChange={(event) => onUpdate({ people: event.target.value })}
          />
        </label>

        <label>
          <span>Description</span>
          <textarea
            rows={4}
            value={locationForm.description}
            onChange={(event) => onUpdate({ description: event.target.value })}
          />
        </label>

        <div className="picture-field">
          <label>
            <span>Pictures</span>
            <input accept="image/*" multiple type="file" onChange={updatePictures} />
          </label>
          {locationForm.pictures.length > 0 && (
            <div className="picture-preview-grid">
              {locationForm.pictures.map((picture, index) => (
                <div className="picture-preview" key={`${picture.name}-${index}`}>
                  <img alt={picture.name} src={picture.dataUrl} />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate({
                        pictures: locationForm.pictures.filter(
                          (_, pictureIndex) => pictureIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isSleepPoint && (
          <div className="form-grid">
            <label>
              <span>Sleep category</span>
              <select
                value={locationForm.sleepcategory}
                onChange={(event) => onUpdate({ sleepcategory: event.target.value })}
              >
                {sleepCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {optionLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Nights</span>
              <input
                min="0"
                type="number"
                value={locationForm.nonights}
                onChange={(event) => onUpdate({ nonights: event.target.value })}
              />
            </label>
          </div>
        )}

        {isBoatTransport && (
          <label>
            <span>Boat</span>
            <input
              value={locationForm.boat}
              onChange={(event) => onUpdate({ boat: event.target.value })}
            />
          </label>
        )}

        <div className="form-grid">
          {isPaidTransport && (
            <label>
              <span>Travel cost</span>
              <input
                min="0"
                type="number"
                value={locationForm.travelcost}
                onChange={(event) => onUpdate({ travelcost: event.target.value })}
              />
            </label>
          )}

          {isPaidSleep && (
            <label>
              <span>Sleep cost</span>
              <input
                min="0"
                type="number"
                value={locationForm.sleepcost}
                onChange={(event) => onUpdate({ sleepcost: event.target.value })}
              />
            </label>
          )}
        </div>

        <div className="form-grid">
          <label>
            <span>Longitude</span>
            <input
              required
              step="any"
              type="number"
              value={locationForm.lng}
              onChange={(event) => onUpdate({ lng: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Latitude</span>
            <input
              required
              step="any"
              type="number"
              value={locationForm.lat}
              onChange={(event) => onUpdate({ lat: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="dialog-actions">
          {editingLocationId && (
            <button
              type="button"
              className="danger-button"
              disabled={isSavingLocation}
              onClick={onDelete}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
          <button type="submit" disabled={isSavingLocation}>
            {isSavingLocation ? "Saving..." : "Save point"}
          </button>
        </div>
      </form>
    </div>
  );
}
