from __future__ import annotations

import re
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Rumus_Jendela.xlsx"
OUTPUT = ROOT / "supabase" / "migrations" / "010_window_formula_catalog.sql"
INPUTS = ("T1", "L1", "T2", "L2", "T3", "L3", "daunPintu", "daunJendela")
UNITS = {
    "kaca": 'm"',
    "kusen": "m'",
    "jendela": "m'",
    "silicone": "m'",
    "kanal u": "m'",
    "polis": "m'",
    "jendela sliding": "m'",
    "tatpen samping": "m'",
    "rel atas": "m'",
    "rel bawah": "m'",
    "rambancis": "pcs",
    "rambuncis": "pcs",
    "engsel casmat": "pcs",
    "roda bawah": "pcs",
    "kunci ra": "pcs",
    "bracket": "pcs",
}
FORMULA_OVERRIDES = {21607: "daunJendela*2"}


def sql(value: str | int | None) -> str:
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("'", "''") + "'"


def key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def translate(source: str, material_codes: dict[str, int], unit: str) -> str:
    # In the supplied workbook XML, multiplication glyphs are stored as U+FFFD.
    expression = source.replace("\ufffd", "*").replace("×", "*").replace("÷", "/")
    expression = re.sub(r"\bdaun\s+jendela\b", "daunJendela", expression, flags=re.I)
    expression = re.sub(r"\bdaun\s+pintu\b", "daunPintu", expression, flags=re.I)
    for name in sorted(material_codes, key=len, reverse=True):
        token = re.escape(name)
        expression = re.sub(rf"(?<![\w]){token}(?![\w])", f"qty_{material_codes[name]}", expression, flags=re.I)
    expression = re.sub(r"\s*\*\s*", "*", expression)
    expression = re.sub(r"\s*([()+/])\s*", r"\1", expression)
    expression = expression.strip()
    has_material_quantity = "qty_" in expression
    if unit == 'm"':
        expression = f"({expression})/1000000"
    elif unit == "m'" and not has_material_quantity:
        expression = f"({expression})/1000"
    if len(expression) > 500:
        raise ValueError(f"Generated formula is too long: {expression}")
    return expression


def validate_expression(expression: str) -> None:
    token_pattern = re.compile(r"\s*(qty_\d+|daunJendela|daunPintu|T[123]|L[123]|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/])")
    tokens: list[str] = []
    position = 0
    while position < len(expression):
        match = token_pattern.match(expression, position)
        if not match:
            raise ValueError(f"Unsupported token in generated expression: {expression[position:]} ({expression})")
        tokens.append(match.group(1))
        position = match.end()
    index = 0

    def primary() -> None:
        nonlocal index
        if index >= len(tokens):
            raise ValueError(f"Incomplete expression: {expression}")
        token = tokens[index]
        if token == "(":
            index += 1
            additive()
            if index >= len(tokens) or tokens[index] != ")":
                raise ValueError(f"Unclosed parentheses in expression: {expression}")
            index += 1
        elif token not in ("+", "-", "*", "/", ")"):
            index += 1
        else:
            raise ValueError(f"Unexpected token {token} in expression: {expression}")

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

    additive()
    if index != len(tokens):
        raise ValueError(f"Unparsed tokens {tokens[index:]} in expression: {expression}")


