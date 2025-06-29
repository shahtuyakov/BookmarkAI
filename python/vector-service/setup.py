from setuptools import setup, find_packages

setup(
    name="bookmarkai-vector-service",
    version="0.1.0",
    description="Vector embedding service for BookmarkAI",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "bookmarkai-shared",
        "celery[redis]>=5.5.0",
        "celery-singleton>=0.3.1",
        "openai>=1.0.0",
        "tiktoken>=0.5.0",
        "numpy>=1.24.0",
        "pydantic>=2.0.0",
        "psycopg2-binary>=2.9.0",
        "python-dotenv>=1.0.0",
        "tenacity>=8.0.0",
        "langchain>=0.2.0",
        "langchain-text-splitters>=0.2.0",
    ],
    python_requires=">=3.9",
)