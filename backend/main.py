import os
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

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
    travelcost: int | None = None
    sleepcost: int | None = None


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


def clean_location_values(location: LocationIn):
    values = location.model_dump()
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
            travelcost,
            sleepcost
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
            :travelcost,
            :sleepcost
        )
        returning id
    """)

    with engine.begin() as conn:
        location_id = conn.execute(query, values).scalar_one()
        rebuild_location_splice(conn, location_id)
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
            travelcost = :travelcost,
            sleepcost = :sleepcost
        where id = :id
        returning id
    """)

    with engine.begin() as conn:
        if not remove_location_and_reconnect(conn, location_id):
            raise HTTPException(status_code=404, detail="Location not found")
        updated_id = conn.execute(query, values).scalar_one_or_none()
        rebuild_location_splice(conn, updated_id)
        return conn.execute(
            location_feature_query("where id = :id"),
            {"id": updated_id},
        ).scalar_one()


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
):
    if simplify is not None:
        query = text("""
            select jsonb_build_object(
                'type', 'FeatureCollection',
                'features', coalesce(
                    jsonb_agg(
                        jsonb_build_object(
                            'type', 'Feature',
                            'id', id,
                            'geometry', ST_AsGeoJSON(
                                ST_Multi(ST_SimplifyPreserveTopology(geom, :simplify))
                            )::jsonb,
                            'properties', to_jsonb(feature) - 'geom'
                        )
                        order by id
                    ),
                    '[]'::jsonb
                )
            ) as geojson
            from (
                select *
                from public.legs
                order by id
                limit coalesce(:limit, 1000000)
            ) as feature
        """)

        with engine.connect() as conn:
            return conn.execute(
                query,
                {"limit": limit, "simplify": simplify},
            ).scalar_one()

    with engine.connect() as conn:
        if limit is None:
            return conn.execute(feature_collection_query("legs")).scalar_one()

        return conn.execute(limited_feature_collection_query("legs"), {"limit": limit}).scalar_one()


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
