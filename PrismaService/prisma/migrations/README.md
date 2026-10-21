# Database ownership

The SQL Server schema is provisioned through SSMS with
[01_CreateGamifiedLearningSystem.sql](../../../database/sqlserver/01_CreateGamifiedLearningSystem.sql).

For both existing and newly created databases, run the additive, repeatable
[03_ShowSessions.sql](../../../database/sqlserver/03_ShowSessions.sql) in the intended database.
It adds `Tasks.content` and persisted `ShowSessions` without removing existing
courses, attempts or student progress. Then run `npm run generate`, `npm run build`
and `npm run seed` from `PrismaService` to refresh the client and add the reviewed
36-task show course. Existing courses and their progress are preserved by the seed.

See [the show setup and verification guide](../../../docs/show.md) for the complete
SQL Server and application startup workflow.

Prisma is used only as the application client. Do not run `prisma migrate` against
this database unless you also replace the SSMS provisioning workflow.
