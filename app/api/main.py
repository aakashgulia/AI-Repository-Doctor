from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile
import re
import subprocess
import sys

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.agents.chat_engine import ChatEngine
from app.agents.diagnosis_engine import DiagnosisEngine
from app.analysis.change_service import ChangeAnalysisService
from app.core.repository_manager import RepositoryManager
from app.rag.repository_indexer import index_repository
from app.testing.test_runner import TestRunner


app = FastAPI(
    title="AI-Powered Repository Doctor",
    description=(
        "AI-powered developer assistant for code diagnosis, "
        "testing, and DevOps."
    ),
    version="1.0.0",
)


# ================================================================
# CORS
# ================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


repository_manager = RepositoryManager()


# ================================================================
# Request models
# ================================================================


class DiagnoseRequest(BaseModel):
    problem: str = Field(
        ...,
        min_length=1,
        description="Developer problem to diagnose.",
    )
    repository_id: str | None = Field(
        default=None,
        description="Optional repository ID.",
    )


class ChatRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        description="Question about the repository.",
    )
    repository_id: str | None = Field(
        default=None,
        description="Optional repository ID.",
    )


class RepositoryCreateRequest(BaseModel):
    name: str
    local_path: str
    source_type: str = "local"


class ActiveRepositoryRequest(BaseModel):
    repository_id: str


class ChangeAnalysisRequest(BaseModel):
    repository_id: str | None = Field(
        default=None,
        description=(
            "Repository to analyze. "
            "Uses active repository when omitted."
        ),
    )
    from_commit: str = Field(
        ...,
        min_length=1,
        description="Older/source commit.",
    )
    to_commit: str = Field(
        ...,
        min_length=1,
        description="Newer/target commit.",
    )


class TestChangeRequest(BaseModel):
    repository_id: str | None = Field(
        default=None,
        description=(
            "Repository to test. "
            "Uses active repository when omitted."
        ),
    )
    from_commit: str = Field(
        ...,
        min_length=1,
        description="Older/source commit.",
    )
    to_commit: str = Field(
        ...,
        min_length=1,
        description="Newer/target commit.",
    )
    class TestChangeRequest(BaseModel):
      repository_id: str | None = Field(
        default=None,
        description=(
            "Repository to test. "
            "Uses active repository when omitted."
        ),
    )
    from_commit: str = Field(
        ...,
        min_length=1,
        description="Older/source commit.",
    )
    to_commit: str = Field(
        ...,
        min_length=1,
        description="Newer/target commit.",
    )


# ================================================================
# Health
# ================================================================


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "repository-doctor",
    }


# ================================================================
# Diagnosis
# ================================================================


@app.post("/api/diagnose")
def diagnose(request: DiagnoseRequest):
    try:
        if request.repository_id:
            repository = repository_manager.get_repository(
                request.repository_id
            )
        else:
            repository = repository_manager.get_active_repository()

        if repository is None:
            raise ValueError(
                "No repository selected."
            )

        engine = DiagnosisEngine(
            repository_path=repository.local_path
        )

        result = engine.diagnose(
            request.problem
        )

        return result

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Diagnosis failed: {error}",
        ) from error


# ================================================================
# Doctor Chat
# ================================================================


@app.post("/api/chat")
def chat(request: ChatRequest):
    try:
        if request.repository_id:
            repository = repository_manager.get_repository(
                request.repository_id
            )
        else:
            repository = repository_manager.get_active_repository()

        if repository is None:
            raise ValueError(
                "No repository selected."
            )

        engine = ChatEngine(
            repository_path=repository.local_path
        )

        result = engine.ask(
            request.question
        )

        return result

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {error}",
        ) from error


# ================================================================
# What Changed?
# ================================================================


@app.post("/api/changes")
def analyze_changes(
    request: ChangeAnalysisRequest,
):
    """
    Analyze changes between two commits.

    Pipeline:

        Commit history
            â†“
        Git diff
            â†“
        Changed files
            â†“
        Changed symbols
            â†“
        Dependency / impact analysis
            â†“
        LLM interpretation
    """

    try:
        # ---------------------------------------------------------
        # Resolve repository
        # ---------------------------------------------------------

        if request.repository_id:
            repository = repository_manager.get_repository(
                request.repository_id
            )
        else:
            repository = repository_manager.get_active_repository()

        if repository is None:
            raise ValueError(
                "No repository selected."
            )

        # ---------------------------------------------------------
        # What Changed? requires Git history.
        # ---------------------------------------------------------

        if not repository.git_available:
            raise HTTPException(
                status_code=400,
                detail=(
                    "What Changed? requires a Git repository. "
                    "The selected repository does not have Git history."
                ),
            )

        # ---------------------------------------------------------
        # Deterministic repository evidence
        # ---------------------------------------------------------

        service = ChangeAnalysisService(
            repository_path=repository.local_path
        )

        evidence = service.analyze(
            from_commit=request.from_commit,
            to_commit=request.to_commit,
        )

        # ---------------------------------------------------------
        # LLM interpretation
        # ---------------------------------------------------------

        from app.agents.change_interpreter import (
            ChangeInterpreter,
        )

        interpreter = ChangeInterpreter()

        interpretation = interpreter.interpret(
            evidence
        )

        # ---------------------------------------------------------
        # Final response
        # ---------------------------------------------------------

        return {
            "status": "success",
            "repository": {
                "id": repository.id,
                "name": repository.name,
                "local_path": repository.local_path,
                "source_type": repository.source_type,
                "git_available": repository.git_available,
            },
            "comparison": evidence,
            "interpretation": interpretation[
                "interpretation"
            ],
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Change analysis failed: {error}",
        ) from error
    # ================================================================
