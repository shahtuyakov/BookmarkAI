from setuptools import setup, find_packages

setup(
    name="bookmarkai-whisper-service",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "bookmarkai-shared",
        "celery[redis]==5.5.*",
        "celery-singleton==0.3.1",
        "openai>=1.0.0",
        "ffmpeg-python==0.2.0",
        "psycopg2-binary>=2.9.0",
        "pydantic>=2.0.0",
        "requests>=2.31.0",
        "prometheus-client>=0.19.0",
    ],
    python_requires=">=3.11",
)
