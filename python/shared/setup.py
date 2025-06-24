from setuptools import setup, find_packages

setup(
    name="bookmarkai-shared",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "celery[redis]==5.5.0",
        "kombu>=5.3.5",
        "redis>=4.5.0",
        "psycopg2-binary>=2.9.0",
        "sqlalchemy>=2.0.0",
        "pydantic>=2.0.0",
        "python-json-logger>=2.0.0",
        "celery-singleton>=0.3.1",
        "opentelemetry-api>=1.20.0",
        "opentelemetry-sdk>=1.20.0",
        "opentelemetry-instrumentation-celery>=0.41b0",
    ],
    python_requires=">=3.9",
)