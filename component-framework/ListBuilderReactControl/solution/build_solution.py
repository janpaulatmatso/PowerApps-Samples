#!/usr/bin/env python3
"""
Builds ListBuilderSolution.zip: an unmanaged Dataverse solution that contains everything
the List Builder needs, so it can be installed by importing a single file:

  - the tables sample_lijst, sample_lijstkolom and sample_lijstregel with their relationships
    (the same data model that setup/Create-ListTables.ps1 creates)
  - the ListBuilder code component
  - a main form for sample_lijst that shows the code component on a "Kolommen en gegevens" tab
  - the model-driven app "Lijstjes"
  - the security role "Lijstjes gebruiker"

The XML is generated from the templates in ./templates, which are based on solutions that
Dataverse exported (see the comments in the templates). Build the control first:

  npm run build -- --buildMode production
  python3 solution/build_solution.py

Only the Python standard library is used, so no .NET SDK or Power Platform CLI is needed.
"""

import argparse
import re
import sys
import uuid
import zipfile
from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import quoteattr, escape

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / "templates"
CONTROL_OUTPUT = HERE.parent / "out" / "controls" / "ListBuilder"

SOLUTION_NAME = "listbuildersample"
SOLUTION_DISPLAY = "List Builder Sample"
VERSION = "1.0.0.0"
# The same publisher as setup/Create-ListTables.ps1 and the other samples in dataverse/webapi/PS
PUBLISHER_NAME = "examplepublisher"
PUBLISHER_DISPLAY = "Example Publisher"
PUBLISHER_DESCRIPTION = "An example publisher for samples"
PREFIX = "sample"
OPTION_VALUE_PREFIX = 72700

CONTROL_NAME = f"{PREFIX}_SampleNamespace.ListBuilder"
APP_NAME = f"{PREFIX}_Lijstjes"
APP_DISPLAY = "Lijstjes"
APP_DESCRIPTION = "Maak je eigen lijstjes met kolommen en datatypes, en voer gegevens in met een formulier of CSV-bestand."
ROLE_NAME = "Lijstjes gebruiker"
ROLE_DESCRIPTION = "Can create lists with the List Builder and manage their own lists, columns and rows."

# Fixed namespace, so every build produces the same ids and importing a new version updates
# the existing forms, views and role instead of adding copies.
ID_NAMESPACE = uuid.UUID("6f1b8d5e-2f47-4c0e-9a55-1d3c7a9b2e10")

# Class ids of the standard form controls
CLASS_IDS = {
    "nvarchar": "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
    "ntext": "{E0DECE4B-6FC8-4a8f-A065-082708572369}",
    "lookup": "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    "owner": "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    "picklist": "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}",
    "bit": "{B0C6723A-8503-4fd7-BB28-C8A06AC933C2}",
    "int": "{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}",
}

# The values must match the ColumnType enum in ListBuilder/types.ts
DATA_TYPES = [
    "Tekst",
    "Meerregelige tekst",
    "Geheel getal",
    "Decimaal getal",
    "Datum",
    "Ja/Nee",
    "Keuzelijst",
]

LIST_LOOKUP = {
    "type": "lookup",
    "schema": f"{PREFIX}_LijstId",
    "display": "Lijst",
    "description": "The list this record belongs to",
    "required": True,
}

