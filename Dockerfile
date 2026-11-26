# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS ui
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY backend/pom.xml ./
COPY backend/src ./src
COPY --from=ui /build/dist/ ./src/main/resources/static/
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -Dmaven.test.skip=true package \
    && cp target/hydrogrid-*.jar /tmp/hydrogrid.jar

FROM eclipse-temurin:21-jre-jammy
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=builder --chown=app:app /tmp/hydrogrid.jar /app/hydrogrid.jar
COPY --chmod=755 deploy/entrypoint.sh /app/entrypoint.sh
USER app
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50.0 -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=48m -XX:ActiveProcessorCount=2 -Xss512k"
ENV SERVER_COMPRESSION_ENABLED=true
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]

