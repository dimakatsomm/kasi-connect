/**
 * KasiConnect GitHub Issues Backlog — Type Definitions
 *
 * These types define the structure of every item in the backlog.
 * They are used both by the backlog data file and by the
 * create-issues script that posts them to GitHub.
 */

/** The three label tiers used across the backlog */
export type IssueLabel = 'epic' | 'feature' | 'task';

/** Priority order for building in dependency-safe sequence */
export type Priority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** A single acceptance criterion (the "done" definition for a task) */
export interface AcceptanceCriterion {
  readonly given: string;
  readonly when: string;
  readonly then: string;
}

/** Base fields shared by every backlog item */
export interface BacklogItemBase {
  /** Unique reference key used for dependency linking, e.g. "EP-01" */
  readonly key: string;
  /** GitHub issue title */
  readonly title: string;
  /** Full markdown body for the GitHub issue */
  readonly body: string;
  /** Single label tier */
  readonly label: IssueLabel;
  /** Build priority — lower is earlier */
  readonly priority: Priority;
}

/** An Epic — a major system component */
export interface Epic extends BacklogItemBase {
  readonly label: 'epic';
  /** Short description of the epic's scope */
  readonly description: string;
}

/** A Feature — a specific capability within an epic */
export interface Feature extends BacklogItemBase {
  readonly label: 'feature';
  /** Key of the parent Epic */
  readonly epicKey: string;
  /** Keys of Features this Feature depends on (must be built first) */
  readonly dependsOn: readonly string[];
}

/** A Task — a concrete implementation step within a feature */
export interface Task extends BacklogItemBase {
  readonly label: 'task';
  /** Key of the parent Feature */
  readonly featureKey: string;
  /** Structured acceptance criteria */
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  /** Keys of Tasks (or Features) this Task depends on */
  readonly dependsOn: readonly string[];
}

/** Union of all backlog item types */
export type BacklogItem = Epic | Feature | Task;

/** The full backlog, grouped for convenience */
export interface Backlog {
  readonly epics: readonly Epic[];
  readonly features: readonly Feature[];
  readonly tasks: readonly Task[];
}
