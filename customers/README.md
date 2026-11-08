# SSM Work — Customer projects

Tools and documents built for customer projects, grouped in three levels:

| Level | What | Where |
|---|---|---|
| L1 | SSM Work (Site & Service Management) | this repository + Vercel team `ssm-rak` |
| L2 | Customer | `customers/<customer>/` |
| L3 | Project (Job Order) | `customers/<customer>/<jo-number>-<short-name>/` |

Each project folder holds one sub-folder per tool (for example `spare-part-list/`).

## Index

Add a row whenever a new customer, project or tool is created.

| Customer | Project (JO) | Tool | Folder | Live URL |
|---|---|---|---|---|
| HAM-LET (Thailand) | JO 02702026 · Double Soak EP 500L × 2 systems | Customer spare part list | [`hamlet/jo02702026-ep500l-double-soak/spare-part-list`](hamlet/jo02702026-ep500l-double-soak/spare-part-list) | https://hamlet-02702026-spare-parts-ssm-rak.vercel.app |

## Naming rules

- **Folder names:** lower-case, hyphens, no spaces or Thai characters.
  - Customer: short company name — `hamlet`, `pandora`, `daisin`, `uct`
  - Project: `jo` + job-order number + short description — `jo02702026-ep500l-double-soak`
  - Tool: what it does — `spare-part-list`, `punch-list`, `site-expense`
- **Vercel project names:** `<customer>-<jo-number>-<tool>` — for example `hamlet-02702026-spare-parts` (Vercel project for HAM-LET JO 02702026). Set the project's **Root Directory** to the tool folder.
- **README in every customer and project folder** — who, what, which documents the data came from.

## Adding a new project

1. Copy `_template/jo-project-slug/` to `customers/<customer>/<jo-number>-<short-name>/` (create the customer folder first if it is new, with its own `README.md`).
2. Fill in the project `README.md`.
3. Add the tool folder and its files.
4. Create the Vercel project in team `ssm-rak` with the naming rule above and Root Directory set to the tool folder.
5. Add a row to the index above.

> This repository is **public**. Customer names, PR/PO numbers and prices placed here can be read by anyone. Make the repository private in GitHub Settings if that is not intended.