def main() -> None:
    workbook = load_workbook(WORKBOOK, data_only=False, read_only=True)
    sheet = workbook["Rumus"]
    groups: list[dict] = []
    current: dict | None = None
    for row_number in range(2, sheet.max_row + 1):
        source_code = sheet.cell(row_number, 1).value
        name = sheet.cell(row_number, 2).value
        source_formula = sheet.cell(row_number, 3).value
        if isinstance(source_code, int) and source_code % 100 == 0:
            current = {"code": source_code, "rows": []}
            groups.append(current)
        if current and isinstance(source_code, int) and isinstance(name, str) and isinstance(source_formula, str) and source_formula.strip():
            current["rows"].append({"source_code": source_code, "name": name.strip(), "source_formula": source_formula.strip(), "source_cell": f"Rumus!A{row_number}"})

    models: list[dict] = []
    material_rows: list[dict] = []
    for group in groups:
        if not group["rows"]:
            continue
        model_code = group["code"]
        by_name = {key(row["name"]): row["source_code"] + 1 for row in group["rows"]}
        normalized = []
        input_variables: set[str] = set()
        for row in group["rows"]:
            unit = UNITS.get(key(row["name"]))
            if not unit:
                raise ValueError(f"No unit mapping for {row['name']} in model {model_code}")
            expression = FORMULA_OVERRIDES.get(row["source_code"])
            if expression is None:
                expression = translate(row["source_formula"], by_name, unit)
            validate_expression(expression)
            references = [int(code) for code in re.findall(r"qty_(\d+)", expression)]
            if any(code not in by_name.values() for code in references):
                raise ValueError(f"Unresolved material reference in model {model_code}: {expression}")
            from_formula = re.findall(r"qty_\d+|daunJendela|daunPintu|T[123]|L[123]", expression)
            input_variables.update(token for token in from_formula if token in INPUTS)
            if re.search(r"qty_\d+", expression):
                for referenced_name, referenced_code in by_name.items():
                    if f"qty_{referenced_code}" in expression:
                        dependency = next((item for item in group["rows"] if key(item["name"]) == referenced_name), None)
                        if dependency:
                            dependency_expression = dependency["source_formula"].replace("\ufffd", "*").replace("×", "*")
                            input_variables.update(token for token in INPUTS if re.search(rf"\b{token}\b", dependency_expression))
            normalized.append({**row, "source_formula": row["source_formula"].replace("\ufffd", "×"), "code": row["source_code"] + 1, "unit": unit, "expression": expression})
        by_code = {item["code"]: item["expression"] for item in normalized}
        visited: set[int] = set()

        def collect_inputs(material_code: int) -> None:
            if material_code in visited:
                return
            visited.add(material_code)
            expression = by_code.get(material_code, "")
            input_variables.update(token for token in INPUTS if re.search(rf"\b{token}\b", expression))
            for dependency in map(int, re.findall(r"qty_(\d+)", expression)):
                collect_inputs(dependency)

        for item in normalized:
            collect_inputs(item["code"])
        models.append({"code": model_code, "group_code": (model_code // 10000) * 10000, "name": f"Model {model_code}", "inputs": [item for item in INPUTS if item in input_variables]})
        material_rows.extend({**item, "model_code": model_code} for item in normalized)

    model_values = ",\n".join(
        f"  ({m['code']}, {m['group_code']}, {sql(m['name'])}, array[{', '.join(sql(i) for i in m['inputs'])}]::text[], 'ready')" for m in models
    )
    material_values = ",\n".join(
        f"  ({item['code']}, {item['source_code']}, {sql(item['name'])}, {sql(item['unit'])})" for item in material_rows
    )
    mapping_values = ",\n".join(
        f"  ({item['code']}, {item['model_code']}, {position}, {sql(item['expression'])}, {sql(item['source_cell'])}, {sql(item['source_formula'])})"
        for model in models
        for position, item in enumerate((x for x in material_rows if x['model_code'] == model['code']), start=1)
    )
    history_values = ",\n".join(
        f"  ({item['code']}, 1, {sql(item['expression'])})" for item in material_rows
    )
    if len({model["code"] for model in models}) != len(models):
        raise ValueError("Duplicate model codes detected")
    if len({item["code"] for item in material_rows}) != len(material_rows):
        raise ValueError("Duplicate material codes detected")
    OUTPUT.write_text(
        "-- Generated from Rumus_Jendela.xlsx / Rumus by scripts/generate-window-formula-migration.py.\n"
        "-- Model codes stay on xx00; material codes use the application's xx01+ convention.\n"
        "-- Insert-only so existing catalog edits are not overwritten.\n\n"
        "insert into public.door_models (code, group_code, name, input_variables, status)\nvalues\n"
        + model_values
        + "\non conflict (code) do nothing;\n\n"
        "insert into public.materials (code, source_code, name, unit)\nvalues\n"
        + material_values
        + "\non conflict (code) do nothing;\n\n"
        "insert into public.model_materials (material_code, model_code, position, current_expression, formula_version, source_cell, source_formula)\nselect source.material_code, source.model_code, source.position, source.expression, 1, source.source_cell, source.source_formula\n"
        "from (values\n"
        + mapping_values
        + ") as source(material_code, model_code, position, expression, source_cell, source_formula)\n"
        "on conflict (material_code) do nothing;\n\n"
        "insert into public.formula_versions (material_code, version, expression)\nvalues\n"
        + history_values
        + "\non conflict (material_code, version) do nothing;\n",
        encoding="utf-8",
    )
    print(f"Generated {OUTPUT.name}: {len(models)} models, {len(material_rows)} materials")
    print("Models:", ", ".join(str(model["code"]) for model in models))
    print("Example:", material_rows[0]["code"], material_rows[0]["name"], material_rows[0]["expression"])


if __name__ == "__main__":
    main()
