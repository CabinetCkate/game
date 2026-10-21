namespace GamifiedLearningSystem.Domain.Entities;

public record StudentState(string Id, int TotalXP, int Level, int CurrentStreak, int LongestStreak, int Version);
public record TaskState(string Id, string LevelId, string TopicId, string CorrectAnswer, int XpReward, int TimeLimit, string Explanation);
public record AchievementRule(string Id, string Code, string Title, string Condition, int Target, int XpReward);
public record GoalState(string Id, string Title, int Target, int XpReward, int Progress, bool Completed);
public record GameSnapshot(StudentState Student, TaskState Task, int AttemptCount, bool AlreadyCompleted, int CompletedTasks,
    int CorrectRun, bool CourseCompleted, bool IsLeader, string? LastDate, int ElapsedSeconds, bool HintUsed,
    List<AchievementRule> Achievements, List<string> UnlockedIds, List<GoalState> Goals);
public record Reward(string Source, string SourceId, int Amount);
public record GoalUpdate(string Id, int Progress, bool Completed);
public record AttemptPlan(string StudentId, string TaskId, string SessionId, string RequestId, int ExpectedVersion,
    string Answer, bool IsCorrect, int Score, int TimeSpent, int AttemptNumber, int XpEarned, int TotalXP,
    int Level, int CurrentStreak, int LongestStreak, string Date, List<Reward> Rewards,
    List<AchievementRule> Achievements, List<GoalUpdate> Goals, string Explanation);
