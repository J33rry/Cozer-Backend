import {
    customType,
    integer,
    jsonb,
    pgTable,
    serial,
    text,
    timestamp,
    time,
    boolean,
} from "drizzle-orm/pg-core";

const tsvector = customType({
    dataType: () => "tsvector",
});

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    display_name: text("display_name"),
    firebase_uid: text("firebase_uid").notNull().unique(),
    is_guest: integer("is_guest").notNull().default(0),
    created_at: timestamp("created_at").defaultNow(),
    email: text("email"),
    leetcode_user: text("leetcode_user"),
    codeforces_user: text("codeforces_user"),
    avatar_icon: text("avatar_icon"),
    fcm_token: text("fcm_token"),
    daily_notifications: boolean("daily_notifications").notNull().default(true),
    contest_notifications: boolean("contest_notifications")
        .notNull()
        .default(true),
    daily_time: time("daily_time").notNull().default("12:00:00"),
});

export const leetcode = pgTable("leetcode", {
    id: serial("id").primaryKey(),
    user_id: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
        .unique(),
    total_problems_solved: integer("total_problems_solved")
        .notNull()
        .default(0),
    easy_problems_solved: integer("easy_problems_solved").notNull().default(0),
    medium_problems_solved: integer("medium_problems_solved")
        .notNull()
        .default(0),
    hard_problems_solved: integer("hard_problems_solved").notNull().default(0),
    ranking: integer("ranking").notNull().default(0),
    total_questions: integer("total_questions").default(0),
    total_easy: integer("total_easy").default(0),
    total_medium: integer("total_medium").default(0),
    total_hard: integer("total_hard").default(0),
    calendar: text("calendar"),
    recent_submission: jsonb("recent_submissions"),
});

export const codeforces = pgTable("codeforces", {
    id: serial("id").primaryKey(),
    user_id: integer("user_id")
        .unique()
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull().default(0),
    max_rating: integer("max_rating").notNull().default(0),
    rank: text("rank").notNull().default("unrated"),
    max_rank: text("max_rank").notNull().default("unrated"),
    contests: jsonb("contests"),
});

export const problems = pgTable("problems", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    difficulty: text("difficulty").notNull(),
    tags: text("tags").array(),
    is_paid: integer("is_paid").notNull().default(0),
    searchVector: tsvector("search_vector"),
});

export const leetcodeProblems = pgTable("leetcode_problems", {
    id: serial("id").primaryKey(),
    question_id: integer("question_id").notNull().unique(),
    problem_slug: text("problem_slug")
        .notNull()
        .unique()
        .references(() => problems.slug, { onDelete: "cascade" }),
    title: text("title").notNull(),
    difficulty: text("difficulty").notNull(),
    content: text("content").notNull(),
    topic_tags: text("topic_tags").array(),
    example_test_cases: text("example_test_cases"),
    hints: text("hints").array(),
});

export const daily_problems = pgTable("daily_problems", {
    id: serial("id").primaryKey(),
    problem_slug: text("problem_slug")
        .notNull()
        .unique()
        .references(() => problems.slug, { onDelete: "cascade" }),
    question_id: integer("question_id").notNull(),
    title: text("title").notNull(),
    difficulty: text("difficulty").notNull(),
    content: text("content").notNull(),
    topic_tags: text("topic_tags").array(),
    example_test_cases: text("example_test_cases"),
    hints: text("hints").array(),
    date: text("date").notNull().unique(),
});

export const problems_codeforces = pgTable("problems_codeforces", {
    id: serial("id").primaryKey(),
    problem_index: text("problem_index").notNull(),
    contest_id: integer("contest_id").notNull(),
    problem_id: text("problem_id").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    tags: text("tags").array(),
    searchVector: tsvector("search_vector"),
});

export const codeforcesProblems = pgTable("codeforces_problems", {
    id: serial("id").primaryKey(),
    problem_id: text("problem_id")
        .notNull()
        .unique()
        .references(() => problems_codeforces.problem_id, {
            onDelete: "cascade",
        }),
    title: text("title").notNull(),
    time_limit: text("time_limit").notNull(),
    memory_limit: text("memory_limit").notNull(),
    html: text("html").notNull(),
});
