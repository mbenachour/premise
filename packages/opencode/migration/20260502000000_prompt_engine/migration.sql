CREATE TABLE `prompt_track` (
  `id`               text    PRIMARY KEY NOT NULL,
  `session_id`       text    NOT NULL,
  `agent_name`       text    NOT NULL,
  `pre_snapshot`     text    NOT NULL,
  `post_snapshot`    text,
  `status`           text    NOT NULL DEFAULT 'running',
  `editable_patterns` text,
  `time_created`     integer NOT NULL,
  `time_updated`     integer NOT NULL,
  `time_started`     integer NOT NULL,
  `time_ended`       integer
);

CREATE INDEX `prompt_track_session_idx` ON `prompt_track` (`session_id`, `time_started`);
CREATE INDEX `prompt_track_status_idx`  ON `prompt_track` (`status`);

CREATE TABLE `file_change` (
  `id`          text    PRIMARY KEY NOT NULL,
  `prompt_id`   text    NOT NULL,
  `path`        text    NOT NULL,
  `status`      text    NOT NULL,
  `additions`   integer NOT NULL DEFAULT 0,
  `deletions`   integer NOT NULL DEFAULT 0,
  `patch_ref`   text    NOT NULL,
  `turn_id`     text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);

CREATE INDEX `file_change_prompt_idx` ON `file_change` (`prompt_id`);
CREATE INDEX `file_change_path_idx`   ON `file_change` (`path`, `prompt_id`);

CREATE TABLE `commit_map` (
  `commit_hash`  text    NOT NULL,
  `prompt_id`    text    NOT NULL,
  `session_id`   text    NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `time_mapped`  integer NOT NULL,
  PRIMARY KEY (`commit_hash`, `prompt_id`)
);

CREATE INDEX `commit_map_prompt_idx`  ON `commit_map` (`prompt_id`);
CREATE INDEX `commit_map_session_idx` ON `commit_map` (`session_id`);
