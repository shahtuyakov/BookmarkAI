# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Overview
BookmarkAI is a social media content capture and enrichment platform that captures content from social media platforms (TikTok, Reddit, X/Twitter), enriches it with AI-powered summaries and transcripts, and resurfaces items through search and digests.

## Technology Stack
- **Backend**: NestJS (TypeScript) with Fastify adapter, PostgreSQL 15 with pgvector, Redis/BullMQ
- **Mobile**: React Native 0.79 with TypeScript
- **Python Services**: ML/AI services for transcription, summarization, and embeddings
- **Infrastructure**: Docker Compose (local), AWS CDK for production deployment

## Architecture Patterns
- **Architecture Decision Records (ADRs)**:
   - contains the ADRs for the project `docs/architecture/decisions/`
   - contains the implementation notes for the ADRs `docs/context/tasks/`
   - contains the memory for the ADRs `docs/memory/`


## Essential Commands
   - contains the essential commands for the project `docs/project_commads_upd.md`


## Core Services Structure
```
BookmarkAI/
  ├── apps/api/                    # API specifications
  ├── packages/                    # Monorepo packages
  │   ├── api-gateway/            # NestJS backend (main API)
  │   ├── mobile/bookmarkaimobile/# React Native app
  │   ├── sdk/                    # Shared TypeScript SDK
  │   ├── extension/              # Browser extension
  │   └── orchestrator/           # Service orchestration
  ├── python/                     # ML/AI services
  │   ├── caption-service/        # Image captioning
  │   ├── llm-service/           # LLM integration
  │   ├── vector-service/        # Embeddings
  │   └── whisper-service/       # Transcription
  ├── infrastructure/            # AWS CDK definitions
  ├── docker/                    # Docker & monitoring setup
  ├── docs/                      # Documentation & ADRs
  └── scripts/ 
```

## Code Style and Structure
  - Write concise, technical code with accurate examples.
  - Use functional and declarative programming patterns; avoid classes.
  - Prefer iteration and modularization over code duplication.
  - Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
  - Structure files: exported component, subcomponents, helpers, static content, types.

## Tool Usage
   You run in enviroment where ast-grep (`sg`) is installed. When you search requires syntax-aware or structual matching, default to `sg --lang <language> <query>`. And AVOID falling back to text-only tools like `rg` or `grep` unless you are sure that the query is not syntax-aware or structual.

## RESPONSE FORMAT
  - **Utilize the Chain-of-Thought (CoT) method to reason and respond, explaining your thought process step by step.**
  - Conduct reasoning, thinking, analizing the neccecary context and the codebase to answer the question.
  - When uncertain about scope, pause and ask clarifying questions
  - The reply should include:
    1. **Step-by-Step Plan**: Describe the implementation process with detailed pseudocode or step-by-step explanations, showcasing your thought process.
    2. **Code Implementation**: Provide correct, up-to-date, error-free, fully functional, runnable, secure, and efficient code. The code should:
       - Include all necessary imports and properly name key components.
       - Fully implement all requested features, leaving no to-dos, placeholders, or omissions.
    3. **Concise Response**: Minimize unnecessary verbosity, focusing only on essential information.
  - If a correct answer may not exist, please point it out. If you do not know the answer, please honestly inform me rather than guessing.
  - Keep answers concise and direct, minimizing unnecessary wording.
  - Emphasize code readability over performance optimization.
  - Maintain a professional and supportive tone, ensuring clarity of content.
