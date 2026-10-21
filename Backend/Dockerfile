FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY Directory.Build.props GamifiedLearningSystem.sln ./
COPY Backend/ Backend/
RUN dotnet publish Backend/GamifiedLearningSystem.API -c Release -o /app
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 5080
ENTRYPOINT ["dotnet","GamifiedLearningSystem.API.dll"]
