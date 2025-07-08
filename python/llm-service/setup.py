from setuptools import setup, find_packages

setup(
    name="bookmarkai-llm-service",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "bookmarkai-shared",  # Our shared package
        "openai>=1.0.0",
        "anthropic>=0.3.0",
        "tiktoken>=0.5.0",  # For accurate token counting
        "python-dotenv>=1.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.0.0",
        ]
    },
    python_requires=">=3.9",
)
