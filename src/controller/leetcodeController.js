import axios from "axios";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import db from "../utils/db.js"; // Your DB connection
import {
    daily_problems,
    leetcode,
    leetcodeProblems,
    problems,
} from "../db/schema.js";

export const getDailyProblem = async (req, res) => {
    try {
        // 1. Calculate today's date (YYYY-MM-DD) in UTC to match LeetCode
        const today = new Date().toISOString().split("T")[0];

        // 2. Check DB for specifically TODAY'S problem
        const cachedRes = await db
            .select()
            .from(daily_problems)
            .orderBy(desc(daily_problems.date)) // 🟢 FIX: Use desc() wrapper
            .limit(1);

        // 🟢 FIX: Check if the date actually matches today
        if (cachedRes.length > 0 && cachedRes[0].date === today) {
            console.log("⚡ CACHE HIT (Database)");
            return res.json({
                status: "success",
                source: "database",
                data: cachedRes[0],
            });
        }

        console.log("🌍 CACHE MISS: Fetching from LeetCode...");

        const response = await axios.post(
            "https://leetcode.com/graphql",
            {
                query: `
                query questionOfToday {
                    activeDailyCodingChallengeQuestion {
                        date
                        link
                        question {
                            questionId
                            questionFrontendId
                            title
                            titleSlug
                            difficulty
                            content
                            exampleTestcases
                            hints
                            topicTags { name }
                        }
                    }
                }
                `,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
            }
        );

        const data = response.data.data.activeDailyCodingChallengeQuestion;

        if (!data) {
            return res.status(404).json({ message: "No daily problem found" });
        }

        // console.log(data);

        // 3. Ensure Problem exists in main 'problems' table first
        const findDb = await db
            .select()
            .from(problems)
            .where(eq(problems.slug, data.question.titleSlug));

        if (findDb.length === 0) {
            await db.insert(problems).values({
                title: data.question.title,
                slug: data.question.titleSlug,
                difficulty: data.question.difficulty,
                tags: data.question.topicTags.map((t) => t.name),
                is_paid: 0,
                // 🟢 FIX: Convert text to tsvector using SQL function
                searchVector: sql`to_tsvector('english', ${data.question.title})`,
            });
        }

        // const newdate = new Date(data.date).toISOString().split("T")[0];
        await db
            .insert(daily_problems)
            .values({
                problem_slug: data.question.titleSlug,
                question_id: parseInt(data.question.questionId),
                title: data.question.title,
                difficulty: data.question.difficulty,
                content: data.question.content,
                topic_tags: data.question.topicTags.map((t) => t.name),
                example_test_cases: data.question.exampleTestcases,
                hints: data.question.hints,
                date: data.date,
            })
            .onConflictDoNothing();

        // 5. Format Response
        const formattedProblem = {
            date: data.date,
            title: data.question.title,
            difficulty: data.question.difficulty,
            url: `https://leetcode.com${data.link}`,
            slug: data.question.titleSlug,
            tags: data.question.topicTags.map((t) => t.name),
            id: data.question.questionFrontendId,
            content: data.question.content,
            exampleTestcases: data.question.exampleTestcases,
        };
        // console.log(formattedProblem);

        res.json({
            status: "success",
            source: "leetcode",
            data: formattedProblem,
        });
    } catch (error) {
        console.error("LeetCode Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch daily problem" });
    }
};

export const getProblems = async (req, res) => {
    try {
        let { limit = 50, skip = 0, filters = {} } = req.body;

        console.log(req.body);

        const conditions = [];

        if (filters.difficulty) {
            const formattedDiff =
                filters.difficulty.charAt(0).toUpperCase() +
                filters.difficulty.slice(1).toLowerCase();
            conditions.push(eq(problems.difficulty, formattedDiff));
        }

        if (filters.searchKeywords) {
            conditions.push(
                sql`to_tsvector('english', ${problems.title}) @@ plainto_tsquery('english', ${filters.searchKeywords})`
            );
        }
        if (filters.tags?.length) {
            conditions.push(
                sql`${problems.tags} && ARRAY[${sql.join(
                    filters.tags.map((t) => sql`${t}`)
                )}]`
            );
        }

        const dbQuery = db
            .select()
            .from(problems)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(problems.id)
            .limit(limit)
            .offset(skip);

        const dbResults = await dbQuery;

        // ✅ RETURN FROM DB IF FOUND
        return res.json({
            status: "success",
            source: "db",
            total: dbResults.length,
            problems: dbResults,
        });
    } catch (error) {
        console.error("getProblems error:", error);
        return res.status(500).json({ error: "Failed to fetch problems" });
    }
};

