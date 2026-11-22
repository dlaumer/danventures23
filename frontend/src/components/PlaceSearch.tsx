import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";

type Place = GeoJSON.Feature<GeoJSON.Point, {
  name?: string; city?: string; state?: string; country?: string;
  osm_value?: string; extent?: number[];
}>;

export function PlaceSearch({ getMap }: { getMap: () => MapLibreMap | null }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  function clearResults() {
    request.current?.abort();
    request.current = null;
    setResults([]);
    setStatus("");
    setLoading(false);
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    clearResults();
    if (!query.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setStatus("Searching…");
    try {
      const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: query.trim(), limit: "6" })}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Search unavailable");
      const data = await response.json();
      if (!Array.isArray(data.features)) throw new Error("Invalid search results");
      const places = (data.features as Place[]).filter(place =>
        place.geometry?.type === "Point" && place.geometry.coordinates.length >= 2 &&
        place.geometry.coordinates.every(Number.isFinite) && place.properties);
      if (request.current !== controller) return;
      setResults(places);
      setStatus(places.length ? "" : "No places found. Try another name.");
    } catch {
      if (request.current === controller) setStatus("Search failed. Please try again.");
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  function select(place: Place) {
    const map = getMap();
    if (!map) { setStatus("The map is still loading. Please try again."); return; }
    const extent = place.properties.extent;
    if (extent?.length === 4 && extent.every(Number.isFinite) && extent[0] < extent[2] && extent[3] < extent[1]) {
      map.fitBounds([[extent[0], extent[3]], [extent[2], extent[1]]], { padding: 60, maxZoom: 14 });
    } else {
      map.flyTo({ center: place.geometry.coordinates.slice(0, 2) as [number, number], zoom: place.properties.osm_value === "country" ? 4 : 12 });
    }
    clearResults();
    setQuery(place.properties.name ?? query);
  }

  function close() {
    clearResults();
    setExpanded(false);
    toggleRef.current?.focus();
  }

  return <div className="place-search-control" onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <button ref={toggleRef} type="button" className="map-action-button" aria-label={expanded ? "Close place search" : "Search places"}
      title="Search places" aria-expanded={expanded} aria-controls="place-search-panel"
      onClick={() => { if (expanded) close(); else setExpanded(true); }}>
      {expanded ? <X size={18} /> : <Search size={18} />}
    </button>
    {expanded && <div className="place-search" id="place-search-panel">
    <form role="search" onSubmit={search}>
      <input autoFocus aria-label="Search places, cities or countries" placeholder="Search places, cities, countries…"
        value={query} maxLength={200} onChange={event => { clearResults(); setQuery(event.target.value); }} />
      <button type="submit" disabled={loading || !query.trim()}>Search</button>
    </form>
    {status && <p role="status">{status}</p>}
    {results.length > 0 && <ul aria-label="Place search results">
      {results.map((place, index) => <li key={index}><button type="button" onClick={() => select(place)}>
        {[...new Set([place.properties.name, place.properties.city, place.properties.state, place.properties.country].filter(Boolean))].join(", ")}
      </button></li>)}
    </ul>}
    {(results.length > 0 || status) && <small>Search by Photon · © OpenStreetMap contributors</small>}
    </div>}
  </div>;
}
