import os
import json
import math
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import bindparam, create_engine, text
from sqlalchemy.dialects.postgresql import JSONB

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
OPENROUTESERVICE_API_KEY = os.environ.get("OPENROUTESERVICE_API_KEY")
OPENROUTESERVICE_BASE_URL = os.environ.get(
    "OPENROUTESERVICE_BASE_URL",
    "https://api.openrouteservice.org",
).rstrip("/")
OPENROUTESERVICE_TIMEOUT_SECONDS = float(
    os.environ.get("OPENROUTESERVICE_TIMEOUT_SECONDS", "20"),
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

engine = create_engine(DATABASE_URL)

app = FastAPI(title="Danventures API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ORS_PROFILES_BY_TRANSPORT = {
    "bike": "cycling-regular",
    "bus": "driving-car",
    "car": "driving-car",
    "friends": "driving-car",
    "foot": "foot-walking",
    "rentalCar": "driving-car",
    "taxi": "driving-car",
    "truck": "driving-hgv",
}


class LocationPicture(BaseModel):
    name: str
    mimeType: str
    dataUrl: str


class LocationIn(BaseModel):
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    name: str
    transport: str
    travel_date: str
    people: str | None = None
    description: str | None = None
    sleepcategory: str | None = None
    boat: str | None = None
    nonights: int | None = None
    pointtype: str
    waitingtime: int | None = Field(default=None, ge=0)
    pictures: list[LocationPicture] = Field(default_factory=list)
    travelcost: int | None = None
    sleepcost: int | None = None
    favorite: bool = False


class LocationFavoriteIn(BaseModel):
    favorite: bool


class LegGeometryIn(BaseModel):
    coordinates: list[tuple[float, float]] = Field(min_length=2)

    @field_validator("coordinates", mode="before")
    @classmethod
    def validate_coordinates(cls, coordinates):
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            raise ValueError("coordinates must contain at least two points")

        clean_coordinates = []
        for coordinate in coordinates:
            if not isinstance(coordinate, list | tuple) or len(coordinate) < 2:
                raise ValueError("each coordinate must contain longitude and latitude")

            lng = float(coordinate[0])
            lat = float(coordinate[1])
            if not math.isfinite(lng) or not math.isfinite(lat):
                raise ValueError("coordinate values must be finite numbers")
            if not (-180 <= lng <= 180):
                raise ValueError("longitude is out of range")
            if not (-90 <= lat <= 90):
                raise ValueError("latitude is out of range")

            clean_coordinates.append((lng, lat))

        return clean_coordinates


class LegAttributesIn(BaseModel):
    from_key: str | None = None
    to_key: str | None = None
    from_name: str | None = None
    to_name: str | None = None
    transport: str | None = None
    travel_date: str | None = None
    travel_cost: int | None = None
    route_source: str | None = None
    route_confidence: str | None = None


def location_feature_query(where_clause: str):
    return text(f"""
        select jsonb_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::jsonb,
            'properties', to_jsonb(feature) - 'geom'
        ) as geojson
        from public.locations as feature
        {where_clause}
    """)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-health")
def db_health():
    with engine.connect() as conn:
        result = conn.execute(text("select version(), postgis_version()"))
        row = result.one()

    return {
        "postgres": row[0],
        "postgis": row[1],
    }


def feature_collection_query(table_name: str):
    return text(f"""
        select jsonb_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'id', id,
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', to_jsonb(feature) - 'geom'
                    )
                    order by id
                ),
                '[]'::jsonb
            )
        ) as geojson
        from public.{table_name} as feature
    """)


def limited_feature_collection_query(table_name: str):
    return text(f"""
        select jsonb_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'id', id,
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', to_jsonb(feature) - 'geom'
                    )
                    order by id
                ),
                '[]'::jsonb
            )
        ) as geojson
        from (
            select *
            from public.{table_name}
            order by id
            limit :limit
        ) as feature
    """)


def parse_bbox(bbox: str | None):
    if bbox is None:
        return None

    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail="bbox must be minLng,minLat,maxLng,maxLat",
        )

    try:
        min_lng, min_lat, max_lng, max_lat = [float(part) for part in parts]
    except ValueError:
        raise HTTPException(status_code=400, detail="bbox values must be numbers")

    if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
        raise HTTPException(status_code=400, detail="bbox longitude is out of range")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(status_code=400, detail="bbox latitude is out of range")
    if min_lng >= max_lng or min_lat >= max_lat:
        raise HTTPException(
            status_code=400,
            detail="bbox min values must be lower than max values",
        )

    return {
        "min_lng": min_lng,
        "min_lat": min_lat,
        "max_lng": max_lng,
        "max_lat": max_lat,
    }