# The data model. Keep it in sync with setup/Create-ListTables.ps1.
TABLES = [
    {
        "schema": f"{PREFIX}_Lijst",
        "display": "Lijst",
        "plural": "Lijsten",
        "description": "A list that a user created with the ListBuilder code component",
        "name_display": "Naam",
        "name_description": "The name of the list",
        "name_required": True,
        "columns": [
            {
                "type": "ntext",
                "schema": f"{PREFIX}_Omschrijving",
                "display": "Omschrijving",
                "description": "The description of the list",
                "max_length": 2000,
            },
        ],
    },
    {
        "schema": f"{PREFIX}_LijstKolom",
        "display": "Lijstkolom",
        "plural": "Lijstkolommen",
        "description": "A column of a list created with the ListBuilder code component",
        "name_display": "Kolomnaam",
        "name_description": "The display name of the column",
        "name_required": True,
        "parent_relationship": f"{PREFIX}_Lijst_LijstKolom",
        "columns": [
            LIST_LOOKUP,
            {
                "type": "nvarchar",
                "schema": f"{PREFIX}_Sleutel",
                "display": "Sleutel",
                "description": "Key of the column in the JSON values of a list row. Never changes.",
                "max_length": 100,
            },
            {
                "type": "picklist",
                "schema": f"{PREFIX}_DataType",
                "display": "Datatype",
                "description": "The data type of the column",
                "required": True,
                "options": [(OPTION_VALUE_PREFIX * 10000 + i, label) for i, label in enumerate(DATA_TYPES)],
            },
            {
                "type": "ntext",
                "schema": f"{PREFIX}_Opties",
                "display": "Opties",
                "description": "The options of a choice column, as a JSON array",
                "max_length": 10000,
            },
            {
                "type": "bit",
                "schema": f"{PREFIX}_Verplicht",
                "display": "Verplicht",
                "description": "Whether a value is required",
                "true_label": "Ja",
                "false_label": "Nee",
            },
            {
                "type": "int",
                "schema": f"{PREFIX}_Volgorde",
                "display": "Volgorde",
                "description": "The position of the column in the list",
                "min_value": 0,
                "max_value": 10000,
            },
        ],
    },
    {
        "schema": f"{PREFIX}_LijstRegel",
        "display": "Lijstregel",
        "plural": "Lijstregels",
        "description": "A data row of a list created with the ListBuilder code component",
        "name_display": "Samenvatting",
        "name_description": "A summary of the first values of the row",
        "name_required": False,
        "parent_relationship": f"{PREFIX}_Lijst_LijstRegel",
        "columns": [
            LIST_LOOKUP,
            {
                "type": "ntext",
                "schema": f"{PREFIX}_Waarden",
                "display": "Waarden",
                "description": "The values of the row as a JSON object, keyed by the sample_sleutel of each column",
                "max_length": 1048576,
            },
        ],
    },
]

LIST_TABLE = TABLES[0]
PRIVILEGES = ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share"]


def new_id(key: str) -> str:
    return "{" + str(uuid.uuid5(ID_NAMESPACE, key)) + "}"


def template(name: str) -> str:
    return (TEMPLATES / name).read_text(encoding="utf-8")


def render(text: str, **values) -> str:
    """Replaces {{KEY}} placeholders. Values are inserted as is; escape them before if needed."""
    def replace(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"No value for placeholder {{{{{key}}}}}")
        return str(values[key])

    return re.sub(r"\{\{([A-Z_]+)\}\}", replace, text)


def attr(value: str) -> str:
    """Escapes a value for use inside an XML attribute that the template already quotes."""
    return quoteattr(value)[1:-1]


# --- Tables -------------------------------------------------------------------------------------


def render_column(table: dict, column: dict) -> str:
    kind = column["type"]
    logical = column["schema"].lower()
    values = {
        "SCHEMA_NAME": column["schema"],
        "LOGICAL_NAME": logical,
        "REQUIRED_LEVEL": "required" if column.get("required") else "none",
        "DISPLAY": attr(column["display"]),
        "DESCRIPTION": attr(column["description"]),
    }
    if kind == "nvarchar":
        values["MAX_LENGTH"] = column["max_length"]
        values["LENGTH"] = column["max_length"] * 2
    elif kind == "ntext":
        values["MAX_LENGTH"] = column["max_length"]
    elif kind == "int":
        values["MIN_VALUE"] = column["min_value"]
        values["MAX_VALUE"] = column["max_value"]
    elif kind == "bit":
        values["OPTIONSET_NAME"] = f"{table['schema'].lower()}_{logical}"
        values["TRUE_LABEL"] = attr(column["true_label"])
        values["FALSE_LABEL"] = attr(column["false_label"])
    elif kind == "picklist":
        values["OPTIONSET_NAME"] = f"{table['schema'].lower()}_{logical}"
        values["OPTIONS"] = "".join(
            render(template("attributes/picklist_option.xml"), VALUE=value, LABEL=attr(label))
            for value, label in column["options"]
        )
    return render(template(f"attributes/{kind}.xml"), **values)


def form_cell(key: str, label: str, field: str, kind: str, control_id=None, show_label=True, rowspan=None, unique_id=None) -> str:
    return render(
        template("form_cell.xml"),
        CELL_ID=new_id(f"{key}/cell"),
        SHOW_LABEL="true" if show_label else "false",
        ROWSPAN=f' rowspan="{rowspan}"' if rowspan else "",
        LABEL=attr(label),
        CONTROL_ID=control_id or field,
        CLASS_ID=CLASS_IDS[kind],
        FIELD=field,
        UNIQUE_ID=f' uniqueid="{unique_id}"' if unique_id else "",
    )


def form_tab(key: str, name: str, label: str, cells: list) -> str:
    return render(
        template("form_tab.xml"),
        TAB_ID=new_id(f"{key}/tab"),
        TAB_NAME=name,
        SECTION_NAME=f"{name}_section",
        SECTION_ID=new_id(f"{key}/section"),
        TAB_LABEL=attr(label),
        ROWS="".join(cells),
    )


