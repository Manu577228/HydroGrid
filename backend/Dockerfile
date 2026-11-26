FROM maven:3.9.12-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system hydrogrid && useradd --system --gid hydrogrid hydrogrid
COPY --from=build /app/target/hydrogrid-api-0.1.0.jar app.jar
USER hydrogrid
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-XX:+ExitOnOutOfMemoryError", "-jar", "app.jar"]
