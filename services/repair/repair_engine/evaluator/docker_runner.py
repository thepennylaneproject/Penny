from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
import time

from ..apply import apply_candidate_to_root
from ..config import ApplyConfig, EvaluationConfig
from ..models import EvalResult, PatchCandidate


class DockerEvaluator:
    def __init__(self, eval_config: EvaluationConfig, apply_config: ApplyConfig) -> None:
        self.eval_config = eval_config
        # In evaluator sandbox we must always write candidate patch.
        self.apply_config = replace(apply_config, dry_run=False)

    def _compose_command(self) -> str:
        commands: list[str] = []
        if self.eval_config.lint_command.strip():
            commands.append(self.eval_config.lint_command.strip())
        if self.eval_config.typecheck_command.strip():
            commands.append(self.eval_config.typecheck_command.strip())
        if self.eval_config.test_command.strip():
            commands.append(self.eval_config.test_command.strip())
        return " && ".join(commands) if commands else "true"

    def _run_commands(self, cwd: str) -> tuple[int, str, str]:
        command = self._compose_command()
        if self.eval_config.use_docker:
            args = [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{cwd}:/work",
                "-w",
                "/work",
                self.eval_config.docker_image,
                "sh",
                "-lc",
                command,
            ]
            proc = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=self.eval_config.timeout_seconds,
            )
            return proc.returncode, proc.stdout, proc.stderr

        proc = subprocess.run(
            ["sh", "-lc", command],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=self.eval_config.timeout_seconds,
        )
        return proc.returncode, proc.stdout, proc.stderr

    def evaluate(self, candidate: PatchCandidate, repo_root: str, run_dir: str) -> EvalResult:
        start = time.time()
        artifacts: list[str] = []
        node_dir = Path(run_dir) / "candidates" / candidate.candidate_id
        node_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="penny-repair-") as temp_dir:
            sandbox = os.path.join(temp_dir, "repo")
            shutil.copytree(
                repo_root,
                sandbox,
                ignore=shutil.ignore_patterns(".git", ".venv", "node_modules", "__pycache__", "audits/repair_runs"),
            )

            ok, _touched, reason = apply_candidate_to_root(candidate, sandbox, self.apply_config)
            if not ok:
                duration = time.time() - start
                return EvalResult(
                    candidate_id=candidate.candidate_id,
                    apply_ok=False,
                    compile_ok=False,
                    lint_ok=False,
                    tests_ok=False,
                    warnings=0,
                    failed_step="apply",
                    exit_code=1,
                    stderr=reason,
                    duration_seconds=duration,
                )

            try:
                code, stdout, stderr = self._run_commands(sandbox)
            except subprocess.TimeoutExpired:
                duration = time.time() - start
                return EvalResult(
                    candidate_id=candidate.candidate_id,
                    apply_ok=True,
                    compile_ok=False,
                    lint_ok=False,
                    tests_ok=False,
                    warnings=0,
                    failed_step="timeout",
                    exit_code=124,
                    stderr=f"evaluation timed out after {self.eval_config.timeout_seconds}s",
                    duration_seconds=duration,
                )

            warnings = len(re.findall(r"\bwarning\b", f"{stdout}\n{stderr}", flags=re.IGNORECASE))
            compile_ok = code == 0
            lint_ok = code == 0 if self.eval_config.lint_command.strip() else True
            tests_ok = code == 0 if self.eval_config.test_command.strip() else True
            duration = time.time() - start

            stdout_file = node_dir / "stdout.log"
            stderr_file = node_dir / "stderr.log"
            stdout_file.write_text(stdout)
            stderr_file.write_text(stderr)
            artifacts.extend([str(stdout_file), str(stderr_file)])

            return EvalResult(
                candidate_id=candidate.candidate_id,
                apply_ok=True,
                compile_ok=compile_ok,
                lint_ok=lint_ok,
                tests_ok=tests_ok,
                warnings=warnings,
                failed_step=None if code == 0 else "checks",
                exit_code=code,
                stdout=stdout,
                stderr=stderr,
                duration_seconds=duration,
                artifacts=artifacts,
            )