# Test My Change
# ================================================================


@app.post("/api/test-change")
def test_change(
    request: TestChangeRequest,
):
    """
    Run tests directly related to a Git change.

    Pipeline:

        Git diff
            ↓
        Changed symbols
            ↓
        Impact analysis
            ↓
        Related tests
            ↓
        Targeted pytest execution
    """

    try:
        # ---------------------------------------------------------
        # Resolve repository
        # ---------------------------------------------------------

        if request.repository_id:
            repository = repository_manager.get_repository(
                request.repository_id
            )
        else:
            repository = repository_manager.get_active_repository()

        if repository is None:
            raise ValueError(
                "No repository selected."
            )

        # ---------------------------------------------------------
        # Test My Change requires Git history.
        # ---------------------------------------------------------

        if not repository.git_available:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Test My Change requires a Git repository. "
                    "The selected repository does not have Git history."
                ),
            )

        # ---------------------------------------------------------
        # Analyze the change deterministically.
        # ---------------------------------------------------------

        service = ChangeAnalysisService(
            repository_path=repository.local_path
        )

        evidence = service.analyze(
            from_commit=request.from_commit,
            to_commit=request.to_commit,
        )

        # ---------------------------------------------------------
        # Extract related tests from impact analysis.
        # ---------------------------------------------------------

        related_tests: list[dict] = []

        for symbol_impact in evidence.get(
            "impacts",
            [],
        ):
            for test in symbol_impact.get(
                "related_tests",
                [],
            ):
                related_tests.append(test)

        # ---------------------------------------------------------
        # Remove duplicate pytest targets.
        # ---------------------------------------------------------

        test_targets: list[str] = []
        seen_targets: set[str] = set()

        for test in related_tests:
            file_path = test.get("file_path")
            test_name = test.get("test_name")

            if not file_path or not test_name:
                continue

            target = f"{file_path}::{test_name}"

            if target in seen_targets:
                continue

            seen_targets.add(target)
            test_targets.append(target)

        # ---------------------------------------------------------
        # Run selected tests.
        # ---------------------------------------------------------

        if not test_targets:
            return {
                "status": "success",
                "repository": {
                    "id": repository.id,
                    "name": repository.name,
                    "local_path": repository.local_path,
                    "source_type": repository.source_type,
                    "git_available": repository.git_available,
                },
                "comparison": {
                    "from_commit": request.from_commit,
                    "to_commit": request.to_commit,
                    "changed_files": evidence.get(
                        "changed_files",
                        [],
                    ),
                    "changed_symbols": evidence.get(
                        "changed_symbols",
                        [],
                    ),
                },
                "test_selection": {
                    "strategy": "impact_analysis",
                    "related_tests": [],
                    "selected_tests": [],
                    "count": 0,
                },
                "test_results": {
                    "passed": 0,
                    "failed": 0,
                    "skipped": 0,
                    "errors": 0,
                    "total": 0,
                    "pass_rate": 0.0,
                    "exit_code": 0,
                    "output": (
                        "No directly related tests were identified "
                        "for the changed symbols."
                    ),
                    "selected_tests": [],
                },
            }

        runner = TestRunner()

        results = runner.run_selected(
            repository_path=repository.local_path,
            test_targets=test_targets,
        )

        # ---------------------------------------------------------
        # Final response.
        # ---------------------------------------------------------

        return {
            "status": "success",
            "repository": {
                "id": repository.id,
                "name": repository.name,
                "local_path": repository.local_path,
                "source_type": repository.source_type,
                "git_available": repository.git_available,
            },
            "comparison": {
                "from_commit": request.from_commit,
                "to_commit": request.to_commit,
                "changed_files": evidence.get(
                    "changed_files",
                    [],
                ),
                "changed_symbols": evidence.get(
                    "changed_symbols",
                    [],
                ),
            },
            "test_selection": {
                "strategy": "impact_analysis",
                "related_tests": related_tests,
                "selected_tests": test_targets,
                "count": len(test_targets),
            },
            "test_results": results,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail=(
                "Targeted test execution timed out after 120 seconds."
            ),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Test execution failed: {error}",
        ) from error


# ================================================================
# Repository Management
# ================================================================


@app.get("/api/repositories")
def list_repositories():
    try:
        return repository_manager.get_saved_repositories()

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list repositories: {error}",
        ) from error


@app.post("/api/repositories")
def add_repository(
    request: RepositoryCreateRequest,
):
    try:
        repository = repository_manager.add_local_repository(
            local_path=request.local_path,
        )

        return repository

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add repository: {error}",
        ) from error


