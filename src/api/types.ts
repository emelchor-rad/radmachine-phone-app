export type TestType = 'simple' | 'boolean';

/** Reference and tolerance downloaded for one test on one unit. */
export type TestCriteria = {
  refValue: number;
  refType: 'numerical' | 'boolean';
  tolType: 'absolute' | 'percent' | null;
  actLow: number | null;
  tolLow: number | null;
  tolHigh: number | null;
  actHigh: number | null;
};

/** One test as stored locally after downloading a definition. */
export type TestDef = {
  slug: string;
  name: string;
  type: TestType;
  order: number;          // display order across the whole flattened list
  sublist: string | null; // null for tests at the top level of the list
  criteria?: TestCriteria;
  /** Present only while downloading; stripped before SQLite write. */
  testUrl?: string;
};

/** What the user has entered so far. */
export type DraftValue = {
  value: number | boolean | null; // null = not filled in
  comment?: string;
};

export type Draft = {
  userKey: string;        // uuid, generated when the session is created
  utcUrl: string;         // full URL of the UnitTestCollection
  workStarted: string;    // 'YYYY-MM-DD HH:mm:ss', phone local time
  workCompleted: string;
  values: Record<string, DraftValue>;
};

export type SubmittedTest =
  | { value: number | boolean; comment?: string }
  | { skipped: true };

export type SubmitPayload = {
  unit_test_collection: string;
  day: number;
  in_progress: false;
  work_started: string;
  work_completed: string;
  user_key: string;
  tests: Record<string, SubmittedTest>;
};
