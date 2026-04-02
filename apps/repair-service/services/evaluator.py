"""Patch evaluation in isolated Docker environments."""

import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import docker


@dataclass
class EvaluationResult:
    """Result of patch evaluation."""

    patch_id: str
    apply_ok: bool
    lint_ok: bool = False
    typecheck_ok: bool = False
    tests_ok: bool = False
    execution_time_ms: int = 0
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    error_message: Optional[str] = None

    def overall_success(self) -> bool:
        """Check if all checks passed."""
        return self.apply_ok and self.lint_ok and self.typecheck_ok and self.tests_ok

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "apply_ok": self.apply_ok,
            "lint_ok": self.lint_ok,
            "typecheck_ok": self.typecheck_ok,
            "tests_ok": self.tests_ok,
            "execution_time_ms": self.execution_time_ms,
            "exit_code": self.exit_code,
        }


class PatchEvaluator:
    """Evaluates patches in isolated Docker environments."""

    def __init__(
        self,
        docker_image: str = "node:18-alpine",
        timeout_seconds: int = 60,
    ):
        """Initialize evaluator.

        Args:
            docker_image: Docker image to use for evaluation
            timeout_seconds: Timeout for evaluation
        """
        self.docker_image = docker_image
        self.timeout_seconds = timeout_seconds

        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            print(f"[evaluator] Failed to initialize Docker client: {e}")
            self.docker_client = None

    async def evaluate(
        self,
        patch_id: str,
        patch_diff: str,
        repo_path: str,
        file_path: str,
        lint_command: Optional[str] = None,
        typecheck_command: Optional[str] = None,
        test_command: Optional[str] = None,
    ) -> EvaluationResult:
        """Evaluate a patch in isolated Docker environment.

        Args:
            patch_id: Identifier for this patch
            patch_diff: The patch to apply
            repo_path: Path to repository
            file_path: Path to file being patched (relative to repo)
            lint_command: Lint command to run
            typecheck_command: Type check command to run
            test_command: Test command to run

        Returns:
            Evaluation result
        """
        start_time = time.time()

        # Create temporary sandbox
        with tempfile.TemporaryDirectory(prefix="penny-eval-") as temp_dir:
            sandbox_path = Path(temp_dir) / "repo"

            try:
                # Copy repo to sandbox
                shutil.copytree(
                    repo_path,
                    str(sandbox_path),
                    ignore=shutil.ignore_patterns(
                        ".git",
                        ".venv",
                        "node_modules",
                        "__pycache__",
                        "venv",
                        ".env",
                    ),
                )
            except Exception as e:
                elapsed_ms = int((time.time() - start_time) * 1000)
                return EvaluationResult(
                    patch_id=patch_id,
                    apply_ok=False,
                    error_message=f"Failed to copy repo: {str(e)}",
                    execution_time_ms=elapsed_ms,
                )

            # Apply patch
            try:
                target_file = sandbox_path / file_path
                if not target_file.exists():
                    elapsed_ms = int((time.time() - start_time) * 1000)
                    return EvaluationResult(
                        patch_id=patch_id,
                        apply_ok=False,
                        error_message=f"File not found: {file_path}",
                        execution_time_ms=elapsed_ms,
                    )

                # For now, assume patch_diff is a unified diff that can be applied with patch command
                # TODO: Implement proper patch application (currently simplified)
                apply_ok = True
            except Exception as e:
                elapsed_ms = int((time.time() - start_time) * 1000)
                return EvaluationResult(
                    patch_id=patch_id,
                    apply_ok=False,
                    error_message=f"Failed to apply patch: {str(e)}",
                    execution_time_ms=elapsed_ms,
                )

            if not apply_ok:
                elapsed_ms = int((time.time() - start_time) * 1000)
                return EvaluationResult(
                    patch_id=patch_id,
                    apply_ok=False,
                    error_message="Patch application failed",
                    execution_time_ms=elapsed_ms,
                )

            # Run validation commands
            commands = []
            if lint_command:
                commands.append(("lint", lint_command))
            if typecheck_command:
                commands.append(("typecheck", typecheck_command))
            if test_command:
                commands.append(("tests", test_command))

            lint_ok = not lint_command  # Default to pass if no command
            typecheck_ok = not typecheck_command
            tests_ok = not test_command
            exit_code = 0
            stdout = ""
            stderr = ""

            if commands:
                try:
                    if self.docker_client:
                        exit_code, stdout, stderr = await self._run_in_docker(
                            commands, str(sandbox_path)
                        )
                    else:
                        exit_code, stdout, stderr = await self._run_locally(
                            commands, str(sandbox_path)
                        )

                    # Determine which checks passed
                    if exit_code == 0:
                        lint_ok = True
                        typecheck_ok = True
                        tests_ok = True
                    else:
                        # Parse stderr to determine which step failed
                        if "lint" in stderr.lower():
                            lint_ok = False
                        if "type" in stderr.lower():
                            typecheck_ok = False
                        if "test" in stderr.lower():
                            tests_ok = False

                except subprocess.TimeoutExpired:
                    elapsed_ms = int((time.time() - start_time) * 1000)
                    return EvaluationResult(
                        patch_id=patch_id,
                        apply_ok=True,
                        error_message=f"Evaluation timeout after {self.timeout_seconds}s",
                        execution_time_ms=elapsed_ms,
                        exit_code=124,
                    )
                except Exception as e:
                    elapsed_ms = int((time.time() - start_time) * 1000)
                    return EvaluationResult(
                        patch_id=patch_id,
                        apply_ok=True,
                        error_message=f"Evaluation error: {str(e)}",
                        execution_time_ms=elapsed_ms,
                        exit_code=1,
                    )

            elapsed_ms = int((time.time() - start_time) * 1000)
            return EvaluationResult(
                patch_id=patch_id,
                apply_ok=True,
                lint_ok=lint_ok,
                typecheck_ok=typecheck_ok,
                tests_ok=tests_ok,
                execution_time_ms=elapsed_ms,
                exit_code=exit_code,
                stdout=stdout,
                stderr=stderr,
            )

    async def _run_in_docker(
        self,
        commands: list[tuple[str, str]],
        cwd: str,
    ) -> tuple[int, str, str]:
        """Run commands in Docker container."""
        # Compose all commands
        full_command = " && ".join(cmd for _, cmd in commands)

        try:
            container = self.docker_client.containers.run(
                self.docker_image,
                ["sh", "-c", full_command],
                volumes={cwd: {"bind": "/work", "mode": "rw"}},
                working_dir="/work",
                remove=True,
                timeout=self.timeout_seconds,
            )

            # Note: docker SDK doesn't directly give us stdout/stderr from run()
            # For now, return success/failure based on container exit code
            return 0, "", ""
        except docker.errors.ContainerError as e:
            return e.exit_status, e.stdout or "", e.stderr or ""
        except Exception as e:
            raise

    async def _run_locally(
        self,
        commands: list[tuple[str, str]],
        cwd: str,
    ) -> tuple[int, str, str]:
        """Run commands locally (fallback, less isolated)."""
        full_command = " && ".join(cmd for _, cmd in commands)

        result = subprocess.run(
            ["sh", "-c", full_command],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
        )

        return result.returncode, result.stdout, result.stderr