def render_main_form(table: dict) -> str:
    logical = table["schema"].lower()
    key = f"{logical}/mainform"
    general = [form_cell(f"{key}/name", table["name_display"], f"{PREFIX}_name", "nvarchar")]
    for column in table["columns"]:
        general.append(
            form_cell(
                f"{key}/{column['schema'].lower()}",
                column["display"],
                column["schema"].lower(),
                column["type"],
                rowspan=4 if column["type"] == "ntext" else None,
            )
        )
    general.append(form_cell(f"{key}/owner", "Eigenaar", "ownerid", "owner"))
    tabs = [form_tab(f"{key}/general", "tab_algemeen", "Algemeen", general)]
    control_descriptions = ""

    if table is LIST_TABLE:
        # The name column a second time, shown with the ListBuilder code component. The control
        # doesn't use the value; it reads the id of the record from the form.
        unique_id = new_id(f"{key}/listbuilder/control")
        field = f"{PREFIX}_name"
        tabs.append(
            form_tab(
                f"{key}/listbuilder",
                "tab_kolommen_en_gegevens",
                "Kolommen en gegevens",
                [form_cell(f"{key}/listbuilder", "Lijst", field, "nvarchar", control_id=f"{field}1", show_label=False, unique_id=unique_id)],
            )
        )
        control_descriptions = render(
            template("form_custom_control.xml"),
            UNIQUE_ID=unique_id,
            FIELD=field,
            FORM_FACTORS="".join(
                render(template("form_custom_control_formfactor.xml"), FORM_FACTOR=factor, CONTROL_NAME=CONTROL_NAME, FIELD=field)
                for factor in (0, 1, 2)
            ),
        )

    return render(
        template("form_main.xml"),
        FORM_ID=new_id(key),
        TABS="".join(tabs),
        CONTROL_DESCRIPTIONS=control_descriptions,
        FORM_NAME=attr(table["display"]),
        FORM_DESCRIPTION=attr(f"Main form of {table['display']}"),
    )


def render_entity(table: dict) -> str:
    logical = table["schema"].lower()
    text = render(
        template("entity.xml"),
        SCHEMA=table["schema"],
        LOGICAL=logical,
        DISPLAY=attr(table["display"]),
        PLURAL=attr(table["plural"]),
        DESCRIPTION=attr(table["description"]),
        NAME_DESCRIPTION=attr(table["name_description"]),
        CUSTOM_ATTRIBUTES="".join(render_column(table, c) for c in table["columns"]),
        MAIN_FORM=render_main_form(table),
    )

    # The primary name column: Dutch label and requirement level.
    start = text.index(f'<attribute PhysicalName="{PREFIX}_Name">')
    end = text.index("</attribute>", start)
    name = text[start:end]
    name = name.replace('<displayname description="Name" languagecode="1033" />', f'<displayname description={quoteattr(table["name_display"])} languagecode="1033" />')
    if table["name_required"]:
        name = name.replace("<RequiredLevel>none</RequiredLevel>", "<RequiredLevel>required</RequiredLevel>")
    text = text[:start] + name + text[end:]

    # The forms and views of the template keep their structure but get ids of their own.
    def new_guid(match):
        return match.group(1) + new_id(f"{logical}/{match.group(2).lower()}") + match.group(3)

    # Only the ids of forms, views, tabs, sections and cells; class ids of controls must stay as they are.
    text = re.sub(
        r"(<formid>|<savedqueryid>|<(?:tab|section|cell)\b[^>]*? id=\")\{([0-9a-fA-F-]{36})\}(</formid>|</savedqueryid>|\")",
        new_guid,
        text,
    )
    return text


def render_relationships() -> str:
    parts = []
    for table in TABLES:
        parts.append(render(template("system_relationships.xml"), SCHEMA=table["schema"], LOGICAL=table["schema"].lower()))
    for table in TABLES:
        if "parent_relationship" in table:
            parts.append(
                render(
                    template("relationship.xml"),
                    NAME=table["parent_relationship"],
                    REFERENCING_SCHEMA=table["schema"],
                    REFERENCED_SCHEMA=LIST_TABLE["schema"],
                    LOOKUP_SCHEMA=LIST_LOOKUP["schema"],
                )
            )
    return "".join(parts)


# --- Role and app -------------------------------------------------------------------------------

ROLE_ID = new_id("role/lijstjesgebruiker")


def render_role() -> str:
    privileges = "".join(
        f'        <RolePrivilege name="prv{privilege}{table["schema"]}" level="Basic" />\n'
        for table in TABLES
        for privilege in PRIVILEGES
    )
    return render(
        template("role.xml"),
        ROLE_ID=ROLE_ID,
        ROLE_NAME=attr(ROLE_NAME),
        ROLE_DESCRIPTION=escape(ROLE_DESCRIPTION),
        PRIVILEGES=privileges,
    )


