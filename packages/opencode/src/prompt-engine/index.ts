import { Effect, Layer, Context } from "effect"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { Snapshot } from "@/snapshot"
import * as Log from "@opencode-ai/core/util/log"
import { PromptTrackTable, FileChangeTable, CommitMapTable } from "./schema.sql"
import { eq, and, inArray } from "drizzle-orm"
import type { MessageID, SessionID } from "../session/schema"

const log = Log.create({ service: "prompt-engine" })

const FILE_TOUCHING_TOOLS = new Set(["edit", "write", "apply_patch"])

export type PromptRecord = {
  id: MessageID
  sessionID: SessionID
  agentName: string
  preSnapshot: string
  postSnapshot: string | null
  status: "running" | "completed" | "interrupted"
  timeStarted: number
  timeEnded: number | null
}

export type FileChange = {
  id: string
  promptID: MessageID
  path: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
  patchRef: string
  turnID: string | null
}

export type FileStat = {
  path: string
  totalAdditions: number
  totalDeletions: number
  promptCount: number
  lastModified: number
}

export interface Interface {
  readonly preFlight: (
    promptID: MessageID,
    agentName: string,
    sessionID: SessionID,
    editablePatterns?: string[],
  ) => Effect.Effect<void>
  readonly recordToolCompletion: (
    promptID: MessageID,
    callID: string,
    toolName: string,
    filePath?: string,
  ) => Effect.Effect<void>
  readonly postFlight: (
    promptID: MessageID,
    status: "completed" | "interrupted",
  ) => Effect.Effect<void>
  readonly onCommit: (commitHash: string, sessionID: SessionID) => Effect.Effect<void>
  readonly getPromptsForSession: (sessionID: SessionID) => Effect.Effect<PromptRecord[]>
  readonly getFileChangesForPrompt: (promptID: MessageID) => Effect.Effect<FileChange[]>
  readonly getPromptsForCommit: (commitHash: string) => Effect.Effect<PromptRecord[]>
  readonly getCommitsForPrompt: (promptID: MessageID) => Effect.Effect<string[]>
  readonly getFileStatsForSession: (sessionID: SessionID) => Effect.Effect<FileStat[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PromptEngine") {}

// In-memory accumulator: promptID → [{callID, filePath}]
const pending = new Map<string, { callID: string; filePath: string }[]>()

export const layer: Layer.Layer<Service, never, Snapshot.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const snapshot = yield* Snapshot.Service

    const preFlight = (
      promptID: MessageID,
      agentName: string,
      sessionID: SessionID,
      editablePatterns?: string[],
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const preSnapshot = yield* snapshot.track()

        pending.set(promptID, [])

        Database.use((db) =>
          db
            .insert(PromptTrackTable)
            .values({
              id: promptID,
              session_id: sessionID,
              agent_name: agentName,
              pre_snapshot: preSnapshot ?? "",
              status: "running",
              editable_patterns: editablePatterns ?? null,
              time_started: Date.now(),
              time_created: Date.now(),
              time_updated: Date.now(),
            })
            .onConflictDoNothing()
            .run(),
        )

        log.info("pre-flight", { promptID, agentName, preSnapshot })
      }).pipe(Effect.catch(() => Effect.void))

    const recordToolCompletion = (
      promptID: MessageID,
      callID: string,
      toolName: string,
      filePath?: string,
    ): Effect.Effect<void> =>
      Effect.sync(() => {
        if (!FILE_TOUCHING_TOOLS.has(toolName) || !filePath) return
        const calls = pending.get(promptID)
        if (calls) calls.push({ callID, filePath })
      })

