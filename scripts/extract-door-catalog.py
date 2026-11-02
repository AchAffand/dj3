#!/usr/bin/env python3
"""Read kalkulator_Pintu.xlsx and emit the checked, source-traceable door catalog."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils.cell import column_index_from_string

VARIABLES = {
    "C": "T1",
    "D": "L1",
    "E": "T2",
    "F": "L2",
    "G": "T3",
    "H": "L3",
    "I": "daunPintu",
    "J": "daunJendela",
}
CELL_REFERENCE = re.compile(r"\$?([A-Z]{1,3})\$?(\d+)")
IDENTIFIER = re.compile(r"qty_\d+|[A-Za-z_][A-Za-z0-9_]*")
SUPPORTED_VARIABLES = set(VARIABLES.values())


def expression_from_excel(formula: str, row_to_code: dict[int, int], master, model_code: int, item_code: int) -> str:
    source_formula = formula[1:] if formula.startswith("=") else formula
    if model_code == 12100 and item_code == 12101:
        # Confirmed correction: use dimensions from the selected model input row,
        # following the prototype expression pattern and its model variable names.
        return "((T1+T2)*2+L1*2)/1000"

    def replace_reference(match: re.Match[str]) -> str:
        column, row_text = match.group(1), match.group(2)
        row = int(row_text)
        if column in VARIABLES:
            if row == 2:
                return VARIABLES[column]
            if master.cell(row, column_index_from_string(column)).value is None:
                # Excel treats a blank cell used in arithmetic as zero.
                return "0"
            raise ValueError(f"{formula}: referensi input {column}{row} bukan baris input model")
        if column == "L":
            referenced_code = row_to_code.get(row)
            if referenced_code is None:
                raise ValueError(f"{formula}: referensi qty L{row} tidak memiliki kode item")
            return f"qty_{referenced_code}"
        raise ValueError(f"{formula}: referensi sel {column}{row} tidak didukung")

    translated = CELL_REFERENCE.sub(replace_reference, source_formula)
    identifiers = set(IDENTIFIER.findall(translated))
    unknown = identifiers - SUPPORTED_VARIABLES - {
        token for token in identifiers if token.startswith("qty_") and token[4:].isdigit()
    }
    if unknown:
        raise ValueError(f"{formula}: variabel tidak dikenal {sorted(unknown)}")
    return translated


def extract(workbook_path: Path) -> dict:
    # Load into memory for fast random access; never save either workbook object.
    formulas = load_workbook(workbook_path, data_only=False, read_only=False)
    cached = load_workbook(workbook_path, data_only=True, read_only=False)
    master = formulas["master"]
    cached_master = cached["master"]
    model_rows: dict[int, list[int]] = defaultdict(list)
    effective_code_by_row: dict[int, int] = {}
    previous_code: int | None = None

    for row in range(2, master.max_row + 1):
        raw_code = master.cell(row, 2).value
        # `master` contains multiple product families (10000, 30000, 40000).
        # Keep each family's source model/material codes intact.
        if isinstance(raw_code, (int, float)) and 10000 <= int(raw_code) < 50000:
            code = int(raw_code)
            # In the 34200 block, Excel resumes the item sequence at 34104–34114.
            # The preceding rows are 34201–34203 and the sequence continues as 34204–34214.
            # Reconcile only a same-family backward-prefix typo with a consecutive item ordinal.
            if (
                previous_code is not None
                and code // 10000 == previous_code // 10000
                and code // 100 < previous_code // 100
                and code % 100 == previous_code % 100 + 1
            ):
                code = previous_code + 1
            effective_code_by_row[row] = code
            model_rows[(code // 100) * 100].append(row)
            previous_code = code

    global_row_to_code = effective_code_by_row

    records = []
    for model_code, rows in sorted(model_rows.items()):
        materials = []
        inputs = set()
        for row in rows:
            raw_code = master.cell(row, 2).value
            name = master.cell(row, 11).value
            unit = master.cell(row, 13).value
            raw_formula = master.cell(row, 12).value
            if not raw_code or not name or name == "-" or unit in (None, "-"):
                continue

            item_code = effective_code_by_row[row]
            expression = None
            if isinstance(raw_formula, str) and raw_formula.startswith("="):
                expression = expression_from_excel(raw_formula, global_row_to_code, master, model_code, item_code)
                inputs.update(
                    identifier
                    for identifier in IDENTIFIER.findall(expression)
                    if identifier in SUPPORTED_VARIABLES
                )

            materials.append(
                {
                    "code": item_code,
                    "sourceCode": int(raw_code),
                    "name": str(name).strip(),
                    "unit": str(unit).strip(),
                    "expression": expression,
                    "sourceCell": f"L{row}",
                    "sourceFormula": raw_formula if isinstance(raw_formula, str) and raw_formula.startswith("=") else None,
                    "sourceCachedQuantity": cached_master.cell(row, 12).value,
                }
            )

        if not materials:
            continue
        ready = all(item["expression"] is not None for item in materials)
        records.append(
            {
                "code": model_code,
                "groupCode": (model_code // 10000) * 10000,
                "name": f"Model {model_code}",
                "inputs": [name for name in VARIABLES.values() if name in inputs],
                "status": "ready" if ready else "incomplete",
                "materials": materials,
            }
        )

    return {
        "sourceWorkbook": workbook_path.name,
        "sourceSheet": "master",
        "models": records,
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=root / "kalkulator_Pintu.xlsx")
    parser.add_argument("--output", type=Path, default=root / "src/domain/catalog/door-catalog.json")
    args = parser.parse_args()
    if not args.workbook.exists():
        raise SystemExit(f"Workbook tidak ditemukan: {args.workbook}")

    result = extract(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    model_count = len(result["models"])
    item_count = sum(len(model["materials"]) for model in result["models"])
    incomplete = sum(model["status"] == "incomplete" for model in result["models"])
    print(f"Impor selesai: {model_count} model, {item_count} material aktif, {incomplete} model belum lengkap.")
    print(f"Sumber tetap hanya dibaca: {args.workbook}")
    print(f"Katalog: {args.output}")


if __name__ == "__main__":
    main()
