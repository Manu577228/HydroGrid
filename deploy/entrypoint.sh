#!/bin/sh
set -eu

if [ -n "${HYDROGRID_DATABASE_URL:-}" ]; then
  # Render provides credentials in this URI. Hikari receives them through separate variables.
  export SPRING_DATASOURCE_URL="jdbc:postgresql://${HYDROGRID_DATABASE_URL##*@}"
  unset HYDROGRID_DATABASE_URL
fi

exec java -jar /app/hydrogrid.jar