@app.post("/api/repositories/upload")
async def upload_repository(
    file: UploadFile = File(...),
):
    """
    Upload a ZIP repository.

    The ZIP is temporarily stored on disk and then handed
    to RepositoryManager for safe extraction and registration.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must have a filename.",
        )

    filename = Path(file.filename).name

    if not filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Only .zip repository files are supported.",
        )

    temporary_path: Path | None = None

    try:
        with NamedTemporaryFile(
            suffix=".zip",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(
                temporary_file.name
            )

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                temporary_file.write(chunk)

        repository = repository_manager.extract_zip_repository(
            str(temporary_path)
        )

        return {
            "status": "success",
            "repository": repository,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload repository: {error}",
        ) from error

    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink(
                    missing_ok=True
                )
            except Exception:
                pass

        await file.close()


@app.post("/api/repositories/active")
def set_active_repository(
    request: ActiveRepositoryRequest,
):
    try:
        repository = (
            repository_manager.set_active_repository(
                request.repository_id
            )
        )

        return repository

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to set active repository: {error}"
            ),
        ) from error


@app.get("/api/repositories/active")
def get_active_repository():
    try:
        repository = (
            repository_manager.get_active_repository()
        )

        if repository is None:
            return {
                "active_repository": None
            }

        return {
            "active_repository": repository
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to get active repository: {error}"
            ),
        ) from error


@app.get("/api/repositories/{repository_id}/metrics")
def get_repository_metrics(repository_id: str):
    """
    Return live repository metrics for the dashboard.

    Repository metrics are derived from the actual repository:
    - file count and indexed chunk count come from RepositoryManager
    - test results are obtained by running the repository's pytest suite
    """

    try:
        repository = repository_manager.get_repository(repository_id)

        if repository is None:
            raise HTTPException(
                status_code=404,
                detail="Repository not found.",
            )

        stats = repository_manager.get_repository_stats(repository_id)

        if stats is None:
            raise HTTPException(
                status_code=404,
                detail="Repository statistics not found.",
            )

        tests = {
            "passed": 0,
            "failed": 0,
            "total": 0,
            "pass_rate": 0,
            "exit_code": 0,
        }

        repository_path = Path(repository.local_path)

        if repository_path.exists():
            test_files = list(repository_path.rglob("test_*.py"))
            test_files += [
                path
                for path in repository_path.rglob("*_test.py")
                if path not in test_files
            ]

            tests_directory = repository_path / "tests"

            if test_files or tests_directory.exists():
                try:
                    completed = subprocess.run(
                        [
                            sys.executable,
                            "-m",
                            "pytest",
                            "-q",
                        ],
                        cwd=str(repository_path),
                        capture_output=True,
                        text=True,
                        timeout=60,
                    )

                    output = (
                        completed.stdout
                        + "\n"
                        + completed.stderr
                    )

                    passed_match = re.search(
                        r"(\d+)\s+passed",
                        output,
                        re.IGNORECASE,
                    )
                    failed_match = re.search(
                        r"(\d+)\s+failed",
                        output,
                        re.IGNORECASE,
                    )

                    passed = (
                        int(passed_match.group(1))
                        if passed_match
                        else 0
                    )
                    failed = (
                        int(failed_match.group(1))
                        if failed_match
                        else 0
                    )

                    total = passed + failed

                    tests = {
                        "passed": passed,
                        "failed": failed,
                        "total": total,
                        "pass_rate": (
                            round((passed / total) * 100)
                            if total
                            else 0
                        ),
                        "exit_code": completed.returncode,
                    }

                except subprocess.TimeoutExpired:
                    tests["exit_code"] = -1

                except Exception:
                    tests["exit_code"] = -1

        return {
            "repository_id": repository.id,
            "repository_name": repository.name,
            "tests": tests,
            "repository": {
                "files": stats["file_count"],
                "indexed_chunks": stats["indexed_chunks"],
                "indexing_status": stats["indexing_status"],
                "git_available": stats["git_available"],
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate repository metrics: {error}",
        ) from error


@app.get("/api/repositories/{repository_id}")
def get_repository(
    repository_id: str,
):
    try:
        repository = (
            repository_manager.get_repository(
                repository_id
            )
        )

        if repository is None:
            raise HTTPException(
                status_code=404,
                detail="Repository not found.",
            )

        return repository

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to get repository: {error}"
            ),
        ) from error


@app.post("/api/repositories/{repository_id}/index")
def index_repository_endpoint(
    repository_id: str,
):
    try:
        repository = (
            repository_manager.get_repository(
                repository_id
            )
        )

        if repository is None:
            raise HTTPException(
                status_code=404,
                detail="Repository not found.",
            )

        result = index_repository(
            repository.local_path
        )

        repository_manager.update_indexing_status(
            repository_id=repository_id,
            status="INDEXED",
        )

        return result

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to index repository: {error}"
            ),
        ) from error


@app.delete("/api/repositories/{repository_id}")
def delete_repository(
    repository_id: str,
):
    try:
        result = repository_manager.remove_repository(
            repository_id
        )

        return result

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to remove repository: {error}"
            ),
        ) from error