@app.on_event("startup")
def ensure_location_schema():
    with engine.begin() as conn:
        conn.execute(
            text("""
                alter table public.locations
                add column if not exists waitingtime integer
            """),
        )
        conn.execute(
            text("""
                alter table public.locations
                add column if not exists pictures jsonb not null default '[]'::jsonb
            """),
        )
        conn.execute(
            text("""
                alter table public.locations
                add column if not exists favorite boolean not null default false
            """),
        )


def clean_location_values(location: LocationIn):
    values = location.model_dump()
    values["pictures"] = values["pictures"] or []
    if values["transport"] not in {"car", "truck"}:
        values["waitingtime"] = None
    if values["pointtype"] != "sleep":
        values["sleepcategory"] = None
        values["nonights"] = None
        values["sleepcost"] = None
    if values["transport"] != "boat":
        values["boat"] = None
    return values


def openrouteservice_profile_for_transport(transport: str):
    return ORS_PROFILES_BY_TRANSPORT.get(transport)


def route_geometry_from_openrouteservice(
    from_lng: float,
    from_lat: float,
    to_lng: float,
    to_lat: float,
    transport: str,
):
    profile = openrouteservice_profile_for_transport(transport)
    if not profile or not OPENROUTESERVICE_API_KEY:
        return None

    request_body = json.dumps(
        {
            "coordinates": [
                [from_lng, from_lat],
                [to_lng, to_lat],
            ],
            "instructions": False,
        },
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{OPENROUTESERVICE_BASE_URL}/v2/directions/{profile}/geojson",
        data=request_body,
        headers={
            "Authorization": OPENROUTESERVICE_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=OPENROUTESERVICE_TIMEOUT_SECONDS,
        ) as response:
            route = json.loads(response.read().decode("utf-8"))
    except (
        TimeoutError,
        urllib.error.URLError,
        urllib.error.HTTPError,
        json.JSONDecodeError,
    ):
        return None

    features = route.get("features")
    if not features:
        return None

    feature = features[0]
    geometry = feature.get("geometry")
    distance_m = feature.get("properties", {}).get("summary", {}).get("distance")

    if not geometry or geometry.get("type") != "LineString":
        return None

    return {
        "geometry": geometry,
        "distance_m": distance_m,
        "route_source": "openrouteservice",
        "route_confidence": profile,
    }


def previous_location_for(conn, location_id: int):
    query = text("""
        with current_location as (
            select id, travel_date::timestamptz as travel_at
            from public.locations
            where id = :id
        )
        select
            previous.id,
            previous.name,
            previous.transport,
            previous.travel_date,
            ST_X(previous.geom) as lng,
            ST_Y(previous.geom) as lat
        from public.locations as previous
        cross join current_location
        where previous.id <> current_location.id
          and (
            previous.travel_date::timestamptz < current_location.travel_at
            or (
              previous.travel_date::timestamptz = current_location.travel_at
              and previous.id < current_location.id
            )
          )
        order by previous.travel_date::timestamptz desc, previous.id desc
        limit 1
    """)
    return conn.execute(query, {"id": location_id}).mappings().one_or_none()


def next_location_for(conn, location_id: int):
    query = text("""
        with current_location as (
            select id, travel_date::timestamptz as travel_at
            from public.locations
            where id = :id
        )
        select
            next.id,
            next.name,
            next.transport,
            next.travel_date,
            next.travelcost,
            ST_X(next.geom) as lng,
            ST_Y(next.geom) as lat
        from public.locations as next
        cross join current_location
        where next.id <> current_location.id
          and (
            next.travel_date::timestamptz > current_location.travel_at
            or (
              next.travel_date::timestamptz = current_location.travel_at
              and next.id > current_location.id
            )
          )
        order by next.travel_date::timestamptz asc, next.id asc
        limit 1
    """)
    return conn.execute(query, {"id": location_id}).mappings().one_or_none()


def current_location_for(conn, location_id: int):
    query = text("""
        select
            id,
            name,
            transport,
            travel_date,
            travelcost,
            ST_X(geom) as lng,
            ST_Y(geom) as lat
        from public.locations
        where id = :id
    """)
    return conn.execute(query, {"id": location_id}).mappings().one_or_none()


def route_for_locations(previous_location, current_location):
    return route_geometry_from_openrouteservice(
        previous_location["lng"],
        previous_location["lat"],
        current_location["lng"],
        current_location["lat"],
        current_location["transport"],
    ) or {
        "geometry": None,
        "route_source": "direct",
        "route_confidence": (
            "unsupported-transport"
            if not openrouteservice_profile_for_transport(current_location["transport"])
            else "fallback"
        ),
    }


def insert_leg(conn, previous_location, current_location, route):
    values = {
        "from_key": str(previous_location["id"]),
        "to_key": str(current_location["id"]),
        "from_name": previous_location["name"],
        "to_name": current_location["name"],
        "transport": current_location["transport"],
        "travel_date": current_location["travel_date"],
        "travel_cost": current_location["travelcost"],
        "route_source": route["route_source"],
        "route_confidence": route["route_confidence"],
    }

    if route.get("geometry"):
        conn.execute(
            text("""
                insert into public.legs (
                    geom,
                    from_key,
                    to_key,
                    from_name,
                    to_name,
                    transport,
                    travel_date,
                    distance_m,
                    travel_cost,
                    route_source,
                    route_confidence
                )
                values (
                    ST_Multi(ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326))),
                    :from_key,
                    :to_key,
                    :from_name,
                    :to_name,
                    :transport,
                    :travel_date,
                    coalesce(
                        :distance_m,
                        ST_Length(
                            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)::geography
                        )
                    ),
                    :travel_cost,
                    :route_source,
                    :route_confidence
                )
            """),
            values
            | {
                "geometry": json.dumps(route["geometry"]),
                "distance_m": route.get("distance_m"),
            },
        )
        return

    conn.execute(
        text("""
            insert into public.legs (
                geom,
                from_key,
                to_key,
                from_name,
                to_name,
                transport,
                travel_date,
                distance_m,
                travel_cost,
                route_source,
                route_confidence
            )
            values (
                ST_Multi(ST_MakeLine(
                    ST_SetSRID(ST_MakePoint(:from_lng, :from_lat, 0), 4326),
                    ST_SetSRID(ST_MakePoint(:to_lng, :to_lat, 0), 4326)
                )),
                :from_key,
                :to_key,
                :from_name,
                :to_name,
                :transport,
                :travel_date,
                ST_Distance(
                    ST_SetSRID(ST_MakePoint(:from_lng, :from_lat), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(:to_lng, :to_lat), 4326)::geography
                ),
                :travel_cost,
                :route_source,
                :route_confidence
            )
        """),
        values
        | {
            "from_lng": previous_location["lng"],
            "from_lat": previous_location["lat"],
            "to_lng": current_location["lng"],
            "to_lat": current_location["lat"],
        },
    )


def create_leg_between_locations(conn, previous_location, current_location):
    delete_leg_between_locations(conn, previous_location, current_location)
    insert_leg(
        conn,
        previous_location,
        current_location,
        route_for_locations(previous_location, current_location),
    )


def delete_leg_between_locations(conn, previous_location, current_location):
    if previous_location is None or current_location is None:
        return 0

    result = conn.execute(
        text("""
            delete from public.legs
            where (
                from_key = :from_key
                and to_key = :to_key
            )
            or (
                from_name is not distinct from :from_name
                and to_name is not distinct from :to_name
                and travel_date is not distinct from :travel_date
            )
        """),
        {
            "from_key": str(previous_location["id"]),
            "to_key": str(current_location["id"]),
            "from_name": previous_location["name"],
            "to_name": current_location["name"],
            "travel_date": current_location["travel_date"],
        },
    )
    return result.rowcount


def delete_legs_touching_location(conn, location_id: int):
    result = conn.execute(
        text("""
            delete from public.legs
            where from_key = :location_key
               or to_key = :location_key
        """),
        {"location_key": str(location_id)},
    )
    return result.rowcount


def sync_legs_for_arriving_location(conn, location_id: int):
    result = conn.execute(
        text("""
            update public.legs as leg
            set
                to_name = location.name,
                transport = location.transport,
                travel_date = location.travel_date,
                travel_cost = location.travelcost
            from public.locations as location
            where location.id = :location_id
              and leg.to_key = location.id::text
        """),
        {"location_id": location_id},
    )
    return result.rowcount


def sync_all_leg_arrival_fields(conn):
    result = conn.execute(
        text("""
            update public.legs as leg
            set
                to_name = location.name,
                transport = location.transport,
                travel_date = location.travel_date,
                travel_cost = location.travelcost
            from public.locations as location
            where leg.to_key = location.id::text
        """),
    )
    return result.rowcount


@app.on_event("startup")
def ensure_leg_arrival_fields():
    with engine.begin() as conn:
        sync_all_leg_arrival_fields(conn)


def rebuild_location_splice(conn, location_id: int):
    current_location = current_location_for(conn, location_id)
    if current_location is None:
        return False

    previous_location = previous_location_for(conn, location_id)
    next_location = next_location_for(conn, location_id)

    delete_leg_between_locations(conn, previous_location, current_location)
    delete_leg_between_locations(conn, current_location, next_location)
    delete_leg_between_locations(conn, previous_location, next_location)

    if previous_location is not None:
        create_leg_between_locations(conn, previous_location, current_location)
    if next_location is not None:
        create_leg_between_locations(conn, current_location, next_location)

    return True


def remove_location_and_reconnect(conn, location_id: int):
    current_location = current_location_for(conn, location_id)
    if current_location is None:
        return False

    previous_location = previous_location_for(conn, location_id)
    next_location = next_location_for(conn, location_id)

    delete_leg_between_locations(conn, previous_location, current_location)
    delete_leg_between_locations(conn, current_location, next_location)
    delete_legs_touching_location(conn, location_id)

    if previous_location is not None and next_location is not None:
        create_leg_between_locations(conn, previous_location, next_location)

    return True


@app.get("/locations")
def locations(limit: Annotated[int | None, Query(ge=1, le=10000)] = None):
    with engine.connect() as conn:
        if limit is None:
            return conn.execute(feature_collection_query("locations")).scalar_one()

        return conn.execute(
            limited_feature_collection_query("locations"),
            {"limit": limit},
        ).scalar_one()


@app.post("/locations", status_code=201)
def create_location(location: LocationIn):
    values = clean_location_values(location)
    query = text("""
        insert into public.locations (
            geom,
            name,
            transport,
            travel_date,
            people,
            description,
            sleepcategory,
            boat,
            nonights,
            pointtype,
            waitingtime,
            pictures,
            travelcost,
            sleepcost,
            favorite
        )
        values (
            ST_SetSRID(ST_MakePoint(:lng, :lat, 0), 4326),
            :name,
            :transport,
            :travel_date,
            :people,
            :description,
            :sleepcategory,
            :boat,
            :nonights,
            :pointtype,
            :waitingtime,
            :pictures,
            :travelcost,
            :sleepcost,
            :favorite
        )
        returning id
    """).bindparams(bindparam("pictures", type_=JSONB))

    with engine.begin() as conn:
        location_id = conn.execute(query, values).scalar_one()
        rebuild_location_splice(conn, location_id)
        sync_legs_for_arriving_location(conn, location_id)
        return conn.execute(
            location_feature_query("where id = :id"),
            {"id": location_id},
        ).scalar_one()


@app.put("/locations/{location_id}")
def update_location(location_id: int, location: LocationIn):
    values = clean_location_values(location) | {"id": location_id}
    query = text("""
        update public.locations
        set
            geom = ST_SetSRID(ST_MakePoint(:lng, :lat, 0), 4326),
            name = :name,
            transport = :transport,
            travel_date = :travel_date,
            people = :people,
            description = :description,
            sleepcategory = :sleepcategory,
            boat = :boat,
            nonights = :nonights,
            pointtype = :pointtype,
            waitingtime = :waitingtime,
            pictures = :pictures,
            travelcost = :travelcost,
            sleepcost = :sleepcost,
            favorite = :favorite
        where id = :id
        returning id
    """).bindparams(bindparam("pictures", type_=JSONB))

    with engine.begin() as conn:
        if not remove_location_and_reconnect(conn, location_id):
            raise HTTPException(status_code=404, detail="Location not found")
        updated_id = conn.execute(query, values).scalar_one_or_none()
        rebuild_location_splice(conn, updated_id)
        sync_legs_for_arriving_location(conn, updated_id)
        return conn.execute(
            location_feature_query("where id = :id"),
            {"id": updated_id},
        ).scalar_one()


@app.patch("/locations/{location_id}/favorite")
def update_location_favorite(location_id: int, payload: LocationFavoriteIn):
    query = text("""
        update public.locations as feature
        set favorite = :favorite
        where feature.id = :id
        returning jsonb_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::jsonb,
            'properties', to_jsonb(feature) - 'geom'
        )
    """)

    with engine.begin() as conn:
        updated = conn.execute(
            query,
            {"id": location_id, "favorite": payload.favorite},
        ).scalar_one_or_none()

    if updated is None:
        raise HTTPException(status_code=404, detail="Location not found")

    return updated


@app.delete("/locations/{location_id}", status_code=204)
def delete_location(location_id: int):
    query = text("delete from public.locations where id = :id returning id")

    with engine.begin() as conn:
        if not remove_location_and_reconnect(conn, location_id):
            raise HTTPException(status_code=404, detail="Location not found")
        conn.execute(query, {"id": location_id})


@app.get("/legs")
def legs(
    limit: Annotated[int | None, Query(ge=1, le=10000)] = None,
    simplify: Annotated[float | None, Query(ge=0)] = None,
    bbox: str | None = None,
    exclude_transport: str | None = None,
    clip_to_bbox: bool = False,
):
    parsed_bbox = parse_bbox(bbox)

    if (
        simplify is None
        and parsed_bbox is None
        and exclude_transport is None
        and not clip_to_bbox
    ):
        with engine.connect() as conn:
            if limit is None:
                return conn.execute(feature_collection_query("legs")).scalar_one()

            return conn.execute(limited_feature_collection_query("legs"), {"limit": limit}).scalar_one()

    where_clauses = []
    params = {
        "limit": limit,
        "simplify": simplify,
        "exclude_transport": exclude_transport,
    }
    if parsed_bbox is not None:
        where_clauses.append("""
            geom && ST_MakeEnvelope(
                :min_lng,
                :min_lat,
                :max_lng,
                :max_lat,
                4326
            )
        """)
        params |= parsed_bbox
    if exclude_transport is not None:
        where_clauses.append("transport is distinct from :exclude_transport")

    where_sql = f"where {' and '.join(where_clauses)}" if where_clauses else ""
    bbox_sql = """
        ST_MakeEnvelope(
            :min_lng,
            :min_lat,
            :max_lng,
            :max_lat,
            4326
        )
    """
    base_geometry_sql = (
        f"ST_Multi(ST_CollectionExtract(ST_Intersection(geom, {bbox_sql}), 2))"
        if clip_to_bbox and parsed_bbox is not None
        else "geom"
    )
    geometry_sql = (
        f"ST_Multi(ST_SimplifyPreserveTopology({base_geometry_sql}, :simplify))"
        if simplify is not None
        else base_geometry_sql
    )
    query = text(f"""
        with rendered as (
            select
                *,
                {geometry_sql} as render_geom
            from public.legs
            {where_sql}
        )
        select jsonb_build_object(
            'type', 'FeatureCollection',
            'features', coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'type', 'Feature',
                        'id', id,
                        'geometry', ST_AsGeoJSON(render_geom)::jsonb,
                        'properties', to_jsonb(feature) - 'geom' - 'render_geom'
                    )
                    order by id
                ),
                '[]'::jsonb
            )
        ) as geojson
        from (
            select *
            from rendered
            where not ST_IsEmpty(render_geom)
            order by id
            limit coalesce(:limit, 1000000)
        ) as feature
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar_one()


@app.put("/legs/{leg_id}/geometry")
def update_leg_geometry(leg_id: int, geometry: LegGeometryIn):
    geojson = {
        "type": "LineString",
        "coordinates": [[lng, lat] for lng, lat in geometry.coordinates],
    }

    query = text("""
        update public.legs as feature
        set
            geom = ST_Multi(ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326))),
            distance_m = ST_Length(
                ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)::geography
            ),
            route_source = 'manual',
            route_confidence = 'edited'
        where feature.id = :id
        returning jsonb_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::jsonb,
            'properties', to_jsonb(feature) - 'geom'
        )
    """)

    with engine.begin() as conn:
        updated = conn.execute(
            query,
            {"id": leg_id, "geometry": json.dumps(geojson)},
        ).scalar_one_or_none()

    if updated is None:
        raise HTTPException(status_code=404, detail="Leg not found")

    return updated


@app.put("/legs/{leg_id}")
def update_leg_attributes(leg_id: int, attributes: LegAttributesIn):
    values = attributes.model_dump() | {"id": leg_id}
    query = text("""
        update public.legs as feature
        set
            from_key = :from_key,
            to_key = :to_key,
            from_name = :from_name,
            to_name = :to_name,
            transport = :transport,
            travel_date = :travel_date,
            travel_cost = :travel_cost,
            route_source = :route_source,
            route_confidence = :route_confidence
        where feature.id = :id
        returning jsonb_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::jsonb,
            'properties', to_jsonb(feature) - 'geom'
        )
    """)

    with engine.begin() as conn:
        updated = conn.execute(query, values).scalar_one_or_none()

    if updated is None:
        raise HTTPException(status_code=404, detail="Leg not found")

    return updated


@app.delete("/legs/{leg_id}", status_code=204)
def delete_leg(leg_id: int):
    query = text("delete from public.legs where id = :id returning id")

    with engine.begin() as conn:
        deleted_id = conn.execute(query, {"id": leg_id}).scalar_one_or_none()

    if deleted_id is None:
        raise HTTPException(status_code=404, detail="Leg not found")


@app.get("/stats/transport-distance")
def transport_distance():
    query = text("""
        select
            transport,
            count(*) as leg_count,
            coalesce(sum(distance_m), 0) as distance_m,
            round((coalesce(sum(distance_m), 0) / 1000)::numeric, 2) as distance_km
        from public.legs
        group by transport
        order by distance_m desc
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [dict(row) for row in rows]


