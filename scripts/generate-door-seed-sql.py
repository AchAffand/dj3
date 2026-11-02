#!/usr/bin/env python3
"""Generate repeatable Supabase catalog inserts from the reviewed JSON seed."""

from __future__ import annotations

import json
from pathlib import Path


def sql_text(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_number(value: int | float | None) -> str:
    if value is None:
        return "null"
    return str(value)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    source = root / "src/domain/catalog/door-catalog.json"
    output = root / "supabase/seed.sql"
    catalog = json.loads(source.read_text(encoding="utf-8"))
    models = catalog["models"]
    materials = [item for model in models for item in model["materials"]]

    lines = [
        "-- Generated from src/domain/catalog/door-catalog.json by scripts/generate-door-seed-sql.py.",
        "-- Initial seed is insert-only so a repeated seed never overwrites admin edits.",
        "",
        "insert into public.door_models (code, group_code, name, input_variables, status)",
        "values",
    ]
    model_values = []
    for model in models:
        inputs = "array[" + ", ".join(sql_text(item) for item in model["inputs"]) + "]::text[]" if model["inputs"] else "array[]::text[]"
        model_values.append(
            f"  ({model['code']}, {model['groupCode']}, {sql_text(model['name'])}, {inputs}, {sql_text(model['status'])})"
        )
    lines.extend(",\n".join(model_values).splitlines())
    lines.append("on conflict (code) do nothing;")
    lines += ["", "insert into public.materials (code, source_code, name, unit)", "values"]
    material_values = [
        f"  ({item['code']}, {item.get('sourceCode', item['code'])}, {sql_text(item['name'])}, {sql_text(item['unit'])})"
        for item in materials
    ]
    lines.extend(",\n".join(material_values).splitlines())
    lines.append("on conflict (code) do nothing;")
    lines += ["", "insert into public.model_materials (material_code, model_code, position, current_expression, formula_version, source_cell, source_formula, source_cached_quantity)", "values"]
    relationship_values = []
    for model in models:
        for position, item in enumerate(model["materials"], start=1):
            relationship_values.append(
                "  (" + ", ".join(
                    [
                        str(item["code"]),
                        str(model["code"]),
                        str(position),
                        sql_text(item["expression"]),
                        "1",
                        sql_text(item["sourceCell"]),
                        sql_text(item.get("sourceFormula")),
                        sql_number(item.get("sourceCachedQuantity") if isinstance(item.get("sourceCachedQuantity"), (int, float)) else None),
                    ]
                ) + ")"
            )
    lines.extend(",\n".join(relationship_values).splitlines())
    lines.append("on conflict (material_code) do nothing;")
    lines += ["", "insert into public.formula_versions (material_code, version, expression, created_by)", "values"]
    version_values = [
        f"  ({item['code']}, 1, {sql_text(item['expression'])}, null)"
        for item in materials
    ]
    lines.extend(",\n".join(version_values).splitlines())
    lines.append("on conflict (material_code, version) do nothing;")

    output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Seed Supabase dibuat: {len(models)} model, {len(materials)} material dan versi rumus awal.")
    print(output)


if __name__ == "__main__":
    main()