export const getProblemDetail = async (req, res) => {
    const { slug } = req.params; // e.g., "two-sum"

    if (!slug) {
        return res.status(400).json({ error: "Problem slug is required" });
    }

    try {
        // ---------------------------------------------------------
        // 1. FAST PATH: Check Database
        // ---------------------------------------------------------
        const cachedProblem = await db
            .select()
            .from(leetcodeProblems)
            .where(eq(leetcodeProblems.problem_slug, slug))
            .limit(1);

        if (cachedProblem.length > 0) {
            console.log(`⚡ CACHE HIT: ${slug}`);

            const problem = cachedProblem[0];

            // Return DB data.
            // Note: If you stored 'hints' as a JSON string, parse it here.
            return res.json({
                status: "success",
                source: "database",
                data: {
                    ...problem,
                    hints: problem.hints,
                },
            });
        }

        // ---------------------------------------------------------
        // 2. SLOW PATH: Fetch from LeetCode
        // ---------------------------------------------------------
        console.log(`🌍 CACHE MISS: Fetching ${slug} from LeetCode...`);

        const response = await axios.post(
            "https://leetcode.com/graphql",
            {
                query: `
                query getQuestionDetail($titleSlug: String!) {
                    question(titleSlug: $titleSlug) {
                        questionId
                        title
                        difficulty
                        content
                        exampleTestcases
                        hints
                        topicTags {
                            name
                        }
                    }
                }
                `,
                variables: { titleSlug: slug },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    // User-Agent is important to avoid bot blocks
                    "User-Agent": "Mozilla/5.0 (Node.js backend)",
                },
            }
        );

        const apiData = response.data.data.question;
        // console.log(response);

        if (!apiData) {
            return res
                .status(404)
                .json({ error: "Problem not found on LeetCode" });
        }
        console.log(apiData);

        // ---------------------------------------------------------
        // 3. CACHE FILL: Save to Database
        // ---------------------------------------------------------
        const newProblem = {
            question_id: parseInt(apiData.questionId),
            problem_slug: slug,
            title: apiData.title,
            difficulty: apiData.difficulty,
            content: apiData.content,

            // Drizzle 'text().array()' handles native array automatically
            topic_tags: apiData.topicTags.map((t) => t.name),

            example_test_cases: apiData.exampleTestcases,

            // Schema has 'hints' as text, so we MUST stringify the array
            hints: apiData.hints,
        };

        // We use onConflictDoNothing to handle race conditions
        // (e.g. two users search for same new problem at same time)
        await db
            .insert(leetcodeProblems)
            .values(newProblem)
            .onConflictDoNothing()
            .returning();

        // ---------------------------------------------------------
        // 4. Return Result
        // ---------------------------------------------------------
        res.json({
            status: "success",
            source: "leetcode",
            data: {
                ...newProblem,
            },
        });
    } catch (error) {
        console.error("❌ Error in getProblemDetail:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getUserStats = async (req, res) => {
    const { userId } = req.query;
    console.log("Query Hit", userId);
    if (!userId) {
        return res.status(400).json({ error: "LeetCode username is required" });
    }
    try {
        const users = await db
            .select()
            .from(leetcode)
            .where(eq(leetcode.user_id, userId))
            .limit(1);
        if (users.length === 0) {
            return res
                .status(400)
                .json({ error: "LeetCode username not set in profile" });
        }
        const user = users[0];

        res.json({
            message: "Username fetched",
            totalSolved: user.total_problems_solved,
            easySolved: user.easy_problems_solved,
            mediumSolved: user.medium_problems_solved,
            hardSolved: user.hard_problems_solved,
            ranking: user.ranking,
            calendar: user.calendar,
            recentSubmissions: user.recent_submission,
        });
    } catch (error) {
        console.error("Stats Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch user stats" });
    }
};
