import type { Locator, Page } from "playwright-core";

/**
 * The part of the `dms-control` journey API the skill uses. The real classes live in the
 * `@antelopejs/dms` package a run installs into the playground, which the repository's checks
 * lint without, so the skill types its context from this file.
 */

/** What a check records. */
export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** What `dms-control` locates a control by. */
export interface Target {
  role: string;
  name?: string | RegExp;
  exact?: boolean;
  nth?: number;
  within?: { role: string; name?: string | RegExp; exact?: boolean };
}

/** What a browser action leaves behind. */
export interface Outcome {
  ok: boolean;
  url: string;
  error: string | null;
  aria: string;
  folder: string;
}

/** The outcome of a sign-in, which a journey without that account answers without a snapshot. */
export type SignInOutcome = Outcome | { ok: boolean; url: string; error: string };

/** A response of the backend the journey called. */
export interface ApiAnswer {
  status: number | null;
  body: unknown;
  error: string | null;
  folder?: string;
}

/** One browser tab of a journey. */
export interface Tab {
  page: Page;
  label: string;
  goto(path?: string): Promise<Outcome>;
  reload(): Promise<Outcome>;
  click(target: Target): Promise<Outcome>;
  fill(target: Target, value: string): Promise<Outcome>;
  select(target: Target, value: string): Promise<Outcome>;
  check(target: Target): Promise<Outcome>;
  press(key: string, target?: Target): Promise<Outcome>;
  snapshot(label: string): Promise<Outcome>;
  signIn(account: string): Promise<SignInOutcome>;
  locator(target: Target): Locator;
  visible(target: Target, options?: { timeoutMs?: number; hidden?: boolean }): Promise<Check>;
  enabled(target: Target, options?: { timeoutMs?: number; disabled?: boolean }): Promise<Check>;
  shows(pattern: RegExp, options?: { timeoutMs?: number; not?: boolean }): Promise<Check>;
  at(pattern: RegExp, options?: { timeoutMs?: number }): Promise<Check>;
  count(target: Target, expected: number): Promise<Check>;
  value(target: Target): Promise<string>;
  close(): Promise<void>;
}

/** The run a journey belongs to. */
export interface RunState {
  dir: string;
  apiUrl: string;
  webUrl: string;
  repo: string | null;
  moduleRoot: string;
  playground: string;
  runPlayground?: string;
  extraEnv: Record<string, string>;
  accounts: Record<string, { email: string; password: string; userId?: string | null }>;
}

/** What a journey drives the run through. */
export interface Ctx {
  state: RunState;
  step(label: string): string;
  record(folder: string, checks: Check[], options?: { critical?: boolean }): boolean;
  verify(label: string, checks: (Check | Promise<Check>)[], options?: { critical?: boolean }): Promise<boolean>;
  tab(account?: string, label?: string): Promise<Tab>;
  api(
    label: string,
    request: { method: string; path: string; body?: unknown; as?: string; token?: string },
  ): Promise<ApiAnswer>;
  addAccount(name: string, credentials: { email: string; password: string; userId?: string | null }): void;
  password(): string;
  restartBackend(): Promise<void>;
}