    const postFlight = (
      promptID: MessageID,
      completionStatus: "completed" | "interrupted",
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const calls = pending.get(promptID)
        pending.delete(promptID)

        const row = Database.use((db) =>
          db.select().from(PromptTrackTable).where(eq(PromptTrackTable.id, promptID)).get(),
        )
        if (!row) return

        const postSnapshot = yield* snapshot.track()
        const fileChanges: FileChange[] = []

        // Try to compute diffs if snapshot is available
        if (postSnapshot && row.pre_snapshot && row.pre_snapshot !== "") {
          const diffs = yield* snapshot
            .diffFull(row.pre_snapshot, postSnapshot)
            .pipe(Effect.orElseSucceed(() => [] as Snapshot.FileDiff[]))

          for (const diff of diffs) {
            const lastCall = calls?.findLast((c) => c.filePath.endsWith(diff.file))

            fileChanges.push({
              id: ulid(),
              promptID,
              path: diff.file,
              status: (diff.status ?? "modified") as "added" | "modified" | "deleted",
              additions: diff.additions,
              deletions: diff.deletions,
              patchRef: postSnapshot,
              turnID: lastCall?.callID ?? null,
            })
          }
        } else if (calls && calls.length > 0) {
          // Snapshot not available, but we have tool call data
          for (const call of calls) {
            fileChanges.push({
              id: ulid(),
              promptID,
              path: call.filePath,
              status: "modified" as const,
              additions: 0,
              deletions: 0,
              patchRef: postSnapshot ?? "",
              turnID: call.callID,
            })
          }
        }

        const now = Date.now()
        Database.transaction((db) => {
          if (fileChanges.length > 0) {
            db.insert(FileChangeTable)
              .values(
                fileChanges.map((fc) => ({
                  id: fc.id,
                  prompt_id: fc.promptID,
                  path: fc.path,
                  status: fc.status,
                  additions: fc.additions,
                  deletions: fc.deletions,
                  patch_ref: fc.patchRef,
                  turn_id: fc.turnID,
                  time_created: now,
                  time_updated: now,
                })),
              )
              .run()
          }

          db.update(PromptTrackTable)
            .set({
              post_snapshot: postSnapshot ?? null,
              status: completionStatus,
              time_ended: now,
              time_updated: now,
            })
            .where(eq(PromptTrackTable.id, promptID))
            .run()
        })

        log.info("post-flight", { promptID, status: completionStatus, files: fileChanges.length })
      }).pipe(Effect.catch(() => Effect.void))

    const onCommit = (commitHash: string, sessionID: SessionID): Effect.Effect<void> =>
      Effect.gen(function* () {
        const existing = new Set(
          Database.use((db) =>
            db
              .select({ prompt_id: CommitMapTable.prompt_id })
              .from(CommitMapTable)
              .where(eq(CommitMapTable.commit_hash, commitHash))
              .all()
              .map((r) => r.prompt_id),
          ),
        )

        const prompts = Database.use((db) =>
          db
            .select({ id: PromptTrackTable.id })
            .from(PromptTrackTable)
            .where(
              and(
                eq(PromptTrackTable.session_id, sessionID),
                eq(PromptTrackTable.status, "completed"),
              ),
            )
            .all()
            .filter((p) => !existing.has(p.id)),
        )

        if (prompts.length === 0) return

        const now = Date.now()
        Database.transaction((db) => {
          db.insert(CommitMapTable)
            .values(
              prompts.map((p) => ({
                commit_hash: commitHash,
                prompt_id: p.id as MessageID,
                session_id: sessionID,
                time_mapped: now,
                time_created: now,
                time_updated: now,
              })),
            )
            .onConflictDoNothing()
            .run()
        })

        log.info("commit mapped", { commitHash, promptCount: prompts.length })
      }).pipe(Effect.catch(() => Effect.void))

    const getPromptsForSession = (sessionID: SessionID): Effect.Effect<PromptRecord[]> =>
      Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(PromptTrackTable)
            .where(eq(PromptTrackTable.session_id, sessionID))
            .orderBy(PromptTrackTable.time_started)
            .all()
            .map(
              (r): PromptRecord => ({
                id: r.id,
                sessionID: r.session_id,
                agentName: r.agent_name,
                preSnapshot: r.pre_snapshot,
                postSnapshot: r.post_snapshot ?? null,
                status: r.status,
                timeStarted: r.time_started,
                timeEnded: r.time_ended ?? null,
              }),
            ),
        ),
      )

    const getFileChangesForPrompt = (promptID: MessageID): Effect.Effect<FileChange[]> =>
      Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(FileChangeTable)
            .where(eq(FileChangeTable.prompt_id, promptID))
            .all()
            .map(
              (r): FileChange => ({
                id: r.id,
                promptID: r.prompt_id,
                path: r.path,
                status: r.status,
                additions: r.additions,
                deletions: r.deletions,
                patchRef: r.patch_ref,
                turnID: r.turn_id ?? null,
              }),
            ),
        ),
      )

    const getPromptsForCommit = (commitHash: string): Effect.Effect<PromptRecord[]> =>
      Effect.sync(() => {
        const ids = Database.use((db) =>
          db
            .select({ prompt_id: CommitMapTable.prompt_id })
            .from(CommitMapTable)
            .where(eq(CommitMapTable.commit_hash, commitHash))
            .all()
            .map((l) => l.prompt_id),
        )
        if (ids.length === 0) return []
        return Database.use((db) =>
          db
            .select()
            .from(PromptTrackTable)
            .where(inArray(PromptTrackTable.id, ids))
            .all()
            .map(
              (r): PromptRecord => ({
                id: r.id,
                sessionID: r.session_id,
                agentName: r.agent_name,
                preSnapshot: r.pre_snapshot,
                postSnapshot: r.post_snapshot ?? null,
                status: r.status,
                timeStarted: r.time_started,
                timeEnded: r.time_ended ?? null,
              }),
            ),
        )
      })

    const getCommitsForPrompt = (promptID: MessageID): Effect.Effect<string[]> =>
      Effect.sync(() =>
        Database.use((db) =>
          db
            .select({ commit_hash: CommitMapTable.commit_hash })
            .from(CommitMapTable)
            .where(eq(CommitMapTable.prompt_id, promptID))
            .all()
            .map((r) => r.commit_hash),
        ),
      )

    const getFileStatsForSession = (sessionID: SessionID): Effect.Effect<FileStat[]> =>
      Effect.sync(() => {
        const promptIDs = Database.use((db) =>
          db
            .select({ id: PromptTrackTable.id })
            .from(PromptTrackTable)
            .where(eq(PromptTrackTable.session_id, sessionID))
            .all()
            .map((p) => p.id),
        )
        if (promptIDs.length === 0) return []

        const changes = Database.use((db) =>
          db
            .select()
            .from(FileChangeTable)
            .where(inArray(FileChangeTable.prompt_id, promptIDs))
            .all(),
        )

        const byPath = new Map<string, FileStat>()
        for (const c of changes) {
          const existing = byPath.get(c.path)
          if (existing) {
            existing.totalAdditions += c.additions
            existing.totalDeletions += c.deletions
            existing.promptCount++
            if (c.time_updated > existing.lastModified) existing.lastModified = c.time_updated
          } else {
            byPath.set(c.path, {
              path: c.path,
              totalAdditions: c.additions,
              totalDeletions: c.deletions,
              promptCount: 1,
              lastModified: c.time_updated,
            })
          }
        }

        return Array.from(byPath.values()).sort((a, b) => b.lastModified - a.lastModified)
      })

    return Service.of({
      preFlight,
      recordToolCompletion,
      postFlight,
      onCommit,
      getPromptsForSession,
      getFileChangesForPrompt,
      getPromptsForCommit,
      getCommitsForPrompt,
      getFileStatsForSession,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Snapshot.defaultLayer))

export * as PromptEngine from "./index"
