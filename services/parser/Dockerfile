FROM python:3.12-slim

WORKDIR /app

COPY services/parser/requirements.txt ./
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY services/parser/app.py ./

EXPOSE 8000
CMD ["python", "app.py"]
