// import cron from "node-cron";
import axios from "axios";
import { eq, isNotNull, inArray, and, between } from "drizzle-orm";
import { codeforces, leetcode, users } from "../db/schema.js";
import db from "../utils/db.js";
import { sendMulticastNotification } from "../services/fcmService.js";

// Schedule: 12:01 AM daily

export const updateProfile = async () => {
    // 1. Fetch Users (Correct Drizzle Syntax)
    const leetcode_users = await db
        .select({ id: users.id, handle: users.leetcode_user })
        .from(users)
        .where(isNotNull(users.leetcode_user));

    const codeforces_users = await db
        .select({ id: users.id, handle: users.codeforces_user })
        .from(users)
        .where(isNotNull(users.codeforces_user));

    // ==========================================
    // 2. UPDATE LEETCODE (Sequential with Delay)
    // ==========================================
    console.log(`Updating ${leetcode_users.length} LeetCode profiles...`);

    for (const user of leetcode_users) {
        try {
            const response = await fetch(
                `https://alfa-leetcode-api.onrender.com/userProfile/${user.handle}`
            );
            const data = await response.json();

            if (data && data.totalSolved) {
                await db
                    .update(leetcode)
                    .set({
                        total_problems_solved: data.totalSolved,
                        easy_problems_solved: data.easySolved,
                        medium_problems_solved: data.mediumSolved,
                        hard_problems_solved: data.hardSolved,
                        ranking: data.ranking,
                        // Ensure calendar/recent are stored as JSON if your schema allows
                        calendar: data.submissionCalendar,
                        recent_submission: data.recentSubmissions,
                    })
                    .where(eq(leetcode.user_id, user.id));
            }
            // ⚠️ Vital: Small delay to prevent rate-limiting from the free API
            await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
            console.error(
                `Failed to update LeetCode for ${user.handle}:`,
                err.message
            );
        }
    }

    // ==========================================
    // 3. UPDATE CODEFORCES (Batch Optimized)
    // ==========================================
    console.log(`Updating ${codeforces_users.length} Codeforces profiles...`);

    if (codeforces_users.length > 0) {
        try {
            // A. Batch Fetch User Info (Much faster than 1-by-1)
            const handles = codeforces_users.map((u) => u.handle).join(";");
            const infoResponse = await axios.get(
                `https://codeforces.com/api/user.info?handles=${handles}`
            );

            const userInfoMap = new Map(
                infoResponse.data.result.map((u) => [u.handle, u])
            );

            // B. Update Database
            for (const user of codeforces_users) {
                const infoData = userInfoMap.get(user.handle);

                // Note: Rating history API does not support batching, so we fetch it individually
                // Only fetch if necessary to save API calls
                let ratingData = [];
                try {
                    // console.log(user.handle);
                    // console.log(infoData);
                    // console.log("user", user);
                    const ratingResponse = await axios.get(
                        `https://codeforces.com/api/user.rating?handle=${user.handle}`
                    );
                    ratingData = ratingResponse.data.result;
                } catch (e) {
                    console.error(
                        `Could not fetch rating history for ${user.handle}`
                    );
                }

                if (infoData) {
                    await db
                        .update(codeforces)
                        .set({
                            rating: infoData.rating || 0,
                            max_rating: infoData.maxRating || 0,
                            rank: infoData.rank || "unrated",
                            max_rank: infoData.maxRank || "unrated",
                            contests: JSON.stringify(ratingData), // Store as JSON
                        })
                        .where(eq(codeforces.user_id, user.id));
                }

                // Throttle slightly to be nice to Codeforces API
                await new Promise((r) => setTimeout(r, 500));
            }
        } catch (err) {
            console.error("Codeforces Batch Update Failed:", err.message);
        }
    }
};

