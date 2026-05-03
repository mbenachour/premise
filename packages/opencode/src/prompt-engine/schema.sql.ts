import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import { Timestamps } from "../storage/schema.sql"
import type { MessageID } from "../session/schema"
import type { SessionID } from "../session/schema"

export const PromptTrackTable = sqliteTable(
  "prompt_track",
  {
    id: text().$type<MessageID>().primaryKey(),
    session_id: text().$type<SessionID>().notNull(),
    agent_name: text().notNull(),
    pre_snapshot: text().notNull(),
    post_snapshot: text(),
    status: text()
      .$type<"running" | "completed" | "interrupted">()
      .notNull()
      .default("running"),
    editable_patterns: text({ mode: "json" }).$type<string[]>(),
    ...Timestamps,
    time_started: integer().notNull(),
    time_ended: integer(),
  },
  (table) => [
    index("prompt_track_session_idx").on(table.session_id, table.time_started),
    index("prompt_track_status_idx").on(table.status),
  ],
)

export const FileChangeTable = sqliteTable(
  "file_change",
  {
    id: text().primaryKey(),
    prompt_id: text().$type<MessageID>().notNull(),
    path: text().notNull(),
    status: text().$type<"added" | "modified" | "deleted">().notNull(),
    additions: integer().notNull().default(0),
    deletions: integer().notNull().default(0),
    patch_ref: text().notNull(),
    turn_id: text(),
    ...Timestamps,
  },
  (table) => [
    index("file_change_prompt_idx").on(table.prompt_id),
    index("file_change_path_idx").on(table.path, table.prompt_id),
  ],
)

export const CommitMapTable = sqliteTable(
  "commit_map",
  {
    commit_hash: text().notNull(),
    prompt_id: text().$type<MessageID>().notNull(),
    session_id: text().$type<SessionID>().notNull(),
    ...Timestamps,
    time_mapped: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commit_hash, table.prompt_id] }),
    index("commit_map_prompt_idx").on(table.prompt_id),
    index("commit_map_session_idx").on(table.session_id),
  ],
)