def render_app() -> tuple:
    components = "".join(
        f'        <AppModuleComponent type="1" schemaName="{t["schema"].lower()}" />\n' for t in TABLES
    ) + f'        <AppModuleComponent type="62" schemaName="{APP_NAME}" />\n'
    app = render(
        template("appmodule.xml"),
        APP_NAME=APP_NAME,
        APP_COMPONENTS=components,
        ROLE_ID=ROLE_ID,
        APP_DISPLAY=attr(APP_DISPLAY),
        APP_DESCRIPTION=attr(APP_DESCRIPTION),
    )
    sitemap = render(
        template("sitemap.xml"),
        APP_NAME=APP_NAME,
        APP_DISPLAY=attr(APP_DISPLAY),
        ENTITY_LOGICAL=LIST_TABLE["schema"].lower(),
        SUBAREA_TITLE=attr(LIST_TABLE["plural"]),
    )
    return app, sitemap


# --- Solution -----------------------------------------------------------------------------------


def render_customizations() -> str:
    app, sitemap = render_app()
    return render(
        template("customizations.xml"),
        ENTITIES="".join(render_entity(t) for t in TABLES),
        ROLES=render_role(),
        RELATIONSHIPS=render_relationships(),
        CONTROL_NAME=CONTROL_NAME,
        SITEMAPS=sitemap,
        APPMODULES=app,
    )


def render_solution() -> str:
    roots = "".join(
        f'      <RootComponent type="1" schemaName="{t["schema"].lower()}" behavior="0" />\n' for t in TABLES
    )
    roots += f'      <RootComponent type="20" id="{ROLE_ID}" behavior="0" />\n'
    roots += f'      <RootComponent type="62" schemaName="{APP_NAME}" behavior="0" />\n'
    roots += f'      <RootComponent type="66" schemaName="{CONTROL_NAME}" behavior="0" />\n'
    roots += f'      <RootComponent type="80" schemaName="{APP_NAME}" behavior="0" />\n'
    return render(
        template("solution.xml"),
        SOLUTION_NAME=SOLUTION_NAME,
        SOLUTION_DISPLAY=attr(SOLUTION_DISPLAY),
        VERSION=VERSION,
        PUBLISHER_NAME=PUBLISHER_NAME,
        PUBLISHER_DISPLAY=attr(PUBLISHER_DISPLAY),
        PUBLISHER_DESCRIPTION=attr(PUBLISHER_DESCRIPTION),
        PREFIX=PREFIX,
        OPTION_VALUE_PREFIX=OPTION_VALUE_PREFIX,
        ROOT_COMPONENTS=roots,
    )


def check_xml(name: str, text: str) -> None:
    try:
        minidom.parseString(text.encode("utf-8"))
    except Exception as error:  # noqa: BLE001 - report any parser error with the file name
        raise SystemExit(f"{name} is not well-formed XML: {error}")


def build(output: Path) -> None:
    if not (CONTROL_OUTPUT / "bundle.js").exists():
        raise SystemExit(f"{CONTROL_OUTPUT / 'bundle.js'} not found. Run 'npm run build -- --buildMode production' first.")

    files = {
        "[Content_Types].xml": render(template("content_types.xml"), CONTROL_NAME=CONTROL_NAME),
        "solution.xml": render_solution(),
        "customizations.xml": render_customizations(),
    }
    for name, text in files.items():
        check_xml(name, text)

    control_folder = f"Controls/{CONTROL_NAME}"
    control_files = {
        f"{control_folder}/ControlManifest.xml": CONTROL_OUTPUT / "ControlManifest.xml",
        f"{control_folder}/bundle.js": CONTROL_OUTPUT / "bundle.js",
    }
    for resx in sorted((CONTROL_OUTPUT / "strings").glob("*.resx")):
        control_files[f"{control_folder}/strings/{resx.name}"] = resx

    output.parent.mkdir(parents=True, exist_ok=True)
    # A fixed timestamp keeps the zip identical when nothing changed.
    timestamp = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
        for name, text in files.items():
            package.writestr(zipfile.ZipInfo(name, timestamp), "﻿" + text if name != "[Content_Types].xml" else text, zipfile.ZIP_DEFLATED)
        for name, path in control_files.items():
            package.writestr(zipfile.ZipInfo(name, timestamp), path.read_bytes(), zipfile.ZIP_DEFLATED)
    print(f"Created {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=HERE / "ListBuilderSolution_1_0_0_0.zip")
    args = parser.parse_args()
    build(args.output)


if __name__ == "__main__":
    sys.exit(main())
