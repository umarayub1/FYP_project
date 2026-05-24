# Synapse

AI-powered, context-aware study platform. Final Year Project.

Synapse turns study materials into an active workspace: upload PDFs and notes, generate flashcards, run Feynman-style explanation sessions with an AI coach, track weak points, and stay on top of deadlines — all grounded in your own documents via retrieval-augmented generation.

## Stack

- **Frontend:** Next.js 15 (App Router), React, TypeScript, Tailwind
- **Backend:** Node.js gateway + Python core service (FastAPI)
- **AI:** Claude (Anthropic) and Ollama (local) via a provider-agnostic adapter; LlamaIndex + LangGraph for RAG and agent orchestration
- **Data:** MongoDB (app data), ChromaDB (vector store)
- **Infra:** Docker Compose

## Features

- **Study sets** — group PDFs and notes under a single topic with shared context
- **Flashcards** — auto-generated from documents, with leech detection and cram mode
- **Feynman mode** — explain a concept; the AI coach scores your explanation and asks Socratic follow-ups
- **Coach RAG** — chat grounded in your documents with citations and relevance gating
- **Weak points** — surface what you keep getting wrong
- **Deadlines** — top-level deadline manager with smart prioritisation
- **Universal staging** — select text anywhere (notes, PDFs, coach chat) and commit it into a note, flashcard, or follow-up question

## Getting Started

```bash
# 1. clone
git clone https://github.com/sm-hsn/synapse-fyp.git
cd synapse-fyp

# 2. configure env
cp .env.example .env
# edit .env and fill in API keys and DB URIs

# 3. install and run
npm install
docker compose up -d           # mongodb + chromadb
npm run dev                    # gateway + core-service + frontend
```

Frontend runs on `http://localhost:3000`.

## Repository Layout

```
apps/
  frontend/       Next.js app
  gateway/        Node.js BFF / API gateway
  core-service/   Python FastAPI service (RAG, embeddings, workers)
packages/         Shared TS packages
services/         Background workers
docs/             Architecture and developer docs
```

## Status

Active development. This is the public mirror of the FYP codebase.
