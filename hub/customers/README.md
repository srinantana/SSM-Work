# SSM Work — Customer projects

Tools and documents built for customer projects, grouped in three levels:

| Level | What | Where |
|---|---|---|
| L1 | SSM Work (Site & Service Management) | this repository · Vercel team `ssm-rak` · hub site https://ssmwork.vercel.app (folder `hub/`) |
| L2 | Customer | `hub/customers/<customer>/` |
| L3 | Project (Job Order) | `hub/customers/<customer>/<jo-number>-<short-name>/` |

Each project folder holds one sub-folder per tool (for example `spare-part-list/`).

## Index

Add a row whenever a new customer, project or tool is created.

| Customer | Project (JO) | Tool | Folder | Live URL |
|---|---|---|---|---|

## Naming rules

- **Folder names:** lower-case, hyphens, no spaces or Thai characters.
  - Customer: short company name — `pandora`, `daisin`, `uct`
  - Project: `jo` + job-order number + short description — `jo<job-order>-<short-description>`
  - Tool: what it does — `spare-part-list`, `punch-list`, `site-expense`
- **Vercel:** all tools are served by the one hub project `ssmwork` (Root Directory `hub`). A tool's URL is `https://ssmwork.vercel.app/customers/<customer>/<project>/<tool>/`. Create a separate Vercel project only for a tool that needs its own server or database.
- **README in every customer and project folder** — who, what, which documents the data came from.

## Adding a new project

1. Copy `_template/jo-project-slug/` to `hub/customers/<customer>/<jo-number>-<short-name>/` (create the customer folder first if it is new, with its own `README.md`).
2. Fill in the project `README.md`.
3. Add the tool folder and its files.
4. Add the customer / project / tool to `hub/registry.json` — this is what the hub page at https://ssmwork.vercel.app lists.
5. Add a row to the index above.

> Everything under `hub/` that is deployed is reachable by anyone with the link. Keep internal-only notes out of tool pages, or use the tool's customer view when sharing.
