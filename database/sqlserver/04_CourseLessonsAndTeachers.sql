/* Run after 01_CreateGamifiedLearningSystem.sql to enable teacher courses and lesson gating. */
USE [GamifiedLearningSystem];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Users_role' AND parent_object_id=OBJECT_ID(N'dbo.Users'))
  ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_role;
ALTER TABLE dbo.Users ADD CONSTRAINT CK_Users_role CHECK (role IN ('STUDENT','TEACHER','ADMIN'));
GO

IF COL_LENGTH(N'dbo.Courses',N'createdByUserId') IS NULL
  ALTER TABLE dbo.Courses ADD createdByUserId varchar(36) NULL;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_Courses_Users')
  ALTER TABLE dbo.Courses DROP CONSTRAINT FK_Courses_Users;
-- Older database setup scripts create this default constraint with a
-- generated name. Drop it before altering imageUrl, then restore the default.
DECLARE @imageUrlDefault sysname;
DECLARE @dropImageUrlDefaultSql nvarchar(500);
SELECT @imageUrlDefault = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Courses') AND c.name = N'imageUrl';
IF @imageUrlDefault IS NOT NULL
BEGIN
  SET @dropImageUrlDefaultSql = N'ALTER TABLE dbo.Courses DROP CONSTRAINT ' + QUOTENAME(@imageUrlDefault) + N';';
  EXEC sys.sp_executesql @dropImageUrlDefaultSql;
END;
ALTER TABLE dbo.Courses ALTER COLUMN imageUrl nvarchar(max) NOT NULL;
ALTER TABLE dbo.Courses ADD CONSTRAINT DF_Courses_imageUrl DEFAULT N'' FOR imageUrl;
GO

IF OBJECT_ID(N'dbo.Teachers',N'U') IS NULL CREATE TABLE dbo.Teachers (
 id varchar(36) NOT NULL PRIMARY KEY,userId varchar(36) NOT NULL UNIQUE,firstName varchar(80) NOT NULL,lastName varchar(80) NOT NULL,createdAt datetime2(3) NOT NULL DEFAULT sysutcdatetime(),CONSTRAINT FK_Teachers_Users FOREIGN KEY(userId) REFERENCES dbo.Users(id) ON DELETE CASCADE);
IF OBJECT_ID(N'dbo.CourseMaterials',N'U') IS NULL CREATE TABLE dbo.CourseMaterials (
 id varchar(36) NOT NULL PRIMARY KEY,courseId varchar(36) NOT NULL,title nvarchar(255) NOT NULL,content nvarchar(max) NOT NULL DEFAULT '',videoUrl nvarchar(1000) NOT NULL DEFAULT '',[order] int NOT NULL,createdAt datetime2(3) NOT NULL DEFAULT sysutcdatetime(),CONSTRAINT UQ_CourseMaterials_course_order UNIQUE(courseId,[order]),CONSTRAINT FK_CourseMaterials_Courses FOREIGN KEY(courseId) REFERENCES dbo.Courses(id) ON DELETE CASCADE);
IF OBJECT_ID(N'dbo.StudentMaterialProgress',N'U') IS NULL CREATE TABLE dbo.StudentMaterialProgress (
 studentId varchar(36) NOT NULL,materialId varchar(36) NOT NULL,completedAt datetime2(3) NOT NULL DEFAULT sysutcdatetime(),PRIMARY KEY(studentId,materialId),CONSTRAINT FK_StudentMaterialProgress_Students FOREIGN KEY(studentId) REFERENCES dbo.Students(id) ON DELETE CASCADE,CONSTRAINT FK_StudentMaterialProgress_Materials FOREIGN KEY(materialId) REFERENCES dbo.CourseMaterials(id) ON DELETE CASCADE);
GO
