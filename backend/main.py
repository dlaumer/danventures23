import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
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


@app.get("/locations")
def locations(limit: Annotated[int | None, Query(ge=1, le=10000)] = None):
    with engine.connect() as conn:
        if limit is None:
            return conn.execute(feature_collection_query("locations")).scalar_one()

        return conn.execute(
            limited_feature_collection_query("locations"),
            {"limit": limit},
        ).scalar_one()


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
