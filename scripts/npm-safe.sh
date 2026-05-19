#!/bin/bash

# npm-safe.sh — Optional maintainer utility for containerized npm operations.
#
# Copyright (c) 2026 Ashley R. Thomas. All rights reserved.
# Licensed under the MIT License. See LICENSE in the project root.
#
# Use of this personal workflow tool is not required to use this package. It is
# used to run npm install/update inside a disposable container to limit execution
# of package-related scripts/executables (i.e., postinstall scripts and transitive
# dependencies) on the host. Contributors using pnpm, yarn, or plain direct
# `npm install` can ignore this script.
#
# ==============================================================================
# npm-safe.sh — Containerized NPM Operations
# ==============================================================================
#
# Runs npm commands inside a disposable Docker container so that no npm install,
# postinstall scripts, or downloaded packages ever execute directly on the host.
#
# Supports three operation strategies:
#
#   PACKAGE-FILE MODES (audit-fix, patch, minor):
#     Bind-mounts the project directory and runs the update inside the container.
#     Updated package.json + package-lock.json are written to host via the mount.
#     node_modules/ is also written (same as install mode). Used for version
#     updates that get committed to source control.
#
#   INSTALL MODE (--install):
#     Bind-mounts the project directory and runs npm ci (or npm install) inside
#     the container. The resulting node_modules/ is written to the host via the
#     mount — but all npm lifecycle scripts (postinstall, etc.) execute inside
#     the container, not on the host. Used to populate node_modules for IDE
#     support (VS Code TypeScript, ESLint, Tailwind IntelliSense).
#
#   RUN MODE (--run "<command>"):
#     Bind-mounts the project directory and executes an arbitrary command inside
#     the container with node_modules already installed. Use this to run dev
#     tools (eslint, prettier, knip, tsc, etc.) without executing them on the
#     host. Closes the gap where containerized install protects against
#     postinstall scripts but dev tools in node_modules could still be
#     compromised — running them in a container keeps the host safe.
#
# All modes use bind mounts so npm sees the real filesystem layout. This is
# critical for projects with file: dependencies (e.g., local-packages/) —
# npm records relative paths in package-lock.json, so the container must see
# the same directory structure as the host.
#
# Works with any project directory containing a package.json.
#
# Usage:
#   ./scripts/npm-safe.sh [--dir <project-dir>] [mode] [options]
#
# Modes:
#   --install          Populate node_modules via containerized npm ci (default)
#   --audit-fix        npm audit fix (security patches only)
#   --audit-fix-force  npm audit fix --force (allows breaking changes)
#   --patch            Bump all packages to latest patch version
#   --minor            Bump all packages to latest minor version
#   --run "<command>"  Run a command inside container with deps installed
#
# Options:
#   --dir <path>       Project directory (default: .)
#   --dry-run          Preview changes without writing files
#   --node-version N   Node.js major version (default: 20)
#   --use-npm-install  With --install: use npm install instead of npm ci
#
# Examples:
#   ./scripts/npm-safe.sh                                    # install deps for default project
#   ./scripts/npm-safe.sh --audit-fix                        # security patches for default project
#   ./scripts/npm-safe.sh --patch --dry-run                  # preview patch bumps
#   ./scripts/npm-safe.sh --install --use-npm-install        # npm install instead of npm ci
#   ./scripts/npm-safe.sh --run "npx eslint src/"            # run eslint in container
#   ./scripts/npm-safe.sh --run "npx knip"                   # run knip in container
#   ./scripts/npm-safe.sh --run "npx tsc --noEmit"           # type-check in container
#
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Resolve repo root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Defaults
MODE="install"
DRY_RUN=false
NODE_VERSION="20"
PROJECT_DIR=""
USE_NPM_INSTALL=false
RUN_CMD=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --install)
            MODE="install"
            shift
            ;;
        --audit-fix)
            MODE="audit-fix"
            shift
            ;;
        --audit-fix-force)
            MODE="audit-fix-force"
            shift
            ;;
        --patch)
            MODE="patch"
            shift
            ;;
        --minor)
            MODE="minor"
            shift
            ;;
        --run)
            MODE="run"
            RUN_CMD="$2"
            shift 2
            ;;
        --dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --use-npm-install)
            USE_NPM_INSTALL=true
            shift
            ;;
        --node-version)
            NODE_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--dir <project-dir>] [mode] [options]"
            echo ""
            echo "Modes:"
            echo "  --install          Populate node_modules via containerized npm ci (default)"
            echo "  --audit-fix        npm audit fix (security patches only)"
            echo "  --audit-fix-force  npm audit fix --force (allows breaking changes)"
            echo "  --patch            Bump all packages to latest patch version"
            echo "  --minor            Bump all packages to latest minor version"
            echo "  --run \"<command>\"  Run a command in container with deps installed"
            echo ""
            echo "Options:"
            echo "  --dir <path>       Project directory relative to repo root (default: .)"
            echo "  --dry-run          Preview changes without writing files"
            echo "  --use-npm-install  With --install: use 'npm install' instead of 'npm ci'"
            echo "  --node-version N   Node.js major version (default: 20)"
            echo ""
            echo "Examples:"
            echo "  $0                                    # install deps for default project"
            echo "  $0 --audit-fix                        # security patches for default project"
            echo "  $0 --patch --dry-run                  # preview patch bumps"
            echo "  $0 --run \"npx eslint src/\"            # run eslint in container"
            echo "  $0 --run \"npx tsc --noEmit\"           # type-check in container"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# Resolve project directory
