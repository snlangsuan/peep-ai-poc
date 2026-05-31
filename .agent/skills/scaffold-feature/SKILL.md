---
name: scaffold-feature
description: Scaffolds a new feature or writes code adhering to the project's strict Feature-Based Architecture and coding standards (Zod, Prisma, Hono).
---

# Scaffold Feature Skill

Use this skill when the user asks to create a new feature, endpoint, or write code in the project. This ensures that the generated code strictly follows the project's architectural guidelines and best practices.

## 🏗 Project Architecture

This project uses a **Feature-Based Architecture**. Each feature must be located in `src/features/[name]/v1/`.

### Core Layers & File Naming
Every feature must have exactly these 6 files:
1. `[name].schema.ts`: Zod schemas for validation.
2. `[name].type.ts`: TypeScript types (use `z.infer` from schemas).
3. `[name].repository.ts`: Prisma database queries.
4. `[name].service.ts`: Business logic & orchestration.
5. `[name].controller.ts`: Hono HTTP handlers.
6. `[name].openapi.ts`: API documentation (using `@hono/zod-openapi`'s `describeRoute` or similar).

## 🛠 Coding Standards

### 1. Type Safety & Zod (Crucial)
- **Strict Typing**: Always avoid `any`. Use proper interfaces or Zod-inferred types.
- **Schema Alignment**: Ensure Zod schemas in `*.schema.ts` exactly match the data returned by the service.
- **Computed Fields**: If the service adds computed fields (e.g., `children_count`), these **must** be included in the Zod schema and types, usually with `.default(0)`.
- **Optional vs Default**: Prefer `.default([])` or `.default(0)` over `.optional()` for fields that are always provided by the service (like relation counts or child arrays). This avoids "possibly undefined" errors in tests and frontend.
- **Schema Reuse**: Before defining a new schema in `*.schema.ts`, always check for existing base schemas or common schemas (e.g., `#/common/schemas/...`) that can be extended or reused. Avoid redundant field definitions.

### 2. Service & Repository Pattern
- **Return Types**: Services should return Zod-inferred types (`T...Response`).
- **Includes**: Repositories should use Prisma `include` to fetch relations or `_count` for child counts.
- **Mapping**: Services are responsible for mapping Prisma results (e.g., `_count.children`) to the public API format (e.g., `children_count`).

### 3. Workspace Isolation
- Most data belongs to a workspace.
- Always fetch the workspace by `slug` (from the URL) in the service layer first.
- Filter all repository queries by `workspace_id`.

### 4. Controller Implementation
- Use the generic signature for Hono handlers:
  ```typescript
  method = async <E, P, I>(c: Context<E, P, I>) => { ... }
  ```
- Always use `schema.parse(data)` before returning JSON to ensure runtime validation and proper type inference.

## 🧪 Testing Patterns
- **Test Tool**: Bun Test.
- **Mocks**: Use `spyOn` for repository and service methods.
- **Type Casting in Tests**: When mocking Prisma objects, use the generated types from `#/generated/prisma` or custom types from `*.type.ts`.
- **Validation**: Ensure tests check for both the data and the structure (e.g., `toHaveLength`, `toBe`).

## 📍 Path Aliases
- Use `#/common/...` for common utilities/exceptions.
- Use `#/features/...` for other feature modules.
- Use `#/generated/prisma` for Prisma types.

---
*Note: If you encounter "Property does not exist" or "Possibly undefined" errors during scaffolding, check the Zod schemas in `*.schema.ts` first. They are the source of truth for types.*
