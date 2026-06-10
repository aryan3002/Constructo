# Constructo — System Flow Diagram

> How the whole system works: where info comes in → the one extraction pipeline → the single Event Ledger → every answer → who sees it. Color-coded by *how* each step is processed.
> Companion to [HOW-IT-WORKS.md](HOW-IT-WORKS.md). Rendered image: `diagrams/system-flow.png`.

**Legend:** 🟢 green = **Deterministic** (rules / math, always reliable) · 🟣 purple = **AI** (drafts & extraction only — never numbers) · 🟠 amber = **Human approval / commit** · 🔵 blue = **Chat / field input** · 🟡 tan = **the Event Ledger spine**.

![System flow](diagrams/system-flow.png)

```mermaid
flowchart LR
  subgraph IN["1 - WHERE INFO COMES IN"]
    WA["WhatsApp messages"]
    CAP["App capture<br/>photo / voice"]
    CHATIN["In-app chat"]
    FORM["Typed cards / forms"]
    HOIN["Homeowner inputs<br/>requests - design - approvals"]
  end
  subgraph ENG["2 - THE ENGINE - one pipeline"]
    RAW["Raw message"]
    STT["Speech-to-text + OCR"]
    CLS["Classify event type<br/>keywords"]
    FILL["AI fills the fields<br/>vendor - qty - material"]
    CONF{"Confident<br/>enough?"}
    CONFIRM["Human confirms"]
    LED[("EVENT LEDGER<br/>one source of truth")]
  end
  subgraph OUT["3 - TURNED INTO ANSWERS"]
    ASK["Exact numbers<br/>sum reducers"]
    REC["Reconcile<br/>delivery vs invoice"]
    FC["Forecast<br/>cashflow - reorder"]
    RISK["Risk detection"]
    APPR["Approvals<br/>state machine"]
    BRIEF["Owner brief<br/>facts + AI prose"]
    DPRN["Daily report<br/>facts + AI prose"]
    SRCH["Semantic search"]
    MEM["Membrane filter<br/>strip money / vendor"]
    PUB["Publish gate"]
  end
  subgraph WHO["4 - WHO SEES IT"]
    OWN["Owner / PM"]
    SUP["Supervisor"]
    ACC["Accountant"]
    HOME["Homeowner"]
  end
  WA --> RAW
  CAP --> RAW
  CHATIN --> RAW
  FORM -->|"typed = skip AI"| LED
  HOIN -->|"direct write"| APPR
  RAW --> STT --> CLS --> FILL --> CONF
  CONF -->|"yes"| LED
  CONF -->|"no"| CONFIRM
  CONFIRM --> LED
  LED --> ASK --> OWN
  LED --> REC --> ACC
  LED --> FC --> OWN
  LED --> RISK --> BRIEF --> OWN
  LED --> APPR --> OWN
  LED --> DPRN --> OWN
  LED --> SRCH --> OWN
  LED --> MEM --> PUB --> HOME
  CAP -.->|"field view"| SUP
  subgraph KEY["Legend"]
    K1["Deterministic - rules / math"]
    K2["AI - drafts and extraction only"]
    K3["Human approval / commit"]
    K4["Chat / field input"]
    K5["The ledger spine"]
  end
  classDef det fill:#DDF0E3,stroke:#2F7D52,color:#13371f;
  classDef llm fill:#EBE0F5,stroke:#6B3FA0,color:#2e1747;
  classDef ledger fill:#FBEFD6,stroke:#C77A12,color:#4a2f08;
  classDef human fill:#FCE7C8,stroke:#C77A12,color:#4a2f08;
  classDef chat fill:#D9E8F5,stroke:#3A6491,color:#16314a;
  classDef role fill:#ffffff,stroke:#1B1916,color:#1B1916;
  class WA,CAP,CHATIN chat;
  class FORM,HOIN,CONFIRM,PUB human;
  class STT,FILL,BRIEF,DPRN,SRCH llm;
  class CLS,CONF,ASK,REC,FC,RISK,APPR,MEM det;
  class RAW,LED ledger;
  class OWN,SUP,ACC,HOME role;
  class K1 det;
  class K2 llm;
  class K3 human;
  class K4 chat;
  class K5 ledger;
```

---

## Roles — keep / merge / cut (for the CivilArch pilot)

> Collapse the *active* surface to **3 roles + the customer**. But keep all 7 in the code (they're wired into RBAC + migrations) — just onboard fewer, and flip the rest on per-company later. **Converge, don't amputate.**
>
> 🟢 keep · 🟠 merge / fold in · 🔴 cut (already dead) · 🔵 customer · tan = pilot target.

![Roles map](diagrams/roles-flow.png)

```mermaid
flowchart LR
  subgraph NOW["TODAY - 7 roles in the code"]
    direction TB
    R_OWN["owner<br/>brief - approve money - manage"]
    R_PM["pm<br/>only unique - daily report"]
    R_SUP["supervisor<br/>field capture - tasks"]
    R_MUK["mukadam<br/>attendance - wage proof"]
    R_ACC["accountant<br/>reconcile - payments"]
    R_PROC["procurement<br/>ZERO screens - already dead"]
    R_HOME["homeowner<br/>calm app + sub-roles"]
  end
  subgraph PILOT["PILOT - 3 active roles + the customer"]
    direction TB
    P_OWN["OWNER / ADMIN<br/>brief - approvals - daily report<br/>absorbs PM"]
    P_SUP["SUPERVISOR / LEAD<br/>capture - spec - site audit - tasks<br/>absorbs Mukadam"]
    P_ACC["ACCOUNTANT<br/>reconcile - payments<br/>only if a real one exists"]
    P_HOME["HOMEOWNER<br/>calm room slice - approvals"]
  end
  R_OWN ==> P_OWN
  R_PM -->|"fold in"| P_OWN
  R_ACC -.->|"fold in if no accounts person"| P_OWN
  R_ACC ==> P_ACC
  R_SUP ==> P_SUP
  R_MUK -->|"fold in - re-add later"| P_SUP
  R_PROC -->|"cut"| X(("dropped"))
  R_HOME ==> P_HOME
  NOTE["Keep all 7 roles in code (RBAC + migrations).<br/>Only ONBOARD the pilot set; switch others<br/>on per-company later. Converge, don't amputate."]
  classDef keep fill:#DDF0E3,stroke:#2F7D52,color:#13371f;
  classDef merge fill:#FCE7C8,stroke:#C77A12,color:#4a2f08;
  classDef cut fill:#F3D6D2,stroke:#B23A2E,color:#4a1410;
  classDef cust fill:#D9E8F5,stroke:#3A6491,color:#16314a;
  classDef target fill:#FBEFD6,stroke:#C77A12,color:#4a2f08,stroke-width:2px;
  classDef note fill:#FFFDF8,stroke:#7A7368,color:#1B1916;
  class R_OWN,R_SUP keep;
  class R_PM,R_MUK,R_ACC merge;
  class R_PROC,X cut;
  class R_HOME cust;
  class P_OWN,P_SUP,P_ACC,P_HOME target;
  class NOTE note;
```
