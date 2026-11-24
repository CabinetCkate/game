IF COL_LENGTH(N'dbo.Students',N'coins') IS NULL
BEGIN
 ALTER TABLE dbo.Students ADD coins int NOT NULL CONSTRAINT DF_Students_coins DEFAULT(300) WITH VALUES;
END;
IF COL_LENGTH(N'dbo.Courses',N'price') IS NULL
BEGIN
 ALTER TABLE dbo.Courses ADD price int NOT NULL CONSTRAINT DF_Courses_price DEFAULT(100) WITH VALUES;
END;
IF OBJECT_ID(N'dbo.CourseEnrollments',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.CourseEnrollments(
  studentId varchar(36) NOT NULL,
  courseId varchar(36) NOT NULL,
  purchasedAt datetime2(3) NOT NULL CONSTRAINT DF_CourseEnrollments_purchasedAt DEFAULT sysutcdatetime(),
  CONSTRAINT PK_CourseEnrollments PRIMARY KEY(studentId,courseId),
  CONSTRAINT FK_CourseEnrollments_Students FOREIGN KEY(studentId) REFERENCES dbo.Students(id) ON DELETE CASCADE,
  CONSTRAINT FK_CourseEnrollments_Courses FOREIGN KEY(courseId) REFERENCES dbo.Courses(id) ON DELETE CASCADE
 );
END;
-- Keep learners who already made progress in a course from being locked out by this update.
INSERT INTO dbo.CourseEnrollments(studentId,courseId)
SELECT DISTINCT a.studentId,l.courseId
FROM dbo.Attempts a
JOIN dbo.Tasks t ON t.id=a.taskId
JOIN dbo.Levels l ON l.id=t.levelId
WHERE NOT EXISTS(SELECT 1 FROM dbo.CourseEnrollments e WHERE e.studentId=a.studentId AND e.courseId=l.courseId);
INSERT INTO dbo.CourseEnrollments(studentId,courseId)
SELECT DISTINCT p.studentId,m.courseId
FROM dbo.StudentMaterialProgress p
JOIN dbo.CourseMaterials m ON m.id=p.materialId
WHERE NOT EXISTS(SELECT 1 FROM dbo.CourseEnrollments e WHERE e.studentId=p.studentId AND e.courseId=m.courseId);
IF OBJECT_ID(N'dbo.CourseReviews',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.CourseReviews(
  id varchar(36) NOT NULL CONSTRAINT PK_CourseReviews PRIMARY KEY,
  studentId varchar(36) NOT NULL,
  courseId varchar(36) NOT NULL,
  rating int NOT NULL,
  comment nvarchar(2000) NOT NULL,
  createdAt datetime2(3) NOT NULL CONSTRAINT DF_CourseReviews_createdAt DEFAULT sysutcdatetime(),
  updatedAt datetime2(3) NOT NULL CONSTRAINT DF_CourseReviews_updatedAt DEFAULT sysutcdatetime(),
  CONSTRAINT CK_CourseReviews_rating CHECK(rating BETWEEN 1 AND 5),
  CONSTRAINT UQ_CourseReviews_student_course UNIQUE(studentId,courseId),
  CONSTRAINT FK_CourseReviews_Students FOREIGN KEY(studentId) REFERENCES dbo.Students(id) ON DELETE CASCADE,
  CONSTRAINT FK_CourseReviews_Courses FOREIGN KEY(courseId) REFERENCES dbo.Courses(id) ON DELETE CASCADE
 );
 CREATE INDEX IX_CourseReviews_course_createdAt ON dbo.CourseReviews(courseId,createdAt DESC);
END;
