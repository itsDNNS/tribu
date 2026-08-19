FROM python:3.14-slim

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_COMPILE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client gosu && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --no-compile -r requirements.txt \
    && find /usr/local/lib/python*/site-packages -type d -name __pycache__ -prune -exec rm -rf {} + \
    && find /usr/local/lib/python*/site-packages -type d \( -name tests -o -name test \) -prune -exec rm -rf {} +

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

RUN mkdir -p /backups \
    && groupadd -r tribu && useradd -r -g tribu tribu \
    && chown -R tribu:tribu /app /backups

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
