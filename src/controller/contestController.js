import axios from "axios";

export const getUpcomingContests = async (req, res) => {
    try {
        // Run both requests in parallel for speed
        const [cfResponse, lcResponse] = await Promise.all([
            axios.get("https://codeforces.com/api/contest.list?gym=false"),
            axios.post("https://leetcode.com/graphql", {
                query: `
                    query upcomingContests {
                        topTwoContests {
                            title
                            titleSlug
                            startTime
                            duration
                            originStartTime
                            isVirtual
                        }
                    }
                `,
            }),
        ]);
        const cfContests = cfResponse.data.result
            .filter((c) => c.phase === "BEFORE")
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
            .map((c) => ({
                platform: "Codeforces",
                id: c.id,
                title: c.name,
                startTime: c.startTimeSeconds * 1000, // Convert s to ms
                duration: c.durationSeconds, // in seconds
            }));

        // --- PROCESS LEETCODE DATA ---
        const lcData = lcResponse.data.data.topTwoContests || [];
        const lcContests = lcData.map((c) => ({
            platform: "LeetCode",
            id: c.titleSlug,
            title: c.title,
            startTime: c.startTime * 1000, // Convert s to ms
            duration: c.duration, // in seconds
        }));

        // Combine and Sort Final List
        const allContests = [...lcContests, ...cfContests].sort(
            (a, b) => a.startTime - b.startTime
        );

        res.json({
            status: "success",
            count: allContests.length,
            data: allContests,
        });
    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch contests" });
    }
};