export const checkUpcomingContests = async () => {
    const [cfResponse, lcResponse] = await Promise.all([
        axios.get("https://codeforces.com/api/contest.list?gym=false"),
        await axios.post(
            "https://leetcode.com/graphql",
            {
                query: `
      query upcomingContests {
        topTwoContests {
          title
          titleSlug
          startTime
          duration
        }
      }
    `,
            },
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "gzip,deflate,compress",
                },
                timeout: 10000,
            }
        ),
    ]);

    // Parse Data (Simplified for brevity)
    const cfContests = cfResponse.data.result
        .filter((c) => c.phase === "BEFORE")
        .map((c) => ({
            platform: "Codeforces",
            id: c.id,
            title: c.name,
            startTime: c.startTimeSeconds * 1000,
        }));

    const lcContests = (lcResponse.data.data.topTwoContests || []).map((c) => ({
        platform: "LeetCode",
        id: c.titleSlug,
        title: c.title,
        startTime: c.startTime * 1000,
    }));

    const allContests = [...lcContests, ...cfContests];

    // ====================================================
    // 2. THE LOGIC FIX: Define a Strict Time Window
    // ====================================================
    // We want to notify if the contest starts between 25 and 35 minutes from now.
    // This assumes your cron job runs every 5 or 10 minutes.
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    const windowBuffer = 15 * 60 * 1000;

    const targetContests = allContests.filter((contest) => {
        const timeUntilStart = contest.startTime - now;
        // Check if time until start is between 25 and 35 minutes
        return (
            timeUntilStart >= thirtyMinutes - windowBuffer &&
            timeUntilStart <= thirtyMinutes + windowBuffer
        );
    });

    if (targetContests.length === 0) return;

    // ====================================================
    // 3. FETCH USERS (Fixed Drizzle Syntax)
    // ====================================================
    const subscribedUsers = await db
        .select({ token: users.fcm_token })
        .from(users)
        .where(
            and(
                // 🟢 FIX: Use 'and()' helper
                isNotNull(users.fcm_token),
                eq(users.contest_notifications, 1)
            )
        );

    if (subscribedUsers.length === 0) return;

    // Collect all tokens into a clean array
    const tokens = subscribedUsers.map((u) => u.token);

    // ====================================================
    // 4. SEND NOTIFICATIONS (Batch Optimized)
    // ====================================================
    // Don't loop 1-by-1. Use Multicast to send to 500 users at once.

    for (const contest of targetContests) {
        try {
            const response = await sendMulticastNotification(
                tokens,
                `Upcoming Contest: ${contest.title}`,
                `The ${contest.platform} contest starts in 30 minutes! Good luck!`
            );
            console.log(
                `✅ Sent ${response.successCount} notifications for ${contest.title}`
            );
        } catch (error) {
            console.error("Multicast Error:", error);
        }
    }
};

export const dailyProblem = async () => {
    // 1. Calculate the Window
    const now = new Date();
    // Assuming cron runs every 30 mins, we check strictly for that block
    // e.g., if now is 12:00, we look for users scheduled 12:00-12:29
    const currentHours = now.getHours().toString().padStart(2, "0");
    const currentMinutes = now.getMinutes();

    // Round down to nearest 30 min block (00 or 30) to align with cron
    // If cron runs at 12:05, we treat it as the 12:00 batch
    const blockMinute = currentMinutes < 30 ? "00" : "30";

    const startTime = `${currentHours}:${blockMinute}:00`;

    // Calculate End Time (Start + 29 mins)
    // We handle the wrapping manually if needed, or just keep it simple range
    // A simpler approach for daily_time is usually strict equality or a small range

    console.log(
        `⏰ Checking daily notifications for window: ${startTime} to ${currentHours}:${
            blockMinute === "00" ? "29" : "59"
        }:59`
    );

    // 2. Query DB directly for specific time range
    // This handles the midnight wrap-around safely if you just query the exact hour/minute block
    const tokensToNotify = await db
        .select({ token: users.fcm_token })
        .from(users)
        .where(
            and(
                isNotNull(users.fcm_token),
                eq(users.daily_notifications, 1),
                // Only fetch users whose daily_time matches the current 30-min block
                // Logic: daily_time >= '12:00:00' AND daily_time <= '12:29:59'
                between(
                    users.daily_time,
                    startTime,
                    `${currentHours}:${blockMinute === "00" ? "29" : "59"}:59`
                )
            )
        );

    if (tokensToNotify.length === 0) return;

    // 3. Send Notifications (Batch)
    const tokens = tokensToNotify.map((u) => u.token);

    try {
        // Send up to 500 at a time (Firebase limit)
        // If > 500, chunk array here
        const response = await sendMulticastNotification(
            tokens,
            `Your Daily Problem is Here!`,
            `Time to solve a new challenge and boost your skills!`
        );
        console.log(
            `✅ Sent ${response.successCount} daily problem notifications`
        );
    } catch (error) {
        console.error("Multicast Error:", error);
    }
};
