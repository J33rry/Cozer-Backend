import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import db from "../utils/db.js";
import {
    codeforces,
    codeforcesProblems,
    problems_codeforces,
} from "../db/schema.js";
import { sql, and, ilike, eq } from "drizzle-orm";

export const getProblemDetail = async (req, res) => {
    const { contestId, index } = req.body;

    if (!contestId || !index) {
        return res.status(400).json({ error: "Missing contestId or index" });
    }

    const problemId = `${contestId}${index}`;

    // =================================================
    // 1️⃣ CACHE CHECK
    // =================================================
    try {
        const cachedProblem = await db
            .select()
            .from(codeforcesProblems)
            .where(eq(codeforcesProblems.problem_id, problemId))
            .limit(1);

        if (cachedProblem.length > 0) {
            const problem = cachedProblem[0];
            console.log(`⚡ CACHE HIT: ${problemId}`);
            return res.json({
                status: "success",
                source: "db",
                data: {
                    id: problem.problem_id,
                    title: problem.title,
                    timeLimit: problem.time_limit,
                    memoryLimit: problem.memory_limit,
                    html: problem.html,
                },
            });
        }
    } catch (dbError) {
        console.error("Database Error:", dbError);
    }

    // =================================================
    // 2️⃣ LOCAL BROWSER SCRAPING
    // =================================================
    console.log(
        `🌍 CACHE MISS: Fetching ${contestId}${index} via Local Browser...`
    );

    const url = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
    let browser;

    try {
        // ✅ CHANGE: Use .launch() for local browser instead of .connect()
        // Note: For Azure/Linux, you still need specific args (see Docker setup)
        const browser = await puppeteer.launch({
            // 'new' is the new headless mode, much faster/stable
            headless: "new",
            args: [
                "--no-sandbox", // ⚠️ REQUIRED for Docker/Azure
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage", // Prevents crashing on low memory
                "--disable-gpu",
            ],
            // If using the Dockerfile below, Chrome is installed here:
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        });

        const page = await browser.newPage();

        // Block images/fonts to speed up scraping
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (["image", "stylesheet", "font"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        // Navigate
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        try {
            await page.waitForSelector(".problem-statement", {
                timeout: 5000, // Reduced timeout since we are local
            });
        } catch (e) {
            console.log(
                "Selector wait timeout, proceeding to check content..."
            );
        }

        const pageContent = await page.content();

        // =================================================
        // 3️⃣ PARSING (Cheerio)
        // =================================================
        const $ = cheerio.load(pageContent);
        const problemStatement = $(".problem-statement");

        if (!problemStatement.length) {
            const pageTitle = $("title").text();
            console.error(`❌ Scraping Failed. Title: ${pageTitle}`);
            return res
                .status(404)
                .json({ error: "Problem not found or blocked." });
        }

        const title = problemStatement.find(".header .title").text().trim();
        const timeLimit = problemStatement
            .find(".header .time-limit")
            .text()
            .replace("time limit per test", "")
            .trim();
        const memoryLimit = problemStatement
            .find(".header .memory-limit")
            .text()
            .replace("memory limit per test", "")
            .trim();

        // Fix Images (Make relative URLs absolute)
        problemStatement.find("img").each((_, el) => {
            const src = $(el).attr("src");
            if (src && src.startsWith("/")) {
                $(el).attr("src", `https://codeforces.com${src}`);
            }
        });

        // Remove header from the body content since we extracted metadata separately
        problemStatement.find(".header").remove();
        const cleanHtml = problemStatement.html();

        // =================================================
        // 4️⃣ SAVE TO DB
        // =================================================
        try {
            await db
                .insert(codeforcesProblems)
                .values({
                    problem_id: problemId,
                    title: title,
                    time_limit: timeLimit,
                    memory_limit: memoryLimit,
                    html: cleanHtml,
                })
                .onConflictDoNothing();
        } catch (saveError) {
            console.error("Save to DB Error:", saveError.message);
            // Proceed to return response even if save fails
        }

        return res.json({
            status: "success",
            source: "scrape",
            data: {
                id: problemId,
                title,
                timeLimit,
                memoryLimit,
                html: cleanHtml,
            },
        });
    } catch (error) {
        console.error("Puppeteer Launch Error:", error.message);
        return res
            .status(500)
            .json({ error: "Failed to scrape problem details" });
    } finally {
        if (browser) await browser.close();
    }
};

export const getProblems = async (req, res) => {
    // Safety check: ensure filters defaults to {} if missing
    const { skip = 0, limit = 50, filters = {} } = req.body;

    const conditions = [];
    try {
        // 1. Full Text Search
        if (filters.searchKeywords) {
            conditions.push(
                sql`${problems_codeforces.searchVector} @@ plainto_tsquery('english', ${filters.searchKeywords})`
            );
        }

        // 2. Tags Filtering
        if (filters.tags?.length > 0) {
            // ✅ FIX: Add sql`, ` as the second argument to join with commas
            const tagList = sql.join(
                filters.tags.map((t) => sql`${t}`),
                sql`, `
            );

            conditions.push(
                sql`${problems_codeforces.tags} && ARRAY[${tagList}]`
            );
        }

        const dbQuery = db
            .select()
            .from(problems_codeforces)
            // ✅ FIX: Clean check for conditions length
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(problems_codeforces.id)
            .limit(limit)
            .offset(skip);

        const dbResults = await dbQuery;

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

export const getUserStats = async (req, res) => {
    const { userId } = req.query;
    console.log("Query Hit", userId);
    if (!userId) {
        return res
            .status(400)
            .json({ error: "codeforces username is required" });
    }
    try {
        const users = await db
            .select()
            .from(codeforces)
            .where(eq(codeforces.user_id, userId))
            .limit(1);
        if (users.length === 0) {
            return res
                .status(400)
                .json({ error: "Codeforces username not set in profile" });
        }
        const user = users[0];

        // console.log(users[0]);

        res.json({
            message: "Username fetched",
            id: user.id,
            rating: user.rating,
            max_rating: user.max_rating,
            rank: user.rank,
            max_rank: user.max_rank,
            contests: user.contests,
        });
    } catch (error) {
        console.error("Stats Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch user stats" });
    }
};
