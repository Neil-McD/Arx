FROM unclecode/crawl4ai:0.8.0

WORKDIR /app/polynet-community-source-crawler

COPY app.py ./app.py

ENV PORT=11235

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "11235"]