if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR="${REPO_ROOT}"
elif [[ "$PROJECT_DIR" != /* ]]; then
    # Relative path — resolve from repo root
    PROJECT_DIR="${REPO_ROOT}/${PROJECT_DIR}"
fi

PROJECT_NAME="$(basename "${PROJECT_DIR}")"

if [ ! -f "${PROJECT_DIR}/package.json" ]; then
    echo -e "${RED}ERROR: package.json not found at ${PROJECT_DIR}${NC}"
    exit 1
fi

# Build mode description and commands
case $MODE in
    install)
        if [ "$USE_NPM_INSTALL" = true ]; then
            DESCRIPTION="npm install (populate node_modules)"
            INSTALL_CMD="npm install 2>&1"
        else
            DESCRIPTION="npm ci (populate node_modules from lock file)"
            INSTALL_CMD="npm ci 2>&1"
        fi
        ;;
    run)
        if [ -z "$RUN_CMD" ]; then
            echo -e "${RED}ERROR: --run requires a command argument (e.g., --run \"npx eslint src/\")${NC}"
            exit 1
        fi
        DESCRIPTION="run: ${RUN_CMD}"
        ;;
    audit-fix)
        DESCRIPTION="npm audit fix (security patches)"
        NPM_CMD="echo '=== Pre-fix audit (vulnerability detail) ==='; npm audit 2>&1 || true; echo ''; echo '=== Applying npm audit fix ==='; npm audit fix 2>&1 || true; echo ''; echo '=== Post-fix audit ==='; npm audit 2>&1 || true"
        ;;
    audit-fix-force)
        DESCRIPTION="npm audit fix --force (may include breaking changes)"
        NPM_CMD="echo '=== Pre-fix audit (vulnerability detail) ==='; npm audit 2>&1 || true; echo ''; echo '=== Applying npm audit fix --force ==='; npm audit fix --force 2>&1 || true; echo ''; echo '=== Post-fix audit ==='; npm audit 2>&1 || true"
        ;;
    patch)
        DESCRIPTION="patch version bumps (all packages)"
        NPM_CMD="npx npm-check-updates -u --target patch 2>&1; npm install 2>&1; echo ''; echo '=== Post-update audit ==='; npm audit 2>&1 || true"
        ;;
    minor)
        DESCRIPTION="minor version bumps (all packages)"
        NPM_CMD="npx npm-check-updates -u --target minor 2>&1; npm install 2>&1; echo ''; echo '=== Post-update audit ==='; npm audit 2>&1 || true"
        ;;
esac

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}npm-safe: Containerized NPM Operations${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Project:     ${PROJECT_NAME} (${PROJECT_DIR})"
echo "Mode:        ${DESCRIPTION}"
echo "Dry run:     ${DRY_RUN}"
echo "Node:        ${NODE_VERSION}-alpine"
echo ""

# =============================================================================
# INSTALL MODE — bind-mount approach
# =============================================================================
if [ "$MODE" = "install" ]; then

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN — would run '${DESCRIPTION}' in container with bind mount to:${NC}"
        echo "  ${PROJECT_DIR}"
        echo ""
        echo "This would populate ${PROJECT_DIR}/node_modules/ via the bind mount."
        echo "All npm lifecycle scripts would execute inside the container."
        exit 0
    fi

    echo -e "${YELLOW}Running containerized install with bind mount...${NC}"
    echo -e "${CYAN}node_modules/ will be written to host via mount (scripts run in container)${NC}"
    echo ""

    docker run --rm \
        -v "${PROJECT_DIR}:/app" \
        -w /app \
        "node:${NODE_VERSION}-alpine" \
        sh -c "${INSTALL_CMD}"

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}node_modules populated (${PROJECT_NAME})${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "All npm scripts ran inside the container."
    echo "node_modules/ is now available at: ${PROJECT_DIR}/node_modules/"
    exit 0
fi

# =============================================================================
# RUN MODE — bind-mount approach, install deps then run command
# =============================================================================
if [ "$MODE" = "run" ]; then

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN — would run in container with bind mount to:${NC}"
        echo "  ${PROJECT_DIR}"
        echo ""
        echo "Command: ${RUN_CMD}"
        echo ""
        echo "Steps: npm ci → run command (all inside container)"
        exit 0
    fi

    echo -e "${YELLOW}Running containerized command with bind mount...${NC}"
    echo -e "${CYAN}Command: ${RUN_CMD}${NC}"
    echo ""

    # Install deps then run the command. Both execute inside the container.
    # node_modules/ is written to host via mount (same as --install) so that
    # subsequent --run invocations can skip npm ci if node_modules/ is fresh.
    docker run --rm \
        -v "${PROJECT_DIR}:/app" \
        -w /app \
        "node:${NODE_VERSION}-alpine" \
        sh -c "
            # Install deps if node_modules is missing or stale
            if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
                echo '=== Installing dependencies ===' && \
                npm ci 2>&1 && \
                echo ''
            else
                echo '=== node_modules up to date (skipping npm ci) ==='
                echo ''
            fi && \
            echo '=== Running: ${RUN_CMD} ===' && \
            echo '' && \
            ${RUN_CMD}
        "

    exit $?
fi

# =============================================================================
# UPDATE MODES — bind-mount approach (preserves correct relative paths)
# =============================================================================
#
# Uses bind mount so npm sees the real filesystem layout. This is critical for
# projects with file: dependencies (e.g., @proofset/core) — npm records paths
# in package-lock.json relative to where it runs, so the container must see
# the same directory structure as the host.
#
# Security: npm lifecycle scripts run inside the container (sandboxed).
# node_modules/ is written to host via the mount, same as --install mode.
# Only package.json and package-lock.json changes matter for source control.
# =============================================================================

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN — showing what would change:${NC}"
    echo ""

    # Save copies of current files for comparison
    TMPDIR=$(mktemp -d)
    cp "${PROJECT_DIR}/package.json" "${TMPDIR}/package.json.before"
    cp "${PROJECT_DIR}/package-lock.json" "${TMPDIR}/package-lock.json.before"

    # Run update in container (writes to host via mount)
    docker run --rm \
        -v "${PROJECT_DIR}:/app" \
        -w /app \
        "node:${NODE_VERSION}-alpine" \
        sh -c "
            npm ci 2>&1 && \
            echo '' && \
            echo '============================================' && \
            echo 'Running: ${DESCRIPTION}' && \
            echo '============================================' && \
            echo '' && \
            ${NPM_CMD}
        "

    echo ""
    echo "=== package.json changes ==="
    diff "${TMPDIR}/package.json.before" "${PROJECT_DIR}/package.json" || true
    echo ""

    if ! diff -q "${TMPDIR}/package-lock.json.before" "${PROJECT_DIR}/package-lock.json" >/dev/null 2>&1; then
        echo "=== package-lock.json: CHANGED ==="
    else
        echo "=== package-lock.json: unchanged ==="
    fi

    # Restore original files (dry run = no changes)
    cp "${TMPDIR}/package.json.before" "${PROJECT_DIR}/package.json"
    cp "${TMPDIR}/package-lock.json.before" "${PROJECT_DIR}/package-lock.json"

    rm -rf "${TMPDIR}"
    echo ""
    echo -e "${YELLOW}No files written. Run without --dry-run to apply.${NC}"
else
    echo -e "${YELLOW}Running updates inside container...${NC}"
    echo ""

    docker run --rm \
        -v "${PROJECT_DIR}:/app" \
        -w /app \
        "node:${NODE_VERSION}-alpine" \
        sh -c "
            npm ci 2>&1 && \
            echo '' && \
            echo '============================================' && \
            echo 'Running: ${DESCRIPTION}' && \
            echo '============================================' && \
            echo '' && \
            ${NPM_CMD}
        "

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}Package files updated (${PROJECT_NAME})${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review:  git diff ${PROJECT_NAME}/package.json ${PROJECT_NAME}/package-lock.json"
    echo "  2. Test:    docker compose --profile frontend-dev up --build"
    echo "  3. Commit:  git add ${PROJECT_NAME}/package.json ${PROJECT_NAME}/package-lock.json"
fi