@app.get("/stats/duplicate-leg-timestamps")
def duplicate_leg_timestamps():
    query = text("""
        with duplicate_timestamps as (
            select travel_date
            from public.legs
            where travel_date is not null
            group by travel_date
            having count(*) > 1
        ),
        grouped as (
            select
                duplicate_timestamps.travel_date,
                duplicate_timestamps.travel_date::timestamptz as travel_at,
                count(legs.id) as leg_count,
                jsonb_agg(
                    jsonb_build_object(
                        'id', legs.id,
                        'from_key', legs.from_key,
                        'to_key', legs.to_key,
                        'from_name', legs.from_name,
                        'to_name', legs.to_name,
                        'transport', legs.transport,
                        'travel_date', legs.travel_date,
                        'travel_cost', legs.travel_cost,
                        'distance_m', legs.distance_m,
                        'route_source', legs.route_source,
                        'route_confidence', legs.route_confidence
                    )
                    order by legs.id
                ) as legs
            from duplicate_timestamps
            join public.legs as legs
              on legs.travel_date is not distinct from duplicate_timestamps.travel_date
            group by duplicate_timestamps.travel_date
        )
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'travel_date', travel_date,
                    'leg_count', leg_count,
                    'legs', legs
                )
                order by leg_count desc, travel_at asc
            ),
            '[]'::jsonb
        )
        from grouped
    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar_one()


@app.get("/stats/monthly-transport-distance")
def monthly_transport_distance():
    query = text("""
        with bounds as (
            select
                date_trunc('month', min(travel_date::timestamptz)) as start_month,
                date_trunc('month', max(travel_date::timestamptz)) as end_month
            from public.legs
            where travel_date is not null
              and distance_m is not null
        ),
        months as (
            select generate_series(start_month, end_month, interval '1 month') as month_start
            from bounds
            where start_month is not null
              and end_month is not null
        ),
        transport_totals as (
            select
                date_trunc('month', travel_date::timestamptz) as month_start,
                transport,
                coalesce(sum(distance_m), 0) as distance_m,
                coalesce(sum(distance_m), 0) / 1000 as distance_km
            from public.legs
            where travel_date is not null
              and distance_m is not null
            group by month_start, transport
        )
        select
            months.month_start,
            months.month_start + interval '1 month' - interval '1 millisecond' as month_end,
            round((coalesce(sum(transport_totals.distance_m), 0) / 1000)::numeric, 2)
                as total_km,
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'transport', transport_totals.transport,
                        'distance_m', transport_totals.distance_m,
                        'distance_km', round(transport_totals.distance_km::numeric, 2)
                    )
                    order by transport_totals.distance_m desc
                ) filter (where transport_totals.transport is not null),
                '[]'::jsonb
            ) as transports
        from months
        left join transport_totals
          on transport_totals.month_start = months.month_start
        group by months.month_start
        order by months.month_start
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [dict(row) for row in rows]
