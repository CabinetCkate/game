type AttemptTime = { timeSpent: number };
type TopicObservation = { topicId: string; correct: number; wrong: number; topic: { name: string; courseId: string } };

export function learningInsights(attempts: AttemptTime[], progress: TopicObservation[]) {
  const measured = attempts.filter(a => Number.isFinite(a.timeSpent) && a.timeSpent >= 0);
  const averageTimeSeconds = measured.length ? Math.round(measured.reduce((sum, a) => sum + a.timeSpent, 0) / measured.length * 10) / 10 : 0;
  const topics = progress.map(p => ({ topicId: p.topicId, courseId: p.topic.courseId, name: p.topic.name, correct: p.correct, wrong: p.wrong, attempts: p.correct + p.wrong, accuracy: p.correct + p.wrong ? Math.round(p.correct / (p.correct + p.wrong) * 100) : 0 }));
  const sampled = topics.filter(t => t.attempts >= 3);
  const tie = (a: typeof topics[number], b: typeof topics[number]) => b.attempts - a.attempts || a.topicId.localeCompare(b.topicId);
  const strongTopics = sampled.filter(t => t.accuracy >= 80).sort((a, b) => b.accuracy - a.accuracy || tie(a, b)).slice(0, 3);
  const weakTopics = sampled.filter(t => t.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy || tie(a, b)).slice(0, 3);
  return {
    averageTimeSeconds,
    topics,
    strongTopics,
    weakTopics,
    strongTopic: strongTopics[0] ?? null,
    weakTopic: weakTopics[0] ?? null
  };
}
