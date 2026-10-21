using GamifiedLearningSystem.Domain.Entities;
namespace GamifiedLearningSystem.Domain;

public sealed class GamificationEngine(int[] thresholds)
{
    public int LevelFor(int xp) => Math.Max(1, thresholds.Count(t => xp >= t));
    public AttemptPlan Evaluate(GameSnapshot s, string answer, string sessionId, string requestId, DateOnly today)
    {
        var correct = string.Equals(answer.Trim(), s.Task.CorrectAnswer, StringComparison.OrdinalIgnoreCase) && s.ElapsedSeconds <= s.Task.TimeLimit;
        var fresh = correct && !s.AlreadyCompleted;
        var date = today.ToString("yyyy-MM-dd");
        var current = s.Student.CurrentStreak;
        if (fresh && s.LastDate != date)
            current = s.LastDate == today.AddDays(-1).ToString("yyyy-MM-dd") ? current + 1 : 1;
        var longest = Math.Max(current, s.Student.LongestStreak);
        var rewards = new List<Reward>();
        if (fresh) rewards.Add(new("TASK", s.Task.Id, s.Task.XpReward + (s.AttemptCount == 0 && !s.HintUsed ? s.Task.XpReward / 2 : 0)));
        if (fresh && s.LastDate != date && current >= 3) rewards.Add(new("STREAK", date, Math.Min(current * 10, 100)));
        var goals = s.Goals.Select(g => new GoalUpdate(g.Id, Math.Min(g.Target, g.Progress + (fresh ? 1 : 0)), g.Completed || g.Progress + (fresh ? 1 : 0) >= g.Target)).ToList();
        foreach (var g in s.Goals.Where(g => !g.Completed && goals.Any(u => u.Id == g.Id && u.Completed)))
            rewards.Add(new("DAILY_GOAL", g.Id + ":" + date, g.XpReward));
        var unlocked = new List<AchievementRule>();
        foreach (var a in s.Achievements.Where(a => !s.UnlockedIds.Contains(a.Id)))
        {
            var value = a.Condition switch {
                "TASKS" => s.CompletedTasks + (fresh ? 1 : 0), "STREAK" => current,
                "SPEED" => fresh && s.ElapsedSeconds <= s.Task.TimeLimit / 2 ? 1 : 0,
                "PERFECT" => fresh ? s.CorrectRun + 1 : 0, "COURSE" => fresh && s.CourseCompleted ? 1 : 0,
                "XP" => s.Student.TotalXP + rewards.Sum(r => r.Amount), "CHAMPION" => fresh && s.IsLeader ? 1 : 0,
                "GOAL" => goals.Any(g => g.Completed) ? 1 : 0, _ => 0 };
            if (fresh && value >= a.Target) { unlocked.Add(a); rewards.Add(new("ACHIEVEMENT", a.Id, a.XpReward)); }
        }
        var earned = rewards.Sum(r => r.Amount);
        var xp = s.Student.TotalXP + earned;
        return new(s.Student.Id, s.Task.Id, sessionId, requestId, s.Student.Version, answer.Trim(), correct, correct ? 100 : 0,
            s.ElapsedSeconds, s.AttemptCount + 1, earned, xp, LevelFor(xp), current, longest, date, rewards, unlocked, goals, correct ? s.Task.Explanation : "");
    }
}
