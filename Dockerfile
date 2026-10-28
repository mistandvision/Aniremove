FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=user app.py .
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
