# Omni Intelligence Studio - Backend Coding Standards

This document defines the mandatory architectural patterns and coding standards for the Omni Intelligence Studio API. All AI agents and developers must strictly adhere to these rules.

## 1. Feature Module Structure
Every feature module located in `src/features/[name]/v1/` must consist of exactly these 6 core files:

| File Name | Responsibility |
|-----------|----------------|
| `*.schema.ts` | Zod schemas for request/response validation. |
| `*.type.ts` | TypeScript type definitions (using `z.infer` from schemas). |
| `*.repository.ts` | Direct database interactions via Prisma. |
| `*.service.ts` | Business logic, orchestration, and error handling. |
| `*.controller.ts` | HTTP request handling via Hono. |
| `*.openapi.ts` | API documentation using `hono-openapi`. |

## 2. Coding Patterns

### 2.1 Controller Pattern
Controllers must use Hono's `Context` with specific generic types for type safety:
- **Generic Signature**: `async <E, P, I>(c: Context<E, P, I>) => { ... }`
- **I (Input)**: Must combine `ParamInputSchema`, `QueryInputSchema`, and `JsonInputSchema` as needed.
- **Return Type**: Always specify the response type in `c.json<TResponse>(...)`.

Example:
```typescript
getById = async <
  E extends { Bindings: Bindings; Variables: Variables },
  P extends string,
  I extends ParamInputSchema<TIdParam>,
>(c: Context<E, P, I>) => {
  const { id } = c.req.valid('param');
  const data = await this.service.getById(id);
  return c.json<TResponse>(schema.parse(data));
}
```

### 2.2 OpenAPI Pattern
API documentation must use `hono-openapi` conventions:
- Use `describeRoute` (NOT `createRoute`).
- Use `resolver(zodSchema)` for request and response schemas.
- Assign tags using the `ERouteTag` enum.
- Use `HTTP_ERROR_DESCRIPTIONS` and `HTTP_ERROR_EXAMPLE` for error responses.
- Always include `security: [{ BearerAuth: [] }]`.

### 2.3 Type & Schema Separation
- **Schemas**: Defined in `*.schema.ts` using Zod.
- **Types**: Defined in `*.type.ts` using `z.infer<typeof schema>`.
- **Note**: Manual type definitions should only be used when `z.infer` is insufficient.

## 3. Architecture Rules
- **One-Way Flow**: Controller -> Service -> Repository.
- **Workspace Scoping**: Every query involving workspace data must filter by `workspace_id` (usually derived from the `slug` in the URL).
- **Path Aliases**: Use absolute path aliases (e.g., `#/common/...`, `#/features/...`) for all internal imports.
- **Error Handling**: Throw specialized exceptions from `src/common/exceptions/` in services; let the global error handler manage the HTTP response.

---
*Last Updated: 2026-04-25*
