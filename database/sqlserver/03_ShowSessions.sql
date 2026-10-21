-- Additive migration: safe to rerun, preserves all existing learning progress.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.Tasks', N'content') IS NULL
  ALTER TABLE dbo.Tasks ADD content NVARCHAR(MAX) NOT NULL
    CONSTRAINT DF_Tasks_content DEFAULT N'{}';
IF OBJECT_ID(N'dbo.ShowSessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ShowSessions (
    id VARCHAR(36) NOT NULL CONSTRAINT PK_ShowSessions PRIMARY KEY,
    studentId VARCHAR(36) NOT NULL,
    courseId VARCHAR(36) NOT NULL,
    characterId VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_ShowSessions_status DEFAULT 'ACTIVE',
    state NVARCHAR(MAX) NOT NULL,
    version INT NOT NULL CONSTRAINT DF_ShowSessions_version DEFAULT 0,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_ShowSessions_createdAt DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL,
    completedAt DATETIME2 NULL,
    CONSTRAINT FK_ShowSessions_Students FOREIGN KEY (studentId)
      REFERENCES dbo.Students(id) ON DELETE CASCADE,
    CONSTRAINT CK_ShowSessions_status CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
    CONSTRAINT CK_ShowSessions_state CHECK (ISJSON(state) = 1)
  );
  CREATE INDEX IX_ShowSessions_student_status_updated
    ON dbo.ShowSessions(studentId, status, updatedAt);
END;
COMMIT TRANSACTION;
