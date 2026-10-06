#!/usr/bin/env bash
set -euo pipefail
task_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
task_source_dir="${1:-${HOME}/.cache/ghostdrop/ootle-392d805}"
task_commit=392d805579db35fcc8e8bc1aba84adc1fffe0c22
task_mode="${2:-test}"
task_source_dir="$(realpath -m -- "$task_source_dir")"
task_repo_dir="$(cd -- "$task_script_dir/.." && pwd)"
if [[ "$task_source_dir" == "$task_repo_dir" || "$task_source_dir" == "$task_repo_dir/"* ]]; then
  echo 'The upstream checkout must stay outside the GhostDrop repository.' >&2
  exit 2
fi
if [[ -e "$task_source_dir" ]]; then
  echo 'Choose a fresh external source directory; existing work is preserved.' >&2
  exit 2
fi
case "$task_mode" in source|test|headless|wallet-ui) ;; *) echo 'Mode: source, test, headless, wallet-ui' >&2; exit 2 ;; esac
git clone --filter=blob:none --no-checkout https://github.com/tari-project/tari-ootle.git "$task_source_dir"
git -C "$task_source_dir" checkout --detach "$task_commit"
test "$(git -C "$task_source_dir" rev-parse HEAD)" = "$task_commit"
git -C "$task_source_dir" apply --check "$task_script_dir/ootle-0.43.0.patch"
git -C "$task_source_dir" apply "$task_script_dir/ootle-0.43.0.patch"
cd "$task_source_dir"
case "$task_mode" in
  source) printf 'Prepared pinned source in %s\n' "$task_source_dir" ;;
  test) cargo test -p tari_ootle_walletd -p tari_ootle_walletd_client --no-default-features --locked --lib ghostdrop ;;
  headless) cargo build -p tari_ootle_walletd --no-default-features --locked ;;
  wallet-ui) cargo build -p tari_ootle_walletd --release --locked ;;
esac
