#!/usr/bin/env python3
"""Generate insert-only seed SQL for the two kusen budget sheets."""

from __future__ import annotations

import re
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Master budget_DJ3 bengkel.xlsx"
OUTPUT = ROOT / "supabase/seed_kusen_budget.sql"
SHEETS = [
    ("alexindo", "ALEXINDO", "Alexindo", 1, 72),
    ("hpm-inka-dacon", "Hpm-inka-dacon dll", "HPM / INKA / DACON", 2, 73),
]
VARIANTS = [("base", "ITEM ALEXINDO SILVER", 11), ("brown", "Brown", 14), ("cream", "Putih / Cream", 17), ("coating", "Coating", 20)]


def sql(value: object | None) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def number(value: object | None) -> str:
    if value is None or value == "":
        return "null"
    return str(value)


def column_name(index: int) -> str:
    label = ""
    while index:
        index, rem = divmod(index - 1, 26)
        label = chr(65 + rem) + label
    return label


def category(index: int) -> str:
    if index <= 9:
        return "Pekerjaan awal"
    if index <= 16:
        return "Profil aluminium"
    if index <= 23:
        return "Daun pintu"
    if index <= 28:
        return "Pintu dan jendela"
    if index <= 40:
        return "Kaca"
    if index <= 49:
        return "Finishing dan pekerjaan tambahan"
    return "Aksesori"


def component_info(sheet, col: int) -> tuple[str, str, str, str] | None:
    """Return (label, unit, group label, category) for a price column."""
    for merged in sheet.merged_cells.ranges:
        if merged.min_row == 9 and merged.max_row == 9 and merged.min_col <= col <= merged.max_col:
            group = str(sheet.cell(9, merged.min_col).value or "").strip()
            item = str(sheet.cell(10, col).value or "").strip()
            if not item:
                return None
            unit = group.rsplit("/", 1)[-1].strip().lower() if "/" in group else ""
            return item, unit, group, "Aksesori"
    label = sheet.cell(9, col).value
    if not label:
        return None
    return str(label).strip(), str(sheet.cell(10, col).value or "").strip(), "", category(col - 5)


def formula_variant(value: object, variant_by_row: dict[int, str]) -> str | None:
    if not isinstance(value, str):
        return None
    match = re.match(r"=\s*[A-Z]+\d+\s*\*\s*[A-Z]+(\d+)$", value.strip(), re.I)
    if match:
        return variant_by_row.get(int(match.group(1)))
    return None


