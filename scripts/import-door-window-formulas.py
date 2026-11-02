#!/usr/bin/env python3
"""Import the reviewed door-window formulas into the app catalog and SQL migration."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Rumus_Pintu_Jendela.xlsx"
CATALOG = ROOT / "src/domain/catalog/door-catalog.json"
MIGRATION = ROOT / "supabase/migrations/012_door_window_formula_catalog.sql"
INPUT_ORDER = ("T1", "L1", "T2", "L2", "T3", "L3", "daunPintu", "daunJendela")
PHOTO_CONFIRMED_FORMULAS = {
    (31100, "canal u"): {
        "expression": "(T1*2+L1+L2*2*2)/1000",
        "source_cell": "Foto 333.jpeg",
        "source_formula": "Canal U = T1×2 + L1 + L2×2×2",
    },
    (31000, "hals / engsel"): {
        "source_cell": "Foto 333.jpeg",
        "source_formula": "Hole = daun pintu ×2",
    },
    (31000, "cak / kunci"): {
        "source_cell": "Foto 333.jpeg",
        "source_formula": "Coak = daun pintu ×3",
    },
    (31100, "hals / engsel"): {
        "source_cell": "Foto 333.jpeg",
        "source_formula": "Hole = daun pintu ×2",
    },
    (31100, "cak / kunci"): {
        "source_cell": "Foto 333.jpeg",
        "source_formula": "Coak = daun pintu ×3",
    },
}
# Model 31000 has a distinct Silicone source row calculated from Polis.
# Model 31100 remains unchanged until its Silicone formula is confirmed.
INTENTIONALLY_UNMAPPED_SOURCE_ROWS = {
    (31100, "silicone"),
}


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def sql(value: str | int) -> str:
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("'", "''") + "'"


def target_material(model: dict, source_name: str) -> dict | None:
    name = normalized(source_name)
    materials = model["materials"]
    aliases = {
        "kusen": ("kusen",),
        "tapin": ("tapin",),
        "pintu": ("pintu",),
        "jendela": ("jendela",),
        "jendela sliding": ("jendela sliding",),
        "kaca": ("kaca/jendela", "kaca temp 12mm", "kaca"),
        "canal u": ("canal u",),
        "plis": ("polis",),
        "rel atas": ("rell atas",),
        "rel bawah": ("rell bawah",),
        "tatapan samping": ("tatapn samping",),
        "engsel kupu": ("engsel kupu",),
        "engsel pintu": ("engsel kupu",),
        "engsel casement": ("engsel casment",),
        "handle + kunci": ("handel + kunci",),
        "kunci + handle": ("handel + kunci",),
        "handle": ("handle",),
        "door closer": ("doorcloser",),
        "rambuncis": ("rambuncis",),
        "rambuncis ": ("rambuncis",),
        "hals / engsel": ("hole",),
        "cak / kunci": ("coak",),
    }
    choices = aliases.get(name, (name,))
    for choice in choices:
        match = next((item for item in materials if normalized(item["name"]) == choice), None)
        if match:
            return match
    # "Kaca" is the generic label in the source. When the model has separate
    # window glass and door-panel material rows, the source does not provide a
    # second formula to split that total, so map only to the explicit window-glass row.
    return None


def read_source() -> list[dict]:
    workbook = load_workbook(WORKBOOK, data_only=False, read_only=True)
    sheet = workbook["Rumus"]
    groups: list[dict] = []
    current: dict | None = None
    for row_number in range(2, sheet.max_row + 1):
        raw_code = sheet.cell(row_number, 1).value
        name = sheet.cell(row_number, 2).value
        formula = sheet.cell(row_number, 3).value
        if isinstance(raw_code, int) or (isinstance(raw_code, str) and raw_code.strip().isdigit()):
            model_code = int(raw_code)
        else:
            model_code = None
        if model_code is not None and model_code % 100 == 0:
            current = {"code": model_code, "rows": []}
            groups.append(current)
        if current and isinstance(name, str) and isinstance(formula, str) and formula.strip():
            current["rows"].append({
                "row": row_number,
                "name": name.strip(),
                "formula": formula.strip(),
                "source_formula": formula.strip().replace("\ufffd", "×"),
            })
    return groups


def resolve_formula(group: dict, row: dict, by_target_code: dict[int, dict], groups_by_code: dict[int, dict], stack: set[tuple[int, int]]) -> str:
    marker = (group["code"], row["row"])
    if marker in stack:
        raise ValueError(f"Rujukan rumus melingkar pada model {group['code']} baris {row['row']}")
    stack.add(marker)
    text = row["formula"].strip()
    idem = re.fullmatch(r"sama\s+(?:dengan|seperti)\s+(\d{5})", text, re.I)
    if idem:
        referenced_code = int(idem.group(1))
        referenced_group = groups_by_code.get(referenced_code)
        if not referenced_group:
            raise ValueError(f"Model {group['code']} merujuk model {referenced_code} yang tidak ada di workbook")
        model = catalog_models[group["code"]]
        target = target_material(model, row["name"])
        if not target:
            raise ValueError(f"Tidak dapat memetakan komponen idem {row['name']} pada model {group['code']}")
        referenced_model = catalog_models.get(referenced_code)
        if not referenced_model:
            raise ValueError(f"Model referensi {referenced_code} tidak ada di katalog aplikasi")
        ref_target = target_material(referenced_model, row["name"])
        if not ref_target:
            raise ValueError(f"Komponen referensi {row['name']} tidak ditemukan di model {referenced_code}")
        ref_row = next((candidate for candidate in referenced_group["rows"]
                        if target_material(referenced_model, candidate["name"])
                        and target_material(referenced_model, candidate["name"])["code"] == ref_target["code"]), None)
        if not ref_row:
            raise ValueError(f"Formula referensi {referenced_code} untuk {row['name']} tidak ditemukan")
        result = resolve_formula(referenced_group, ref_row, by_target_code, groups_by_code, stack)
    else:
        result = text.replace("\ufffd", "*").replace("×", "*").replace("÷", "/")
    stack.remove(marker)
    return result


def translate_expression(text: str, model: dict, source_rows: list[dict]) -> str:
    material_by_name: dict[str, int] = {}
    for source_row in source_rows:
        material = target_material(model, source_row["name"])
        if material:
            material_by_name[normalized(source_row["name"])] = material["code"]
    material_by_name["pilis"] = material_by_name.get("plis", -1)
    expression = re.sub(r"\bdaun\s+pintu\b", "daunPintu", text, flags=re.I)
    expression = re.sub(r"\bdaun\s+jendela\b", "daunJendela", expression, flags=re.I)
    for name, code in sorted(material_by_name.items(), key=lambda entry: len(entry[0]), reverse=True):
        if code < 0:
            continue
        token = re.escape(name)
        expression = re.sub(rf"(?<![\w]){token}(?![\w])", f"qty_{code}", expression, flags=re.I)
    expression = re.sub(r"\s*([()+*/-])\s*", r"\1", expression).strip()
    return expression


def validate(expression: str) -> None:
    token_re = re.compile(r"\s*(qty_\d+|daunPintu|daunJendela|T[123]|L[123]|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/])")
    tokens: list[str] = []
    offset = 0
    while offset < len(expression):
        match = token_re.match(expression, offset)
        if not match:
            raise ValueError(f"Token rumus tidak didukung: {expression[offset:]} dalam {expression}")
        tokens.append(match.group(1))
        offset = match.end()
    index = 0

    def primary() -> None:
        nonlocal index
        if index >= len(tokens):
            raise ValueError(f"Rumus tidak lengkap: {expression}")
        if tokens[index] == "(":
            index += 1
            additive()
            if index >= len(tokens) or tokens[index] != ")":
                raise ValueError(f"Kurung tidak ditutup: {expression}")
            index += 1
        elif tokens[index] not in ("+", "-", "*", "/", ")"):
            index += 1
        else:
            raise ValueError(f"Token tidak terduga: {tokens[index]} dalam {expression}")

    def unary() -> None:
        nonlocal index
        if index < len(tokens) and tokens[index] in ("+", "-"):
            index += 1
            unary()
        else:
            primary()

    def multiplicative() -> None:
        nonlocal index
        unary()
        while index < len(tokens) and tokens[index] in ("*", "/"):
            index += 1
            unary()

    def additive() -> None:
        nonlocal index
        multiplicative()
        while index < len(tokens) and tokens[index] in ("+", "-"):
            index += 1
            multiplicative()

    if not tokens:
        raise ValueError("Rumus kosong")
    additive()
    if index != len(tokens):
        raise ValueError(f"Sisa token rumus: {tokens[index:]} dalam {expression}")


catalog_models: dict[int, dict] = {}


def main() -> None:
    global catalog_models
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_models = {model["code"]: model for model in catalog["models"]}
    groups = read_source()
    groups_by_code = {group["code"]: group for group in groups}
    imported: list[dict] = []
    unmapped: list[str] = []
    model_inputs: dict[int, set[str]] = defaultdict(set)

    for group in groups:
        model = catalog_models.get(group["code"])
        if not model:
            unmapped.append(f"Model {group['code']} tidak ada di katalog aplikasi")
            continue
        source_to_target: dict[str, dict] = {}
        for row in group["rows"]:
            target = target_material(model, row["name"])
            if not target:
                if (group["code"], normalized(row["name"])) not in INTENTIONALLY_UNMAPPED_SOURCE_ROWS:
                    unmapped.append(f"Model {group['code']} / {row['name']} (Rumus!C{row['row']})")
                continue
            source_to_target[normalized(row["name"])] = target

        formulas_for_model: list[dict] = []
        for row in group["rows"]:
            target = target_material(model, row["name"])
            if not target:
                continue
            source_formula = resolve_formula(group, row, source_to_target, groups_by_code, set())
            expression = translate_expression(source_formula, model, group["rows"])
            unit = target["unit"]
            if "qty_" not in expression:
                if unit == 'm"':
                    expression = f"({expression})/1000000"
                elif unit == "m'":
                    expression = f"({expression})/1000"
            confirmation = PHOTO_CONFIRMED_FORMULAS.get((group["code"], normalized(row["name"])))
            source_cell = f"Rumus!C{row['row']}"
            source_formula_text = row["source_formula"]
            if confirmation:
                expression = confirmation.get("expression", expression)
                source_cell = confirmation["source_cell"]
                source_formula_text = confirmation["source_formula"]
            validate(expression)
            refs = [int(code) for code in re.findall(r"qty_(\d+)", expression)]
            allowed_refs = {item["code"] for item in model["materials"]}
            if any(code not in allowed_refs for code in refs):
                raise ValueError(f"Model {group['code']} memiliki referensi qty di luar model: {expression}")
            variables = set(re.findall(r"\b(?:T[123]|L[123]|daunPintu|daunJendela)\b", expression))
            model_inputs[group["code"]].update(variables)
            formulas_for_model.append({
                "code": target["code"],
                "model_code": group["code"],
                "expression": expression,
                "source_cell": source_cell,
                "source_formula": source_formula_text,
                "unit": target["unit"],
                "name": target["name"],
            })

        # Evaluate formula inputs through local material dependencies too.
        by_material = {item["code"]: item for item in formulas_for_model}
        seen: set[int] = set()

        def collect_inputs(material_code: int) -> None:
            if material_code in seen:
                return
            seen.add(material_code)
            item = by_material.get(material_code)
            if not item:
                return
            model_inputs[group["code"]].update(re.findall(r"\b(?:T[123]|L[123]|daunPintu|daunJendela)\b", item["expression"]))
            for dependency in map(int, re.findall(r"qty_(\d+)", item["expression"])):
                collect_inputs(dependency)

        for item in formulas_for_model:
            collect_inputs(item["code"])
        imported.extend(formulas_for_model)

    if not imported:
        raise ValueError("Tidak ada formula yang bisa dipetakan ke katalog aplikasi")

    for item in imported:
        model = catalog_models[item["model_code"]]
        material = next(entry for entry in model["materials"] if entry["code"] == item["code"])
        force_photo_formula = (item["model_code"], normalized(next(
            row["name"] for row in groups_by_code[item["model_code"]]["rows"]
            if target_material(model, row["name"]) and target_material(model, row["name"])["code"] == item["code"]
        ))) in PHOTO_CONFIRMED_FORMULAS
        if material.get("expression") and not str(material.get("sourceCell", "")).startswith("Rumus!C") and not force_photo_formula:
            # Preserve any formula already active in the static catalog.
            item["expression"] = material["expression"]
            item["source_cell"] = material.get("sourceCell", item["source_cell"])
            item["source_formula"] = material.get("sourceFormula") or item["source_formula"]
            continue
        material["expression"] = item["expression"]
        material["sourceCell"] = item["source_cell"]
        material["sourceFormula"] = item["source_formula"]
        material["sourceCachedQuantity"] = None
    for model_code, variables in model_inputs.items():
        model = catalog_models[model_code]
        model["inputs"] = [value for value in INPUT_ORDER if value in set(model.get("inputs", [])) | variables]
        model["status"] = "ready" if all(item.get("expression") for item in model["materials"]) else "incomplete"

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    values = ",\n".join(
        "  (" + ", ".join([
            str(item["code"]), str(item["model_code"]), sql(item["expression"]),
            sql(item["source_cell"]), sql(item["source_formula"]),
        ]) + ")"
        for item in imported
    )
    model_values = ",\n".join(
        "  (" + str(code) + ", array[" + ", ".join(sql(value) for value in INPUT_ORDER if value in variables) + "]::text[])"
        for code, variables in sorted(model_inputs.items())
    )
    MIGRATION.write_text(
        "-- Generated from Rumus_Pintu_Jendela.xlsx / Rumus by scripts/import-door-window-formulas.py.\n"
        "-- Fill only missing formulas so hosted catalog edits are preserved.\n\n"
        "-- Photo 333.jpeg confirms model 31100 Canal U and the Hole/Coak labels for models 31000/31100.\n"
        "-- Keep the existing Polis row for Plis; Silicone is not added as a separate material.\n"
        "-- The 32500 Kaca transcription omitted multiplication signs; its area formula is restored and inherited by 33100/33200.\n\n"
        "with source(material_code, model_code, expression, source_cell, source_formula) as (\nvalues\n"
        + values + "\n)\n"
        "update public.model_materials as target\n"
        "set current_expression = source.expression,\n"
        "    formula_version = case when target.current_expression is null or btrim(target.current_expression) = '' then 1 else target.formula_version end,\n"
        "    source_cell = source.source_cell,\n"
        "    source_formula = source.source_formula\n"
        "from source\n"
        "where target.material_code = source.material_code\n"
        "  and target.model_code = source.model_code\n"
        "  and (target.current_expression is null or btrim(target.current_expression) = '');\n\n"
        "with source(material_code, model_code, expression, source_cell, source_formula) as (\nvalues\n"
        + values + "\n)\n"
        "insert into public.formula_versions (material_code, version, expression, created_by)\n"
        "select target.material_code, target.formula_version, target.current_expression, null\n"
        "from public.model_materials as target\n"
        "join source on source.material_code = target.material_code and source.model_code = target.model_code\n"
        "where target.current_expression = source.expression\n"
        "on conflict (material_code, version) do update set expression = excluded.expression\n"
        "where public.formula_versions.expression is null or btrim(public.formula_versions.expression) = '';\n\n"
        "with source(model_code, input_variables) as (\nvalues\n" + model_values + "\n)\n"
        "update public.door_models as target\n"
        "set input_variables = array(select distinct vars.variable from unnest(coalesce(target.input_variables, '{}'::text[]) || source.input_variables) as vars(variable) order by array_position(array['T1','L1','T2','L2','T3','L3','daunPintu','daunJendela']::text[], vars.variable) nulls last, vars.variable),\n"
        "    status = case when not exists (select 1 from public.model_materials mm where mm.model_code = target.code and nullif(btrim(mm.current_expression), '') is null) then 'ready' else 'incomplete' end\n"
        "from source\n"
        "where target.code = source.model_code;\n",
        encoding="utf-8",
    )
    print(f"Diimpor ke katalog: {len(imported)} formula di {len(model_inputs)} model")
    print(f"Migrasi dibuat: {MIGRATION.relative_to(ROOT)}")
    if unmapped:
        print("Baris sumber yang belum dipetakan:")
        for entry in unmapped:
            print(" - " + entry)


if __name__ == "__main__":
    main()
