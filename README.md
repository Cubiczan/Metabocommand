<p align="center">
  <h1 align="center">MetaboCommand</h1>
  <p align="center">Metabolic Commerce Multi-Agent Platform — AI agents for eCommerce finance and ops, built with Next.js 16 + Supabase Realtime + Presence</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
    <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
  </p>
</p>

## Demo

https://github.com/user-attachments/assets/demo.mp4

## Overview

**MetaboCommand** is a metabolic commerce multi-agent platform that applies biological metabolism principles to eCommerce operations. Just as metabolic pathways convert inputs into energy and building blocks, MetaboCommand's AI agents transform raw commerce data into actionable financial decisions and operational workflows.

The platform is organized into **two workspaces**:

- **Capital Reflex System** — A suite of finance-focused AI agents that monitor revenue health, predict financial outcomes, identify optimization opportunities, and orchestrate capital allocation across channels.
- **Operations Command Center** — An operations-focused AI agent network covering customer acquisition, conversion optimization, retention, demand forecasting, logistics orchestration, support automation, and advocacy management.

A core design principle is **human-in-the-loop approval** — agents propose actions, but nothing executes without explicit human authorization, ensuring full control over automated commerce decisions.

Real-time dashboards powered by **Supabase Realtime** and **Presence** provide live visibility into agent activity, approval queues, and system health across your entire commerce metabolism.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MetaboCommand Platform                        │
├──────────────────────────┬──────────────────────────────────────────┤
│    Capital Reflex System │       Operations Command Center          │
│                          │                                          │
│  ┌────────────────────┐  │  ┌────────────────────┐  ┌───────────┐  │
│  │   Pulse Agent      │  │  │  Acquisition Agent │  │  Advocacy │  │
│  │   (Health Monitor) │  │  └────────────────────┘  │  Agent    │  │
│  └────────────────────┘  │  ┌────────────────────┐  └───────────┘  │
│  ┌────────────────────┐  │  │  Conversion Agent  │                  │
│  │   Oracle Agent     │  │  └────────────────────┘  ┌───────────┐  │
│  │   (Predictions)    │  │  ┌────────────────────┐  │  Harmony  │  │
│  └────────────────────┘  │  │  Retention Agent   │  │  Agent    │  │
│  ┌────────────────────┐  │  └────────────────────┘  └───────────┘  │
│  │   Sniper Agent     │  │  ┌────────────────────┐                  │
│  │   (Optimizations)  │  │  │  Demand Prophet    │                  │
│  └────────────────────┘  │  └────────────────────┘                  │
│  ┌────────────────────┐  │  ┌────────────────────┐  ┌───────────┐  │
│  │  Conductor Agent   │  │  │  Logistics Agent   │  │  Support  │  │
│  │  (Orchestration)   │  │  └────────────────────┘  │  Reflex   │  │
│  └────────────────────┘  │                          └───────────┘  │
├──────────────────────────┴──────────────────────────────────────────┤
│                      Shared Infrastructure                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────┐ ┌──────┐      │
│  │ Approval │ │  Agent   │ │  Activity    │ │RBAC│ │Slack │      │
│  │  Queue   │ │   Log    │ │  History     │ │    │ │      │      │
│  └──────────┘ └──────────┘ └──────────────┘ └────┘ └──────┘      │
│                                                              [Presence] │
└─────────────────────────────────────────────────────────────────────┘
```

### Finance Agents

| Agent | Function |
|-------|----------|
| **Pulse Agent** | Monitors real-time revenue health, cash flow, and financial vital signs across all channels |
| **Oracle Agent** | Predicts future financial outcomes using historical data, trend analysis, and forecasting models |
| **Sniper Agent** | Identifies and proposes cost optimizations, pricing adjustments, and margin improvements |
| **Conductor Agent** | Orchestrates capital allocation decisions across channels and campaigns based on agent recommendations |

### Operations Agents

| Agent | Function |
|-------|----------|
| **Acquisition Agent** | Manages customer acquisition strategies, campaign performance, and top-of-funnel optimization |
| **Conversion Agent** | Optimizes conversion funnels, A/B testing, and checkout flow improvements |
| **Retention Agent** | Monitors churn signals, proposes retention campaigns, and manages customer lifecycle engagement |
| **Demand Prophet** | Forecasts product demand using historical trends, seasonality, and market signals |
| **Logistics Conductor** | Orchestrates inventory management, fulfillment routing, and supply chain coordination |
| **Support Reflex** | Automates customer support triage, escalation, and response generation |
| **Advocacy Agent** | Manages customer advocacy, reviews, referrals, and brand ambassador programs |
| **Harmony Agent** | Ensures cross-agent coherence and resolves conflicts between operational strategies |

## Features

- **Multi-Agent Architecture** — Specialized AI agents for finance and operations, each with distinct roles and capabilities
- **Human-in-the-Loop Approval** — All agent actions require explicit human authorization before execution
- **Real-Time Dashboards** — Live visibility into agent activity, metrics, and system health via Supabase Realtime
- **Presence System** — Track who is online and viewing which workspace, enabling collaborative decision-making
- **Role-Based Access Control (RBAC)** — Granular permissions for different team roles and access levels
- **Configurable Thresholds** — Set custom trigger thresholds for agent alerts, actions, and escalation rules
- **Audit Trail** — Complete activity history and agent decision logs for compliance and review
- **Slack Integration** — Push notifications and summaries directly to your team's Slack channels
- **Operating Modes** — Switch between manual, semi-auto, and fully autonomous operation modes
- **Responsive Design** — Fully responsive interface built with Tailwind CSS 4, optimized for all screen sizes

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database & Realtime | Supabase (PostgreSQL, Realtime, Presence) |
| Styling | Tailwind CSS 4 |
| AI Agents | Custom multi-agent orchestration |
| Notifications | Slack Webhooks |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account and project
- OpenAI API key (or compatible LLM provider)

### Installation

```bash
git clone https://github.com/Cubiczan/Metabocommand.git
cd Metabocommand
npm install
```

### Environment Setup

```bash
cp .env.example .env.local
```

Configure the following environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
Metabocommand/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── finance/            # Capital Reflex System workspace
│   │   └── operations/         # Operations Command Center workspace
│   ├── components/             # Shared UI components
│   ├── lib/
│   │   ├── agents/             # AI agent definitions & logic
│   │   │   ├── finance/        # Finance agent implementations
│   │   │   └── operations/     # Operations agent implementations
│   │   ├── supabase/           # Supabase client & Realtime setup
│   │   └── utils/              # Shared utilities
│   ├── hooks/                  # Custom React hooks
│   └── types/                  # TypeScript type definitions
├── supabase/                   # Supabase migrations & config
├── public/                     # Static assets
└── package.json
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Author

**Cubiczan** — [github.com/Cubiczan](https://github.com/Cubiczan)
