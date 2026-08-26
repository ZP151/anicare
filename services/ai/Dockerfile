FROM public.ecr.aws/lambda/python:3.12

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

CMD ["animalhelper_ai.api.lambda_handler"]

