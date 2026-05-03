import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { SessionID, MessageID } from "@/session/schema"
import z from "zod"
import { PromptEngine } from "@/prompt-engine"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"

const PromptRecordZ = z
  .object({
    id: z.string(),
    sessionID: z.string(),
    agentName: z.string(),
    preSnapshot: z.string(),
    postSnapshot: z.string().nullable(),
    status: z.enum(["running", "completed", "interrupted"]),
    timeStarted: z.number(),
    timeEnded: z.number().nullable(),
  })
  .meta({ ref: "PromptRecord" })

const FileChangeZ = z
  .object({
    id: z.string(),
    promptID: z.string(),
    path: z.string(),
    status: z.enum(["added", "modified", "deleted"]),
    additions: z.number(),
    deletions: z.number(),
    patchRef: z.string(),
    turnID: z.string().nullable(),
  })
  .meta({ ref: "PromptFileChange" })

const FileStat = z
  .object({
    path: z.string(),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    promptCount: z.number(),
    lastModified: z.number(),
  })
  .meta({ ref: "PromptFileStat" })

export const PromptEngineRoutes = lazy(() =>
  new Hono()
    .get(
      "/session/:sessionID",
      describeRoute({
        summary: "Get prompts for session",
        description: "Retrieve all prompt records for a session, ordered by time started.",
        operationId: "promptEngine.getPromptsForSession",
        responses: {
          200: {
            description: "List of prompt records",
            content: {
              "application/json": {
                schema: resolver(PromptRecordZ.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("param", z.object({ sessionID: SessionID.zod })),
      async (c) =>
        jsonRequest("PromptEngineRoutes.getPromptsForSession", c, function* () {
          const svc = yield* PromptEngine.Service
          return yield* svc.getPromptsForSession(c.req.valid("param").sessionID)
        }),
    )
    .get(
      "/prompt/:promptID/files",
      describeRoute({
        summary: "Get file changes for prompt",
        description: "Retrieve all file changes recorded for a specific prompt run.",
        operationId: "promptEngine.getFileChangesForPrompt",
        responses: {
          200: {
            description: "List of file changes",
            content: {
              "application/json": {
                schema: resolver(FileChangeZ.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("param", z.object({ promptID: MessageID.zod })),
      async (c) =>
        jsonRequest("PromptEngineRoutes.getFileChangesForPrompt", c, function* () {
          const svc = yield* PromptEngine.Service
          return yield* svc.getFileChangesForPrompt(c.req.valid("param").promptID)
        }),
    )
    .get(
      "/session/:sessionID/file-stats",
      describeRoute({
        summary: "Get file stats for session",
        description: "Retrieve aggregated file modification stats across all prompts for a session.",
        operationId: "promptEngine.getFileStatsForSession",
        responses: {
          200: {
            description: "List of file stats",
            content: {
              "application/json": {
                schema: resolver(FileStat.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("param", z.object({ sessionID: SessionID.zod })),
      async (c) =>
        jsonRequest("PromptEngineRoutes.getFileStatsForSession", c, function* () {
          const svc = yield* PromptEngine.Service
          return yield* svc.getFileStatsForSession(c.req.valid("param").sessionID)
        }),
    ),
)