def main() -> None:
    book = openpyxl.load_workbook(WORKBOOK, data_only=False, read_only=False)
    cached_book = openpyxl.load_workbook(WORKBOOK, data_only=True, read_only=True)
    sql_lines = [
        "-- Generated from Master budget_DJ3 bengkel.xlsx by scripts/generate-kusen-budget-seed.py.",
        "-- Insert-only: rerunning seeds will not overwrite later price edits or added catalogs.",
    ]
    for slug, sheet_name, title, catalog_position, last_column in SHEETS:
        sheet = book[sheet_name]
        cached_sheet = cached_book[sheet_name]
        catalog_literal = sql(slug)
        sql_lines += [
            "",
            "insert into public.budget_catalogs (slug, label, position) values",
            f"  ({catalog_literal}, {sql(title)}, {catalog_position}) on conflict (slug) do nothing;",
            "",
            "insert into public.budget_components (catalog_id, component_key, source_column, label, unit, category, position, group_label)",
            "select c.id, v.component_key, v.source_column, v.label, v.unit, v.category, v.position, v.group_label",
            "from public.budget_catalogs c cross join (values",
        ]
        components: list[str] = []
        for col in range(6, last_column + 1):
            info = component_info(sheet, col)
            if not info:
                continue
            label, unit, group, item_category = info
            components.append(
                f"  ({sql('col_' + column_name(col).lower())}, {sql(column_name(col))}, {sql(label)}, {sql(unit)}, {sql(item_category)}, {col - 5}, {sql(group)})"
            )
        sql_lines.append(",\n".join(components))
        sql_lines += [
            ") as v(component_key, source_column, label, unit, category, position, group_label)",
            f"where c.slug = {catalog_literal} on conflict (catalog_id, component_key) do nothing;",
            "",
            "insert into public.budget_variants (catalog_id, variant_key, label, source_row, position)",
            "select c.id, v.variant_key, v.label, v.source_row, v.position",
            "from public.budget_catalogs c cross join (values",
        ]
        sheet_variants = VARIANTS if slug == "alexindo" else VARIANTS[1:]
        variant_values = [
            f"  ({sql(key)}, {sql(label)}, {row}, {position})"
            for position, (key, label, row) in enumerate(sheet_variants, 1)
        ]
        sql_lines.append(",\n".join(variant_values))
        sql_lines += [
            ") as v(variant_key, label, source_row, position)",
            f"where c.slug = {catalog_literal} on conflict (catalog_id, variant_key) do nothing;",
            "",
            "insert into public.budget_prices (component_id, variant_id, amount, expression, source_cell, source_formula, source_value)",
            "select comp.id, var.id, v.amount, v.expression, v.source_cell, v.source_formula, v.source_value",
            "from (values",
        ]
        prices: list[str] = []
        variant_by_row = {row: key for key, _label, row in sheet_variants}
        for col in range(6, last_column + 1):
            if not component_info(sheet, col):
                continue
            for variant_key, _label, row in sheet_variants:
                value = sheet.cell(row, col).value
                expr = None
                amount = None
                if isinstance(value, (int, float)):
                    amount = value
                elif isinstance(value, str) and value.startswith("="):
                    expr = value[1:]
                    referenced_rows = {int(ref) for ref in re.findall(r"\b[A-Z]+(\d+)\b", value, flags=re.I)}
                    # HPM rows can reference workbook row 11, which is not a
                    # selectable app variant. Use Excel's cached calculation
                    # instead of emitting an unresolved price_*_base formula.
                    if any(ref_row not in variant_by_row for ref_row in referenced_rows):
                        cached_amount = cached_sheet.cell(row, col).value
                        if isinstance(cached_amount, (int, float)):
                            amount = cached_amount
                            expr = None
                    if expr is not None:
                        expr = re.sub(r"([0-9]+(?:\.[0-9]+)?)%", r"(\1/100)", expr)
                        expr = re.sub(r"\b([A-Z]+)(\d+)\b", lambda m: f"price_col_{m.group(1).lower()}_{variant_by_row.get(int(m.group(2)), 'base')}", expr, flags=re.I)
                        expr = expr.replace(" ", "")
                prices.append(
                    f"  ({sql('col_' + column_name(col).lower())}, {sql(variant_key)}, {number(amount)}, {sql(expr)}, {sql(column_name(col) + str(row))}, {sql(value if isinstance(value, str) and value.startswith('=') else None)}, {sql(value)})"
                )
        sql_lines.append(",\n".join(prices))
        sql_lines += [
            ") as v(component_key, variant_key, amount, expression, source_cell, source_formula, source_value)",
            f"join public.budget_catalogs c on c.slug = {catalog_literal}",
            "join public.budget_components comp on comp.catalog_id = c.id and comp.component_key = v.component_key",
            "join public.budget_variants var on var.catalog_id = c.id and var.variant_key = v.variant_key",
            "on conflict (component_id, variant_id) do nothing;",
            "",
            "insert into public.budget_price_versions (component_id, variant_id, version, amount, expression, changed_by)",
            "select p.component_id, p.variant_id, p.version, p.amount, p.expression, null",
            "from public.budget_prices p",
            f"join public.budget_catalogs c on c.slug = {catalog_literal}",
            "join public.budget_components comp on comp.id = p.component_id and comp.catalog_id = c.id",
            "on conflict (component_id, variant_id, version) do nothing;",
            "",
            "insert into public.budget_calculation_rules (catalog_id, line_position, component_id, variant_id, source_formula)",
            "select c.id, v.line_position, comp.id, var.id, v.source_formula",
            "from (values",
        ]
        rule_values: list[str] = []
        row_starts = [r for r in range(22, sheet.max_row + 1) if sheet.cell(r, 2).value is not None and isinstance(sheet.cell(r, 2).value, (int, float))]
        variant_by_row = {row: key for key, _label, row in sheet_variants}
        for line_position, base_row in enumerate(row_starts[:21], 1):
            quantity_row = base_row + 1
            for col in range(6, last_column + 1):
                if not component_info(sheet, col):
                    continue
                expression = sheet.cell(quantity_row, col).value
                variant_key = formula_variant(expression, variant_by_row)
                if variant_key is None:
                    references = re.findall(r"\b[A-Z]+(\d+)\b", expression or "", flags=re.I) if isinstance(expression, str) else []
                    reference_rows = {int(ref) for ref in references}
                    variant_key = next((key for key, _label, row in sheet_variants if row in reference_rows), sheet_variants[0][0])
                rule_values.append(
                    f"  ({line_position}, {sql('col_' + column_name(col).lower())}, {sql(variant_key)}, {sql(expression if isinstance(expression, str) else '')})"
                )
        sql_lines.append(",\n".join(rule_values))
        sql_lines += [
            ") as v(line_position, component_key, variant_key, source_formula)",
            f"join public.budget_catalogs c on c.slug = {catalog_literal}",
            "join public.budget_components comp on comp.catalog_id = c.id and comp.component_key = v.component_key",
            "join public.budget_variants var on var.catalog_id = c.id and var.variant_key = v.variant_key",
            "on conflict (catalog_id, line_position, component_id) do nothing;",
        ]
    sql_lines += [
        "",
        "-- Flexible links from calculator materials to each price sheet. Insert-only so admin changes survive reseeding.",
        "insert into public.budget_material_mappings (catalog_id, material_key, material_name, material_unit, component_id)",
        "select c.id, m.material_key, m.material_name, m.material_unit, comp.id",
        "from public.budget_catalogs c",
        "cross join (values",
        "  ('kusen|m''', 'kusen', 'm''', 'KUSEN / M'''),",
        "  ('tapin|m''', 'tapin', 'm''', 'TAPIN / M'''),",
        "  ('pintu|m''', 'pintu', 'm''', 'PINTU / M'''),",
        "  ('kaca/acp/spndrel/pintu|m\"', 'kaca/acp/spndrel/pintu', 'm\"', 'SPANDRELL / M2'),",
        "  ('silicone|m''', 'silicone', 'm''', 'SEALANT / M''')",
        ") as m(material_key, material_name, material_unit, component_label)",
        "join public.budget_components comp on comp.catalog_id = c.id and lower(comp.label) = lower(m.component_label)",
        "where c.slug in ('alexindo', 'hpm-inka-dacon')",
        "on conflict (catalog_id, material_key) do nothing;",
    ]
    OUTPUT.write_text("\n".join(sql_lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
