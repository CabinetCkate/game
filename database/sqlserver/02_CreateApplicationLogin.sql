/* Optional: run once in SSMS after enabling SQL Server authentication.
   Replace __STRONG_PASSWORD__ before execution. This script does not grant DDL rights. */
USE [master];
GO
CREATE LOGIN [gls_app] WITH PASSWORD=N'__STRONG_PASSWORD__', CHECK_POLICY=ON;
GO
USE [GamifiedLearningSystem];
GO
CREATE USER [gls_app] FOR LOGIN [gls_app];
ALTER ROLE db_datareader ADD MEMBER [gls_app];
ALTER ROLE db_datawriter ADD MEMBER [gls_app];
GO
