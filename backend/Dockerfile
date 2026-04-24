FROM python:3.13-slim

ARG APP_VERSION=dev
ARG APP_BUILD_NUMBER=""
ARG APP_GIT_SHA=""
ARG APP_BUILD_DATE=""
ENV APP_VERSION=${APP_VERSION}
ENV APP_BUILD_NUMBER=${APP_BUILD_NUMBER}
ENV APP_GIT_SHA=${APP_GIT_SHA}
ENV APP_BUILD_DATE=${APP_BUILD_DATE}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client gosu && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

RUN mkdir -p /backups \
    && groupadd -r tribu && useradd -r -g tribu tribu \
    && chown -R tribu:tribu /app /backups

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
