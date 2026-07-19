"""Demo agent: summarizes a dependency report using Strands Agents + OpenAI.

This app exists as an analysis subject for the repository's supply chain
workflows: its dependencies appear in the dependency graph (SBOM, OSV,
license checks) and its AI SDK usage is detected by ai-finder for the AIBOM.
"""

import os
import sys

from strands import Agent
from strands.models.openai import OpenAIModel
from strands_tools import file_read


SYSTEM_PROMPT = (
    "You are a release engineer. Given a dependency analysis report, "
    "produce a three-bullet summary: biggest risk, quickest win, and "
    "one dependency to watch."
)


def build_agent() -> Agent:
    model = OpenAIModel(
        client_args={"api_key": os.environ["OPENAI_API_KEY"]},
        model_id="gpt-4o-mini",
        params={"temperature": 0.2, "max_tokens": 500},
    )
    return Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=[file_read])


def main() -> None:
    report_path = sys.argv[1] if len(sys.argv) > 1 else "analysis-report.md"
    agent = build_agent()
    result = agent(f"Read {report_path} and summarize it.")
    print(result)


if __name__ == "__main__":
    main()
